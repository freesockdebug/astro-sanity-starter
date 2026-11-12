// src/pages/api/admin/orders/[id]/status.ts
import type { APIRoute } from 'astro';
import { verifyAdminAuth, jsonNoCache } from '@utils/auth';
import { hasPermission } from '@utils/rbac';
import { updateOrderStatus, getOrderById } from '@utils/db';
import { recordAdminAudit } from '@utils/audit';
import type { OrderStatus } from '@db/types';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const { request, params } = context;
  const auth = await verifyAdminAuth(request, cfEnv);
  if (!auth) {
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
  let requiredPerm = 'orders:approve';

  if (action === 'approve') {
    targetStatus = 'APPROVED';
    requiredPerm = 'orders:approve';
  } else if (action === 'reject') {
    targetStatus = 'REJECTED';
    requiredPerm = 'orders:approve';
  } else if (action === 'ship') {
    targetStatus = 'SHIPPED';
    requiredPerm = 'orders:ship';
    if (!carrier && !trackingNumber) {
      return jsonNoCache({ error: 'Carrier name or tracking number is required to ship an order.' }, 400);
    }
  } else if (status && ALLOWED_STATUSES.has(status as OrderStatus)) {
    targetStatus = status as OrderStatus;
    requiredPerm = targetStatus === 'SHIPPED' ? 'orders:ship' : 'orders:approve';
  } else {
    return jsonNoCache({ error: 'Valid action (approve, reject, ship) or allowed status required.' }, 400);
  }

  if (!hasPermission(auth.adminContext, requiredPerm)) {
    return jsonNoCache({
      error: `Forbidden: Missing required permission ${requiredPerm}`,
      role: auth.adminContext.role.code,
    }, 403);
  }

  const beforeOrder = await getOrderById(orderId);
  if (!beforeOrder) {
    return jsonNoCache({ error: 'Order not found.' }, 404);
  }

  // Row-level DataScope verification
  const dataScope = auth.adminContext.dataScope;
  if (!auth.adminContext.isRootAdmin && dataScope !== 'ALL') {
    const assignedEmail = (beforeOrder.assigned_to || '').toLowerCase();
    const selfEmail = auth.user.email.toLowerCase();
    if (dataScope === 'SELF_ONLY' && assignedEmail !== selfEmail) {
      return jsonNoCache({ error: 'Forbidden: You can only operate on orders assigned to yourself.' }, 403);
    }
    if (dataScope === 'SELF_AND_POOL' && assignedEmail && assignedEmail !== selfEmail) {
      return jsonNoCache({ error: 'Forbidden: This order belongs to another sales rep.' }, 403);
    }
  }

  const success = await updateOrderStatus(orderId, {
    status: targetStatus,
    carrier: typeof carrier === 'string' ? carrier.trim() : undefined,
    trackingNumber: typeof trackingNumber === 'string' ? trackingNumber.trim() : undefined,
    adminRemark: typeof adminRemark === 'string' ? adminRemark.trim() : undefined,
    adminUser: auth.user.name || auth.user.email,
  });

  if (!success) {
    return jsonNoCache({ error: 'Order not found or status update failed.' }, 500);
  }

  const afterOrder = await getOrderById(orderId);

  recordAdminAudit(context, {
    adminEmail: auth.user.email,
    action: `ORDER_${targetStatus}`,
    targetType: 'ORDER',
    targetId: orderId,
    before: {
      status: beforeOrder.status,
      carrier: beforeOrder.carrier,
      tracking_number: beforeOrder.tracking_number,
      admin_remark: beforeOrder.admin_remark,
    },
    after: {
      status: afterOrder?.status,
      carrier: afterOrder?.carrier,
      tracking_number: afterOrder?.tracking_number,
      admin_remark: afterOrder?.admin_remark,
    },
    cfEnv,
  });

  return jsonNoCache({
    success: true,
    orderId,
    status: targetStatus,
  });
};
