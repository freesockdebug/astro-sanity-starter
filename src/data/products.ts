import { getSanityClient } from '@utils/sanity-client';
import { SanityImageService } from '@utils/image';
import { createCmsCache, createCmsKeyedCache, createTieredCache } from '@utils/cache';
import { DEFAULT_CATALOG } from './defaults';
import { getLocalizedPath, type SupportedLocale } from '@i18n';
import type { Product } from 'types';

export const PRODUCT_FIELDS = `{
  _id,
  title,
  shortTitle,
  statusBadge,
  supportBadge,
  specsHeading,
  specsBadge,
  storyBadge,
  storyHeading,
  story,
  galleryHint,
  priceNote,
  paletteTitle,
  variantDisplayMode,
  addToQuoteButtonText,
  amazonAsin,
  amazonRating,
  amazonUrl,
  sampleButtonText,
  primaryButtonText,
  secondaryButtonText,
  "slug": slug.current,
  sku,
  currency,
  tagline,
  moq,
  leadTime,
  "mainImage": mainImage.asset->url,
  "gallery": gallery[] {
    "_id": asset->_id,
    "src": asset->url,
    "alt": alt,
    "caption": caption
  },
  colors,
  pricingTiers,
  specifications,
  "category": category->{
    _id,
    title,
    "slug": slug.current,
    description
  }
}`;

/**
 * High-performance lightweight card projection for product listings & showcases.
 * Strips heavy galleries, deep specifications, and pricing tiers to drop payload size by ~80%.
 */
export const PRODUCT_CARD_FIELDS = `{
  _id,
  title,
  shortTitle,
  "slug": slug.current,
  sku,
  amazonAsin,
  amazonRating,
  currency,
  tagline,
  moq,
  leadTime,
  "mainImage": mainImage.asset->url,
  colors,
  pricingTiers,
  "specifications": specifications[0..1],
  "category": category->{
    _id,
    title,
    "slug": slug.current
  }
}`;

export const CATEGORY_FIELDS = `{
  _id,
  title,
  "slug": slug.current,
  description,
  order
}`;

export interface NormalizedProduct {
  id: string;
  slug: string;
  canonicalKey: string;
  amazonAsin?: string;
  amazonRating?: number;
  title: string;
  shortTitle: string;
  tagline: string;
  category: string;
  image: string;
  composition: string;
  gauge: string;
  moq: string;
  moqQty: number;
  unit: string;
  leadTime: string;
  price: string;
  currency: string;
  currencySymbol: string;
  pricingTiers?: any[];
  colors: string[];
  isFeatured?: boolean;
  isNew?: boolean;
  sku: string;
}

/**
 * Canonical product URL segment: ASIN (preferred) -> SKU -> Slug.
 */
export function getProductCanonicalKey(
  p: { amazonAsin?: string; sku?: string; slug?: string; _id?: string } | null | undefined
): string {
  const asin = typeof p?.amazonAsin === 'string' ? p.amazonAsin.trim() : '';
  if (asin) return asin;
  const sku = typeof p?.sku === 'string' ? p.sku.trim() : '';
  if (sku) return sku;
  const slug = typeof p?.slug === 'string' ? p.slug.trim() : '';
  return slug || p?._id || 'item';
}

/**
 * Resolves a product from ASIN, SKU, or Slug (supporting WordPress-style multi-URL resolution).
 */
export function findProductByIdentifier<
  T extends { amazonAsin?: string; sku?: string; slug?: string }
>(products: T[] | null | undefined, identifier: string): T | null {
  if (!Array.isArray(products) || !identifier) return null;
  const target = identifier.trim();
  const targetLower = target.toLowerCase();
  if (!target) return null;

  for (const field of ['amazonAsin', 'sku', 'slug'] as const) {
    const exact = products.find((p) => (typeof p?.[field] === 'string' ? p[field]!.trim() === target : false));
    if (exact) return exact;
    const ci = products.find((p) => (typeof p?.[field] === 'string' ? p[field]!.trim().toLowerCase() === targetLower : false));
    if (ci) return ci;
  }
  return null;
}

