// src/db/orders.repo.ts
// Order Domain Repository: CRUD, Status Management, Guest Claiming, Hydration

import { getDb, generateOrderNo, generateUuid, type DbClient } from './client';
import { executeWithAutoSchema } from './schema';
import { invalidateUserStatusCache } from './users.repo';
import type { DataScope } from './rbac.repo';
import type {
  OrderRecord,
  OrderItem,
  CreateOrderInput,
  ListAdminOrdersFilter,
  ListAdminOrdersResult,
  UpdateOrderStatusInput,
  OrderStatus,
} from './types';

export type { OrderStatus };

/**
 * Creates a new B2B Order & line items in D1/SQLite
 */
export async function createOrder(input: CreateOrderInput): Promise<{ orderId: string; orderNo: string }> {
  const orderId = generateUuid();
  const orderNo = input.orderNo || generateOrderNo();
  const normalizedEmail = input.buyerEmail.trim().toLowerCase();
  const totalStyles = input.items.length;
  const totalQuantity = input.items.reduce((acc, item) => acc + (Number(item.quantity) || 1), 0);

  return executeWithAutoSchema(async (db: DbClient) => {
    // 0. Auto-assign to customer's dedicated account manager if already bound
    let assignedTo: string | null = null;
    let assignedAt: string | null = null;
    try {
      const existingUser = await db.first<{ assigned_to: string }>(
        `SELECT assigned_to FROM users WHERE LOWER(email) = ? OR (id IS NOT NULL AND id != '' AND id = ?) LIMIT 1`,
        [normalizedEmail, input.userId || '']
      );
      if (existingUser?.assigned_to) {
        assignedTo = existingUser.assigned_to.trim().toLowerCase();
        assignedAt = new Date().toISOString();
      }
    } catch {}

    // 1. Insert order record
    const insertOrderSql = `INSERT INTO orders (
      id, order_no, user_id, buyer_email, company_name, contact_name,
      whatsapp, destination_country, customer_notes, inquiry_type,
      total_styles, total_quantity, status, assigned_to, assigned_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_APPROVAL', ?, ?)`;

    const orderParams = [
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
      totalQuantity,
      assignedTo,
      assignedAt,
    ];

    // 2. Prepare order line items
    const insertItemSql = `INSERT INTO order_items (
      order_id, product_id, sku, title, variant, quantity, image_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`;

    const operations = [
      { sql: insertOrderSql, params: orderParams },
      ...input.items.map((item) => ({
        sql: insertItemSql,
        params: [
          orderId,
          item.productId || null,
          item.sku || null,
          item.title,
          item.variant || null,
          item.quantity || 1,
          item.imageUrl || null,
        ],
      })),
    ];

    await db.batch(operations);

    // 3. Backfill any empty company, country, phone in users table for this buyer
    const safeCompany = input.companyName?.trim() || '';
    const safeCountry = input.destinationCountry?.trim() || '';
    const safePhone = input.whatsapp?.trim() || '';
    if (safeCompany || safeCountry || safePhone) {
      try {
        const targetId = input.userId ? input.userId.trim() : '';
        const whereClause = targetId ? `id = ?` : `LOWER(email) = ?`;
        const param = targetId || normalizedEmail;
        await db.execute(
          `UPDATE users
           SET company = CASE WHEN (company IS NULL OR company = '') AND ? != '' THEN ? ELSE company END,
               country = CASE WHEN (country IS NULL OR country = '') AND ? != '' THEN ? ELSE country END,
               phone   = CASE WHEN (phone IS NULL OR phone = '') AND ? != '' THEN ? ELSE phone END,
               updated_at = datetime('now')
           WHERE ${whereClause}`,
          [safeCompany, safeCompany, safeCountry, safeCountry, safePhone, safePhone, param]
        );
        invalidateUserStatusCache(input.userId, normalizedEmail);
      } catch {
        // Non-blocking
      }
    }

    return { orderId, orderNo };
  });
}

/**
 * Idempotently claims unclaimed guest orders matching buyer_email
 */
export async function claimOrdersByEmail(buyerEmail: string, userId: string): Promise<number> {
  if (!buyerEmail || !userId) return 0;
  const normalizedEmail = buyerEmail.trim().toLowerCase();

  return executeWithAutoSchema(async (db: DbClient) => {
    const res = await db.execute(
      `UPDATE orders
       SET user_id = ?,
           claimed_at = datetime('now'),
           updated_at = datetime('now')
       WHERE (user_id IS NULL OR user_id = '')
         AND LOWER(buyer_email) = LOWER(?)`,
      [userId, normalizedEmail]
    );
    return res.changes;
  });
}

