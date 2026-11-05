// src/pages/api/orders/index.ts
import type { APIRoute } from 'astro';
import { verifyBuyerAuth, jsonNoCache } from '@utils/auth';
import { getOrdersByUserId, claimOrdersByEmail } from '@utils/db';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const { user, errorResponse } = await verifyBuyerAuth(request, cfEnv);
  if (errorResponse || !user) {
    return errorResponse!;
  }

  // Idempotently claim any new guest orders matching user's email
  try {
    await claimOrdersByEmail(user.email, user.id);
  } catch (err) {
    console.error('Error auto-claiming orders:', err);
  }

  const orders = await getOrdersByUserId(user.id, user.email);

  return jsonNoCache({
    success: true,
    orders,
  });
};

