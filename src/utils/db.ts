// src/utils/db.ts
// Cloudflare D1 unified database service with Node.js 22 SQLite fallback for local development

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getRuntimeEnv } from './auth';

function getAdminEmailList(): string[] {
  const raw = getRuntimeEnv('ADMIN_EMAILS') || 'forhaisome@gmail.com';
  return raw.split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);
}

async function getRuntimeD1(): Promise<any> {
  try {
    // @ts-ignore
    const cf: any = await import('cloudflare:workers');
    return cf?.env?.DB || null;
  } catch {
    return null;
  }
}

export type CustomerTier = 'STANDARD' | 'VIP' | 'PARTNER';
export type UserStatus = 'ACTIVE' | 'BLOCKED';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  company: string;
  country: string;
  phone: string;
  logto_roles: string;
  tier: CustomerTier;
  status: UserStatus;
  admin_notes: string;
  last_login_at: string;
  last_login_ip?: string;
  last_login_country?: string;
  created_at: string;
  updated_at: string;
  total_orders?: number;
  pending_orders?: number;
  shipped_orders?: number;
  latest_order_date?: string;
}

export interface LoginRecord {
  id?: number;
  user_id: string;
  email: string;
  ip: string;
  country: string;
  city: string;
  user_agent: string;
  created_at: string;
}

export interface OrderItem {
  id?: number;
  order_id?: string;
  product_id?: string;
  sku?: string;
  title: string;
  variant?: string;
  quantity: number;
  image_url?: string;
}

export type OrderStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'SHIPPED' | 'REJECTED';

