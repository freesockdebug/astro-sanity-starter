// src/db/users.repo.ts
// User & CRM Domain Repository: Profile, Logto Sync, Tiering, Admin Notes

import { getAdminEmailList, type DbClient } from './client';
import { executeWithAutoSchema } from './schema';
import { getOrdersByUserId } from './orders.repo';
import { getUserLoginHistory } from './logins.repo';
import type {
  CustomerTier,
  UserStatus,
  UserRecord,
  OrderRecord,
  LoginRecord,
  ListAdminUsersFilter,
  ListAdminUsersResult,
} from './types';

/**
 * Retrieves a user record by user ID or email
 */
export async function getUserByIdOrEmail(userId?: string | null, email?: string | null): Promise<UserRecord | null> {
  if (!userId && !email) return null;
  const normalizedEmail = email ? email.trim().toLowerCase() : null;

  try {
    return await executeWithAutoSchema(async (db: DbClient) => {
      // 1. Fast path: Direct Primary Key lookup (1~3ms index seek)
      if (userId) {
        const userById = await db.first<UserRecord>(
          `SELECT * FROM users WHERE id = ? LIMIT 1`,
          [userId]
        );
        if (userById) return userById;
      }

      // 2. Secondary fallback by email if ID not matched or not provided
      if (normalizedEmail) {
        return await db.first<UserRecord>(
          `SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1`,
          [normalizedEmail]
        );
      }
      return null;
    });
  } catch (err) {
    console.warn('[DB] getUserByIdOrEmail non-fatal fallback:', err);
    return null;
  }
}

export const getUserById = (userId: string) => getUserByIdOrEmail(userId, null);

/**
 * Upserts a user on login, syncing Logto sub, email, name, and roles.
 * Also backfills company, country, and phone from previous orders if empty.
 */
export async function upsertUserOnLogin(user: {
  id: string;
  email: string;
  name?: string;
  roles?: string[];
}): Promise<UserRecord | null> {
  if (!user.id || !user.email) return null;

  const normalizedEmail = user.email.trim().toLowerCase();
  const userName = user.name?.trim() || '';
  const rolesJson = JSON.stringify(user.roles || []);

  return executeWithAutoSchema(async (db: DbClient) => {
    // 1-3. Atomically migrate ID, sync historical orders/logins, and upsert user record via batch
    await db.batch([
      {
        sql: `UPDATE users SET id = ? WHERE LOWER(email) = LOWER(?) AND id != ?`,
        params: [user.id, normalizedEmail, user.id],
      },
      {
        sql: `UPDATE orders
         SET user_id = ?, updated_at = datetime('now')
         WHERE LOWER(buyer_email) = LOWER(?)
           AND user_id IS NOT NULL AND user_id != '' AND user_id != ?`,
        params: [user.id, normalizedEmail, user.id],
      },
      {
        sql: `UPDATE user_logins
         SET user_id = ?
         WHERE LOWER(email) = LOWER(?)
           AND user_id != ?`,
        params: [user.id, normalizedEmail, user.id],
      },
      {
        sql: `INSERT INTO users (id, email, name, logto_roles, last_login_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           email = excluded.email,
           name = CASE WHEN excluded.name != '' THEN excluded.name ELSE users.name END,
           logto_roles = excluded.logto_roles,
           last_login_at = datetime('now'),
           updated_at = datetime('now')`,
        params: [user.id, normalizedEmail, userName, rolesJson],
      },
    ]);

    // 4. Backfill company, country, phone from past orders if blank
    await db.execute(
      `UPDATE users
       SET company = CASE WHEN (company IS NULL OR company = '') THEN
             COALESCE((SELECT company_name FROM orders WHERE (user_id = ? OR LOWER(buyer_email) = LOWER(?)) AND company_name IS NOT NULL AND company_name != '' ORDER BY created_at DESC LIMIT 1), '')
             ELSE company END,
           country = CASE WHEN (country IS NULL OR country = '') THEN
             COALESCE((SELECT destination_country FROM orders WHERE (user_id = ? OR LOWER(buyer_email) = LOWER(?)) AND destination_country IS NOT NULL AND destination_country != '' ORDER BY created_at DESC LIMIT 1), '')
             ELSE country END,
           phone = CASE WHEN (phone IS NULL OR phone = '') THEN
             COALESCE((SELECT whatsapp FROM orders WHERE (user_id = ? OR LOWER(buyer_email) = LOWER(?)) AND whatsapp IS NOT NULL AND whatsapp != '' ORDER BY created_at DESC LIMIT 1), '')
             ELSE phone END
       WHERE id = ?`,
      [user.id, normalizedEmail, user.id, normalizedEmail, user.id, normalizedEmail, user.id]
    );

    return await getUserByIdOrEmail(user.id, normalizedEmail);
  });
}

