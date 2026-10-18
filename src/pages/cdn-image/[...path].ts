// src/pages/cdn-image/[...path].ts
import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Cloudflare Edge Proxy for Sanity CDN Images
 * Features:
 * - Transparent streaming proxy to cdn.sanity.io
 * - Immutable 1-year Cloudflare Edge Cache headers (max-age=31536000)
 * - Drastically eliminates Sanity bandwidth and transformation quota consumption
 */
export const GET: APIRoute = async ({ params, request, url }) => {
  const path = params.path;
  if (!path) {
    return new Response('Bad Request: Missing image path', { status: 400 });
  }

  // Security: prevent path traversal or SSRF to non-Sanity destinations
  const cleanPath = path.replace(/^\/+/, '');
  if (cleanPath.includes('..') || cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
    return new Response('Forbidden: Invalid image path', { status: 403 });
  }

  const targetUrl = `https://cdn.sanity.io/${cleanPath}${url.search}`;

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'Accept': request.headers.get('Accept') || 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0 (compatible; Cloudflare-Image-Proxy)'
      }
    });

    if (!upstreamRes.ok) {
      return new Response(`Upstream Sanity Error: ${upstreamRes.statusText}`, { status: upstreamRes.status });
    }

    const headers = new Headers();
    const contentType = upstreamRes.headers.get('Content-Type') || 'image/jpeg';
    headers.set('Content-Type', contentType);

    const contentLength = upstreamRes.headers.get('Content-Length');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    const etag = upstreamRes.headers.get('ETag');
    if (etag) {
      headers.set('ETag', etag);
    }

    // 1-Year Immutable Edge Cache for Cloudflare and Browser
    headers.set('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    headers.set('Cloudflare-CDN-Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('CDN-Cache-Control', 'public, max-age=31536000, immutable');

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers
    });
  } catch (err: any) {
    return new Response(`Image Proxy Error: ${err?.message || 'Failed to fetch image'}`, { status: 502 });
  }
};
