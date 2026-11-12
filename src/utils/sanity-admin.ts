// src/utils/sanity-admin.ts
// Server-side dedicated Sanity Client with write authorization for /admin operations.
// STRICT SECURITY NOTICE: Never import this module in client-side scripts.

import { createEdgeSanityClient, type SanityClient } from './sanity-client';
import { getRuntimeEnv } from './auth';

export function getSanityAdminClient(customEnv?: any): SanityClient {
  const projectId = getRuntimeEnv('SANITY_PROJECT_ID', customEnv);
  if (!projectId) {
    throw new Error('SANITY_PROJECT_ID is required for CMS Admin operations');
  }

  const dataset = getRuntimeEnv('SANITY_DATASET', customEnv) || 'production';
  const token =
    getRuntimeEnv('SANITY_TOKEN', customEnv) ||
    getRuntimeEnv('SANITY_API_TOKEN', customEnv) ||
    getRuntimeEnv('SANITY_WRITE_TOKEN', customEnv);

  if (!token) {
    throw new Error('SANITY_TOKEN with write permissions is required for CMS Admin operations');
  }

  // Always use fresh live API (no CDN caching) for administrative mutations & reads
  return createEdgeSanityClient(
    {
      projectId,
      dataset,
      token,
      useCdn: false,
      apiVersion: '2024-01-31',
      perspective: 'published',
    },
    'AdminWrite'
  );
}
