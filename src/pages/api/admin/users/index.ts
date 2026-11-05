// src/pages/api/admin/users/index.ts
import type { APIRoute } from 'astro';
import { verifyAdminAuth, jsonNoCache } from '@utils/auth';
import { listAdminUsers } from '@utils/db';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const user = await verifyAdminAuth(request, cfEnv);
  if (!user) {
    return jsonNoCache({ error: 'Forbidden. Administrator access required.' }, 403);
  }

  const search = url.searchParams.get('search') || '';
  const tier = url.searchParams.get('tier') || 'ALL';
  const status = url.searchParams.get('status') || 'ALL';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '30', 10)));

  const result = await listAdminUsers({
    search,
    tier,
    status,
    page,
    limit,
  });

  return jsonNoCache({
    success: true,
    ...result,
    totalPages: Math.max(1, Math.ceil(result.total / limit)),
  });
};

