// src/pages/api/auth/login.ts
import type { APIRoute } from 'astro';
import { getRuntimeEnv, buildLogtoAuthRedirect } from '@utils/auth';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const endpoint = getRuntimeEnv('LOGTO_ENDPOINT', cfEnv)?.replace(/\/+$/, '');
  const appId = getRuntimeEnv('LOGTO_APP_ID', cfEnv);

  if (!endpoint || !appId) {
    return new Response(
      JSON.stringify({ error: 'Missing required environment variables: LOGTO_ENDPOINT and LOGTO_APP_ID' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return buildLogtoAuthRedirect({
    request,
    endpoint,
    appId,
    returnUrl: url.searchParams.get('returnUrl') || '/orders',
    isPopup: url.searchParams.get('popup') === '1',
    cfEnv,
  });
};
