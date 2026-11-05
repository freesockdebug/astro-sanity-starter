// src/pages/api/admin/orders/index.ts
import type { APIRoute } from 'astro';
import { verifyAdminAuth, jsonNoCache } from '@utils/auth';
import { listAdminOrders } from '@utils/db';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const user = await verifyAdminAuth(request, cfEnv);
  if (!user) {
    return jsonNoCache({ error: 'Forbidden. Administrator access required.' }, 403);
  }

  const status = url.searchParams.get('status') || undefined;
  const search = url.searchParams.get('search') || undefined;
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));

  const result = await listAdminOrders({ status, search, page, limit });

  return jsonNoCache({
    success: true,
    ...result,
  });
};