export interface OrderRecord {
  id: string;
  order_no: string;
  user_id: string | null;
  buyer_email: string;
  company_name: string | null;
  contact_name: string | null;
  whatsapp: string | null;
  destination_country: string | null;
  customer_notes: string | null;
  inquiry_type: string;
  total_styles: number;
  total_quantity: number;
  status: OrderStatus;
  carrier: string | null;
  tracking_number: string | null;
  admin_remark: string | null;
  claimed_at: string | null;
  approved_at: string | null;
  shipped_at: string | null;
  shipped_by: string | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

export interface CreateOrderInput {
  orderNo?: string;
  userId?: string | null;
  buyerEmail: string;
  companyName?: string;
  contactName?: string;
  whatsapp?: string;
  destinationCountry?: string;
  customerNotes?: string;
  inquiryType?: string;
  items: Array<{
    productId?: string;
    sku?: string;
    title: string;
    variant?: string;
    quantity: number;
    imageUrl?: string;
  }>;
}

const DDL_STATEMENTS = [
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
  `CREATE INDEX IF NOT EXISTS idx_orders_unclaimed_email ON orders(buyer_email, user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_order_no ON orders(order_no)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`,
  `CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
  `CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier)`,
  `CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)`,
  `CREATE INDEX IF NOT EXISTS idx_user_logins_user_id ON user_logins(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_logins_created_at ON user_logins(created_at)`
];

const SCHEMA_DDL = DDL_STATEMENTS.join(';\n');

let localNodeDbInstance: any = null;

function getLocalNodeDb(): any {
  if (localNodeDbInstance) return localNodeDbInstance;
  try {
    // Dynamically load node:sqlite to avoid packaging issues in Cloudflare Worker
    // @ts-ignore
    const { DatabaseSync } = require('node:sqlite');
    const dbDir = path.resolve(process.cwd(), '.wrangler', 'state', 'v3', 'd1');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path.join(dbDir, 'local-dev.sqlite');
    localNodeDbInstance = new DatabaseSync(dbPath);
    localNodeDbInstance.exec(SCHEMA_DDL);
    return localNodeDbInstance;
  } catch (err) {
    console.warn('[DB] node:sqlite initialization failed, using in-memory SQLite shim:', err);
    return null;
  }
}

/**
 * Ensures D1 tables exist (Runs each DDL statement individually to avoid multi-statement parse issues)
 */
async function ensureSchema(d1: any) {
  if (!d1) return;
  for (const sql of DDL_STATEMENTS) {
    try {
      if (d1.prepare) {
        await d1.prepare(sql).run();
      } else if (d1.exec) {
        await d1.exec(sql);
      }
    } catch (err) {
      console.warn('[DB] ensureSchema statement notice:', err);
    }
  }
}

/**
 * Lazy self-healing wrapper: only runs DDL if database throws "no such table"
 */
async function executeWithAutoSchema<T>(isD1: boolean, db: any, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    const errMsg = (err?.message || String(err)).toLowerCase();
    if (isD1 && db && errMsg.includes('no such table')) {
      console.warn('[DB] "no such table" detected; triggering lazy schema initialization...');
      await ensureSchema(db);
      return await fn();
    }
    throw err;
  }
}

/**
 * Resolves current database handle (Cloudflare D1 or Node.js SQLite fallback)
 */
export async function getDbHandle(): Promise<{ isD1: boolean; db: any }> {
  const runtimeD1 = await getRuntimeD1();
  if (runtimeD1) {
    return { isD1: true, db: runtimeD1 };
  }

  const localDb = getLocalNodeDb();
  return { isD1: false, db: localDb };
}

/**
 * Generates official B2B order number: ORD-YYYYMMDD-XXXX
 */
export function generateOrderNo(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .toUpperCase()
    .padStart(4, '0');
  return `ORD-${yyyy}${mm}${dd}-${rand}`;
}

/**
 * Generates UUID v4
 */
function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Creates a new B2B Order & line items in D1/SQLite
 */
export async function createOrder(input: CreateOrderInput): Promise<{ orderId: string; orderNo: string }> {
  const { isD1, db } = await getDbHandle();
  const orderId = generateUuid();
  const orderNo = input.orderNo || generateOrderNo();
  const normalizedEmail = input.buyerEmail.trim().toLowerCase();
  const totalStyles = input.items.length;
  const totalQuantity = input.items.reduce((acc, item) => acc + (Number(item.quantity) || 1), 0);

  if (isD1 && db) {
    // Cloudflare D1 batch transaction
    const insertOrderStmt = db
      .prepare(
        `INSERT INTO orders (
          id, order_no, user_id, buyer_email, company_name, contact_name,
          whatsapp, destination_country, customer_notes, inquiry_type,
          total_styles, total_quantity, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_APPROVAL')`
      )
      .bind(
        orderId,
        orderNo,
        input.userId || null,
        normalizedEmail,
        input.companyName || null,
        input.contactName || null,
        input.whatsapp || null,
        input.destinationCountry || null,
        input.customerNotes || null,
        input.inquiryType || 'quote_cart',
        totalStyles,
        totalQuantity
      );

    const itemStmts = input.items.map((item) =>
      db
        .prepare(
          `INSERT INTO order_items (
            order_id, product_id, sku, title, variant, quantity, image_url
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          orderId,
          item.productId || null,
          item.sku || null,
          item.title,
          item.variant || null,
          item.quantity || 1,
          item.imageUrl || null
        )
    );

    await executeWithAutoSchema(isD1, db, () => db.batch([insertOrderStmt, ...itemStmts]));

    // Backfill any empty company, country, phone in users table for this buyer
    const safeCompany = input.companyName?.trim() || '';
    const safeCountry = input.destinationCountry?.trim() || '';
    const safePhone = input.whatsapp?.trim() || '';
    if (safeCompany || safeCountry || safePhone) {
      try {
        await db
          .prepare(
            `UPDATE users
             SET company = CASE WHEN (company IS NULL OR company = '') AND ?1 != '' THEN ?1 ELSE company END,
                 country = CASE WHEN (country IS NULL OR country = '') AND ?2 != '' THEN ?2 ELSE country END,
                 phone   = CASE WHEN (phone IS NULL OR phone = '') AND ?3 != '' THEN ?3 ELSE phone END,
                 updated_at = datetime('now')
             WHERE (id = ?4 OR LOWER(email) = LOWER(?5))`
          )
          .bind(safeCompany, safeCountry, safePhone, input.userId || '', normalizedEmail)
          .run();
      } catch {
        // Non-blocking
      }
    }

    return { orderId, orderNo };
  }

  // Local Node.js SQLite fallback
  if (db) {
    const insertOrder = db.prepare(
      `INSERT INTO orders (
        id, order_no, user_id, buyer_email, company_name, contact_name,
        whatsapp, destination_country, customer_notes, inquiry_type,
        total_styles, total_quantity, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_APPROVAL')`
    );
    insertOrder.run(
      orderId,
      orderNo,
      input.userId || null,
      normalizedEmail,
      input.companyName || null,
      input.contactName || null,
      input.whatsapp || null,
      input.destinationCountry || null,
      input.customerNotes || null,
      input.inquiryType || 'quote_cart',
      totalStyles,
      totalQuantity
    );

    const insertItem = db.prepare(
      `INSERT INTO order_items (
        order_id, product_id, sku, title, variant, quantity, image_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const item of input.items) {
      insertItem.run(
        orderId,
        item.productId || null,
        item.sku || null,
        item.title,
        item.variant || null,
        item.quantity || 1,
        item.imageUrl || null
      );
    }

    // Backfill empty company, country, phone in users table for this buyer
    const safeCompany = input.companyName?.trim() || '';
    const safeCountry = input.destinationCountry?.trim() || '';
    const safePhone = input.whatsapp?.trim() || '';
    if (safeCompany || safeCountry || safePhone) {
      try {
        const backfillUser = db.prepare(
          `UPDATE users
           SET company = CASE WHEN (company IS NULL OR company = '') AND ? != '' THEN ? ELSE company END,
               country = CASE WHEN (country IS NULL OR country = '') AND ? != '' THEN ? ELSE country END,
               phone   = CASE WHEN (phone IS NULL OR phone = '') AND ? != '' THEN ? ELSE phone END,
               updated_at = datetime('now')
           WHERE (id = ? OR LOWER(email) = LOWER(?))`
        );
        backfillUser.run(safeCompany, safeCompany, safeCountry, safeCountry, safePhone, safePhone, input.userId || '', normalizedEmail);
      } catch {
        // Non-blocking
      }
    }
  }

  return { orderId, orderNo };
}

/**
 * Idempotently claims unclaimed guest orders matching buyer_email
 */
export async function claimOrdersByEmail(buyerEmail: string, userId: string): Promise<number> {
  if (!buyerEmail || !userId) return 0;
  const normalizedEmail = buyerEmail.trim().toLowerCase();
  const { isD1, db } = await getDbHandle();

  return executeWithAutoSchema(isD1, db, async () => {
    if (isD1 && db) {
      const res = await db
        .prepare(
          `UPDATE orders
           SET user_id = ?1,
               claimed_at = datetime('now'),
               updated_at = datetime('now')
           WHERE (user_id IS NULL OR user_id = '')
             AND LOWER(buyer_email) = LOWER(?2)`
        )
        .bind(userId, normalizedEmail)
        .run();
      return res?.meta?.changes || 0;
    }

    if (db) {
      const stmt = db.prepare(
        `UPDATE orders
         SET user_id = ?,
             claimed_at = datetime('now'),
             updated_at = datetime('now')
         WHERE (user_id IS NULL OR user_id = '')
           AND LOWER(buyer_email) = LOWER(?)`
      );
      const info = stmt.run(userId, normalizedEmail);
      return info?.changes || 0;
    }

    return 0;
  });
}

/**
 * Retrieves all orders belonging to a specific user (by userId or buyerEmail)
 */
export async function getOrdersByUserId(userId: string, buyerEmail?: string): Promise<OrderRecord[]> {
  if (!userId && !buyerEmail) return [];
  const { isD1, db } = await getDbHandle();
  const normalizedEmail = buyerEmail ? buyerEmail.trim().toLowerCase() : null;

  return executeWithAutoSchema(isD1, db, async () => {
    let orders: OrderRecord[] = [];
    if (isD1 && db) {
      if (normalizedEmail && userId) {
        const { results } = await db
          .prepare(
            `SELECT * FROM orders
             WHERE user_id = ?1 OR LOWER(buyer_email) = LOWER(?2)
             ORDER BY created_at DESC`
          )
          .bind(userId, normalizedEmail)
          .all();
        orders = (results || []) as OrderRecord[];
      } else {
        const { results } = await db
          .prepare(
            `SELECT * FROM orders
             WHERE user_id = ?1
             ORDER BY created_at DESC`
          )
          .bind(userId)
          .all();
        orders = (results || []) as OrderRecord[];
      }
    } else if (db) {
      if (normalizedEmail && userId) {
        const stmt = db.prepare(
          `SELECT * FROM orders
           WHERE user_id = ? OR LOWER(buyer_email) = LOWER(?)
           ORDER BY created_at DESC`
        );
        orders = (stmt.all(userId, normalizedEmail) || []) as OrderRecord[];
      } else {
        const stmt = db.prepare(
          `SELECT * FROM orders
           WHERE user_id = ?
           ORDER BY created_at DESC`
        );
        orders = (stmt.all(userId) || []) as OrderRecord[];
      }
    }

    // Hydrate items for each order in a single batch
    await hydrateOrdersItems(orders);

    return orders;
  });
}

/**
 * Retrieves a single order by order_no
 */
export async function getOrderByNo(orderNo: string): Promise<OrderRecord | null> {
  if (!orderNo) return null;
  const { isD1, db } = await getDbHandle();

  return executeWithAutoSchema(isD1, db, async () => {
    let order: OrderRecord | null = null;
    if (isD1 && db) {
      const res = await db
        .prepare(`SELECT * FROM orders WHERE order_no = ? LIMIT 1`)
        .bind(orderNo)
        .first();
      order = res as OrderRecord | null;
    } else if (db) {
      const stmt = db.prepare(`SELECT * FROM orders WHERE order_no = ? LIMIT 1`);
      order = (stmt.get(orderNo) || null) as OrderRecord | null;
    }

    if (order) {
      order.items = await getOrderItems(order.id);
    }
    return order;
  });
}

/**
 * Retrieves a single order by ID
 */
export async function getOrderById(orderId: string): Promise<OrderRecord | null> {
  if (!orderId) return null;
  const { isD1, db } = await getDbHandle();

  return executeWithAutoSchema(isD1, db, async () => {
    let order: OrderRecord | null = null;
    if (isD1 && db) {
      const res = await db
        .prepare(`SELECT * FROM orders WHERE id = ? LIMIT 1`)
        .bind(orderId)
        .first();
      order = res as OrderRecord | null;
    } else if (db) {
      const stmt = db.prepare(`SELECT * FROM orders WHERE id = ? LIMIT 1`);
      order = (stmt.get(orderId) || null) as OrderRecord | null;
    }

    if (order) {
      order.items = await getOrderItems(order.id);
    }
    return order;
  });
}

/**
 * Batch-hydrates line items for an array of orders (O(1) database queries instead of N+1)
 */
async function hydrateOrdersItems(orders: OrderRecord[]): Promise<void> {
  if (!orders || orders.length === 0) return;
  const { isD1, db } = await getDbHandle();
  if (!db) {
    for (const order of orders) {
      order.items = order.items || [];
    }
    return;
  }

  const orderMap = new Map<string, OrderRecord>();
  for (const o of orders) {
    o.items = [];
    orderMap.set(o.id, o);
  }

  // Chunk to prevent hitting SQL parameter limits
  const chunkSize = 50;
  const allIds = orders.map((o) => o.id);

  for (let i = 0; i < allIds.length; i += chunkSize) {
    const chunkIds = allIds.slice(i, i + chunkSize);
    const placeholders = chunkIds.map(() => '?').join(',');
    const sql = `SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY id ASC`;

    let items: OrderItem[] = [];
    if (isD1) {
      const { results } = await db.prepare(sql).bind(...chunkIds).all();
      items = (results || []) as OrderItem[];
    } else {
      const stmt = db.prepare(sql);
      items = (stmt.all(...chunkIds) || []) as OrderItem[];
    }

    for (const item of items) {
      const order = orderMap.get(item.order_id);
      if (order) {
        order.items.push(item);
      }
    }
  }
}

/**
 * Helper to fetch order items
 */
async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  const { isD1, db } = await getDbHandle();
  if (isD1 && db) {
    const { results } = await db
      .prepare(`SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC`)
      .bind(orderId)
      .all();
    return (results || []) as OrderItem[];
  } else if (db) {
    const stmt = db.prepare(`SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC`);
    return (stmt.all(orderId) || []) as OrderItem[];
  }
  return [];
}

export interface ListAdminOrdersFilter {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ListAdminOrdersResult {
  orders: OrderRecord[];
  total: number;
  page: number;
  limit: number;
  stats: {
    all: number;
    pending: number;
    approved: number;
    shipped: number;
    rejected: number;
  };
}

/**
 * Lists orders for admin workspace with counts & filters
 */
export async function listAdminOrders(filter: ListAdminOrdersFilter = {}): Promise<ListAdminOrdersResult> {
  const { status, search, page = 1, limit = 20 } = filter;
  const offset = (page - 1) * limit;
  const { isD1, db } = await getDbHandle();

  return executeWithAutoSchema(isD1, db, async () => {
    let whereClauses: string[] = [];
    let params: any[] = [];

    if (status && status !== 'ALL') {
      whereClauses.push('status = ?');
      params.push(status);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      whereClauses.push('(order_no LIKE ? OR buyer_email LIKE ? OR company_name LIKE ?)');
      params.push(term, term, term);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    let orders: OrderRecord[] = [];
    let total = 0;
    let stats = { all: 0, pending: 0, approved: 0, shipped: 0, rejected: 0 };

    if (isD1 && db) {
      // 1. Fetch filtered orders
      const listRes = await db
        .prepare(`SELECT * FROM orders ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .bind(...params, limit, offset)
        .all();
      orders = (listRes.results || []) as OrderRecord[];

      // 2. Count total for filter
      const countRes = await db
        .prepare(`SELECT COUNT(*) as cnt FROM orders ${whereSql}`)
        .bind(...params)
        .first();
      total = Number(countRes?.cnt || 0);

      // 3. Stats by status
      const statsRes = await db
        .prepare(
          `SELECT
            COUNT(*) as total_all,
            SUM(CASE WHEN status = 'PENDING_APPROVAL' THEN 1 ELSE 0 END) as total_pending,
            SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as total_approved,
            SUM(CASE WHEN status = 'SHIPPED' THEN 1 ELSE 0 END) as total_shipped,
            SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as total_rejected
          FROM orders`
        )
        .first();

      stats = {
        all: Number(statsRes?.total_all || 0),
        pending: Number(statsRes?.total_pending || 0),
        approved: Number(statsRes?.total_approved || 0),
        shipped: Number(statsRes?.total_shipped || 0),
        rejected: Number(statsRes?.total_rejected || 0),
      };
    } else if (db) {
      const listStmt = db.prepare(`SELECT * FROM orders ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`);
      orders = (listStmt.all(...params, limit, offset) || []) as OrderRecord[];

      const countStmt = db.prepare(`SELECT COUNT(*) as cnt FROM orders ${whereSql}`);
      const countRow = countStmt.get(...params);
      total = Number(countRow?.cnt || 0);

      const statsStmt = db.prepare(
        `SELECT
          COUNT(*) as total_all,
          SUM(CASE WHEN status = 'PENDING_APPROVAL' THEN 1 ELSE 0 END) as total_pending,
          SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as total_approved,
          SUM(CASE WHEN status = 'SHIPPED' THEN 1 ELSE 0 END) as total_shipped,
          SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as total_rejected
        FROM orders`
      );
      const statsRow = statsStmt.get();
      stats = {
        all: Number(statsRow?.total_all || 0),
        pending: Number(statsRow?.total_pending || 0),
        approved: Number(statsRow?.total_approved || 0),
        shipped: Number(statsRow?.total_shipped || 0),
        rejected: Number(statsRow?.total_rejected || 0),
      };
    }

    // Hydrate line items in batch
    await hydrateOrdersItems(orders);

    return { orders, total, page, limit, stats };
  });
}

