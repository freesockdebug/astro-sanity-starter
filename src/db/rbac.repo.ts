// src/db/rbac.repo.ts
// Repository for RBAC Roles and Admin Members Management
import { executeWithAutoSchema } from './schema';
import type { DbClient } from './client';

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
}

export interface AdminMemberWithRole extends AdminMember {
  role: AdminRole;
}

export const SYSTEM_ROLES: Record<string, AdminRole> = {
  super_admin: {
    code: 'super_admin',
    name: '超级管理员',
    data_scope: 'ALL',
    menus: ['orders', 'users', 'logins', 'logs', 'settings'],
    permissions: ['*'],
    description: '全局最高权限，拥有全站所有操作及系统设置能力',
    is_system: true,
  },
  sales_manager: {
    code: 'sales_manager',
    name: '销售主管',
    data_scope: 'ALL',
    menus: ['orders', 'users', 'logins'],
    permissions: [
      'orders:read',
      'orders:approve',
      'orders:ship',
      'orders:assign',
      'orders:export',
      'users:read',
      'users:edit_tier',
      'users:assign',
    ],
    description: '负责团队管理、询盘指派调配与客户等级管理',
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
    menus: ['logins', 'logs'],
    permissions: ['logins:read', 'logs:read'],
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

export async function listAdminRoles(): Promise<AdminRole[]> {
  return executeWithAutoSchema(async (db: DbClient) => {
    try {
      const res = await db.query<any>('SELECT * FROM admin_roles ORDER BY is_system DESC, code ASC');
      if (res && res.length > 0) {
        return res.map(parseRoleRow);
      }
    } catch (e: any) {
      const msg = (e?.message || String(e)).toLowerCase();
      if (msg.includes('no such table') || msg.includes('no such column') || msg.includes('has no column named')) {
        throw e;
      }
      console.warn('[RBAC] listAdminRoles failed, falling back to SYSTEM_ROLES:', e);
    }
    return Object.values(SYSTEM_ROLES);
  });
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
  return executeWithAutoSchema(async (db: DbClient) => {
    try {
      const rows = await db.query<any>(
        `SELECT m.*, r.name as role_name, r.data_scope, r.menus_json, r.permissions_json, r.description as role_desc, r.is_system
         FROM admin_members m
         LEFT JOIN admin_roles r ON m.role_code = r.code
         ORDER BY m.created_at ASC`
      );

      return (rows || []).map((row) => ({
        email: row.email.toLowerCase(),
        name: row.name || '',
        role_code: row.role_code,
        status: (row.status as 'ACTIVE' | 'DISABLED') || 'ACTIVE',
        created_by: row.created_by || '',
        created_at: row.created_at,
        updated_at: row.updated_at,
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
      return [];
    }
  });
}

export async function getAdminMember(email: string): Promise<AdminMemberWithRole | null> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return null;

  return executeWithAutoSchema(async (db: DbClient) => {
    try {
      const row = await db.first<any>(
        `SELECT m.*, r.name as role_name, r.data_scope, r.menus_json, r.permissions_json, r.description as role_desc, r.is_system
         FROM admin_members m
         LEFT JOIN admin_roles r ON m.role_code = r.code
         WHERE LOWER(m.email) = ?`,
        [cleanEmail]
      );

      if (!row) return null;

      return {
        email: row.email.toLowerCase(),
        name: row.name || '',
        role_code: row.role_code,
        status: (row.status as 'ACTIVE' | 'DISABLED') || 'ACTIVE',
        created_by: row.created_by || '',
        created_at: row.created_at,
        updated_at: row.updated_at,
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
      };
    } catch (e: any) {
      const msg = (e?.message || String(e)).toLowerCase();
      if (msg.includes('no such table') || msg.includes('no such column') || msg.includes('has no column named')) {
        throw e;
      }
      console.error('[RBAC] getAdminMember failed:', e);
      return null;
    }
  });
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
  });
}

export async function deleteAdminMember(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  await executeWithAutoSchema(async (db: DbClient) => {
    await db.execute('DELETE FROM admin_members WHERE LOWER(email) = ?', [cleanEmail]);
  });
}

/**
 * Migration helper: imports legacy co_admin_emails from settings into admin_members
 */
export async function syncLegacyCoAdmins(coAdminEmailsStr?: string): Promise<void> {
  if (!coAdminEmailsStr) return;
  const emails = coAdminEmailsStr
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (emails.length === 0) return;

  await executeWithAutoSchema(async (db: DbClient) => {
    for (const email of emails) {
      await db.execute(
        `INSERT OR IGNORE INTO admin_members (email, name, role_code, status, created_by)
         VALUES (?, ?, 'sales_manager', 'ACTIVE', 'legacy_import')`,
        [email, email.split('@')[0]]
      );
    }
  });
}

