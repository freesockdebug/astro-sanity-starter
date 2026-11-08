// src/db/schema.ts
// Schema Definitions, DDL Statements & Auto-Migration Self-Healing Engine

import { getDb, type DbClient } from './client';

export const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  user_id TEXT,
  buyer_email TEXT NOT NULL,
  company_name TEXT,
  contact_name TEXT,
  whatsapp TEXT,
  destination_country TEXT,
  customer_notes TEXT,
  inquiry_type TEXT DEFAULT 'quote_cart',
  total_styles INTEGER DEFAULT 0,
  total_quantity INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
  carrier TEXT,
  tracking_number TEXT,
  admin_remark TEXT,
  claimed_at TEXT,
  approved_at TEXT,
  shipped_at TEXT,
  shipped_by TEXT,
  assigned_to TEXT DEFAULT NULL,
  assigned_at TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)`,
  `CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  product_id TEXT,
  sku TEXT,
  title TEXT,
  variant TEXT,
  quantity INTEGER DEFAULT 1,
  image_url TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
)`,
  `CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT DEFAULT '',
  company TEXT DEFAULT '',
  country TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  logto_roles TEXT DEFAULT '[]',
  tier TEXT DEFAULT 'STANDARD',
  status TEXT DEFAULT 'ACTIVE',
  admin_notes TEXT DEFAULT '',
  assigned_to TEXT DEFAULT NULL,
  last_login_at TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)`,
  `CREATE TABLE IF NOT EXISTS user_logins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  ip TEXT DEFAULT '',
  country TEXT DEFAULT '',
  city TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
)`,
  `CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_by TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
)`,
  `CREATE TABLE IF NOT EXISTS system_error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL,
  source TEXT NOT NULL,
  error_code TEXT,
  message TEXT NOT NULL,
  context_json TEXT,
  user_id TEXT,
  user_email TEXT,
  ray_id TEXT,
  path TEXT,
  latency_ms INTEGER,
  method TEXT,
  status_code INTEGER,
  client_ip TEXT,
  country TEXT,
  city TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`,
  `CREATE TABLE IF NOT EXISTS admin_roles (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data_scope TEXT NOT NULL DEFAULT 'ALL',
  menus_json TEXT NOT NULL,
  permissions_json TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_system INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (datetime('now'))
)`,
  `CREATE TABLE IF NOT EXISTS admin_members (
  email TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  role_code TEXT NOT NULL DEFAULT 'sales_rep',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
)`,
  `CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  before_json TEXT,
  after_json TEXT,
  diff_json TEXT,
  client_ip TEXT,
  country TEXT,
  duration_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
)`,
  `INSERT OR IGNORE INTO admin_roles (code, name, data_scope, menus_json, permissions_json, description, is_system) VALUES
  ('super_admin', '超级管理员', 'ALL', '["orders","users","logins","logs","settings"]', '["*"]', '全局最高权限，拥有全站所有操作及系统设置能力', 1),
  ('sales_manager', '销售主管', 'ALL', '["orders","users","logins"]', '["orders:read","orders:approve","orders:ship","orders:assign","orders:export","users:read","users:edit_tier","users:assign"]', '负责团队管理、询盘指派调配与客户等级管理', 1),
  ('sales_rep', '跟单业务员', 'SELF_AND_POOL', '["orders","users"]', '["orders:read","orders:claim","orders:approve","orders:ship","users:read"]', '负责跟单、询盘公海认领与常规发货审批', 1),
  ('auditor', '运维审计员', 'ALL', '["logins","logs"]', '["logins:read","logs:read"]', '只读查看登录轨迹与系统诊断日志，保障系统安全', 1)`,
  `INSERT OR IGNORE INTO system_settings (key, value, updated_by) VALUES ('co_admin_emails', '', 'system_init')`,
  `CREATE INDEX IF NOT EXISTS idx_orders_unclaimed_email ON orders(buyer_email, user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_order_no ON orders(order_no)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_assigned_to ON orders(assigned_to)`,
  `CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
  `CREATE INDEX IF NOT EXISTS idx_users_lower_email ON users(LOWER(email))`,
  `CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier)`,
  `CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)`,
  `CREATE INDEX IF NOT EXISTS idx_users_assigned_to ON users(assigned_to)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_lower_email ON orders(LOWER(buyer_email))`,
  `CREATE INDEX IF NOT EXISTS idx_user_logins_user_id ON user_logins(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_logins_created_at ON user_logins(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_error_logs_level ON system_error_logs(level)`,
  `CREATE INDEX IF NOT EXISTS idx_error_logs_source ON system_error_logs(source)`,
  `CREATE INDEX IF NOT EXISTS idx_error_logs_ray_id ON system_error_logs(ray_id)`,
  `CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON system_error_logs(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_error_logs_latency ON system_error_logs(latency_ms)`,
  `CREATE INDEX IF NOT EXISTS idx_error_logs_path ON system_error_logs(path)`,
  `CREATE INDEX IF NOT EXISTS idx_error_logs_ip ON system_error_logs(client_ip)`,
  `CREATE INDEX IF NOT EXISTS idx_error_logs_country ON system_error_logs(country)`,
  `CREATE INDEX IF NOT EXISTS idx_admin_members_role ON admin_members(role_code)`,
  `CREATE INDEX IF NOT EXISTS idx_admin_members_status ON admin_members(status)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON admin_audit_logs(action)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON admin_audit_logs(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON admin_audit_logs(target_type, target_id)`
];

