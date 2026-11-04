// src/pages/api/admin/orders/[id]/status.ts
import type { APIRoute } from 'astro';
import { verifyAdminAuth } from '@utils/auth';
import { updateOrderStatus, type OrderStatus } from '@utils/db';
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

export const POST: APIRoute = async ({ request, params }) => {
  const user = await verifyAdminAuth(request, cfEnv);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Forbidden. Administrator access required.' }), {
      status: 403,
      headers: NO_CACHE_HEADERS,
    });
  }

  const orderId = params.id;
  if (!orderId) {
    return new Response(JSON.stringify({ error: 'Order ID is required.' }), {
      status: 400,
      headers: NO_CACHE_HEADERS,
    });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload.' }), {
      status: 400,
      headers: NO_CACHE_HEADERS,
    });
  }

  const { action, status, carrier, trackingNumber, adminRemark } = body || {};

  const ALLOWED_STATUSES = new Set<OrderStatus>(['PENDING_APPROVAL', 'APPROVED', 'SHIPPED', 'REJECTED']);

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
  } else if (status && ALLOWED_STATUSES.has(status as OrderStatus)) {
    targetStatus = status as OrderStatus;
  } else {
    return new Response(JSON.stringify({ error: 'Valid action (approve, reject, ship) or allowed status required.' }), {
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
    return new Response(JSON.stringify({ error: 'Order not found or status update failed.' }), {
      status: 404,
      headers: NO_CACHE_HEADERS,
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      status: targetStatus,
      message: `Order status updated to ${targetStatus}.`,
    }),
    { status: 200, headers: NO_CACHE_HEADERS }
  );
};

