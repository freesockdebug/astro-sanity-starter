// src/pages/api/geo.ts
import type { APIRoute } from 'astro';

export const prerender = false; // Run dynamically on Cloudflare Workers

export const GET: APIRoute = async ({ request, clientAddress }) => {
  const visitorIp =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    clientAddress ||
    '';

  const countryCode = (request.headers.get('cf-ipcountry') || (request as any).cf?.country || '').trim().toUpperCase();
  let countryName = '';

  if (countryCode && countryCode !== 'XX' && countryCode !== 'T1') {
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
      ip: visitorIp,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
};
