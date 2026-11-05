// src/pages/api/admin/users/[id].ts
import type { APIRoute } from 'astro';
import { verifyAdminAuth, getRuntimeEnv, getMergedAdminEmails, jsonNoCache } from '@utils/auth';
import {
  getUserDetailsWithOrders,
  updateUserAdminMeta,
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

  // Super-admin protection: Cannot block accounts listed in ADMIN_EMAILS
  if (status === 'BLOCKED') {
    const targetData = await getUserDetailsWithOrders(userId);
    const targetEmail = targetData.user?.email?.toLowerCase().trim();
    if (targetEmail) {
      const rootWhitelist = getMergedAdminEmails(undefined, cfEnv);
      if (rootWhitelist.includes(targetEmail)) {
        return jsonNoCache({ error: 'Super administrators cannot be blocked.' }, 403);
      }
    }
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
