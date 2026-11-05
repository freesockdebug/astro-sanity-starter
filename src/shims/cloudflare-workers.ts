// src/shims/cloudflare-workers.ts
// Node.js fallback shim for local test scripts & tools
export const env: Record<string, any> = {};
export const waitUntil = (promise: Promise<any>) => {
  if (promise && typeof promise.catch === 'function') {
    promise.catch(() => {});
  }
};
export default { env, waitUntil };

