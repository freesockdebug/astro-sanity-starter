// src/pages/cdn-image/[...path].ts
import type { APIRoute } from 'astro';
import { waitUntil as cfWaitUntil } from 'cloudflare:workers';

export const prerender = false;

/**
 * Cloudflare Edge Proxy & Cache for Sanity CDN Images
 * Features:
 * - L1 Edge Cache via Cloudflare Workers Cache API (caches.default, 2~5ms HIT)
 * - Format-aware cache keys (AVIF / WebP / JPEG) for auto=format content negotiation
 * - Subrequest edge caching via cf: { cacheEverything: true }
 * - Immutable 1-year browser and CDN cache headers
 */
export const GET: APIRoute = async ({ params, request, url }) => {
  const path = params.path;
  if (!path) {
    return new Response('Bad Request: Missing image path', { status: 400 });
  }

  // Security: prevent encoded path traversal, backslashes, or SSRF to non-Sanity destinations
  let decodedPath = path;
  try {
    decodedPath = decodeURIComponent(path);
  } catch {
    return new Response('Bad Request: Malformed image path encoding', { status: 400 });
  }

  const cleanPath = decodedPath.replace(/^\/+/, '');
  if (
    cleanPath.includes('..') ||
    cleanPath.includes('\\') ||
    cleanPath.startsWith('http://') ||
    cleanPath.startsWith('https://') ||
    !/^images\/[a-z0-9_-]+\/[a-z0-9_-]+\//i.test(cleanPath)
  ) {
    return new Response('Forbidden: Invalid Sanity image path', { status: 403 });
  }

  // Construct format-aware cache key so WebP and legacy clients don't cross-contaminate.
  // Note: Sanity CDN supports "jpg", "pjpg", "png", "webp", "gif" (does not support "avif").
  const acceptHeader = request.headers.get('Accept') || '';
  let formatVariant = 'orig';
  if (url.searchParams.get('auto')?.includes('format')) {
    if (acceptHeader.includes('image/webp') || acceptHeader.includes('image/avif')) {
      formatVariant = 'webp';
    }
  }

  const cache = typeof caches !== 'undefined' && (caches as any).default 
    ? (caches as any).default 
    : null;

  const cacheUrl = new URL(url.toString());
  if (formatVariant !== 'orig') {
    cacheUrl.searchParams.set('cf_fmt', formatVariant);
  }
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

  // Optional cache purge via ?purge=true or ?revalidate=true
  if (url.searchParams.has('purge') || url.searchParams.has('revalidate')) {
    if (cache) {
      await cache.delete(cacheKey).catch(() => {});
    }
  } else if (cache) {
    try {
      const cachedRes = await cache.match(cacheKey);
      if (cachedRes) {
        const hitRes = new Response(cachedRes.body, cachedRes);
        hitRes.headers.set('X-Edge-Cache', 'HIT');
        return hitRes;
      }
    } catch {
      // non-blocking on cache read error
    }
  }

  // Avoid Cloudflare subrequest cache poisoning by locking the upstream format (fm=webp)
  // instead of auto=format when client supports modern WebP encoding
  const targetParams = new URLSearchParams(url.searchParams);
  if (formatVariant === 'webp') {
    targetParams.delete('auto');
    targetParams.set('fm', 'webp');
  }
  const queryString = targetParams.toString();
  const targetUrl = `https://cdn.sanity.io/${cleanPath}${queryString ? `?${queryString}` : ''}`;

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'Accept': acceptHeader || 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0 (compatible; Cloudflare-Image-Proxy)'
      },
      cf: {
        cacheEverything: true,
        cacheTtl: 31536000
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!upstreamRes.ok) {
      return new Response(`Upstream Sanity Error: ${upstreamRes.statusText}`, { status: upstreamRes.status });
    }

    const contentType = (upstreamRes.headers.get('Content-Type') || 'image/jpeg').toLowerCase();
    if (!contentType.startsWith('image/')) {
      return new Response('Forbidden: Upstream asset is not a valid image resource', { status: 403 });
    }

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    headers.set('Vary', 'Accept');

    const contentLength = upstreamRes.headers.get('Content-Length');
    if (contentLength) headers.set('Content-Length', contentLength);

    const etag = upstreamRes.headers.get('ETag');
    if (etag) headers.set('ETag', etag);

    // 1-Year Immutable Edge Cache for Cloudflare and Browser
    headers.set('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    headers.set('Cloudflare-CDN-Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('CDN-Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('X-Edge-Cache', 'MISS');

    // Zero-Copy Streaming: split upstream stream for concurrent client delivery and background edge caching
    const [streamForClient, streamForCache] = upstreamRes.body ? upstreamRes.body.tee() : [null, null];

    if (cache && streamForCache) {
      const cacheResponse = new Response(streamForCache, {
        status: upstreamRes.status,
        headers
      });
      const cachePutPromise = cache.put(cacheKey, cacheResponse);
      try {
        cfWaitUntil(cachePutPromise);
      } catch {
        cachePutPromise.catch(() => {});
      }
    }

    return new Response(streamForClient || upstreamRes.body, {
      status: upstreamRes.status,
      headers
    });
  } catch (err: any) {
    return new Response(`Image Proxy Error: ${err?.message || 'Failed to fetch image'}`, { status: 502 });
  }
};