export interface UpdateOrderStatusInput {
  status: OrderStatus;
  carrier?: string;
  trackingNumber?: string;
  adminRemark?: string;
  adminUser?: string;
}

/**
 * Updates order status (Approve, Reject, or Ship)
 */
export async function updateOrderStatus(orderId: string, input: UpdateOrderStatusInput): Promise<boolean> {
  const { isD1, db } = await getDbHandle();
  const now = new Date().toISOString();

  let approvedAt = null;
  let shippedAt = null;
  let shippedBy = null;

  if (input.status === 'APPROVED') {
    approvedAt = now;
  } else if (input.status === 'SHIPPED') {
    shippedAt = now;
    shippedBy = input.adminUser || 'Admin';
  }

  return executeWithAutoSchema(isD1, db, async () => {
    if (isD1 && db) {
      const res = await db
        .prepare(
          `UPDATE orders
           SET status = ?1,
               carrier = COALESCE(?2, carrier),
               tracking_number = COALESCE(?3, tracking_number),
               admin_remark = COALESCE(?4, admin_remark),
               approved_at = CASE WHEN ?1 = 'APPROVED' THEN datetime('now') ELSE approved_at END,
               shipped_at = CASE WHEN ?1 = 'SHIPPED' THEN datetime('now') ELSE shipped_at END,
               shipped_by = CASE WHEN ?1 = 'SHIPPED' THEN ?5 ELSE shipped_by END,
               updated_at = datetime('now')
           WHERE id = ?6`
        )
        .bind(
          input.status,
          input.carrier || null,
          input.trackingNumber || null,
          input.adminRemark || null,
          shippedBy,
          orderId
        )
        .run();
      return (res?.meta?.changes ?? 0) > 0;
    }

    if (db) {
      const stmt = db.prepare(
        `UPDATE orders
         SET status = ?1,
             carrier = COALESCE(?2, carrier),
             tracking_number = COALESCE(?3, tracking_number),
             admin_remark = COALESCE(?4, admin_remark),
             approved_at = CASE WHEN ?1 = 'APPROVED' THEN datetime('now') ELSE approved_at END,
             shipped_at = CASE WHEN ?1 = 'SHIPPED' THEN datetime('now') ELSE shipped_at END,
             shipped_by = CASE WHEN ?1 = 'SHIPPED' THEN ?5 ELSE shipped_by END,
             updated_at = datetime('now')
         WHERE id = ?6`
      );
      const info = stmt.run(
        input.status,
        input.carrier || null,
        input.trackingNumber || null,
        input.adminRemark || null,
        shippedBy,
        orderId
      );
      return (info?.changes ?? 0) > 0;
    }

    return false;
  });
}

