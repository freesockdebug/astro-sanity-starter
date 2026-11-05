// src/pages/api/admin/users/[id].ts
import type { APIRoute } from 'astro';
import { verifyAdminAuth, getRuntimeEnv, getMergedAdminEmails, jsonNoCache } from '@utils/auth';
import {
  getUserById,
  getUserDetailsWithOrders,
  updateUserAdminMeta,
  getSystemSettings,
  type CustomerTier,
  type UserStatus,
} from '@utils/db';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

const VALID_TIERS = new Set<CustomerTier>(['STANDARD', 'VIP', 'PARTNER']);
const VALID_STATUSES = new Set<UserStatus>(['ACTIVE', 'BLOCKED']);

export const GET: APIRoute = async ({ request, params }) => {
  const user = await verifyAdminAuth(request, cfEnv);
  if (!user) {
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

export const POST: APIRoute = async ({ request, params }) => {
  const user = await verifyAdminAuth(request, cfEnv);
  if (!user) {
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

  const { tier, status, adminNotes } = body || {};

  if (!tier && !status && adminNotes === undefined) {
    return jsonNoCache({ error: 'At least one field (tier, status, adminNotes) is required.' }, 400);
  }

  // Target user validation
  const [existingUser, settings] = await Promise.all([
    getUserById(userId),
    getSystemSettings(cfEnv).catch(() => null),
  ]);
  if (!existingUser) {
    return jsonNoCache({ error: 'User not found' }, 404);
  }

  // 1. Prevent any admin/co-admin from blocking their own active account
  if (userId === user.id && status === 'BLOCKED') {
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

  if (tier && !VALID_TIERS.has(tier)) {
    return jsonNoCache({ error: 'Invalid tier value. Allowed: STANDARD, VIP, PARTNER.' }, 400);
  }

  if (status && !VALID_STATUSES.has(status)) {
    return jsonNoCache({ error: 'Invalid status value. Allowed: ACTIVE, BLOCKED.' }, 400);
  }

  const success = await updateUserAdminMeta(userId, {
    tier: tier as CustomerTier | undefined,
    status: status as UserStatus | undefined,
    adminNotes: typeof adminNotes === 'string' ? adminNotes : undefined,
  });

  if (!success) {
    return jsonNoCache({ error: 'User not found or update failed.' }, 404);
  }

  return jsonNoCache({
    success: true,
    message: 'User profile updated successfully.',
  });
};
