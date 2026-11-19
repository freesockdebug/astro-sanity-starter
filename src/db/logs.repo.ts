// src/db/logs.repo.ts
// System Error & Diagnostics Domain Repository: D1 logging, probabilistic pruning, latency profiling & queries

import { formatUtcCutoff, toPostgresSql, type DbClient } from './client';
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
  hit_count?: number | null;
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

const INSERT_ERROR_LOG_SQL = `INSERT INTO system_error_logs (
  level, source, error_code, message, context_json, user_id, user_email, ray_id, path, latency_ms, method, status_code, client_ip, country, city, hit_count, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`;

const IGNORED_LOG_PATH_PREFIXES = ['/api/admin/logs', '/admin/logs', '/_astro/', '/favicon'];
const IGNORED_LOG_PATH_EXTS = ['.css', '.js', '.png', '.jpg', '.svg', '.ico'];

interface PreparedLogEntry {
  level: DiagnosticLogLevel;
  source: string;
  errorCode: string | null;
  message: string;
  contextJson: string | null;
  userId: string | null;
  userEmail: string | null;
  rayId: string | null;
  path: string | null;
  latencyMs: number | null;
  method: string | null;
  statusCode: number | null;
  clientIp: string | null;
  country: string | null;
  city: string | null;
  hitCount: number;
  wafCoalesce?: {
    key: string;
    hitCount: number;
    lastBlockedAt: string;
    windowMs: number;
  };
}

function buildMergedWafContextJson(
  prevJson: string | null | undefined,
  opts: { prevRowHitCount?: number | null; hitIncrement?: number; absHitCount?: number | null; lastBlockedAt: string }
): { json: string; hitCount: number } {
  let ctxObj: Record<string, any> = {};
  if (prevJson) {
    try {
      ctxObj = JSON.parse(prevJson) || {};
    } catch {
      ctxObj = {};
    }
  }
  const prevNested = ctxObj.context && typeof ctxObj.context === 'object' ? ctxObj.context : {};
  const jsonHits = Math.max(0, Number(ctxObj.hitCount ?? prevNested.hitCount ?? 1));
  const rowHits = opts.prevRowHitCount != null ? Math.max(0, Number(opts.prevRowHitCount)) : 0;
  const prevHits = Math.max(jsonHits, rowHits);
  const nextHitCount = opts.hitIncrement && opts.hitIncrement > 0
    ? prevHits + opts.hitIncrement
    : Math.max(prevHits, Number(opts.absHitCount ?? prevHits));

  const nextCtx: Record<string, any> = {
    ...ctxObj,
    hitCount: nextHitCount,
    lastBlockedAt: opts.lastBlockedAt,
  };
  if (ctxObj.context && typeof ctxObj.context === 'object') {
    nextCtx.context = {
      ...prevNested,
      hitCount: nextHitCount,
      lastBlockedAt: opts.lastBlockedAt,
    };
  }
  return { json: JSON.stringify(nextCtx).slice(0, 4000), hitCount: nextHitCount };
}

