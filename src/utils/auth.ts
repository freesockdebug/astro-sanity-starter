// src/utils/auth.ts
// Logto OIDC session management & role verification via Web Crypto HMAC-SHA256

import { kvGet, kvPut, kvDelete } from './kv';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  roles?: string[];
}

export interface SessionData {
  user: AuthUser;
  exp: number;
}

export const SESSION_COOKIE_NAME = 'b2b_session';
const DEFAULT_TTL_SECONDS = 7 * 24 * 3600; // 7 days

/**
 * Resolves runtime environment variable across Cloudflare Workers & Node.js
 */
export function getRuntimeEnv(key: string, customEnv?: any): string | undefined {
  return (
    customEnv?.[key] ||
    (globalThis as any)?.__CF_ENV__?.[key] ||
    (typeof process !== 'undefined' && process.env && (process.env as any)[key]) ||
    (import.meta.env && (import.meta.env as any)[key]) ||
    (globalThis as any)?.[key]
  );
}

/**
 * Single source of truth helper to get the merged list of Root Env Admins + Co-Admins
 */
export function getMergedAdminEmails(
  coAdminEmailsOrSettings?: string | { co_admin_emails?: string },
  customEnv?: any
): string[] {
  const rootRaw = getRuntimeEnv('ADMIN_EMAILS', customEnv) || '';
  const rootAdmins = rootRaw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const coAdminRaw = typeof coAdminEmailsOrSettings === 'string'
    ? coAdminEmailsOrSettings
    : (coAdminEmailsOrSettings?.co_admin_emails || '');

  const coAdmins = coAdminRaw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return Array.from(new Set([...rootAdmins, ...coAdmins]));
}

/**
 * Checks if a user is an administrator based on email whitelist or Logto roles
 */
export function checkIsAdmin(
  email: string,
  roles: string[] = [],
  customEnv?: any,
  coAdminEmails?: string
): boolean {
  if (roles.map((r) => r.toLowerCase()).includes('admin')) {
    return true;
  }
  const whitelist = getMergedAdminEmails(coAdminEmails, customEnv);
  return whitelist.includes(email.trim().toLowerCase());
}

/**
 * Base64URL encode/decode helpers using standard Web API
 */
function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

const hmacKeyCache = new Map<string, CryptoKey>();

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const cached = hmacKeyCache.get(secret);
  if (cached) return cached;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  hmacKeyCache.set(secret, key);
  return key;
}

/**
 * Resolves candidate secrets for signing / verification.
 * In production when secrets are configured, fallback default keys are strictly excluded.
 */
function getCandidateSecrets(customEnv?: any): string[] {
  const configured = [
    getRuntimeEnv('SESSION_SECRET', customEnv),
    getRuntimeEnv('LOGTO_APP_SECRET', customEnv),
  ].filter((s): s is string => typeof s === 'string' && s.trim().length > 0);

  if (configured.length > 0) {
    return Array.from(new Set(configured));
  }

  throw new Error('Missing required environment variable: SESSION_SECRET or LOGTO_APP_SECRET');
}

/**
 * Signs a session payload into a tamper-proof session token
 */
