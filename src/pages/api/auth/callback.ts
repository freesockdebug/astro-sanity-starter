// src/pages/api/auth/callback.ts
import type { APIRoute } from 'astro';
import {
  getRuntimeEnv,
  checkIsAdmin,
  createSessionToken,
  formatSessionCookie,
  getCookieValue,
  SESSION_COOKIE_NAME,
  type AuthUser,
} from '@utils/auth';
import { claimOrdersByEmail, upsertUserOnLogin, getUserByIdOrEmail, recordUserLogin, getSystemSettings } from '@utils/db';
import { SecurityService } from '@utils/security';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request, url, cookies }) => {
  const reqUrl = new URL(request.url);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');

  const rawParamReturnUrl = url.searchParams.get('returnUrl');
  let returnUrl = rawParamReturnUrl || '/orders';
  let isPopup = url.searchParams.get('popup') === '1';
  let parsedState: { state?: string; returnUrl?: string; isPopup?: boolean } | null = null;

  // Read stored state cookie
  const cookieHeader = request.headers.get('cookie');
  const rawStateCookie = getCookieValue(cookieHeader, 'logto_oauth_state');
  if (rawStateCookie) {
    try {
      parsedState = JSON.parse(rawStateCookie);
      if (parsedState?.returnUrl) returnUrl = parsedState.returnUrl;
      if (typeof parsedState?.isPopup === 'boolean') isPopup = parsedState.isPopup;
    } catch {
      // ignore
    }
  }

  // Prevent Open Redirect: must strictly be an internal path
  if (!returnUrl.startsWith('/') || returnUrl.startsWith('//')) {
    returnUrl = '/orders';
  }

  // CSRF validation: when returning with an authorization code, state must match
  if (!code) {
    return new Response('Missing authorization code in OAuth callback.', { status: 400 });
  }
  if (!returnedState || !parsedState?.state || returnedState !== parsedState.state) {
    console.warn('[Auth Callback] State mismatch or missing CSRF token');
    return new Response('Invalid OAuth state parameter. Potential CSRF or expired session.', { status: 403 });
  }

  let authUser: AuthUser | null = null;

  // 1. Live Logto OIDC Authorization Code Exchange
  const endpoint = getRuntimeEnv('LOGTO_ENDPOINT', cfEnv)?.replace(/\/+$/, '');
  const appId = getRuntimeEnv('LOGTO_APP_ID', cfEnv);
  const appSecret = getRuntimeEnv('LOGTO_APP_SECRET', cfEnv);

  if (!endpoint || !appId || !appSecret) {
    return new Response(
      'Missing required environment variables: LOGTO_ENDPOINT, LOGTO_APP_ID, and LOGTO_APP_SECRET',
      { status: 500 }
    );
  }

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
        const errText = await tokenRes.text();
        throw new Error(`Token exchange failed: ${tokenRes.status} ${errText}`);
      }

      const tokenData = (await tokenRes.json()) as any;
      const accessToken = tokenData.access_token;

      // Fetch User Info
      const meRes = await fetch(`${endpoint}/oidc/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(6000),
      });

      if (!meRes.ok) {
        const meErr = await meRes.text();
        throw new Error(`UserInfo retrieval failed: ${meRes.status} ${meErr}`);
      }

      const userInfo = (await meRes.json()) as any;
      const email = userInfo.email || `${userInfo.sub}@logto.user`;
      const roles: string[] = Array.isArray(userInfo.roles) ? userInfo.roles : [];
      const settings = await getSystemSettings(cfEnv).catch(() => null);
      const isAdmin = checkIsAdmin(email, roles, cfEnv, settings?.co_admin_emails);

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

  if (!authUser) {
    return new Response('Invalid authentication request.', { status: 400 });
  }

  // 3. Security Risk Guard: Check if account is BLOCKED in D1
  try {
    const existing = await getUserByIdOrEmail(authUser.id, authUser.email);
    if (existing && existing.status === 'BLOCKED') {
      return new Response(
        'Your account has been suspended by administration. If you believe this is an error, please contact our B2B support team.',
        { status: 403 }
      );
    }
  } catch (checkErr) {
    console.warn('[Auth Callback] User status check warning:', checkErr);
  }

  // 4. Upsert User in D1 (Logto sub, email, name, roles sync + backfill company info)
  try {
    await upsertUserOnLogin({
      id: authUser.id,
      email: authUser.email,
      name: authUser.name,
      roles: authUser.roles,
    });
  } catch (syncErr) {
    console.error('[Auth Callback] User D1 sync failed:', syncErr);
  }

  // 4.5. Record Login History (IP, Geo, Device) with 90-day retention
  try {
    const { ip: clientIp, country, city, userAgent } = SecurityService.resolveClientMeta(request);
    await recordUserLogin({
      userId: authUser.id,
      email: authUser.email,
      ip: clientIp,
      country,
      city,
      userAgent,
    });
  } catch (logErr) {
    console.warn('[Auth Callback] Failed to record login audit log:', logErr);
  }

  // 5. Auto-Claim Historical Unclaimed Orders matching buyer_email
  let claimedCount = 0;
  try {
    claimedCount = await claimOrdersByEmail(authUser.email, authUser.id);
  } catch (claimErr) {
    console.error('[Auth Callback] Auto-claim orders failed:', claimErr);
  }

  // 6. Generate Tamper-Proof Session Cookie
  const isHttps = reqUrl.protocol === 'https:';
  const sessionToken = await createSessionToken(authUser, undefined, cfEnv);
  const sessionCookie = formatSessionCookie(sessionToken, undefined, isHttps);
  const clearStateCookie = `logto_oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isHttps ? '; Secure' : ''}`;

  // Set natively through Astro Cookies API
  try {
    cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      path: '/',
      maxAge: 7 * 24 * 3600,
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
    });
    cookies.delete('logto_oauth_state', { path: '/' });
  } catch (cookieErr) {
    console.warn('[Auth Callback] Astro cookies.set fallback:', cookieErr);
  }

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
        }, ${JSON.stringify(reqUrl.origin)});
      }
    } catch (e) {
      // ignore
    }
    setTimeout(function() {
      if (window.opener && !window.opener.closed) {
        window.close();
      } else {
        window.location.replace(${JSON.stringify(returnUrl)});
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
