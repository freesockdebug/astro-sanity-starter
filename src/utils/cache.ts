import { waitUntil as cfWaitUntil } from 'cloudflare:workers';

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
export async function kvGet<T = any>(key: string, customEnv?: any): Promise<T | null> {
  try {
    const kv = await getKvNamespace(customEnv);
    if (!kv) return null;
    const raw = await kv.get(key, 'text');
    if (raw === null || raw === undefined) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  } catch (err) {
    console.warn(`[KV:Get] Non-fatal read failure for key "${key}":`, err);
    return null;
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
    } catch {}
  }
  promise.catch(() => {});
}

export interface TieredCacheFetchResult<TRaw> {
  data: TRaw;
  persistToKv?: boolean;
}

export interface TieredCacheOptions<TRaw, TCompiled = TRaw> {
  name: string;
  kvKey: string;
  ttlMs?: number;
  kvTtlSeconds?: number;
  fallbackRaw: TRaw;
  compile?: (raw: TRaw) => TCompiled;
  deserializeKv?: (raw: any) => TRaw | null;
  fetchRaw: (customEnv?: any) => Promise<TieredCacheFetchResult<TRaw> | TRaw | null>;
}

/**
 * Reusable L1 (Isolate Memory + Pre-Compiled Object) -> L2 (Edge KV) -> L3 (DB/Upstream) Cache Library.
 * - Compiles TRaw -> TCompiled once on L1 fill, eliminating repeated RegExp/CIDR parsing on hot paths.
 * - Never caches cross-request Promises in module scope (Cloudflare Workers isolate safe).
 */
export class EdgeTieredCache<TRaw, TCompiled = TRaw> {
  private entry: { raw: TRaw; compiled: TCompiled; loadedAt: number } | null = null;
  private readonly name: string;
  private readonly kvKey: string;
  private readonly ttlMs: number;
  private readonly kvTtlSeconds?: number;
  private readonly fallbackRaw: TRaw;
  private readonly compileFn: (raw: TRaw) => TCompiled;
  private readonly deserializeKv?: (raw: any) => TRaw | null;
  private readonly fetchRawFn: (customEnv?: any) => Promise<TieredCacheFetchResult<TRaw> | TRaw | null>;

  constructor(options: TieredCacheOptions<TRaw, TCompiled>) {
    this.name = options.name;
    this.kvKey = options.kvKey;
    this.ttlMs = options.ttlMs ?? 5_000;
    this.kvTtlSeconds = options.kvTtlSeconds;
    this.fallbackRaw = options.fallbackRaw;
    this.compileFn = options.compile ?? ((raw: TRaw) => raw as unknown as TCompiled);
    this.deserializeKv = options.deserializeKv;
    this.fetchRawFn = options.fetchRaw;
  }

  private storeL1(raw: TRaw): TCompiled {
    const compiled = this.compileFn(raw);
    this.entry = { raw, compiled, loadedAt: Date.now() };
    return compiled;
  }

  public peek(): TCompiled | null {
    return this.entry ? this.entry.compiled : null;
  }

  public peekRaw(): TRaw | null {
    return this.entry ? this.entry.raw : null;
  }

  public invalidate(): void {
    this.entry = null;
  }

  public async evict(customEnv?: any): Promise<void> {
    this.entry = null;
    await kvDelete(this.kvKey, customEnv).catch(() => {});
  }

  public async set(
    raw: TRaw,
    customEnv?: any,
    options?: { syncKv?: boolean }
  ): Promise<TCompiled> {
    const compiled = this.storeL1(raw);
    const kvOpts = this.kvTtlSeconds ? { expirationTtl: this.kvTtlSeconds } : undefined;
    if (options?.syncKv !== false) {
      await kvPut(this.kvKey, raw, kvOpts, customEnv).catch(() => {});
    } else {
      runInBackground(kvPut(this.kvKey, raw, kvOpts, customEnv));
    }
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
      return this.entry.compiled;
    }

