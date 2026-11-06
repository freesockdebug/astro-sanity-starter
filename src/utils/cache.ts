import { waitUntil as cfWaitUntil } from 'cloudflare:workers';
import { kvGet, kvPut } from './kv';

function runInBackground(promise: Promise<any>) {
  if (typeof cfWaitUntil === 'function') {
    try {
      cfWaitUntil(promise);
      return;
    } catch {}
  }
  promise.catch(() => {});
}

/**
 * Lightweight multi-tier SWR (Stale-While-Revalidate) & Single-Flight Cache
 * L1: In-memory isolate cache (Fresh TTL + Stale TTL non-blocking background revalidation)
 * L2: Cloudflare Edge KV cache (Optional, 1~5ms)
 * L3: Upstream CMS fetch with concurrent deduplication
 */
export interface SwrCache<T> {
  seed(val?: T | null): void;
  invalidate(): void;
  get(forceRefresh?: boolean): Promise<T>;
  peek(): T | null;
}

export interface SwrCacheOptions {
  kvKey?: string;
  kvTtlSeconds?: number;
  staleTtlMs?: number;
}

export function createSwrCache<T>(
  fetcher: () => Promise<T>,
  fallback: T,
  ttlMs = 10_000,
  onUpdate?: (val: T) => void,
  options?: SwrCacheOptions
): SwrCache<T> {
  let value: T | null = null;
  let timestamp = 0;
  let inflight: Promise<T> | null = null;
  const kvKey = options?.kvKey;
  const kvTtl = options?.kvTtlSeconds || 86400;
  const staleTtlMs = options?.staleTtlMs || ttlMs * 30; // Default stale tolerance window (e.g. 5m for 10s TTL)

  const revalidate = async (forceRefresh = false): Promise<T> => {
    if (!forceRefresh && inflight) return inflight;
    inflight = (async () => {
      try {
        // 1. Check L2 KV on cold boot
        if (!forceRefresh && value === null && kvKey) {
          const kvVal = await kvGet<T>(kvKey).catch(() => null);
          if (kvVal !== null && kvVal !== undefined) {
            value = kvVal;
            timestamp = Date.now();
            if (onUpdate && value) onUpdate(value);
            return value;
          }
        }

        // 2. Upstream fetch
        const res = await fetcher();
        const hasValidData =
          res !== undefined &&
          res !== null &&
          (!Array.isArray(res) || res.length > 0);
        if (hasValidData) {
          value = res;
          timestamp = Date.now();
          if (onUpdate && value) onUpdate(value);
          // Non-blocking KV write in background
          if (kvKey) {
            runInBackground(kvPut(kvKey, value, { expirationTtl: kvTtl }));
          }
        } else if (value === null) {
          value = fallback;
        }
        return (value ?? fallback) as T;
      } catch (err) {
        console.error('[createSwrCache] Fetch failed, falling back to cached value:', err);
        return (value ?? fallback) as T;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
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
    async get(forceRefresh = false): Promise<T> {
      const age = Date.now() - timestamp;
      if (!forceRefresh && value !== null) {
        // 1. Fresh window: instant return
        if (age < ttlMs) return value;
        // 2. Stale window: instant return + non-blocking background revalidation
        if (age < staleTtlMs) {
          runInBackground(revalidate(true));
          return value;
        }
      }
      // 3. Cold boot, explicit refresh, or expired beyond stale window: await
      return revalidate(forceRefresh);
    },
  };
}
