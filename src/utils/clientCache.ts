// src/utils/clientCache.ts
// Universal High-Performance Client-Side IndexedDB Cache Layer (TTL & SWR Strategies)

interface CacheEnvelope<T = any> {
  data: T;
  cachedAt: number;
  ttlMs?: number;
}

export interface FetchWithCacheOptions<T = any> {
  mode: 'ttl' | 'swr';
  ttlMs?: number;
  init?: RequestInit;
  onData?: (data: T, isFromCache: boolean) => void;
}

const DB_NAME = 'gw_client_cache_v1';
const STORE_NAME = 'keyval';
let dbInstance: IDBDatabase | null = null;
const memoryFallback = new Map<string, CacheEnvelope>();
const inFlightNetwork = new Map<string, Promise<any>>();

// Cross-tab broadcast synchronization (TanStack Query pattern)
const cacheSyncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('gv_cache_sync') : null;
if (cacheSyncChannel) {
  try {
    (cacheSyncChannel as any).unref?.();
  } catch {}
  cacheSyncChannel.onmessage = (event) => {
    try {
      const { type, prefix, key } = event.data || {};
      if (type === 'DEL' && key) {
        memoryFallback.delete(key);
        inFlightNetwork.delete(key);
      } else if (type === 'INVALIDATE_PREFIX' && prefix) {
        for (const k of memoryFallback.keys()) {
          if (k.startsWith(prefix)) memoryFallback.delete(k);
        }
        for (const k of inFlightNetwork.keys()) {
          if (k.startsWith(prefix)) inFlightNetwork.delete(k);
        }
      } else if (type === 'CLEAR') {
        memoryFallback.clear();
        inFlightNetwork.clear();
      }
    } catch {}
  };
}

async function doFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const timeoutSignal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(6000)
    : undefined;

  const res = await fetch(url, {
    ...init,
    signal: init?.signal || timeoutSignal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

function fetchJsonWithDeduplication<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return doFetch<T>(url, init);
  }

  const existing = inFlightNetwork.get(url);
  if (existing) {
    return existing;
  }

  const promise = doFetch<T>(url, init).finally(() => {
    inFlightNetwork.delete(url);
  });

  inFlightNetwork.set(url, promise);
  return promise;
}

/**
 * Resolves IndexedDB connection safely across all browsers and environments.
 * Gracefully degrades to an in-memory Map if IndexedDB is blocked or disabled.
 */
function getIDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => {
        dbInstance = req.result;
        resolve(dbInstance);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function getEnvelope<T = any>(key: string): Promise<CacheEnvelope<T> | null> {
  const db = await getIDB();
  if (!db) {
    return (memoryFallback.get(key) as CacheEnvelope<T>) || null;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function setEnvelope<T = any>(key: string, data: T, ttlMs?: number): Promise<void> {
  const envelope: CacheEnvelope<T> = {
    data,
    cachedAt: Date.now(),
    ttlMs,
  };

  const db = await getIDB();
  if (!db) {
    memoryFallback.set(key, envelope);
    return;
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(envelope, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export const clientCache = {
  /**
   * Retrieves raw data if present in cache (regardless of TTL).
   */
  async get<T = any>(key: string): Promise<T | null> {
    const envelope = await getEnvelope<T>(key);
    return envelope ? envelope.data : null;
  },

  /**
   * Directly sets a value into IndexedDB with an optional TTL.
   */
  async set<T = any>(key: string, data: T, ttlMs?: number): Promise<void> {
    await setEnvelope(key, data, ttlMs);
  },

  /**
   * Deletes a specific key from IndexedDB.
   */
  async del(key: string): Promise<void> {
    try {
      cacheSyncChannel?.postMessage({ type: 'DEL', key });
    } catch {}

    const db = await getIDB();
    if (!db) {
      memoryFallback.delete(key);
      return;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  },

  /**
   * Invalidates all keys beginning with a specific prefix (e.g. 'admin:orders' or 'buyer:orders').
   */
  async invalidatePrefix(prefix: string): Promise<void> {
    try {
      cacheSyncChannel?.postMessage({ type: 'INVALIDATE_PREFIX', prefix });
    } catch {}

    const db = await getIDB();
    if (!db) {
      for (const k of memoryFallback.keys()) {
        if (k.startsWith(prefix)) memoryFallback.delete(k);
      }
      return;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.openKeyCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            const k = String(cursor.key);
            if (k.startsWith(prefix)) {
              store.delete(cursor.key);
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  },

  /**
   * Clears the entire cache store.
   */
  async clear(): Promise<void> {
    try {
      cacheSyncChannel?.postMessage({ type: 'CLEAR' });
    } catch {}

    const db = await getIDB();
    if (!db) {
      memoryFallback.clear();
      return;
    }

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  },

  /**
   * Dual-Strategy Unified Fetch:
   * - Mode 'ttl': returns valid local cache instantly without any network request. Fetches and updates only on expiration.
   * - Mode 'swr': immediately emits cached data for 0ms initial render, while concurrently fetching fresh network data in the background.
   */
  async fetchWithCache<T = any>(
    key: string,
    url: string,
    options: FetchWithCacheOptions<T>
  ): Promise<T> {
    const { mode, ttlMs = 180000, init, onData } = options;

    if (mode === 'ttl') {
      const cached = await getEnvelope<T>(key);
      const now = Date.now();
      if (cached && now - cached.cachedAt < ttlMs) {
        if (onData) onData(cached.data, true);
        return cached.data;
      }

      const freshData = await fetchJsonWithDeduplication<T>(url, init);
      await setEnvelope(key, freshData, ttlMs);
      if (onData) onData(freshData, false);
      return freshData;
    }

    // mode === 'swr'
    let hasEmittedCache = false;
    let cachedData: T | null = null;
    const cached = await getEnvelope<T>(key);
    if (cached) {
      hasEmittedCache = true;
      cachedData = cached.data;
      if (onData) {
        try {
          onData(cached.data, true);
        } catch (e) {
          console.warn('[Cache SWR onData error]', e);
        }
      }
    }

    try {
      const freshData = await fetchJsonWithDeduplication<T>(url, init);
      // Prevent resetting active user UI states (such as open accordions or focus) if data is identical
      const isUnchanged = hasEmittedCache && JSON.stringify(cachedData) === JSON.stringify(freshData);
      await setEnvelope(key, freshData);
      if (onData && !isUnchanged) {
        onData(freshData, false);
      }
      return freshData;
    } catch (err: any) {
      if (err?.name === 'AbortError') throw err;
      if (hasEmittedCache && cachedData !== null) {
        return cachedData;
      }
      throw err;
    }
  },
};

// Global click delegation to clear all client caches whenever a user logs out from anywhere
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const anchor = (e.target as HTMLElement)?.closest?.('a[href*="/api/auth/logout"]');
    if (anchor) {
      clientCache.clear().catch(() => {});
    }
  });
}