export const SCHEMA_DDL = DDL_STATEMENTS.join(';\n');

let isSchemaVerifiedInIsolate = false;
let schemaInitPromise: Promise<void> | null = null;

/**
 * Ensures database tables, columns and indexes exist
 */
export async function ensureSchema(rawOrClient?: any, force = false): Promise<void> {
  if (schemaInitPromise) return schemaInitPromise;
  if (!force && isSchemaVerifiedInIsolate) return;
  let target = rawOrClient;
  if (!target) {
    const client = await getDb();
    target = client.raw;
  } else if (target.raw) {
    target = target.raw;
  }
  if (!target) return;

  schemaInitPromise = (async () => {
    // 1. Idempotent column migrations for existing databases before indexes
    const columnMigrations = [
      'ALTER TABLE system_error_logs ADD COLUMN latency_ms INTEGER DEFAULT NULL',
      'ALTER TABLE system_error_logs ADD COLUMN method TEXT DEFAULT NULL',
      'ALTER TABLE system_error_logs ADD COLUMN status_code INTEGER DEFAULT NULL',
      'ALTER TABLE system_error_logs ADD COLUMN client_ip TEXT DEFAULT NULL',
      'ALTER TABLE system_error_logs ADD COLUMN country TEXT DEFAULT NULL',
      'ALTER TABLE system_error_logs ADD COLUMN city TEXT DEFAULT NULL',
      'ALTER TABLE orders ADD COLUMN assigned_to TEXT DEFAULT NULL',
      'ALTER TABLE orders ADD COLUMN assigned_at TEXT DEFAULT NULL',
      'ALTER TABLE users ADD COLUMN assigned_to TEXT DEFAULT NULL',
    ];

    for (const m of columnMigrations) {
      try {
        if (target.prepare) {
          await target.prepare(m).run();
        } else if (target.exec) {
          await target.exec(m);
        }
      } catch {
        // Column already exists or table not yet initialized
      }
    }

    // 2. Ensure core tables exist first
    if (target.batch && target.prepare) {
      try {
        await target.batch(DDL_STATEMENTS.map((sql) => target.prepare(sql)));
      } catch {
        // Sequential fallback
      }
    }

    // 3. Sequential execution fallback for statements and indexes
    for (const sql of DDL_STATEMENTS) {
      try {
        if (target.prepare) {
          await target.prepare(sql).run();
        } else if (target.exec) {
          await target.exec(sql);
        }
      } catch {
        // Already exists
      }
    }

    // Mark as verified only after all DDL and migrations complete
    isSchemaVerifiedInIsolate = true;
  })().finally(() => {
    schemaInitPromise = null;
  });

  return schemaInitPromise;
}

/**
 * Lazy self-healing wrapper: only runs DDL if database throws "no such table"
 * Supports both modern executeWithAutoSchema((db) => Promise<T>)
 * and legacy executeWithAutoSchema(isD1, rawDb, () => Promise<T>)
 */
export async function executeWithAutoSchema<T>(
  arg1: any,
  arg2?: any,
  arg3?: any
): Promise<T> {
  // Legacy signature: executeWithAutoSchema(isD1: boolean, rawDb: any, fn: () => Promise<T>)
  if (typeof arg1 === 'boolean') {
    const isD1 = arg1;
    const rawDb = arg2;
    const fn = arg3 as () => Promise<T>;
    try {
      return await fn();
    } catch (err: any) {
      const errMsg = (err?.message || String(err)).toLowerCase();
      if (isD1 && rawDb && (errMsg.includes('no such table') || errMsg.includes('no such column') || errMsg.includes('has no column named'))) {
        console.warn('[DB] Schema discrepancy detected; triggering lazy schema migration...');
        await ensureSchema(rawDb, true);
        return await fn();
      }
      throw err;
    }
  }

  // Modern signature: executeWithAutoSchema((db: DbClient) => Promise<T>)
  const fn = arg1 as (db: DbClient) => Promise<T>;
  const db = await getDb();

  // On isolate cold start, trigger non-blocking schema check so new incremental indexes apply automatically
  if (!isSchemaVerifiedInIsolate) {
    ensureSchema(db).catch(() => { });
  }

  try {
    return await fn(db);
  } catch (err: any) {
    const errMsg = (err?.message || String(err)).toLowerCase();
    if (errMsg.includes('no such table') || errMsg.includes('no such column') || errMsg.includes('has no column named')) {
      console.warn('[DB] Schema discrepancy detected; triggering lazy schema migration...');
      await ensureSchema(db.raw, true);
      return await fn(db);
    }
    throw err;
  }
}

