import { waitUntil as cfWaitUntil } from 'cloudflare:workers';
import { getActiveProfiler } from './profiler';

/**
 * Resolves Cloudflare KV Namespace from runtime environment or worker context.
 * Returns null safely in local Node.js test or build environments.
 */
export async function getKvNamespace(customEnv?: any): Promise<any | null> {
  if (customEnv?.CACHE_KV && typeof customEnv.CACHE_KV.get === 'function') {
    return customEnv.CACHE_KV;
  }
  try {
    // @ts-ignore
    const cf: any = await import('cloudflare:workers');
    if (cf?.env?.CACHE_KV && typeof cf.env.CACHE_KV.get === 'function') {
      return cf.env.CACHE_KV;
    }
  } catch {
    // Non-blocking for local node / build environments
  }
  return null;
}

/**
 * Reads and automatically parses a JSON or string entry from Cloudflare KV.
 */
export async function kvGet<T = any>(
  key: string,
  customEnv?: any,
  options?: { cacheTtl?: number }
): Promise<T | null> {
  const profiler = getActiveProfiler();
  const t0 = profiler ? performance.now() : 0;
  try {
    const kv = await getKvNamespace(customEnv);
    if (!kv) return null;
    const raw = options?.cacheTtl && options.cacheTtl >= 60
      ? await kv.get(key, { type: 'text', cacheTtl: Math.floor(options.cacheTtl) })
      : await kv.get(key, 'text');
    if (raw === null || raw === undefined) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  } catch (err) {
    console.warn(`[KV:Get] Non-fatal read failure for key "${key}":`, err);
    return null;
  } finally {
    if (profiler) profiler.addSpan('kv', performance.now() - t0);
  }
}

/**
 * Writes a value to Cloudflare KV with optional expiration TTL in seconds.
 * Note: Cloudflare KV requires expirationTtl to be at least 60 seconds if specified.
 */
export async function kvPut(
  key: string,
  value: any,
  options?: { expirationTtl?: number },
  customEnv?: any
): Promise<boolean> {
  if (value === undefined || value === null) {
    return false;
  }

  const profiler = getActiveProfiler();
  const t0 = profiler ? performance.now() : 0;
  try {
    const kv = await getKvNamespace(customEnv);
    if (!kv) return false;

    const serialized = JSON.stringify(value);
    const putOptions: Record<string, any> = {};
    if (options?.expirationTtl && options.expirationTtl > 0) {
      putOptions.expirationTtl = Math.max(60, Math.floor(options.expirationTtl));
    }
    await kv.put(key, serialized, putOptions);
    return true;
  } catch (err) {
    console.warn(`[KV:Put] Non-fatal write failure for key "${key}":`, err);
    return false;
  } finally {
    if (profiler) profiler.addSpan('kv', performance.now() - t0);
  }
}

/**
 * Deletes a key from Cloudflare KV.
 */
export async function kvDelete(key: string, customEnv?: any): Promise<boolean> {
  try {
    const kv = await getKvNamespace(customEnv);
    if (!kv) return false;
    await kv.delete(key);
    return true;
  } catch (err) {
    console.warn(`[KV:Delete] Non-fatal delete failure for key "${key}":`, err);
    return false;
  }
}

export function runInBackground(promise: Promise<any>) {
  if (typeof cfWaitUntil === 'function') {
    try {
      cfWaitUntil(promise);
      return;
    } catch { }
  }
  promise.catch(() => { });
}

export interface TieredCacheFetchResult<TRaw> {
  data: TRaw;
  persistToKv?: boolean;
}

export interface CachePartitionSnapshot {
  name: string;
  scope: string;
  kind: 'singleton' | 'keyed' | 'edge_html';
  kvKey?: string;
  ttlMs: number;
  l1State: 'WARM' | 'COLD';
  l1Entries: number;
  lastLoadedAt: number | null;
  l1Hits: number;
  l2Hits: number;
  l3Misses: number;
  negativeHits: number;
  writes: number;
  evictions: number;
  hitRatePct: number;
}