function prepareLogEntry(input: RecordErrorLogInput, settings: any): PreparedLogEntry | null {
  if (!input?.message || !input?.source) return null;

  // Prevent infinite recursive logging loops on diagnostics workbench and static assets
  if (input.path) {
    const p = input.path.toLowerCase();
    if (IGNORED_LOG_PATH_PREFIXES.some((pre) => p.startsWith(pre)) || IGNORED_LOG_PATH_EXTS.some((ext) => p.endsWith(ext))) {
      return null;
    }
  }

  // Privacy boundary for authenticated users
  if ((input.userId || input.userEmail) && settings && !settings.log_authenticated_users) {
    return null;
  }

  const level = (input.level?.toLowerCase() || 'error') as DiagnosticLogLevel;
  const minWeight = LOG_LEVEL_WEIGHT[settings?.log_min_level || 'warn'] ?? LOG_LEVEL_WEIGHT.warn;
  const currentWeight = LOG_LEVEL_WEIGHT[level] ?? LOG_LEVEL_WEIGHT.error;
  const slowThreshold = settings?.slow_request_threshold_ms || 1000;
  const errorCode = input.errorCode ? input.errorCode.slice(0, 50) : null;

  // Event-Aware SLA判定: 区分服务端请求、Web Vitals与客户端事件，杜绝前端普通LCP误当慢请求刷屏
  let isSlow = false;
  if (typeof input.latencyMs === 'number' && !isNaN(input.latencyMs)) {
    if (errorCode === 'WEB_VITALS') {
      const ctx = input.context && typeof input.context === 'object' ? (input.context as any) : null;
      const isBackgrounded = Boolean(ctx?.wasHidden || ctx?.rating === 'backgrounded');
      const rating = String(ctx?.rating || '');
      isSlow = !isBackgrounded && (rating === 'poor' || input.latencyMs > 4000);
    } else if (errorCode !== 'CLIENT_NAVIGATION') {
      isSlow = input.latencyMs >= slowThreshold;
    }
  }

  if (errorCode === 'CLIENT_NAVIGATION') return null;
  if (errorCode === 'WEB_VITALS' && !isSlow) return null;
  if (currentWeight < minWeight && !isSlow) return null;

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

  let wafCoalesce: PreparedLogEntry['wafCoalesce'];
  if (source === 'EDGE_WAF' && clientIp && errorCode) {
    const rawCtx = input.context && typeof input.context === 'object' ? (input.context as any) : null;
    const nested = rawCtx?.context && typeof rawCtx.context === 'object' ? rawCtx.context : rawCtx;
    if (!nested?.shadow) {
      wafCoalesce = {
        key: `${clientIp}:${errorCode}`,
        hitCount: Math.max(1, Number(nested?.hitCount ?? rawCtx?.hitCount ?? 1)),
        lastBlockedAt: String(nested?.lastBlockedAt ?? rawCtx?.lastBlockedAt ?? rawCtx?.timestamp ?? new Date().toISOString()),
        windowMs: errorCode === 'WAF_STRICT_RATE_LIMIT' ? 120_000 : 900_000,
      };
    }
  }

  return {
    level,
    source,
    errorCode,
    message,
    contextJson,
    userId,
    userEmail,
    rayId,
    path,
    latencyMs,
    method,
    statusCode,
    clientIp,
    country,
    city,
    hitCount: wafCoalesce?.hitCount ?? 1,
    wafCoalesce,
  };
}

function toInsertParams(e: PreparedLogEntry): any[] {
  return [
    e.level, e.source, e.errorCode, e.message, e.contextJson, e.userId, e.userEmail,
    e.rayId, e.path, e.latencyMs, e.method, e.statusCode, e.clientIp, e.country, e.city, e.hitCount,
  ];
}

function coalesceWafEntriesInBatch(entries: PreparedLogEntry[]): {
  wafEntries: PreparedLogEntry[];
  plainEntries: PreparedLogEntry[];
} {
  const wafMap = new Map<string, PreparedLogEntry>();
  const plainEntries: PreparedLogEntry[] = [];

  for (const entry of entries) {
    if (!entry.wafCoalesce) {
      plainEntries.push(entry);
      continue;
    }
    const existing = wafMap.get(entry.wafCoalesce.key);
    if (!existing || !existing.wafCoalesce) {
      wafMap.set(entry.wafCoalesce.key, entry);
    } else {
      const nextHits = existing.wafCoalesce.hitCount + entry.wafCoalesce.hitCount;
      const latestAt = entry.wafCoalesce.lastBlockedAt > existing.wafCoalesce.lastBlockedAt
        ? entry.wafCoalesce.lastBlockedAt
        : existing.wafCoalesce.lastBlockedAt;
      existing.wafCoalesce.hitCount = nextHits;
      existing.wafCoalesce.lastBlockedAt = latestAt;
      existing.hitCount = nextHits;
      const merged = buildMergedWafContextJson(existing.contextJson, {
        absHitCount: nextHits,
        lastBlockedAt: latestAt,
      });
      existing.contextJson = merged.json;
    }
  }

  const wafEntries = Array.from(wafMap.values()).sort((a, b) =>
    (a.wafCoalesce?.key || '').localeCompare(b.wafCoalesce?.key || '')
  );
  return { wafEntries, plainEntries };
}

