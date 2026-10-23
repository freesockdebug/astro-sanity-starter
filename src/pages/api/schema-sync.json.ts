// src/pages/api/schema-sync.json.ts
import type { APIRoute } from 'astro';
import { getSchemaSyncSummary } from '@utils/schemaSync';
import { SecurityService } from '@utils/security';

export const GET: APIRoute = async ({ request, url }) => {
  const simulateDrift = url.searchParams.get('drift') === 'true' || url.searchParams.get('simulate') === 'true';
  const report = getSchemaSyncSummary(simulateDrift);

  return new Response(JSON.stringify(report, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      ...SecurityService.getCorsHeaders(request, url, 'GET, OPTIONS'),
    },
  });
};


