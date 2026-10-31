// src/pages/api/orders/[id].ts
import type { APIRoute } from 'astro';
import { getSessionFromRequest } from '@utils/auth';
import { getOrderById, getOrderByNo } from '@utils/db';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const user = await getSessionFromRequest(request);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const idOrNo = params.id;
  if (!idOrNo) {
    return new Response(JSON.stringify({ error: 'Order ID is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const order = (await getOrderById(idOrNo)) || (await getOrderByNo(idOrNo));
  if (!order) {
    return new Response(JSON.stringify({ error: 'Order not found.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Row-level security check: User must own the order or be an administrator
  if (order.user_id !== user.id && !user.isAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden. Access denied.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true, order }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

