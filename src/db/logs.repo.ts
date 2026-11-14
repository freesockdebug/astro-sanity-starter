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
  client_ip?: string | null;
  country?: string | null;
  city?: string | null;
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
  clientIp?: string | null;
  country?: string | null;
  city?: string | null;
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

interface LogsOverviewEntry {
  exp: number;
  stats: { total: number; debug: number; info: number; warns: number; errors: number; critical: number; slow: number };
  bottlenecks: EndpointBottleneck[];
}

const LOGS_OVERVIEW_TTL_MS = 30_000;
const logsOverviewCache = new Map<string, LogsOverviewEntry>();

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
    const errorCode = input.errorCode ? input.errorCode.slice(0, 50) : null;

    // Event-Aware SLA判定: 区分服务端请求、Web Vitals与客户端事件，杜绝前端普通LCP误当慢请求刷屏
    let isSlow = false;
    if (typeof input.latencyMs === 'number' && !isNaN(input.latencyMs)) {
      if (errorCode === 'WEB_VITALS') {
        let isBackgrounded = false;
        let rating = '';
        if (input.context && typeof input.context === 'object') {
          isBackgrounded = Boolean((input.context as any).wasHidden || (input.context as any).rating === 'backgrounded');
          rating = String((input.context as any).rating || '');
        }
        isSlow = !isBackgrounded && (rating === 'poor' || input.latencyMs > 4000);
      } else if (errorCode === 'CLIENT_NAVIGATION') {
        isSlow = false;
      } else {
        isSlow = input.latencyMs >= slowThreshold;
      }
    }

    // 1. 普通前端路由切换不落库 D1（仅保留在 console.log 和错误面包屑中）
    if (errorCode === 'CLIENT_NAVIGATION') {
      return false;
    }
    // 2. 健康的 Web Vitals 指标（!isSlow）即使在 info/debug 模式下也不落库 D1
    if (errorCode === 'WEB_VITALS' && !isSlow) {
      return false;
    }

    // Filter out verbose messages below min level unless marked as a slow request
    if (currentWeight < minWeight && !isSlow) {
      return false;
    }

    const source = input.source.slice(0, 100);
    const message = input.message.slice(0, 1000);
    const userId = input.userId ? input.userId.slice(0, 100) : null;
    const userEmail = input.userEmail ? input.userEmail.slice(0, 120).toLowerCase().trim() : null;
    const rayId = input.rayId ? input.rayId.slice(0, 100) : null;
    const path = input.path ? input.path.slice(0, 200) : null;
    const latencyMs = typeof input.latencyMs === 'number' && !isNaN(input.latencyMs) ? Math.max(0, Math.round(input.latencyMs)) : null;
    const method = input.method ? input.method.toUpperCase().slice(0, 10) : null;
    const statusCode = typeof input.statusCode === 'number' && !isNaN(input.statusCode) ? input.statusCode : null;
    const clientIp = input.clientIp ? input.clientIp.slice(0, 50) : null;
    const country = input.country ? input.country.toUpperCase().slice(0, 10) : null;
    const city = input.city ? input.city.slice(0, 50) : null;

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
      const ops: { sql: string; params: any[] }[] = [
        {
          sql: `INSERT INTO system_error_logs (
            level, source, error_code, message, context_json, user_id, user_email, ray_id, path, latency_ms, method, status_code, client_ip, country, city, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          params: [level, source, errorCode, message, contextJson, userId, userEmail, rayId, path, latencyMs, method, statusCode, clientIp, country, city],
        },
      ];

      // Probabilistic retention cleanup (5% sampling) merged into same batch
      if (Math.random() < 0.05) {
        const retentionDays = settings?.log_retention_days || 30;
        ops.push({
          sql: `DELETE FROM system_error_logs WHERE created_at < datetime('now', ?)`,
          params: [`-${retentionDays} days`],
        });
      }

      if (ops.length > 1) {
        await db.batch(ops);
      } else {
        await db.execute(ops[0].sql, ops[0].params);
      }

      return true;
    });
  } catch (err) {
    // Non-fatal fail-safe
    return false;
  }
}

/**
 * Micro-batch log processor: writes multiple log entries in a single D1 transaction via db.batch()
 */
export async function recordErrorLogsBatch(
  inputs: RecordErrorLogInput[],
  customEnv?: any
): Promise<boolean> {
  if (!inputs || inputs.length === 0) return true;
  if (inputs.length === 1) return recordErrorLog(inputs[0], customEnv);

  const settings = await getSystemSettings(customEnv).catch(() => null);
  if (settings && !settings.enable_error_logging) {
    return false;
  }

  const minWeight = LOG_LEVEL_WEIGHT[settings?.log_min_level || 'warn'] ?? LOG_LEVEL_WEIGHT.warn;
  const slowThreshold = settings?.slow_request_threshold_ms || 1000;

  const validOps: { sql: string; params: any[] }[] = [];
  const insertSql = `INSERT INTO system_error_logs (
    level, source, error_code, message, context_json, user_id, user_email, ray_id, path, latency_ms, method, status_code, client_ip, country, city, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`;

  for (const input of inputs) {
    // Privacy boundary for authenticated users
    const isAuthenticatedUser = Boolean(input.userId || input.userEmail);
    if (isAuthenticatedUser && settings && !settings.log_authenticated_users) {
      continue;
    }

    const level = (input.level?.toLowerCase() || 'error') as DiagnosticLogLevel;
    const currentWeight = LOG_LEVEL_WEIGHT[level] ?? LOG_LEVEL_WEIGHT.error;
    const errorCode = input.errorCode ? input.errorCode.slice(0, 50) : null;

    // Event-Aware SLA判定: 区分服务端请求、Web Vitals与客户端事件
    let isSlow = false;
    if (typeof input.latencyMs === 'number' && !isNaN(input.latencyMs)) {
      if (errorCode === 'WEB_VITALS') {
        let isBackgrounded = false;
        let rating = '';
        if (input.context && typeof input.context === 'object') {
          isBackgrounded = Boolean((input.context as any).wasHidden || (input.context as any).rating === 'backgrounded');
          rating = String((input.context as any).rating || '');
        }
        isSlow = !isBackgrounded && (rating === 'poor' || input.latencyMs > 4000);
      } else if (errorCode === 'CLIENT_NAVIGATION') {
        isSlow = false;
      } else {
        isSlow = input.latencyMs >= slowThreshold;
      }
    }

    if (errorCode === 'CLIENT_NAVIGATION') {
      continue;
    }
    if (errorCode === 'WEB_VITALS' && !isSlow) {
      continue;
    }

    if (currentWeight < minWeight && !isSlow) {
      continue;
    }

    const source = (input.source || 'system').slice(0, 100);
    const message = (input.message || '').slice(0, 1000);
    const userId = input.userId ? input.userId.slice(0, 100) : null;
    const userEmail = input.userEmail ? input.userEmail.slice(0, 120).toLowerCase().trim() : null;
    const rayId = input.rayId ? input.rayId.slice(0, 100) : null;
    const path = input.path ? input.path.slice(0, 200) : null;
    const latencyMs = typeof input.latencyMs === 'number' && !isNaN(input.latencyMs) ? Math.max(0, Math.round(input.latencyMs)) : null;
    const method = input.method ? input.method.toUpperCase().slice(0, 10) : null;
    const statusCode = typeof input.statusCode === 'number' && !isNaN(input.statusCode) ? input.statusCode : null;
    const clientIp = input.clientIp ? input.clientIp.slice(0, 50) : null;
    const country = input.country ? input.country.toUpperCase().slice(0, 10) : null;
    const city = input.city ? input.city.slice(0, 50) : null;

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

    validOps.push({
      sql: insertSql,
      params: [level, source, errorCode, message, contextJson, userId, userEmail, rayId, path, latencyMs, method, statusCode, clientIp, country, city],
    });
  }

  if (validOps.length === 0) return true;

  try {
    return await executeWithAutoSchema(async (db: DbClient) => {
      // Probabilistic retention cleanup (5% sampling) appended to same batch
      if (Math.random() < 0.05) {
        const retentionDays = settings?.log_retention_days || 30;
        validOps.push({
          sql: `DELETE FROM system_error_logs WHERE created_at < datetime('now', ?)`,
          params: [`-${retentionDays} days`],
        });
      }

      await db.batch(validOps);
      return true;
    });
  } catch {
    return false;
  }
}

export interface ListErrorLogsOptions {
  level?: string;
  source?: string;
  eventCode?: string;
  health?: string;
  timeWindow?: string;
  search?: string;
  sort?: 'newest' | 'slowest';
  limit?: number;
  page?: number;
}

/**
 * Lists error logs with pagination, level filter, search, sorting and bottleneck profiling.
 */
export async function listErrorLogs(
  options: ListErrorLogsOptions = {},
  customEnv?: any
): Promise<{
  logs: ErrorLogRecord[];
  total: number;
  stats: { total: number; debug: number; info: number; warns: number; errors: number; critical: number; slow: number };
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

      // Event type filtering
      if (options.eventCode && options.eventCode !== 'ALL') {
        if (options.eventCode === 'SERVER_ALL') {
          conditions.push(`(error_code IN ('REQUEST_COMPLETED', 'SLOW_REQUEST') OR (method IS NOT NULL AND method != 'CLIENT'))`);
        } else if (options.eventCode === 'WEB_VITALS') {
          conditions.push(`error_code = 'WEB_VITALS'`);
        } else if (options.eventCode === 'CLIENT_ERRORS') {
          conditions.push(`error_code LIKE 'CLIENT_%ERROR%'`);
        } else if (options.eventCode === 'CLIENT_NAVIGATION') {
          conditions.push(`error_code = 'CLIENT_NAVIGATION'`);
        } else {
          conditions.push('error_code = ?');
          params.push(options.eventCode);
        }
      }

      // Health & SLA latency filtering
      if (options.health && options.health !== 'ALL') {
        if (options.health === 'slow_only') {
          conditions.push(`((latency_ms >= 1000 AND (error_code IS NULL OR error_code NOT IN ('WEB_VITALS', 'CLIENT_NAVIGATION'))) OR (error_code = 'WEB_VITALS' AND context_json LIKE '%"rating":"poor"%'))`);
        } else if (options.health === '500') {
          conditions.push(`(latency_ms >= 500 AND (error_code IS NULL OR error_code != 'CLIENT_NAVIGATION'))`);
        } else if (options.health === '1000') {
          conditions.push(`(latency_ms >= 1000 AND (error_code IS NULL OR error_code != 'CLIENT_NAVIGATION'))`);
        } else if (options.health === '2500') {
          conditions.push(`(latency_ms >= 2500 AND (error_code IS NULL OR error_code != 'CLIENT_NAVIGATION'))`);
        } else if (options.health === 'exclude_backgrounded') {
          conditions.push(`(context_json IS NULL OR (context_json NOT LIKE '%"wasHidden":true%' AND context_json NOT LIKE '%"rating":"backgrounded"%'))`);
        }
      }

      // Time window filtering
      if (options.timeWindow && options.timeWindow !== 'ALL') {
        if (options.timeWindow === '1h') {
          conditions.push(`created_at >= datetime('now', '-1 hour')`);
        } else if (options.timeWindow === '24h') {
          conditions.push(`created_at >= datetime('now', '-24 hours')`);
        } else if (options.timeWindow === '7d') {
          conditions.push(`created_at >= datetime('now', '-7 days')`);
        } else if (options.timeWindow === '30d') {
          conditions.push(`created_at >= datetime('now', '-30 days')`);
        }
      }

      if (options.search && options.search.trim()) {
        const q = `%${options.search.trim().toLowerCase()}%`;
        conditions.push(`(LOWER(message) LIKE ? OR LOWER(source) LIKE ? OR LOWER(ray_id) LIKE ? OR LOWER(user_email) LIKE ? OR LOWER(path) LIKE ? OR LOWER(client_ip) LIKE ? OR LOWER(country) LIKE ? OR LOWER(city) LIKE ? OR LOWER(COALESCE(error_code, '')) LIKE ?)`);
        params.push(q, q, q, q, q, q, q, q, q);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const orderClause = options.sort === 'slowest'
        ? 'ORDER BY latency_ms DESC NULLS LAST, id DESC'
        : 'ORDER BY id DESC';

      const bottleneckTimeWindow = options.timeWindow === '1h'
        ? `'-1 hour'`
        : options.timeWindow === '24h'
        ? `'-24 hours'`
        : options.timeWindow === '30d'
        ? `'-30 days'`
        : `'-7 days'`;

      const now = Date.now();
      const cachedOverview = logsOverviewCache.get(bottleneckTimeWindow);
      const hasFreshOverview = Boolean(cachedOverview && cachedOverview.exp > now);

      const [logs, countRes, overview] = await Promise.all([
        db.query<ErrorLogRecord>(
          `SELECT id, level, source, error_code, message, context_json, user_id, user_email, ray_id, path, latency_ms, method, status_code, client_ip, country, city, created_at
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
        hasFreshOverview
          ? Promise.resolve(cachedOverview!)
          : Promise.all([
              db.first<{ total: number; debug: number; info: number; warns: number; errors: number; critical: number; slow: number }>(
                `SELECT
                   COUNT(*) as total,
                   SUM(CASE WHEN level = 'debug' THEN 1 ELSE 0 END) as debug,
                   SUM(CASE WHEN level = 'info' THEN 1 ELSE 0 END) as info,
                   SUM(CASE WHEN level = 'warn' THEN 1 ELSE 0 END) as warns,
                   SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as errors,
                   SUM(CASE WHEN level = 'critical' THEN 1 ELSE 0 END) as critical,
                   SUM(CASE WHEN (latency_ms >= 1000 AND (error_code IS NULL OR error_code NOT IN ('WEB_VITALS', 'CLIENT_NAVIGATION'))) OR (error_code = 'WEB_VITALS' AND context_json LIKE '%"rating":"poor"%') THEN 1 ELSE 0 END) as slow
                 FROM system_error_logs
                 WHERE created_at >= datetime('now', '-30 days')`
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
                 WHERE latency_ms IS NOT NULL AND latency_ms > 0 AND path IS NOT NULL AND path != '' AND created_at >= datetime('now', ${bottleneckTimeWindow})
                   AND (method IS NULL OR method != 'CLIENT')
                   AND (error_code IS NULL OR error_code NOT IN ('WEB_VITALS', 'CLIENT_NAVIGATION'))
                 GROUP BY path, method
                 ORDER BY avg_latency DESC, call_count DESC
                 LIMIT 8`
              ).catch(() => []),
            ]).then(([s, b]) => {
              const entry: LogsOverviewEntry = {
                exp: Date.now() + LOGS_OVERVIEW_TTL_MS,
                stats: {
                  total: s?.total || 0,
                  debug: s?.debug || 0,
                  info: s?.info || 0,
                  warns: s?.warns || 0,
                  errors: s?.errors || 0,
                  critical: s?.critical || 0,
                  slow: s?.slow || 0,
                },
                bottlenecks: b || [],
              };
              logsOverviewCache.set(bottleneckTimeWindow, entry);
              return entry;
            }),
      ]);

      return {
        logs: logs || [],
        total: countRes?.count || 0,
        stats: overview.stats,
        bottlenecks: overview.bottlenecks,
      };
    });
  } catch (err: any) {
    console.error('[D1 listErrorLogs] Query failed:', err?.message || err);
    throw err;
  }
}

/**
 * Clears error logs table.
 */
export async function clearErrorLogs(customEnv?: any): Promise<boolean> {
  try {
    return await executeWithAutoSchema(async (db: DbClient) => {
      await db.execute('DELETE FROM system_error_logs');
      logsOverviewCache.clear();
      return true;
    });
  } catch {
    return false;
  }
}
