// src/pages/api/revalidate.ts
// On-Demand Cache Revalidation & Edge Purge Endpoint
import type { APIRoute } from 'astro';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';
import { SecurityService } from '@utils/security';
import { getRuntimeEnv } from '@utils/auth';
import { getSystemSettings } from '@utils/db';
import { syncCmsMutation, verifySanitySignature } from '@utils/cmsSync';

export const prerender = false;

/**
 * Trusted-origin CORS headers
 */
const getCorsHeaders = (request?: Request, currentUrl?: URL): Record<string, string> =>
  SecurityService.getCorsHeaders(
    request,
    currentUrl,
    'GET, POST, OPTIONS',
    'Content-Type, Authorization, X-Webhook-Secret, X-Revalidate-Secret, x-sanity-webhook-secret, sanity-webhook-signature'
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
 * 1. Sanity Webhooks with official HMAC-SHA256 signature (`sanity-webhook-signature`) or secret header
 * 2. Admin or manual purge by path/urls via query parameter or JSON body
 * 
 * Purge Mechanics (Dual-Layer):
 * - Layer 1 (Worker Edge Cache): Instantly deletes entries from caches.default inside Cloudflare Worker
 * - Layer 2 (Cloudflare Global CDN): Calls Cloudflare Purge Cache REST API for global CDN POP invalidation
 */
export const POST: APIRoute = async (context) => {
  const { request, url } = context;
  const corsHeaders = getCorsHeaders(request, url);

  try {
    // 1. Read raw text body for signature verification before parsing JSON
    const rawBody = await request.text().catch(() => '');
    let body: any = {};
    if (rawBody.trim()) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        // Fallback for non-JSON or plain text bodies
      }
    }

    // 2. Resolve configured secret from database settings or environment
    const isDev = Boolean(import.meta.env?.DEV);
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    const systemSettings = await getSystemSettings(cfEnv).catch(() => null);
    const configuredSecret =
      systemSettings?.revalidate_secret ||
      getRuntimeEnv('REVALIDATE_SECRET', cfEnv) ||
      getRuntimeEnv('SANITY_REVALIDATE_SECRET', cfEnv);
    const expectedSecret = configuredSecret || (isDev || isLocalhost ? 'itsasecret' : '');

    // 3. Authenticate webhook request:
    // Option A: Sanity official HMAC signature (sanity-webhook-signature)
    const sanitySignatureHeader =
      request.headers.get('sanity-webhook-signature') ||
      request.headers.get('x-sanity-signature');

    let isAuthorized = false;

    if (sanitySignatureHeader && expectedSecret) {
      isAuthorized = await verifySanitySignature(rawBody, sanitySignatureHeader, expectedSecret);
    }

    // Option B: Plaintext secret comparison (Bearer, x-webhook-secret, query param, body.secret)
    if (!isAuthorized) {
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

      isAuthorized =
        (Boolean(expectedSecret && providedSecret) && SecurityService.timingSafeEqual(providedSecret, expectedSecret)) ||
        isDev ||
        isLocalhost;
    }

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or missing revalidation secret or signature' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    // 4. Extract document properties and paths
    const docType = body?._type || body?.documentType;
    const docSlug = typeof body?.slug === 'string' ? body.slug : (body?.slug?.current || body?.currentSlug);
    const oldSlug =
      typeof body?.oldSlug === 'string'
        ? body.oldSlug
        : (body?.oldSlug?.current || body?.previousSlug || body?.before?.slug?.current);
    const operation = body?.operation || body?.transition || body?.action || (docType && body?._id ? 'update' : undefined);

    const targetPaths = new Set<string>();

    // Query parameters
    const queryPath = url.searchParams.get('path');
    if (queryPath) targetPaths.add(queryPath);
    const queryPaths = url.searchParams.get('paths');
    if (queryPaths) {
      queryPaths.split(',').map((p) => p.trim()).filter(Boolean).forEach((p) => targetPaths.add(p));
    }

    // Body paths
    if (body?.path) targetPaths.add(body.path);
    if (Array.isArray(body?.paths)) {
      body.paths.forEach((p: any) => typeof p === 'string' && targetPaths.add(p));
    }
    if (Array.isArray(body?.urls)) {
      body.urls.forEach((u: any) => typeof u === 'string' && targetPaths.add(u));
    }

    const isDebug = url.searchParams.has('debug') || url.searchParams.has('diagnose');

    // 5. Synchronize KV & Edge HTML Cache
    const syncResult = await syncCmsMutation({
      docType,
      slug: docSlug,
      oldSlug,
      operation,
      targetPaths,
      origin: url.origin,
      cfEnv,
      isDebug,
    });

    const responsePayload: Record<string, any> = {
      success: true,
      purgedUrls: syncResult.urlsToPurge,
      edgeCachePurged: syncResult.edgeCachePurged,
      cdnPurged: syncResult.cdnPurged,
    };

    if (isDebug) {
      responsePayload.documentType = docType || 'custom';
      responsePayload.slug = docSlug || null;
      responsePayload.oldSlug = oldSlug || null;
      responsePayload.operation = syncResult.operation;
      responsePayload.refreshedTasks = syncResult.refreshedTasks;
      responsePayload.workerEntriesPurged = syncResult.workerEntriesPurged;
      responsePayload.cloudflareStatus = syncResult.cloudflareMessage;
      responsePayload.diagnostics = syncResult.diagnostics;
      responsePayload.timestamp = new Date().toISOString();
    }

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Internal server error' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
};

// Support GET for manual verification: /api/revalidate?path=/about
export const GET: APIRoute = async (context) => {
  return POST(context);
};