async function persistPreparedLogEntries(entries: PreparedLogEntry[], settings: any): Promise<boolean> {
  if (entries.length === 0) return true;
  const { wafEntries, plainEntries } = coalesceWafEntriesInBatch(entries);
  const retentionCutMs = (settings?.log_retention_days || 30) * 86_400_000;
  const shouldPrune = Math.random() < 0.05;

  try {
    return await executeWithAutoSchema(async (db: DbClient) => {
      const findWafSql = `SELECT id, hit_count, context_json FROM system_error_logs WHERE source = 'EDGE_WAF' AND client_ip = ? AND error_code = ? AND created_at >= ? ORDER BY id DESC LIMIT 1`;
      const updateWafSql = `UPDATE system_error_logs SET context_json = ?, hit_count = ? WHERE id = ?`;
      const deleteRetentionSql = `DELETE FROM system_error_logs WHERE created_at < ?`;

      // Postgres / Hyperdrive: serialize per (client_ip, error_code) via transaction-scoped advisory lock
      // so concurrent Worker Isolates never insert duplicate EDGE_WAF rows for the same active block window.
      if (db.dialect === 'postgres' && typeof db.raw?.begin === 'function' && wafEntries.length > 0) {
        await db.raw.begin(async (tx: any) => {
          for (const entry of wafEntries) {
            const meta = entry.wafCoalesce!;
            await tx.unsafe('SELECT pg_advisory_xact_lock(hashtext($1))', [`waf_log:${meta.key}`]);
            const rows = await tx.unsafe(toPostgresSql(findWafSql), [
              entry.clientIp,
              entry.errorCode,
              formatUtcCutoff(meta.windowMs, 'postgres'),
            ]);
            const existingRow = rows?.[0];
            if (existingRow?.id) {
              const merged = buildMergedWafContextJson(existingRow.context_json, {
                prevRowHitCount: existingRow.hit_count,
                hitIncrement: meta.hitCount,
                lastBlockedAt: meta.lastBlockedAt,
              });
              await tx.unsafe(toPostgresSql(updateWafSql), [merged.json, merged.hitCount, existingRow.id]);
            } else {
              await tx.unsafe(toPostgresSql(INSERT_ERROR_LOG_SQL), toInsertParams(entry));
            }
          }
          for (const entry of plainEntries) {
            await tx.unsafe(toPostgresSql(INSERT_ERROR_LOG_SQL), toInsertParams(entry));
          }
          if (shouldPrune) {
            await tx.unsafe(toPostgresSql(deleteRetentionSql), [formatUtcCutoff(retentionCutMs, 'postgres')]);
          }
        });
        return true;
      }

      const ops: { sql: string; params: any[] }[] = [];
      for (const entry of wafEntries) {
        const meta = entry.wafCoalesce!;
        const existingRow = await db.first<{ id: number; hit_count: number | null; context_json: string | null }>(findWafSql, [
          entry.clientIp,
          entry.errorCode,
          formatUtcCutoff(meta.windowMs, db.dialect),
        ]);
        if (existingRow?.id) {
          const merged = buildMergedWafContextJson(existingRow.context_json, {
            prevRowHitCount: existingRow.hit_count,
            hitIncrement: meta.hitCount,
            lastBlockedAt: meta.lastBlockedAt,
          });
          ops.push({
            sql: updateWafSql,
            params: [merged.json, merged.hitCount, existingRow.id],
          });
        } else {
          ops.push({ sql: INSERT_ERROR_LOG_SQL, params: toInsertParams(entry) });
        }
      }

      for (const entry of plainEntries) {
        ops.push({ sql: INSERT_ERROR_LOG_SQL, params: toInsertParams(entry) });
      }

      if (shouldPrune) {
        ops.push({ sql: deleteRetentionSql, params: [formatUtcCutoff(retentionCutMs, db.dialect)] });
      }

      if (ops.length === 1) {
        await db.execute(ops[0].sql, ops[0].params);
      } else if (ops.length > 1) {
        await db.batch(ops);
      }
      return true;
    });
  } catch {
    return false;
  }
}

