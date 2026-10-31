// src/utils/auth.ts
// Logto OIDC session management & role verification via Web Crypto HMAC-SHA256

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

const SESSION_COOKIE_NAME = 'gwenvenni_session';
const DEFAULT_TTL_SECONDS = 7 * 24 * 3600; // 7 days

/**
 * Resolves runtime environment variable across Cloudflare Workers & Node.js
 */
export function getRuntimeEnv(key: string, customEnv?: any): string | undefined {
  return (
    customEnv?.[key] ||
    (typeof process !== 'undefined' && process.env && (process.env as any)[key]) ||
    (import.meta.env && (import.meta.env as any)[key]) ||
    (globalThis as any)?.[key]
  );
}

/**
 * Checks if a user is an administrator based on email whitelist or Logto roles
 */
export function checkIsAdmin(email: string, roles: string[] = [], customEnv?: any): boolean {
  if (roles.map((r) => r.toLowerCase()).includes('admin')) {
    return true;
  }

  const rawWhitelist = getRuntimeEnv('ADMIN_EMAILS', customEnv) || 'forhaisome@gmail.com';
  const whitelist = rawWhitelist
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

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

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Signs a session payload into a tamper-proof session token
 */
export async function createSessionToken(
  user: AuthUser,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  customEnv?: any
): Promise<string> {
  const secret =
    getRuntimeEnv('SESSION_SECRET', customEnv) ||
    getRuntimeEnv('LOGTO_APP_SECRET', customEnv) ||
    'gwenvenni-b2b-secure-session-key-2026';

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
 * Verifies and decodes a session token
 */
export async function verifySessionToken(token: string, customEnv?: any): Promise<AuthUser | null> {
  if (!token || !token.includes('.')) return null;
  const [encodedPayload, encodedSig] = token.split('.');
  if (!encodedPayload || !encodedSig) return null;

  try {
    const secret =
      getRuntimeEnv('SESSION_SECRET', customEnv) ||
      getRuntimeEnv('LOGTO_APP_SECRET', customEnv) ||
      'gwenvenni-b2b-secure-session-key-2026';

    const key = await getHmacKey(secret);

    // Decode provided signature
    let base64Sig = encodedSig.replace(/-/g, '+').replace(/_/g, '/');
    while (base64Sig.length % 4) base64Sig += '=';
    const binarySig = atob(base64Sig);
    const sigBytes = new Uint8Array(binarySig.length);
    for (let i = 0; i < binarySig.length; i++) {
      sigBytes[i] = binarySig.charCodeAt(i);
    }

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      new TextEncoder().encode(encodedPayload)
    );

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
 * Extracts authenticated user from request Cookie
 */
export async function getSessionFromRequest(request: Request, customEnv?: any): Promise<AuthUser | null> {
  const cookieHeader = request.headers.get('cookie');
  const token = getCookieValue(cookieHeader, SESSION_COOKIE_NAME);
  if (!token) return null;
  return verifySessionToken(token, customEnv);
}

/**
 * Formats Set-Cookie header for session token
 */
export function formatSessionCookie(token: string, maxAge = DEFAULT_TTL_SECONDS): string {
  const isSecure = typeof location !== 'undefined' ? location.protocol === 'https:' : true;
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(
    token
  )}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${isSecure ? '; Secure' : ''}`;
}

/**
 * Formats Set-Cookie header for clearing session token
 */
export function formatClearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}