export type VariantDisplayMode = 'auto' | 'color' | 'size';

/**
 * Strips a redundant "Size" prefix from size variant labels (e.g. "Size 1-2T" -> "1-2T").
 */
export function formatSizeVariantLabel(rawName?: string): string {
  const trimmed = typeof rawName === 'string' ? rawName.trim() : '';
  if (!trimmed) return '';
  const stripped = trimmed.replace(/^size\s*[:：-]?\s*/i, '').trim();
  return stripped || trimmed;
}

/**
 * Resolves whether product variants should render as size pills or circular color swatches.
 */
export function resolveVariantDisplayMode(params: {
  variantDisplayMode?: string | null;
  paletteTitle?: string | null;
  variants?: Array<{ name?: string; hex?: string } | null> | null;
}): 'color' | 'size' {
  const explicit = typeof params?.variantDisplayMode === 'string'
    ? params.variantDisplayMode.trim().toLowerCase()
    : '';
  if (explicit === 'size' || explicit === 'color') {
    return explicit;
  }

  const variants = Array.isArray(params?.variants) ? params.variants.filter(Boolean) as Array<{ name?: string; hex?: string }> : [];
  const namedVariants = variants.filter((v) => typeof v?.name === 'string' && v.name.trim().length > 0);
  if (namedVariants.some((v) => {
    const name = v.name!.trim();
    return (
      /^size\b/i.test(name) ||
      /^\d+(?:\s*[-–/]\s*\d+)?\s*(?:t|m|y|mo|mos|months?|years?|yrs?)\b/i.test(name) ||
      /^(?:xxs|xs|s|m|l|xl|xxl|xxxl|one\s*size|free\s*size)$/i.test(name)
    );
  })) {
    return 'size';
  }

  if (namedVariants.length > 0 && !variants.some((v) => typeof v?.hex === 'string' && v.hex.trim().length > 0)) {
    return 'size';
  }

  const title = typeof params?.paletteTitle === 'string' ? params.paletteTitle.toLowerCase() : '';
  if (/\b(size|sizes|talla|tallas|taille|tailles)\b|größen|groessen|尺码/.test(title)) {
    return 'size';
  }

  return 'color';
}

/**
 * Maps standard currency code to display currency symbol
 */
export function getCurrencySymbol(currency?: string): string {
  if (!currency) return '$';
  const c = currency.trim().toUpperCase();
  if (c === 'USD' || c === '$') return '$';
  if (c === 'EUR' || c === '€') return '€';
  if (c === 'GBP' || c === '£') return '£';
  if (c === 'CNY' || c === 'RMB' || c === '¥') return '¥';
  return currency.trim();
}

/**
 * Resolves the minimum order quantity (MOQ) and unit.
 * Priority: 1. Minimum quantity and unit from pricingTiers
 *           2. Fallback to product.moq
 *           3. Fallback to default '200 Pairs'
 */
export function resolveProductMoq(
  pricingTiers?: any[],
  fallbackMoq?: string
): { quantity: number; unit: string; formatted: string } {
  let minQty = Infinity;
  let detectedUnit = '';

  if (Array.isArray(pricingTiers) && pricingTiers.length > 0) {
    for (const tier of pricingTiers) {
      if (!tier || typeof tier !== 'object') continue;
      const rawRange = String(tier.range || tier.quantity || '').trim();
      const rawUnit = String(tier.unit || '').trim();

      // Extract starting quantity: match first sequence of digits
      const numMatch = rawRange.match(/([0-9][0-9,]*)/);
      if (numMatch) {
        const parsed = parseInt(numMatch[1].replace(/,/g, ''), 10);
        if (!isNaN(parsed) && parsed > 0 && parsed < minQty) {
          minQty = parsed;
          if (rawUnit) {
            detectedUnit = rawUnit;
          } else {
            // Try extracting unit name from range string (e.g. "100 - 499 Packs" -> "Packs")
            const unitMatch = rawRange.match(/[0-9.,+-\s]+([a-zA-Z\u4e00-\u9fa5]+)/);
            if (unitMatch && unitMatch[1]) {
              detectedUnit = unitMatch[1].trim();
            }
          }
        }
      }
    }
  }

  if (minQty !== Infinity) {
    const finalUnit = detectedUnit || 'Pairs';
    return {
      quantity: minQty,
      unit: finalUnit,
      formatted: `${minQty} ${finalUnit}`
    };
  }

  if (fallbackMoq && typeof fallbackMoq === 'string' && fallbackMoq.trim()) {
    const cleanMoq = fallbackMoq.trim();
    const numMatch = cleanMoq.match(/([0-9][0-9,]*)/);
    const parsed = numMatch ? parseInt(numMatch[1].replace(/,/g, ''), 10) : 200;
    const unitMatch = cleanMoq.match(/[0-9.,+-\s]+([a-zA-Z\u4e00-\u9fa5]+)/);
    const finalUnit = unitMatch && unitMatch[1] ? unitMatch[1].trim() : 'Pairs';
    return {
      quantity: parsed || 200,
      unit: finalUnit,
      formatted: cleanMoq
    };
  }

  return {
    quantity: 200,
    unit: 'Pairs',
    formatted: '200 Pairs'
  };
}

