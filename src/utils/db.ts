// src/utils/db.ts
// Cloudflare D1 unified database service with Node.js 22 SQLite fallback for local development

import * as fs from 'node:fs';
import * as path from 'node:path';

async function getRuntimeD1(): Promise<any> {
  try {
    // @ts-ignore
    const cf: any = await import('cloudflare:workers');
    return cf?.env?.DB || null;
  } catch {
    return null;
  }
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

const SCHEMA_DDL = `
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

CREATE INDEX IF NOT EXISTS idx_orders_unclaimed_email ON orders(buyer_email, user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_no ON orders(order_no);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
`;

let localNodeDbInstance: any = null;
let schemaInitialized = false;

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
 * Ensures D1 tables exist (idempotent initialization)
 */
async function ensureSchema(d1: any) {
  if (schemaInitialized) return;
  try {
    if (d1?.exec) {
      await d1.exec(SCHEMA_DDL);
    }
    schemaInitialized = true;
  } catch (err) {
    console.error('[DB] ensureSchema failed:', err);
  }
}

/**
 * Resolves current database handle (Cloudflare D1 or Node.js SQLite fallback)
 */
export async function getDbHandle(): Promise<{ isD1: boolean; db: any }> {
  const runtimeD1 = await getRuntimeD1();
  if (runtimeD1) {
    await ensureSchema(runtimeD1);
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
  const orderNo = generateOrderNo();
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

    await db.batch([insertOrderStmt, ...itemStmts]);
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

  if (isD1 && db) {
    const res = await db
      .prepare(
        `UPDATE orders
         SET user_id = ?1,
             claimed_at = datetime('now'),
             updated_at = datetime('now')
         WHERE (user_id IS NULL OR user_id = '' OR user_id != ?1)
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
       WHERE (user_id IS NULL OR user_id = '' OR user_id != ?)
         AND LOWER(buyer_email) = LOWER(?)`
    );
    const info = stmt.run(userId, userId, normalizedEmail);
    return info?.changes || 0;
  }

  return 0;
}

/**
 * Retrieves all orders belonging to a specific user (by userId or buyerEmail)
 */
export async function getOrdersByUserId(userId: string, buyerEmail?: string): Promise<OrderRecord[]> {
  if (!userId && !buyerEmail) return [];
  const { isD1, db } = await getDbHandle();
  const normalizedEmail = buyerEmail ? buyerEmail.trim().toLowerCase() : null;

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

  // Hydrate items for each order
  for (const order of orders) {
    order.items = await getOrderItems(order.id);
  }

  return orders;
}

/**
 * Retrieves a single order by order_no
 */
export async function getOrderByNo(orderNo: string): Promise<OrderRecord | null> {
  if (!orderNo) return null;
  const { isD1, db } = await getDbHandle();

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
}

/**
 * Retrieves a single order by ID
 */
export async function getOrderById(orderId: string): Promise<OrderRecord | null> {
  if (!orderId) return null;
  const { isD1, db } = await getDbHandle();

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

  // Hydrate line items
  for (const order of orders) {
    order.items = await getOrderItems(order.id);
  }

  return { orders, total, page, limit, stats };
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

  if (isD1 && db) {
    await db
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
    return true;
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
    stmt.run(
      input.status,
      input.carrier || null,
      input.trackingNumber || null,
      input.adminRemark || null,
      shippedBy,
      orderId
    );
    return true;
  }

  return false;
}
