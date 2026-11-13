// src/pages/api/admin/users/index.ts
import type { APIRoute } from 'astro';
import { defineAdminApi, checkIsAdmin, jsonNoCache } from '@utils/auth';
import { parsePaginationParams } from '@utils/format';
import { listAdminUsers, getSystemSettings } from '@utils/db';

export const prerender = false;

export const GET: APIRoute = defineAdminApi({}, async ({ url, auth, cfEnv }) => {
  const tier = url.searchParams.get('tier') || 'ALL';
  const status = url.searchParams.get('status') || 'ALL';
  const timeWindow = url.searchParams.get('timeWindow') || 'ALL';
  const rawAssigned = url.searchParams.get('assignedTo');
  const assignedTo = rawAssigned === 'MINE' ? auth.user.email : (rawAssigned || undefined);
  const { page, limit, search } = parsePaginationParams(url.searchParams, 30, 100);

  const [result, settings] = await Promise.all([
    listAdminUsers({
      search,
      tier,
      status,
      timeWindow,
      assignedTo,
      dataScope: auth.adminContext.dataScope,
      currentAdminEmail: auth.user.email,
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
});
