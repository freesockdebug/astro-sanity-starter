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