// src/utils/authGuards.ts
// Contextual authentication guards for Buyer Workspace and Admin Portal
import { getSessionFromRequest, type AuthUser } from './auth';
import { getUserByIdOrEmail, listAdminOrders, type UserRecord } from './db';

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
      astro.cookies.delete('gwenvenni_session', { path: '/' });
      return {
        sessionUser,
        dbUser,
        redirectResponse: astro.redirect('/api/auth/login?error=account_suspended'),
      };
    }
  } catch (e) {
    // Non-blocking fail-safe
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
  returnPath: string = '/admin/orders'
): Promise<AdminContextResult> {
  const sessionUser = await getSessionFromRequest(astro, cfEnv);

  if (!sessionUser || !sessionUser.isAdmin) {
    return {
      sessionUser: sessionUser as any,
      pendingOrdersCount: 0,
      redirectResponse: astro.redirect(`/api/auth/login?returnUrl=${encodeURIComponent(returnPath)}`),
    };
  }

  let pendingOrdersCount = 0;
  try {
    const res = await listAdminOrders({ limit: 1 });
    pendingOrdersCount = res.stats?.pending ?? 0;
  } catch {
    // Non-blocking fail-safe
  }

  return { sessionUser, pendingOrdersCount };
}

