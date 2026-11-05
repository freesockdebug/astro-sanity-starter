// src/pages/api/admin/users/index.ts
import type { APIRoute } from 'astro';
import { verifyAdminAuth, jsonNoCache, checkIsAdmin } from '@utils/auth';
import { listAdminUsers, getSystemSettings } from '@utils/db';
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

  const [result, settings] = await Promise.all([
    listAdminUsers({
      search,
      tier,
      status,
      page,
      limit,
    }),
    getSystemSettings(cfEnv).catch(() => null),
  ]);

  const coAdminEmails = settings?.co_admin_emails;
  const enrichedUsers = result.users.map((u: any) => {
    let roles: string[] = [];
    try {
      roles = JSON.parse(u.logto_roles || '[]');
    } catch {}
    if (u.role) roles.push(u.role);
    return {
      ...u,
      is_admin: checkIsAdmin(u.email, roles, cfEnv, coAdminEmails),
    };
  });

  return jsonNoCache({
    success: true,
    ...result,
    users: enrichedUsers,
    totalPages: Math.max(1, Math.ceil(result.total / limit)),
  });
};