export interface GlobalCacheStatsSnapshot {
  generatedAt: number;
  totalRequests: number;
  totalHits: number;
  overallHitRatePct: number;
  l1Hits: number;
  l2Hits: number;
  l3Misses: number;
  edgeHtmlHits: number;
  edgeHtmlMisses: number;
  edgeHtmlBypasses: number;
  edgeHtmlHitRatePct: number;
  edgeHtmlTopPaths: Array<{ pathname: string; hits: number; misses: number; hitRatePct: number }>;
  estimatedQueriesSaved: number;
  partitions: CachePartitionSnapshot[];
}

export interface CacheRegistryEntry {
  name: string;
  scopes: string[];
  purge: (customEnv?: any) => Promise<void>;
  invalidate?: () => void;
  getSnapshot?: () => CachePartitionSnapshot;
  resetStats?: () => void;
}

const cacheRegistry = new Map<string, CacheRegistryEntry>();

export const ROUTE_REVS_KV_KEY = 'cms:route_revs';

export function registerCache(entry: CacheRegistryEntry): void {
  if (entry.scopes.length > 0) {
    cacheRegistry.set(entry.name, entry);
  }
}

/**
 * Synchronously invalidates L1 memory caches registered under a given scope (zero KV/DB I/O).
 */
export function invalidateRegisteredCachesByScope(scope: string): string[] {
  const invalidated: string[] = [];
  for (const entry of cacheRegistry.values()) {
    if (entry.scopes.includes(scope) && entry.invalidate) {
      entry.invalidate();
      invalidated.push(entry.name);
    }
  }
  return invalidated;
}

let activeCacheEpochs: Record<string, any> = {};
let epochBumpListener: ((epochKey: string, ts: number, cfEnv?: any) => void) | null = null;

export function registerEpochBumpListener(fn: (epochKey: string, ts: number, cfEnv?: any) => void): void {
  epochBumpListener = fn;
}

export function syncActiveCacheEpochs(epochs: Record<string, any>): void {
  if (epochs && typeof epochs === 'object') {
    activeCacheEpochs = { ...epochs };
  }
}

/**
 * Bumps a partition epoch key (e.g. '__settings', '__waf', '__dicts', '__rbac') in cms:route_revs
 * so other global Cloudflare Isolates detect the change and invalidate only that L1 partition.
 */
export async function bumpCacheEpoch(epochKey: string, cfEnv?: any, explicitTs?: number): Promise<number> {
  const ts = explicitTs ?? Date.now();
  activeCacheEpochs[epochKey] = ts;
  if (epochBumpListener) epochBumpListener(epochKey, ts, cfEnv);
  try {
    const current = (await kvGet<Record<string, any>>(ROUTE_REVS_KV_KEY, cfEnv).catch(() => null)) || {};
    const updated = { ...current, ...activeCacheEpochs, [epochKey]: ts };
    await kvPut(ROUTE_REVS_KV_KEY, updated, undefined, cfEnv).catch(() => { });
  } catch {
    // Non-fatal epoch bump
  }
  return ts;
}

function calcHitRatePct(hits: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((hits / total) * 1000) / 10;
}

const edgeHtmlMetrics = {
  hits: 0,
  misses: 0,
  bypasses: 0,
  lastLoadedAt: null as number | null,
  paths: new Map<string, { hits: number; misses: number; lastAt: number }>(),
};

/**
 * Records Cloudflare Worker caches.default HTML edge cache Hit/Miss/Bypass in O(1) Isolate RAM.
 */
