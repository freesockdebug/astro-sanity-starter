// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';
import { SiteConfigService } from '@data/siteConfig';

/**
 * Cloudflare Edge Cache Middleware for HTML Pages
 * 
 * Target: Drastically drops TTFB from ~2,500ms down to ~20ms by serving
 * server-rendered HTML directly from Cloudflare's Global Edge Cache.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;
  const pathname = url.pathname;

  // 1. Self-Healing Stale Asset Redirection & Fallback Guard
  // When a client holds a cached/stale HTML requesting an older hashed CSS/JS bundle
  // (e.g. /_astro/Layout.old.css), prevent styling catastrophic 404s by redirecting to current active bundle.
  if (pathname.startsWith('/_astro/')) {
    if (pathname.endsWith('.css') && pathname.includes('Layout.')) {
      // Evergreen Canonical Fallback: redirect any missed/stale Layout.*.css directly to /_astro/Layout.css
      if (pathname !== '/_astro/Layout.css') {
        return new Response(null, {
          status: 302,
          statusText: 'Found',
          headers: {
            'Location': '/_astro/Layout.css',
            'Cache-Control': 'public, max-age=60',
            'X-Asset-Healing': 'STALE_LAYOUT_CSS_REDIRECT',
          },
        });
      }
    }

    return new Response('Asset Not Found', {
      status: 404,
      statusText: 'Not Found',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  }

  // 2. Only cache GET requests
  if (request.method !== 'GET') {
    return next();
  }
  // 3. Bypass cache in local dev, APIs, Studio, and assets
  if (import.meta.env.DEV) {
    return next();
  }

  // 3. Bypass cache for APIs, Sanity Studio admin, dynamic auth, and static asset chunks
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/studio') ||
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

  // Normalise cache request key to canonical origin + pathname
  // This guarantees cross-query sharing (stripping tracking/ads) and precise edge invalidation
  const canonicalUrl = new URL(pathname, url.origin);
  const cacheKey = new Request(canonicalUrl.toString(), {
    method: 'GET',
  });

  // 4. Secure Purge Guard: Prevent unauthorized external attackers from spamming ?purge=1 to hammer SSR & CMS quotas.
  // Edge purge via query param is strictly constrained to:
  // (a) Loopback dev origin (localhost / 127.0.0.1)
  // (b) Valid secret authentication (?key=... matching REVALIDATE_SECRET or header)
  const isPurgeParam = url.searchParams.has('purge') || url.searchParams.has('revalidate');
  let isAuthorizedPurge = false;
  if (isPurgeParam) {
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    const purgeSecret =
      (typeof process !== 'undefined' && process.env?.REVALIDATE_SECRET) ||
      (import.meta.env && (import.meta.env as any).REVALIDATE_SECRET);
    const providedKey = url.searchParams.get('key') || request.headers.get('x-revalidate-secret');
    if (isLocalhost || (purgeSecret && providedKey === purgeSecret)) {
      isAuthorizedPurge = true;
    }
  }

  if (isAuthorizedPurge && cache) {
    try {
      await cache.delete(cacheKey);
    } catch (e) {
      console.warn('[EdgeCache] Error purging cache:', e);
    }
  }

  if (cache && !isAuthorizedPurge) {
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
      const siteConfig = await SiteConfigService.getConfig();
      const edgeTtl = typeof siteConfig?.edgeCacheTtl === 'number' && siteConfig.edgeCacheTtl >= 0
        ? siteConfig.edgeCacheTtl
        : 300;

      // When Studio configures 0s (real-time mode), bypass edge caching
      if (edgeTtl === 0) {
        const bypassHeaders = new Headers(response.headers);
        bypassHeaders.set('Cache-Control', 'public, max-age=0, no-cache, no-store, must-revalidate');
        bypassHeaders.set('X-Edge-Cache', 'BYPASS');
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: bypassHeaders,
        });
      }

      const swr = Math.max(edgeTtl * 10, 3600);
      const cloned = response.clone();
      const edgeHeaders = new Headers(cloned.headers);

      // Instruct Cloudflare Edge Cache & Browser:
      // Browser: max-age=0, must-revalidate (browser always gets fresh)
      // Edge / CDN: s-maxage=${edgeTtl} (configured via Studio), SWR for ${swr}s
      edgeHeaders.set('Cache-Control', `public, max-age=0, s-maxage=${edgeTtl}, stale-while-revalidate=${swr}`);
      edgeHeaders.delete('Cloudflare-CDN-Cache-Control');
      edgeHeaders.delete('CDN-Cache-Control');
      edgeHeaders.set('X-Edge-Cache', 'MISS');

      const responseToCache = new Response(cloned.body, {
        status: cloned.status,
        statusText: cloned.statusText,
        headers: edgeHeaders,
      });

      // Asynchronously store to Cloudflare Edge Cache without blocking the response
      const cfCtx = (context.locals as any)?.cfContext;
      if (cfCtx?.waitUntil) {
        cfCtx.waitUntil(cache.put(cacheKey, responseToCache));
      } else {
        cache.put(cacheKey, responseToCache).catch((err: any) => {
          console.warn('[EdgeCache] Async cache put error:', err);
        });
      }

      // Return response with proper cache headers so upstream CDN caches it as well
      const returnedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: edgeHeaders,
      });
      return returnedResponse;
    } catch (err) {
      console.warn('[EdgeCache] Error writing cache:', err);
    }
  }

  return response;
});
