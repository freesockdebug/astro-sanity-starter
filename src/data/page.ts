import { client, getSanityClient } from '@utils/sanity-client';
import { createCmsCache, createCmsKeyedCache, createTieredCache, runInBackground } from '@utils/cache';
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

function normalizePageSlug(slug?: string | null): string {
  if (!slug || slug === '/') return 'home';
  const clean = slug.replace(/^\/+|\/+$/g, '');
  return clean || 'home';
}

const pageSlugsCache = createTieredCache<string[], Set<string>>({
  name: 'page:slugs',
  scope: 'pages',
  purgeAction: 'refresh',
  kvKey: 'cms:page_slugs:v1',
  epochKey: '__cms',
  ttlMs: Infinity,
  fallbackRaw: [],
  compile: (slugs) => {
    if (!Array.isArray(slugs) || slugs.length === 0) return new Set<string>();
    const set = new Set<string>(['home', '']);
    for (const s of slugs) {
      if (s) set.add(normalizePageSlug(s));
    }
    return set;
  },
  fetchRaw: () => getSanityClient().fetch<string[]>(`*[_type == "page" && defined(slug.current)].slug.current`),
});

const pageBySlugCache = createCmsKeyedCache<Page>(
  'cms:page',
  async (cacheSlug: string, forceRefresh?: boolean) => {
    const formattedSlug = cacheSlug === 'home' ? '/' : `/${cacheSlug}`;
    const unslashed = cacheSlug === 'home' ? 'home' : cacheSlug;
    const data = await getSanityClient(forceRefresh).fetch<Page[]>(
      `*[_type == "page" && (slug.current == $formattedSlug || slug.current == $unslashed)] ${PAGE_QUERY_OBJ}`,
      { formattedSlug, unslashed }
    );
    return data && data.length > 0 ? data[0] : null;
  },
  {
    name: 'page:doc',
    scope: 'pages',
    existsGuard: async (key, customEnv) => {
      const slugs = await pageSlugsCache.get(customEnv);
      return slugs.size === 0 || slugs.has(normalizePageSlug(key));
    },
  }
);

const allPagesCache = createCmsCache<Page[]>(
  (forceRefresh) => getSanityClient(forceRefresh).fetch<Page[]>(`*[_type == "page"] ${PAGE_QUERY_OBJ}`),
  [],
  {
    kvKey: 'cms:pages:all',
    scope: 'pages',
    purgeAction: 'refresh',
    onUpdate: (pages) => {
      if (Array.isArray(pages) && pages.length > 0) {
        const slugs = pages
          .map((p) => (typeof p?.slug === 'string' ? p.slug : (p?.slug as any)?.current))
          .filter(Boolean) as string[];
        runInBackground(pageSlugsCache.set(slugs, undefined, { syncKv: false }));
      }
    },
  }
);

/**
 * Service for fetching and resolving CMS Pages from Sanity
 */
export class PageService {
  /**
   * Multi-tier cached retrieval of the homepage content (L1 Memory 5m -> L2 Permanent KV -> L3 Sanity)
   */
  public static async getHomePage(forceRefresh = false, customEnv?: any): Promise<Page | null> {
    return pageBySlugCache.get('home', customEnv, forceRefresh);
  }

  public static seedSlugs(slugs: string[]): void {
    if (Array.isArray(slugs) && slugs.length > 0) {
      pageSlugsCache.seed(slugs);
    }
  }

  public static getCachedSlugs(): string[] | null {
    const raw = pageSlugsCache.peekRaw();
    return Array.isArray(raw) && raw.length > 0 ? raw : null;
  }

  public static invalidateCache(): void {
    pageSlugsCache.invalidate();
    pageBySlugCache.invalidate();
    allPagesCache.invalidate();
  }

  public static invalidateAll(): void {
    this.invalidateCache();
  }

  /**
   * Fetch all pages (L1 Memory 5m -> L2 Permanent KV -> L3 Sanity)
   */
  public static async getAll(forceRefresh = false, customEnv?: any): Promise<Page[]> {
    return allPagesCache.get(forceRefresh, customEnv);
  }

  public static async refreshAll(customEnv?: any): Promise<Page[]> {
    return allPagesCache.refresh(customEnv);
  }

  /**
   * Fetch a page by URL slug (L1 Memory 5m -> L2 Permanent KV -> L3 Sanity + 30s L1 negative caching)
   */
  public static async getBySlug(slug?: string | null, customEnv?: any, forceRefresh = false): Promise<Page[]> {
    const page = await pageBySlugCache.get(normalizePageSlug(slug), customEnv, forceRefresh);
    return page ? [page] : [];
  }

  /**
   * Write-Through refresh for a page slug into KV and L1 memory
   */
  public static async refreshSlug(slug?: string | null, customEnv?: any): Promise<Page | null> {
    return pageBySlugCache.refresh(normalizePageSlug(slug), customEnv);
  }

  /**
   * Remove a deleted page slug from KV and L1 memory
   */
  public static async evictSlug(slug?: string | null, customEnv?: any): Promise<void> {
    await pageBySlugCache.evict(normalizePageSlug(slug), customEnv);
  }
}

// Backward-compatible function exports
export const fetchData = () => PageService.getAll();