export function recordEdgeHtmlCacheResult(status: 'HIT' | 'MISS' | 'BYPASS', pathname: string): void {
  const now = Date.now();
  if (status === 'HIT') {
    edgeHtmlMetrics.hits += 1;
    edgeHtmlMetrics.lastLoadedAt = now;
  } else if (status === 'MISS') {
    edgeHtmlMetrics.misses += 1;
    edgeHtmlMetrics.lastLoadedAt = now;
  } else {
    edgeHtmlMetrics.bypasses += 1;
    return;
  }

  const cleanPath = (pathname || '/').slice(0, 120);
  const existing = edgeHtmlMetrics.paths.get(cleanPath);
  if (existing) {
    if (status === 'HIT') existing.hits += 1;
    else existing.misses += 1;
    existing.lastAt = now;
  } else {
    if (edgeHtmlMetrics.paths.size >= 100) {
      const oldest = edgeHtmlMetrics.paths.keys().next().value;
      if (oldest !== undefined) edgeHtmlMetrics.paths.delete(oldest);
    }
    edgeHtmlMetrics.paths.set(cleanPath, {
      hits: status === 'HIT' ? 1 : 0,
      misses: status === 'MISS' ? 1 : 0,
      lastAt: now,
    });
  }
}

export function getGlobalCacheStatsSnapshot(): GlobalCacheStatsSnapshot {
  const partitions: CachePartitionSnapshot[] = [];
  let l1Hits = 0;
  let l2Hits = 0;
  let l3Misses = 0;

  for (const entry of cacheRegistry.values()) {
    if (!entry.getSnapshot) continue;
    const snap = entry.getSnapshot();
    partitions.push(snap);
    l1Hits += snap.l1Hits;
    l2Hits += snap.l2Hits;
    l3Misses += snap.l3Misses;
  }

  const edgeTotal = edgeHtmlMetrics.hits + edgeHtmlMetrics.misses;
  const edgeRate = calcHitRatePct(edgeHtmlMetrics.hits, edgeTotal);
  partitions.push({
    name: 'edge:html_cache',
    scope: 'edge_html',
    kind: 'edge_html',
    kvKey: 'caches.default',
    ttlMs: 300_000,
    l1State: edgeHtmlMetrics.hits > 0 || edgeHtmlMetrics.misses > 0 ? 'WARM' : 'COLD',
    l1Entries: edgeHtmlMetrics.paths.size,
    lastLoadedAt: edgeHtmlMetrics.lastLoadedAt,
    l1Hits: 0,
    l2Hits: edgeHtmlMetrics.hits,
    l3Misses: edgeHtmlMetrics.misses,
    negativeHits: 0,
    writes: edgeHtmlMetrics.misses,
    evictions: 0,
    hitRatePct: edgeRate,
  });

  const edgeHtmlTopPaths = Array.from(edgeHtmlMetrics.paths.entries())
    .map(([pathname, s]) => ({
      pathname,
      hits: s.hits,
      misses: s.misses,
      hitRatePct: calcHitRatePct(s.hits, s.hits + s.misses),
    }))
    .sort((a, b) => b.hits + b.misses - (a.hits + a.misses))
    .slice(0, 10);

  const totalHits = l1Hits + l2Hits + edgeHtmlMetrics.hits;
  const totalMisses = l3Misses + edgeHtmlMetrics.misses;
  const totalRequests = totalHits + totalMisses;

  return {
    generatedAt: Date.now(),
    totalRequests,
    totalHits,
    overallHitRatePct: calcHitRatePct(totalHits, totalRequests),
    l1Hits,
    l2Hits,
    l3Misses,
    edgeHtmlHits: edgeHtmlMetrics.hits,
    edgeHtmlMisses: edgeHtmlMetrics.misses,
    edgeHtmlBypasses: edgeHtmlMetrics.bypasses,
    edgeHtmlHitRatePct: edgeRate,
    edgeHtmlTopPaths,
    estimatedQueriesSaved: l1Hits + l2Hits + edgeHtmlMetrics.hits,
    partitions,
  };
}

export function resetGlobalCacheStats(): void {
  for (const entry of cacheRegistry.values()) {
    entry.resetStats?.();
  }
  edgeHtmlMetrics.hits = 0;
  edgeHtmlMetrics.misses = 0;
  edgeHtmlMetrics.bypasses = 0;
  edgeHtmlMetrics.lastLoadedAt = null;
  edgeHtmlMetrics.paths.clear();
}

export async function purgeSingleCacheByName(name: string, customEnv?: any): Promise<boolean> {
  const entry = cacheRegistry.get(name);
  if (!entry) return false;
  await entry.purge(customEnv).catch(() => { });
  return true;
}

