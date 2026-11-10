// src/pages/api/revalidate.ts
import type { APIRoute } from 'astro';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';
import { SecurityService } from '@utils/security';
import { getRuntimeEnv } from '@utils/auth';
import { NON_DEFAULT_LOCALES } from '@i18n';
import { ProductService } from '@data/products';
import { PageService } from '@data/page';
import { SiteConfigService } from '@data/siteConfig';
import { RfqSettingsService } from '@data/rfqSettings';
import { kvGet, kvPut } from '@utils/kv';
import { getSystemSettings } from '@utils/db';

export const prerender = false;


/**
 * Normalise a relative path or absolute URL into canonical URL pairs (with & without trailing slash)
 */
const expandCanonicalUrls = (origin: string, pathOrUrl: string): string[] => {
  let pathname = pathOrUrl.trim();
  if (pathname.startsWith('http://') || pathname.startsWith('https://')) {
    try {
      const u = new URL(pathname);
      pathname = u.pathname;
    } catch {
      return [pathOrUrl];
    }
  }

  // Ensure leading slash
  if (!pathname.startsWith('/')) {
    pathname = `/${pathname}`;
  }

  if (pathname === '/') {
    return [`${origin}/`];
  }

  const clean = pathname.replace(/\/+$/, '');
  return [
    `${origin}${clean}`,
    `${origin}${clean}/`
  ];
};

/**
 * Reuse strict, trusted-origin CORS generator from SecurityService
 */
const getCorsHeaders = (request?: Request, currentUrl?: URL): Record<string, string> =>
  SecurityService.getCorsHeaders(
    request,
    currentUrl,
    'GET, POST, OPTIONS',
    'Content-Type, Authorization, X-Webhook-Secret, X-Revalidate-Secret, x-sanity-webhook-secret'
  );

/**
 * Handle CORS preflight requests
 */
export const OPTIONS: APIRoute = async ({ request, url }) => {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request, url),
  });
};

/**
 * On-Demand Cache Revalidation & Purge Endpoint
 * 
 * Supports:
 * 1. Sanity Webhooks on document create/update/delete
 * 2. Manual purge by path/urls via query parameter or JSON body
 * 
 * Purge Mechanics (Dual-Layer):
 * - Layer 1 (Worker Edge Cache): Instantly deletes entries from caches.default inside Cloudflare Worker
 * - Layer 2 (Cloudflare Global CDN): Calls Cloudflare Purge Cache REST API for global CDN POP invalidation
 */
