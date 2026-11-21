// src/db/rbac.repo.ts
// Repository for RBAC Roles and Admin Members Management
import { executeWithAutoSchema } from './schema';
import { createTieredCache, runInBackground } from '../utils/cache';
import type { DbClient } from './client';
import { ALL_MENU_KEYS } from '../config/adminNavigation';

export type DataScope = 'ALL' | 'SELF_AND_POOL' | 'SELF_ONLY';

export interface AdminRole {
  code: string;
  name: string;
  data_scope: DataScope;
  menus: string[];
  permissions: string[];
  description: string;
  is_system: boolean;
  updated_at?: string;
}

export interface AdminMember {
  email: string;
  name: string;
  role_code: string;
  status: 'ACTIVE' | 'DISABLED';
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  is_logto_synced?: boolean;
  assigned_orders?: number;
  assigned_customers?: number;
  last_login_at?: string;
  last_ip?: string;
  last_location?: string;
}

export interface AdminMemberWithRole extends AdminMember {
  role: AdminRole;
}

export const SYSTEM_ROLES: Record<string, AdminRole> = {
  super_admin: {
    code: 'super_admin',
    name: '超级管理员',
    data_scope: 'ALL',
    menus: [...ALL_MENU_KEYS],
    permissions: ['*'],
    description: '全局最高权限，拥有全站所有操作及系统设置能力',
    is_system: true,
  },
  content_editor: {
    code: 'content_editor',
    name: '内容与美工运营',
    data_scope: 'ALL',
    menus: ['products', 'pages', 'cms_config', 'cache'],
    permissions: ['cms:read', 'cms:write', 'cache:purge'],
    description: '负责商品管理、分类维护、页面积木编排与边缘缓存刷新',
    is_system: true,
  },
  sales_manager: {
    code: 'sales_manager',
    name: '销售主管',
    data_scope: 'ALL',
    menus: ['dashboard', 'orders', 'users', 'products', 'members', 'logins'],
    permissions: [
      'dashboard:read',
      'orders:read',
      'orders:approve',
      'orders:ship',
      'orders:assign',
      'orders:export',
      'users:read',
      'users:edit_tier',
      'users:assign',
      'members:manage',
      'dicts:read',
      'cms:read',
      'cms:write',
      'cache:purge',
    ],
    description: '负责团队管理、询盘指派调配、商品报价与客户等级管理',
    is_system: true,
  },
  sales_rep: {
    code: 'sales_rep',
    name: '跟单业务员',
    data_scope: 'SELF_AND_POOL',
    menus: ['orders', 'users'],
    permissions: [
      'orders:read',
      'orders:claim',
      'orders:approve',
      'orders:ship',
      'users:read',
    ],
    description: '负责跟单、询盘公海认领与常规发货审批',
    is_system: true,
  },
  auditor: {
    code: 'auditor',
    name: '运维审计员',
    data_scope: 'ALL',
    menus: ['waf', 'logins', 'logs'],
    permissions: ['waf:read', 'logins:read', 'logs:read'],
    description: '只读查看登录轨迹与系统诊断日志，保障系统安全',
    is_system: true,
  },
};

function parseRoleRow(row: any): AdminRole {
  let menus: string[] = [];
  let permissions: string[] = [];
  try {
    menus = JSON.parse(row.menus_json || '[]');
  } catch {}
  try {
    permissions = JSON.parse(row.permissions_json || '[]');
  } catch {}

  return {
    code: row.code,
    name: row.name,
    data_scope: (row.data_scope as DataScope) || 'ALL',
    menus,
    permissions,
    description: row.description || '',
    is_system: Boolean(row.is_system),
    updated_at: row.updated_at,
  };
}

export interface ActiveTeamMemberLite {
  email: string;
  name: string;
  roleName: string;
}

interface MemberRuntimeStats {
  is_logto_synced: boolean;
  assigned_orders: number;
  assigned_customers: number;
  last_login_at: string;
  last_ip: string;
  last_location: string;
}

