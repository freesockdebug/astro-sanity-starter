// src/pages/api/admin/members/[email].ts
// Admin Member Removal Endpoint
import type { APIRoute } from 'astro';
import { defineAdminApi, getRuntimeEnv, jsonNoCache } from '@utils/auth';
import { invalidateAdminRbacCache } from '@utils/rbac';
import { deleteAdminMember, getAdminMember } from '@utils/db';
import { recordAdminAudit } from '@db/audit.repo';

export const prerender = false;

export const DELETE: APIRoute = defineAdminApi(
  { permission: 'members:manage' },
  async ({ context, params, auth, cfEnv }) => {
    const targetEmail = decodeURIComponent(params.email || '').trim().toLowerCase();
    if (!targetEmail) {
      return jsonNoCache({ error: 'Email parameter is required' }, 400);
    }

    const rootRaw = getRuntimeEnv('ADMIN_EMAILS', cfEnv) || '';
    const rootAdmins = rootRaw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (rootAdmins.includes(targetEmail)) {
      return jsonNoCache({ error: 'Cannot remove system root administrator defined in environment variables.' }, 400);
    }

    if (targetEmail === auth.user.email.toLowerCase()) {
      return jsonNoCache({ error: 'Cannot remove your own admin account.' }, 400);
    }

    const existing = await getAdminMember(targetEmail);
    if (!existing) {
      return jsonNoCache({ error: 'Member not found.' }, 404);
    }

    await deleteAdminMember(targetEmail);
    await invalidateAdminRbacCache(targetEmail, cfEnv);

    recordAdminAudit(context, {
      adminEmail: auth.user.email,
      action: 'DELETE_ADMIN_MEMBER',
      targetType: 'MEMBER',
      targetId: targetEmail,
      before: existing,
      cfEnv,
    });

    return jsonNoCache({
      success: true,
      message: `Member ${targetEmail} removed successfully.`,
    });
  }
);
