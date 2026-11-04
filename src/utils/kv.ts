// src/utils/kv.ts
// Resilient Cloudflare KV Edge Cache Service with graceful degradation

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
  try {
    const kv = await getKvNamespace(customEnv);
    if (!kv) return false;
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
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
