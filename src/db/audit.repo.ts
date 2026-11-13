// src/db/audit.repo.ts
// Repository for Admin Operations Audit Logs
import { executeWithAutoSchema } from './schema';
import type { DbClient } from './client';

export type AuditTargetType =
  | 'ORDER'
  | 'USER'
  | 'SETTINGS'
  | 'MEMBER'
  | 'ROLE'
  | 'SYS_DICT_ITEM'
  | 'SYS_DICT_GROUP'
  | 'product'
  | 'category'
  | 'page'
  | 'siteConfig'
  | 'catalogSettings'
  | 'productStorySettings'
  | 'rfqSettings'
  | 'cache'
  | (string & {});

export interface AdminAuditLog {
  id?: number;
  admin_email: string;
  action: string;
  target_type: AuditTargetType;
  target_id?: string;
  before_json?: string;
  after_json?: string;
  diff_json?: string;
  client_ip?: string;
  country?: string;
  duration_ms?: number;
  created_at?: string;
}

export function computeJsonDiff(before?: any, after?: any): Record<string, { from: any; to: any }> | null {
  if (!before && !after) return null;
  const b = before || {};
  const a = after || {};
  const diff: Record<string, { from: any; to: any }> = {};

  const allKeys = new Set([...Object.keys(b), ...Object.keys(a)]);
  for (const k of allKeys) {
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) {
      diff[k] = { from: b[k] ?? null, to: a[k] ?? null };
    }
  }

  return Object.keys(diff).length > 0 ? diff : null;
}

export async function insertAuditLog(log: AdminAuditLog): Promise<void> {
  await executeWithAutoSchema(async (db: DbClient) => {
    await db.execute(
      `INSERT INTO admin_audit_logs (
        admin_email, action, target_type, target_id,
        before_json, after_json, diff_json,
        client_ip, country, duration_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        log.admin_email.toLowerCase(),
        log.action,
        log.target_type,
        log.target_id || null,
        log.before_json || null,
        log.after_json || null,
        log.diff_json || null,
        log.client_ip || null,
        log.country || null,
        log.duration_ms || null,
      ]
    );
  });
}

export async function listAuditLogs(options: {
  targetType?: string;
  targetId?: string;
  adminEmail?: string;
  action?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ logs: AdminAuditLog[]; total: number }> {
  return executeWithAutoSchema(async (db: DbClient) => {
    const where: string[] = [];
    const params: any[] = [];

    if (options.targetType) {
      where.push('target_type = ?');
      params.push(options.targetType);
    }
    if (options.targetId) {
      where.push('target_id = ?');
      params.push(options.targetId);
    }
    if (options.adminEmail) {
      where.push('admin_email = ?');
      params.push(options.adminEmail.toLowerCase());
    }
    if (options.action) {
      where.push('action = ?');
      params.push(options.action);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const countRow = await db.first<{ count: number }>(
      `SELECT count(*) as count FROM admin_audit_logs ${whereClause}`,
      params
    );
    const total = countRow?.count || 0;

    const limit = Math.min(options.limit || 50, 100);
    const offset = Math.max(options.offset || 0, 0);

    const logs = await db.query<AdminAuditLog>(
      `SELECT * FROM admin_audit_logs ${whereClause} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return { logs: logs || [], total };
  });
}

export interface AuditLogParams {
  adminEmail: string;
  action: string;
  targetType: AuditTargetType;
  targetId?: string;
  before?: any;
  after?: any;
  durationMs?: number;
  cfEnv?: any;
}

/**
 * Asynchronous Operation Audit Logging Engine with 0ms Latency Impact.
 */
export function recordAdminAudit(
  requestOrContext: any,
  params: AuditLogParams
): void {
  try {
    const req = requestOrContext?.request || (requestOrContext instanceof Request ? requestOrContext : null);
    const headers = req?.headers;
    const clientIp = headers?.get('cf-connecting-ip') || headers?.get('x-forwarded-for') || undefined;
    const country = headers?.get('cf-ipcountry') || undefined;

    const diff = computeJsonDiff(params.before, params.after);

    const logPromise = insertAuditLog({
      admin_email: params.adminEmail,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId,
      before_json: params.before ? JSON.stringify(params.before) : undefined,
      after_json: params.after ? JSON.stringify(params.after) : undefined,
      diff_json: diff ? JSON.stringify(diff) : undefined,
      client_ip: clientIp,
      country,
      duration_ms: params.durationMs,
    }).catch((err) => {
      console.error('[AuditLog] Asynchronous insert failed:', err);
    });

    const waitUntil =
      requestOrContext?.locals?.runtime?.ctx?.waitUntil ||
      requestOrContext?.runtime?.ctx?.waitUntil ||
      requestOrContext?.ctx?.waitUntil;

    if (typeof waitUntil === 'function') {
      waitUntil.call(requestOrContext?.locals?.runtime?.ctx || requestOrContext?.ctx, logPromise);
    }
  } catch (e) {
    console.error('[AuditLog] Failed to dispatch audit log:', e);
  }
}

