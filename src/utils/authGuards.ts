// src/utils/authGuards.ts
// Contextual authentication guards for Buyer Workspace and Admin Portal
import { getSessionFromRequest, checkIsAdmin, SESSION_COOKIE_NAME, type AuthUser } from './auth';
import { getUserByIdOrEmail, listAdminOrders, getSystemSettings, type UserRecord } from './db';

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

  let dbUser: UserRecord | null = null;
  try {
    dbUser = await getUserByIdOrEmail(sessionUser.id, sessionUser.email);
    if (dbUser && dbUser.status === 'BLOCKED') {
      astro.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
      return {
        sessionUser,
        dbUser,
        redirectResponse: astro.redirect('/api/auth/login?error=account_suspended'),
      };
    }
  } catch (e) {
    // Non-blocking fail-safe
  }

  // Dynamically resolve admin status against runtime ADMIN_EMAILS & D1 co-admins
  if (sessionUser && !sessionUser.isAdmin) {
    try {
      const settings = await getSystemSettings(cfEnv);
      if (checkIsAdmin(sessionUser.email, sessionUser.roles, cfEnv, settings.co_admin_emails)) {
        sessionUser.isAdmin = true;
      }
    } catch {
      // Non-blocking fail-safe
    }
  }

  return { sessionUser, dbUser };
}

export interface AdminContextResult {
  sessionUser: AuthUser;
  pendingOrdersCount: number;
  redirectResponse?: Response;
}

/**
 * Enforces admin authorization and provides pending orders count for navigation badges.
 * If unauthenticated or not an admin, returns redirectResponse to login.
 */
export async function requireAdminContext(
  astro: any,
  cfEnv?: any,
  returnPath: string = '/admin/orders',
  options: { skipPendingCount?: boolean } = {}
): Promise<AdminContextResult> {
  const sessionUser = await getSessionFromRequest(astro, cfEnv);

  let isAdmin = sessionUser?.isAdmin || false;
  if (sessionUser && !isAdmin) {
    try {
      const settings = await getSystemSettings(cfEnv);
      if (checkIsAdmin(sessionUser.email, sessionUser.roles, cfEnv, settings.co_admin_emails)) {
        isAdmin = true;
        sessionUser.isAdmin = true;
      }
    } catch {
      // Non-blocking
    }
  }

  if (!sessionUser || !isAdmin) {
    return {
      sessionUser: sessionUser as any,
      pendingOrdersCount: 0,
      redirectResponse: astro.redirect(`/api/auth/login?returnUrl=${encodeURIComponent(returnPath)}`),
    };
  }

  let pendingOrdersCount = 0;
  if (!options.skipPendingCount) {
    try {
      const res = await listAdminOrders({ limit: 1 });
      pendingOrdersCount = res.stats?.pending ?? 0;
    } catch {
      // Non-blocking fail-safe
    }
  }

  return { sessionUser, pendingOrdersCount };
}

/**
 * Validates request session for admin API endpoints.
 * Resolves static admin claims as well as dynamic D1 co_admin_emails.
 */
export async function verifyAdminAuth(request: Request, cfEnv?: any): Promise<AuthUser | null> {
  const sessionUser = await getSessionFromRequest(request, cfEnv);
  if (!sessionUser) return null;

  let isAdmin = sessionUser.isAdmin;
  if (!isAdmin) {
    try {
      const settings = await getSystemSettings(cfEnv);
      if (checkIsAdmin(sessionUser.email, sessionUser.roles, cfEnv, settings.co_admin_emails)) {
        isAdmin = true;
        sessionUser.isAdmin = true;
      }
    } catch {
      // Non-blocking fail-safe
    }
  }

  return isAdmin ? sessionUser : null;
}


