// src/utils/rbac.ts
// RBAC Permission Engine with Cloudflare KV In-Memory Caching & Root Env Fallback
import { getRuntimeEnv } from './auth';
import { kvGet, kvPut, kvDelete } from './kv';
import {
  getAdminMember,
  getAdminRole,
  SYSTEM_ROLES,
  type AdminMemberWithRole,
  type AdminRole,
  type DataScope,
} from '../db/rbac.repo';

export interface AdminContextInfo {
  email: string;
  name: string;
  isRootAdmin: boolean;
  role: AdminRole;
  menus: string[];
  permissions: string[];
  dataScope: DataScope;
}

interface L1RbacEntry {
  ctx: AdminContextInfo;
  expiresAt: number;
}

const l1RbacCache = new Map<string, L1RbacEntry>();
const L1_RBAC_TTL_MS = 15_000; // 15 seconds in-memory isolate window
const KV_RBAC_PREFIX = 'rbac:member:';
const KV_TTL_SECONDS = 1800; // 30 minutes edge cache

export async function resolveAdminContext(
  email?: string | null,
  cfEnv?: any,
  coAdminEmailsStr?: string
): Promise<AdminContextInfo | null> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) return null;

  // 1. Root Hardcoded Fallback: Environment variable ADMIN_EMAILS is always SUPER_ADMIN
  const rootRaw = getRuntimeEnv('ADMIN_EMAILS', cfEnv) || '';
  const rootAdmins = rootRaw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (rootAdmins.includes(cleanEmail)) {
    const superRole = SYSTEM_ROLES.super_admin;
    return {
      email: cleanEmail,
      name: cleanEmail.split('@')[0],
      isRootAdmin: true,
      role: superRole,
      menus: superRole.menus,
      permissions: superRole.permissions,
      dataScope: superRole.data_scope,
    };
  }

  // 2. Check L1 In-Memory Cache (0ms instant return within isolate)
  const now = Date.now();
  const memHit = l1RbacCache.get(cleanEmail);
  if (memHit && memHit.expiresAt > now) {
    return memHit.ctx;
  }

  // 3. Check KV Edge Cache (1~3ms response)
  const cacheKey = `${KV_RBAC_PREFIX}${cleanEmail}`;
  try {
    const cached = await kvGet<AdminContextInfo>(cacheKey, cfEnv);
    if (cached) {
      l1RbacCache.set(cleanEmail, { ctx: cached, expiresAt: now + L1_RBAC_TTL_MS });
      return cached;
    }
  } catch {}

  // 4. Query D1 admin_members table
  let member: AdminMemberWithRole | null = null;
  try {
    member = await getAdminMember(cleanEmail);
  } catch (e) {
    console.error('[RBAC] resolveAdminContext D1 query failed:', e);
  }

  // 5. Fallback for legacy co_admin_emails if not yet in admin_members
  if (!member && coAdminEmailsStr) {
    const coAdmins = coAdminEmailsStr
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (coAdmins.includes(cleanEmail)) {
      const managerRole = SYSTEM_ROLES.sales_manager;
      const ctx: AdminContextInfo = {
        email: cleanEmail,
        name: cleanEmail.split('@')[0],
        isRootAdmin: false,
        role: managerRole,
        menus: managerRole.menus,
        permissions: managerRole.permissions,
        dataScope: managerRole.data_scope,
      };
      l1RbacCache.set(cleanEmail, { ctx, expiresAt: now + L1_RBAC_TTL_MS });
      await kvPut(cacheKey, ctx, { expirationTtl: KV_TTL_SECONDS }, cfEnv).catch(() => {});
      return ctx;
    }
  }

  if (!member || member.status !== 'ACTIVE') {
    return null;
  }

  const role = member.role || SYSTEM_ROLES[member.role_code] || SYSTEM_ROLES.sales_rep;
  const adminCtx: AdminContextInfo = {
    email: member.email,
    name: member.name || member.email.split('@')[0],
    isRootAdmin: false,
    role,
    menus: role.menus,
    permissions: role.permissions,
    dataScope: role.data_scope,
  };

  // Cache in L1 memory and KV
  l1RbacCache.set(cleanEmail, { ctx: adminCtx, expiresAt: now + L1_RBAC_TTL_MS });
  await kvPut(cacheKey, adminCtx, { expirationTtl: KV_TTL_SECONDS }, cfEnv).catch(() => {});

  return adminCtx;
}

export async function invalidateAdminRbacCache(email: string, cfEnv?: any): Promise<void> {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) return;
  l1RbacCache.delete(cleanEmail);
  await kvDelete(`${KV_RBAC_PREFIX}${cleanEmail}`, cfEnv).catch(() => {});
}

export function hasPermission(adminCtx: AdminContextInfo | null | undefined, requiredPerm: string): boolean {
  if (!adminCtx) return false;
  if (adminCtx.isRootAdmin || adminCtx.permissions.includes('*')) return true;
  return adminCtx.permissions.includes(requiredPerm);
}

export function hasMenu(adminCtx: AdminContextInfo | null | undefined, menuKey: string): boolean {
  if (!adminCtx) return false;
  if (adminCtx.isRootAdmin || adminCtx.permissions.includes('*')) return true;
  return adminCtx.menus.includes(menuKey);
}

