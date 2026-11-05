import { client } from '@utils/sanity-client';
import { createSwrCache } from '@utils/cache';
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
  private static pageSlugCache = new Map<string, { data: Page; timestamp: number }>();

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
   * Fetch a page by URL slug using multi-tier caching (L1 memory -> L2 KV -> L3 Sanity)
   */
  public static async getBySlug(slug?: string | null, customEnv?: any, forceRefresh = false): Promise<Page[]> {
    const formattedSlug = !slug || slug === '/' ? '/' : (slug.startsWith('/') ? slug : `/${slug}`);
    const unslashed = formattedSlug.replace(/^\//, '');
    const cacheKey = `cms:page:${unslashed || 'home'}`;
    const now = Date.now();

    if (!forceRefresh) {
      const memHit = this.pageSlugCache.get(cacheKey);
      if (memHit && now - memHit.timestamp < 10_000) {
        return [structuredClone(memHit.data)];
      }

      try {
        const kvHit = await kvGet<Page>(cacheKey, customEnv);
        if (kvHit) {
          this.pageSlugCache.set(cacheKey, { data: kvHit, timestamp: now });
          return [structuredClone(kvHit)];
        }
      } catch {}
    }

    try {
      const data = await client.fetch<Page[]>(
        `*[_type == "page" && (slug.current == $formattedSlug || slug.current == $unslashed)] ${PAGE_QUERY_OBJ}`,
        { formattedSlug, unslashed }
      );
      const res = data || [];
      if (res.length > 0) {
        this.pageSlugCache.set(cacheKey, { data: res[0], timestamp: now });
        await kvPut(cacheKey, res[0], { expirationTtl: 86400 }, customEnv).catch(() => {});
      }
      return res.map((p) => structuredClone(p));
    } catch (err: any) {
      console.error(`PageService.getBySlug failed for slug ${slug}:`, err?.message);
      return [];
    }
  }
}

// Backward-compatible function exports
export const fetchData = () => PageService.getAll();
export const getPageById = (id: string) => PageService.getById(id);
export const getPageBySlug = (slug?: string | null) => PageService.getBySlug(slug);
