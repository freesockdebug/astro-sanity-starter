// src/pages/api/geo.ts
import type { APIRoute } from 'astro';
import { SecurityService } from '@utils/security';

export const prerender = false; // Run dynamically on Cloudflare Workers

export const OPTIONS: APIRoute = async ({ request, url }) => {
  const corsHeaders = SecurityService.getCorsHeaders(request, url, 'GET, OPTIONS');
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
};

export const GET: APIRoute = async ({ request, url }) => {
  const corsHeaders = SecurityService.getCorsHeaders(request, url, 'GET, OPTIONS');
  const countryCode = SecurityService.resolveCountry(request);
  let countryName = '';

  if (countryCode) {
    try {
      countryName = new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode) || countryCode;
    } catch {
      countryName = countryCode;
    }
  }

  return new Response(
    JSON.stringify({
      countryCode,
      countryName: countryName || countryCode,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        ...corsHeaders,
      },
    }
  );
};
