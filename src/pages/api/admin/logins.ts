// src/pages/api/admin/logins.ts
import type { APIRoute } from 'astro';
import { verifyAdminAuth, jsonNoCache } from '@utils/auth';
import { hasMenu } from '@utils/rbac';
import { listAllLoginHistory } from '@utils/db';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const sessionUser = await verifyAdminAuth(request, cfEnv);
  if (!sessionUser || !hasMenu(sessionUser.adminContext, 'logins')) {
    return jsonNoCache({ error: 'Forbidden. Logins audit access required.' }, 403);
  }

  const limit = Math.min(300, Math.max(1, parseInt(url.searchParams.get('limit') || '150', 10)));
  const logins = await listAllLoginHistory(limit);

  return jsonNoCache({ success: true, logins });
};