export async function createSessionToken(
  user: AuthUser,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  customEnv?: any
): Promise<string> {
  const secret = getCandidateSecrets(customEnv)[0];

  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sessionData: SessionData = { user, exp };
  const payloadStr = JSON.stringify(sessionData);
  const encodedPayload = base64UrlEncode(payloadStr);

  const key = await getHmacKey(secret);
  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(encodedPayload)
  );

  let binarySig = '';
  const sigView = new Uint8Array(signatureBytes);
  for (let i = 0; i < sigView.byteLength; i++) {
    binarySig += String.fromCharCode(sigView[i]);
  }
  const encodedSig = btoa(binarySig).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${encodedPayload}.${encodedSig}`;
}

/**
 * Verifies and decodes a session token against all candidate secrets
 */
export async function verifySessionToken(token: string, customEnv?: any): Promise<AuthUser | null> {
  if (!token || !token.includes('.')) return null;
  const [encodedPayload, encodedSig] = token.split('.');
  if (!encodedPayload || !encodedSig) return null;

  try {
    const secrets = getCandidateSecrets(customEnv);

    // Decode provided signature
    let base64Sig = encodedSig.replace(/-/g, '+').replace(/_/g, '/');
    while (base64Sig.length % 4) base64Sig += '=';
    const binarySig = atob(base64Sig);
    const sigBytes = new Uint8Array(binarySig.length);
    for (let i = 0; i < binarySig.length; i++) {
      sigBytes[i] = binarySig.charCodeAt(i);
    }

    let isValid = false;
    for (const sec of secrets) {
      try {
        const key = await getHmacKey(sec);
        const valid = await crypto.subtle.verify(
          'HMAC',
          key,
          sigBytes,
          new TextEncoder().encode(encodedPayload)
        );
        if (valid) {
          isValid = true;
          break;
        }
      } catch {
        // try next candidate
      }
    }

    if (!isValid) return null;

    const payloadJson = base64UrlDecode(encodedPayload);
    const sessionData: SessionData = JSON.parse(payloadJson);

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (sessionData.exp && sessionData.exp < now) {
      return null;
    }

    return sessionData.user;
  } catch (err) {
    return null;
  }
}

/**
 * Extracts a named cookie from standard Cookie header
 */
export function getCookieValue(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const matches = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return matches ? decodeURIComponent(matches[1]) : null;
}

/**
 * Extracts authenticated user from request, Astro context, or Cookie header
 */
export async function getSessionFromRequest(requestOrContext: any, customEnv?: any): Promise<AuthUser | null> {
  if (!requestOrContext) return null;

  let token: string | null = null;

  // 1. Astro / AstroCookies context
  if (requestOrContext.cookies?.get) {
    token = requestOrContext.cookies.get(SESSION_COOKIE_NAME)?.value || null;
  } else if (typeof requestOrContext.get === 'function' && !requestOrContext.headers) {
    const c = requestOrContext.get(SESSION_COOKIE_NAME);
    token = c?.value || (typeof c === 'string' ? c : null);
  }

  // 2. Standard Request object
  if (!token && requestOrContext.headers?.get) {
    const cookieHeader = requestOrContext.headers.get('cookie');
    token = getCookieValue(cookieHeader, SESSION_COOKIE_NAME);
  }

  // 3. Direct string cookie header or raw token
  if (!token && typeof requestOrContext === 'string') {
    token = getCookieValue(requestOrContext, SESSION_COOKIE_NAME) || (requestOrContext.includes('.') ? requestOrContext : null);
  }

  if (!token) return null;
  return verifySessionToken(token, customEnv);
}

/**
 * Formats Set-Cookie header for session token
 */
export function formatSessionCookie(token: string, maxAge = DEFAULT_TTL_SECONDS, isSecure?: boolean): string {
  const secureFlag = typeof isSecure === 'boolean'
    ? isSecure
    : (typeof location !== 'undefined' ? location.protocol === 'https:' : true);
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(
    token
  )}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secureFlag ? '; Secure' : ''}`;
}

/**
 * Formats Set-Cookie header for clearing session token
 */
export function formatClearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

/**
 * Updates a user's password directly in Logto via Management API
 */