/**
 * Records a single diagnostic / error log (coalescing active EDGE_WAF blocks per IP + code).
 */
export async function recordErrorLog(
  input: RecordErrorLogInput,
  customEnv?: any
): Promise<boolean> {
  try {
    const settings = await getSystemSettings(customEnv).catch(() => null);
    if (settings && !settings.enable_error_logging) return false;
    const entry = prepareLogEntry(input, settings);
    if (!entry) return false;
    return await persistPreparedLogEntries([entry], settings);
  } catch {
    return false;
  }
}

/**
 * Micro-batch log processor: coalesces EDGE_WAF bursts & writes log entries cleanly.
 */
export async function recordErrorLogsBatch(
  inputs: RecordErrorLogInput[],
  customEnv?: any
): Promise<boolean> {
  if (!inputs || inputs.length === 0) return true;
  try {
    const settings = await getSystemSettings(customEnv).catch(() => null);
    if (settings && !settings.enable_error_logging) return false;
    const entries = inputs
      .map((item) => prepareLogEntry(item, settings))
      .filter((e): e is PreparedLogEntry => Boolean(e));
    if (entries.length === 0) return true;
    return await persistPreparedLogEntries(entries, settings);
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
        const windowMsMap: Record<string, number> = {
          '1h': 3600_000,
          '24h': 24 * 3600_000,
          '7d': 7 * 86_400_000,
          '30d': 30 * 86_400_000,
        };
        const ms = windowMsMap[options.timeWindow];
        if (ms) {
          conditions.push(`created_at >= ?`);
          params.push(formatUtcCutoff(ms, db.dialect));
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

      const bottleneckWindowKey = options.timeWindow === '1h'
        ? '1h'
        : options.timeWindow === '24h'
        ? '24h'
        : options.timeWindow === '30d'
        ? '30d'
        : '7d';
      const bottleneckMsMap: Record<string, number> = {
        '1h': 3600_000,
        '24h': 24 * 3600_000,
        '7d': 7 * 86_400_000,
        '30d': 30 * 86_400_000,
      };
      const thirtyDaysCutoff = formatUtcCutoff(30 * 86_400_000, db.dialect);
      const bottleneckCutoff = formatUtcCutoff(bottleneckMsMap[bottleneckWindowKey], db.dialect);

      const now = Date.now();
      const cachedOverview = logsOverviewCache.get(bottleneckWindowKey);
      const hasFreshOverview = Boolean(cachedOverview && cachedOverview.exp > now);

      const [logs, countRes, overview] = await Promise.all([
        db.query<ErrorLogRecord>(
          `SELECT id, level, source, error_code, message, context_json, user_id, user_email, ray_id, path, latency_ms, method, status_code, client_ip, country, city, hit_count, created_at
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
                 WHERE created_at >= ?`,
                [thirtyDaysCutoff]
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
                 WHERE latency_ms IS NOT NULL AND latency_ms > 0 AND path IS NOT NULL AND path != '' AND created_at >= ?
                   AND (method IS NULL OR method != 'CLIENT')
                   AND (error_code IS NULL OR error_code NOT IN ('WEB_VITALS', 'CLIENT_NAVIGATION'))
                 GROUP BY path, method
                 ORDER BY avg_latency DESC, call_count DESC
                 LIMIT 8`,
                [bottleneckCutoff]
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
              logsOverviewCache.set(bottleneckWindowKey, entry);
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
 * Aggregates 24h EDGE_WAF attack events (row count) and total intercepted hits via pure SQL SUM(hit_count).
 */
export async function getWaf24hSummary(
  customEnv?: any
): Promise<{ eventsCount: number; totalHits: number }> {
  try {
    return await executeWithAutoSchema(async (db: DbClient) => {
      const cutoff = formatUtcCutoff(24 * 3600_000, db.dialect);
      const row = await db.first<{ events_count: number; total_hits: number }>(
        `SELECT COUNT(*) AS events_count, COALESCE(SUM(COALESCE(hit_count, 1)), 0) AS total_hits
         FROM system_error_logs
         WHERE source = 'EDGE_WAF' AND created_at >= ?`,
        [cutoff]
      );
      return {
        eventsCount: Number(row?.events_count || 0),
        totalHits: Number(row?.total_hits || 0),
      };
    });
  } catch {
    return { eventsCount: 0, totalHits: 0 };
  }
}

/**
 * Updates cumulative hitCount and lastBlockedAt on the latest matching EDGE_WAF log row.
 */
export async function updateLatestWafLogStats(
  params: {
    clientIp?: string | null;
    errorCode?: string | null;
    hitCount: number;
    hitDelta?: number;
    lastBlockedAt: string;
  },
  customEnv?: any
): Promise<boolean> {
  try {
    const settings = await getSystemSettings(customEnv).catch(() => null);
    if (settings && !settings.enable_error_logging) {
      return false;
    }

    const clientIp = params.clientIp ? params.clientIp.slice(0, 50) : null;
    const errorCode = params.errorCode ? params.errorCode.slice(0, 50) : null;

    return await executeWithAutoSchema(async (db: DbClient) => {
      const conds = [`source = 'EDGE_WAF'`];
      const qParams: any[] = [];
      if (clientIp) {
        conds.push('client_ip = ?');
        qParams.push(clientIp);
      } else {
        conds.push(`(client_ip IS NULL OR client_ip = '')`);
      }
      if (errorCode) {
        conds.push('error_code = ?');
        qParams.push(errorCode);
      }

      const selectSql = `SELECT id, hit_count, context_json FROM system_error_logs WHERE ${conds.join(' AND ')} ORDER BY id DESC LIMIT 1`;
      const updateSql = `UPDATE system_error_logs SET context_json = ?, hit_count = ? WHERE id = ?`;
      const mergeOpts = {
        hitIncrement: params.hitDelta && params.hitDelta > 0 ? params.hitDelta : undefined,
        absHitCount: params.hitCount,
        lastBlockedAt: params.lastBlockedAt,
      };

      if (db.dialect === 'postgres' && typeof db.raw?.begin === 'function' && clientIp && errorCode) {
        let updated = false;
        await db.raw.begin(async (tx: any) => {
          await tx.unsafe('SELECT pg_advisory_xact_lock(hashtext($1))', [`waf_log:${clientIp}:${errorCode}`]);
          const rows = await tx.unsafe(toPostgresSql(selectSql), qParams);
          const row = rows?.[0];
          if (!row?.id) return;
          const merged = buildMergedWafContextJson(row.context_json, {
            ...mergeOpts,
            prevRowHitCount: row.hit_count,
          });
          await tx.unsafe(toPostgresSql(updateSql), [merged.json, merged.hitCount, row.id]);
          updated = true;
        });
        return updated;
      }

      const row = await db.first<{ id: number; hit_count: number | null; context_json: string | null }>(selectSql, qParams);
      if (!row?.id) return false;

      const merged = buildMergedWafContextJson(row.context_json, {
        ...mergeOpts,
        prevRowHitCount: row.hit_count,
      });
      await db.execute(updateSql, [merged.json, merged.hitCount, row.id]);
      return true;
    });
  } catch {
    return false;
  }
}

/**
 * Clears error logs table (uses TRUNCATE on PostgreSQL to reclaim physical disk & index space immediately).
 */
export async function clearErrorLogs(customEnv?: any): Promise<boolean> {
  try {
    return await executeWithAutoSchema(async (db: DbClient) => {
      if (db.dialect === 'postgres') {
        await db.execute('TRUNCATE TABLE system_error_logs');
      } else {
        await db.execute('DELETE FROM system_error_logs');
      }
      logsOverviewCache.clear();
      return true;
    });
  } catch {
    return false;
  }
}
