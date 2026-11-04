// src/pages/api/admin/orders/index.ts
import type { APIRoute } from 'astro';
import { verifyAdminAuth } from '@utils/auth';
import { listAdminOrders } from '@utils/db';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

const NO_CACHE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store',
  'Pragma': 'no-cache',
  'Expires': '0',
};

export const GET: APIRoute = async ({ request, url }) => {
  const user = await verifyAdminAuth(request, cfEnv);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Forbidden. Administrator access required.' }), {
      status: 403,
      headers: NO_CACHE_HEADERS,
    });
  }

  const status = url.searchParams.get('status') || undefined;
  const search = url.searchParams.get('search') || undefined;
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));

  const result = await listAdminOrders({ status, search, page, limit });

  return new Response(
    JSON.stringify({
      success: true,
      ...result,
    }),
    {
      status: 200,
      headers: NO_CACHE_HEADERS,
    }
  );
};
