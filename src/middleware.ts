// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';
import { env as cfEnv } from 'cloudflare:workers';
import { SiteConfigService } from '@data/siteConfig';
import { SESSION_COOKIE_NAME, getCookieValue, getRuntimeEnv, verifySessionToken } from './utils/auth';
import { SecurityService } from './utils/security';
import { logger } from './utils/logger';
import { RequestProfiler, requestProfilerStorage } from './utils/profiler';
import { getSystemSettings } from './db/settings.repo';

/**
 * Safely mutates headers on a Response, cloning into a new Response if headers are immutable
 * (e.g. Response.redirect or cached responses).
 */
function safeSetHeaders(response: Response, headersToSet: Record<string, string>): Response {
  try {
    for (const [k, v] of Object.entries(headersToSet)) {
      response.headers.set(k, v);
    }
    return response;
  } catch {
    const newHeaders = new Headers(response.headers);
    for (const [k, v] of Object.entries(headersToSet)) {
      newHeaders.set(k, v);
    }
    const body = [204, 205, 304].includes(response.status) ? null : response.body;
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  }
}

function safeSetHeader(response: Response, name: string, value: string): Response {
  return safeSetHeaders(response, { [name]: value });
}

function sanitizeQuery(search: string): string {
  if (!search) return '';
  try {
    const params = new URLSearchParams(search);
    for (const key of Array.from(params.keys())) {
      if (/(code|token|secret|state|auth|password|key)/i.test(key)) {
        params.set(key, '[REDACTED]');
      }
    }
    return `?${params.toString()}`;
  } catch {
    return '[REDACTED_QUERY]';
  }
}

// Single-Flight Request Coalescing (Collapses edge cache stampedes on isolate)
const inFlightEdgeRenders = new Map<string, Promise<Response>>();

// Fast 404 shield for vulnerability probes, scanner bots, and well-known paths
// (Drops malicious probes at the worker edge in 0ms without DB queries, CMS trips, or telemetry loops)
const SCANNER_EXTENSIONS = /\.(php\d*|asp|aspx|jsp|cgi|env|git|sql|bak|zip|tar|gz|sh|py|rb|pl|ini|log|ya?ml|toml|action|do)$/i;
const SCANNER_PATTERN = /(?:^|\/)(?:wp-[a-z0-9_-]+|wordpress|phpmyadmin|pma|mysql|actuator|\.env|\.git|vendor|cgi-bin|eval-stdin|xmlrpc|wlwmanifest)(?:\/|$|\.)/i;

function isBlockedProbe(pathname: string): boolean {
  return pathname.startsWith('/.well-known/') || SCANNER_EXTENSIONS.test(pathname) || SCANNER_PATTERN.test(pathname);
}

