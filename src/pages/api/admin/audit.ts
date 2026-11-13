// src/pages/api/admin/audit.ts
// Admin Operation Audit Log Query API with RBAC protection
import type { APIRoute } from 'astro';
import { defineAdminApi, jsonNoCache } from '@utils/auth';
import { parsePaginationParams } from '@utils/format';
import { listAuditLogs } from '@utils/db';

export const prerender = false;

export const GET: APIRoute = defineAdminApi(
  { menu: ['logins', 'orders', 'users'] },
  async ({ url }) => {
    const targetType = url.searchParams.get('targetType') || undefined;
    const targetId = url.searchParams.get('targetId') || undefined;
    const adminEmail = url.searchParams.get('adminEmail') || undefined;
    const action = url.searchParams.get('action') || undefined;
    const { limit, offset } = parsePaginationParams(url.searchParams, 50, 100);
    const rawOffset = parseInt(url.searchParams.get('offset') || '', 10);
    const finalOffset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : offset;

    const result = await listAuditLogs({
      targetType,
      targetId,
      adminEmail,
      action,
      limit,
      offset: finalOffset,
    });

    return jsonNoCache({
      success: true,
      logs: result.logs,
      total: result.total,
      limit,
      offset: finalOffset,
    });
  }
);
