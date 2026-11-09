// src/utils/audit.ts
// Asynchronous Operation Audit Logging Engine with 0ms Latency Impact
import { insertAuditLog, computeJsonDiff, type AuditTargetType } from '../db/audit.repo';

export { insertAuditLog, computeJsonDiff, type AuditTargetType };

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

    // Check if execution context supports waitUntil for true background execution
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

