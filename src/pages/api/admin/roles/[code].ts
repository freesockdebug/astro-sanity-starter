// src/pages/api/admin/roles/[code].ts
// Role Deletion Endpoint
import type { APIRoute } from 'astro';
import { defineAdminApi, jsonNoCache } from '@utils/auth';
import { deleteAdminRole, getAdminRole } from '@utils/db';
import { recordAdminAudit } from '@db/audit.repo';

export const prerender = false;

export const DELETE: APIRoute = defineAdminApi(
  { permission: 'roles:manage' },
  async ({ context, params, auth, cfEnv }) => {
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
  }
);

