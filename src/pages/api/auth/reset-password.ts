// src/pages/api/auth/reset-password.ts
import type { APIRoute } from 'astro';
import { getRuntimeEnv, getSessionFromRequest } from '@utils/auth';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const endpoint = getRuntimeEnv('LOGTO_ENDPOINT', cfEnv)?.replace(/\/+$/, '');
  const appId = getRuntimeEnv('LOGTO_APP_ID', cfEnv);
  const returnUrl = url.searchParams.get('returnUrl') || '/account';

  const reqUrl = new URL(request.url);
  const protocol = reqUrl.protocol;
  const host = reqUrl.host;
  const callbackUrl = `${protocol}//${host}/api/auth/callback`;

  const user = await getSessionFromRequest(request, cfEnv);
  const emailHint = user?.email || url.searchParams.get('email') || '';

  // 1. Production / Live Logto OIDC Flow
  // Directs to Logto's hosted reset password experience with an active OIDC session
  if (endpoint && appId) {
    const state = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
    const authUrl = new URL(`${endpoint}/oidc/auth`);
    authUrl.searchParams.set('client_id', appId);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid profile email roles');
    authUrl.searchParams.set('first_screen', 'reset_password');
    authUrl.searchParams.set('state', state);

    if (emailHint) {
      authUrl.searchParams.set('login_hint', emailHint);
    }

    const stateCookiePayload = JSON.stringify({ state, returnUrl, isPopup: false });
    const stateCookie = `logto_oauth_state=${encodeURIComponent(stateCookiePayload)}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax`;

    return new Response(null, {
      status: 302,
      headers: {
        Location: authUrl.toString(),
        'Set-Cookie': stateCookie,
      },
    });
  }

  // 2. Local Development & Demo Interactive Login Screen (Zero friction fallback)
  return new Response(
    JSON.stringify({
      message: 'Password reset is managed securely by Logto Identity Cloud.',
      howToConfigure: 'Set LOGTO_ENDPOINT and LOGTO_APP_ID in your environment variables.',
      endpoint: endpoint || 'Not configured',
      currentEmail: emailHint || 'Anonymous',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};