/**
 * Purges/refreshes all caches registered under the requested scope (or 'all').
 */
export async function purgeRegisteredCaches(scope: string, customEnv?: any): Promise<string[]> {
  const targets = Array.from(cacheRegistry.values()).filter(
    (entry) => scope === 'all' || entry.scopes.includes(scope)
  );
  if (targets.length === 0) return [];
  await Promise.all(targets.map((entry) => entry.purge(customEnv).catch(() => { })));
  return targets.map((t) => t.name);
}

export interface TieredCacheOptions<TRaw, TCompiled = TRaw> {
  name: string;
  scope?: string | string[];
  purgeAction?: 'invalidate' | 'evict' | 'refresh';
  kvKey?: string;
  epochKey?: string;
  ttlMs?: number;
  kvTtlSeconds?: number;
  fallbackRaw: TRaw;
  compile?: (raw: TRaw) => TCompiled;
  deserializeKv?: (raw: any) => TRaw | null;
  isValidRaw?: (raw: TRaw, forceRefresh: boolean) => boolean;
  onUpdate?: (compiled: TCompiled) => void;
  fetchRaw: (customEnv?: any, forceRefresh?: boolean) => Promise<TieredCacheFetchResult<TRaw> | TRaw | null>;
}

/**
 * Reusable L1 (Isolate Memory + Pre-Compiled Object) -> Optional L2 (Edge KV) -> L3 (DB/Upstream) Cache Library.
 * - Compiles TRaw -> TCompiled once on L1 fill, eliminating repeated RegExp/CIDR parsing or indexing on hot paths.
 * - Omit kvKey to use as a pure Isolate L1 cache; provide kvKey for global Edge KV multi-node synchronization.
 * - Never caches cross-request Promises in module scope (Cloudflare Workers isolate safe).
 */
export class EdgeTieredCache<TRaw, TCompiled = TRaw> {
  private entry: { raw: TRaw; compiled: TCompiled; loadedAt: number } | null = null;
  private stats = { l1Hits: 0, l2Hits: 0, l3Misses: 0, writes: 0, evictions: 0 };
  private readonly name: string;
  private readonly kvKey?: string;
  private readonly epochKey?: string;
  private readonly ttlMs: number;
  private readonly kvTtlSeconds?: number;
  private readonly fallbackRaw: TRaw;
  private readonly compileFn: (raw: TRaw) => TCompiled;
  private readonly deserializeKv?: (raw: any) => TRaw | null;
  private readonly isValidRawFn?: (raw: TRaw, forceRefresh: boolean) => boolean;
  private readonly onUpdateFn?: (compiled: TCompiled) => void;
  private readonly fetchRawFn: (customEnv?: any, forceRefresh?: boolean) => Promise<TieredCacheFetchResult<TRaw> | TRaw | null>;

  constructor(options: TieredCacheOptions<TRaw, TCompiled>) {
    this.name = options.name;
    this.kvKey = options.kvKey;
    this.epochKey = options.epochKey;
    this.ttlMs = options.ttlMs ?? 5_000;
    this.kvTtlSeconds = options.kvTtlSeconds;
    this.fallbackRaw = options.fallbackRaw;
    this.compileFn = options.compile ?? ((raw: TRaw) => raw as unknown as TCompiled);
    this.deserializeKv = options.deserializeKv;
    this.isValidRawFn = options.isValidRaw;
    this.onUpdateFn = options.onUpdate;
    this.fetchRawFn = options.fetchRaw;
  }

  private storeL1(raw: TRaw): TCompiled {
    const compiled = this.compileFn(raw);
    this.entry = { raw, compiled, loadedAt: Date.now() };
    this.stats.writes += 1;
    if (this.onUpdateFn) this.onUpdateFn(compiled);
    return compiled;
  }

