// src/pages/api/auth/logout.ts
import type { APIRoute } from 'astro';
import { formatClearSessionCookie, getRuntimeEnv } from '@utils/auth';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const ALL: APIRoute = async ({ url }) => {
  const returnUrl = url.searchParams.get('returnUrl') || '/';
  const clearCookie = formatClearSessionCookie();

  const endpoint = getRuntimeEnv('LOGTO_ENDPOINT', cfEnv)?.replace(/\/+$/, '');
  const appId = getRuntimeEnv('LOGTO_APP_ID', cfEnv);

  let targetUrl = returnUrl;
  if (endpoint && appId) {
    const postLogoutUrl = new URL(`${endpoint}/oidc/session/end`);
    postLogoutUrl.searchParams.set('client_id', appId);
    postLogoutUrl.searchParams.set('post_logout_redirect_uri', returnUrl);
    targetUrl = postLogoutUrl.toString();
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: targetUrl,
      'Set-Cookie': clearCookie,
    },
  });
};