const memberStatsCache = createTieredCache<Record<string, MemberRuntimeStats>>({
  name: 'rbac_member_stats',
  scope: 'rbac',
  ttlMs: 30_000,
  fallbackRaw: {},
  fetchRaw: () =>
    executeWithAutoSchema(async (db: DbClient) => {
      try {
        const rows = await db.query<any>(
          `SELECT 
             m.email,
             u.id as user_id, u.last_login_at,
             (SELECT COUNT(*) FROM orders o WHERE o.assigned_to = m.email) as assigned_orders,
             (SELECT COUNT(*) FROM users cu WHERE cu.assigned_to = m.email) as assigned_customers,
             (SELECT ul.ip || '|' || COALESCE(ul.city, '') || '|' || COALESCE(ul.country, '')
              FROM user_logins ul WHERE ul.email = m.email ORDER BY ul.created_at DESC LIMIT 1) as last_login_meta
           FROM admin_members m
           LEFT JOIN users u ON m.email = u.email`
        );
        const map: Record<string, MemberRuntimeStats> = {};
        for (const row of rows || []) {
          const email = String(row.email || '').toLowerCase();
          if (!email) continue;
          const [lastIp = '', lastCity = '', lastCountry = ''] = (row.last_login_meta || '').split('|');
          map[email] = {
            is_logto_synced: Boolean(row.user_id),
            assigned_orders: Number(row.assigned_orders || 0),
            assigned_customers: Number(row.assigned_customers || 0),
            last_login_at: row.last_login_at || '',
            last_ip: lastIp,
            last_location: [lastCity, lastCountry].filter(Boolean).join(', ') || '',
          };
        }
        return map;
      } catch (e: any) {
        const msg = (e?.message || String(e)).toLowerCase();
        if (msg.includes('no such table') || msg.includes('no such column') || msg.includes('has no column named')) {
          throw e;
        }
        console.error('[RBAC] memberStatsCache failed:', e);
        return {};
      }
    }),
});

const adminRolesCache = createTieredCache<AdminRole[]>({
  name: 'rbac_admin_roles',
  scope: 'rbac',
  purgeAction: 'refresh',
  kvKey: 'rbac:roles:v1',
  epochKey: '__rbac',
  ttlMs: Infinity,
  fallbackRaw: Object.values(SYSTEM_ROLES),
  fetchRaw: () =>
    executeWithAutoSchema(async (db: DbClient) => {
      try {
        const res = await db.query<any>('SELECT * FROM admin_roles ORDER BY is_system DESC, code ASC');
        if (res && res.length > 0) return res.map(parseRoleRow);
      } catch (e: any) {
        const msg = (e?.message || String(e)).toLowerCase();
        if (msg.includes('no such table') || msg.includes('no such column') || msg.includes('has no column named')) {
          throw e;
        }
        console.warn('[RBAC] listAdminRoles failed, falling back to SYSTEM_ROLES:', e);
      }
      return null;
    }),
});

const adminMembersCache = createTieredCache<AdminMemberWithRole[]>({
  name: 'rbac_admin_members',
  scope: 'rbac',
  purgeAction: 'refresh',
  kvKey: 'rbac:members:v1',
  ttlMs: Infinity,
  fallbackRaw: [],
  fetchRaw: () =>
    executeWithAutoSchema(async (db: DbClient) => {
      try {
        const rows = await db.query<any>(
          `SELECT 
             m.*,
             r.name as role_name, r.data_scope, r.menus_json, r.permissions_json, r.description as role_desc, r.is_system
           FROM admin_members m
           LEFT JOIN admin_roles r ON m.role_code = r.code
           ORDER BY m.created_at ASC`
        );

        return (rows || []).map((row) => ({
          email: row.email.toLowerCase(),
          name: row.name || row.email.split('@')[0],
          role_code: row.role_code,
          status: (row.status as 'ACTIVE' | 'DISABLED') || 'ACTIVE',
          created_by: row.created_by || '',
          created_at: row.created_at,
          updated_at: row.updated_at,
          is_logto_synced: false,
          assigned_orders: 0,
          assigned_customers: 0,
          last_login_at: '',
          last_ip: '',
          last_location: '',
          role: row.role_name
            ? parseRoleRow({
                code: row.role_code,
                name: row.role_name,
                data_scope: row.data_scope,
                menus_json: row.menus_json,
                permissions_json: row.permissions_json,
                description: row.role_desc,
                is_system: row.is_system,
              })
            : SYSTEM_ROLES[row.role_code] || SYSTEM_ROLES.sales_rep,
        }));
      } catch (e: any) {
        const msg = (e?.message || String(e)).toLowerCase();
        if (msg.includes('no such table') || msg.includes('no such column') || msg.includes('has no column named')) {
          throw e;
        }
        console.error('[RBAC] listAdminMembers failed:', e);
        return null;
      }
    }),
});