/**
 * Retrieves all orders belonging to a specific user (by userId or buyerEmail)
 */
export async function getOrdersByUserId(userId: string, buyerEmail?: string): Promise<OrderRecord[]> {
  if (!userId && !buyerEmail) return [];
  const normalizedEmail = buyerEmail ? buyerEmail.trim().toLowerCase() : null;

  return executeWithAutoSchema(async (db: DbClient) => {
    let orders: OrderRecord[];
    if (normalizedEmail && userId) {
      orders = await db.query<OrderRecord>(
        `SELECT * FROM orders
         WHERE user_id = ? OR LOWER(buyer_email) = LOWER(?)
         ORDER BY created_at DESC`,
        [userId, normalizedEmail]
      );
    } else {
      orders = await db.query<OrderRecord>(
        `SELECT * FROM orders
         WHERE user_id = ?
         ORDER BY created_at DESC`,
        [userId]
      );
    }

    await hydrateOrdersItems(orders);
    return orders;
  });
}

/**
 * Retrieves a single order by order_no
 */
export async function getOrderByNo(orderNo: string): Promise<OrderRecord | null> {
  if (!orderNo) return null;

  return executeWithAutoSchema(async (db: DbClient) => {
    const order = await db.first<OrderRecord>(
      `SELECT * FROM orders WHERE order_no = ? LIMIT 1`,
      [orderNo]
    );

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

  return executeWithAutoSchema(async (db: DbClient) => {
    const order = await db.first<OrderRecord>(
      `SELECT * FROM orders WHERE id = ? LIMIT 1`,
      [orderId]
    );

    if (order) {
      order.items = await getOrderItems(order.id);
    }
    return order;
  });
}

/**
 * Batch-hydrates line items for an array of orders (O(1) queries instead of N+1)
 */
async function hydrateOrdersItems(orders: OrderRecord[]): Promise<void> {
  if (!orders || orders.length === 0) return;
  const db = await getDb();

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

    const items = await db.query<OrderItem>(sql, chunkIds);
    for (const item of items) {
      if (item.order_id) {
        const order = orderMap.get(item.order_id);
        if (order) {
          order.items = order.items || [];
          order.items.push(item);
        }
      }
    }
  }
}

/**
 * Helper to fetch order items for a single order
 */
async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  const db = await getDb();
  return db.query<OrderItem>(
    `SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC`,
    [orderId]
  );
}

/**
 * Lists orders for admin workspace with counts & filters
 */