  public getMetricsSnapshot(scope: string): CachePartitionSnapshot {
    const now = Date.now();
    const isWarm = Boolean(this.entry && now - this.entry.loadedAt < this.ttlMs);
    const total = this.stats.l1Hits + this.stats.l2Hits + this.stats.l3Misses;
    return {
      name: this.name,
      scope,
      kind: 'singleton',
      kvKey: this.kvKey,
      ttlMs: Number.isFinite(this.ttlMs) ? this.ttlMs : -1,
      l1State: isWarm ? 'WARM' : 'COLD',
      l1Entries: this.entry ? 1 : 0,
      lastLoadedAt: this.entry?.loadedAt ?? null,
      l1Hits: this.stats.l1Hits,
      l2Hits: this.stats.l2Hits,
      l3Misses: this.stats.l3Misses,
      negativeHits: 0,
      writes: this.stats.writes,
      evictions: this.stats.evictions,
      hitRatePct: calcHitRatePct(this.stats.l1Hits + this.stats.l2Hits, total),
    };
  }

  public resetStats(): void {
    this.stats = { l1Hits: 0, l2Hits: 0, l3Misses: 0, writes: 0, evictions: 0 };
  }

  public seed(val?: TRaw | null): void {
    const raw = val !== undefined && val !== null ? val : this.fallbackRaw;
    this.storeL1(raw);
  }

  public peek(): TCompiled | null {
    return this.entry ? this.entry.compiled : null;
  }

  public peekRaw(): TRaw | null {
    return this.entry ? this.entry.raw : null;
  }

  public invalidate(): void {
    this.entry = null;
    this.stats.evictions += 1;
  }

  public async evict(customEnv?: any): Promise<void> {
    this.entry = null;
    this.stats.evictions += 1;
    if (this.kvKey) {
      await kvDelete(this.kvKey, customEnv).catch(() => { });
    }
  }

  private async persistToKv(raw: TRaw, customEnv: any, syncKv: boolean): Promise<void> {
    if (!this.kvKey) return;
    const kvOpts = this.kvTtlSeconds ? { expirationTtl: this.kvTtlSeconds } : undefined;
    const write = async () => {
      await kvPut(this.kvKey!, raw, kvOpts, customEnv).catch(() => { });
      if (this.epochKey) {
        const nextEpoch = Date.now();
        await kvPut(`${this.kvKey!}@${nextEpoch}`, raw, { expirationTtl: 86400 * 30 }, customEnv).catch(() => { });
        await bumpCacheEpoch(this.epochKey, customEnv, nextEpoch);
      }
    };
    if (syncKv) {
      await write();
    } else {
      runInBackground(write());
    }
  }

  public async set(
    raw: TRaw,
    customEnv?: any,
    options?: { syncKv?: boolean }
  ): Promise<TCompiled> {
    const compiled = this.storeL1(raw);
    await this.persistToKv(raw, customEnv, options?.syncKv !== false);
    return compiled;
  }

