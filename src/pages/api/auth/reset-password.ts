// src/pages/api/auth/reset-password.ts
import type { APIRoute } from 'astro';
import { getRuntimeEnv, getSessionFromRequest, buildLogtoAuthRedirect } from '@utils/auth';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const endpoint = getRuntimeEnv('LOGTO_ENDPOINT', cfEnv)?.replace(/\/+$/, '');
  const appId = getRuntimeEnv('LOGTO_APP_ID', cfEnv);
  const returnUrl = url.searchParams.get('returnUrl') || '/account';

  const user = await getSessionFromRequest(request, cfEnv);
  const emailHint = user?.email || url.searchParams.get('email') || '';

  // 1. Production / Live Logto OIDC Flow
  // Directs to Logto's hosted reset password experience with an active OIDC session
  if (endpoint && appId) {
    return buildLogtoAuthRedirect({
      request,
      endpoint,
      appId,
      returnUrl,
      isPopup: false,
      firstScreen: 'reset_password',
      loginHint: emailHint || undefined,
      cfEnv,
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