export const POST: APIRoute = async (context) => {
  const { request, url } = context;
  const corsHeaders = getCorsHeaders(request, url);

  try {
    // 1. Parse payload first (to support body secret as well)
    let body: any = {};
    if (request.headers.get('content-type')?.includes('application/json')) {
      try {
        body = await request.json();
      } catch {
        // Fallback to empty body for empty POST
      }
    }

    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const providedSecret =
      request.headers.get('x-webhook-secret') ||
      request.headers.get('x-revalidate-secret') ||
      request.headers.get('x-sanity-webhook-secret') ||
      bearerToken ||
      url.searchParams.get('secret') ||
      url.searchParams.get('key') ||
      url.searchParams.get('token') ||
      body?.secret;

    const isDev = Boolean(import.meta.env?.DEV);
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    const systemSettings = await getSystemSettings(cfEnv).catch(() => null);
    const configuredSecret = systemSettings?.revalidate_secret || getRuntimeEnv('REVALIDATE_SECRET', cfEnv) || getRuntimeEnv('SANITY_REVALIDATE_SECRET', cfEnv);
    const expectedSecret = configuredSecret || (isDev || isLocalhost ? 'itsasecret' : '');

    // 2. Authenticate webhook request:
    // Strictly require matching secret via constant-time comparison in production
    const isAuthorized =
      (expectedSecret && providedSecret && SecurityService.timingSafeEqual(providedSecret, expectedSecret)) ||
      isDev ||
      isLocalhost;

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or missing revalidation secret' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        }
      });
    }

    const docType = body?._type;
    const docSlug = typeof body?.slug === 'string' ? body.slug : (body?.slug?.current || body?.currentSlug);
    const origin = url.origin;

    // 3. Determine target paths to purge
    const targetPaths = new Set<string>();

    // A. Manual paths passed in query: ?path=/about or ?paths=/about,/products
    const queryPath = url.searchParams.get('path');
    if (queryPath) targetPaths.add(queryPath);
    const queryPaths = url.searchParams.get('paths');
    if (queryPaths) {
      queryPaths.split(',').map(p => p.trim()).filter(Boolean).forEach(p => targetPaths.add(p));
    }

    // B. Manual paths passed in JSON body: { "path": "/about" } or { "paths": ["/about"] }
    if (body?.path) targetPaths.add(body.path);
    if (Array.isArray(body?.paths)) {
      body.paths.forEach((p: any) => typeof p === 'string' && targetPaths.add(p));
    }
    if (Array.isArray(body?.urls)) {
      body.urls.forEach((u: any) => typeof u === 'string' && targetPaths.add(u));
    }

    // C. Intelligent mapping based on Sanity Document Type
    if (docType) {
      switch (docType) {
        case 'product':
          targetPaths.add('/');
          targetPaths.add('/products');
          if (docSlug) {
            targetPaths.add(`/products/${docSlug}`);
          }
          break;

        case 'category':
        case 'catalogSettings':
          targetPaths.add('/');
          targetPaths.add('/products');
          break;

        case 'page':
          if (!docSlug || docSlug === '/' || docSlug === 'home' || docSlug === 'index') {
            targetPaths.add('/');
          } else {
            targetPaths.add(`/${docSlug.replace(/^\//, '')}`);
          }
          break;

        case 'siteConfig':
        case 'rfqSettings':
        case 'footer':
        case 'header':
          // Global site chrome changes affect all main landing pages
          targetPaths.add('/');
          targetPaths.add('/products');
          targetPaths.add('/about');
          targetPaths.add('/private-label');
          targetPaths.add('/contact');
          break;

        default:
          // Unspecified document type: flush primary landing pages
          targetPaths.add('/');
          targetPaths.add('/products');
          break;
      }
    } else if (targetPaths.size === 0) {
      // Default fallback if no specific doc or path was provided
      targetPaths.add('/');
      targetPaths.add('/products');
    }

    // Expand all collected target paths to include both with & without trailing slash,
    // and automatically expand across all non-default supported locales derived from SSOT
    const supportedLocales = NON_DEFAULT_LOCALES;
    const allPathsWithLocales = new Set<string>();

    for (const p of targetPaths) {
      const cleanPath = p.startsWith('/') ? p : `/${p}`;
      allPathsWithLocales.add(cleanPath);

      // Expand to locale prefixes unless already localized
      const startsWithLocale = supportedLocales.some((l) => cleanPath.startsWith(`/${l}/`) || cleanPath === `/${l}`);
      if (!startsWithLocale) {
        for (const loc of supportedLocales) {
          const localized = cleanPath === '/' ? `/${loc}` : `/${loc}${cleanPath}`;
          allPathsWithLocales.add(localized);
        }
      }
    }

    const targetOrigins = new Set<string>([origin]);

    const urlsToPurge: string[] = [];
    const urlSet = new Set<string>();

    for (const p of allPathsWithLocales) {
      for (const org of targetOrigins) {
        const expanded = expandCanonicalUrls(org, p);
        for (const u of expanded) {
          if (!urlSet.has(u)) {
            urlSet.add(u);
            urlsToPurge.push(u);
          }
        }
      }
    }

    // 4. LAYER 1: Immediate purge inside Cloudflare Worker Cache (caches.default)
    let workerPurgedCount = 0;
    const workerCache = typeof caches !== 'undefined' && (caches as any).default 
      ? (caches as any).default 
      : null;

    if (workerCache) {
      const deleteResults = await Promise.allSettled(
        urlsToPurge.map((targetUrl) =>
          workerCache.delete(new Request(targetUrl, { method: 'GET' }))
        )
      );
      for (const res of deleteResults) {
        if (res.status === 'fulfilled' && res.value) {
          workerPurgedCount++;
        }
      }
    }

    // Write-Through CMS KV + L1 sync based on webhook docType (falls back to full core refresh)
    const refreshTasks: Promise<any>[] = [];
    switch (docType) {
      case 'product':
        refreshTasks.push(ProductService.refreshAll(cfEnv));
        if (docSlug) refreshTasks.push(ProductService.refreshSlug(docSlug, cfEnv));
        break;
      case 'category':
        refreshTasks.push(ProductService.refreshAll(cfEnv));
        break;
      case 'catalogSettings':
        refreshTasks.push(ProductService.getCatalogSettings(true, cfEnv));
        break;
      case 'productStorySettings':
        refreshTasks.push(ProductService.getProductStorySettings(true, cfEnv));
        break;
      case 'page':
        if (docSlug) {
          refreshTasks.push(PageService.refreshSlug(docSlug, cfEnv));
        } else {
          refreshTasks.push(PageService.getHomePage(true, cfEnv));
        }
        break;
      case 'siteConfig':
      case 'header':
      case 'footer':
        refreshTasks.push(SiteConfigService.getConfig(true));
        break;
      case 'rfqSettings':
        refreshTasks.push(RfqSettingsService.getSettings(true));
        break;
      default:
        refreshTasks.push(
          SiteConfigService.getConfig(true),
          RfqSettingsService.getSettings(true),
          ProductService.refreshAll(cfEnv),
          ProductService.getCatalogSettings(true, cfEnv),
          ProductService.getProductStorySettings(true, cfEnv),
          PageService.getHomePage(true, cfEnv)
        );
        break;
    }
    await Promise.allSettled(refreshTasks);

    // 5. LAYER 2: Cloudflare Global CDN Zone Cache Purge API
    let cfZoneId = (systemSettings?.cloudflare_zone_id || getRuntimeEnv('CLOUDFLARE_ZONE_ID', cfEnv))?.trim();
    const rawCfToken = systemSettings?.cloudflare_api_token || getRuntimeEnv('CLOUDFLARE_API_TOKEN', cfEnv);
    const cfApiToken = rawCfToken?.trim();
    let cfPurged = false;
    let cfMessage = 'Skipped (credentials not set in environment)';
    let cfDiagnostics: any = undefined;

    const isDebug = url.searchParams.has('debug') || url.searchParams.has('diagnose');

    if (cfApiToken) {
      try {
        // Only run verbose diagnostic probes when explicitly requested via ?debug=1
        if (isDebug) {
          let tokenVerifyData: any = null;
          try {
            const verifyRes = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
              headers: {
                'Authorization': `Bearer ${cfApiToken}`,
                'Content-Type': 'application/json'
              },
              signal: AbortSignal.timeout(6000)
            });
            tokenVerifyData = await verifyRes.json();

            const zonesProbe = await fetch('https://api.cloudflare.com/client/v4/zones?per_page=5', {
              headers: {
                'Authorization': `Bearer ${cfApiToken}`,
                'Content-Type': 'application/json'
              },
              signal: AbortSignal.timeout(6000)
            });
            const zonesData: any = await zonesProbe.json();
            tokenVerifyData.accessibleZones = zonesData?.result?.map((z: any) => ({ id: z.id, name: z.name })) || zonesData?.errors;
          } catch (e: any) {
            tokenVerifyData = { error: e?.message };
          }

          cfDiagnostics = {
            zoneIdProvided: Boolean(cfZoneId),
            zoneIdMasked: cfZoneId ? `${cfZoneId.slice(0, 4)}...${cfZoneId.slice(-4)}` : null,
            tokenLength: cfApiToken.length,
            tokenMasked: `${cfApiToken.slice(0, 3)}...${cfApiToken.slice(-3)}`,
            tokenVerification: tokenVerifyData
          };
        }

        // Auto-discover Zone ID if not explicitly specified (with 7-day Edge KV cache)
        if (!cfZoneId && !url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1')) {
          const domainParts = url.hostname.split('.');
          const rootDomain = domainParts.length >= 2 ? domainParts.slice(-2).join('.') : url.hostname;
          const zoneKey = `cf:zone_id:${rootDomain}`;

          cfZoneId = await kvGet<string>(zoneKey, cfEnv);

          if (!cfZoneId) {
            const zoneRes = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${rootDomain}`, {
              headers: {
                'Authorization': `Bearer ${cfApiToken}`,
                'Content-Type': 'application/json'
              },
              signal: AbortSignal.timeout(6000)
            });
            
            if (zoneRes.ok) {
              const zoneData: any = await zoneRes.json();
              if (zoneData?.result?.[0]?.id) {
                cfZoneId = zoneData.result[0].id;
                await kvPut(zoneKey, cfZoneId, { expirationTtl: 604800 }, cfEnv).catch(() => {});
              }
            }
          }
        }

        if (cfZoneId) {
          // Cloudflare purge_cache supports up to 30 files per request
          const chunks: string[][] = [];
          for (let i = 0; i < urlsToPurge.length; i += 30) {
            chunks.push(urlsToPurge.slice(i, i + 30));
          }

          let allSuccessful = true;
          for (const chunk of chunks) {
            const cfRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${cfZoneId}/purge_cache`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${cfApiToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ files: chunk }),
              signal: AbortSignal.timeout(6000)
            });

            const cfData: any = await cfRes.json();
            if (!cfData?.success) {
              allSuccessful = false;
              cfMessage = JSON.stringify(cfData?.errors || 'Purge API responded with failure');
              break;
            }
          }

          if (allSuccessful) {
            cfPurged = true;
            cfMessage = `Successfully purged ${urlsToPurge.length} URLs from Cloudflare Global CDN`;
          }
        } else {
          cfMessage = 'Cloudflare API Token found, but Zone ID could not be identified automatically';
        }
      } catch (err: any) {
        cfMessage = `Cloudflare purge failed: ${err?.message || 'Network error'}`;
      }
    }

    // Default clean & minimal response
    const responsePayload: Record<string, any> = {
      success: true,
      purgedUrls: urlsToPurge,
      edgeCachePurged: workerPurgedCount > 0 || Boolean(workerCache),
      cdnPurged: cfPurged
    };

    // Attach extended debug metadata only if ?debug=1 is explicitly passed
    if (isDebug) {
      responsePayload.documentType = docType || 'custom';
      responsePayload.slug = docSlug || null;
      responsePayload.workerEntriesPurged = workerPurgedCount;
      responsePayload.cloudflareStatus = cfMessage;
      responsePayload.diagnostics = cfDiagnostics;
      responsePayload.timestamp = new Date().toISOString();
    }

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      }
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Internal server error' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        }
      }
    );
  }
};

// Also support GET for simple manual verification: /api/revalidate?path=/about
export const GET: APIRoute = async (context) => {
  return POST(context);
};
