// src/db/logs.repo.ts
// System Error & Diagnostics Domain Repository: D1 logging, probabilistic pruning & queries

import { type DbClient } from './client';
import { executeWithAutoSchema } from './schema';
import { getSystemSettings } from './settings.repo';

export interface ErrorLogRecord {
  id: number;
  level: 'info' | 'warn' | 'error' | 'critical';
  source: string;
  error_code?: string | null;
  message: string;
  context_json?: string | null;
  user_id?: string | null;
  user_email?: string | null;
  ray_id?: string | null;
  path?: string | null;
  created_at: string;
}

export interface RecordErrorLogInput {
  level?: 'info' | 'warn' | 'error' | 'critical';
  source: string;
  errorCode?: string | null;
  message: string;
  context?: any;
  userId?: string | null;
  userEmail?: string | null;
  rayId?: string | null;
  path?: string | null;
}

/**
 * Records a diagnostic / error log into D1.
 * Respects systemSettings:
 * 1. enable_error_logging: if false, completely skips D1 writes.
 * 2. log_authenticated_users: if false and userId is present, skips D1 write.
 * 3. log_retention_days: probabilistic prune (5% sampling) to prevent unbounded table growth.
 */
export async function recordErrorLog(
  input: RecordErrorLogInput,
  customEnv?: any
): Promise<boolean> {
  if (!input.message || !input.source) return false;

  try {
    const settings = await getSystemSettings(customEnv).catch(() => null);
    if (settings && !settings.enable_error_logging) {
      return false;
    }

    // "对于已登陆的用户，控制用户是否开启日志记录"
    const isAuthenticatedUser = Boolean(input.userId || input.userEmail);
    if (isAuthenticatedUser && settings && !settings.log_authenticated_users) {
      return false;
    }

    const level = input.level || 'error';
    const source = input.source.slice(0, 100);
    const errorCode = input.errorCode ? input.errorCode.slice(0, 50) : null;
    const message = input.message.slice(0, 1000);
    const userId = input.userId ? input.userId.slice(0, 100) : null;
    const userEmail = input.userEmail ? input.userEmail.slice(0, 120).toLowerCase().trim() : null;
    const rayId = input.rayId ? input.rayId.slice(0, 100) : null;
    const path = input.path ? input.path.slice(0, 200) : null;

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
        `INSERT INTO system_error_logs (level, source, error_code, message, context_json, user_id, user_email, ray_id, path, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [level, source, errorCode, message, contextJson, userId, userEmail, rayId, path]
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
 * Lists error logs with pagination, level filter, and search.
 */
export async function listErrorLogs(
  options: {
    level?: string;
    source?: string;
    search?: string;
    limit?: number;
    page?: number;
  } = {},
  customEnv?: any
): Promise<{
  logs: ErrorLogRecord[];
  total: number;
  stats: { total: number; errors: number; warns: number; critical: number };
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

      const [logs, countRes, statsRes] = await Promise.all([
        db.query<ErrorLogRecord>(
          `SELECT id, level, source, error_code, message, context_json, user_id, user_email, ray_id, path, created_at
           FROM system_error_logs
           ${whereClause}
           ORDER BY id DESC
           LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        ),
        db.first<{ count: number }>(
          `SELECT COUNT(*) as count FROM system_error_logs ${whereClause}`,
          params
        ),
        db.first<{ total: number; errors: number; warns: number; critical: number }>(
          `SELECT
             COUNT(*) as total,
             SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as errors,
             SUM(CASE WHEN level = 'warn' THEN 1 ELSE 0 END) as warns,
             SUM(CASE WHEN level = 'critical' THEN 1 ELSE 0 END) as critical
           FROM system_error_logs`
        ),
      ]);

      return {
        logs: logs || [],
        total: countRes?.count || 0,
        stats: {
          total: statsRes?.total || 0,
          errors: statsRes?.errors || 0,
          warns: statsRes?.warns || 0,
          critical: statsRes?.critical || 0,
        },
      };
    });
  } catch (err) {
    return {
      logs: [],
      total: 0,
      stats: { total: 0, errors: 0, warns: 0, critical: 0 },
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