  public async get(
    customEnv?: any,
    options?: { forceRefresh?: boolean; syncKv?: boolean }
  ): Promise<TCompiled> {
    const forceRefresh = Boolean(options?.forceRefresh);
    const now = Date.now();

    // L1: Isolate Memory (pre-compiled)
    if (!forceRefresh && this.entry && now - this.entry.loadedAt < this.ttlMs) {
      this.stats.l1Hits += 1;
      return this.entry.compiled;
    }

    // L2: Shared Cloudflare Edge KV (epoch-versioned PoP cache when epochKey is set -> fallback to base kvKey)
    if (!forceRefresh && this.kvKey) {
      try {
        const epoch = this.epochKey ? activeCacheEpochs[this.epochKey] : undefined;
        let kvVal = epoch
          ? await kvGet<any>(`${this.kvKey}@${epoch}`, customEnv, { cacheTtl: 86400 })
          : null;
        if (kvVal === null || kvVal === undefined) {
          kvVal = await kvGet<any>(this.kvKey, customEnv);
        }
        if (kvVal !== null && kvVal !== undefined) {
          const raw = this.deserializeKv ? this.deserializeKv(kvVal) : (kvVal as TRaw);
          if (raw !== null && raw !== undefined) {
            this.stats.l2Hits += 1;
            return this.storeL1(raw);
          }
        }
      } catch (err) {
        console.warn(`[TieredCache:${this.name}] L2 KV read failed:`, err);
      }
    }

    // L3: Upstream / Database
    this.stats.l3Misses += 1;
    try {
      const res = await this.fetchRawFn(customEnv, forceRefresh);
      if (res !== null && res !== undefined) {
        const isWrapped =
          typeof res === 'object' &&
          res !== null &&
          'data' in res &&
          'persistToKv' in res &&
          typeof (res as any).persistToKv === 'boolean';
        const raw = isWrapped ? (res as TieredCacheFetchResult<TRaw>).data : (res as TRaw);
        const persistToKv = isWrapped ? (res as TieredCacheFetchResult<TRaw>).persistToKv !== false : true;
        const valid = this.isValidRawFn ? this.isValidRawFn(raw, forceRefresh) : true;

        if (valid) {
          const compiled = this.storeL1(raw);
          if (persistToKv && this.kvKey) {
            await this.persistToKv(raw, customEnv, Boolean(forceRefresh || options?.syncKv));
          }
          return compiled;
        }
      }
    } catch (err) {
      console.error(`[TieredCache:${this.name}] L3 fetch failed:`, err);
    }

    if (this.entry) {
      return this.entry.compiled;
    }
    return this.storeL1(this.fallbackRaw);
  }

  public async refresh(customEnv?: any): Promise<TCompiled> {
    return this.get(customEnv, { forceRefresh: true, syncKv: true });
  }
}

export function createTieredCache<TRaw, TCompiled = TRaw>(
  options: TieredCacheOptions<TRaw, TCompiled>
): EdgeTieredCache<TRaw, TCompiled> {
  const instance = new EdgeTieredCache(options);
  if (options.scope) {
    const scopes = Array.isArray(options.scope) ? options.scope : [options.scope];
    const action = options.purgeAction ?? 'invalidate';
    registerCache({
      name: options.name,
      scopes,
      invalidate: () => instance.invalidate(),
      purge: async (cfEnv) => {
        if (action === 'refresh') {
          await instance.refresh(cfEnv);
        } else if (action === 'evict') {
          await instance.evict(cfEnv);
        } else {
          instance.invalidate();
        }
      },
      getSnapshot: () => instance.getMetricsSnapshot(scopes[0]),
      resetStats: () => instance.resetStats(),
    });
  }
  return instance;
}

export interface CmsCache<T> {
  seed(val?: T | null): void;
  invalidate(): void;
  get(forceRefresh?: boolean, customEnv?: any): Promise<T>;
  refresh(customEnv?: any): Promise<T>;
  evict(customEnv?: any): Promise<void>;
  peek(): T | null;
}

export interface CmsCacheOptions<T> {
  name?: string;
  scope?: string | string[];
  purgeAction?: 'invalidate' | 'evict' | 'refresh';
  kvKey?: string;
  epochKey?: string;
  ttlMs?: number;
  onUpdate?: (val: T) => void;
}

/**
 * Zero-polling multi-tier CMS cache backed directly by unified EdgeTieredCache.
 */
export function createCmsCache<T>(
  fetcher: (forceRefresh?: boolean) => Promise<T>,
  fallback: T,
  options?: CmsCacheOptions<T>
): CmsCache<T> {
  const tiered = createTieredCache<T>({
    name: options?.name || options?.kvKey || 'cms_cache',
    scope: options?.scope,
    purgeAction: options?.purgeAction,
    kvKey: options?.kvKey,
    epochKey: options?.epochKey ?? (options?.kvKey && (options?.ttlMs === undefined || !Number.isFinite(options.ttlMs)) ? `__cms:${options.kvKey}` : undefined),
    ttlMs: options?.ttlMs ?? Infinity,
    fallbackRaw: fallback,
    onUpdate: options?.onUpdate,
    isValidRaw: (raw, forceRefresh) =>
      raw !== undefined && raw !== null && (forceRefresh || !Array.isArray(raw) || raw.length > 0),
    fetchRaw: async (_env, forceRefresh) => fetcher(forceRefresh),
  });

  return {
    seed: (val) => tiered.seed(val),
    invalidate: () => tiered.invalidate(),
    peek: () => tiered.peek(),
    get: (forceRefresh = false, customEnv?: any) => tiered.get(customEnv, { forceRefresh }),
    refresh: (customEnv?: any) => tiered.refresh(customEnv),
    evict: (customEnv?: any) => tiered.evict(customEnv),
  };
}

