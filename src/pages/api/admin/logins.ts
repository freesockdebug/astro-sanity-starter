// src/pages/api/admin/logins.ts
import type { APIRoute } from 'astro';
import { getSessionFromRequest } from '@utils/auth';
import { listAllLoginHistory } from '@utils/db';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const sessionUser = await getSessionFromRequest(request, cfEnv);
  if (!sessionUser || !sessionUser.isAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden. Admin access required.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
  const logins = await listAllLoginHistory(limit);

  return new Response(JSON.stringify({ logins }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