export async function updateLogtoUserPassword(
  userId: string,
  email: string,
  newPassword: string,
  customEnv?: any
): Promise<{ success: boolean; error?: string }> {
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters long.' };
  }

  const endpoint = getRuntimeEnv('LOGTO_ENDPOINT', customEnv)?.replace(/\/+$/, '');
  const m2mAppId = getRuntimeEnv('LOGTO_M2M_APP_ID', customEnv);
  const m2mAppSecret = getRuntimeEnv('LOGTO_M2M_APP_SECRET', customEnv);
  const resource = getRuntimeEnv('LOGTO_MANAGEMENT_RESOURCE', customEnv);

  if (!endpoint || !m2mAppId || !m2mAppSecret || !resource) {
    return {
      success: false,
      error: 'Missing Logto M2M configuration (LOGTO_ENDPOINT, LOGTO_M2M_APP_ID, LOGTO_M2M_APP_SECRET, LOGTO_MANAGEMENT_RESOURCE).'
    };
  }

  try {
    const basicAuth = typeof btoa !== 'undefined'
      ? btoa(`${m2mAppId}:${m2mAppSecret}`)
      : Buffer.from(`${m2mAppId}:${m2mAppSecret}`).toString('base64');

    // 1. Helper to fetch fresh or cached M2M Access Token from Cloudflare KV
    const kvTokenKey = 'auth:logto_m2m_token';
    const getM2MToken = async (forceRefresh = false): Promise<string> => {
      if (!forceRefresh) {
        const cached = await kvGet<string>(kvTokenKey, customEnv);
        if (cached) return cached;
      } else {
        await kvDelete(kvTokenKey, customEnv).catch(() => {});
      }

      const tokenRes = await fetch(`${endpoint}/oidc/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth}`,
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          resource,
          scope: 'all',
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error('[Logto M2M] Failed to obtain token:', tokenRes.status, errText);
        return '';
      }

      const tokenData = (await tokenRes.json()) as { access_token?: string; expires_in?: number };
      const token = tokenData.access_token || '';
      const expiresIn = tokenData.expires_in || 3600;
      if (token) {
        const ttl = Math.max(60, expiresIn - 120);
        await kvPut(kvTokenKey, token, { expirationTtl: ttl }, customEnv).catch(() => {});
      }
      return token;
    };

    let accessToken = await getM2MToken();
    if (!accessToken) {
      return { success: false, error: 'Authentication service temporarily unavailable.' };
    }

    // Wrapped fetch that automatically handles token expiration / 401 with one-shot refresh
    const m2mFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
      const exec = (token: string) =>
        fetch(url, {
          signal: options.signal || AbortSignal.timeout(6000),
          ...options,
          headers: {
            ...(options.headers || {}),
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

      let res = await exec(accessToken);
      if (res.status === 401) {
        accessToken = await getM2MToken(true);
        if (accessToken) {
          res = await exec(accessToken);
        }
      }
      return res;
    };

    // 2. Resolve target Logto User ID (verify user exists or resolve by email)
    let targetUserId = userId;
    let userExists = false;

    if (targetUserId && !targetUserId.startsWith('usr_mock')) {
      const checkRes = await m2mFetch(`${endpoint}/api/users/${targetUserId}`, {
        signal: AbortSignal.timeout(6000),
      });
      if (checkRes.ok) userExists = true;
    }

    if (!userExists && email) {
      const searchRes = await m2mFetch(`${endpoint}/api/users?search.primaryEmail=${encodeURIComponent(email)}`, {
        signal: AbortSignal.timeout(6000),
      });
      if (searchRes.ok) {
        const list = await searchRes.json();
        if (Array.isArray(list) && list.length > 0) {
          targetUserId = list[0].id;
          userExists = true;
        }
      }
    }

    if (!userExists) {
      return { success: false, error: 'User account not found in Logto authentication service.' };
    }

    // 3. Update password in Logto
    const patchRes = await m2mFetch(`${endpoint}/api/users/${targetUserId}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ password: newPassword }),
      signal: AbortSignal.timeout(8000),
    });

    if (!patchRes.ok) {
      const errJson = (await patchRes.json().catch(() => null)) as Record<string, any> | null;
      console.error('[Logto M2M] Password update error:', patchRes.status, errJson);
      return { success: false, error: errJson?.message || 'Failed to update password in authentication provider.' };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[Logto M2M] Exception during password update:', err);
    return { success: false, error: err.message || 'Network error updating password.' };
  }
}

// Re-export contextual guards
export * from './authGuards';

