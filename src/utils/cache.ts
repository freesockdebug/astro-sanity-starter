import { kvGet, kvPut } from './kv';

/**
 * Lightweight multi-tier SWR (Stale-While-Revalidate) & Single-Flight Cache
 * L1: In-memory isolate cache (10s)
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

  return {
    seed(val?: T | null) {
      // Pure in-memory context seeding for the active request isolate.
      // Must NOT write to KV to avoid 1 write/sec per key rate-limits and quota depletion.
      value = val !== undefined && val !== null ? val : fallback;
      timestamp = Date.now();
      if (onUpdate && value) onUpdate(value);
    },
    invalidate() {
      // Resets local isolate memory state. Edge KV deletions are centrally handled & awaited in /api/revalidate.
      value = null;
      timestamp = 0;
    },
    peek() {
      return value;
    },
    async get(forceRefresh = false): Promise<T> {
      const now = Date.now();
      // 1. L1 Memory Cache Hit
      if (!forceRefresh && value !== null && now - timestamp < ttlMs) {
        return value;
      }
      if (!forceRefresh && inflight) {
        return inflight;
      }

      inflight = (async () => {
        try {
          // 2. L2 Cloudflare KV Cache Hit
          if (!forceRefresh && kvKey) {
            try {
              const kvVal = await kvGet<T>(kvKey);
              if (kvVal !== null && kvVal !== undefined) {
                value = kvVal;
                timestamp = Date.now();
                if (onUpdate && value) onUpdate(value);
                return value;
              }
            } catch {
              // Non-blocking fallback to L3 fetcher
            }
          }

          // 3. L3 Upstream CMS Fetch
          const res = await fetcher();
          const hasValidData = res !== undefined && res !== null;
          value = hasValidData ? res : fallback;
          timestamp = Date.now();
          if (onUpdate && value) onUpdate(value);

          // Populate L2 KV Cache ONLY when upstream fetch succeeded with valid data
          if (kvKey && hasValidData) {
            await kvPut(kvKey, value, { expirationTtl: kvTtl }).catch(() => {});
          }

          return value;
        } catch (err) {
          console.error('[createSwrCache] Fetch failed, falling back to cached value:', err);
          value = value !== null ? value : fallback;
          timestamp = Date.now();
          return value;
        } finally {
          inflight = null;
        }
      })();

      return inflight;
    },
  };
}
