// src/utils/dicts.ts
// Universal High-Speed Data Dictionary SDK (L1 Pre-Indexed Map -> L2 Edge KV -> L3 DB)

import { listDictItems, type SysDictItem, type DictBadgeColor } from '../db/dicts.repo';
import { bumpCacheEpoch, createTieredCache } from './cache';

export type { SysDictItem, DictBadgeColor };

interface CompiledDicts {
  all: SysDictItem[];
  byGroupAll: Map<string, SysDictItem[]>;
  byGroupEnabled: Map<string, SysDictItem[]>;
  mapByGroup: Map<string, Record<string, SysDictItem>>;
}

function compileDicts(items: SysDictItem[]): CompiledDicts {
  const byGroupAll = new Map<string, SysDictItem[]>();
  const byGroupEnabled = new Map<string, SysDictItem[]>();
  const mapByGroup = new Map<string, Record<string, SysDictItem>>();

  for (const item of items) {
    const gKey = (item.group_code || '').toLowerCase();
    let arrAll = byGroupAll.get(gKey);
    if (!arrAll) {
      arrAll = [];
      byGroupAll.set(gKey, arrAll);
    }
    arrAll.push(item);

    if (item.is_enabled) {
      let arrEn = byGroupEnabled.get(gKey);
      if (!arrEn) {
        arrEn = [];
        byGroupEnabled.set(gKey, arrEn);
      }
      arrEn.push(item);
    }

    let rec = mapByGroup.get(gKey);
    if (!rec) {
      rec = {};
      mapByGroup.set(gKey, rec);
    }
    rec[item.item_key] = item;
  }

  return { all: items, byGroupAll, byGroupEnabled, mapByGroup };
}

export const dictsCache = createTieredCache<SysDictItem[], CompiledDicts>({
  name: 'dicts',
  scope: 'dicts',
  purgeAction: 'refresh',
  kvKey: 'sys:dicts:all',
  ttlMs: Infinity,
  fallbackRaw: [],
  compile: compileDicts,
  deserializeKv: (raw) => (Array.isArray(raw) && raw.length > 0 ? raw : null),
  fetchRaw: async () => ({ data: await listDictItems(), persistToKv: true }),
});

/**
 * Loads all dictionary items via unified L1/L2/L3 cache.
 */
export async function getAllCachedDictItems(cfEnv?: any): Promise<SysDictItem[]> {
  return (await dictsCache.get(cfEnv)).all;
}

/**
 * Invalidate and write-through all dictionary caches (L1 Memory + L2 KV)
 */
export async function invalidateDictCache(cfEnv?: any): Promise<void> {
  try {
    await dictsCache.refresh(cfEnv);
  } catch {
    await dictsCache.evict(cfEnv);
  }
  await bumpCacheEpoch('__dicts', cfEnv);
}

/**
 * O(1) lookup for dictionary items in a specific group code
 */
export async function getDictItems(cfEnv?: any, groupCode?: string, onlyEnabled = true): Promise<SysDictItem[]> {
  const compiled = await dictsCache.get(cfEnv);
  const targetCode = groupCode?.trim().toLowerCase();
  if (!targetCode) {
    return onlyEnabled ? compiled.all.filter((i) => i.is_enabled) : compiled.all;
  }
  return (onlyEnabled ? compiled.byGroupEnabled : compiled.byGroupAll).get(targetCode) ?? [];
}

/**
 * O(1) lookup Record<item_key, SysDictItem> for rendering
 */
export async function getDictMap(cfEnv?: any, groupCode = ''): Promise<Record<string, SysDictItem>> {
  const compiled = await dictsCache.get(cfEnv);
  const targetCode = groupCode.trim().toLowerCase();
  if (!targetCode) return {};
  return compiled.mapByGroup.get(targetCode) ?? {};
}