// src/pages/api/revalidate.ts
import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Universal environment variable accessor safe for Cloudflare Worker runtime
 */
const getEnv = (key: string, context?: any): string | undefined => {
  return (
    context?.locals?.runtime?.env?.[key] ||
    (context?.locals as any)?.env?.[key] ||
    (typeof process !== 'undefined' && process.env?.[key]) ||
    (import.meta.env && (import.meta.env as any)[key])
  );
};

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

  try {
    const expectedSecret = getEnv('REVALIDATE_SECRET', context) || getEnv('SANITY_REVALIDATE_SECRET', context);
    const providedSecret = request.headers.get('x-webhook-secret') || url.searchParams.get('secret');

    // 1. Authenticate webhook request if secret is configured
    if (expectedSecret && providedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid revalidation secret' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Parse payload (Sanity webhook, custom JSON, or manual trigger)
    let body: any = {};
    if (request.headers.get('content-type')?.includes('application/json')) {
      try {
        body = await request.json();
      } catch {
        // Fallback to empty body for empty POST
      }
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

    // Expand all collected target paths to include both with & without trailing slash
    const urlsToPurge: string[] = [];
    const urlSet = new Set<string>();

    for (const p of targetPaths) {
      const expanded = expandCanonicalUrls(origin, p);
      for (const u of expanded) {
        if (!urlSet.has(u)) {
          urlSet.add(u);
          urlsToPurge.push(u);
        }
      }
    }

    // 4. LAYER 1: Immediate purge inside Cloudflare Worker Cache (caches.default)
    let workerPurgedCount = 0;
    const workerCache = typeof caches !== 'undefined' && (caches as any).default 
      ? (caches as any).default 
      : null;

    if (workerCache) {
      for (const targetUrl of urlsToPurge) {
        try {
          const req = new Request(targetUrl, { method: 'GET' });
          const deleted = await workerCache.delete(req);
          if (deleted) {
            workerPurgedCount++;
          }
        } catch (e) {
          console.warn('[Revalidate] Worker cache delete error for', targetUrl, e);
        }
      }
    }

    // 5. LAYER 2: Cloudflare Global CDN Zone Cache Purge API
    let cfZoneId = getEnv('CLOUDFLARE_ZONE_ID', context);
    const cfApiToken = getEnv('CLOUDFLARE_API_TOKEN', context);
    let cfPurged = false;
    let cfMessage = 'Skipped (credentials not set in environment)';

    if (cfApiToken) {
      try {
        // Auto-discover Zone ID if not explicitly specified
        if (!cfZoneId && !url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1')) {
          const domainParts = url.hostname.split('.');
          const rootDomain = domainParts.length >= 2 ? domainParts.slice(-2).join('.') : url.hostname;
          
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

    return new Response(
      JSON.stringify({
        success: true,
        revalidated: true,
        documentType: docType || 'custom',
        slug: docSlug || null,
        purgedUrls: urlsToPurge,
        workerEdgeCache: {
          available: Boolean(workerCache),
          purgedEntries: workerPurgedCount
        },
        cloudflareCdn: {
          executed: Boolean(cfApiToken && cfZoneId),
          success: cfPurged,
          status: cfMessage
        },
        timestamp: new Date().toISOString()
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Internal server error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};

// Also support GET for simple manual verification: /api/revalidate?path=/about
export const GET: APIRoute = async (context) => {
  return POST(context);
};
