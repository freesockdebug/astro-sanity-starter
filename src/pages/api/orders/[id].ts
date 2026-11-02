// src/pages/api/orders/[id].ts
import type { APIRoute } from 'astro';
import { getSessionFromRequest } from '@utils/auth';
import { getOrderById, getOrderByNo, getUserByIdOrEmail } from '@utils/db';
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

export const GET: APIRoute = async ({ request, params }) => {
  const user = await getSessionFromRequest(request, cfEnv);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized.' }), {
      status: 401,
      headers: NO_CACHE_HEADERS,
    });
  }

  // Session guard: blocked accounts cannot access order details
  try {
    const dbUser = await getUserByIdOrEmail(user.id, user.email);
    if (dbUser && dbUser.status === 'BLOCKED') {
      return new Response(
        JSON.stringify({ error: 'Your account is suspended. Please contact concierge@gwenvenni.com.' }),
        { status: 403, headers: NO_CACHE_HEADERS }
      );
    }
  } catch {
    // Non-blocking
  }

  const idOrNo = params.id;
  if (!idOrNo) {
    return new Response(JSON.stringify({ error: 'Order ID is required.' }), {
      status: 400,
      headers: NO_CACHE_HEADERS,
    });
  }

  const order = (await getOrderById(idOrNo)) || (await getOrderByNo(idOrNo));
  if (!order) {
    return new Response(JSON.stringify({ error: 'Order not found.' }), {
      status: 404,
      headers: NO_CACHE_HEADERS,
    });
  }

  // Row-level security check: User must own the order (by userId or matching buyer email) or be an administrator
  const ownsOrderByEmail = Boolean(order.buyer_email && order.buyer_email.toLowerCase() === user.email.toLowerCase());
  if (order.user_id !== user.id && !ownsOrderByEmail && !user.isAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden. Access denied.' }), {
      status: 403,
      headers: NO_CACHE_HEADERS,
    });
  }

  return new Response(JSON.stringify({ success: true, order }), {
    status: 200,
    headers: NO_CACHE_HEADERS,
  });
};

