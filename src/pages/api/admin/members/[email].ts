// src/pages/api/admin/members/[email].ts
// Admin Member Removal Endpoint
import type { APIRoute } from 'astro';
import { verifyAdminAuth, jsonNoCache } from '@utils/authGuards';
import { hasPermission, invalidateAdminRbacCache } from '@utils/rbac';
import { deleteAdminMember, getAdminMember } from '@utils/db';
import { recordAdminAudit } from '@utils/audit';
import { getRuntimeEnv } from '@utils/auth';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const DELETE: APIRoute = async (context) => {
  const { request, params } = context;
  const auth = await verifyAdminAuth(request, cfEnv);
  if (!auth) {
    return jsonNoCache({ error: 'Unauthorized: Admin session required' }, 401);
  }

  if (!auth.adminContext.isRootAdmin && !hasPermission(auth.adminContext, '*') && !hasPermission(auth.adminContext, 'members:manage')) {
    return jsonNoCache({ error: 'Forbidden: Missing members:manage permission' }, 403);
  }

  const targetEmail = decodeURIComponent(params.email || '').trim().toLowerCase();
  if (!targetEmail) {
    return jsonNoCache({ error: 'Email parameter is required' }, 400);
  }

  // Prevent deleting root env admin
  const rootRaw = getRuntimeEnv('ADMIN_EMAILS', cfEnv) || '';
  const rootAdmins = rootRaw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (rootAdmins.includes(targetEmail)) {
    return jsonNoCache({ error: 'Cannot remove system root administrator defined in environment variables.' }, 400);
  }

  // Prevent deleting self
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
};
