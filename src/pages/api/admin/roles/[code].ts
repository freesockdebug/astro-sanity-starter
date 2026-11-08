// src/pages/api/admin/roles/[code].ts
// Role Deletion Endpoint
import type { APIRoute } from 'astro';
import { verifyAdminAuth, jsonNoCache } from '@utils/authGuards';
import { hasPermission } from '@utils/rbac';
import { deleteAdminRole, getAdminRole } from '@utils/db';
import { recordAdminAudit } from '@utils/audit';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const DELETE: APIRoute = async (context) => {
  const { request, params } = context;
  const auth = await verifyAdminAuth(request, cfEnv);
  if (!auth) {
    return jsonNoCache({ error: 'Unauthorized: Admin session required' }, 401);
  }

  if (!auth.adminContext.isRootAdmin && !hasPermission(auth.adminContext, '*') && !hasPermission(auth.adminContext, 'roles:manage')) {
    return jsonNoCache({ error: 'Forbidden: Missing roles:manage permission' }, 403);
  }

  const code = (params.code || '').trim().toLowerCase();
  if (!code) {
    return jsonNoCache({ error: 'Role code is required' }, 400);
  }

  if (['super_admin', 'sales_manager', 'sales_rep', 'auditor'].includes(code)) {
    return jsonNoCache({ error: 'Cannot delete built-in system role' }, 400);
  }

  const existing = await getAdminRole(code);
  const result = await deleteAdminRole(code);
  if (!result.success) {
    return jsonNoCache({ error: result.error || 'Failed to delete role' }, 400);
  }

  recordAdminAudit(context, {
    adminEmail: auth.user.email,
    action: 'DELETE_ADMIN_ROLE',
    targetType: 'ROLE',
    targetId: code,
    before: existing,
    cfEnv,
  });

  return jsonNoCache({
    success: true,
    message: `Role "${code}" deleted successfully`,
  });
};
