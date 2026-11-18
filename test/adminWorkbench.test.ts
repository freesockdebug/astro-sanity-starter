// test/adminWorkbench.test.ts
// Unit tests for adminWorkbench pure utilities using Node 22 native test runner
import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, exportToCsv, readJsonStore, renderTierBadgeHtml, renderOrderStatusBadge, formatAdminTime, hydrateAdminTimes } from '../src/utils/adminWorkbench.js';
import { getTrackingUrl } from '../src/utils/shipping.js';
import { parsePaginationParams, toIsoUtcString, formatUtcFallback } from '../src/utils/format.js';
import { getTierConfig, DICT_COLOR_TO_TIER_STYLE } from '../src/utils/tier.js';
import { toText } from '../src/i18n/utils.js';
import { toPostgresSql, formatUtcCutoff, sanitizePostgresConnectionString } from '../src/db/client.js';
import { resolveThemeContext, useStorefrontTheme } from '../src/config/storefrontThemes.js';

test('escapeHtml escapes dangerous HTML characters to prevent XSS', () => {
  assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.equal(escapeHtml('Hello & "World" \'123\''), 'Hello &amp; &quot;World&quot; &#39;123&#39;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(12345), '12345');
});

test('exportToCsv properly formats CSV cells and handles comma, quotes and linebreaks', () => {
  let createdBlob: any = null;
  // Mock global Blob and URL for headless node environment
  (globalThis as any).Blob = class MockBlob {
    content: any[];
    options: any;
    constructor(content: any[], options: any) {
      this.content = content;
      this.options = options;
      createdBlob = this;
    }
  };
  const OrigURL = (globalThis as any).URL;
  (globalThis as any).URL = {
    createObjectURL: () => 'blob:mock-url',
    revokeObjectURL: () => {},
  };
  (globalThis as any).document = {
    createElement: () => ({
      setAttribute: () => {},
      style: {},
      click: () => {},
    }),
    body: {
      appendChild: () => {},
      removeChild: () => {},
    },
  };

  try {
    exportToCsv('test.csv', ['Name', 'Details', 'Price'], [
      ['Standard Item', 'Normal description', 100],
      ['Complex, Item', 'Quotes "Included" and\nNewline', 250],
    ]);

    assert.ok(createdBlob, 'Blob should be created');
    const csvContent = createdBlob.content[0];
    assert.match(csvContent, /Name,Details,Price/);
    assert.match(csvContent, /"Complex, Item"/);
    assert.match(csvContent, /"Quotes ""Included"" and\nNewline"/);
  } finally {
    (globalThis as any).URL = OrigURL;
  }
});

test('readJsonStore safely reads JSON from DOM element or returns fallback', () => {
  // Mock document.getElementById
  const store: Record<string, string> = {
    'valid-json': JSON.stringify({ ok: true, count: 42 }),
    'invalid-json': '{ bad json',
  };

  (globalThis as any).document = {
    getElementById: (id: string) => {
      if (id in store) {
        return { textContent: store[id] };
      }
      return null;
    },
  };

  assert.deepEqual(readJsonStore('valid-json', {}), { ok: true, count: 42 });
  assert.deepEqual(readJsonStore('invalid-json', { fallback: true }), { fallback: true });
  assert.deepEqual(readJsonStore('non-existent', ['default']), ['default']);
});

test('renderTierBadgeHtml and renderOrderStatusBadge render consistent SSOT HTML', () => {
  const vipHtml = renderTierBadgeHtml('VIP');
  assert.match(vipHtml, /VIP/);
  assert.match(vipHtml, /bg-purple-50/);

  const pendingFull = renderOrderStatusBadge('PENDING_APPROVAL');
  assert.match(pendingFull, /Pending Approval/);
  assert.match(pendingFull, /bg-amber-500/);

  const pendingCompact = renderOrderStatusBadge('PENDING_APPROVAL', true);
  assert.match(pendingCompact, /Pending/);
  assert.doesNotMatch(pendingCompact, /Pending Approval/);

  const unknownStatus = renderOrderStatusBadge('<xss>');
  assert.match(unknownStatus, /&lt;xss&gt;/);
});

test('getTrackingUrl resolves default, custom template, and dynamic carrier dictionary URLs', () => {
  assert.equal(getTrackingUrl('DHL', ''), null);
  assert.equal(
    getTrackingUrl('DHL', '123456'),
    'https://www.dhl.com/en/express/tracking.html?AWB=123456'
  );
  assert.equal(
    getTrackingUrl('Custom', 'TRK-9', 'https://track.example.com/{tracking_no}'),
    'https://track.example.com/TRK-9'
  );
  assert.equal(
    getTrackingUrl('sf_express', 'SF123', undefined, [
      { key: 'sf_express', name: 'SF Express', url: 'https://sf.example.com?no={tracking}' },
    ]),
    'https://sf.example.com?no=SF123'
  );
  assert.equal(
    getTrackingUrl('DHL', '123456', { dhl: { item_key: 'dhl' } } as any),
    'https://www.dhl.com/en/express/tracking.html?AWB=123456'
  );
});

test('parsePaginationParams bounds page, limit, offset, and trims search', () => {
  assert.deepEqual(
    parsePaginationParams(new URLSearchParams('page=-5&limit=999&search=%20abc%20'), 20, 100),
    { page: 1, limit: 100, offset: 0, search: 'abc' }
  );
  assert.deepEqual(
    parsePaginationParams(new URLSearchParams('page=3&limit=25'), 20, 100),
    { page: 3, limit: 25, offset: 50, search: '' }
  );
  assert.deepEqual(
    parsePaginationParams(new URLSearchParams('page=NaN&limit=0'), 50, 100),
    { page: 1, limit: 50, offset: 0, search: '' }
  );
});

test('getTierConfig resolves built-in configs and D1 tier dictionary overrides', () => {
  assert.equal(getTierConfig(null).shortLabel, 'Standard');
  assert.equal(getTierConfig('vip').label, 'VIP Commercial');

  const dynamicDict = {
    KEY_ACCOUNT: {
      label: 'Key Account',
      badge_color: 'amber',
      meta: { short_label: 'KA' },
    },
    VIP: {
      label: 'Custom VIP',
      badge_color: 'rose',
    },
  };

  const ka = getTierConfig('key_account', dynamicDict);
  assert.equal(ka.label, 'Key Account');
  assert.equal(ka.shortLabel, 'KA');
  assert.equal(ka.bg, DICT_COLOR_TO_TIER_STYLE.amber.bg);
  assert.equal(ka.badgeBg, DICT_COLOR_TO_TIER_STYLE.amber.badgeBg);

  const wholesale = getTierConfig('WHOLESALE', {
    WHOLESALE: { item_label: 'Wholesale Partner', badge_color: 'emerald' },
  });
  assert.equal(wholesale.label, 'Wholesale Partner');
  assert.equal(wholesale.shortLabel, 'Wholesale Partner');

  const customVip = getTierConfig('VIP', dynamicDict);
  assert.equal(customVip.label, 'Custom VIP');
  assert.equal(customVip.shortLabel, 'Custom VIP');
  assert.equal(customVip.bg, DICT_COLOR_TO_TIER_STYLE.rose.bg);
});

test('toText extracts trimmed localized strings, preserves custom strings across locales, and handles primitives', () => {
  assert.equal(toText(null, 'en', 'Default'), 'Default');
  assert.equal(toText('   ', 'fr', 'Default'), 'Default');
  assert.equal(toText('  Custom Atelier  ', 'fr', 'Fallback'), 'Custom Atelier');
  assert.equal(toText({ en: ' Gloves ', fr: ' Gants ' }, 'fr', 'Fallback'), 'Gants');
  assert.equal(toText({ en: 'Fallback EN' }, 'es', 'Default ES'), 'Fallback EN');
  assert.equal(toText({}, 'en', 'Empty Obj'), 'Empty Obj');
  assert.equal(toText(0, 'en', 'Fallback'), '0');
});

test('toPostgresSql converts ? placeholders outside string literals, datetime(now), and AUTOINCREMENT', () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS demo (id INTEGER PRIMARY KEY AUTOINCREMENT, note TEXT DEFAULT (datetime('now')));
    SELECT * FROM orders WHERE buyer_email = ? AND note = 'why?' AND status = ? AND updated_at < datetime('now');
  `;
  const pg = toPostgresSql(sql);
  assert.ok(pg.includes('BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY'));
  assert.ok(!pg.includes('AUTOINCREMENT'));
  assert.ok(pg.includes('buyer_email = $1'));
  assert.ok(pg.includes("note = 'why?'"));
  assert.ok(pg.includes('status = $2'));
  assert.ok(!pg.includes("datetime('now')"));
  assert.ok(pg.includes("to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS')"));
});

test('toIsoUtcString and formatUtcFallback normalize SQLite and Postgres timestamps cleanly', () => {
  const cases: Array<[string, string, string]> = [
    ['2026-11-02 02:18:09', '2026-11-02T02:18:09Z', '2026-11-02 02:18 UTC'],
    ['2026-11-02 02:18', '2026-11-02T02:18:00Z', '2026-11-02 02:18 UTC'],
    ['2026-11-17 15:52:30.123456+00', '2026-11-17T15:52:30.123456+00:00', '2026-11-17 15:52 UTC'],
    ['2026-11-17 15:52:30+00', '2026-11-17T15:52:30+00:00', '2026-11-17 15:52 UTC'],
    ['2026-11-17 15:52:30+00:00', '2026-11-17T15:52:30+00:00', '2026-11-17 15:52 UTC'],
    ['2026-11-17 15:52:30.123456', '2026-11-17T15:52:30.123456Z', '2026-11-17 15:52 UTC'],
    ['2026-11-17T15:52:30Z', '2026-11-17T15:52:30Z', '2026-11-17 15:52 UTC'],
  ];

  for (const [input, expectedIso, expectedFallback] of cases) {
    const iso = toIsoUtcString(input);
    assert.equal(iso, expectedIso);
    assert.ok(!Number.isNaN(new Date(iso).getTime()), `Expected valid Date for ${iso}`);
    assert.equal(formatUtcFallback(input), expectedFallback);
  }
});

test('formatUtcCutoff formats UTC timestamps with space separator for both sqlite and postgres', () => {
  const sqliteCutoff = formatUtcCutoff(3600_000, 'sqlite');
  const pgCutoff = formatUtcCutoff(3600_000, 'postgres');
  assert.match(sqliteCutoff, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.match(pgCutoff, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});

test('sanitizePostgresConnectionString strips pgbouncer/prisma params while preserving sslmode', () => {
  const cleaned = sanitizePostgresConnectionString('postgresql://user:pass@aws-0-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require&connection_limit=5');
  assert.equal(cleaned, 'postgresql://user:pass@aws-0-us-east-2.pooler.supabase.com:6543/postgres?sslmode=require');
});

test('resolveThemeContext and useStorefrontTheme resolve valid themes, fallbacks, and Astro.locals caching', () => {
  const fallback = resolveThemeContext('unknown-theme');
  assert.equal(fallback.id, 'apple-minimal');
  assert.equal(fallback.variant, 'minimal');
  assert.equal(fallback.isLuxury, false);

  const luxury = resolveThemeContext('luxury-atelier');
  assert.equal(luxury.id, 'luxury-atelier');
  assert.equal(luxury.variant, 'luxury');
  assert.equal(luxury.isLuxury, true);
  assert.match(luxury.classes.headingFont, /font-display/);

  const localsWithSettings = { systemSettings: { storefront_theme: 'editorial-gallery' } };
  const fromSettings = useStorefrontTheme(localsWithSettings);
  assert.equal(fromSettings.id, 'editorial-gallery');
  assert.equal(fromSettings.isEditorial, true);

  const localsWithInjected = {
    systemSettings: { storefront_theme: 'apple-minimal' },
    themeContext: luxury,
  };
  assert.equal(useStorefrontTheme(localsWithInjected).id, 'luxury-atelier');
});

test('hydrateAdminTimes converts SSR time[data-admin-time] elements to local formatted strings', () => {
  const mkEl = (attrs: Record<string, string>) => {
    const map = new Map(Object.entries(attrs));
    return {
      textContent: 'UTC fallback',
      getAttribute: (k: string) => map.get(k) ?? null,
      setAttribute: (k: string, v: string) => map.set(k, v),
    };
  };

  const sampleTs = '2026-11-18T14:07:18Z';
  const shortEl = mkEl({ 'data-admin-time': sampleTs, 'data-admin-time-mode': 'short', 'data-admin-time-prefix': 'Last: ', 'data-admin-time-title-prefix': 'Last hit: ' });
  const fullEl = mkEl({ 'data-admin-time': sampleTs, 'data-admin-time-mode': 'full' });
  const dateEl = mkEl({ 'data-admin-time': sampleTs, 'data-admin-time-mode': 'date', 'data-admin-time-prefix': 'Updated: ' });

  const prevDoc = (globalThis as any).document;
  (globalThis as any).document = {};
  try {
    hydrateAdminTimes({ querySelectorAll: () => [shortEl, fullEl, dateEl] } as any);
    assert.equal(shortEl.textContent, `Last: ${formatAdminTime(sampleTs, 'short')}`);
    assert.equal(shortEl.getAttribute('title'), `Last hit: ${formatAdminTime(sampleTs, 'short')}`);
    assert.equal(fullEl.textContent, formatAdminTime(sampleTs, 'full'));
    assert.equal(dateEl.textContent, `Updated: ${formatAdminTime(sampleTs, 'full').slice(0, 10)}`);
  } finally {
    (globalThis as any).document = prevDoc;
  }
});
