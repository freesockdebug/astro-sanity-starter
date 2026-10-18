// src/pages/api/revalidate.ts
import type { APIRoute } from 'astro';

export const prerender = false;

const getEnv = (key: string): string | undefined => {
  return (import.meta.env && import.meta.env[key]) || (typeof process !== 'undefined' && process.env && process.env[key]);
};

/**
 * On-Demand Cache Revalidation Endpoint
 * Triggered by Sanity Webhooks or manual maintenance to purge Cloudflare Edge Cache.
 */
export const POST: APIRoute = async ({ request, url }) => {
  try {
    const expectedSecret = getEnv('REVALIDATE_SECRET') || getEnv('SANITY_REVALIDATE_SECRET');
    const providedSecret = request.headers.get('x-webhook-secret') || url.searchParams.get('secret');

    // 1. Authenticate webhook request if secret is configured
    if (expectedSecret && providedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid revalidation secret' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Parse payload from Sanity Webhook
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Allow empty body for manual trigger
    }

    const docType = body?._type;
    const docSlug = body?.slug?.current || body?.slug;
    const origin = url.origin;

    // 3. Determine target URLs to purge based on changed document type
    const urlsToPurge: string[] = [];

    if (!docType || docType === 'siteConfig' || docType === 'rfqSettings') {
      // Global config changes purge all primary entry points
      urlsToPurge.push(`${origin}/`);
      urlsToPurge.push(`${origin}/products`);
    } else if (docType === 'product' || docType === 'category' || docType === 'catalogSettings') {
      urlsToPurge.push(`${origin}/products`);
      urlsToPurge.push(`${origin}/`);
      if (docSlug) {
        urlsToPurge.push(`${origin}/products/${docSlug}`);
      }
    } else if (docType === 'page') {
      if (docSlug === '/' || docSlug === 'home') {
        urlsToPurge.push(`${origin}/`);
      } else if (docSlug) {
        urlsToPurge.push(`${origin}/${docSlug}`);
      }
    } else {
      // Default: purge homepage and catalog
      urlsToPurge.push(`${origin}/`);
      urlsToPurge.push(`${origin}/products`);
    }

    // 4. Execute Cloudflare Cache Purge if API credentials exist
    const cfZoneId = getEnv('CLOUDFLARE_ZONE_ID');
    const cfApiToken = getEnv('CLOUDFLARE_API_TOKEN');
    let cfPurged = false;
    let cfMessage = 'Skipped (credentials not set in environment)';

    if (cfZoneId && cfApiToken) {
      try {
        const cfRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${cfZoneId}/purge_cache`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cfApiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ files: urlsToPurge })
        });
        const cfData: any = await cfRes.json();
        cfPurged = cfData?.success || false;
        cfMessage = cfPurged ? 'Successfully purged from Cloudflare Edge' : JSON.stringify(cfData?.errors || 'Unknown error');
      } catch (err: any) {
        cfMessage = `Cloudflare purge failed: ${err?.message}`;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        revalidated: true,
        documentType: docType || 'manual',
        purgedUrls: urlsToPurge,
        cloudflarePurge: {
          executed: Boolean(cfZoneId && cfApiToken),
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

// Also support GET for simple manual browser checks
export const GET: APIRoute = async (context) => {
  return POST(context);
};
