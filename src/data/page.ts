import { client } from '@utils/sanity-client';
import { createSwrCache, runInBackground } from '@utils/cache';
import { kvGet, kvPut } from '@utils/kv';
import { SECTIONS } from './blocks';
import type { Page } from 'types';

export const PAGE_QUERY_OBJ = `{
  _id,
  slug,
  title,
  metaTitle,
  addTitleSuffix,
  metaDescription,
  "socialImage": {
    "_id": socialImage.asset->_id,
    "src": socialImage.asset->url,
    "alt": socialImage.alt,
    "dimensions": socialImage.asset->metadata.dimensions
  },
  sections[] ${SECTIONS}
}`;

const homePageCache = createSwrCache<Page | null>(
  async () => {
    const pages = await PageService.getBySlug('/', undefined, true);
    return pages[0] || null;
  },
  null,
  10_000,
  undefined,
  { kvKey: 'cms:page:home', kvTtlSeconds: 86400 }
);

/**
 * Service for fetching and resolving CMS Pages from Sanity
 */
export class PageService {
  private static pageSlugCache = new Map<string, { data: Page | null; timestamp: number }>();
  private static inflightPage = new Map<string, Promise<Page[]>>();

  /**
   * Multi-tier cached retrieval of the homepage content (L1 isolate memory -> L2 Cloudflare KV -> L3 Sanity)
   */
  public static async getHomePage(forceRefresh = false): Promise<Page | null> {
    return homePageCache.get(forceRefresh);
  }

  public static invalidateCache(): void {
    homePageCache.invalidate();
    this.pageSlugCache.clear();
  }
  /**
   * Fetch all pages
   */
  public static async getAll(): Promise<Page[]> {
    try {
      const data = await client.fetch<Page[]>(`*[_type == "page"] ${PAGE_QUERY_OBJ}`);
      return data || [];
    } catch (err: any) {
      console.error('PageService.getAll failed:', err?.message);
      return [];
    }
  }

  /**
   * Fetch a page by Sanity document ID using parameterized GROQ
   */
  public static async getById(id: string): Promise<Page | null> {
    try {
      const data = await client.fetch<Page[]>(
        `*[_type == "page" && _id == $id] ${PAGE_QUERY_OBJ}`,
        { id }
      );
      return data && data.length > 0 ? data[0] : null;
    } catch (err: any) {
      console.error(`PageService.getById failed for id ${id}:`, err?.message);
      return null;
    }
  }

  /**
   * Fetch a page by URL slug using multi-tier SWR caching (L1 memory -> L2 KV -> L3 Sanity)
   * Fresh window: 60s (0ms instant memory return)
   * Stale window: 1h (0ms instant memory return + non-blocking background revalidation)
   * Negative caching: 1h KV & memory cache for 404 non-existent slugs (prevents cache penetration)
   */
  public static async getBySlug(slug?: string | null, customEnv?: any, forceRefresh = false): Promise<Page[]> {
    const formattedSlug = !slug || slug === '/' ? '/' : (slug.startsWith('/') ? slug : `/${slug}`);
    const unslashed = formattedSlug.replace(/^\//, '');
    const cacheKey = `cms:page:${unslashed || 'home'}`;
    const now = Date.now();

    if (!forceRefresh) {
      const memHit = this.pageSlugCache.get(cacheKey);
      if (memHit) {
        const age = now - memHit.timestamp;
        // 1. Fresh window (60s): 0ms instant memory return (whether null or page)
        if (age < 60_000) {
          return memHit.data ? [structuredClone(memHit.data)] : [];
        }
        // 2. Stale tolerance window (1 hour): instant memory return + non-blocking background revalidate
        if (age < 3_600_000) {
          runInBackground(this.revalidateSlug(formattedSlug, unslashed, cacheKey, customEnv));
          return memHit.data ? [structuredClone(memHit.data)] : [];
        }
      }
    }

    return this.revalidateSlug(formattedSlug, unslashed, cacheKey, customEnv);
  }

  private static async revalidateSlug(
    formattedSlug: string,
    unslashed: string,
    cacheKey: string,
    customEnv?: any
  ): Promise<Page[]> {
    const existing = this.inflightPage.get(cacheKey);
    if (existing) return existing;

    const task = (async () => {
      const now = Date.now();
      // 1. Check L2 KV on cold boot
      try {
        const kvHit = await kvGet<any>(cacheKey, customEnv);
        if (kvHit) {
          if (kvHit.notFound) {
            this.pageSlugCache.set(cacheKey, { data: null, timestamp: now });
            return [];
          }
          this.pageSlugCache.set(cacheKey, { data: kvHit, timestamp: now });
          return [structuredClone(kvHit)];
        }
      } catch {}

      // 2. Upstream Sanity fetch with PAGE_QUERY_OBJ
      try {
        const data = await client.fetch<Page[]>(
          `*[_type == "page" && (slug.current == $formattedSlug || slug.current == $unslashed)] ${PAGE_QUERY_OBJ}`,
          { formattedSlug, unslashed }
        );
        const res = data || [];
        if (res.length > 0) {
          const page = res[0];
          this.pageSlugCache.set(cacheKey, { data: page, timestamp: now });
          runInBackground(kvPut(cacheKey, page, { expirationTtl: 86400 }, customEnv));
          return [structuredClone(page)];
        } else {
          // Negative cache for 1 hour to prevent 404 cache penetration attacks
          this.pageSlugCache.set(cacheKey, { data: null, timestamp: now });
          runInBackground(kvPut(cacheKey, { notFound: true }, { expirationTtl: 3600 }, customEnv));
          return [];
        }
      } catch (err: any) {
        console.error(`PageService.getBySlug failed for slug ${formattedSlug}:`, err?.message);
        // Fallback to stale memory if available during upstream outage
        const stale = this.pageSlugCache.get(cacheKey);
        return stale && stale.data ? [structuredClone(stale.data)] : [];
      }
    })();

    this.inflightPage.set(cacheKey, task);
    try {
      return await task;
    } finally {
      this.inflightPage.delete(cacheKey);
    }
  }
}

// Backward-compatible function exports
export const fetchData = () => PageService.getAll();
export const getPageById = (id: string) => PageService.getById(id);
export const getPageBySlug = (slug?: string | null) => PageService.getBySlug(slug);
