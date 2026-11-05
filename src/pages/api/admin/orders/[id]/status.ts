// src/pages/api/admin/orders/[id]/status.ts
import type { APIRoute } from 'astro';
import { verifyAdminAuth, jsonNoCache } from '@utils/auth';
import { updateOrderStatus, type OrderStatus } from '@utils/db';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const user = await verifyAdminAuth(request, cfEnv);
  if (!user) {
    return jsonNoCache({ error: 'Forbidden. Administrator access required.' }, 403);
  }

  const orderId = params.id;
  if (!orderId) {
    return jsonNoCache({ error: 'Order ID is required.' }, 400);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonNoCache({ error: 'Invalid JSON payload.' }, 400);
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
      return jsonNoCache({ error: 'Carrier name or tracking number is required to ship an order.' }, 400);
    }
  } else if (status && ALLOWED_STATUSES.has(status as OrderStatus)) {
    targetStatus = status as OrderStatus;
  } else {
    return jsonNoCache({ error: 'Valid action (approve, reject, ship) or allowed status required.' }, 400);
  }

  const success = await updateOrderStatus(orderId, {
    status: targetStatus,
    carrier: typeof carrier === 'string' ? carrier.trim() : undefined,
    trackingNumber: typeof trackingNumber === 'string' ? trackingNumber.trim() : undefined,
    adminRemark: typeof adminRemark === 'string' ? adminRemark.trim() : undefined,
    adminUser: user.name || user.email,
  });

  if (!success) {
    return jsonNoCache({ error: 'Order not found or status update failed.' }, 404);
  }

  return jsonNoCache({
    success: true,
    status: targetStatus,
    message: `Order status updated to ${targetStatus}.`,
  });
};
