// src/pages/api/admin/orders/batch.ts
// Batch Order Actions: Batch Approve, Batch Reject, Batch Assign with RBAC & Audit
import type { APIRoute } from 'astro';
import { verifyAdminAuth, jsonNoCache } from '@utils/auth';
import { hasPermission } from '@utils/rbac';
import { batchUpdateOrderStatus, batchAssignOrders } from '@utils/db';
import { recordAdminAudit } from '@db/audit.repo';
import type { OrderStatus } from '@db/types';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const { request } = context;
  const auth = await verifyAdminAuth(request, cfEnv);
  if (!auth) {
    return jsonNoCache({ error: 'Forbidden. Administrator access required.' }, 403);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonNoCache({ error: 'Invalid JSON payload.' }, 400);
  }

  const { orderIds, action, assignedTo, adminRemark } = body || {};

  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return jsonNoCache({ error: 'orderIds array must contain at least 1 order ID.' }, 400);
  }

  if (orderIds.length > 100) {
    return jsonNoCache({ error: 'Maximum batch size is 100 orders.' }, 400);
  }

  if (action === 'APPROVE' || action === 'REJECT') {
    if (!hasPermission(auth.adminContext, 'orders:approve')) {
      return jsonNoCache({ error: 'Forbidden: Missing orders:approve permission.' }, 403);
    }

    const targetStatus: OrderStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const scope = !auth.adminContext.isRootAdmin && auth.adminContext.dataScope !== 'ALL'
      ? { email: auth.user.email, dataScope: auth.adminContext.dataScope }
      : undefined;

    const changed = await batchUpdateOrderStatus(
      orderIds,
      targetStatus,
      auth.user.name || auth.user.email,
      adminRemark,
      scope
    );

    recordAdminAudit(context, {
      adminEmail: auth.user.email,
      action: `BATCH_${targetStatus}`,
      targetType: 'ORDER',
      targetId: `${orderIds.length} orders`,
      after: { orderIds, status: targetStatus, count: changed },
      cfEnv,
    });

    return jsonNoCache({
      success: true,
      action,
      updatedCount: changed,
    });
  }

  if (action === 'ASSIGN') {
    if (!hasPermission(auth.adminContext, 'orders:assign')) {
      return jsonNoCache({ error: 'Forbidden: Missing orders:assign permission.' }, 403);
    }

    const targetAssignedTo = assignedTo ? String(assignedTo).trim().toLowerCase() : null;
    const changed = await batchAssignOrders(orderIds, targetAssignedTo);

    recordAdminAudit(context, {
      adminEmail: auth.user.email,
      action: 'BATCH_ASSIGN',
      targetType: 'ORDER',
      targetId: `${orderIds.length} orders`,
      after: { orderIds, assignedTo: targetAssignedTo, count: changed },
      cfEnv,
    });

    return jsonNoCache({
      success: true,
      action,
      assignedTo: targetAssignedTo,
      updatedCount: changed,
    });
  }

  return jsonNoCache({ error: 'Unsupported batch action. Must be APPROVE, REJECT, or ASSIGN.' }, 400);
};

