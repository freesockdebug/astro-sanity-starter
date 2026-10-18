// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';

/**
 * Cloudflare Edge Cache Middleware for HTML Pages
 * 
 * Target: Drastically drops TTFB from ~2,500ms down to ~20ms by serving
 * server-rendered HTML directly from Cloudflare's Global Edge Cache.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;
  const pathname = url.pathname;

  // 1. Only cache GET requests
  if (request.method !== 'GET') {
    return next();
  }

  // 2. Bypass cache for APIs, Sanity Studio admin, dynamic auth, and static asset chunks
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/studio') ||
    pathname.startsWith('/_astro/') ||
    pathname.startsWith('/cdn-image/') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap-index.xml'
  ) {
    return next();
  }

  // 3. Bypass cache if client explicitly requests preview or draft mode
  if (url.searchParams.has('preview') || url.searchParams.has('draft') || request.headers.get('authorization')) {
    return next();
  }

  // 4. Safely check for Cloudflare Cache API (available in Cloudflare Workers production)
  const cache = typeof caches !== 'undefined' && (caches as any).default 
    ? (caches as any).default 
    : null;

  // Normalise cache request key (strip irrelevant tracking query params if needed, or use exact URL)
  const cacheKey = new Request(url.toString(), {
    method: 'GET',
    headers: request.headers,
  });

  if (cache) {
    try {
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        // Cache HIT: deliver instantly from edge in 10-30ms!
        const hitResponse = new Response(cachedResponse.body, cachedResponse);
        hitResponse.headers.set('X-Edge-Cache', 'HIT');
        return hitResponse;
      }
    } catch (err) {
      console.warn('[EdgeCache] Error reading cache:', err);
    }
  }

  // 5. Cache MISS: execute SSR page render
  const response = await next();

  // 6. Only cache successful HTML responses (status 200)
  const contentType = response.headers.get('content-type') || '';
  if (cache && response.status === 200 && contentType.includes('text/html')) {
    try {
      const cloned = response.clone();
      const edgeHeaders = new Headers(cloned.headers);

      // Instruct Cloudflare Edge Cache to retain HTML for 4 hours, SWR for 1 day
      edgeHeaders.set('Cache-Control', 'public, max-age=0, s-maxage=14400, stale-while-revalidate=86400');
      edgeHeaders.set('Cloudflare-CDN-Cache-Control', 'public, max-age=14400, stale-while-revalidate=86400');
      edgeHeaders.set('CDN-Cache-Control', 'public, max-age=14400, stale-while-revalidate=86400');
      edgeHeaders.set('X-Edge-Cache', 'MISS');

      const responseToCache = new Response(cloned.body, {
        status: cloned.status,
        statusText: cloned.statusText,
        headers: edgeHeaders,
      });

      // Asynchronously store to Cloudflare Edge Cache without blocking the response
      const ctx = (context.locals as any)?.runtime?.ctx;
      if (ctx?.waitUntil) {
        ctx.waitUntil(cache.put(cacheKey, responseToCache));
      } else {
        cache.put(cacheKey, responseToCache).catch((err: any) => {
          console.warn('[EdgeCache] Async cache put error:', err);
        });
      }

      // Return response with informative headers
      const returnedResponse = new Response(response.body, response);
      returnedResponse.headers.set('X-Edge-Cache', 'MISS');
      return returnedResponse;
    } catch (err) {
      console.warn('[EdgeCache] Error writing cache:', err);
    }
  }

  return response;
});