/**
 * Resolves the starting FOB wholesale price from the maximum tier unit price.
 * Single Source of Truth: directly derived from pricingTiers.
 */
export function getMaxTierPrice(pricingTiers?: any[], productCurrency?: string): { currency: string; amount: string; formatted: string } | null {
  if (!Array.isArray(pricingTiers) || pricingTiers.length === 0) return null;

  let maxNum = -Infinity;
  let detectedCurrency = productCurrency ? getCurrencySymbol(productCurrency) : '$';

  for (const tier of pricingTiers) {
    const raw = typeof tier === 'object' && tier ? tier.price : tier;
    if (typeof raw === 'string' && raw.trim()) {
      const match = raw.match(/^([$€£¥])\s*([0-9.,]+)/) || raw.match(/([0-9.,]+)\s*([$€£¥])$/);
      if (match) {
        const isSymbolFirst = match[1] && '[$€£¥]'.includes(match[1]);
        const symbol = isSymbolFirst ? match[1] : match[2];
        const num = parseFloat((isSymbolFirst ? match[2] : match[1]).replace(/,/g, ''));
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
          if (!productCurrency) {
            detectedCurrency = symbol === '¥' ? '$' : symbol;
          }
        }
      } else {
        const numOnly = parseFloat(raw.replace(/[^0-9.]/g, ''));
        if (!isNaN(numOnly) && numOnly > maxNum) {
          maxNum = numOnly;
        }
      }
    } else if (typeof raw === 'number' && !isNaN(raw) && raw > maxNum) {
      maxNum = raw;
    }
  }

  if (maxNum === -Infinity) return null;
  const amountStr = maxNum.toFixed(2);
  return {
    currency: detectedCurrency,
    amount: amountStr,
    formatted: `${detectedCurrency}${amountStr}`
  };
}

export interface CatalogCategoryItem {
  id: string;
  label: string;
  count: number;
}

export function extractProductIdentifiers(list: Product[] | null | undefined): string[] {
  const keys = new Set<string>();
  for (const p of list || []) {
    if (p?.slug) keys.add(p.slug);
    if (typeof p?.amazonAsin === 'string' && p.amazonAsin.trim()) keys.add(p.amazonAsin.trim());
    if (typeof p?.sku === 'string' && p.sku.trim()) keys.add(p.sku.trim());
  }
  return Array.from(keys);
}

const productSlugsCache = createTieredCache<string[], Set<string>>({
  name: 'prod:slugs',
  scope: 'products',
  ttlMs: Infinity,
  fallbackRaw: [],
  compile: (slugs) => (Array.isArray(slugs) && slugs.length > 0 ? new Set(slugs.filter(Boolean)) : new Set<string>()),
  fetchRaw: async (customEnv) => {
    const list = await productsCache.get(false, customEnv);
    return extractProductIdentifiers(list);
  },
});