export async function listAdminOrders(filter: ListAdminOrdersFilter = {}): Promise<ListAdminOrdersResult> {
  const { status, search, timeWindow, page = 1, limit = 20 } = filter;
  const offset = (page - 1) * limit;

  return executeWithAutoSchema(async (db: DbClient) => {
    const whereClauses: string[] = [];
    const params: any[] = [];

    if (status && status !== 'ALL') {
      whereClauses.push('status = ?');
      params.push(status);
    }

    const windowMap: Record<string, string> = {
      '24h': '-24 hours',
      '7d': '-7 days',
      '30d': '-30 days',
    };

    if (timeWindow && timeWindow !== 'ALL' && windowMap[timeWindow]) {
      whereClauses.push(`created_at >= datetime('now', ?)`);
      params.push(windowMap[timeWindow]);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      whereClauses.push('(order_no LIKE ? OR buyer_email LIKE ? OR company_name LIKE ?)');
      params.push(term, term, term);
    }

    const applyDataScope = (targetWhere: string[], targetParams: any[]) => {
      if (filter.dataScope === 'SELF_AND_POOL') {
        const email = filter.currentAdminEmail?.trim().toLowerCase() || '';
        if (filter.assignedTo === 'UNASSIGNED') {
          targetWhere.push('(assigned_to IS NULL OR assigned_to = "")');
        } else if (filter.assignedTo) {
          targetWhere.push('LOWER(assigned_to) = ?');
          targetParams.push(email);
        } else {
          targetWhere.push('(LOWER(assigned_to) = ? OR assigned_to IS NULL OR assigned_to = "")');
          targetParams.push(email);
        }
      } else if (filter.dataScope === 'SELF_ONLY') {
        const email = filter.currentAdminEmail?.trim().toLowerCase() || '';
        targetWhere.push('LOWER(assigned_to) = ?');
        targetParams.push(email);
      } else if (filter.assignedTo) {
        if (filter.assignedTo === 'UNASSIGNED') {
          targetWhere.push('(assigned_to IS NULL OR assigned_to = "")');
        } else {
          targetWhere.push('LOWER(assigned_to) = ?');
          targetParams.push(filter.assignedTo.trim().toLowerCase());
        }
      }
    };

    applyDataScope(whereClauses, params);

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Status capsules stats query: apply timeWindow, search, and dataScope, but exclude status so each tab shows its count for the filtered window
    const statsWhereClauses: string[] = [];
    const statsParams: any[] = [];

    if (timeWindow && timeWindow !== 'ALL' && windowMap[timeWindow]) {
      statsWhereClauses.push(`created_at >= datetime('now', ?)`);
      statsParams.push(windowMap[timeWindow]);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      statsWhereClauses.push('(order_no LIKE ? OR buyer_email LIKE ? OR company_name LIKE ?)');
      statsParams.push(term, term, term);
    }

    applyDataScope(statsWhereClauses, statsParams);

    const statsWhereSql = statsWhereClauses.length > 0 ? `WHERE ${statsWhereClauses.join(' AND ')}` : '';

    // 1, 2 & 3. Concurrently fetch filtered orders, total count, and status statistics (collapse 3 RTTs into 1)
    const [orders, countRow, statsRow] = await Promise.all([
      db.query<OrderRecord>(
        `SELECT * FROM orders ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      db.first<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM orders ${whereSql}`,
        params
      ),
      db.first<any>(
        `SELECT
          COUNT(*) as total_all,
          SUM(CASE WHEN status = 'PENDING_APPROVAL' THEN 1 ELSE 0 END) as total_pending,
          SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as total_approved,
          SUM(CASE WHEN status = 'SHIPPED' THEN 1 ELSE 0 END) as total_shipped,
          SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as total_rejected
        FROM orders ${statsWhereSql}`,
        statsParams
      ),
    ]);

    const total = Number(countRow?.cnt || 0);

    const stats = {
      all: Number(statsRow?.total_all || 0),
      pending: Number(statsRow?.total_pending || 0),
      approved: Number(statsRow?.total_approved || 0),
      shipped: Number(statsRow?.total_shipped || 0),
      rejected: Number(statsRow?.total_rejected || 0),
    };

    // 4. Hydrate line items in batch
    await hydrateOrdersItems(orders);

    return { orders, total, page, limit, stats };
  });
}

/**
 * Updates order status (Approve, Reject, or Ship)
 */
export async function updateOrderStatus(orderId: string, input: UpdateOrderStatusInput): Promise<boolean> {
  const shippedBy = input.status === 'SHIPPED' ? (input.adminUser || 'Admin') : null;

  return executeWithAutoSchema(async (db: DbClient) => {
    const res = await db.execute(
      `UPDATE orders
       SET status = ?,
           carrier = COALESCE(?, carrier),
           tracking_number = COALESCE(?, tracking_number),
           admin_remark = COALESCE(?, admin_remark),
           approved_at = CASE WHEN ? = 'APPROVED' THEN datetime('now') ELSE approved_at END,
           shipped_at = CASE WHEN ? = 'SHIPPED' THEN datetime('now') ELSE shipped_at END,
           shipped_by = CASE WHEN ? = 'SHIPPED' THEN ? ELSE shipped_by END,
           updated_at = datetime('now')
       WHERE id = ?`,
      [
        input.status,
        input.carrier || null,
        input.trackingNumber || null,
        input.adminRemark || null,
        input.status,
        input.status,
        input.status,
        shippedBy,
        orderId,
      ]
    );

    return res.changes > 0;
  });
}

/**
 * Assigns or reassigns an order to a specific salesperson (or null for public pool)
 */
