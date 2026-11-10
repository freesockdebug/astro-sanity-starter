// src/db/logins.repo.ts
// Login Audit Domain Repository: Recording, 90-day retention, History Query

import { type DbClient } from './client';
import { executeWithAutoSchema } from './schema';
import type { LoginRecord } from './types';
import { getSystemSettings } from './settings.repo';

/**
 * Records a successful user login with IP, Geo location, and Device information.
 * Automatically retains logs for 90 days by purging records older than 90 days.
 * Respects log_authenticated_users toggle in system_settings.
 */
export async function recordUserLogin(
  input: {
    userId: string;
    email: string;
    ip?: string;
    country?: string;
    city?: string;
    userAgent?: string;
  },
  customEnv?: any
): Promise<boolean> {
  if (!input.userId || !input.email) return false;

  const safeIp = input.ip?.trim() || '';
  const safeCountry = input.country?.trim() || '';
  const safeCity = input.city?.trim() || '';
  const safeUA = input.userAgent?.slice(0, 500) || '';
  const normalizedEmail = input.email.toLowerCase().trim();

  try {
    const settings = await getSystemSettings(customEnv).catch(() => null);
    if (settings && !settings.log_authenticated_users) {
      return false;
    }

    return await executeWithAutoSchema(async (db: DbClient) => {
      const ops: { sql: string; params: any[] }[] = [
        {
          sql: `INSERT INTO user_logins (user_id, email, ip, country, city, user_agent, created_at)
                VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
          params: [input.userId, normalizedEmail, safeIp, safeCountry, safeCity, safeUA],
        },
      ];

      // Probabilistic retention cleanup (10% sampling) reusing cached system settings
      if (Math.random() < 0.1) {
        const retentionDays = settings?.login_retention_days || 90;
        ops.push({
          sql: `DELETE FROM user_logins WHERE created_at < datetime('now', ?)`,
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
  } catch (e) {
    console.warn('[DB] recordUserLogin non-fatal warning:', e);
    return false;
  }
}

/**
 * Retrieves login history for a specific user (User self-service view)
 */
export async function getUserLoginHistory(userId: string, limit: number = 20): Promise<LoginRecord[]> {
  if (!userId) return [];

  try {
    return await executeWithAutoSchema(async (db: DbClient) => {
      return await db.query<LoginRecord>(
        `SELECT * FROM user_logins
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [userId, limit]
      );
    });
  } catch {
    return [];
  }
}

/**
 * Retrieves all recent login records across all users (Admin audit view)
 */
export async function listAllLoginHistory(limit: number = 50): Promise<LoginRecord[]> {
  try {
    return await executeWithAutoSchema(async (db: DbClient) => {
      return await db.query<LoginRecord>(
        `SELECT * FROM user_logins
         ORDER BY created_at DESC
         LIMIT ?`,
        [limit]
      );
    });
  } catch {
    return [];
  }
}