const productsCache = createCmsCache<Product[]>(
  (forceRefresh) => getSanityClient(forceRefresh).fetch<Product[]>(`*[_type == "product"] | order(_createdAt asc) ${PRODUCT_CARD_FIELDS}`),
  [],
  {
    kvKey: 'cms:products:all:v2',
    scope: 'products',
    purgeAction: 'refresh',
    onUpdate: (list) => {
      if (Array.isArray(list) && list.length > 0) {
        productSlugsCache.seed(extractProductIdentifiers(list));
      }
    },
  }
);

const categoriesCache = createCmsCache<any[]>(
  (forceRefresh) => getSanityClient(forceRefresh).fetch<any[]>(`*[_type == "category"] | order(order asc, _createdAt asc) ${CATEGORY_FIELDS}`),
  [],
  { kvKey: 'cms:categories:all', scope: 'products', purgeAction: 'refresh' }
);

const catalogSettingsCache = createCmsCache<any | null>(
  (forceRefresh) => getSanityClient(forceRefresh).fetch<any>(`*[_type == "catalogSettings"][0]`),
  null,
  { kvKey: 'cms:catalogSettings', scope: 'products', purgeAction: 'refresh' }
);

const storySettingsCache = createCmsCache<any | null>(
  (forceRefresh) => getSanityClient(forceRefresh).fetch<any>(`*[_type == "productStorySettings"][0]`),
  null,
  { kvKey: 'cms:productStorySettings', scope: 'products', purgeAction: 'refresh' }
);

const productBySlugCache = createCmsKeyedCache<Product>(
  'cms:product',
  (slug, forceRefresh) => getSanityClient(forceRefresh).fetch<Product | null>(`*[_type == "product" && slug.current == $slug][0] ${PRODUCT_FIELDS}`, { slug }),
  {
    name: 'prod:details',
    scope: 'products',
    existsGuard: async (slug, customEnv) => {
      const slugs = await productSlugsCache.get(customEnv);
      return slugs.size === 0 || slugs.has(slug);
    },
  }
);

/**
 * Service class handling Product querying, caching, and fallback resolution
 */
export class ProductService {
  public static seed(data: { products?: Product[]; categories?: any[]; catalogSettings?: any; productStorySettings?: any }): void {
    if (data.products !== undefined) productsCache.seed(data.products);
    if (data.categories !== undefined) categoriesCache.seed(data.categories);
    if (data.catalogSettings !== undefined) catalogSettingsCache.seed(data.catalogSettings);
    if (data.productStorySettings !== undefined) storySettingsCache.seed(data.productStorySettings);
  }

  public static seedSlug(slug: string, product: Product): void {
    const existing = productSlugsCache.peek();
    if (existing) {
      if (slug) existing.add(slug);
      if (typeof product?.amazonAsin === 'string' && product.amazonAsin.trim()) existing.add(product.amazonAsin.trim());
      if (typeof product?.sku === 'string' && product.sku.trim()) existing.add(product.sku.trim());
    }
    productBySlugCache.seed(slug, product);
  }

  public static seedSlugs(slugs: string[], recordL2Hit = false): void {
    if (Array.isArray(slugs) && slugs.length > 0) {
      productSlugsCache.seed(slugs, recordL2Hit);
    }
  }

  public static getCachedSlugs(recordHit = false): string[] | null {
    const raw = productSlugsCache.peekRaw(recordHit);
    return Array.isArray(raw) && raw.length > 0 ? raw : null;
  }

  public static isKnownIdentifier(identifier: string, recordHit = false): boolean {
    if (!identifier) return false;
    const keys = this.getCachedSlugs(recordHit);
    if (!keys || keys.length === 0) return true;
    const trimmed = identifier.trim();
    const lower = trimmed.toLowerCase();
    if (keys.some((k) => k === trimmed || k.toLowerCase() === lower)) {
      return true;
    }
    // Stale preload self-healing: legacy edge:preload:v1 stored only lowercase slugs without ASIN/SKU.
    if (
      !keys.some((k) => /[A-Z]/.test(k)) &&
      /^[A-Za-z0-9][A-Za-z0-9_-]{3,48}$/.test(trimmed) &&
      /[A-Z0-9]/.test(trimmed)
    ) {
      return true;
    }
    return false;
  }

