// src/pages/api/admin/roles/index.ts
// RBAC Roles Management API: List & Upsert Roles
import type { APIRoute } from 'astro';
import { verifyAdminAuth, jsonNoCache } from '@utils/auth';
import { hasPermission, invalidateAdminRbacCache } from '@utils/rbac';
import { listAdminRoles, upsertAdminRole, getMemberEmailsByRole } from '@utils/db';
import { recordAdminAudit } from '@utils/audit';
import { ALL_MENU_KEYS } from '@config/adminNavigation';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const auth = await verifyAdminAuth(request, cfEnv);
  if (!auth) {
    return jsonNoCache({ error: 'Unauthorized: Admin session required' }, 401);
  }

  const roles = await listAdminRoles();
  return jsonNoCache({
    success: true,
    roles,
  });
};

export const POST: APIRoute = async (context) => {
  const { request } = context;
  const auth = await verifyAdminAuth(request, cfEnv);
  if (!auth) {
    return jsonNoCache({ error: 'Unauthorized: Admin session required' }, 401);
  }

  if (!auth.adminContext.isRootAdmin && !hasPermission(auth.adminContext, '*') && !hasPermission(auth.adminContext, 'roles:manage')) {
    return jsonNoCache({ error: 'Forbidden: Missing roles:manage permission' }, 403);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonNoCache({ error: 'Invalid JSON payload' }, 400);
  }

  const code = (body?.code || '').trim().toLowerCase();
  const name = (body?.name || '').trim();
  const dataScope = body?.dataScope || body?.data_scope || 'ALL';
  const menus = Array.isArray(body?.menus) ? body.menus : [];
  const permissions = Array.isArray(body?.permissions) ? body.permissions : [];
  const description = (body?.description || '').trim();

  if (!code || !/^[a-z0-9_-]{2,30}$/.test(code)) {
    return jsonNoCache({ error: 'Role code must be 2-30 characters (lowercase alphanumeric, _ or -)' }, 400);
  }

  if (!name) {
    return jsonNoCache({ error: 'Role name is required' }, 400);
  }

  if (!['ALL', 'SELF_AND_POOL', 'SELF_ONLY'].includes(dataScope)) {
    return jsonNoCache({ error: 'Invalid data scope' }, 400);
  }

  // Super admin cannot have its permissions revoked
  let finalPermissions = permissions;
  let finalMenus = menus;
  if (code === 'super_admin') {
    finalPermissions = ['*'];
    finalMenus = ALL_MENU_KEYS;
  }

  await upsertAdminRole({
    code,
    name,
    data_scope: dataScope,
    menus: finalMenus,
    permissions: finalPermissions,
    description,
  });

  // Invalidate KV cache for all affected members
  const affectedMembers = await getMemberEmailsByRole(code).catch(() => []);
  await Promise.all(affectedMembers.map((email) => invalidateAdminRbacCache(email, cfEnv)));

  recordAdminAudit(context, {
    adminEmail: auth.user.email,
    action: 'UPSERT_ADMIN_ROLE',
    targetType: 'ROLE',
    targetId: code,
    after: { code, name, dataScope, menus: finalMenus, permissions: finalPermissions },
    cfEnv,
  });

  return jsonNoCache({
    success: true,
    message: `Role "${name}" saved successfully. Updated ${affectedMembers.length} active member cache(s).`,
  });
};