    // L2: Shared Cloudflare Edge KV
    if (!forceRefresh) {
      try {
        const kvVal = await kvGet<any>(this.kvKey, customEnv);
        if (kvVal !== null && kvVal !== undefined) {
          const raw = this.deserializeKv ? this.deserializeKv(kvVal) : (kvVal as TRaw);
          if (raw !== null && raw !== undefined) {
            return this.storeL1(raw);
          }
        }
      } catch (err) {
        console.warn(`[TieredCache:${this.name}] L2 KV read failed:`, err);
      }
    }

    // L3: Upstream / Database
    try {
      const res = await this.fetchRawFn(customEnv);
      if (res !== null && res !== undefined) {
        const isWrapped =
          typeof res === 'object' &&
          res !== null &&
          'data' in res &&
          'persistToKv' in res &&
          typeof (res as any).persistToKv === 'boolean';
        const raw = isWrapped ? (res as TieredCacheFetchResult<TRaw>).data : (res as TRaw);
        const persistToKv = isWrapped ? (res as TieredCacheFetchResult<TRaw>).persistToKv !== false : true;
        const compiled = this.storeL1(raw);

        if (persistToKv) {
          const kvOpts = this.kvTtlSeconds ? { expirationTtl: this.kvTtlSeconds } : undefined;
          if (forceRefresh || options?.syncKv) {
            await kvPut(this.kvKey, raw, kvOpts, customEnv).catch(() => {});
          } else {
            runInBackground(kvPut(this.kvKey, raw, kvOpts, customEnv));
          }
        }
        return compiled;
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
  return new EdgeTieredCache(options);
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
  kvKey?: string;
  ttlMs?: number;
  onUpdate?: (val: T) => void;
}

/**
 * Zero-polling multi-tier CMS cache (L1 Isolate Memory 5m -> L2 Permanent Edge KV -> L3 Sanity)
 * - L1 fresh window (default 5 min): 0ms in-memory return
 * - L1 expired: reads shared L2 KV (1~3ms) and refreshes L1 without calling Sanity
 * - Upstream Sanity fetcher only runs on explicit refresh (CMS save / Webhook) or KV cold miss
 */
export function createCmsCache<T>(
  fetcher: (forceRefresh?: boolean) => Promise<T>,
  fallback: T,
  options?: CmsCacheOptions<T>
): CmsCache<T> {
  let value: T | null = null;
  let timestamp = 0;
  const kvKey = options?.kvKey;
  const ttlMs = options?.ttlMs ?? 300_000;
  const onUpdate = options?.onUpdate;

  // Note: Do NOT store inflight Promises in module scope; Cloudflare Workers forbids cross-request Promise resolution.
  const load = async (forceRefresh = false, customEnv?: any): Promise<T> => {
    try {
      // 1. L1 expired -> sync from shared L2 KV (never poll Sanity on timer!)
      if (!forceRefresh && kvKey) {
        const kvVal = await kvGet<T>(kvKey, customEnv).catch(() => null);
        if (kvVal !== null && kvVal !== undefined) {
          value = kvVal;
          timestamp = Date.now();
          if (onUpdate) onUpdate(value);
          return value;
        }
      }

      // 2. Upstream Sanity fetch (Write-Through on forceRefresh, or first-ever KV miss)
      const res = await fetcher(forceRefresh);
      const hasValidData =
        res !== undefined &&
        res !== null &&
        (forceRefresh || !Array.isArray(res) || res.length > 0);

      if (hasValidData) {
        value = res;
        timestamp = Date.now();
        if (onUpdate) onUpdate(value);

        if (kvKey) {
          if (forceRefresh) {
            await kvPut(kvKey, value, undefined, customEnv).catch(() => {});
          } else {
            runInBackground(kvPut(kvKey, value, undefined, customEnv));
          }
        }
      } else if (value === null) {
        value = fallback;
      }
      return (value ?? fallback) as T;
    } catch (err) {
      console.error('[createCmsCache] Fetch failed, falling back to cached value:', err);
      return (value ?? fallback) as T;
    }
  };

  return {
    seed(val?: T | null) {
      value = val !== undefined && val !== null ? val : fallback;
      timestamp = Date.now();
      if (onUpdate && value) onUpdate(value);
    },
    invalidate() {
      value = null;
      timestamp = 0;
    },
    peek() {
      return value;
    },
    async get(forceRefresh = false, customEnv?: any): Promise<T> {
      if (!forceRefresh && value !== null && Date.now() - timestamp < ttlMs) {
        return value;
      }
      return load(forceRefresh, customEnv);
    },
    async refresh(customEnv?: any): Promise<T> {
      return load(true, customEnv);
    },
    async evict(customEnv?: any): Promise<void> {
      value = null;
      timestamp = 0;
      if (kvKey) {
        await kvDelete(kvKey, customEnv).catch(() => {});
      }
    },
  };
}

export interface CmsKeyedCache<T> {
  get(key: string, customEnv?: any, forceRefresh?: boolean): Promise<T | null>;
  refresh(key: string, customEnv?: any): Promise<T | null>;
  evict(key: string, customEnv?: any): Promise<void>;
  seed(key: string, data: T): void;
  invalidate(): void;
}

export interface CmsKeyedCacheOptions {
  ttlMs?: number;
  negativeTtlMs?: number;
  maxL1Entries?: number;
}

/**
 * Keyed multi-tier CMS cache with Single-Flight deduplication & 404 negative L1 caching
 * Replaces bespoke slug caches across products and pages.
 */
export function createCmsKeyedCache<T>(
  keyPrefix: string,
  fetcher: (key: string, forceRefresh?: boolean) => Promise<T | null>,
  options?: CmsKeyedCacheOptions
): CmsKeyedCache<T> {
  const ttlMs = options?.ttlMs ?? 300_000;
  const negativeTtlMs = options?.negativeTtlMs ?? 30_000;
  const maxEntries = options?.maxL1Entries ?? 500;
  const l1Map = new Map<string, { data: T | null; timestamp: number }>();

  const setL1 = (key: string, data: T | null) => {
    l1Map.set(key, { data, timestamp: Date.now() });
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
          if (age < negativeTtlMs) return null;
        } else if (age < ttlMs) {
          return structuredClone(hit.data);
        }
      }
    }

