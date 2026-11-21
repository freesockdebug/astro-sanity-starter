// src/middleware.ts
import { defineMiddleware } from 'astro:middleware';
import { env as cfEnv } from 'cloudflare:workers';
import { SiteConfigService } from '@data/siteConfig';
import { NON_DEFAULT_LOCALES } from '@i18n';
import { getRouteRevisions, resolvePathRevision, preloadEdgeIsolate } from './utils/cmsSync';
import { SESSION_COOKIE_NAME, checkIsAdmin, getCookieValue, getRuntimeEnv, verifySessionToken } from './utils/auth';
import { resolveAdminContext } from './utils/rbac';
import { SecurityService } from './utils/security';
import { logger, syncWafBlockStats } from './utils/logger';
import { RequestProfiler, requestProfilerStorage } from './utils/profiler';
import { getSystemSettings } from './db/settings.repo';
import { upsertWafIpAcl } from './db/waf.repo';
import { runInBackground, recordEdgeHtmlCacheResult, recordUrlCacheStats } from './utils/cache';
import { EdgeWafService, normalizeWafRuleConfig } from './utils/waf';

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
let isolateId = '';
function getIsolateId(): string {
  if (!isolateId) {
    isolateId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);
  }
  return isolateId;
}

/**
 * Cloudflare Edge Cache Middleware for HTML Pages with Observability & Slow-Request Diagnostics
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;
  const pathname = url.pathname;
  const safeQuery = sanitizeQuery(url.search);
  const fullPath = `${pathname}${safeQuery}`.slice(0, 500);


  const startTime = performance.now();
  const profiler = new RequestProfiler();
  (context.locals as any).requestStartTime = startTime;
  (context.locals as any).profiler = profiler;

  return await requestProfilerStorage.run(profiler, async () => {
    try {
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

    if (!EdgeWafService.isStaticAsset(pathname)) {
      const { routeRevisions, wafSettings, wafRuntime, preloadStatus } = await preloadEdgeIsolate(cfEnv, false);
      (context.locals as any).preloadStatus = preloadStatus;
      if (routeRevisions && request.method === 'GET') {
        (context.locals as any).routeRevisions = routeRevisions;
      }
      if (wafSettings) {
        (context.locals as any).systemSettings = wafSettings;
      }

      let isAuthenticatedAdmin = false;
      if (sessionToken || (context.locals as any)?.sessionUser || (context.locals as any)?.user) {
        const sessionUser = await getSessionUser().catch(() => null);
        if (sessionUser) {
          isAuthenticatedAdmin = Boolean(
            sessionUser.isAdmin ||
            checkIsAdmin(sessionUser.email, sessionUser.roles || [], cfEnv, wafSettings?.co_admin_emails)
          );
          if (!isAuthenticatedAdmin && (pathname.startsWith('/admin') || pathname.startsWith('/api/admin'))) {
            const adminCtx = await resolveAdminContext(sessionUser.email, cfEnv, wafSettings?.co_admin_emails).catch(() => null);
            isAuthenticatedAdmin = Boolean(adminCtx);
          }
        }
      }

      const wafRuleCfg = normalizeWafRuleConfig(wafSettings?.waf_rule_config);
      const wafResult = EdgeWafService.evaluate(
        {
          clientIp: clientMeta.ip,
          pathname,
          search: url.search,
          method: request.method,
          country: clientMeta.country,
          headers: request.headers,
          isAuthenticatedAdmin,
        },
        wafSettings,
        wafRuntime
      );

      if (!wafResult.allowed) {
        const blockStatus = wafResult.status || 403;
        const stats = wafResult.blockStats;
        const lastBlockedAt = new Date().toISOString();
        if (wafResult.autoBanned && !wafResult.autoBanPersisted && !wafResult.suppressLog && clientMeta.ip) {
          const banPromise = upsertWafIpAcl(
            {
              ip_cidr: clientMeta.ip,
              list_type: 'AUTO_BAN',
              reason: wafResult.reason || 'Triggered Edge Auto-Ban',
              ttlMinutes: wafRuleCfg.malicious.banDurationMinutes,
            },
            'edge_autoban',
            cfEnv
          );
          if (runtimeCtx && typeof runtimeCtx.waitUntil === 'function') {
            runtimeCtx.waitUntil(banPromise.catch(() => {}));
          } else {
            runInBackground(banPromise);
          }
        }
        if (!wafResult.suppressLog) {
          logger.warn(
            {
              module: 'EDGE_WAF',
              event: wafResult.code || 'WAF_BLOCK',
              message: wafResult.reason || 'Request blocked by Edge WAF',
              path: fullPath,
              method: request.method,
              statusCode: blockStatus,
              rayId,
              clientIp: clientMeta.ip,
              country: clientMeta.country,
              city: clientMeta.city,
              context: {
                mode: wafResult.mode,
                ruleId: wafResult.ruleId,
                matchedSample: wafResult.matchedSample,
                userAgent: request.headers.get('user-agent') || '',
                autoBanned: Boolean(wafResult.autoBanned),
                hitCount: stats?.hitCount ?? 1,
                lastBlockedAt,
              },
            },
            { cfEnv, ctx: runtimeCtx }
          );
        } else if (stats) {
          syncWafBlockStats(
            {
              clientIp: clientMeta.ip,
              errorCode: wafResult.code || 'WAF_BLOCK',
              hitCount: stats.hitCount,
              hitDelta: 1,
              lastBlockedAt,
            },
            { cfEnv, ctx: runtimeCtx }
          );
        }

        if (blockStatus === 404) {
          const legacy404Ttl = typeof wafSettings?.waf_legacy_404_ttl_sec === 'number'
            ? Math.max(0, wafSettings.waf_legacy_404_ttl_sec)
            : 3600;
          return new Response('Not Found', {
            status: 404,
            statusText: 'Not Found',
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Cache-Control': legacy404Ttl > 0
                ? `public, max-age=${legacy404Ttl}, s-maxage=${legacy404Ttl}`
                : 'no-store, no-cache, must-revalidate',
              'X-Request-Id': rayId,
              'X-Edge-WAF': 'FAST-404',
              'X-Robots-Tag': 'noindex, nofollow',
            },
          });
        }

        const blockHeaders: Record<string, string> = {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'X-Request-Id': rayId,
          'X-Edge-WAF': 'BLOCK',
          'X-Robots-Tag': 'noindex, nofollow',
        };
        if (wafResult.retryAfter) {
          blockHeaders['Retry-After'] = String(wafResult.retryAfter);
        }

        return new Response(
          JSON.stringify({
            error: wafResult.reason || 'Forbidden',
            code: wafResult.code,
            requestId: rayId,
          }),
          { status: blockStatus, headers: blockHeaders }
        );
      }

      if (wafResult.shadowMatch) {
        const shadowEvent = `WAF_SHADOW_${wafResult.shadowMatch.ruleId}`.slice(0, 50);
        const shadowAt = new Date().toISOString();
        if (!wafResult.shadowMatch.suppressLog) {
          logger.warn(
            {
              module: 'EDGE_WAF',
              event: shadowEvent,
              message: wafResult.shadowMatch.reason,
              path: fullPath,
              method: request.method,
              statusCode: 200,
              rayId,
              clientIp: clientMeta.ip,
              country: clientMeta.country,
              city: clientMeta.city,
              context: {
                shadow: true,
                mode: wafResult.shadowMatch.mode,
                ruleId: wafResult.shadowMatch.ruleId,
                matchedSample: wafResult.shadowMatch.matchedSample,
                userAgent: request.headers.get('user-agent') || '',
                hitCount: wafResult.shadowMatch.hitCount ?? 1,
                lastBlockedAt: shadowAt,
              },
            },
            { cfEnv, ctx: runtimeCtx }
          );
        } else {
          syncWafBlockStats(
            {
              clientIp: clientMeta.ip,
              errorCode: shadowEvent,
              hitCount: wafResult.shadowMatch.hitCount ?? 1,
              hitDelta: 1,
              lastBlockedAt: shadowAt,
            },
            { cfEnv, ctx: runtimeCtx }
          );
        }
      }

      const probeEnabled = wafRuntime
        ? Boolean(wafRuntime.rules.find((r) => r.id === 'sys_probe_paths')?.isEnabled)
        : wafRuleCfg.malicious.enableProbePaths;
      if (!isAuthenticatedAdmin && probeEnabled && EdgeWafService.isBlockedProbePath(pathname)) {
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
    }

    try {
      let response = await handleRequest(context, next, pathname, url, request);
      const latencyMs = Math.round((performance.now() - startTime) * 10) / 10;

      const perfSpans = profiler.getSpans();
      const perfSpansHeader = `kv=${perfSpans.kv ?? 0},d1=${perfSpans.d1 ?? 0},sanity=${perfSpans.sanity ?? 0},total=${latencyMs}`;
      const preloadStatusHeader = String((context.locals as any)?.preloadStatus || 'BYPASS');
      const colo = (request as any)?.cf?.colo ? String((request as any).cf.colo) : '';
      const edgeCache = response.headers.get('X-Edge-Cache') || '';
      const currentIsolateId = getIsolateId();

      // Inject Server-Timing, X-Response-Time & Preload Diagnostic headers
      response = safeSetHeaders(response, {
        'X-Request-Id': rayId,
        'X-Response-Time': `${latencyMs}ms`,
        'X-Preload-Status': preloadStatusHeader,
        'X-Edge-Node': colo ? `${colo}:${currentIsolateId}` : currentIsolateId,
        'X-Perf-Spans': perfSpansHeader,
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

      if (!isStaticOrLogSelf && !(context.locals as any)?._apiPerfLogged) {
        const settings = (context.locals as any)?.systemSettings || await getSystemSettings(cfEnv).catch(() => null);
        const slowThreshold = settings?.slow_request_threshold_ms || 1000;
        const spans = perfSpans;

        if (latencyMs >= slowThreshold) {
          const sessionUser = await getSessionUser();
          logger.warn(
            {
              module: 'api/perf',
              event: 'SLOW_REQUEST',
              message: `Slow request detected (${latencyMs}ms >= ${slowThreshold}ms)`,
              path: fullPath,
              method: request.method,
              statusCode: response.status,
              rayId,
              latencyMs,
              userId: sessionUser?.id,
              userEmail: sessionUser?.email,
              clientIp: clientMeta.ip,
              country: clientMeta.country,
              city: clientMeta.city,
              context: {
                spans,
                query: safeQuery,
                ...(colo ? { colo } : {}),
                isolateId: currentIsolateId,
                ...(edgeCache ? { edgeCache } : {}),
              },
            },
            { cfEnv, ctx: runtimeCtx }
          );
        } else if (settings && (settings.log_min_level === 'info' || settings.log_min_level === 'debug')) {
          const sessionUser = await getSessionUser();
          logger.info(
            {
              module: 'api/perf',
              event: 'REQUEST_COMPLETED',
              message: `${request.method} ${fullPath} (${response.status}) in ${latencyMs}ms`,
              path: fullPath,
              method: request.method,
              statusCode: response.status,
              rayId,
              latencyMs,
              userId: sessionUser?.id,
              userEmail: sessionUser?.email,
              clientIp: clientMeta.ip,
              country: clientMeta.country,
              city: clientMeta.city,
              context: {
                spans,
                query: safeQuery,
                ...(colo ? { colo } : {}),
                isolateId: currentIsolateId,
                ...(edgeCache ? { edgeCache } : {}),
              },
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
            message: `Server returned ${response.status} status on ${fullPath}`,
            path: fullPath,
            method: request.method,
            statusCode: response.status,
            rayId,
            latencyMs,
            userId: sessionUser?.id,
            userEmail: sessionUser?.email,
            clientIp: clientMeta.ip,
            country: clientMeta.country,
            city: clientMeta.city,
            context: {
              spans: profiler.getSpans(),
              ...(colo ? { colo } : {}),
              isolateId: getIsolateId(),
              ...(edgeCache ? { edgeCache } : {}),
            },
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
          path: fullPath,
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
    } finally {
      const urlStatsEnabled = (context.locals as any)?.systemSettings?.enable_url_cache_stats ?? true;
      if (urlStatsEnabled && !EdgeWafService.isStaticAsset(pathname)) {
        recordUrlCacheStats(pathname, profiler.getCacheTiers());
      }
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
  const isOrdersPath = /^\/(?:(?:en|de|fr|es)\/)?orders(?:\/|$)/.test(pathname);
  const isAccountPath = /^\/(?:(?:en|de|fr|es)\/)?account(?:\/|$)/.test(pathname);
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');
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

  if (isAuthorizedPurge) {
    const refreshed = await preloadEdgeIsolate(cfEnv, true).catch(() => null);
    if (refreshed) {
      (context.locals as any).preloadStatus = refreshed.preloadStatus;
      if (refreshed.routeRevisions) (context.locals as any).routeRevisions = refreshed.routeRevisions;
      if (refreshed.wafSettings) (context.locals as any).systemSettings = refreshed.wafSettings;
    }
  }

  // Resolve versioned cache key using (potentially refreshed) routeRevisions
  const revs = (context.locals as any)?.routeRevisions ?? (await getRouteRevisions(cfEnv).catch(() => ({})));
  const pathRev = resolvePathRevision(pathname, revs, NON_DEFAULT_LOCALES);

  const canonicalUrl = new URL(pathname, url.origin);
  if (pathRev > 0) {
    canonicalUrl.searchParams.set('__rev', String(pathRev));
  }
  const cacheKey = new Request(canonicalUrl.toString(), {
    method: 'GET',
  });

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
        recordEdgeHtmlCacheResult('HIT', pathname);
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
        const sysSettings = (context.locals as any)?.systemSettings;
        const siteConfig = await SiteConfigService.getConfig();
        const edgeTtl = typeof sysSettings?.edge_html_cache_ttl_sec === 'number' && sysSettings.edge_html_cache_ttl_sec >= 0
          ? sysSettings.edge_html_cache_ttl_sec
          : typeof siteConfig?.edgeCacheTtl === 'number' && siteConfig.edgeCacheTtl >= 0
            ? siteConfig.edgeCacheTtl
            : 300;

        const is404 = response.status === 404;
        const configured404Ttl = typeof sysSettings?.edge_404_cache_ttl_sec === 'number' && sysSettings.edge_404_cache_ttl_sec >= 0
          ? sysSettings.edge_404_cache_ttl_sec
          : 300;
        const effectiveTtl = is404 ? configured404Ttl : edgeTtl;
        if (effectiveTtl === 0) {
          recordEdgeHtmlCacheResult('BYPASS', pathname);
          const bypassHeaders = new Headers(response.headers);
          bypassHeaders.set('Cache-Control', 'public, max-age=0, no-cache, no-store, must-revalidate');
          bypassHeaders.set('X-Edge-Cache', 'BYPASS');
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: bypassHeaders,
          });
        }

        const swr = is404 ? Math.max(effectiveTtl * 2, 600) : Math.max(edgeTtl * 10, 3600);
        const cloned = response.clone();
        const edgeHeaders = new Headers(cloned.headers);

        edgeHeaders.set('Cache-Control', `public, max-age=0, s-maxage=${effectiveTtl}, stale-while-revalidate=${swr}`);
        edgeHeaders.delete('Cloudflare-CDN-Cache-Control');
        edgeHeaders.delete('CDN-Cache-Control');
        edgeHeaders.set('X-Edge-Cache', 'MISS');
        if (is404) {
          edgeHeaders.set('X-Edge-Cache-Status', '404-NEGATIVE');
        }
        recordEdgeHtmlCacheResult('MISS', pathname);

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

