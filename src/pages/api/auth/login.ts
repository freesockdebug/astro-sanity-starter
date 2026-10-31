// src/pages/api/auth/login.ts
import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '@utils/auth';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const endpoint = getRuntimeEnv('LOGTO_ENDPOINT')?.replace(/\/+$/, '');
  const appId = getRuntimeEnv('LOGTO_APP_ID');
  const isPopup = url.searchParams.get('popup') === '1';
  const returnUrl = url.searchParams.get('returnUrl') || '/orders';

  const reqUrl = new URL(request.url);
  const protocol = reqUrl.protocol;
  const host = reqUrl.host;
  const callbackUrl = `${protocol}//${host}/api/auth/callback`;

  // 1. Production / Live Logto OIDC Flow
  if (endpoint && appId) {
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
  }

  // 2. Local Development & Demo Interactive Login Screen (Zero friction fallback)
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In - GwenVenni B2B Atelier</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f5f5f7;
      color: #1d1d1f;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 16px;
    }
    .card {
      background: #ffffff;
      border: 1px solid rgba(0,0,0,0.08);
      border-radius: 18px;
      padding: 32px 28px;
      max-width: 400px;
      width: 100%;
      box-shadow: 0 10px 25px rgba(0,0,0,0.05);
    }
    h2 { margin: 0 0 8px; font-size: 20px; font-weight: 600; letter-spacing: -0.02em; }
    p { margin: 0 0 20px; font-size: 13px; color: #86868b; line-height: 1.5; }
    .btn {
      display: block;
      width: 100%;
      box-sizing: border-box;
      padding: 12px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 500;
      text-align: center;
      text-decoration: none;
      cursor: pointer;
      margin-bottom: 10px;
      transition: all 0.15s ease;
      border: none;
    }
    .btn-primary { background: #1d1d1f; color: #ffffff; }
    .btn-primary:hover { background: #000000; }
    .btn-secondary { background: #f5f5f7; color: #1d1d1f; border: 1px solid rgba(0,0,0,0.06); }
    .btn-secondary:hover { background: #ebebf0; }
    .divider { display: flex; align-items: center; margin: 18px 0; color: #86868b; font-size: 11px; }
    .divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: rgba(0,0,0,0.08); }
    .divider::before { margin-right: 10px; }
    .divider::after { margin-left: 10px; }
    input {
      width: 100%;
      box-sizing: border-box;
      padding: 11px 12px;
      font-size: 13px;
      border-radius: 10px;
      border: 1px solid rgba(0,0,0,0.12);
      background: #fbfbfd;
      margin-bottom: 12px;
      outline: none;
    }
    input:focus { border-color: #1d1d1f; background: #ffffff; }
    .badge { display: inline-block; padding: 2px 7px; background: #f0f0f2; border-radius: 6px; font-size: 11px; font-family: monospace; }
  </style>
</head>
<body>
  <div class="card">
    <h2>GwenVenni B2B Sign In</h2>
    <p>Sign in with your work email to track RFQs and claim historical orders automatically.</p>

    <a href="/api/auth/callback?mock_email=forhaisome@gmail.com&mock_name=Administrator&mock_admin=1&popup=${isPopup ? '1' : '0'}" class="btn btn-primary">
      Sign in as Administrator <span class="badge">forhaisome@gmail.com</span>
    </a>

    <a href="/api/auth/callback?mock_email=buyer@client.com&mock_name=B2B+Buyer&popup=${isPopup ? '1' : '0'}" class="btn btn-secondary">
      Sign in as Sample Buyer <span class="badge">buyer@client.com</span>
    </a>

    <div class="divider">OR ENTER YOUR WORK EMAIL</div>

    <form method="GET" action="/api/auth/callback">
      <input type="hidden" name="popup" value="${isPopup ? '1' : '0'}" />
      <input type="email" name="mock_email" placeholder="name@yourcompany.com" required />
      <input type="text" name="mock_name" placeholder="Contact Name (Optional)" />
      <button type="submit" class="btn btn-secondary" style="margin-bottom:0;">Continue with Work Email</button>
    </form>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};
