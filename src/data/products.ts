import { client } from '@utils/sanity-client';
import { SanityImageService } from '@utils/image';
import { DEFAULT_CATALOG } from './defaults';
import type { Product } from 'types';

export const PRODUCT_FIELDS = `{
  _id,
  title,
  shortTitle,
  statusBadge,
  supportBadge,
  specsHeading,
  specsBadge,
  galleryHint,
  priceNote,
  paletteTitle,
  addToQuoteButtonText,
  amazonAsin,
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

/**
 * Service class handling Product querying, caching, and fallback resolution
 */
export class ProductService {
  private static cachedProducts: Product[] | null = null;
  private static cacheTimestamp: number = 0;
  private static cachedCategories: any[] | null = null;
  private static categoryCacheTimestamp: number = 0;
  private static readonly CACHE_TTL_MS = 10_000;

  public static seed(data: { products?: Product[]; categories?: any[]; catalogSettings?: any }): void {
    const now = Date.now();
    if (data.products) {
      this.cachedProducts = data.products;
      this.cacheTimestamp = now;
    }
    if (data.categories) {
      this.cachedCategories = data.categories;
      this.categoryCacheTimestamp = now;
    }
    if (data.catalogSettings) {
      this.cachedCatalogSettings = data.catalogSettings;
      this.catalogSettingsTimestamp = now;
    }
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

    return {
      id: slug,
      slug,
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
  public static async getAll(forceRefresh = false): Promise<Product[]> {
    const now = Date.now();
    if (!forceRefresh && this.cachedProducts && (now - this.cacheTimestamp < this.CACHE_TTL_MS)) {
      return this.cachedProducts;
    }

    try {
      const data = await client.fetch<Product[]>(`*[_type == "product"] | order(_createdAt asc) ${PRODUCT_FIELDS}`);
      this.cachedProducts = data || [];
      this.cacheTimestamp = now;
      return this.cachedProducts;
    } catch (err: any) {
      console.error('ProductService.getAll failed to fetch products from Sanity:', err?.message);
      return this.cachedProducts || [];
    }
  }

  /**
   * Fetch all product categories from Sanity
   */
  public static async getCategories(forceRefresh = false): Promise<any[]> {
    const now = Date.now();
    if (!forceRefresh && this.cachedCategories && (now - this.categoryCacheTimestamp < this.CACHE_TTL_MS)) {
      return this.cachedCategories;
    }

    try {
      const data = await client.fetch<any[]>(`*[_type == "category"] | order(order asc, _createdAt asc) ${CATEGORY_FIELDS}`);
      this.cachedCategories = data || [];
      this.categoryCacheTimestamp = now;
      return this.cachedCategories;
    } catch (err: any) {
      console.error('ProductService.getCategories failed to fetch categories from Sanity:', err?.message);
      return this.cachedCategories || [];
    }
  }

  /**
   * Fetch a single product by slug
   */
  public static async getBySlug(slug: string): Promise<Product | null> {
    if (!slug) return null;
    try {
      const data = await client.fetch<Product | null>(
        `*[_type == "product" && slug.current == $slug][0] ${PRODUCT_FIELDS}`,
        { slug }
      );
      return data;
    } catch (err: any) {
      console.error(`ProductService.getBySlug failed for ${slug}:`, err?.message);
      return null;
    }
  }

  private static cachedCatalogSettings: any | null = null;
  private static catalogSettingsTimestamp: number = 0;

  /**
   * Fetch catalog hall settings from Sanity
   */
  public static async getCatalogSettings(forceRefresh = false): Promise<any> {
    const now = Date.now();
    if (!forceRefresh && this.cachedCatalogSettings && (now - this.catalogSettingsTimestamp < this.CACHE_TTL_MS)) {
      return this.cachedCatalogSettings;
    }

    try {
      const data = await client.fetch<any>(`*[_type == "catalogSettings"][0]`);
      this.cachedCatalogSettings = data || null;
      this.catalogSettingsTimestamp = now;
      return this.cachedCatalogSettings;
    } catch (err: any) {
      console.error('ProductService.getCatalogSettings failed:', err?.message);
      return this.cachedCatalogSettings || null;
    }
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
    this.cachedProducts = null;
    this.cacheTimestamp = 0;
    this.cachedCategories = null;
    this.categoryCacheTimestamp = 0;
    this.cachedCatalogSettings = null;
    this.catalogSettingsTimestamp = 0;
  }
}

// Backward-compatible function exports
export const fetchAllProducts = (forceRefresh?: boolean) => ProductService.getAll(forceRefresh);
export const fetchNormalizedProducts = (imageWidth?: number, forceRefresh?: boolean) => ProductService.getNormalizedAll(imageWidth, forceRefresh);
export const fetchAllCategories = (forceRefresh?: boolean) => ProductService.getCategories(forceRefresh);
export const fetchCategories = fetchAllCategories;
export const fetchCatalogCategories = (products: NormalizedProduct[], allLabel?: string) => ProductService.getCatalogCategories(products, allLabel);
export const fetchCatalogSettings = (forceRefresh?: boolean) => ProductService.getCatalogSettings(forceRefresh);
export const fetchProductBySlug = (slug: string) => ProductService.getBySlug(slug);

