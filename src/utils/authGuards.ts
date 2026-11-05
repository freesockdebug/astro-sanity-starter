// src/utils/authGuards.ts
// Contextual authentication guards for Buyer Workspace and Admin Portal
import { getSessionFromRequest, checkIsAdmin, SESSION_COOKIE_NAME, type AuthUser } from './auth';
import { getUserByIdOrEmail, getPendingOrdersCount, getSystemSettings, type UserRecord } from './db';

export const NO_CACHE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store',
  'Pragma': 'no-cache',
  'Expires': '0',
};

export function jsonNoCache(data: any, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...NO_CACHE_HEADERS,
      ...extraHeaders,
    },
  });
}

export interface BuyerAuthResult {
  user: AuthUser | null;
  dbUser: UserRecord | null;
  errorResponse: Response | null;
}

/**
 * Validates request session for buyer API endpoints.
 * Returns errorResponse directly if unauthorized or blocked, saving duplicated checks.
 */
export async function verifyBuyerAuth(requestOrContext: any, cfEnv?: any): Promise<BuyerAuthResult> {
  const sessionUser = await getSessionFromRequest(requestOrContext, cfEnv);
  if (!sessionUser) {
    return {
      user: null,
      dbUser: null,
      errorResponse: jsonNoCache({ error: 'Unauthorized: Session missing or expired' }, 401),
    };
  }

  let dbUser: UserRecord | null = null;
  try {
    dbUser = await getUserByIdOrEmail(sessionUser.id, sessionUser.email);
    if (dbUser && dbUser.status === 'BLOCKED') {
      return {
        user: sessionUser,
        dbUser,
        errorResponse: jsonNoCache({ error: 'Account suspended: Please contact concierge support.' }, 403),
      };
    }
  } catch (err) {
    // Non-blocking fail-safe
  }

  return {
    user: sessionUser,
    dbUser,
    errorResponse: null,
  };
}

export interface BuyerContextResult {
  sessionUser: AuthUser | null;
  dbUser: UserRecord | null;
  redirectResponse?: Response;
}

/**
 * Validates buyer session and protects against suspended accounts.
 * If requireLogin=true and unauthenticated, returns redirectResponse to login.
 * If blocked, deletes session cookie and returns redirectResponse to account_suspended.
 */
export async function getBuyerContext(
  astro: any,
  cfEnv?: any,
  options: { requireLogin?: boolean } = {}
): Promise<BuyerContextResult> {
  const sessionUser = await getSessionFromRequest(astro, cfEnv);

  if (!sessionUser) {
    if (options.requireLogin) {
      const returnUrl = encodeURIComponent(astro.url.pathname + astro.url.search);
      return {
        sessionUser: null,
        dbUser: null,
        redirectResponse: astro.redirect(`/api/auth/login?returnUrl=${returnUrl}`),
      };
    }
    return { sessionUser: null, dbUser: null };
  }

  const [dbUser, settings] = await Promise.all([
    getUserByIdOrEmail(sessionUser.id, sessionUser.email).catch(() => null),
    getSystemSettings(cfEnv).catch(() => null),
  ]);

  if (dbUser && dbUser.status === 'BLOCKED') {
    astro.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
    return {
      sessionUser,
      dbUser,
      redirectResponse: astro.redirect('/api/auth/login?error=account_suspended'),
    };
  }

  // Dynamically recompute admin status against runtime ADMIN_EMAILS & D1 co-admins
  sessionUser.isAdmin = checkIsAdmin(sessionUser.email, sessionUser.roles || [], cfEnv, settings?.co_admin_emails);

  return { sessionUser, dbUser };
}

export interface AdminContextResult {
  sessionUser: AuthUser;
  pendingOrdersCount: number;
  redirectResponse?: Response;
}

/**
 * Enforces admin authorization and provides pending orders count for navigation badges.
 * If unauthenticated, not an admin, or blocked, redirects safely.
 */
export async function requireAdminContext(
  astro: any,
  cfEnv?: any,
  returnPath: string = '/admin/orders',
  options: { skipPendingCount?: boolean } = {}
): Promise<AdminContextResult> {
  const sessionUser = await getSessionFromRequest(astro, cfEnv);

  if (!sessionUser) {
    return {
      sessionUser: sessionUser as any,
      pendingOrdersCount: 0,
      redirectResponse: astro.redirect(`/api/auth/login?returnUrl=${encodeURIComponent(returnPath)}`),
    };
  }

  // 1 & 2. Concurrently check user status in D1 and recompute admin status
  const [dbUser, settings] = await Promise.all([
    getUserByIdOrEmail(sessionUser.id, sessionUser.email).catch(() => null),
    getSystemSettings(cfEnv).catch(() => null),
  ]);

  if (dbUser && dbUser.status === 'BLOCKED') {
    astro.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
    return {
      sessionUser,
      pendingOrdersCount: 0,
      redirectResponse: astro.redirect('/api/auth/login?error=account_suspended'),
    };
  }

  const isAdmin = checkIsAdmin(sessionUser.email, sessionUser.roles || [], cfEnv, settings?.co_admin_emails);
  sessionUser.isAdmin = isAdmin;

  if (!isAdmin) {
    return {
      sessionUser,
      pendingOrdersCount: 0,
      redirectResponse: astro.redirect(`/api/auth/login?returnUrl=${encodeURIComponent(returnPath)}`),
    };
  }

  let pendingOrdersCount = 0;
  if (!options.skipPendingCount) {
    try {
      pendingOrdersCount = await getPendingOrdersCount(cfEnv);
    } catch {
      // Non-blocking fail-safe
    }
  }

  return { sessionUser, pendingOrdersCount };
}

/**
 * Validates request session for admin API endpoints.
 * Enforces active status (not blocked) and dynamically resolves D1 co_admin_emails in parallel.
 */
export async function verifyAdminAuth(request: Request, cfEnv?: any): Promise<AuthUser | null> {
  const sessionUser = await getSessionFromRequest(request, cfEnv);
  if (!sessionUser) return null;

  const [dbUser, settings] = await Promise.all([
    getUserByIdOrEmail(sessionUser.id, sessionUser.email).catch(() => null),
    getSystemSettings(cfEnv).catch(() => null),
  ]);

  if (dbUser && dbUser.status === 'BLOCKED') {
    return null;
  }

  sessionUser.isAdmin = checkIsAdmin(sessionUser.email, sessionUser.roles || [], cfEnv, settings?.co_admin_emails);
  return sessionUser.isAdmin ? sessionUser : null;
}