export interface KeyedCache<T> {
  get(key: string, customEnv?: any, forceRefresh?: boolean): Promise<T | null>;
  refresh(key: string, customEnv?: any): Promise<T | null>;
  evict(key: string, customEnv?: any): Promise<void>;
  seed(key: string, data: T): void;
  deleteL1(key: string): void;
  invalidateWhere(predicate: (key: string, data: T | null) => boolean): void;
  invalidate(): void;
}

export type CmsKeyedCache<T> = KeyedCache<T>;

export interface KeyedCacheOptions {
  name?: string;
  scope?: string | string[];
  kvPrefix?: string;
  ttlMs?: number;
  negativeTtlMs?: number;
  maxL1Entries?: number;
  cloneOnRead?: boolean;
  existsGuard?: (key: string, customEnv?: any) => Promise<boolean> | boolean;
}

export type CmsKeyedCacheOptions = KeyedCacheOptions;

/**
 * Reusable Keyed L1 Map -> Optional L2 KV Cache Library with bounded capacity & optional negative caching.
 * Zero-copy on read by default (set cloneOnRead: true only if callers mutate returned objects).
 */
export function createKeyedCache<T>(
  fetcher: (key: string, forceRefresh?: boolean) => Promise<T | null>,
  options?: KeyedCacheOptions
): KeyedCache<T> {
  const kvPrefix = options?.kvPrefix;
  const label = options?.name || kvPrefix || 'keyed_cache';
  const ttlMs = options?.ttlMs ?? 300_000;
  const negativeTtlMs = options?.negativeTtlMs ?? 30_000;
  const maxEntries = options?.maxL1Entries ?? 500;
  const cloneOnRead = Boolean(options?.cloneOnRead);
  const existsGuard = options?.existsGuard;
  const l1Map = new Map<string, { data: T | null; timestamp: number }>();
  const stats = {
    l1Hits: 0,
    l2Hits: 0,
    l3Misses: 0,
    negativeHits: 0,
    writes: 0,
    evictions: 0,
    lastLoadedAt: null as number | null,
  };

  const maybeClone = (val: T): T => (cloneOnRead ? structuredClone(val) : val);

  const setL1 = (key: string, data: T | null) => {
    const now = Date.now();
    l1Map.set(key, { data, timestamp: now });
    stats.writes += 1;
    stats.lastLoadedAt = now;
    if (l1Map.size > maxEntries) {
      const oldest = l1Map.keys().next().value;
      if (oldest !== undefined) l1Map.delete(oldest);
    }
  };

  // Note: Do NOT store inflight Promises in module scope; Cloudflare Workers forbids cross-request Promise resolution.
  const get = async (rawKey: string, customEnv?: any, forceRefresh = false): Promise<T | null> => {
    if (!rawKey) return null;
    const now = Date.now();

    if (!forceRefresh) {
      const hit = l1Map.get(rawKey);
      if (hit) {
        const age = now - hit.timestamp;
        if (hit.data === null) {
          if (negativeTtlMs > 0 && age < negativeTtlMs) {
            stats.l1Hits += 1;
            stats.negativeHits += 1;
            return null;
          }
        } else if (age < ttlMs) {
          stats.l1Hits += 1;
          return maybeClone(hit.data);
        }
      }

      if (existsGuard) {
        try {
          const mayExist = await existsGuard(rawKey, customEnv);
          if (!mayExist) {
            stats.l1Hits += 1;
            stats.negativeHits += 1;
            return null;
          }
        } catch { }
      }
    }

    const cacheKey = kvPrefix ? `${kvPrefix}:${rawKey}` : '';
    try {
      if (!forceRefresh && cacheKey) {
        try {
          const kvHit = await kvGet<any>(cacheKey, customEnv);
          if (kvHit && !kvHit.notFound) {
            stats.l2Hits += 1;
            setL1(rawKey, kvHit);
            return maybeClone(kvHit);
          }
        } catch { }
      }

      stats.l3Misses += 1;
      const data = await fetcher(rawKey, forceRefresh);
      if (data) {
        setL1(rawKey, data);
        if (cacheKey) {
          if (forceRefresh) {
            await kvPut(cacheKey, data, undefined, customEnv).catch(() => { });
          } else {
            runInBackground(kvPut(cacheKey, data, undefined, customEnv));
          }
        }
        return maybeClone(data);
      } else {
        if (negativeTtlMs > 0) {
          setL1(rawKey, null);
        }
        if (forceRefresh && cacheKey) {
          await kvDelete(cacheKey, customEnv).catch(() => { });
        }
        return null;
      }
    } catch (err: any) {
      console.error(`[createKeyedCache:${label}] Fetch failed for ${rawKey}:`, err?.message);
      const stale = l1Map.get(rawKey);
      return stale && stale.data ? maybeClone(stale.data) : null;
    }
  };

  const instance: KeyedCache<T> = {
    get,
    async refresh(key: string, customEnv?: any): Promise<T | null> {
      return get(key, customEnv, true);
    },
    async evict(key: string, customEnv?: any): Promise<void> {
      l1Map.delete(key);
      stats.evictions += 1;
      if (kvPrefix) {
        await kvDelete(`${kvPrefix}:${key}`, customEnv).catch(() => { });
      }
    },
    seed(key: string, data: T) {
      setL1(key, data);
    },
    deleteL1(key: string) {
      l1Map.delete(key);
    },
    invalidateWhere(predicate: (key: string, data: T | null) => boolean) {
      for (const [k, entry] of l1Map.entries()) {
        if (predicate(k, entry.data)) {
          l1Map.delete(k);
          stats.evictions += 1;
        }
      }
    },
    invalidate() {
      l1Map.clear();
      stats.evictions += 1;
    },
  };

  if (options?.scope) {
    const scopes = Array.isArray(options.scope) ? options.scope : [options.scope];
    registerCache({
      name: label,
      scopes,
      invalidate: () => instance.invalidate(),
      purge: async () => {
        instance.invalidate();
      },
      getSnapshot: () => {
        const total = stats.l1Hits + stats.l2Hits + stats.l3Misses;
        return {
          name: label,
          scope: scopes[0],
          kind: 'keyed',
          kvKey: kvPrefix ? `${kvPrefix}:*` : undefined,
          ttlMs: Number.isFinite(ttlMs) ? ttlMs : -1,
          l1State: l1Map.size > 0 ? 'WARM' : 'COLD',
          l1Entries: l1Map.size,
          lastLoadedAt: stats.lastLoadedAt,
          l1Hits: stats.l1Hits,
          l2Hits: stats.l2Hits,
          l3Misses: stats.l3Misses,
          negativeHits: stats.negativeHits,
          writes: stats.writes,
          evictions: stats.evictions,
          hitRatePct: calcHitRatePct(stats.l1Hits + stats.l2Hits, total),
        };
      },
      resetStats: () => {
        stats.l1Hits = 0;
        stats.l2Hits = 0;
        stats.l3Misses = 0;
        stats.negativeHits = 0;
        stats.writes = 0;
        stats.evictions = 0;
      },
    });
  }

  return instance;
}

/**
 * Keyed multi-tier CMS cache backed by createKeyedCache.
 */
export function createCmsKeyedCache<T>(
  keyPrefix: string,
  fetcher: (key: string, forceRefresh?: boolean) => Promise<T | null>,
  options?: KeyedCacheOptions
): KeyedCache<T> {
  return createKeyedCache<T>(fetcher, {
    ...options,
    ttlMs: options?.ttlMs ?? Infinity,
    kvPrefix: keyPrefix,
    name: options?.name || keyPrefix,
  });
}