/**
 * Retrieves a user record by user ID or email
 */
export async function getUserByIdOrEmail(userId?: string | null, email?: string | null): Promise<UserRecord | null> {
  if (!userId && !email) return null;
  const { isD1, db } = await getDbHandle();
  if (!db) return null;

  try {
    return await executeWithAutoSchema(isD1, db, async () => {
      const normalizedEmail = email ? email.trim().toLowerCase() : null;
      let user: UserRecord | null = null;

      if (isD1) {
        if (userId && normalizedEmail) {
          user = await db
            .prepare(`SELECT * FROM users WHERE id = ?1 OR LOWER(email) = LOWER(?2) LIMIT 1`)
            .bind(userId, normalizedEmail)
            .first();
        } else if (userId) {
          user = await db.prepare(`SELECT * FROM users WHERE id = ? LIMIT 1`).bind(userId).first();
        } else if (normalizedEmail) {
          user = await db.prepare(`SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`).bind(normalizedEmail).first();
        }
      } else {
        if (userId && normalizedEmail) {
          const stmt = db.prepare(`SELECT * FROM users WHERE id = ? OR LOWER(email) = LOWER(?) LIMIT 1`);
          user = (stmt.get(userId, normalizedEmail) || null) as UserRecord | null;
        } else if (userId) {
          const stmt = db.prepare(`SELECT * FROM users WHERE id = ? LIMIT 1`);
          user = (stmt.get(userId) || null) as UserRecord | null;
        } else if (normalizedEmail) {
          const stmt = db.prepare(`SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`);
          user = (stmt.get(normalizedEmail) || null) as UserRecord | null;
        }
      }
      return user;
    });
  } catch (err) {
    console.warn('[DB] getUserByIdOrEmail non-fatal fallback:', err);
    return null;
  }
}

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
  const { isD1, db } = await getDbHandle();
  if (!db) return null;

  const normalizedEmail = user.email.trim().toLowerCase();
  const userName = user.name?.trim() || '';
  const rolesJson = JSON.stringify(user.roles || []);

  return executeWithAutoSchema(isD1, db, async () => {
    if (isD1) {
      // 1. If user with same email exists under a different id (account recreated in Logto), migrate the id first
      await db
        .prepare(`UPDATE users SET id = ?1 WHERE LOWER(email) = LOWER(?2) AND id != ?1`)
        .bind(user.id, normalizedEmail)
        .run();

      // Synchronize past orders and login logs to the new user id
      await db
        .prepare(
          `UPDATE orders
           SET user_id = ?1, updated_at = datetime('now')
           WHERE LOWER(buyer_email) = LOWER(?2)
             AND user_id IS NOT NULL AND user_id != '' AND user_id != ?1`
        )
        .bind(user.id, normalizedEmail)
        .run();

      await db
        .prepare(
          `UPDATE user_logins
           SET user_id = ?1
           WHERE user_id != ?1
             AND user_id IN (SELECT id FROM users WHERE LOWER(email) = LOWER(?2))`
        )
        .bind(user.id, normalizedEmail)
        .run();

      await db
        .prepare(
          `INSERT INTO users (id, email, name, logto_roles, last_login_at, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'), datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             email = excluded.email,
             name = CASE WHEN excluded.name != '' THEN excluded.name ELSE users.name END,
             logto_roles = excluded.logto_roles,
             last_login_at = datetime('now'),
             updated_at = datetime('now')`
        )
        .bind(user.id, normalizedEmail, userName, rolesJson)
        .run();

      // Backfill company, country, phone from past orders if blank
      await db
        .prepare(
          `UPDATE users
           SET company = CASE WHEN (company IS NULL OR company = '') THEN
                 COALESCE((SELECT company_name FROM orders WHERE (user_id = ?1 OR LOWER(buyer_email) = LOWER(?2)) AND company_name IS NOT NULL AND company_name != '' ORDER BY created_at DESC LIMIT 1), '')
                 ELSE company END,
               country = CASE WHEN (country IS NULL OR country = '') THEN
                 COALESCE((SELECT destination_country FROM orders WHERE (user_id = ?1 OR LOWER(buyer_email) = LOWER(?2)) AND destination_country IS NOT NULL AND destination_country != '' ORDER BY created_at DESC LIMIT 1), '')
                 ELSE country END,
               phone = CASE WHEN (phone IS NULL OR phone = '') THEN
                 COALESCE((SELECT whatsapp FROM orders WHERE (user_id = ?1 OR LOWER(buyer_email) = LOWER(?2)) AND whatsapp IS NOT NULL AND whatsapp != '' ORDER BY created_at DESC LIMIT 1), '')
                 ELSE phone END
           WHERE id = ?1`
        )
        .bind(user.id, normalizedEmail)
        .run();
    } else {
      // 1. If user with same email exists under a different id (account recreated in Logto), migrate the id first
      const migrateStmt = db.prepare(`UPDATE users SET id = ? WHERE LOWER(email) = LOWER(?) AND id != ?`);
      migrateStmt.run(user.id, normalizedEmail, user.id);

      try {
        const migrateOrdersStmt = db.prepare(
          `UPDATE orders
           SET user_id = ?, updated_at = datetime('now')
           WHERE LOWER(buyer_email) = LOWER(?)
             AND user_id IS NOT NULL AND user_id != '' AND user_id != ?`
        );
        migrateOrdersStmt.run(user.id, normalizedEmail, user.id);

        const migrateLoginsStmt = db.prepare(
          `UPDATE user_logins
           SET user_id = ?
           WHERE user_id != ?
             AND user_id IN (SELECT id FROM users WHERE LOWER(email) = LOWER(?))`
        );
        migrateLoginsStmt.run(user.id, user.id, normalizedEmail);
      } catch {
        // Non-blocking
      }

      const upsertStmt = db.prepare(
        `INSERT INTO users (id, email, name, logto_roles, last_login_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           email = excluded.email,
           name = CASE WHEN excluded.name != '' THEN excluded.name ELSE users.name END,
           logto_roles = excluded.logto_roles,
           last_login_at = datetime('now'),
           updated_at = datetime('now')`
      );
      upsertStmt.run(user.id, normalizedEmail, userName, rolesJson);

      const backfillStmt = db.prepare(
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
         WHERE id = ?`
      );
      backfillStmt.run(user.id, normalizedEmail, user.id, normalizedEmail, user.id, normalizedEmail, user.id);
    }

    return await getUserByIdOrEmail(user.id, normalizedEmail);
  });
}

export interface ListAdminUsersFilter {
  search?: string;
  tier?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface ListAdminUsersResult {
  users: UserRecord[];
  total: number;
  page: number;
  limit: number;
  stats: {
    all: number;
    vip: number;
    partner: number;
    standard: number;
    blocked: number;
    admins: number;
    unclaimedGuestOrders: number;
  };
}

/**
 * Lists customers/users with order metrics, search, and tier filters
 */
export async function listAdminUsers(filter: ListAdminUsersFilter = {}): Promise<ListAdminUsersResult> {
  const { search, tier, status, page = 1, limit = 20 } = filter;
  const offset = (page - 1) * limit;
  const { isD1, db } = await getDbHandle();

  return executeWithAutoSchema(isD1, db, async () => {
    let whereClauses: string[] = [];
    let params: any[] = [];

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

    let users: UserRecord[] = [];
    let total = 0;
    let stats = {
      all: 0,
      vip: 0,
      partner: 0,
      standard: 0,
      blocked: 0,
      admins: 0,
      unclaimedGuestOrders: 0,
    };

    const querySql = `
      SELECT 
        u.*,
        COUNT(o.id) as total_orders,
        SUM(CASE WHEN o.status = 'PENDING_APPROVAL' THEN 1 ELSE 0 END) as pending_orders,
        SUM(CASE WHEN o.status = 'SHIPPED' THEN 1 ELSE 0 END) as shipped_orders,
        MAX(o.created_at) as latest_order_date,
        (SELECT ip FROM user_logins WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) as last_login_ip,
        (SELECT country FROM user_logins WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1) as last_login_country
      FROM users u
      LEFT JOIN orders o ON (o.user_id = u.id OR LOWER(o.buyer_email) = LOWER(u.email))
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

    if (isD1 && db) {
      const listRes = await db.prepare(querySql).bind(...params, limit, offset).all();
      users = (listRes.results || []) as UserRecord[];

      const countRes = await db.prepare(countSql).bind(...params).first();
      total = Number(countRes?.cnt || 0);

      const statsRes = await db
        .prepare(
          `SELECT
            COUNT(*) as total_all,
            SUM(CASE WHEN tier = 'VIP' THEN 1 ELSE 0 END) as total_vip,
            SUM(CASE WHEN tier = 'PARTNER' THEN 1 ELSE 0 END) as total_partner,
            SUM(CASE WHEN tier = 'STANDARD' THEN 1 ELSE 0 END) as total_standard,
            SUM(CASE WHEN status = 'BLOCKED' THEN 1 ELSE 0 END) as total_blocked,
            SUM(CASE WHEN (logto_roles LIKE '%admin%'${adminEmailsClause}) THEN 1 ELSE 0 END) as total_admins
          FROM users`
        )
        .first();

      const unclaimedRes = await db
        .prepare(`SELECT COUNT(*) as unclaimed FROM orders WHERE user_id IS NULL OR user_id = ''`)
        .first();

      stats = {
        all: Number(statsRes?.total_all || 0),
        vip: Number(statsRes?.total_vip || 0),
        partner: Number(statsRes?.total_partner || 0),
        standard: Number(statsRes?.total_standard || 0),
        blocked: Number(statsRes?.total_blocked || 0),
        admins: Number(statsRes?.total_admins || 0),
        unclaimedGuestOrders: Number(unclaimedRes?.unclaimed || 0),
      };
    } else if (db) {
      const listStmt = db.prepare(querySql);
      users = (listStmt.all(...params, limit, offset) || []) as UserRecord[];

      const countStmt = db.prepare(countSql);
      total = Number(countStmt.get(...params)?.cnt || 0);

      const statsStmt = db.prepare(
        `SELECT
          COUNT(*) as total_all,
          SUM(CASE WHEN tier = 'VIP' THEN 1 ELSE 0 END) as total_vip,
          SUM(CASE WHEN tier = 'PARTNER' THEN 1 ELSE 0 END) as total_partner,
          SUM(CASE WHEN tier = 'STANDARD' THEN 1 ELSE 0 END) as total_standard,
          SUM(CASE WHEN status = 'BLOCKED' THEN 1 ELSE 0 END) as total_blocked,
          SUM(CASE WHEN (logto_roles LIKE '%admin%'${adminEmailsClause}) THEN 1 ELSE 0 END) as total_admins
        FROM users`
      );
      const statsRow = statsStmt.get();

      const unclaimedStmt = db.prepare(`SELECT COUNT(*) as unclaimed FROM orders WHERE user_id IS NULL OR user_id = ''`);
      const unclaimedRow = unclaimedStmt.get();

      stats = {
        all: Number(statsRow?.total_all || 0),
        vip: Number(statsRow?.total_vip || 0),
        partner: Number(statsRow?.total_partner || 0),
        standard: Number(statsRow?.total_standard || 0),
        blocked: Number(statsRow?.total_blocked || 0),
        admins: Number(statsRow?.total_admins || 0),
        unclaimedGuestOrders: Number(unclaimedRow?.unclaimed || 0),
      };
    }

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
  const { isD1, db } = await getDbHandle();
  if (!db) return false;

  return executeWithAutoSchema(isD1, db, async () => {
    if (isD1) {
      const res = await db
        .prepare(
          `UPDATE users
           SET tier = COALESCE(?1, tier),
               status = COALESCE(?2, status),
               admin_notes = COALESCE(?3, admin_notes),
               updated_at = datetime('now')
           WHERE id = ?4`
        )
        .bind(input.tier || null, input.status || null, input.adminNotes !== undefined ? input.adminNotes.trim() : null, userId)
        .run();
      return (res?.meta?.changes ?? 0) > 0;
    }

    const stmt = db.prepare(
      `UPDATE users
       SET tier = COALESCE(?, tier),
           status = COALESCE(?, status),
           admin_notes = COALESCE(?, admin_notes),
           updated_at = datetime('now')
       WHERE id = ?`
    );
    const info = stmt.run(input.tier || null, input.status || null, input.adminNotes !== undefined ? input.adminNotes.trim() : null, userId);
    return (info?.changes ?? 0) > 0;
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
  const { isD1, db } = await getDbHandle();
  if (!db) return false;

  return executeWithAutoSchema(isD1, db, async () => {
    if (isD1) {
      const res = await db
        .prepare(
          `UPDATE users
           SET name = COALESCE(?1, name),
               company = COALESCE(?2, company),
               country = COALESCE(?3, country),
               phone = COALESCE(?4, phone),
               updated_at = datetime('now')
           WHERE id = ?5`
        )
        .bind(
          input.name !== undefined ? input.name.trim() : null,
          input.company !== undefined ? input.company.trim() : null,
          input.country !== undefined ? input.country.trim() : null,
          input.phone !== undefined ? input.phone.trim() : null,
          userId
        )
        .run();
      return (res?.meta?.changes ?? 0) > 0;
    }

    const stmt = db.prepare(
      `UPDATE users
       SET name = COALESCE(?, name),
           company = COALESCE(?, company),
           country = COALESCE(?, country),
           phone = COALESCE(?, phone),
           updated_at = datetime('now')
       WHERE id = ?`
    );
    const info = stmt.run(
      input.name !== undefined ? input.name.trim() : null,
      input.company !== undefined ? input.company.trim() : null,
      input.country !== undefined ? input.country.trim() : null,
      input.phone !== undefined ? input.phone.trim() : null,
      userId
    );
    return (info?.changes ?? 0) > 0;
  });
}

/**
 * Records a successful user login with IP, Geo location, and Device information.
 * Automatically retains logs for 90 days by purging records older than 90 days.
 */
export async function recordUserLogin(input: {
  userId: string;
  email: string;
  ip?: string;
  country?: string;
  city?: string;
  userAgent?: string;
}): Promise<boolean> {
  if (!input.userId || !input.email) return false;
  const { isD1, db } = await getDbHandle();
  if (!db) return false;

  const safeIp = input.ip?.trim() || '';
  const safeCountry = input.country?.trim() || '';
  const safeCity = input.city?.trim() || '';
  const safeUA = input.userAgent?.slice(0, 500) || '';

  return executeWithAutoSchema(isD1, db, async () => {
    try {
      if (isD1) {
        await db
          .prepare(
            `INSERT INTO user_logins (user_id, email, ip, country, city, user_agent, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))`
          )
          .bind(input.userId, input.email.toLowerCase().trim(), safeIp, safeCountry, safeCity, safeUA)
          .run();

        // 90-day retention cleanup
        await db.prepare(`DELETE FROM user_logins WHERE created_at < datetime('now', '-90 days')`).run();
        return true;
      }

      const stmt = db.prepare(
        `INSERT INTO user_logins (user_id, email, ip, country, city, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
      );
      stmt.run(input.userId, input.email.toLowerCase().trim(), safeIp, safeCountry, safeCity, safeUA);

      db.prepare(`DELETE FROM user_logins WHERE created_at < datetime('now', '-90 days')`).run();
      return true;
    } catch (e) {
      console.warn('[DB] recordUserLogin non-fatal warning:', e);
      return false;
    }
  });
}

/**
 * Retrieves login history for a specific user (User self-service view)
 */
export async function getUserLoginHistory(userId: string, limit: number = 20): Promise<LoginRecord[]> {
  if (!userId) return [];
  const { isD1, db } = await getDbHandle();
  if (!db) return [];

  return executeWithAutoSchema(isD1, db, async () => {
    try {
      if (isD1) {
        const res = await db
          .prepare(
            `SELECT * FROM user_logins
             WHERE user_id = ?1
             ORDER BY created_at DESC
             LIMIT ?2`
          )
          .bind(userId, limit)
          .all();
        return (res?.results || []) as LoginRecord[];
      }

      const stmt = db.prepare(
        `SELECT * FROM user_logins
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      );
      return (stmt.all(userId, limit) || []) as LoginRecord[];
    } catch {
      return [];
    }
  });
}

/**
 * Retrieves all recent login records across all users (Admin audit view)
 */
export async function listAllLoginHistory(limit: number = 50): Promise<LoginRecord[]> {
  const { isD1, db } = await getDbHandle();
  if (!db) return [];

  return executeWithAutoSchema(isD1, db, async () => {
    try {
      if (isD1) {
        const res = await db
          .prepare(
            `SELECT * FROM user_logins
             ORDER BY created_at DESC
             LIMIT ?1`
          )
          .bind(limit)
          .all();
        return (res?.results || []) as LoginRecord[];
      }

      const stmt = db.prepare(
        `SELECT * FROM user_logins
         ORDER BY created_at DESC
         LIMIT ?`
      );
      return (stmt.all(limit) || []) as LoginRecord[];
    } catch {
      return [];
    }
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
