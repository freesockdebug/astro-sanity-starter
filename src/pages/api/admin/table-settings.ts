// src/pages/api/admin/table-settings.ts
// Cloud-backed Administrator Table Preferences API (L2 Cloudflare KV + L3 D1 system_settings)

import type { APIRoute } from 'astro';
import { env as cfEnv } from 'cloudflare:workers';
import { verifyAdminAuth, jsonNoCache } from '@utils/auth';
import { executeWithAutoSchema } from '../../../db/schema';
import type { DbClient } from '../../../db/client';
import { kvGet, kvPut, kvDelete } from '@utils/cache';

export const prerender = false;

const ALLOWED_TABLES = new Set(['logs', 'orders', 'users', 'logins']);

function buildStorageKeys(email: string, tableKey: string) {
  const cleanEmail = email.trim().toLowerCase();
  return {
    kvKey: `admin:table_pref:${cleanEmail}:${tableKey}`,
    dbKey: `table_pref:${cleanEmail}:${tableKey}`,
  };
}

export const GET: APIRoute = async ({ request, url }) => {
  const admin = await verifyAdminAuth(request, cfEnv);
  if (!admin) {
    return jsonNoCache({ success: false, error: 'Forbidden. Administrator access required.' }, 403);
  }

  const tableKey = (url.searchParams.get('tableKey') || '').trim();
  if (!ALLOWED_TABLES.has(tableKey)) {
    return jsonNoCache({ success: false, error: 'Invalid or missing tableKey' }, 400);
  }

  const { kvKey, dbKey } = buildStorageKeys(admin.user.email, tableKey);

  // 1. Try L2 Cloudflare KV (1~5ms global edge)
  try {
    const cached = await kvGet<any>(kvKey, cfEnv);
    if (cached && typeof cached === 'object' && Array.isArray(cached.columns)) {
      return jsonNoCache({ success: true, settings: cached, source: 'kv' });
    }
  } catch {}

  // 2. Fallback to L3 D1 system_settings table
  try {
    const row = (await executeWithAutoSchema(async (db: DbClient) => {
      return db.first<{ value: string }>('SELECT value FROM system_settings WHERE key = ?', [dbKey]);
    })) as { value: string } | null;
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      // Non-blocking backfill to L2 KV for future reads
      kvPut(kvKey, parsed, { expirationTtl: 86400 * 30 }, cfEnv).catch(() => {});
      return jsonNoCache({ success: true, settings: parsed, source: 'd1' });
    }
  } catch (err: any) {
    console.warn(`[TableSettings:GET] D1 read error for key "${dbKey}":`, err?.message);
  }

  return jsonNoCache({ success: true, settings: null });
};

export const PUT: APIRoute = async ({ request }) => {
  const admin = await verifyAdminAuth(request, cfEnv);
  if (!admin) {
    return jsonNoCache({ success: false, error: 'Forbidden. Administrator access required.' }, 403);
  }

  try {
    const body: any = await request.json().catch(() => null);
    const tableKey = String(body?.tableKey || '').trim();
    const settings = body?.settings;

    if (!ALLOWED_TABLES.has(tableKey) || !settings || !Array.isArray(settings.columns)) {
      return jsonNoCache({ success: false, error: 'Invalid tableKey or missing settings.columns' }, 400);
    }

    const payload = {
      columns: settings.columns.slice(0, 30).map((c: any) => ({
        id: String(c.id || '').slice(0, 50),
        visible: Boolean(c.visible),
        width: Math.max(40, Math.min(1200, Math.round(Number(c.width) || 100))),
      })),
      density: settings.density === 'compact' ? 'compact' : 'cozy',
      updatedAt: Number(settings.updatedAt) || Date.now(),
    };

    const { kvKey, dbKey } = buildStorageKeys(admin.user.email, tableKey);
    const serialized = JSON.stringify(payload);

    await Promise.all([
      kvPut(kvKey, payload, { expirationTtl: 86400 * 30 }, cfEnv).catch(() => false),
      executeWithAutoSchema(async (db: DbClient) => {
        await db.execute(
          `INSERT INTO system_settings (key, value, updated_by, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(key) DO UPDATE SET
             value = excluded.value,
             updated_by = excluded.updated_by,
             updated_at = excluded.updated_at`,
          [dbKey, serialized, admin.user.email]
        );
      }),
    ]);

    return jsonNoCache({ success: true, updatedAt: payload.updatedAt });
  } catch (err: any) {
    return jsonNoCache({ success: false, error: err?.message || 'Failed to save table settings' }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, url }) => {
  const admin = await verifyAdminAuth(request, cfEnv);
  if (!admin) {
    return jsonNoCache({ success: false, error: 'Forbidden. Administrator access required.' }, 403);
  }

  const tableKey = (url.searchParams.get('tableKey') || '').trim();
  if (!ALLOWED_TABLES.has(tableKey)) {
    return jsonNoCache({ success: false, error: 'Invalid or missing tableKey' }, 400);
  }

  const { kvKey, dbKey } = buildStorageKeys(admin.user.email, tableKey);

  await Promise.all([
    kvDelete(kvKey, cfEnv).catch(() => false),
    executeWithAutoSchema(async (db: DbClient) => {
      await db.execute('DELETE FROM system_settings WHERE key = ?', [dbKey]);
    }).catch(() => null),
  ]);

  return jsonNoCache({ success: true });
};