export function invalidateRbacCache(): void {
  adminRolesCache.invalidate();
  adminMembersCache.invalidate();
  memberStatsCache.invalidate();
  runInBackground(
    Promise.all([
      adminRolesCache.refresh().catch(() => {}),
      adminMembersCache.refresh().catch(() => {}),
    ])
  );
}

/**
 * Lightweight active team member lookup derived in-memory from adminMembersCache.
 */
export async function listActiveTeamMembersLite(): Promise<ActiveTeamMemberLite[]> {
  const members = await listAdminMembers();
  return members
    .filter((m) => m.status === 'ACTIVE')
    .map((m) => ({
      email: m.email,
      name: m.name,
      roleName: m.role?.name || m.role_code,
    }));
}

export async function listAdminRoles(): Promise<AdminRole[]> {
  return adminRolesCache.get();
}

export async function getAdminRole(code: string): Promise<AdminRole> {
  return executeWithAutoSchema(async (db: DbClient) => {
    try {
      const row = await db.first<any>('SELECT * FROM admin_roles WHERE code = ?', [code]);
      if (row) return parseRoleRow(row);
    } catch (e: any) {
      const msg = (e?.message || String(e)).toLowerCase();
      if (msg.includes('no such table') || msg.includes('no such column') || msg.includes('has no column named')) {
        throw e;
      }
    }
    return SYSTEM_ROLES[code] || SYSTEM_ROLES.sales_rep;
  });
}

export async function listAdminMembers(): Promise<AdminMemberWithRole[]> {
  return adminMembersCache.get();
}

export async function listAdminMembersWithStats(): Promise<AdminMemberWithRole[]> {
  const [members, statsMap] = await Promise.all([adminMembersCache.get(), memberStatsCache.get()]);
  return members.map((m) => {
    const s = statsMap[m.email];
    return s ? { ...m, ...s } : m;
  });
}

export async function getAdminMember(email: string): Promise<AdminMemberWithRole | null> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return null;
  const members = await listAdminMembers();
  return members.find((m) => m.email === cleanEmail) || null;
}

export async function upsertAdminMember(data: {
  email: string;
  name?: string;
  role_code?: string;
  status?: 'ACTIVE' | 'DISABLED';
  created_by?: string;
}): Promise<void> {
  const email = data.email.trim().toLowerCase();
  if (!email) throw new Error('Email is required');

  const roleCode = data.role_code !== undefined ? data.role_code : null;
  const status = data.status || 'ACTIVE';
  const name = data.name !== undefined ? data.name : null;
  const createdBy = data.created_by || 'system';

  await executeWithAutoSchema(async (db: DbClient) => {
    await db.execute(
      `INSERT INTO admin_members (email, name, role_code, status, created_by, updated_at)
       VALUES (?, COALESCE(?, ''), COALESCE(?, 'sales_rep'), ?, ?, datetime('now'))
       ON CONFLICT(email) DO UPDATE SET
         name = COALESCE(?, admin_members.name),
         role_code = COALESCE(?, admin_members.role_code),
         status = excluded.status,
         updated_at = datetime('now')`,
      [email, name, roleCode, status, createdBy, name, roleCode]
    );
    invalidateRbacCache();
  });
}

