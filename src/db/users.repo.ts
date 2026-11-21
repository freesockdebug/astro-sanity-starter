// src/db/users.repo.ts
// User & CRM Domain Repository: Profile, Logto Sync, Tiering, Admin Notes

import { getAdminEmailList, formatUtcCutoff, type DbClient } from './client';
import { executeWithAutoSchema } from './schema';
import { getOrdersByUserId } from './orders.repo';
import { getUserLoginHistory } from './logins.repo';
import { createKeyedCache } from '../utils/cache';
import { settingsCache } from './settings.repo';
import type {
  CustomerTier,
  UserStatus,
  UserRecord,
  OrderRecord,
  LoginRecord,
  ListAdminUsersFilter,
  ListAdminUsersResult,
} from './types';

// 30-second Isolate L1 cache for user status & tier (Hybrid Stateless-Stateful Auth)
const userStatusCache = createKeyedCache<UserRecord>(
  async (key) =>
    executeWithAutoSchema(async (db: DbClient) => {
      const isId = key.startsWith('id:');
      const val = isId ? key.slice(3) : key.slice(6);
      const found = await db.first<UserRecord>(
        isId ? 'SELECT * FROM users WHERE id = ? LIMIT 1' : 'SELECT * FROM users WHERE email = ? LIMIT 1',
        [val]
      );
      if (!found) return null;
      const copy = { ...found };
      if (isId && found.email) userStatusCache.seed(`email:${found.email.toLowerCase()}`, copy);
      if (!isId && found.id) userStatusCache.seed(`id:${found.id}`, copy);
      return copy;
    }),
  {
    name: 'users:status',
    scope: 'users',
    ttlMs: () => Math.max(5, settingsCache.peek()?.user_status_cache_ttl_sec ?? 30) * 1000,
    negativeTtlMs: 0,
    maxL1Entries: 1000,
  }
);

export function seedUserStatusCache(record: UserRecord): void {
  if (!record?.id) return;
  const copy = { ...record };
  userStatusCache.seed(`id:${copy.id}`, copy);
  if (copy.email) {
    userStatusCache.seed(`email:${copy.email.toLowerCase()}`, copy);
  }
}

export function invalidateUserStatusCache(userId?: string | null, email?: string | null) {
  const normEmail = email ? email.trim().toLowerCase() : null;
  if (userId) userStatusCache.deleteL1(`id:${userId}`);
  if (normEmail) userStatusCache.deleteL1(`email:${normEmail}`);
  userStatusCache.invalidateWhere(
    (_k, record) =>
      Boolean((userId && record?.id === userId) || (normEmail && record?.email?.toLowerCase() === normEmail))
  );
}

/**
 * Retrieves a user record by user ID or email
 */
export async function getUserByIdOrEmail(userId?: string | null, email?: string | null): Promise<UserRecord | null> {
  if (!userId && !email) return null;
  const normalizedEmail = email ? email.trim().toLowerCase() : null;
  if (userId) {
    const byId = await userStatusCache.get(`id:${userId}`);
    if (byId) return byId;
  }
  if (normalizedEmail) {
    return await userStatusCache.get(`email:${normalizedEmail}`);
  }
  return null;
}

export const getUserById = (userId: string) => getUserByIdOrEmail(userId, null);

/**
 * Upserts a user on login, syncing Logto sub, email, name, and roles.
 * Also backfills company, country, and phone from previous orders if empty.
 */
