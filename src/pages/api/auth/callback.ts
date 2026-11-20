// src/pages/api/auth/callback.ts
import type { APIRoute } from 'astro';
import {
  getRuntimeEnv,
  checkIsAdmin,
  createSessionToken,
  formatSessionCookie,
  getCookieValue,
  verifyOAuthStateToken,
  base64UrlDecode,
  SESSION_COOKIE_NAME,
  type AuthUser,
} from '@utils/auth';
import {
  claimOrdersByEmail,
  upsertUserOnLogin,
  getUserByIdOrEmail,
  seedUserStatusCache,
  recordUserLogin,
  getSystemSettings,
  type UserRecord,
} from '@db';
import { SecurityService } from '@utils/security';
import { logger } from '@utils/logger';
import { getActiveProfiler } from '@utils/profiler';
// @ts-ignore
import { env as cfEnv, waitUntil as cfWaitUntil } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request, url, cookies, locals }) => {
  const profiler = getActiveProfiler();
  const reqUrl = new URL(request.url);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');

  const rawParamReturnUrl = url.searchParams.get('returnUrl');
  let returnUrl = rawParamReturnUrl || '/orders';
  let isPopup = url.searchParams.get('popup') === '1';
  let parsedState: { state?: string; returnUrl?: string; isPopup?: boolean } | null = null;

  // Verify stateless HMAC-signed state token first, with Cookie fallback
  const signedState = returnedState ? await verifyOAuthStateToken(returnedState, cfEnv).catch(() => null) : null;
  if (signedState?.returnUrl) returnUrl = signedState.returnUrl;
  if (typeof signedState?.isPopup === 'boolean') isPopup = signedState.isPopup;

  // Read stored state cookie (takes precedence for exact same-tab match)
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

  // CSRF validation: passes if stateless HMAC signature is valid OR state cookie matches
  const cookieMatched = Boolean(returnedState && parsedState?.state && returnedState === parsedState.state);
  const hmacMatched = Boolean(signedState);
  if (!code || (!cookieMatched && !hmacMatched)) {
    console.warn('[Auth Callback] OAuth state expired/missing or missing code; self-healing redirect to /api/auth/login');
    const reloginUrl = new URL('/api/auth/login', reqUrl.origin);
    reloginUrl.searchParams.set('returnUrl', returnUrl);
    if (isPopup) reloginUrl.searchParams.set('popup', '1');
    return new Response(null, {
      status: 302,
      headers: {
        Location: reloginUrl.toString(),
        'Set-Cookie': 'logto_oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
      },
    });
  }

  let authUser: AuthUser | null = null;
  let existingUser: UserRecord | null = null;
  let checkedExistingInDb = false;

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

    const tokenFetch = () =>
      fetch(`${endpoint}/oidc/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString(),
        signal: AbortSignal.timeout(6000),
      });
    const tokenRes = await (profiler ? profiler.time('auth.logto_exchange', tokenFetch) : tokenFetch());

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Token exchange failed: ${tokenRes.status} ${errText}`);
    }

    const tokenData = (await tokenRes.json()) as any;
    const accessToken = tokenData.access_token;

    // Fast Path: UTF-8 decode id_token.sub first, then check D1 user cache/record to skip /oidc/me for returning users
    let userInfo: any = null;
    let decodedIdToken: any = null;
    if (tokenData.id_token && typeof tokenData.id_token === 'string') {
      try {
        const parts = tokenData.id_token.split('.');
        if (parts.length >= 2) {
          decodedIdToken = JSON.parse(base64UrlDecode(parts[1]));
        }
      } catch {
        // Fallback to /oidc/me network call below
      }
    }

    if (decodedIdToken?.sub) {
      try {
        existingUser = await getUserByIdOrEmail(decodedIdToken.sub, decodedIdToken.email);
        checkedExistingInDb = true;
      } catch (checkErr) {
        console.warn('[Auth Callback] Early user status check warning:', checkErr);
      }

      if (existingUser && existingUser.status === 'BLOCKED') {
        return new Response(
          'Your account has been suspended by administration. If you believe this is an error, please contact our B2B support team.',
          { status: 403 }
        );
      }

      if (decodedIdToken.email || decodedIdToken.username || existingUser?.email) {
        let existingRoles: string[] = [];
        if (existingUser?.logto_roles) {
          try {
            const parsed = JSON.parse(existingUser.logto_roles);
            if (Array.isArray(parsed)) existingRoles = parsed;
          } catch {}
        }
        userInfo = {
          sub: decodedIdToken.sub,
          email: decodedIdToken.email || existingUser?.email,
          username: decodedIdToken.username,
          name: decodedIdToken.name || decodedIdToken.username || existingUser?.name,
          roles: Array.isArray(decodedIdToken.roles) ? decodedIdToken.roles : existingRoles,
        };
      }
    }

    // Fallback: Fetch User Info from /oidc/me only for brand-new users (not yet in D1 & id_token lacks email)
    if (!userInfo) {
      const meFetch = () =>
        fetch(`${endpoint}/oidc/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(6000),
        });
      const meRes = await (profiler ? profiler.time('auth.logto_userinfo', meFetch) : meFetch());

      if (!meRes.ok) {
        const meErr = await meRes.text();
        throw new Error(`UserInfo retrieval failed: ${meRes.status} ${meErr}`);
      }
      userInfo = (await meRes.json()) as any;
    }

    const email = userInfo.email || `${userInfo.sub}@logto.user`;
    const roles: string[] = Array.isArray(userInfo.roles) ? userInfo.roles : [];
    const settings = (locals as any)?.systemSettings || await getSystemSettings(cfEnv).catch(() => null);
    const isAdmin = checkIsAdmin(email, roles, cfEnv, settings?.co_admin_emails);

    authUser = {
      id: userInfo.sub,
      email,
      name: userInfo.name || userInfo.username || email.split('@')[0],
      isAdmin,
      roles,
    };
  } catch (err: any) {
    logger.error({
      module: 'auth/callback',
      event: 'LOGTO_EXCHANGE_ERROR',
      message: err?.message || 'Logto exchange error',
      path: reqUrl.pathname,
      rayId: request.headers.get('cf-ray') || undefined,
      error: err,
      context: { spans: profiler?.getSpans() },
    }, { cfEnv });
    return new Response(`Authentication Error: ${err.message}`, { status: 500 });
  }

  if (!authUser) {
    return new Response('Invalid authentication request.', { status: 400 });
  }

  // Populate locals so middleware logs real user instead of 'Anonymous'
  (locals as any).sessionUser = authUser;

  // 3. Security Risk Guard: Check if account is BLOCKED in D1 (skip if already checked above)
  if (!checkedExistingInDb || (existingUser === null && authUser.email)) {
    try {
      existingUser = await getUserByIdOrEmail(authUser.id, authUser.email);
      if (existingUser && existingUser.status === 'BLOCKED') {
        return new Response(
          'Your account has been suspended by administration. If you believe this is an error, please contact our B2B support team.',
          { status: 403 }
        );
      }
    } catch (checkErr) {
      console.warn('[Auth Callback] User status check warning:', checkErr);
    }
  }

  // Pre-warm L1 userStatusCache immediately so the post-redirect /orders or /api/auth/me request hits L1 in 0ms
  seedUserStatusCache({
    id: authUser.id,
    email: authUser.email.toLowerCase(),
    name: authUser.name || existingUser?.name || '',
    company: existingUser?.company || '',
    country: existingUser?.country || '',
    phone: existingUser?.phone || '',
    tier: existingUser?.tier || 'STANDARD',
    status: existingUser?.status || 'ACTIVE',
    admin_notes: existingUser?.admin_notes || '',
    logto_roles: JSON.stringify(authUser.roles || []),
    assigned_to: existingUser?.assigned_to ?? null,
    last_login_at: new Date().toISOString(),
    created_at: existingUser?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // 4. Upsert User in D1 (dispatched in background via waitUntil so 302 redirect is never blocked)
  const upsertPromise = upsertUserOnLogin(
    {
      id: authUser.id,
      email: authUser.email,
      name: authUser.name,
      roles: authUser.roles,
    },
    { existingUser, skipReturnRead: true }
  ).catch((syncErr) => {
    logger.warn({
      module: 'auth/callback',
      event: 'USER_SYNC_FAILED',
      message: 'User D1 sync failed',
      userId: authUser?.id,
      userEmail: authUser?.email,
      path: reqUrl.pathname,
      error: syncErr,
    }, { cfEnv });
  });

  if (typeof cfWaitUntil === 'function') {
    try {
      cfWaitUntil(upsertPromise);
    } catch {
      await upsertPromise;
    }
  } else {
    await upsertPromise;
  }

  // 4.5. Record Login History (IP, Geo, Device) with 90-day retention
  // Dispatched asynchronously via Cloudflare Workers waitUntil to avoid blocking user 302 redirect
  const clientMeta = SecurityService.resolveClientMeta(request);
  const deviceTag = clientMeta.platform ? ` [${clientMeta.platform}${clientMeta.deviceType ? ` / ${clientMeta.deviceType}` : ''}]` : '';
  const loginAuditPromise = recordUserLogin({
    userId: authUser.id,
    email: authUser.email,
    ip: clientMeta.ip,
    country: clientMeta.country,
    city: clientMeta.city,
    userAgent: (clientMeta.userAgent ? clientMeta.userAgent + deviceTag : deviceTag).slice(0, 500),
  }, cfEnv).catch((logErr) => {
    logger.warn({
      module: 'auth/callback',
      event: 'LOGIN_AUDIT_LOG_FAILED',
      message: 'Failed to record login audit log',
      userId: authUser?.id,
      userEmail: authUser?.email,
      path: reqUrl.pathname,
      error: logErr,
    }, { cfEnv });
  });

  if (typeof cfWaitUntil === 'function') {
    try {
      cfWaitUntil(loginAuditPromise);
    } catch {
      await loginAuditPromise;
    }
  } else {
    await loginAuditPromise;
  }

  // 5. Auto-Claim Historical Unclaimed Orders matching buyer_email
  let claimedCount = 0;
  if (!isPopup && typeof cfWaitUntil === 'function') {
    const claimPromise = claimOrdersByEmail(authUser.email, authUser.id).catch((claimErr) => {
      logger.warn({
        module: 'auth/callback',
        event: 'AUTOCLAIM_FAILED',
        message: 'Auto-claim orders failed in background',
        userId: authUser?.id,
        userEmail: authUser?.email,
        path: reqUrl.pathname,
        error: claimErr,
      }, { cfEnv });
    });
    try {
      cfWaitUntil(claimPromise);
    } catch {
      await claimPromise;
    }
  } else {
    try {
      profiler?.startSpan('d1.auto_claim');
      claimedCount = await claimOrdersByEmail(authUser.email, authUser.id);
      profiler?.endSpan('d1.auto_claim');
    } catch (claimErr) {
      profiler?.endSpan('d1.auto_claim');
      logger.warn({
        module: 'auth/callback',
        event: 'AUTOCLAIM_FAILED',
        message: 'Auto-claim orders failed',
        userId: authUser.id,
        userEmail: authUser.email,
        path: reqUrl.pathname,
        error: claimErr,
      }, { cfEnv });
    }
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
  headers.append('Set-Cookie', `auth_hint=1; Path=/; Max-Age=604800; SameSite=Lax${isHttps ? '; Secure' : ''}`);

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
