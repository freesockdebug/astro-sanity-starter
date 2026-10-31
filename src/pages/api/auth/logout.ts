// src/pages/api/auth/logout.ts
import type { APIRoute } from 'astro';
import { formatClearSessionCookie, getRuntimeEnv } from '@utils/auth';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const ALL: APIRoute = async ({ request, url }) => {
  const returnUrl = url.searchParams.get('returnUrl') || '/';
  const clearCookie = formatClearSessionCookie();

  const endpoint = getRuntimeEnv('LOGTO_ENDPOINT', cfEnv)?.replace(/\/+$/, '');
  const appId = getRuntimeEnv('LOGTO_APP_ID', cfEnv);

  let targetUrl = returnUrl;
  if (endpoint && appId) {
    const postLogoutUrl = new URL(`${endpoint}/oidc/session/end`);
    postLogoutUrl.searchParams.set('client_id', appId);

    // Resolve base origin (e.g. https://gwenvenni.com or http://localhost:4321)
    const host = request.headers.get('host') || url.host;
    const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '') || 'https';
    const origin = url.origin && url.origin !== 'null' ? url.origin : `${proto}://${host}`;

    // Ensure post_logout_redirect_uri is an absolute registered URI
    let absoluteRedirect = `${origin}/`;
    try {
      const parsed = returnUrl.startsWith('http://') || returnUrl.startsWith('https://')
        ? new URL(returnUrl)
        : new URL(returnUrl, origin);

      // Known registered redirect paths in Logto
      if (['/', '/orders', '/admin/orders'].includes(parsed.pathname)) {
        absoluteRedirect = `${origin}${parsed.pathname}`;
      }
    } catch {
      absoluteRedirect = `${origin}/`;
    }

    postLogoutUrl.searchParams.set('post_logout_redirect_uri', absoluteRedirect);
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