/**
 * Cloudflare Edge Cache Middleware for HTML Pages with Observability & Slow-Request Diagnostics
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;
  const pathname = url.pathname;

  // Intercept scanners and well-known probes before allocating profiler or hitting D1
  if (isBlockedProbe(pathname)) {
    return new Response('Not Found', {
      status: 404,
      statusText: 'Not Found',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }

  const startTime = performance.now();
  const profiler = new RequestProfiler();
  (context.locals as any).profiler = profiler;

  return await requestProfilerStorage.run(profiler, async () => {
    const rayId = request.headers.get('cf-ray') || crypto.randomUUID();
    (context.locals as any).rayId = rayId;
    const clientMeta = SecurityService.resolveClientMeta(request);
    (context.locals as any).clientMeta = clientMeta;

    if (cfEnv && typeof globalThis !== 'undefined') {
      (globalThis as any).__CF_ENV__ = cfEnv;
    }
    const runtimeCtx = (context.locals as any)?.cfContext;

    const cookieHeader = request.headers.get('cookie') || '';
    const sessionToken = getCookieValue(cookieHeader, SESSION_COOKIE_NAME);
    let lazySessionUser: Promise<any> | null = null;
    const getSessionUser = () => {
      const explicitUser = (context.locals as any)?.sessionUser || (context.locals as any)?.user;
      if (explicitUser) return Promise.resolve(explicitUser);
      if (!sessionToken) return Promise.resolve(null);
      if (!lazySessionUser) {
        lazySessionUser = profiler.time('auth', () => verifySessionToken(sessionToken, cfEnv));
      }
      return lazySessionUser;
    };

    try {
      let response = await handleRequest(context, next, pathname, url, request);
      const latencyMs = Math.round((performance.now() - startTime) * 10) / 10;

      // Inject Server-Timing & X-Response-Time header for browser DevTools waterfall profiling
      response = safeSetHeaders(response, {
        'X-Request-Id': rayId,
        'X-Response-Time': `${latencyMs}ms`,
        'Server-Timing': profiler.toServerTimingHeader(latencyMs),
      });

      // Shell Request Cache Isolation & Vary Guard (Item 5: HTMX/PJAX Vary: X-Shell-Request + no-store)
      if (request.headers.get('x-shell-request') === '1') {
        const currentVary = response.headers.get('Vary') || '';
        const hasVaryShell = currentVary.toLowerCase().includes('x-shell-request');
        const newVary = hasVaryShell ? currentVary : (currentVary ? `${currentVary}, X-Shell-Request` : 'X-Shell-Request');
        response = safeSetHeaders(response, {
          'Vary': newVary,
          'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
          'Cloudflare-CDN-Cache-Control': 'no-store',
          'CDN-Cache-Control': 'no-store',
        });
      }

      // Filter out static assets and internal logging workbench to avoid loops
      const isStaticOrLogSelf =
        pathname.startsWith('/_astro/') ||
        pathname.startsWith('/api/admin/logs') ||
        pathname.startsWith('/api/client-error') ||
        pathname.startsWith('/admin/logs') ||
        pathname.startsWith('/favicon') ||
        pathname.endsWith('.png') ||
        pathname.endsWith('.jpg') ||
        pathname.endsWith('.svg') ||
        pathname.endsWith('.ico') ||
        pathname.endsWith('.css') ||
        pathname.endsWith('.js') ||
        pathname.endsWith('.xml') ||
        pathname.endsWith('.txt');

      if (!isStaticOrLogSelf) {
        const settings = (context.locals as any)?.systemSettings || await getSystemSettings(cfEnv).catch(() => null);
        const slowThreshold = settings?.slow_request_threshold_ms || 1000;
        const spans = profiler.getSpans();

        if (latencyMs >= slowThreshold) {
          const sessionUser = await getSessionUser();
          logger.warn(
            {
              module: 'api/perf',
              event: 'SLOW_REQUEST',
              message: `Slow request detected (${latencyMs}ms >= ${slowThreshold}ms)`,
              path: pathname,
              method: request.method,
              statusCode: response.status,
              rayId,
              latencyMs,
              userId: sessionUser?.id,
              userEmail: sessionUser?.email,
              clientIp: clientMeta.ip,
              country: clientMeta.country,
              city: clientMeta.city,
              context: { spans, query: sanitizeQuery(url.search) },
            },
            { cfEnv, ctx: runtimeCtx }
          );
        } else if (settings && (settings.log_min_level === 'info' || settings.log_min_level === 'debug')) {
          const sessionUser = await getSessionUser();
          logger.info(
            {
              module: 'api/perf',
              event: 'REQUEST_COMPLETED',
              message: `${request.method} ${pathname} (${response.status}) in ${latencyMs}ms`,
              path: pathname,
              method: request.method,
              statusCode: response.status,
              rayId,
              latencyMs,
              userId: sessionUser?.id,
              userEmail: sessionUser?.email,
              clientIp: clientMeta.ip,
              country: clientMeta.country,
              city: clientMeta.city,
              context: { spans, query: sanitizeQuery(url.search) },
            },
            { cfEnv, ctx: runtimeCtx }
          );
        }
      }

      if (response.status >= 500 && !pathname.startsWith('/api/') && !response.headers.has('X-Logged-Error')) {
        const sessionUser = await getSessionUser();
        logger.error(
          {
            module: 'ssr',
            event: 'SSR_500_RESPONSE',
            message: `Server returned ${response.status} status on ${pathname}`,
            path: pathname,
            method: request.method,
            statusCode: response.status,
            rayId,
            latencyMs,
            userId: sessionUser?.id,
            userEmail: sessionUser?.email,
            clientIp: clientMeta.ip,
            country: clientMeta.country,
            city: clientMeta.city,
            context: { spans: profiler.getSpans() },
          },
          { cfEnv, ctx: runtimeCtx }
        );
      }

      return response;
    } catch (err: any) {
      const latencyMs = Math.round((performance.now() - startTime) * 10) / 10;
      const sessionUser = await getSessionUser().catch(() => null);
      logger.error(
        {
          module: 'middleware',
          event: 'UNHANDLED_EXCEPTION',
          message: err?.message || 'Unhandled server exception',
          path: pathname,
          method: request.method,
          statusCode: 500,
          rayId,
          latencyMs,
          error: err,
          userId: sessionUser?.id,
          userEmail: sessionUser?.email,
          clientIp: clientMeta.ip,
          country: clientMeta.country,
          city: clientMeta.city,
          context: { spans: profiler.getSpans() },
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
              'Server-Timing': profiler.toServerTimingHeader(latencyMs),
              'Cache-Control': 'no-store, no-cache, must-revalidate',
            },
          }
        );
      }

      throw err;
    }
  });
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

  // 3. Bypass cache for APIs, Sanity Studio admin, private user routes (Orders, Account, Admin), and static asset chunks
  const isOrdersPath = pathname === '/orders' || pathname.startsWith('/orders/') || pathname.includes('/orders');
  const isAccountPath = pathname === '/account' || pathname.startsWith('/account/') || pathname.includes('/account');
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/') || pathname.includes('/admin');
  const isPrivateUserPath = isOrdersPath || isAccountPath || isAdminPath;

  if (
    isPrivateUserPath ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/studio') ||
    pathname.startsWith('/cdn-image/') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap-index.xml'
  ) {
    // Actively evict any stale cache entry for dynamic order/account/admin views
    if (isPrivateUserPath && typeof caches !== 'undefined' && (caches as any).default) {
      try {
        const canonicalUrl = new URL(pathname, url.origin);
        await (caches as any).default.delete(new Request(canonicalUrl.toString(), { method: 'GET' }));
      } catch {
        // non-blocking
      }
    }

    let response = await next();
    const isStaticAsset =
      pathname.startsWith('/_astro/') ||
      pathname.startsWith('/images/') ||
      pathname.startsWith('/cdn-image/') ||
      pathname === '/favicon.ico' ||
      pathname === '/favicon.svg' ||
      pathname.endsWith('.webp') ||
      pathname.endsWith('.png') ||
      pathname.endsWith('.jpg') ||
      pathname.endsWith('.svg');

    if (isPrivateUserPath && !isStaticAsset) {
      response = safeSetHeaders(response, {
        'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
        'Cloudflare-CDN-Cache-Control': 'no-store',
        'CDN-Cache-Control': 'no-store',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Edge-Cache': 'BYPASS',
      });
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
    const sysSettings = (context.locals as any)?.systemSettings || await getSystemSettings(cfEnv).catch(() => null);
    const configuredSecret = sysSettings?.revalidate_secret || getRuntimeEnv('REVALIDATE_SECRET', cfEnv) || getRuntimeEnv('SANITY_REVALIDATE_SECRET', cfEnv);
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
        let hitResponse = new Response(cachedResponse.body, cachedResponse);
        hitResponse = safeSetHeader(hitResponse, 'X-Edge-Cache', 'HIT');
        return hitResponse;
      }
    } catch (err) {
      logger.warn({ module: 'middleware', event: 'CACHE_READ_ERROR', message: 'Error reading cache', error: err });
    }
  }

  // 5. Cache MISS: Single-Flight Request Coalescing (collapses concurrent cache-miss bursts into 1 render)
  const canonicalKeyStr = canonicalUrl.toString();
  const existingRender = inFlightEdgeRenders.get(canonicalKeyStr);
  if (existingRender) {
    try {
      const coalescedRes = await existingRender;
      return coalescedRes.clone();
    } catch {
      // Fallback to normal execution if joined promise failed
    }
  }

  const renderPromise = (async (): Promise<Response> => {
    const response = await next();
    const contentType = response.headers.get('content-type') || '';

    // Cache successful or 404 HTML responses without module-level errors
    if (cache && (response.status === 200 || response.status === 404) && !response.headers.has('X-Section-Error') && contentType.includes('text/html')) {
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

        const cfCtx = (context.locals as any)?.cfContext;
        if (cfCtx?.waitUntil) {
          cfCtx.waitUntil(cache.put(cacheKey, responseToCache));
        } else {
          cache.put(cacheKey, responseToCache).catch((err: any) => {
            logger.warn({ module: 'middleware', event: 'ASYNC_CACHE_PUT_ERROR', message: 'Async cache put error', error: err });
          });
        }

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: edgeHeaders,
        });
      } catch (err) {
        logger.warn({ module: 'middleware', event: 'CACHE_WRITE_ERROR', message: 'Error writing cache', error: err });
      }
    }
    return response;
  })();

  inFlightEdgeRenders.set(canonicalKeyStr, renderPromise);
  try {
    const finalResponse = await renderPromise;
    return finalResponse.clone();
  } finally {
    inFlightEdgeRenders.delete(canonicalKeyStr);
  }
}

