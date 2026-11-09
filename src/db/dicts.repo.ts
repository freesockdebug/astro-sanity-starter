// src/db/dicts.repo.ts
// Universal Data Dictionary Data Access Layer (D1-backed)

import { getDb, type DbClient } from './client';
import { executeWithAutoSchema } from './schema';

export type DictBadgeColor = 'slate' | 'blue' | 'emerald' | 'amber' | 'purple' | 'rose' | 'indigo';

export interface SysDictGroup {
  code: string;
  name: string;
  description: string;
  meta_schema_json: string;
  meta_schema?: Array<{ key: string; label: string; type: string; placeholder?: string; options?: string[] }>;
  is_system: boolean;
  items_count?: number;
  enabled_count?: number;
  updated_at?: string;
}

export interface SysDictItem {
  id?: number;
  group_code: string;
  item_key: string;
  item_label: string;
  badge_color: DictBadgeColor;
  meta_json: string;
  meta?: Record<string, any>;
  sort_order: number;
  is_enabled: boolean;
  updated_at?: string;
}

function parseJsonSafe<T>(jsonStr: any, fallback: T): T {
  if (!jsonStr || typeof jsonStr !== 'string') return fallback;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return fallback;
  }
}

let cachedDictGroups: { data: SysDictGroup[]; exp: number } | null = null;

export function invalidateDictGroupsCache(): void {
  cachedDictGroups = null;
}

/**
 * Lists all dictionary groups with item counts (L1 memory cached for 60s)
 */
export async function listDictGroups(): Promise<SysDictGroup[]> {
  const now = Date.now();
  if (cachedDictGroups && cachedDictGroups.exp > now) {
    return cachedDictGroups.data;
  }

  return executeWithAutoSchema(async (db: DbClient) => {
    try {
      const rows = await db.query<any>(
        `SELECT g.*,
                COUNT(i.id) as items_count,
                SUM(CASE WHEN i.is_enabled = 1 THEN 1 ELSE 0 END) as enabled_count
         FROM sys_dict_groups g
         LEFT JOIN sys_dict_items i ON g.code = i.group_code
         GROUP BY g.code
         ORDER BY g.is_system DESC, g.code ASC`
      );

      const result = (rows || []).map((r) => ({
        code: r.code,
        name: r.name,
        description: r.description || '',
        meta_schema_json: r.meta_schema_json || '[]',
        meta_schema: parseJsonSafe(r.meta_schema_json, []),
        is_system: Boolean(r.is_system),
        items_count: Number(r.items_count || 0),
        enabled_count: Number(r.enabled_count || 0),
        updated_at: r.updated_at,
      }));

      cachedDictGroups = { data: result, exp: Date.now() + 60_000 };
      return result;
    } catch (e: any) {
      const msg = (e?.message || String(e)).toLowerCase();
      if (msg.includes('no such table') || msg.includes('no such column')) throw e;
      console.error('[DictsRepo] listDictGroups error:', e);
      return [];
    }
  });
}

/**
 * Gets a single dictionary group by code
 */
export async function getDictGroup(code: string): Promise<SysDictGroup | null> {
  const cleanCode = code.trim().toLowerCase();
  if (!cleanCode) return null;

  return executeWithAutoSchema(async (db: DbClient) => {
    try {
      const row = await db.first<any>('SELECT * FROM sys_dict_groups WHERE code = ?', [cleanCode]);
      if (!row) return null;
      return {
        code: row.code,
        name: row.name,
        description: row.description || '',
        meta_schema_json: row.meta_schema_json || '[]',
        meta_schema: parseJsonSafe(row.meta_schema_json, []),
        is_system: Boolean(row.is_system),
        updated_at: row.updated_at,
      };
    } catch (e: any) {
      const msg = (e?.message || String(e)).toLowerCase();
      if (msg.includes('no such table') || msg.includes('no such column')) throw e;
      return null;
    }
  });
}

/**
 * Lists dictionary items for a group (or all groups)
 */
