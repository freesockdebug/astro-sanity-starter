// src/data/index.ts
/**
 * Unified data access and services barrel export
 */
export * from './defaults';
export * from './siteConfig';
export * from './rfqSettings';
export * from './products';
export { PAGE_QUERY_OBJ, PageService, fetchData as fetchPageData, getPageById, getPageBySlug } from './page';
export * from './blocks';

