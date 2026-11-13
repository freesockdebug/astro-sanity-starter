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
  let inflight: Promise<T> | null = null;
  const kvKey = options?.kvKey;
  const ttlMs = options?.ttlMs ?? 300_000;
  const onUpdate = options?.onUpdate;

  const load = async (forceRefresh = false, customEnv?: any): Promise<T> => {
    if (!forceRefresh && inflight) return inflight;

    const task = (async (): Promise<T> => {
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
      } finally {
        if (!forceRefresh) inflight = null;
      }
    })();

    if (!forceRefresh) inflight = task;
    return task;
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
  const inflightMap = new Map<string, Promise<T | null>>();

  const setL1 = (key: string, data: T | null) => {
    l1Map.set(key, { data, timestamp: Date.now() });
    if (l1Map.size > maxEntries) {
      const oldest = l1Map.keys().next().value;
      if (oldest !== undefined) l1Map.delete(oldest);
    }
  };

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

      const existing = inflightMap.get(rawKey);
      if (existing) return existing;
    }

    const cacheKey = `${keyPrefix}:${rawKey}`;
    const task = (async (): Promise<T | null> => {
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
      } finally {
        if (!forceRefresh) inflightMap.delete(rawKey);
      }
    })();

    if (!forceRefresh) inflightMap.set(rawKey, task);
    return task;
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
      inflightMap.clear();
    },
  };
}
