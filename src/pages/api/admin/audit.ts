// src/pages/api/admin/audit.ts
// Admin Operation Audit Log Query API with RBAC protection
import type { APIRoute } from 'astro';
import { verifyAdminAuth, jsonNoCache } from '@utils/authGuards';
import { hasMenu } from '@utils/rbac';
import { listAuditLogs } from '@utils/db';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const auth = await verifyAdminAuth(request, cfEnv);
  if (!auth) {
    return jsonNoCache({ error: 'Unauthorized: Admin session required' }, 401);
  }

  if (!hasMenu(auth.adminContext, 'logins') && !hasMenu(auth.adminContext, 'orders') && !hasMenu(auth.adminContext, 'users')) {
    return jsonNoCache({ error: 'Forbidden: Security audit access required' }, 403);
  }

  const targetType = url.searchParams.get('targetType') || undefined;
  const targetId = url.searchParams.get('targetId') || undefined;
  const adminEmail = url.searchParams.get('adminEmail') || undefined;
  const action = url.searchParams.get('action') || undefined;
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));

  const result = await listAuditLogs({
    targetType,
    targetId,
    adminEmail,
    action,
    limit,
    offset,
  });

  return jsonNoCache({
    success: true,
    logs: result.logs,
    total: result.total,
    limit,
    offset,
  });
};
