// src/pages/api/admin/users/[id].ts
import type { APIRoute } from 'astro';
import { verifyAdminAuth, jsonNoCache } from '@utils/authGuards';
import { hasPermission } from '@utils/rbac';
import {
  getUserById,
  getUserDetailsWithOrders,
  updateUserAdminMeta,
  assignUser,
  getSystemSettings,
  type CustomerTier,
  type UserStatus,
} from '@utils/db';
import { recordAdminAudit } from '@utils/audit';
import { getMergedAdminEmails } from '@utils/auth';
import { getDictMap } from '@utils/dicts';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

const DEFAULT_VALID_TIERS = new Set<string>(['STANDARD', 'VIP', 'PARTNER', 'DISTRIBUTOR']);
const VALID_STATUSES = new Set<UserStatus>(['ACTIVE', 'BLOCKED']);

export const GET: APIRoute = async ({ request, params }) => {
  const auth = await verifyAdminAuth(request, cfEnv);
  if (!auth) {
    return jsonNoCache({ error: 'Forbidden. Admin access required.' }, 403);
  }

  const userId = params.id;
  if (!userId) {
    return jsonNoCache({ error: 'User ID is required.' }, 400);
  }

  const data = await getUserDetailsWithOrders(userId);
  if (!data.user) {
    return jsonNoCache({ error: 'User not found.' }, 404);
  }

  return jsonNoCache(data);
};

export const POST: APIRoute = async (context) => {
  const { request, params } = context;
  const auth = await verifyAdminAuth(request, cfEnv);
  if (!auth) {
    return jsonNoCache({ error: 'Forbidden. Admin access required.' }, 403);
  }

  const userId = params.id;
  if (!userId) {
    return jsonNoCache({ error: 'User ID is required.' }, 400);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonNoCache({ error: 'Invalid JSON payload.' }, 400);
  }

  const { tier, status, adminNotes, assignedTo } = body || {};

  if (!tier && !status && adminNotes === undefined && assignedTo === undefined) {
    return jsonNoCache({ error: 'At least one field (tier, status, adminNotes, assignedTo) is required.' }, 400);
  }

  // Target user validation
  const [existingUser, settings] = await Promise.all([
    getUserById(userId),
    getSystemSettings(cfEnv).catch(() => null),
  ]);
  if (!existingUser) {
    return jsonNoCache({ error: 'User not found' }, 404);
  }

  // Permission checks: only enforce if the requested value differs from the existing value
  if (tier && tier !== existingUser.tier && !hasPermission(auth.adminContext, 'users:edit_tier')) {
    return jsonNoCache({ error: 'Forbidden: Missing users:edit_tier permission.' }, 403);
  }

  if (status && status !== existingUser.status && !hasPermission(auth.adminContext, 'users:block')) {
    return jsonNoCache({ error: 'Forbidden: Missing users:block permission.' }, 403);
  }

  if (
    assignedTo !== undefined &&
    (assignedTo ? String(assignedTo).trim().toLowerCase() : null) !== (existingUser.assigned_to ? existingUser.assigned_to.toLowerCase() : null) &&
    !hasPermission(auth.adminContext, 'users:assign')
  ) {
    return jsonNoCache({ error: 'Forbidden: Missing users:assign permission.' }, 403);
  }

  // 1. Prevent any admin from blocking their own active account
  if (userId === auth.user.id && status === 'BLOCKED') {
    return jsonNoCache({ error: 'Operation denied: You cannot block your own admin account.' }, 400);
  }

  // 2. Prevent blocking root admins or configured co-admins
  const adminEmails = getMergedAdminEmails(settings?.co_admin_emails, cfEnv);
  const targetEmail = (existingUser.email || '').toLowerCase().trim();
  if (adminEmails.includes(targetEmail) && status === 'BLOCKED') {
    return jsonNoCache(
      { error: 'Operation denied: Cannot block an active administrator account.' },
      403
    );
  }

  if (tier) {
    const tierDictMap = await getDictMap(cfEnv, 'customer_tiers').catch(() => ({}));
    const isValidTier = Boolean(tierDictMap[tier]) || DEFAULT_VALID_TIERS.has(tier);
    if (!isValidTier) {
      return jsonNoCache({ error: `Invalid tier value "${tier}". Please configure it in Data Dictionaries.` }, 400);
    }
  }

  if (status && !VALID_STATUSES.has(status)) {
    return jsonNoCache({ error: 'Invalid status value. Allowed: ACTIVE, BLOCKED.' }, 400);
  }

  if (assignedTo !== undefined) {
    await assignUser(userId, assignedTo ? String(assignedTo).trim().toLowerCase() : null);
  }

  if (tier || status || adminNotes !== undefined) {
    const success = await updateUserAdminMeta(userId, {
      tier: tier as CustomerTier | undefined,
      status: status as UserStatus | undefined,
      adminNotes: typeof adminNotes === 'string' ? adminNotes : undefined,
    });

    if (!success) {
      return jsonNoCache({ error: 'User not found or update failed.' }, 404);
    }
  }

  const updatedUser = await getUserById(userId);

  recordAdminAudit(context, {
    adminEmail: auth.user.email,
    action: 'UPDATE_USER_META',
    targetType: 'USER',
    targetId: userId,
    before: {
      tier: existingUser.tier,
      status: existingUser.status,
      admin_notes: existingUser.admin_notes,
      assigned_to: existingUser.assigned_to,
    },
    after: {
      tier: updatedUser?.tier,
      status: updatedUser?.status,
      admin_notes: updatedUser?.admin_notes,
      assigned_to: updatedUser?.assigned_to,
    },
    cfEnv,
  });

  return jsonNoCache({
    success: true,
    message: 'User profile updated successfully.',
    user: updatedUser,
  });
};