  public static async getSlugs(customEnv?: any): Promise<string[]> {
    await productSlugsCache.get(customEnv);
    return this.getCachedSlugs() || [];
  }

  /**
   * Universal normalizer for product cards, catalogs, and listings
   */
  public static normalize(sp: any, imageWidth = 800): NormalizedProduct {
    const slug = sp.slug || sp._id || 'item';
    const rawCategory = sp.category;
    let category = 'cotton';
    if (rawCategory && typeof rawCategory === 'object' && rawCategory.slug) {
      category = rawCategory.slug;
    } else if (typeof rawCategory === 'string' && rawCategory.trim()) {
      category = rawCategory.trim().toLowerCase();
    } else {
      const titleStr = typeof sp.title === 'object' && sp.title ? Object.values(sp.title).join(' ') : (sp.title || '');
      const shortTitleStr = typeof sp.shortTitle === 'object' && sp.shortTitle ? Object.values(sp.shortTitle).join(' ') : (sp.shortTitle || '');
      const taglineStr = typeof sp.tagline === 'object' && sp.tagline ? Object.values(sp.tagline).join(' ') : (sp.tagline || '');
      const text = `${titleStr} ${shortTitleStr} ${taglineStr} ${sp.specifications?.[0]?.value || ''}`.toLowerCase();
      if (text.includes('silk') || text.includes('loafer')) category = 'silk';
      else if (text.includes('cashmere') || text.includes('merino') || text.includes('wool')) category = 'cashmere';
      else if (text.includes('sheer') || text.includes('tights') || text.includes('pantyhose')) category = 'sheer';
      else if (text.includes('cotton') || text.includes('ruffle') || text.includes('lace')) category = 'cotton';
      else if (text.includes('terry') || text.includes('athletic') || text.includes('sport') || text.includes('trail')) category = 'terry';
    }

    const rawImg = sp.image || sp.mainImage || (sp.gallery && sp.gallery[0]?.src) || '/images/hero-light.webp';
    const image = SanityImageService.thumbnail(rawImg, imageWidth);

    const colors = Array.isArray(sp.colors)
      ? sp.colors.map((c: any) => (typeof c === 'string' ? c : c?.hex || '#1c1917'))
      : ['#1c1917', '#e7e5e4'];

    const rawShortTitle = sp.shortTitle || sp.title;
    const cleanShortTitle = typeof rawShortTitle === 'string'
      ? rawShortTitle.replace(/\([^)]*\)/g, '').trim()
      : rawShortTitle || 'Curated Knit';

    const rawCurrency = (sp.currency && typeof sp.currency === 'string' && sp.currency.trim())
      ? sp.currency.trim()
      : 'USD';
    const currency = rawCurrency.toUpperCase();
    const currencySymbol = getCurrencySymbol(rawCurrency);

    const tierPrice = getMaxTierPrice(sp.pricingTiers, currency);
    const fallbackPrice = category === 'silk' ? '4.90' : category === 'cashmere' ? '6.80' : category === 'sheer' ? '3.80' : '3.20';
    const price = tierPrice ? tierPrice.amount : fallbackPrice;

    const resolvedMoq = resolveProductMoq(sp.pricingTiers, sp.moq);
    const amazonAsin = typeof sp.amazonAsin === 'string' && sp.amazonAsin.trim() ? sp.amazonAsin.trim() : undefined;
    const parsedRating = typeof sp.amazonRating === 'number' ? sp.amazonRating : Number(sp.amazonRating);
    const amazonRating = Number.isFinite(parsedRating) && parsedRating > 0 && parsedRating <= 5 ? parsedRating : undefined;
    const canonicalKey = getProductCanonicalKey({ amazonAsin, sku: sp.sku, slug, _id: sp._id });

