// src/utils/dicts.ts
// Universal High-Speed Data Dictionary SDK (L1 Memory + L2 KV + L3 D1)

import { listDictItems, type SysDictItem, type DictBadgeColor } from '../db/dicts.repo';

const L1_TTL_MS = 60 * 1000; // 60s
const KV_TTL_SECONDS = 1800; // 30min
const KV_CACHE_KEY = 'sys:dicts:all';

interface MemoryCacheEntry {
  items: SysDictItem[];
  expiresAt: number;
}

let l1Cache: MemoryCacheEntry | null = null;

/**
 * Loads all dictionary items with L1 (Memory) -> L2 (KV) -> L3 (D1) hierarchy
 */
export async function getAllCachedDictItems(cfEnv?: any): Promise<SysDictItem[]> {
  const now = Date.now();
  // 1. L1 Memory Check
  if (l1Cache && l1Cache.expiresAt > now) {
    return l1Cache.items;
  }

  // 2. L2 Edge KV Check
  const kv = cfEnv?.CACHE_KV || cfEnv?.KV;
  if (kv) {
    try {
      const cached = await kv.get(KV_CACHE_KEY, 'json');
      if (Array.isArray(cached) && cached.length > 0) {
        l1Cache = { items: cached, expiresAt: now + L1_TTL_MS };
        return cached;
      }
    } catch (e) {
      // KV read failed, fallback to D1
    }
  }

  // 3. L3 D1 Query
  const items = await listDictItems();
  l1Cache = { items, expiresAt: now + L1_TTL_MS };

  // Asynchronously populate KV
  if (kv && items.length > 0) {
    try {
      await kv.put(KV_CACHE_KEY, JSON.stringify(items), { expirationTtl: KV_TTL_SECONDS });
    } catch {
      // Ignore background KV write failures
    }
  }

  return items;
}

/**
 * Invalidate and write-through all dictionary caches (L1 Memory + L2 KV)
 */
export async function invalidateDictCache(cfEnv?: any): Promise<void> {
  l1Cache = null;
  const kv = cfEnv?.CACHE_KV || cfEnv?.KV;
  if (kv) {
    try {
      const items = await listDictItems();
      l1Cache = { items, expiresAt: Date.now() + L1_TTL_MS };
      await kv.put(KV_CACHE_KEY, JSON.stringify(items), { expirationTtl: KV_TTL_SECONDS });
    } catch {
      await kv.delete(KV_CACHE_KEY).catch(() => {});
    }
  }
}

/**
 * Gets dictionary items for a specific group code
 */
export async function getDictItems(cfEnv?: any, groupCode?: string, onlyEnabled = true): Promise<SysDictItem[]> {
  const all = await getAllCachedDictItems(cfEnv);
  const targetCode = groupCode?.trim().toLowerCase();
  return all.filter((i) => {
    if (targetCode && i.group_code.toLowerCase() !== targetCode) return false;
    if (onlyEnabled && !i.is_enabled) return false;
    return true;
  });
}

/**
 * Gets a quick lookup Record<item_key, SysDictItem> for O(1) rendering
 */
export async function getDictMap(cfEnv?: any, groupCode = ''): Promise<Record<string, SysDictItem>> {
  const items = await getDictItems(cfEnv, groupCode, false);
  const map: Record<string, SysDictItem> = {};
  for (const item of items) {
    map[item.item_key] = item;
  }
  return map;
}

/**
 * Resolves color classes for badge rendering
 */
export function getBadgeColorClasses(color?: string): string {
  switch (color) {
    case 'blue':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'emerald':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'amber':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'purple':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'rose':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'indigo':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'slate':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

/**
 * Generates uniform Tailwind badge HTML for any dictionary item
 */
export function renderDictBadgeHtml(
  itemOrLabel: SysDictItem | { item_label: string; badge_color?: string } | string,
  size: 'xs' | 'sm' | 'md' = 'sm'
): string {
  if (!itemOrLabel) return '';
  const label = typeof itemOrLabel === 'string' ? itemOrLabel : itemOrLabel.item_label;
  const color = typeof itemOrLabel === 'string' ? 'slate' : (itemOrLabel.badge_color || 'slate');
  const colorCls = getBadgeColorClasses(color);

  const sizeCls = size === 'xs'
    ? 'text-[10px] px-1.5 py-0.2'
    : size === 'md'
    ? 'text-xs px-2.5 py-1'
    : 'text-[11px] px-2 py-0.5';

  return `<span class="inline-flex items-center font-semibold rounded-md border tracking-tight ${sizeCls} ${colorCls}">${label}</span>`;
}