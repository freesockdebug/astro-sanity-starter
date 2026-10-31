// src/pages/api/orders/index.ts
import type { APIRoute } from 'astro';
import { getSessionFromRequest } from '@utils/auth';
import { getOrdersByUserId, claimOrdersByEmail } from '@utils/db';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const user = await getSessionFromRequest(request);
  if (!user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized. Please sign in to view your orders.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Idempotently claim any new guest orders matching user's email
  try {
    await claimOrdersByEmail(user.email, user.id);
  } catch (err) {
    console.error('Error auto-claiming orders:', err);
  }

  const orders = await getOrdersByUserId(user.id);

  return new Response(
    JSON.stringify({
      success: true,
      orders,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
};

