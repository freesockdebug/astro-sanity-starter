// src/pages/api/auth/login.ts
import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '@utils/auth';
// @ts-ignore
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

  const isPopup = url.searchParams.get('popup') === '1';
  const returnUrl = url.searchParams.get('returnUrl') || '/orders';

  const reqUrl = new URL(request.url);
  const protocol = reqUrl.protocol;
  const host = reqUrl.host;
  const callbackUrl = `${protocol}//${host}/api/auth/callback`;

  const state = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
  const authUrl = new URL(`${endpoint}/oidc/auth`);
  authUrl.searchParams.set('client_id', appId);
  authUrl.searchParams.set('redirect_uri', callbackUrl);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid profile email roles');
  authUrl.searchParams.set('state', state);

  const stateCookiePayload = JSON.stringify({ state, returnUrl, isPopup });
  const stateCookie = `logto_oauth_state=${encodeURIComponent(stateCookiePayload)}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax`;

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      'Set-Cookie': stateCookie,
    },
  });
};
