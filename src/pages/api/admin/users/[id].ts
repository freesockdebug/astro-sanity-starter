// src/pages/api/admin/users/[id].ts
import type { APIRoute } from 'astro';
import { getSessionFromRequest } from '@utils/auth';
import {
  getUserDetailsWithOrders,
  updateUserAdminMeta,
  type CustomerTier,
  type UserStatus,
} from '@utils/db';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

const NO_CACHE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store',
  'Pragma': 'no-cache',
  'Expires': '0',
};

const VALID_TIERS = new Set<CustomerTier>(['STANDARD', 'VIP', 'PARTNER']);
const VALID_STATUSES = new Set<UserStatus>(['ACTIVE', 'BLOCKED']);

export const GET: APIRoute = async ({ request, params }) => {
  const user = await getSessionFromRequest(request, cfEnv);
  if (!user || !user.isAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden. Admin access required.' }), {
      status: 403,
      headers: NO_CACHE_HEADERS,
    });
  }

  const userId = params.id;
  if (!userId) {
    return new Response(JSON.stringify({ error: 'User ID is required.' }), {
      status: 400,
      headers: NO_CACHE_HEADERS,
    });
  }

  const data = await getUserDetailsWithOrders(userId);
  if (!data.user) {
    return new Response(JSON.stringify({ error: 'User not found.' }), {
      status: 404,
      headers: NO_CACHE_HEADERS,
    });
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: NO_CACHE_HEADERS,
  });
};

export const POST: APIRoute = async ({ request, params }) => {
  const user = await getSessionFromRequest(request, cfEnv);
  if (!user || !user.isAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden. Admin access required.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userId = params.id;
  if (!userId) {
    return new Response(JSON.stringify({ error: 'User ID is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { tier, status, adminNotes } = body || {};

  // Self-lockout prevention: Admins cannot suspend their own logged-in account
  if (userId === user.id && status === 'BLOCKED') {
    return new Response(JSON.stringify({ error: 'You cannot block your own admin account.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (tier && !VALID_TIERS.has(tier)) {
    return new Response(JSON.stringify({ error: 'Invalid tier value. Allowed: STANDARD, VIP, PARTNER.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (status && !VALID_STATUSES.has(status)) {
    return new Response(JSON.stringify({ error: 'Invalid status value. Allowed: ACTIVE, BLOCKED.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const success = await updateUserAdminMeta(userId, {
    tier: tier as CustomerTier | undefined,
    status: status as UserStatus | undefined,
    adminNotes: typeof adminNotes === 'string' ? adminNotes : undefined,
  });

  if (!success) {
    return new Response(JSON.stringify({ error: 'User not found or update failed.' }), {
      status: 404,
      headers: NO_CACHE_HEADERS,
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: 'User profile updated successfully.',
    }),
    {
      status: 200,
      headers: NO_CACHE_HEADERS,
    }
  );
};