export async function assignOrder(orderId: string, assignedTo: string | null): Promise<boolean> {
  return executeWithAutoSchema(async (db: DbClient) => {
    const clean = assignedTo ? assignedTo.trim().toLowerCase() : null;
    const res = await db.execute(
      `UPDATE orders
       SET assigned_to = ?,
           assigned_at = CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE NULL END,
           updated_at = datetime('now')
       WHERE id = ?`,
      [clean, clean, orderId]
    );

    // Auto-bind customer to the sales rep if customer is not yet assigned
    if (clean && res.changes > 0) {
      const orderRow = await db.first<{ user_id: string; buyer_email: string }>(
        'SELECT user_id, buyer_email FROM orders WHERE id = ?',
        [orderId]
      );
      if (orderRow) {
        await db.execute(
          `UPDATE users
           SET assigned_to = ?, updated_at = datetime('now')
           WHERE (id = ? OR LOWER(email) = ?)
             AND (assigned_to IS NULL OR assigned_to = '')`,
          [clean, orderRow.user_id || '', (orderRow.buyer_email || '').toLowerCase()]
        ).catch(() => {});
        invalidateUserStatusCache(orderRow.user_id, orderRow.buyer_email);
      }
    }

    return res.changes > 0;
  });
}

/**
 * Batch-assigns multiple orders to a salesperson (or unassigns to pool)
 */
export async function batchAssignOrders(orderIds: string[], assignedTo: string | null): Promise<number> {
  if (!orderIds || orderIds.length === 0) return 0;
  return executeWithAutoSchema(async (db: DbClient) => {
    const clean = assignedTo ? assignedTo.trim().toLowerCase() : null;
    const placeholders = orderIds.map(() => '?').join(',');
    const res = await db.execute(
      `UPDATE orders
       SET assigned_to = ?,
           assigned_at = CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE NULL END,
           updated_at = datetime('now')
       WHERE id IN (${placeholders})`,
      [clean, clean, ...orderIds]
    );

    if (clean && res.changes > 0) {
      await db.execute(
        `UPDATE users
         SET assigned_to = ?, updated_at = datetime('now')
         WHERE (id IN (SELECT user_id FROM orders WHERE id IN (${placeholders})) OR LOWER(email) IN (SELECT LOWER(buyer_email) FROM orders WHERE id IN (${placeholders})))
           AND (assigned_to IS NULL OR assigned_to = '')`,
        [clean, ...orderIds, ...orderIds]
      ).catch(() => {});
    }

    return res.changes;
  });
}

/**
 * Batch-updates order status (Approve or Reject)
 */
export async function batchUpdateOrderStatus(
  orderIds: string[],
  status: OrderStatus,
  adminUser: string,
  adminRemark?: string,
  scope?: { email: string; dataScope: DataScope }
): Promise<number> {
  if (!orderIds || orderIds.length === 0) return 0;
  return executeWithAutoSchema(async (db: DbClient) => {
    const placeholders = orderIds.map(() => '?').join(',');
    const params: any[] = [status, adminRemark || null, status, status, status, adminUser, ...orderIds];

    let scopeSql = '';
    if (scope && scope.dataScope === 'SELF_ONLY') {
      scopeSql = ' AND LOWER(assigned_to) = ?';
      params.push(scope.email.toLowerCase());
    } else if (scope && scope.dataScope === 'SELF_AND_POOL') {
      scopeSql = ' AND (LOWER(assigned_to) = ? OR assigned_to IS NULL OR assigned_to = \'\')';
      params.push(scope.email.toLowerCase());
    }

    const res = await db.execute(
      `UPDATE orders
       SET status = ?,
           admin_remark = COALESCE(?, admin_remark),
           approved_at = CASE WHEN ? = 'APPROVED' THEN datetime('now') ELSE approved_at END,
           shipped_at = CASE WHEN ? = 'SHIPPED' THEN datetime('now') ELSE shipped_at END,
           shipped_by = CASE WHEN ? = 'SHIPPED' THEN ? ELSE shipped_by END,
           updated_at = datetime('now')
       WHERE id IN (${placeholders})${scopeSql}`,
      params
    );
    return res.changes;
  });
}

/**
 * Fast indexed lookup for count of pending orders (used for admin badges without executing full list query)
 */
export async function getPendingOrdersCount(): Promise<number> {
  return executeWithAutoSchema(async (db: DbClient) => {
    const row = await db.first<{ count: number }>(
      `SELECT COUNT(*) as count FROM orders WHERE status = 'PENDING_APPROVAL'`
    );
    return Number(row?.count || 0);
  });
}

