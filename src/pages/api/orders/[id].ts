// src/pages/api/orders/[id].ts
import type { APIRoute } from 'astro';
import { verifyBuyerAuth, jsonNoCache } from '@utils/auth';
import { getOrderById, getOrderByNo } from '@utils/db';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const { user, errorResponse } = await verifyBuyerAuth(request, cfEnv);
  if (errorResponse || !user) {
    return errorResponse!;
  }

  const idOrNo = params.id;
  if (!idOrNo) {
    return jsonNoCache({ error: 'Order ID is required.' }, 400);
  }

  const order = (await getOrderById(idOrNo)) || (await getOrderByNo(idOrNo));
  if (!order) {
    return jsonNoCache({ error: 'Order not found.' }, 404);
  }

  // Row-level security check: User must own the order (by userId or matching buyer email) or be an administrator
  const ownsOrderByEmail = Boolean(order.buyer_email && order.buyer_email.toLowerCase() === user.email.toLowerCase());
  if (order.user_id !== user.id && !ownsOrderByEmail && !user.isAdmin) {
    return jsonNoCache({ error: 'Forbidden. Access denied.' }, 403);
  }

  return jsonNoCache({ success: true, order });
};

