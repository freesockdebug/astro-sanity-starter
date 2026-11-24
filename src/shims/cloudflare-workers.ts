// src/shims/cloudflare-workers.ts
// Node.js fallback shim for local test scripts & tools
export const env: Record<string, any> = {
  SANITY_PROJECT_ID: process.env.SANITY_PROJECT_ID || 'xvhhd8u0',
  SANITY_DATASET: process.env.SANITY_DATASET || 'production',
};
export const waitUntil = (promise: Promise<any>) => {
  if (promise && typeof promise.catch === 'function') {
    promise.catch(() => {});
  }
};
export default { env, waitUntil };