export async function upsertUserOnLogin(
  user: {
    id: string;
    email: string;
    name?: string;
    roles?: string[];
  },
  options?: { existingUser?: UserRecord | null; skipReturnRead?: boolean }
): Promise<UserRecord | null> {
  if (!user.id || !user.email) return null;

  const normalizedEmail = user.email.trim().toLowerCase();
  const userName = user.name?.trim() || '';
  const rolesJson = JSON.stringify(user.roles || []);

  return executeWithAutoSchema(async (db: DbClient) => {
    const knownExisting = options?.existingUser;
    const needsIdMigration = !knownExisting || knownExisting.id !== user.id;
    const needsProfileBackfill =
      !knownExisting || !knownExisting.company || !knownExisting.country || !knownExisting.phone;

    const statements: Array<{ sql: string; params: any[] }> = [];

    if (needsIdMigration) {
      statements.push(
        {
          sql: `UPDATE users SET id = ? WHERE email = ? AND id != ?`,
          params: [user.id, normalizedEmail, user.id],
        },
        {
          sql: `UPDATE orders
           SET user_id = ?, updated_at = datetime('now')
           WHERE buyer_email = ?
             AND user_id IS NOT NULL AND user_id != '' AND user_id != ?`,
          params: [user.id, normalizedEmail, user.id],
        },
        {
          sql: `UPDATE user_logins
           SET user_id = ?
           WHERE email = ?
             AND user_id != ?`,
          params: [user.id, normalizedEmail, user.id],
        }
      );
    }

    statements.push({
      sql: `INSERT INTO users (id, email, name, logto_roles, last_login_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         name = CASE WHEN excluded.name != '' THEN excluded.name ELSE users.name END,
         logto_roles = excluded.logto_roles,
         last_login_at = datetime('now'),
         updated_at = datetime('now')`,
      params: [user.id, normalizedEmail, userName, rolesJson],
    });

    if (needsProfileBackfill) {
      statements.push({
        sql: `UPDATE users
         SET company = CASE WHEN (company IS NULL OR company = '') THEN
               COALESCE((SELECT company_name FROM orders WHERE (user_id = ? OR buyer_email = ?) AND company_name IS NOT NULL AND company_name != '' ORDER BY created_at DESC LIMIT 1), '')
               ELSE company END,
             country = CASE WHEN (country IS NULL OR country = '') THEN
               COALESCE((SELECT destination_country FROM orders WHERE (user_id = ? OR buyer_email = ?) AND destination_country IS NOT NULL AND destination_country != '' ORDER BY created_at DESC LIMIT 1), '')
               ELSE country END,
             phone = CASE WHEN (phone IS NULL OR phone = '') THEN
               COALESCE((SELECT whatsapp FROM orders WHERE (user_id = ? OR buyer_email = ?) AND whatsapp IS NOT NULL AND whatsapp != '' ORDER BY created_at DESC LIMIT 1), '')
               ELSE phone END
         WHERE id = ?`,
        params: [user.id, normalizedEmail, user.id, normalizedEmail, user.id, normalizedEmail, user.id],
      });
    }

    await db.batch(statements);
    invalidateUserStatusCache(user.id, normalizedEmail);

    if (options?.skipReturnRead) {
      return null;
    }
    return await getUserByIdOrEmail(user.id, normalizedEmail);
  });
}

/**
 * Lists customers/users with order metrics, search, and tier filters
 */
