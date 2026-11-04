// src/pages/api/orders/index.ts
import type { APIRoute } from 'astro';
import { getSessionFromRequest } from '@utils/auth';
import { getOrdersByUserId, claimOrdersByEmail, getUserByIdOrEmail } from '@utils/db';
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

export const GET: APIRoute = async ({ request }) => {
  const user = await getSessionFromRequest(request, cfEnv);
  if (!user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized. Please sign in to view your orders.' }),
      { status: 401, headers: NO_CACHE_HEADERS }
    );
  }

  // Session guard: blocked accounts cannot access orders
  try {
    const dbUser = await getUserByIdOrEmail(user.id, user.email);
    if (dbUser && dbUser.status === 'BLOCKED') {
      return new Response(
        JSON.stringify({ error: 'Your account is suspended. Please contact our B2B support team.' }),
        { status: 403, headers: NO_CACHE_HEADERS }
      );
    }
  } catch {
    // Non-blocking
  }

  // Idempotently claim any new guest orders matching user's email
  try {
    await claimOrdersByEmail(user.email, user.id);
  } catch (err) {
    console.error('Error auto-claiming orders:', err);
  }

  const orders = await getOrdersByUserId(user.id, user.email);

  return new Response(
    JSON.stringify({
      success: true,
      orders,
    }),
    {
      status: 200,
      headers: NO_CACHE_HEADERS,
    }
  );
};

