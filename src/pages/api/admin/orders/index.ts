// src/pages/api/admin/orders/index.ts
import type { APIRoute } from 'astro';
import { getSessionFromRequest } from '@utils/auth';
import { listAdminOrders } from '@utils/db';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const user = await getSessionFromRequest(request);
  if (!user || !user.isAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden. Administrator access required.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const status = url.searchParams.get('status') || undefined;
  const search = url.searchParams.get('search') || undefined;
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));

  const result = await listAdminOrders({ status, search, page, limit });

  return new Response(
    JSON.stringify({
      success: true,
      ...result,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
};