    return {
      id: slug,
      slug,
      canonicalKey,
      amazonAsin,
      amazonRating,
      title: sp.title || 'Curated Knit Silhouette',
      shortTitle: cleanShortTitle,
      tagline: sp.tagline || 'Wholesale Ready White-Label Silhouette',
      category,
      image,
      composition: (sp.specifications && sp.specifications[0]?.value) || sp.composition || 'Premium Textile Blend',
      gauge: (sp.specifications && sp.specifications[1]?.value) || sp.gauge || 'Fine Gauge Knit',
      moq: resolvedMoq.formatted,
      moqQty: resolvedMoq.quantity,
      unit: resolvedMoq.unit,
      leadTime: sp.leadTime || '15-20 Days',
      price,
      currency,
      currencySymbol,
      pricingTiers: sp.pricingTiers,
      colors,
      isFeatured: sp.isFeatured ?? true,
      isNew: sp.isNew ?? false,
      sku: sp.sku || slug.toUpperCase()
    };
  }

  /**
   * Fetch all products as standardized, ready-to-render items directly from Sanity
   */
  public static async getNormalizedAll(imageWidth = 800, forceRefresh = false): Promise<NormalizedProduct[]> {
    const raw = await this.getAll(forceRefresh);
    if (raw && raw.length > 0) {
      return raw.map((p) => this.normalize(p, imageWidth));
    }
    return [];
  }

  /**
   * Fetch all products from Sanity with short-lived in-memory caching for SSR deduplication
   */
  public static async getAll(forceRefresh = false, customEnv?: any): Promise<Product[]> {
    return productsCache.get(forceRefresh, customEnv);
  }

  /**
   * Fetch all product categories from Sanity
   */
  public static async getCategories(forceRefresh = false, customEnv?: any): Promise<any[]> {
    return categoriesCache.get(forceRefresh, customEnv);
  }

  /**
   * Fetch a single product by slug (L1 Memory 5m -> L2 Permanent KV -> L3 Sanity)
   */
  public static async getBySlug(slug: string, customEnv?: any): Promise<Product | null> {
    return productBySlugCache.get(slug, customEnv);
  }

  /**
   * Write-Through refresh for a single product slug into KV and L1 memory
   */
  public static async refreshSlug(slug: string, customEnv?: any): Promise<Product | null> {
    return productBySlugCache.refresh(slug, customEnv);
  }

  /**
   * Remove a deleted product slug from KV and L1 memory
   */
  public static async evictSlug(slug: string, customEnv?: any): Promise<void> {
    await productBySlugCache.evict(slug, customEnv);
  }

  /**
   * Write-Through refresh of product lists, categories, and settings
   */
  public static async refreshAll(customEnv?: any): Promise<void> {
    await Promise.all([
      productsCache.get(true, customEnv),
      categoriesCache.get(true, customEnv),
    ]);
  }

  /**
   * Fetch product story settings from Sanity
   */
  public static async getProductStorySettings(forceRefresh = false, customEnv?: any): Promise<any> {
    return storySettingsCache.get(forceRefresh, customEnv);
  }

  /**
   * Fetch catalog hall settings from Sanity
   */
  public static async getCatalogSettings(forceRefresh = false, customEnv?: any): Promise<any> {
    return catalogSettingsCache.get(forceRefresh, customEnv);
  }

  /**
   * Resolves aggregated categories with product counts and fallback guarantees
   */
  public static async getCatalogCategories(
    products: NormalizedProduct[],
    allLabel = DEFAULT_CATALOG.allSilhouettesLabel
  ): Promise<CatalogCategoryItem[]> {
    const sanityCats = await this.getCategories();
    const categories: CatalogCategoryItem[] = [
      { id: 'all', label: allLabel, count: products.length },
    ];

    if (sanityCats && sanityCats.length > 0) {
      sanityCats.forEach((cat: any) => {
        const catSlug = cat.slug || cat._id;
        const catTitleEn = typeof cat.title === 'object' && cat.title ? cat.title.en : cat.title;
        const count = products.filter(
          (p) => p.category === catSlug || (catTitleEn && p.category === catTitleEn.toLowerCase())
        ).length;
        categories.push({
          id: catSlug,
          label: cat.title || catSlug,
          count,
        });
      });
    } else {
      DEFAULT_CATALOG.fallbackCategories.forEach((cat) => {
        categories.push({
          id: cat.id,
          label: cat.label,
          count: products.filter((p) => p.category === cat.id).length,
        });
      });
    }

    return categories;
  }

  /**
   * Clears in-memory cache if needed
   */
  public static invalidateCache(): void {
    productSlugsCache.invalidate();
    productsCache.invalidate();
    categoriesCache.invalidate();
    catalogSettingsCache.invalidate();
    storySettingsCache.invalidate();
    productBySlugCache.invalidate();
  }
}

