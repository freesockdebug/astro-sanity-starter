/**
 * Lightweight in-memory SWR (Stale-While-Revalidate) & Single-Flight Cache
 * Deduplicates concurrent async fetches in single-threaded/Worker environments
 * and protects against upstream CMS hammering.
 */
export interface SwrCache<T> {
  seed(val?: T | null): void;
  invalidate(): void;
  get(forceRefresh?: boolean): Promise<T>;
  peek(): T | null;
}

export function createSwrCache<T>(
  fetcher: () => Promise<T>,
  fallback: T,
  ttlMs = 10_000,
  onUpdate?: (val: T) => void
): SwrCache<T> {
  let value: T | null = null;
  let timestamp = 0;
  let inflight: Promise<T> | null = null;

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
      const now = Date.now();
      if (!forceRefresh && value !== null && now - timestamp < ttlMs) {
        return value;
      }
      if (!forceRefresh && inflight) {
        return inflight;
      }

      inflight = (async () => {
        try {
          const res = await fetcher();
          value = res !== undefined && res !== null ? res : fallback;
          timestamp = Date.now();
          if (onUpdate && value) onUpdate(value);
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
