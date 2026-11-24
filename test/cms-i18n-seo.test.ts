// test/cms-i18n-seo.test.ts
// Adversarial unit tests for Domain 03: Headless CMS, 3-Tier i18n Fallback, SEO Canonical & Edge Image Proxy
import test from 'node:test';
import assert from 'node:assert/strict';
import { deepLocalize, normalizeSections, extractHeroPreload } from '../src/data/blocks.js';
import { SanityImageService } from '../src/utils/image.js';
import { hasProductCardFieldsChanged, sanitizeSanityDocument } from '../src/utils/cmsSync.js';
import { getLangFromUrl, getLocalizedPath, normalizeCanonicalUrl } from '../src/i18n/utils.js';

test('normalizeSections enforces 3-tier localization fallback (Explicit CMS locale > Professional Textile Dictionary > English fallback)', () => {
  const sections = [
    {
      _type: 'heroSection',
      // Explicitly localized in German in CMS -> should win over dictionary
      headline: { en: 'English Headline', de: 'CMS Custom Deutsch Headline' },
      // Only English provided in CMS -> should fall back to SECTION_TRANSLATIONS.de.heroSection.superTitle
      superTitle: { en: 'B2B Manufacturing' },
      heroImage: 'https://cdn.sanity.io/images/xvhhd8u0/production/abc12345-1600x900.jpg',
    },
  ];

  const normalizedDe = normalizeSections(sections, 'de');
  assert.equal(normalizedDe[0].headline, 'CMS Custom Deutsch Headline');
  assert.equal(normalizedDe[0].superTitle, 'B2B-Herstellung & Private-Label-Atelier');
  assert.match(normalizedDe[0].heroImage, /^\/cdn-image\/images\/xvhhd8u0\/production\//);

  const normalizedEn = normalizeSections(sections, 'en');
  assert.equal(normalizedEn[0].headline, 'English Headline');
  assert.equal(normalizedEn[0].superTitle, 'B2B Manufacturing');
});

test('deepLocalize recursively resolves nested multilingual leaf objects without mutating non-locale objects', () => {
  const input = {
    _type: 'bentoCardBlock',
    heading: { en: 'Italian Craft', fr: 'Savoir-Faire Italien' },
    cards: [
      { title: { en: 'Seamless Toe', fr: 'Pointe Sans Couture' }, count: 200 },
    ],
  };

  const localizedFr = deepLocalize(input, 'fr') as any;
  assert.equal(localizedFr.heading, 'Savoir-Faire Italien');
  assert.equal(localizedFr.cards[0].title, 'Pointe Sans Couture');
  assert.equal(localizedFr.cards[0].count, 200);
});

test('SanityImageService rewrites cdn.sanity.io to first-party /cdn-image proxy and builds responsive srcSet', () => {
  SanityImageService.setStudioProxyConfig(true);
  const rawUrl = 'https://cdn.sanity.io/images/xvhhd8u0/production/sample-1200x1200.png';

  const thumb = SanityImageService.thumbnail(rawUrl, 480);
  assert.ok(thumb.startsWith('/cdn-image/images/xvhhd8u0/production/sample-1200x1200.png'));
  assert.ok(thumb.includes('w=480'));
  assert.ok(thumb.includes('auto=format'));

  const srcset = SanityImageService.srcSet(rawUrl, [280, 480]);
  assert.ok(srcset.includes('280w'));
  assert.ok(srcset.includes('480w'));

  const preload = extractHeroPreload([{ _type: 'heroSection', heroImage: rawUrl }]);
  assert.ok(preload?.src.startsWith('/cdn-image/'));
  assert.ok(preload?.srcset?.includes('1600w'));
});

test('hasProductCardFieldsChanged detects card-level mutations and ignores detail-only description/gallery edits', () => {
  const baseDoc = {
    _id: 'prod-1',
    slug: { current: 'silk-sock' },
    sku: 'SKU-01',
    title: { en: 'Silk Sock' },
    moq: '200 Pairs',
    mainImage: 'https://cdn.sanity.io/images/xvhhd8u0/production/img1.jpg',
    colors: ['#000000'],
    specifications: [
      { label: { en: 'Composition' }, value: { en: '100% Mulberry Silk' } },
      { label: { en: 'Gauge' }, value: { en: '200 Needle' } },
      { label: { en: 'Care' }, value: { en: 'Hand Wash' } },
    ],
    description: { en: 'Initial long description' },
  };

  // Detail-only change (description + 3rd specification outside [0..1]) -> should return false (no list cache rebuild needed)
  const detailEdited = {
    ...baseDoc,
    description: { en: 'Updated long story description on PDP only' },
    specifications: [
      baseDoc.specifications[0],
      baseDoc.specifications[1],
      { label: { en: 'Care' }, value: { en: 'Dry Clean Only' } },
    ],
  };
  assert.equal(hasProductCardFieldsChanged(baseDoc, detailEdited), false);

  // Card field change (MOQ changed) -> must return true
  const moqEdited = { ...baseDoc, moq: '300 Pairs' };
  assert.equal(hasProductCardFieldsChanged(baseDoc, moqEdited), true);
});

test('sanitizeSanityDocument strips ephemeral preview fields and illegal properties from Sanity references', () => {
  const dirty = {
    _id: 'prod-1',
    _type: 'product',
    title: { en: 'Cashmere Crew' },
    mainImageUrl: 'https://cdn.sanity.io/images/xvhhd8u0/production/preview.jpg',
    galleryUrls: ['https://cdn.sanity.io/images/xvhhd8u0/production/g1.jpg'],
    category: {
      _type: 'reference',
      _ref: 'cat-luxury',
      _key: 'k1',
      url: 'https://illegal-extra-prop.example.com',
      resolvedTitle: 'Luxury Hosiery',
    },
  };
  const cleaned = sanitizeSanityDocument(dirty) as any;
  assert.equal(cleaned._id, 'prod-1');
  assert.ok(!('mainImageUrl' in cleaned));
  assert.ok(!('galleryUrls' in cleaned));
  assert.deepEqual(cleaned.category, {
    _type: 'reference',
    _ref: 'cat-luxury',
    _key: 'k1',
  });
});

test('i18n routing and SEO canonical normalization strip query params and handle locale prefixes cleanly', () => {
  assert.equal(getLangFromUrl(new URL('https://example.com/de/products/silk')), 'de');
  assert.equal(getLangFromUrl(new URL('https://example.com/products/silk')), 'en');

  assert.equal(getLocalizedPath('/products#collections', 'de'), '/de/products#collections');
  assert.equal(getLocalizedPath('/de/products', 'en'), '/products');

  assert.equal(
    normalizeCanonicalUrl('/de/products/?preview=1&utm_source=test', 'https://example.com'),
    'https://example.com/de/products'
  );
  assert.equal(
    normalizeCanonicalUrl('/?purge=1', 'https://example.com'),
    'https://example.com/'
  );
});