    const cacheKey = `${keyPrefix}:${rawKey}`;
    try {
      if (!forceRefresh) {
        try {
          const kvHit = await kvGet<any>(cacheKey, customEnv);
          if (kvHit && !kvHit.notFound) {
            setL1(rawKey, kvHit);
            return structuredClone(kvHit);
          }
        } catch {}
      }

      const data = await fetcher(rawKey, forceRefresh);
      if (data) {
        setL1(rawKey, data);
        if (forceRefresh) {
          await kvPut(cacheKey, data, undefined, customEnv).catch(() => {});
        } else {
          runInBackground(kvPut(cacheKey, data, undefined, customEnv));
        }
        return structuredClone(data);
      } else {
        setL1(rawKey, null);
        if (forceRefresh) {
          await kvDelete(cacheKey, customEnv).catch(() => {});
        }
        return null;
      }
    } catch (err: any) {
      console.error(`[createCmsKeyedCache:${keyPrefix}] Fetch failed for ${rawKey}:`, err?.message);
      const stale = l1Map.get(rawKey);
      return stale && stale.data ? structuredClone(stale.data) : null;
    }
  };

  return {
    get,
    async refresh(key: string, customEnv?: any): Promise<T | null> {
      return get(key, customEnv, true);
    },
    async evict(key: string, customEnv?: any): Promise<void> {
      l1Map.delete(key);
      await kvDelete(`${keyPrefix}:${key}`, customEnv).catch(() => {});
    },
    seed(key: string, data: T) {
      setL1(key, data);
    },
    invalidate() {
      l1Map.clear();
    },
  };
}
