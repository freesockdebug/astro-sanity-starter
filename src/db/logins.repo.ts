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
      await db.execute(
        `INSERT INTO user_logins (user_id, email, ip, country, city, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [input.userId, normalizedEmail, safeIp, safeCountry, safeCity, safeUA]
      );

      // Probabilistic retention cleanup (10% sampling) to prevent hammering D1 on every single login
      if (Math.random() < 0.1) {
        let retentionDays = 90;
        try {
          const row = await db.first<{ value: string }>(
            `SELECT value FROM system_settings WHERE key = 'login_retention_days' LIMIT 1`
          );
          if (row?.value) {
            const parsed = parseInt(row.value, 10);
            if (!isNaN(parsed) && parsed > 0) {
              retentionDays = parsed;
            }
          }
        } catch {
          // Fallback to default 90 days
        }

        await db.execute(
          `DELETE FROM user_logins WHERE created_at < datetime('now', ?)`,
          [`-${retentionDays} days`]
        );
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

