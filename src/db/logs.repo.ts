// src/db/logs.repo.ts
// System Error & Diagnostics Domain Repository: D1 logging, probabilistic pruning, latency profiling & queries

import { type DbClient } from './client';
import { executeWithAutoSchema } from './schema';
import { getSystemSettings } from './settings.repo';

export type DiagnosticLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export interface ErrorLogRecord {
  id: number;
  level: DiagnosticLogLevel;
  source: string;
  error_code?: string | null;
  message: string;
  context_json?: string | null;
  user_id?: string | null;
  user_email?: string | null;
  ray_id?: string | null;
  path?: string | null;
  latency_ms?: number | null;
  method?: string | null;
  status_code?: number | null;
  created_at: string;
}

export interface RecordErrorLogInput {
  level?: DiagnosticLogLevel;
  source: string;
  errorCode?: string | null;
  message: string;
  context?: any;
  userId?: string | null;
  userEmail?: string | null;
  rayId?: string | null;
  path?: string | null;
  latencyMs?: number | null;
  method?: string | null;
  statusCode?: number | null;
}

export interface EndpointBottleneck {
  path: string;
  method: string;
  call_count: number;
  avg_latency: number;
  max_latency: number;
  slow_count: number;
}

export const LOG_LEVEL_WEIGHT: Record<string, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  critical: 50,
};

/**
 * Records a diagnostic / error log into D1.
 * Respects systemSettings:
 * 1. enable_error_logging: if false, completely skips D1 writes.
 * 2. log_authenticated_users: if false and userId is present, skips D1 write.
 * 3. log_min_level: only persists logs at or above configured weight (unless request is slow).
 * 4. log_retention_days: probabilistic prune (5% sampling) to prevent unbounded table growth.
 * 5. Loop prevention: rejects self-logging on /api/admin/logs and static asset hits.
 */
