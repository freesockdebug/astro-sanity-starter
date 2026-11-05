// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';
import { env as cfEnv } from 'cloudflare:workers';
import { SiteConfigService } from '@data/siteConfig';
import { SESSION_COOKIE_NAME, getCookieValue, getRuntimeEnv } from './utils/auth';
import { SecurityService } from './utils/security';
import { logger } from './utils/logger';

/**
 * Cloudflare Edge Cache Middleware for HTML Pages with Observability & Slow-Request Diagnostics
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const startTime = Date.now();
  const { request, url } = context;
  const pathname = url.pathname;
  const rayId = request.headers.get('cf-ray') || crypto.randomUUID();
  (context.locals as any).rayId = rayId;

  if (cfEnv && typeof globalThis !== 'undefined') {
    (globalThis as any).__CF_ENV__ = cfEnv;
  }
  const runtimeCtx = (context.locals as any)?.runtime?.ctx || (context.locals as any)?.cfContext;
  if (runtimeCtx && typeof globalThis !== 'undefined') {
    (globalThis as any).__CF_CTX__ = runtimeCtx;
  }

  try {
    const response = await handleRequest(context, next, pathname, url, request);
    const latencyMs = Date.now() - startTime;
    if (latencyMs > 2000 && !pathname.startsWith('/_astro/')) {
      logger.warn(
        {
          module: 'middleware',
          event: 'SLOW_REQUEST',
          message: `Slow request detected (${latencyMs}ms)`,
          path: pathname,
          rayId,
          latencyMs,
        },
        { cfEnv, ctx: runtimeCtx }
      );
    }
    response.headers.set('X-Request-Id', rayId);
    return response;
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    logger.error(
      {
        module: 'middleware',
        event: 'UNHANDLED_EXCEPTION',
        message: err?.message || 'Unhandled server exception',
        path: pathname,
        rayId,
        latencyMs,
        error: err,
      },
      { cfEnv, ctx: runtimeCtx }
    );

    if (pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          requestId: rayId,
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-Id': rayId,
            'Cache-Control': 'no-store, no-cache, must-revalidate',
          },
        }
      );
    }
    throw err;
  }
});

async function handleRequest(context: any, next: any, pathname: string, url: URL, request: Request): Promise<Response> {
  // Fast canonical redirect for root admin path to primary orders console
  if (pathname === '/admin' || pathname === '/admin/') {
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/admin/orders',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  }

  // 1. Self-Healing Stale Asset Redirection & Fallback Guard
  if (pathname.startsWith('/_astro/')) {
    if (pathname.endsWith('.css') && pathname.includes('Layout.')) {
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

  // 3. Bypass cache for APIs, Sanity Studio admin, Orders, Account, dynamic auth, and static asset chunks
  const isOrdersPath = pathname === '/orders' || pathname.startsWith('/orders/') || pathname.includes('/orders');
  const isAccountPath = pathname === '/account' || pathname.startsWith('/account/') || pathname.includes('/account');
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/') || pathname.includes('/admin');
  const cookieHeader = request.headers.get('cookie') || '';
  const hasUserSession = Boolean(getCookieValue(cookieHeader, SESSION_COOKIE_NAME));

  if (
    isOrdersPath ||
    isAccountPath ||
    isAdminPath ||
    hasUserSession ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/studio') ||
    pathname.startsWith('/cdn-image/') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap-index.xml'
  ) {
    // Actively evict any stale cache entry for dynamic order/account/admin views
    if ((isOrdersPath || isAccountPath || isAdminPath) && typeof caches !== 'undefined' && (caches as any).default) {
      try {
        const canonicalUrl = new URL(pathname, url.origin);
        await (caches as any).default.delete(new Request(canonicalUrl.toString(), { method: 'GET' }));
      } catch {
        // non-blocking
      }
    }

    const response = await next();
    if (isOrdersPath || isAccountPath || isAdminPath || hasUserSession) {
      response.headers.set('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
      response.headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
      response.headers.set('CDN-Cache-Control', 'no-store');
      response.headers.set('Pragma', 'no-cache');
      response.headers.set('Expires', '0');
      response.headers.set('X-Edge-Cache', 'BYPASS');
    }
    return response;
  }

  // 3. Bypass cache if client explicitly requests preview or draft mode
  if (url.searchParams.has('preview') || url.searchParams.has('draft') || request.headers.get('authorization')) {
    return next();
  }

  // 4. Safely check for Cloudflare Cache API (available in Cloudflare Workers production)
  const cache = typeof caches !== 'undefined' && (caches as any).default 
    ? (caches as any).default 
    : null;

  const canonicalUrl = new URL(pathname, url.origin);
  const cacheKey = new Request(canonicalUrl.toString(), {
    method: 'GET',
  });

  const isPurgeParam = url.searchParams.has('purge') || url.searchParams.has('revalidate');
  let isAuthorizedPurge = false;
  if (isPurgeParam) {
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    const isDev = Boolean(import.meta.env?.DEV);
    const configuredSecret = getRuntimeEnv('REVALIDATE_SECRET', cfEnv) || getRuntimeEnv('SANITY_REVALIDATE_SECRET', cfEnv);
    const purgeSecret = configuredSecret || (isDev || isLocalhost ? 'itsasecret' : '');
    const providedKey =
      url.searchParams.get('key') ||
      url.searchParams.get('secret') ||
      url.searchParams.get('token') ||
      request.headers.get('x-revalidate-secret') ||
      request.headers.get('x-webhook-secret') ||
      '';
    if (isLocalhost || (purgeSecret && providedKey && SecurityService.timingSafeEqual(providedKey, purgeSecret))) {
      isAuthorizedPurge = true;
    }
  }

  if (isAuthorizedPurge && cache) {
    try {
      await cache.delete(cacheKey);
    } catch (e) {
      logger.warn({ module: 'middleware', event: 'CACHE_PURGE_ERROR', message: 'Error purging cache', error: e });
    }
  }

  if (cache && !isAuthorizedPurge) {
    try {
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        const hitResponse = new Response(cachedResponse.body, cachedResponse);
        hitResponse.headers.set('X-Edge-Cache', 'HIT');
        return hitResponse;
      }
    } catch (err) {
      logger.warn({ module: 'middleware', event: 'CACHE_READ_ERROR', message: 'Error reading cache', error: err });
    }
  }

  // 5. Cache MISS: execute SSR page render
  const response = await next();

  // 6. Only cache successful HTML responses (status 200) without module-level errors
  const contentType = response.headers.get('content-type') || '';
  if (cache && response.status === 200 && !response.headers.has('X-Section-Error') && contentType.includes('text/html')) {
    try {
      const siteConfig = await SiteConfigService.getConfig();
      const edgeTtl = typeof siteConfig?.edgeCacheTtl === 'number' && siteConfig.edgeCacheTtl >= 0
        ? siteConfig.edgeCacheTtl
        : 300;

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

      edgeHeaders.set('Cache-Control', `public, max-age=0, s-maxage=${edgeTtl}, stale-while-revalidate=${swr}`);
      edgeHeaders.delete('Cloudflare-CDN-Cache-Control');
      edgeHeaders.delete('CDN-Cache-Control');
      edgeHeaders.set('X-Edge-Cache', 'MISS');

      const responseToCache = new Response(cloned.body, {
        status: cloned.status,
        statusText: cloned.statusText,
        headers: edgeHeaders,
      });

      const cfCtx = (context.locals as any)?.cfContext || (context.locals as any)?.runtime?.ctx;
      if (cfCtx?.waitUntil) {
        cfCtx.waitUntil(cache.put(cacheKey, responseToCache));
      } else {
        cache.put(cacheKey, responseToCache).catch((err: any) => {
          logger.warn({ module: 'middleware', event: 'ASYNC_CACHE_PUT_ERROR', message: 'Async cache put error', error: err });
        });
      }

      const returnedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: edgeHeaders,
      });
      return returnedResponse;
    } catch (err) {
      logger.warn({ module: 'middleware', event: 'CACHE_WRITE_ERROR', message: 'Error writing cache', error: err });
    }
  }

  return response;
}