export async function listAdminUsers(filter: ListAdminUsersFilter = {}): Promise<ListAdminUsersResult> {
  const { search, tier, status, timeWindow, page = 1, limit = 20 } = filter;
  const offset = (page - 1) * limit;

  return executeWithAutoSchema(async (db: DbClient) => {
    const whereClauses: string[] = [];
    const params: any[] = [];

    if (tier && tier !== 'ALL') {
      whereClauses.push('u.tier = ?');
      params.push(tier);
    }

    if (status && status !== 'ALL') {
      whereClauses.push('u.status = ?');
      params.push(status);
    }

    const windowMsMap: Record<string, number> = {
      '24h': 24 * 3600_000,
      '7d': 7 * 86_400_000,
      '30d': 30 * 86_400_000,
    };

    if (timeWindow && timeWindow !== 'ALL' && windowMsMap[timeWindow]) {
      const cutoff = formatUtcCutoff(windowMsMap[timeWindow], db.dialect);
      whereClauses.push(`(u.last_login_at >= ? OR u.created_at >= ?)`);
      params.push(cutoff, cutoff);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      whereClauses.push('(u.email LIKE ? OR u.name LIKE ? OR u.company LIKE ? OR u.country LIKE ?)');
      params.push(term, term, term, term);
    }

    const applyUserDataScope = (targetWhere: string[], targetParams: any[], prefix = 'u.') => {
      if (filter.dataScope === 'SELF_AND_POOL') {
        const email = filter.currentAdminEmail?.trim().toLowerCase() || '';
        if (filter.assignedTo === 'UNASSIGNED') {
          targetWhere.push(`(${prefix}assigned_to IS NULL OR ${prefix}assigned_to = '')`);
        } else if (filter.assignedTo) {
          targetWhere.push(`${prefix}assigned_to = ?`);
          targetParams.push(email);
        } else {
          targetWhere.push(`(${prefix}assigned_to = ? OR ${prefix}assigned_to IS NULL OR ${prefix}assigned_to = '')`);
          targetParams.push(email);
        }
      } else if (filter.dataScope === 'SELF_ONLY') {
        const email = filter.currentAdminEmail?.trim().toLowerCase() || '';
        targetWhere.push(`${prefix}assigned_to = ?`);
        targetParams.push(email);
      } else if (filter.assignedTo) {
        if (filter.assignedTo === 'UNASSIGNED') {
          targetWhere.push(`(${prefix}assigned_to IS NULL OR ${prefix}assigned_to = '')`);
        } else {
          targetWhere.push(`${prefix}assigned_to = ?`);
          targetParams.push(filter.assignedTo.trim().toLowerCase());
        }
      }
    };

    applyUserDataScope(whereClauses, params, 'u.');

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Status/Tier capsules stats query: apply timeWindow, search, and dataScope, but exclude tier/status so each tab shows its count for the filtered window
    const statsWhereClauses: string[] = [];
    const statsParams: any[] = [];

    if (timeWindow && timeWindow !== 'ALL' && windowMsMap[timeWindow]) {
      const cutoff = formatUtcCutoff(windowMsMap[timeWindow], db.dialect);
      statsWhereClauses.push(`(last_login_at >= ? OR created_at >= ?)`);
      statsParams.push(cutoff, cutoff);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      statsWhereClauses.push('(email LIKE ? OR name LIKE ? OR company LIKE ? OR country LIKE ?)');
      statsParams.push(term, term, term, term);
    }

    applyUserDataScope(statsWhereClauses, statsParams, '');

    const statsWhereSql = statsWhereClauses.length > 0 ? `WHERE ${statsWhereClauses.join(' AND ')}` : '';

    const querySql = `
      SELECT 
        u.*,
        (SELECT COUNT(*) FROM (SELECT id FROM orders WHERE user_id = u.id UNION SELECT id FROM orders WHERE buyer_email = u.email)) as total_orders,
        (SELECT COUNT(*) FROM (SELECT id FROM orders WHERE user_id = u.id AND status = 'PENDING_APPROVAL' UNION SELECT id FROM orders WHERE buyer_email = u.email AND status = 'PENDING_APPROVAL')) as pending_orders,
        (SELECT COUNT(*) FROM (SELECT id FROM orders WHERE user_id = u.id AND status = 'SHIPPED' UNION SELECT id FROM orders WHERE buyer_email = u.email AND status = 'SHIPPED')) as shipped_orders,
        NULLIF(MAX(
          COALESCE((SELECT MAX(created_at) FROM orders WHERE user_id = u.id), ''),
          COALESCE((SELECT MAX(created_at) FROM orders WHERE buyer_email = u.email), '')
        ), '') as latest_order_date
      FROM users u
      ${whereSql}
      ORDER BY u.last_login_at DESC, u.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const countSql = `SELECT COUNT(*) as cnt FROM users u ${whereSql}`;

    const adminEmails = getAdminEmailList();
    const adminEmailsClause = adminEmails.length > 0
      ? ` OR email IN (${adminEmails.map((e) => `'${e.replace(/'/g, "''")}'`).join(',')})`
      : '';

    const statsSql = `SELECT
      UPPER(COALESCE(tier, 'STANDARD')) as tier,
      status,
      SUM(CASE WHEN (logto_roles LIKE '%admin%'${adminEmailsClause}) THEN 1 ELSE 0 END) as admin_cnt,
      COUNT(*) as cnt
    FROM users ${statsWhereSql}
    GROUP BY UPPER(COALESCE(tier, 'STANDARD')), status`;

    let unclaimedSql = `SELECT COUNT(*) as unclaimed FROM orders WHERE (user_id IS NULL OR user_id = '')`;
    const unclaimedParams: any[] = [];
    if (timeWindow && timeWindow !== 'ALL' && windowMsMap[timeWindow]) {
      unclaimedSql += ` AND created_at >= ?`;
      unclaimedParams.push(formatUtcCutoff(windowMsMap[timeWindow], db.dialect));
    }

    // Concurrently execute users query, count, grouped tier/status stats, and unclaimed orders count
    const [users, countRow, groupedStatsRows, unclaimedRow] = await Promise.all([
      db.query<UserRecord>(querySql, [...params, limit, offset]),
      db.first<{ cnt: number }>(countSql, params),
      db.query<{ tier: string; status: string; admin_cnt: number; cnt: number }>(statsSql, statsParams),
      db.first<{ unclaimed: number }>(unclaimedSql, unclaimedParams),
    ]);

    // Batch-hydrate latest login info only for the retrieved page of users (avoids full-table scan on user_logins)
    if (users && users.length > 0) {
      const userIds = users.map((u) => u.id).filter(Boolean);
      if (userIds.length > 0) {
        const ph = userIds.map(() => '?').join(',');
        const loginRows = await db.query<any>(
          `SELECT user_id, ip, country
           FROM (
             SELECT user_id, ip, country,
                    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
             FROM user_logins
             WHERE user_id IN (${ph})
           ) WHERE rn = 1`,
          userIds
        ).catch(() => []);

        const loginMap = new Map<string, { ip: string; country: string }>();
        for (const row of loginRows) {
          loginMap.set(row.user_id, { ip: row.ip || '', country: row.country || '' });
        }

        for (const u of users) {
          const login = loginMap.get(u.id);
          if (login) {
            u.last_login_ip = login.ip;
            u.last_login_country = login.country;
          }
        }
      }
    }

    const total = Number(countRow?.cnt || 0);

    const tierCounts: Record<string, number> = {};
    let totalAll = 0;
    let totalBlocked = 0;
    let totalAdmins = 0;
    for (const r of groupedStatsRows || []) {
      const cnt = Number(r?.cnt || 0);
      totalAll += cnt;
      if (r?.status === 'BLOCKED') totalBlocked += cnt;
      totalAdmins += Number(r?.admin_cnt || 0);
      if (r?.tier) {
        const key = String(r.tier).toUpperCase();
        tierCounts[key] = (tierCounts[key] || 0) + cnt;
      }
    }

    const stats = {
      all: totalAll,
      vip: tierCounts.VIP || 0,
      partner: tierCounts.PARTNER || 0,
      standard: tierCounts.STANDARD || 0,
      tierCounts,
      blocked: totalBlocked,
      admins: totalAdmins,
      unclaimedGuestOrders: Number(unclaimedRow?.unclaimed || 0),
    };

    return { users, total, page, limit, stats };
  });
}

/**
 * Assigns or reassigns a customer to a dedicated salesperson/manager (or null for pool)
 */
export async function assignUser(identifier: string, assignedTo: string | null): Promise<boolean> {
  const cleanAssignedTo = assignedTo ? assignedTo.trim().toLowerCase() : null;
  return executeWithAutoSchema(async (db: DbClient) => {
    const res = await db.execute(
      `UPDATE users
       SET assigned_to = ?,
           updated_at = datetime('now')
       WHERE id = ? OR email = ?`,
      [cleanAssignedTo, identifier, identifier.toLowerCase()]
    );
    invalidateUserStatusCache(identifier, identifier);
    return res.changes > 0;
  });
}

/**
 * Updates customer tier, account status (ACTIVE/BLOCKED), and admin notes
 */
export async function updateUserAdminMeta(
  userId: string,
  input: {
    tier?: CustomerTier;
    status?: UserStatus;
    adminNotes?: string;
  }
): Promise<boolean> {
  return executeWithAutoSchema(async (db: DbClient) => {
    const res = await db.execute(
      `UPDATE users
       SET tier = COALESCE(?, tier),
           status = COALESCE(?, status),
           admin_notes = COALESCE(?, admin_notes),
           updated_at = datetime('now')
       WHERE id = ?`,
      [input.tier || null, input.status || null, input.adminNotes !== undefined ? input.adminNotes.trim() : null, userId]
    );
    const success = res.changes > 0;
    if (success) invalidateUserStatusCache(userId);
    return success;
  });
}

/**
 * Updates a user's self-maintained profile (Name, Company, Country, Phone/WhatsApp)
 */
export async function updateUserProfile(
  userId: string,
  input: { name?: string; company?: string; country?: string; phone?: string }
): Promise<boolean> {
  if (!userId) return false;

  return executeWithAutoSchema(async (db: DbClient) => {
    const res = await db.execute(
      `UPDATE users
       SET name = COALESCE(?, name),
           company = COALESCE(?, company),
           country = COALESCE(?, country),
           phone = COALESCE(?, phone),
           updated_at = datetime('now')
       WHERE id = ?`,
      [
        input.name !== undefined ? input.name.trim() : null,
        input.company !== undefined ? input.company.trim() : null,
        input.country !== undefined ? input.country.trim() : null,
        input.phone !== undefined ? input.phone.trim() : null,
        userId,
      ]
    );
    const success = res.changes > 0;
    if (success) invalidateUserStatusCache(userId);
    return success;
  });
}

/**
 * Retrieves full user details along with recent orders and recent login history for slide-over drawer
 */
export async function getUserDetailsWithOrders(userId: string): Promise<{
  user: UserRecord | null;
  recentOrders: OrderRecord[];
  recentLogins: LoginRecord[];
}> {
  const user = await getUserByIdOrEmail(userId, null);
  if (!user) {
    return { user: null, recentOrders: [], recentLogins: [] };
  }
  const [orders, logins] = await Promise.all([
    getOrdersByUserId(user.id, user.email),
    getUserLoginHistory(user.id, 10),
  ]);
  return { user, recentOrders: orders.slice(0, 5), recentLogins: logins };
}

