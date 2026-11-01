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

  const user = await getSessionFromRequest(request, cfEnv);

  // If Logto OIDC is active, redirect to Logto official hosted password reset flow
  if (endpoint && appId) {
    const forgotPasswordUrl = new URL(`${endpoint}/forgot-password`);
    forgotPasswordUrl.searchParams.set('client_id', appId);
    if (user?.email) {
      forgotPasswordUrl.searchParams.set('identifier', user.email);
    }
    return new Response(null, {
      status: 302,
      headers: {
        Location: forgotPasswordUrl.toString(),
      },
    });
  }

  // Developer / Local Preview Fallback
  return new Response(
    JSON.stringify({
      message: 'Password reset is managed securely by Logto Identity Cloud.',
      howToConfigure: 'Set LOGTO_ENDPOINT and LOGTO_APP_ID in your environment variables.',
      endpoint: endpoint || 'Not configured',
      currentEmail: user?.email || 'Anonymous',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
