-- Cloudflare D1 Database Schema for B2B Commerce Starter (Orders, Users, Settings)
-- Tables: orders, order_items, users

CREATE TABLE IF NOT EXISTS orders (
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
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  product_id TEXT,
  sku TEXT,
  title TEXT,
  variant TEXT,
  quantity INTEGER DEFAULT 1,
  image_url TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS users (
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
  last_login_at TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_logins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  ip TEXT DEFAULT '',
  country TEXT DEFAULT '',
  city TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_by TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Seed initial super administrator
INSERT OR IGNORE INTO system_settings (key, value, updated_by)
VALUES ('co_admin_emails', '', 'system_init');

-- Indexes for performance & idempotent claiming
CREATE INDEX IF NOT EXISTS idx_orders_unclaimed_email ON orders(buyer_email, user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_no ON orders(order_no);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_user_logins_user_id ON user_logins(user_id);
CREATE INDEX IF NOT EXISTS idx_user_logins_created_at ON user_logins(created_at);

