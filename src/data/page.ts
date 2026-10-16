import { client } from '@utils/sanity-client';
import { SECTIONS } from './blocks';
import type { Page } from 'types';

export const PAGE_QUERY_OBJ = `{
  _id,
  slug,
  title,
  metaTitle,
  metaDescription,
  "socialImage": {
    "src": socialImage.asset->url
  },
  sections[] ${SECTIONS}
}`;

/**
 * Service for fetching and resolving CMS Pages from Sanity
 */
export class PageService {
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
   * Fetch a page by URL slug using parameterized GROQ (Safe from GROQ injection)
   */
  public static async getBySlug(slug?: string | null): Promise<Page[]> {
    try {
      const formattedSlug = !slug || slug === '/' ? '/' : (slug.startsWith('/') ? slug : `/${slug}`);
      const unslashed = formattedSlug.replace(/^\//, '');

      const data = await client.fetch<Page[]>(
        `*[_type == "page" && (slug.current == $formattedSlug || slug.current == $unslashed)] ${PAGE_QUERY_OBJ}`,
        { formattedSlug, unslashed }
      );
      return data || [];
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