export async function deleteAdminMember(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  await executeWithAutoSchema(async (db: DbClient) => {
    await db.execute('DELETE FROM admin_members WHERE email = ?', [cleanEmail]);
    invalidateRbacCache();
  });
}

/**
 * Upserts a custom or system role
 */
export async function upsertAdminRole(role: {
  code: string;
  name: string;
  data_scope: DataScope;
  menus: string[];
  permissions: string[];
  description?: string;
  is_system?: boolean;
}): Promise<boolean> {
  const code = role.code.trim().toLowerCase();
  if (!code) throw new Error('Role code is required');
  const name = role.name.trim();
  if (!name) throw new Error('Role name is required');
  const menusJson = JSON.stringify(role.menus || []);
  const permissionsJson = JSON.stringify(role.permissions || []);
  const dataScope = role.data_scope || 'ALL';
  const desc = role.description || '';
  const isSystem = role.is_system ? 1 : 0;

  return executeWithAutoSchema(async (db: DbClient) => {
    const existing = await db.first<any>('SELECT is_system FROM admin_roles WHERE code = ?', [code]);
    const finalIsSystem = existing ? existing.is_system : isSystem;

    await db.execute(
      `INSERT INTO admin_roles (code, name, data_scope, menus_json, permissions_json, description, is_system, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(code) DO UPDATE SET
         name = excluded.name,
         data_scope = excluded.data_scope,
         menus_json = excluded.menus_json,
         permissions_json = excluded.permissions_json,
         description = excluded.description,
         updated_at = datetime('now')`,
      [code, name, dataScope, menusJson, permissionsJson, desc, finalIsSystem]
    );
    invalidateRbacCache();
    return true;
  });
}

/**
 * Deletes a custom role (built-in system roles cannot be deleted)
 */
export async function deleteAdminRole(code: string): Promise<{ success: boolean; error?: string }> {
  const cleanCode = code.trim().toLowerCase();
  if (cleanCode in SYSTEM_ROLES) {
    return { success: false, error: 'Cannot delete built-in system role' };
  }

  return executeWithAutoSchema(async (db: DbClient) => {
    const memberCountRow = await db.first<any>('SELECT COUNT(*) as count FROM admin_members WHERE role_code = ?', [cleanCode]);
    if (memberCountRow && Number(memberCountRow.count) > 0) {
      return { success: false, error: `Cannot delete role: ${memberCountRow.count} team member(s) currently assigned to this role.` };
    }

    await db.execute('DELETE FROM admin_roles WHERE code = ? AND is_system = 0', [cleanCode]);
    invalidateRbacCache();
    return { success: true };
  });
}

/**
 * Returns all team member emails assigned to a specific role code
 */
export async function getMemberEmailsByRole(roleCode: string): Promise<string[]> {
  return executeWithAutoSchema(async (db: DbClient) => {
    const rows = await db.query<any>('SELECT email FROM admin_members WHERE role_code = ?', [roleCode]);
    return (rows || []).map((r) => r.email.toLowerCase());
  });
}

/**
 * Returns registered Logto candidate users for one-click team member authorization
 */
export async function listCandidateLogtoUsers(search?: string): Promise<{ id: string; email: string; name: string; last_login_at: string; is_member: boolean }[]> {
  return executeWithAutoSchema(async (db: DbClient) => {
    const where: string[] = [];
    const params: any[] = [];
    if (search && search.trim()) {
      where.push('(u.email LIKE ? OR u.name LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }
    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await db.query<any>(
      `SELECT u.id, u.email, u.name, u.last_login_at,
              CASE WHEN m.email IS NOT NULL THEN 1 ELSE 0 END as is_member
       FROM users u
       LEFT JOIN admin_members m ON u.email = m.email
       ${whereClause}
       ORDER BY is_member ASC, u.last_login_at DESC
       LIMIT 50`,
      params
    );
    return (rows || []).map((r) => ({
      id: r.id,
      email: r.email.toLowerCase(),
      name: r.name || '',
      last_login_at: r.last_login_at || '',
      is_member: Boolean(r.is_member),
    }));
  });
}