export async function recordErrorLog(
  input: RecordErrorLogInput,
  customEnv?: any
): Promise<boolean> {
  if (!input.message || !input.source) return false;

  // Prevent infinite recursive logging loops on diagnostics workbench and static assets
  if (input.path) {
    const p = input.path.toLowerCase();
    if (
      p.startsWith('/api/admin/logs') ||
      p.startsWith('/admin/logs') ||
      p.startsWith('/_astro/') ||
      p.startsWith('/favicon') ||
      p.endsWith('.css') ||
      p.endsWith('.js') ||
      p.endsWith('.png') ||
      p.endsWith('.jpg') ||
      p.endsWith('.svg') ||
      p.endsWith('.ico')
    ) {
      return false;
    }
  }

  try {
    const settings = await getSystemSettings(customEnv).catch(() => null);
    if (settings && !settings.enable_error_logging) {
      return false;
    }

    // Privacy boundary for authenticated users
    const isAuthenticatedUser = Boolean(input.userId || input.userEmail);
    if (isAuthenticatedUser && settings && !settings.log_authenticated_users) {
      return false;
    }

    const level = (input.level || 'error').toLowerCase() as DiagnosticLogLevel;
    const minLevel = settings?.log_min_level || 'warn';
    const minWeight = LOG_LEVEL_WEIGHT[minLevel] ?? 30;
    const currentWeight = LOG_LEVEL_WEIGHT[level] ?? 40;
    const slowThreshold = settings?.slow_request_threshold_ms || 1000;
    const isSlow = typeof input.latencyMs === 'number' && input.latencyMs >= slowThreshold;

    // Filter out verbose messages below min level unless marked as a slow request
    if (currentWeight < minWeight && !isSlow) {
      return false;
    }

    const source = input.source.slice(0, 100);
    const errorCode = input.errorCode ? input.errorCode.slice(0, 50) : null;
    const message = input.message.slice(0, 1000);
    const userId = input.userId ? input.userId.slice(0, 100) : null;
    const userEmail = input.userEmail ? input.userEmail.slice(0, 120).toLowerCase().trim() : null;
    const rayId = input.rayId ? input.rayId.slice(0, 100) : null;
    const path = input.path ? input.path.slice(0, 200) : null;
    const latencyMs = typeof input.latencyMs === 'number' && !isNaN(input.latencyMs) ? Math.max(0, Math.round(input.latencyMs)) : null;
    const method = input.method ? input.method.toUpperCase().slice(0, 10) : null;
    const statusCode = typeof input.statusCode === 'number' && !isNaN(input.statusCode) ? input.statusCode : null;

    let contextJson: string | null = null;
    if (input.context !== undefined && input.context !== null) {
      try {
        contextJson = typeof input.context === 'string'
          ? input.context.slice(0, 4000)
          : JSON.stringify(input.context).slice(0, 4000);
      } catch {
        contextJson = String(input.context).slice(0, 1000);
      }
    }

    return await executeWithAutoSchema(async (db: DbClient) => {
      await db.execute(
        `INSERT INTO system_error_logs (
          level, source, error_code, message, context_json, user_id, user_email, ray_id, path, latency_ms, method, status_code, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [level, source, errorCode, message, contextJson, userId, userEmail, rayId, path, latencyMs, method, statusCode]
      );

      // Probabilistic retention cleanup (5% sampling)
      if (Math.random() < 0.05) {
        const retentionDays = settings?.log_retention_days || 30;
        await db.execute(
          `DELETE FROM system_error_logs WHERE created_at < datetime('now', ?)`,
          [`-${retentionDays} days`]
        ).catch(() => {});
      }

      return true;
    });
  } catch (err) {
    // Non-fatal fail-safe
    return false;
  }
}

/**
 * Lists error logs with pagination, level filter, search, sorting and bottleneck profiling.
 */
export async function listErrorLogs(
  options: {
    level?: string;
    source?: string;
    search?: string;
    sort?: 'newest' | 'slowest';
    limit?: number;
    page?: number;
  } = {},
  customEnv?: any
): Promise<{
  logs: ErrorLogRecord[];
  total: number;
  stats: { total: number; debug: number; info: number; warns: number; errors: number; critical: number };
  bottlenecks: EndpointBottleneck[];
}> {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 50));
  const offset = (page - 1) * limit;

  try {
    return await executeWithAutoSchema(async (db: DbClient) => {
      const conditions: string[] = [];
      const params: any[] = [];

      if (options.level && options.level !== 'ALL') {
        conditions.push('level = ?');
        params.push(options.level.toLowerCase());
      }

      if (options.source && options.source !== 'ALL') {
        conditions.push('source = ?');
        params.push(options.source);
      }

      if (options.search && options.search.trim()) {
        const q = `%${options.search.trim().toLowerCase()}%`;
        conditions.push('(LOWER(message) LIKE ? OR LOWER(source) LIKE ? OR LOWER(ray_id) LIKE ? OR LOWER(user_email) LIKE ? OR LOWER(path) LIKE ?)');
        params.push(q, q, q, q, q);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const orderClause = options.sort === 'slowest'
        ? 'ORDER BY latency_ms DESC NULLS LAST, id DESC'
        : 'ORDER BY id DESC';

      const [logs, countRes, statsRes, bottlenecks] = await Promise.all([
        db.query<ErrorLogRecord>(
          `SELECT id, level, source, error_code, message, context_json, user_id, user_email, ray_id, path, latency_ms, method, status_code, created_at
           FROM system_error_logs
           ${whereClause}
           ${orderClause}
           LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        ),
        db.first<{ count: number }>(
          `SELECT COUNT(*) as count FROM system_error_logs ${whereClause}`,
          params
        ),
        db.first<{ total: number; debug: number; info: number; warns: number; errors: number; critical: number }>(
          `SELECT
             COUNT(*) as total,
             SUM(CASE WHEN level = 'debug' THEN 1 ELSE 0 END) as debug,
             SUM(CASE WHEN level = 'info' THEN 1 ELSE 0 END) as info,
             SUM(CASE WHEN level = 'warn' THEN 1 ELSE 0 END) as warns,
             SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as errors,
             SUM(CASE WHEN level = 'critical' THEN 1 ELSE 0 END) as critical
           FROM system_error_logs`
        ),
        db.query<EndpointBottleneck>(
          `SELECT
             path,
             COALESCE(method, 'GET') as method,
             COUNT(*) as call_count,
             ROUND(AVG(latency_ms)) as avg_latency,
             MAX(latency_ms) as max_latency,
             SUM(CASE WHEN latency_ms >= 500 THEN 1 ELSE 0 END) as slow_count
           FROM system_error_logs
           WHERE latency_ms IS NOT NULL AND path IS NOT NULL AND path != ''
           GROUP BY path, method
           ORDER BY avg_latency DESC
           LIMIT 8`
        ).catch(() => []),
      ]);

      return {
        logs: logs || [],
        total: countRes?.count || 0,
        stats: {
          total: statsRes?.total || 0,
          debug: statsRes?.debug || 0,
          info: statsRes?.info || 0,
          warns: statsRes?.warns || 0,
          errors: statsRes?.errors || 0,
          critical: statsRes?.critical || 0,
        },
        bottlenecks: bottlenecks || [],
      };
    });
  } catch (err) {
    return {
      logs: [],
      total: 0,
      stats: { total: 0, debug: 0, info: 0, warns: 0, errors: 0, critical: 0 },
      bottlenecks: [],
    };
  }
}

/**
 * Clears error logs table.
 */
export async function clearErrorLogs(customEnv?: any): Promise<boolean> {
  try {
    return await executeWithAutoSchema(async (db: DbClient) => {
      await db.execute('DELETE FROM system_error_logs');
      return true;
    });
  } catch {
    return false;
  }
}