/**
 * Lists customers/users with order metrics, search, and tier filters
 */
export async function listAdminUsers(filter: ListAdminUsersFilter = {}): Promise<ListAdminUsersResult> {
  const { search, tier, status, page = 1, limit = 20 } = filter;
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

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      whereClauses.push('(u.email LIKE ? OR u.name LIKE ? OR u.company LIKE ? OR u.country LIKE ?)');
      params.push(term, term, term, term);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const querySql = `
      SELECT 
        u.*,
        COUNT(DISTINCT o.id) as total_orders,
        COUNT(DISTINCT CASE WHEN o.status = 'PENDING_APPROVAL' THEN o.id END) as pending_orders,
        COUNT(DISTINCT CASE WHEN o.status = 'SHIPPED' THEN o.id END) as shipped_orders,
        MAX(o.created_at) as latest_order_date,
        latest_login.ip as last_login_ip,
        latest_login.country as last_login_country
      FROM users u
      LEFT JOIN orders o ON (o.user_id = u.id OR LOWER(o.buyer_email) = LOWER(u.email))
      LEFT JOIN (
        SELECT user_id, ip, country,
               ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
        FROM user_logins
      ) latest_login ON latest_login.user_id = u.id AND latest_login.rn = 1
      ${whereSql}
      GROUP BY u.id
      ORDER BY u.last_login_at DESC, u.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const countSql = `SELECT COUNT(*) as cnt FROM users u ${whereSql}`;

    const adminEmails = getAdminEmailList();
    const adminEmailsClause = adminEmails.length > 0
      ? ` OR LOWER(email) IN (${adminEmails.map((e) => `'${e.replace(/'/g, "''")}'`).join(',')})`
      : '';

    const statsSql = `SELECT
      COUNT(*) as total_all,
      SUM(CASE WHEN tier = 'VIP' THEN 1 ELSE 0 END) as total_vip,
      SUM(CASE WHEN tier = 'PARTNER' THEN 1 ELSE 0 END) as total_partner,
      SUM(CASE WHEN tier = 'STANDARD' THEN 1 ELSE 0 END) as total_standard,
      SUM(CASE WHEN status = 'BLOCKED' THEN 1 ELSE 0 END) as total_blocked,
      SUM(CASE WHEN (logto_roles LIKE '%admin%'${adminEmailsClause}) THEN 1 ELSE 0 END) as total_admins
    FROM users`;

    const unclaimedSql = `SELECT COUNT(*) as unclaimed FROM orders WHERE user_id IS NULL OR user_id = ''`;

    // Concurrently execute users query, count, tier distribution stats, and unclaimed orders count (1 RTT)
    const [users, countRow, statsRow, unclaimedRow] = await Promise.all([
      db.query<UserRecord>(querySql, [...params, limit, offset]),
      db.first<{ cnt: number }>(countSql, params),
      db.first<any>(statsSql),
      db.first<{ unclaimed: number }>(unclaimedSql),
    ]);

    const total = Number(countRow?.cnt || 0);

    const stats = {
      all: Number(statsRow?.total_all || 0),
      vip: Number(statsRow?.total_vip || 0),
      partner: Number(statsRow?.total_partner || 0),
      standard: Number(statsRow?.total_standard || 0),
      blocked: Number(statsRow?.total_blocked || 0),
      admins: Number(statsRow?.total_admins || 0),
      unclaimedGuestOrders: Number(unclaimedRow?.unclaimed || 0),
    };

    return { users, total, page, limit, stats };
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
    return res.changes > 0;
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
    return res.changes > 0;
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

