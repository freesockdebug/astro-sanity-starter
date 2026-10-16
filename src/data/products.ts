import { client } from '@utils/sanity-client';
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
  specifications
}`;

/**
 * Service class handling Product querying, caching, and fallback resolution
 */
export class ProductService {
  private static cachedProducts: Product[] | null = null;
  private static cacheTimestamp: number = 0;
  private static readonly CACHE_TTL_MS = 10_000; // 10 seconds in-memory cache for fast SSR

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

  /**
   * Clears in-memory cache if needed
   */
  public static invalidateCache(): void {
    this.cachedProducts = null;
    this.cacheTimestamp = 0;
  }
}

// Backward-compatible function exports
export const fetchAllProducts = (forceRefresh?: boolean) => ProductService.getAll(forceRefresh);
export const fetchProductBySlug = (slug: string) => ProductService.getBySlug(slug);
