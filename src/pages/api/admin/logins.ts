// src/pages/api/admin/logins.ts
import type { APIRoute } from 'astro';
import { defineAdminApi, jsonNoCache } from '@utils/auth';
import { parsePaginationParams } from '@utils/format';
import { listAllLoginHistory } from '@utils/db';

export const prerender = false;

export const GET: APIRoute = defineAdminApi(
  { menu: 'logins' },
  async ({ url }) => {
    const { limit } = parsePaginationParams(url.searchParams, 150, 300);
    const logins = await listAllLoginHistory(limit);
    return jsonNoCache({ success: true, logins });
  }
);
