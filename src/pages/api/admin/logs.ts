// src/pages/api/admin/logs.ts
import type { APIRoute } from 'astro';
import { verifyAdminAuth, jsonNoCache } from '@utils/auth';
import { listErrorLogs, clearErrorLogs } from '@utils/db';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const admin = await verifyAdminAuth(request, cfEnv);
  if (!admin) {
    return jsonNoCache({ error: 'Forbidden. Administrator access required.' }, 403);
  }

  const level = url.searchParams.get('level') || 'ALL';
  const source = url.searchParams.get('source') || 'ALL';
  const eventCode = url.searchParams.get('eventCode') || 'ALL';
  const health = url.searchParams.get('health') || 'ALL';
  const timeWindow = url.searchParams.get('timeWindow') || 'ALL';
  const search = url.searchParams.get('search') || '';
  const sort = (url.searchParams.get('sort') === 'slowest' ? 'slowest' : 'newest') as 'newest' | 'slowest';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));

  const result = await listErrorLogs(
    {
      level,
      source,
      eventCode,
      health,
      timeWindow,
      search,
      sort,
      page,
      limit,
    },
    cfEnv
  );

  return jsonNoCache({
    success: true,
    ...result,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(result.total / limit)),
  });
};

export const DELETE: APIRoute = async ({ request }) => {
  const admin = await verifyAdminAuth(request, cfEnv);
  if (!admin) {
    return jsonNoCache({ error: 'Forbidden. Administrator access required.' }, 403);
  }

  const success = await clearErrorLogs(cfEnv);
  return jsonNoCache({
    success,
    message: success ? 'Diagnostic logs cleared successfully.' : 'Failed to clear diagnostic logs.',
  });
};

