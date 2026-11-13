// src/pages/api/admin/orders/[id]/assign.ts
// Assign or Claim Order Endpoint with RBAC & Audit Logging
import type { APIRoute } from 'astro';
import { verifyAdminAuth, jsonNoCache } from '@utils/auth';
import { hasPermission } from '@utils/rbac';
import { assignOrder, getOrderById } from '@utils/db';
import { recordAdminAudit } from '@db/audit.repo';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const { request, params } = context;
  const auth = await verifyAdminAuth(request, cfEnv);
  if (!auth) {
    return jsonNoCache({ error: 'Unauthorized: Admin session required' }, 401);
  }

  const orderId = params.id;
  if (!orderId) {
    return jsonNoCache({ error: 'Order ID is required' }, 400);
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {}

  const targetAssignedTo = body.assignedTo !== undefined ? body.assignedTo : auth.user.email;
  const isClaimingSelf = targetAssignedTo && targetAssignedTo.toLowerCase() === auth.user.email.toLowerCase();

  // Sales rep can only claim for self (orders:claim); sales manager or super admin can assign to anyone (orders:assign)
  if (isClaimingSelf) {
    if (!hasPermission(auth.adminContext, 'orders:claim') && !hasPermission(auth.adminContext, 'orders:assign')) {
      return jsonNoCache({ error: 'Forbidden: Missing orders:claim permission' }, 403);
    }
  } else {
    if (!hasPermission(auth.adminContext, 'orders:assign')) {
      return jsonNoCache({ error: 'Forbidden: Missing orders:assign permission' }, 403);
    }
  }

  const beforeOrder = await getOrderById(orderId);
  if (!beforeOrder) {
    return jsonNoCache({ error: 'Order not found' }, 404);
  }

  // Prevent regular sales rep from taking an order that is already assigned to another rep
  if (
    beforeOrder.assigned_to &&
    beforeOrder.assigned_to.toLowerCase() !== auth.user.email.toLowerCase() &&
    !hasPermission(auth.adminContext, 'orders:assign')
  ) {
    return jsonNoCache(
      { error: 'This order is already assigned to another rep. Only managers can reassign it.' },
      409
    );
  }

  const success = await assignOrder(orderId, targetAssignedTo || null);
  if (!success) {
    return jsonNoCache({ error: 'Failed to assign order' }, 500);
  }

  const afterOrder = await getOrderById(orderId);

  recordAdminAudit(context, {
    adminEmail: auth.user.email,
    action: isClaimingSelf ? 'CLAIM_ORDER' : 'ASSIGN_ORDER',
    targetType: 'ORDER',
    targetId: orderId,
    before: { assigned_to: beforeOrder.assigned_to, assigned_at: beforeOrder.assigned_at },
    after: { assigned_to: afterOrder?.assigned_to, assigned_at: afterOrder?.assigned_at },
    cfEnv,
  });

  return jsonNoCache({
    success: true,
    orderId,
    assignedTo: targetAssignedTo || null,
  });
};

