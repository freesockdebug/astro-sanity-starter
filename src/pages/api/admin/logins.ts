// src/pages/api/admin/logins.ts
import type { APIRoute } from 'astro';
import { verifyAdminAuth } from '@utils/auth';
import { listAllLoginHistory } from '@utils/db';
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
  const sessionUser = await verifyAdminAuth(request, cfEnv);
  if (!sessionUser) {
    return new Response(JSON.stringify({ error: 'Forbidden. Admin access required.' }), {
      status: 403,
      headers: NO_CACHE_HEADERS,
    });
  }

  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
  const logins = await listAllLoginHistory(limit);

  return new Response(JSON.stringify({ logins }), {
    status: 200,
    headers: NO_CACHE_HEADERS,
  });
};