export type ProductRouteResolution =
  | { kind: 'redirect'; location: string; status: 301 | 302 }
  | { kind: 'render'; product: Product; allProducts: Product[]; targetSlug: string };

/**
 * Shared route resolver for `/products/[slug]` and `/[lang]/products/[slug]`.
 * Must be executed in top-level Astro page routes because child components cannot issue `Astro.redirect`.
 */
export async function resolveProductDetailRoute(
  slug: string | undefined,
  lang: SupportedLocale
): Promise<ProductRouteResolution> {
  if (!slug || !ProductService.isKnownIdentifier(slug, true)) {
    return { kind: 'redirect', location: getLocalizedPath('/products', lang), status: 302 };
  }

  const allProducts = (await ProductService.getAll()) || [];
  const matchedSummary = findProductByIdentifier(allProducts, slug);
  if (allProducts.length > 0 && !matchedSummary) {
    return { kind: 'redirect', location: getLocalizedPath('/products', lang), status: 302 };
  }

  if (matchedSummary) {
    const canonicalKey = getProductCanonicalKey(matchedSummary);
    if (slug !== canonicalKey) {
      return { kind: 'redirect', location: getLocalizedPath(`/products/${canonicalKey}`, lang), status: 301 };
    }
  }

  const targetSlug = matchedSummary?.slug || slug;
  const currentProduct = await ProductService.getBySlug(targetSlug);
  if (!currentProduct) {
    return { kind: 'redirect', location: getLocalizedPath('/products', lang), status: 302 };
  }

  const fullCanonicalKey = getProductCanonicalKey(currentProduct);
  if (slug !== fullCanonicalKey) {
    return { kind: 'redirect', location: getLocalizedPath(`/products/${fullCanonicalKey}`, lang), status: 301 };
  }

  return { kind: 'render', product: currentProduct, allProducts, targetSlug };
}

// Backward-compatible function exports
export const fetchNormalizedProducts = (imageWidth?: number, forceRefresh?: boolean) => ProductService.getNormalizedAll(imageWidth, forceRefresh);
export const fetchAllCategories = (forceRefresh?: boolean) => ProductService.getCategories(forceRefresh);
export const fetchCatalogCategories = (products: NormalizedProduct[], allLabel?: string) => ProductService.getCatalogCategories(products, allLabel);

// Order item helpers (Single Source of Truth for Orders & Inquiries)
export type ProductMap = Map<string, { image: string; slug: string }>;

export function resolveOrderItemImage(item: any, productMap?: ProductMap): string {
  if (item?.image_url && item.image_url.trim()) {
    return item.image_url.replace('https://cdn.sanity.io', '/cdn-image');
  }
  const pid = item?.product_id ? String(item.product_id).trim() : '';
  if (pid && productMap?.has(pid)) {
    return productMap.get(pid)!.image;
  }
  const str = `${item?.title || ''} ${item?.sku || ''} ${pid}`.toLowerCase();
  if (str.includes('spec') || str.includes('pdf') || str.includes('dossier')) {
    return '/images/spec-light.webp';
  }
  if (str.includes('ruffle') || str.includes('gv-ru') || str.includes('lace')) {
    return '/images/products/gv-ruffle-detail.webp';
  }
  return '/images/hero-light.webp';
}

export function getOrderItemProductUrl(item: any, currentLang: string = 'en'): string | null {
  const pid = item?.product_id ? String(item.product_id).trim() : '';
  if (!pid) return null;
  if (pid.startsWith('spec-')) return getLocalizedPath(`/products/${pid.replace(/^spec-/, '')}`, currentLang as any);
  if (pid === 'swatch-kit-sample' || pid.startsWith('swatch-')) return getLocalizedPath('/products', currentLang as any);
  return getLocalizedPath(`/products/${pid}`, currentLang as any);
}


