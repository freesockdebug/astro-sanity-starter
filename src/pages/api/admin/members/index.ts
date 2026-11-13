// src/pages/api/admin/members/index.ts
// Admin Member Management: List, Add, or Update Members with Roles
import type { APIRoute } from 'astro';
import { defineAdminApi, jsonNoCache } from '@utils/auth';
import { invalidateAdminRbacCache } from '@utils/rbac';
import { listAdminMembers, listAdminRoles, upsertAdminMember, getAdminMember, listCandidateLogtoUsers } from '@utils/db';
import { recordAdminAudit } from '@db/audit.repo';

export const prerender = false;

export const GET: APIRoute = defineAdminApi({}, async ({ url }) => {
  if (url.searchParams.get('candidates') === 'true') {
    const search = url.searchParams.get('search') || undefined;
    const candidates = await listCandidateLogtoUsers(search);
    return jsonNoCache({ success: true, candidates });
  }

  const [members, roles] = await Promise.all([
    listAdminMembers(),
    listAdminRoles(),
  ]);

  return jsonNoCache({ success: true, members, roles });
});

export const POST: APIRoute = defineAdminApi(
  { permission: 'members:manage', parseJson: true },
  async ({ context, auth, body, cfEnv }) => {
    const email = body?.email;
    const roleCode = body?.roleCode || body?.role_code;
    const name = body?.name;
    const status = body?.status;

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return jsonNoCache({ error: 'Valid email address is required' }, 400);
    }

    const cleanEmail = email.trim().toLowerCase();
    const allRoles = await listAdminRoles();
    const validRoles = new Set(allRoles.map((r) => r.code));
    if (roleCode && !validRoles.has(roleCode)) {
      return jsonNoCache({ error: `Invalid role code: ${roleCode}` }, 400);
    }

    const validStatuses = new Set(['ACTIVE', 'DISABLED']);
    if (status && !validStatuses.has(status)) {
      return jsonNoCache({ error: 'Invalid status. Allowed: ACTIVE, DISABLED' }, 400);
    }

    const existing = await getAdminMember(cleanEmail);
    const finalRoleCode = roleCode || (existing ? existing.role_code : 'sales_rep');
    const finalName = name !== undefined && name !== null ? String(name).trim() : (existing ? existing.name : cleanEmail.split('@')[0]);
    const finalStatus = status || (existing ? existing.status : 'ACTIVE');

    await upsertAdminMember({
      email: cleanEmail,
      name: finalName,
      role_code: finalRoleCode,
      status: finalStatus,
      created_by: auth.user.email,
    });

    await invalidateAdminRbacCache(cleanEmail, cfEnv);

    recordAdminAudit(context, {
      adminEmail: auth.user.email,
      action: 'UPSERT_ADMIN_MEMBER',
      targetType: 'MEMBER',
      targetId: cleanEmail,
      after: { email: cleanEmail, name: finalName, roleCode: finalRoleCode, status: finalStatus },
      cfEnv,
    });

    return jsonNoCache({
      success: true,
      message: `Member ${cleanEmail} saved successfully`,
    });
  }
);

