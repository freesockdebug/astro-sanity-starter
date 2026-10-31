// src/pages/api/admin/orders/[id]/status.ts
import type { APIRoute } from 'astro';
import { getSessionFromRequest } from '@utils/auth';
import { updateOrderStatus, type OrderStatus } from '@utils/db';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const user = await getSessionFromRequest(request);
  if (!user || !user.isAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden. Administrator access required.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const orderId = params.id;
  if (!orderId) {
    return new Response(JSON.stringify({ error: 'Order ID is required.' }), {
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

  const { action, status, carrier, trackingNumber, adminRemark } = body || {};

  let targetStatus: OrderStatus;
  if (action === 'approve') {
    targetStatus = 'APPROVED';
  } else if (action === 'reject') {
    targetStatus = 'REJECTED';
  } else if (action === 'ship') {
    targetStatus = 'SHIPPED';
    if (!carrier && !trackingNumber) {
      return new Response(
        JSON.stringify({ error: 'Carrier name or tracking number is required to ship an order.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } else if (status) {
    targetStatus = status;
  } else {
    return new Response(JSON.stringify({ error: 'Valid action (approve, reject, ship) or status required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const success = await updateOrderStatus(orderId, {
    status: targetStatus,
    carrier: typeof carrier === 'string' ? carrier.trim() : undefined,
    trackingNumber: typeof trackingNumber === 'string' ? trackingNumber.trim() : undefined,
    adminRemark: typeof adminRemark === 'string' ? adminRemark.trim() : undefined,
    adminUser: user.name || user.email,
  });

  if (!success) {
    return new Response(JSON.stringify({ error: 'Failed to update order status.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      status: targetStatus,
      message: `Order status updated to ${targetStatus}.`,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};

