// src/pages/api/auth/callback.ts
import type { APIRoute } from 'astro';
import {
  getRuntimeEnv,
  checkIsAdmin,
  createSessionToken,
  formatSessionCookie,
  getCookieValue,
  type AuthUser,
} from '@utils/auth';
import { claimOrdersByEmail } from '@utils/db';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const reqUrl = new URL(request.url);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');

  // Simulated login parameters for local development fallback
  const mockEmail = url.searchParams.get('mock_email');
  const mockName = url.searchParams.get('mock_name');
  const mockAdmin = url.searchParams.get('mock_admin');

  let returnUrl = '/orders';
  let isPopup = url.searchParams.get('popup') === '1';

  // Read stored state cookie
  const cookieHeader = request.headers.get('cookie');
  const rawStateCookie = getCookieValue(cookieHeader, 'logto_oauth_state');
  if (rawStateCookie) {
    try {
      const parsed = JSON.parse(rawStateCookie);
      if (parsed.returnUrl) returnUrl = parsed.returnUrl;
      if (typeof parsed.isPopup === 'boolean') isPopup = parsed.isPopup;
    } catch {
      // ignore
    }
  }

  let authUser: AuthUser | null = null;

  // 1. Live Logto OIDC Authorization Code Exchange
  const endpoint = getRuntimeEnv('LOGTO_ENDPOINT')?.replace(/\/+$/, '');
  const appId = getRuntimeEnv('LOGTO_APP_ID');
  const appSecret = getRuntimeEnv('LOGTO_APP_SECRET');

  if (code && endpoint && appId && appSecret) {
    try {
      const callbackUrl = `${reqUrl.protocol}//${reqUrl.host}/api/auth/callback`;
      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: appId,
        client_secret: appSecret,
        code,
        redirect_uri: callbackUrl,
      });

      const tokenRes = await fetch(`${endpoint}/oidc/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString(),
        signal: AbortSignal.timeout(6000),
      });

      if (!tokenRes.ok) {
        throw new Error(`Token exchange failed: ${tokenRes.status}`);
      }

      const tokenData = (await tokenRes.json()) as any;
      const accessToken = tokenData.access_token;

      // Fetch User Info
      const meRes = await fetch(`${endpoint}/oidc/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(6000),
      });

      if (!meRes.ok) {
        throw new Error(`UserInfo retrieval failed: ${meRes.status}`);
      }

      const userInfo = (await meRes.json()) as any;
      const email = userInfo.email || `${userInfo.sub}@logto.user`;
      const roles: string[] = Array.isArray(userInfo.roles) ? userInfo.roles : [];
      const isAdmin = checkIsAdmin(email, roles);

      authUser = {
        id: userInfo.sub,
        email,
        name: userInfo.name || userInfo.username || email.split('@')[0],
        isAdmin,
        roles,
      };
    } catch (err: any) {
      console.error('[Auth Callback] Logto exchange error:', err);
      return new Response(`Authentication Error: ${err.message}`, { status: 500 });
    }
  } else if (mockEmail) {
    // 2. Simulated Local Development Login Fallback
    const email = mockEmail.trim().toLowerCase();
    const name = mockName?.trim() || email.split('@')[0];
    const roles: string[] = mockAdmin === '1' ? ['admin'] : [];
    const isAdmin = mockAdmin === '1' || checkIsAdmin(email, roles);
    const userId = `usr_${Math.abs(
      email.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
    ).toString(16)}`;

    authUser = {
      id: userId,
      email,
      name,
      isAdmin,
      roles,
    };
  }

  if (!authUser) {
    return new Response('Invalid authentication request.', { status: 400 });
  }

  // 3. Auto-Claim Historical Unclaimed Orders matching buyer_email
  let claimedCount = 0;
  try {
    claimedCount = await claimOrdersByEmail(authUser.email, authUser.id);
  } catch (claimErr) {
    console.error('[Auth Callback] Auto-claim orders failed:', claimErr);
  }

  // 4. Generate Tamper-Proof Session Cookie
  const sessionToken = await createSessionToken(authUser);
  const sessionCookie = formatSessionCookie(sessionToken);
  const clearStateCookie = 'logto_oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax';

  const headers = new Headers();
  headers.append('Set-Cookie', sessionCookie);
  headers.append('Set-Cookie', clearStateCookie);

  // 5. Popup postMessage response or standard 302 Redirect
  if (isPopup) {
    headers.set('Content-Type', 'text/html; charset=utf-8');
    const popupHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Authentication Complete</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f7; color: #1d1d1f; }
    .box { text-align: center; }
  </style>
</head>
<body>
  <div class="box">
    <h3>✓ Authenticated Successfully</h3>
    <p style="font-size: 13px; color: #86868b;">Closing window and refreshing session...</p>
  </div>
  <script>
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({
          type: 'LOGTO_AUTH_SUCCESS',
          user: ${JSON.stringify(authUser)},
          claimedCount: ${claimedCount}
        }, '*');
      }
    } catch (e) {
      // ignore
    }
    setTimeout(function() {
      if (window.opener) {
        window.close();
      } else {
        window.location.href = ${JSON.stringify(returnUrl)};
      }
    }, 300);
  </script>
</body>
</html>`;
    return new Response(popupHtml, { status: 200, headers });
  }

  headers.set('Location', returnUrl);
  return new Response(null, { status: 302, headers });
};