export async function listDictItems(groupCode?: string, onlyEnabled = false): Promise<SysDictItem[]> {
  return executeWithAutoSchema(async (db: DbClient) => {
    try {
      const where: string[] = [];
      const params: any[] = [];

      if (groupCode && groupCode.trim()) {
        where.push('group_code = ?');
        params.push(groupCode.trim().toLowerCase());
      }
      if (onlyEnabled) {
        where.push('is_enabled = 1');
      }

      const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      const sql = whereClause
        ? `SELECT * FROM sys_dict_items ${whereClause} ORDER BY sort_order ASC, id ASC`
        : `SELECT * FROM sys_dict_items ORDER BY sort_order ASC, id ASC`;
      const rows = await db.query<any>(sql, params);

      return (rows || []).map((r) => ({
        id: r.id,
        group_code: r.group_code,
        item_key: r.item_key,
        item_label: r.item_label,
        badge_color: (r.badge_color as DictBadgeColor) || 'slate',
        meta_json: r.meta_json || '{}',
        meta: parseJsonSafe(r.meta_json, {}),
        sort_order: Number(r.sort_order ?? 100),
        is_enabled: Boolean(r.is_enabled),
        updated_at: r.updated_at,
      }));
    } catch (e: any) {
      const msg = (e?.message || String(e)).toLowerCase();
      if (msg.includes('no such table') || msg.includes('no such column')) throw e;
      console.error('[DictsRepo] listDictItems error:', e);
      return [];
    }
  });
}

/**
 * Inserts or updates a dictionary item
 */
export async function upsertDictItem(item: {
  group_code: string;
  item_key: string;
  item_label: string;
  badge_color?: DictBadgeColor;
  meta?: Record<string, any> | string;
  sort_order?: number;
  is_enabled?: boolean;
}): Promise<boolean> {
  const groupCode = item.group_code.trim().toLowerCase();
  const itemKey = item.item_key.trim();
  const itemLabel = item.item_label.trim();
  if (!groupCode || !itemKey || !itemLabel) {
    throw new Error('group_code, item_key, and item_label are required');
  }

  const badgeColor = item.badge_color || 'slate';
  const metaJson = typeof item.meta === 'string' ? item.meta : JSON.stringify(item.meta || {});
  const sortOrder = Number(item.sort_order ?? 100);
  const isEnabled = item.is_enabled !== false ? 1 : 0;

  return executeWithAutoSchema(async (db: DbClient) => {
    await db.execute(
      `INSERT INTO sys_dict_items (group_code, item_key, item_label, badge_color, meta_json, sort_order, is_enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(group_code, item_key) DO UPDATE SET
         item_label = excluded.item_label,
         badge_color = excluded.badge_color,
         meta_json = excluded.meta_json,
         sort_order = excluded.sort_order,
         is_enabled = excluded.is_enabled,
         updated_at = datetime('now')`,
      [groupCode, itemKey, itemLabel, badgeColor, metaJson, sortOrder, isEnabled]
    );
    invalidateDictGroupsCache();
    return true;
  });
}

/**
 * Deletes a dictionary item
 */
export async function deleteDictItem(groupCode: string, itemKey: string): Promise<{ success: boolean; error?: string }> {
  const g = groupCode.trim().toLowerCase();
  const k = itemKey.trim();
  if (!g || !k) return { success: false, error: 'group_code and item_key are required' };

  return executeWithAutoSchema(async (db: DbClient) => {
    await db.execute('DELETE FROM sys_dict_items WHERE group_code = ? AND item_key = ?', [g, k]);
    invalidateDictGroupsCache();
    return { success: true };
  });
}

/**
 * Toggles an item's enabled status
 */
export async function toggleDictItemEnabled(groupCode: string, itemKey: string, isEnabled: boolean): Promise<boolean> {
  const g = groupCode.trim().toLowerCase();
  const k = itemKey.trim();
  return executeWithAutoSchema(async (db: DbClient) => {
    await db.execute(
      'UPDATE sys_dict_items SET is_enabled = ?, updated_at = datetime(\'now\') WHERE group_code = ? AND item_key = ?',
      [isEnabled ? 1 : 0, g, k]
    );
    invalidateDictGroupsCache();
    return true;
  });
}