export interface DashboardStats {
  totalOrders: number;
  orders7Days: number;
  pendingReview: number;
  overdueSla: number;
  statusFunnel: {
    pending: number;
    approved: number;
    shipped: number;
    rejected: number;
  };
  topCountries: Array<{ country: string; count: number; percentage: number }>;
  topSkus: Array<{ title: string; slug: string; totalQty: number; count: number }>;
  repWorkloads: Array<{
    email: string;
    name: string;
    roleCode: string;
    totalOrders: number;
    pendingOrders: number;
    shippedOrders: number;
    assignedCustomers: number;
  }>;
}

/**
 * Aggregates business overview statistics for the executive dashboard in a single roundtrip
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  return executeWithAutoSchema(async (db: DbClient) => {
    const [
      totalsRow,
      statusRows,
      countryRows,
      skuRows,
      repRows,
    ] = await Promise.all([
      db.first<any>(`
        SELECT 
          COUNT(*) as total_orders,
          SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as orders_7d,
          SUM(CASE WHEN status = 'PENDING_APPROVAL' THEN 1 ELSE 0 END) as pending_review,
          SUM(CASE WHEN status = 'PENDING_APPROVAL' AND created_at <= datetime('now', '-24 hours') THEN 1 ELSE 0 END) as overdue_sla
        FROM orders
      `),
      db.query<any>(`SELECT status, COUNT(*) as count FROM orders GROUP BY status`),
      db.query<any>(`
        SELECT destination_country, COUNT(*) as count 
        FROM orders 
        WHERE destination_country IS NOT NULL AND destination_country != '' 
        GROUP BY destination_country 
        ORDER BY count DESC 
        LIMIT 5
      `),
      db.query<any>(`
        SELECT title, sku, SUM(quantity) as total_qty, COUNT(id) as count
        FROM order_items
        WHERE title IS NOT NULL AND title != ''
        GROUP BY title
        ORDER BY count DESC
        LIMIT 5
      `),
      db.query<any>(`
        SELECT m.email, m.name, m.role_code,
               (SELECT COUNT(*) FROM orders o WHERE LOWER(o.assigned_to) = LOWER(m.email)) as total_orders,
               (SELECT COUNT(*) FROM orders o WHERE LOWER(o.assigned_to) = LOWER(m.email) AND o.status = 'PENDING_APPROVAL') as pending_orders,
               (SELECT COUNT(*) FROM orders o WHERE LOWER(o.assigned_to) = LOWER(m.email) AND o.status = 'SHIPPED') as shipped_orders,
               (SELECT COUNT(*) FROM users u WHERE LOWER(u.assigned_to) = LOWER(m.email)) as assigned_customers
        FROM admin_members m
        WHERE m.status = 'ACTIVE'
        ORDER BY total_orders DESC
        LIMIT 10
      `),
    ]);

    const total = Number(totalsRow?.total_orders || 0);

    const funnel = {
      pending: 0,
      approved: 0,
      shipped: 0,
      rejected: 0,
    };

    (statusRows || []).forEach((r) => {
      const s = (r.status || '').toUpperCase();
      const cnt = Number(r.count || 0);
      if (s === 'PENDING_APPROVAL') funnel.pending = cnt;
      else if (s === 'APPROVED') funnel.approved = cnt;
      else if (s === 'SHIPPED') funnel.shipped = cnt;
      else if (s === 'REJECTED') funnel.rejected = cnt;
    });

    const topCountries = (countryRows || []).map((r) => {
      const cnt = Number(r.count || 0);
      return {
        country: r.destination_country || 'Unknown',
        count: cnt,
        percentage: total > 0 ? Math.round((cnt / total) * 100) : 0,
      };
    });

    const topSkus = (skuRows || []).map((r) => ({
      title: r.title,
      slug: r.sku || '',
      totalQty: Number(r.total_qty || 0),
      count: Number(r.count || 0),
    }));

    const repWorkloads = (repRows || []).map((r) => ({
      email: r.email,
      name: r.name || r.email.split('@')[0],
      roleCode: r.role_code,
      totalOrders: Number(r.total_orders || 0),
      pendingOrders: Number(r.pending_orders || 0),
      shippedOrders: Number(r.shipped_orders || 0),
      assignedCustomers: Number(r.assigned_customers || 0),
    }));

    return {
      totalOrders: total,
      orders7Days: Number(totalsRow?.orders_7d || 0),
      pendingReview: Number(totalsRow?.pending_review || 0),
      overdueSla: Number(totalsRow?.overdue_sla || 0),
      statusFunnel: funnel,
      topCountries,
      topSkus,
      repWorkloads,
    };
  });
}


