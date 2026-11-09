// src/utils/authGuards.ts
// Contextual authentication guards for Buyer Workspace and Admin Portal
import { getSessionFromRequest, checkIsAdmin, SESSION_COOKIE_NAME, type AuthUser } from './auth';
import { getUserByIdOrEmail, getPendingOrdersCount, getSystemSettings, type UserRecord } from './db';
import { resolveAdminContext, hasPermission, hasMenu, type AdminContextInfo } from './rbac';

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

function getSettingsPromise(contextOrRequest: any, cfEnv?: any): Promise<any> {
  const locals = contextOrRequest?.locals;
  if (locals?.systemSettings) {
    return Promise.resolve(locals.systemSettings);
  }
  return getSystemSettings(cfEnv).then((s) => {
    if (locals) locals.systemSettings = s;
    return s;
  }).catch(() => null);
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

  const [dbUser, settings] = await Promise.all([
    getUserByIdOrEmail(sessionUser.id, sessionUser.email).catch(() => null),
    getSettingsPromise(requestOrContext, cfEnv),
  ]);

  if (dbUser && dbUser.status === 'BLOCKED') {
    return {
      user: sessionUser,
      dbUser,
      errorResponse: jsonNoCache({ error: 'Account suspended: Please contact concierge support.' }, 403),
    };
  }

  // Dynamically recompute admin status against runtime ADMIN_EMAILS & D1 co-admins
  sessionUser.isAdmin = checkIsAdmin(sessionUser.email, sessionUser.roles || [], cfEnv, settings?.co_admin_emails);

  return {
    user: sessionUser,
    dbUser,
    errorResponse: null,
  };
}

export interface BuyerContextResult {
  sessionUser: AuthUser | null;
  dbUser: UserRecord | null;
  systemSettings?: any;
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
    getSettingsPromise(astro, cfEnv),
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

  return { sessionUser, dbUser, systemSettings: settings };
}

export interface AdminContextResult {
  sessionUser: AuthUser;
  adminContext: AdminContextInfo;
  pendingOrdersCount: number;
  systemSettings?: any;
  redirectResponse?: Response;
}

/**
 * Enforces admin authorization and provides pending orders count for navigation badges.
 * Evaluates D1 + KV RBAC permissions, active member status, and menu access in a single parallel query.
 */
export async function requireAdminContext(
  astro: any,
  cfEnv?: any,
  returnPath: string = '/admin/orders',
  options: { skipPendingCount?: boolean; requiredMenu?: string; requiredPerm?: string } = {}
): Promise<AdminContextResult> {
  const sessionUser = await getSessionFromRequest(astro, cfEnv);

  if (!sessionUser) {
    return {
      sessionUser: sessionUser as any,
      adminContext: null as any,
      pendingOrdersCount: 0,
      redirectResponse: astro.redirect(`/api/auth/login?returnUrl=${encodeURIComponent(returnPath)}`),
    };
  }

  const isShellReq = astro.request?.headers?.get?.('x-shell-request') === '1';
  const shouldSkipPending = options.skipPendingCount || isShellReq;

  // Optimized: Single round of concurrent parallel resolution for DB user, settings, RBAC context, and count
  const [dbUser, settings, pendingOrdersCount, initialAdminCtx] = await Promise.all([
    getUserByIdOrEmail(sessionUser.id, sessionUser.email).catch(() => null),
    getSettingsPromise(astro, cfEnv),
    shouldSkipPending ? Promise.resolve(0) : getPendingOrdersCount().catch(() => 0),
    resolveAdminContext(sessionUser.email, cfEnv).catch(() => null),
  ]);

  if (dbUser && dbUser.status === 'BLOCKED') {
    astro.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
    return {
      sessionUser,
      adminContext: null as any,
      pendingOrdersCount: 0,
      redirectResponse: astro.redirect('/api/auth/login?error=account_suspended'),
    };
  }

  let adminCtx = initialAdminCtx;
  if (!adminCtx && settings?.co_admin_emails) {
    adminCtx = await resolveAdminContext(sessionUser.email, cfEnv, settings.co_admin_emails).catch(() => null);
  }

  if (!adminCtx) {
    return {
      sessionUser,
      adminContext: null as any,
      pendingOrdersCount: 0,
      redirectResponse: astro.redirect(`/api/auth/login?returnUrl=${encodeURIComponent(returnPath)}`),
    };
  }

  sessionUser.isAdmin = true;

  // Menu level access check
  if (options.requiredMenu && !hasMenu(adminCtx, options.requiredMenu)) {
    // If user lacks permission for this menu, redirect to their first allowed menu
    const firstAllowed = adminCtx.menus[0] || 'orders';
    return {
      sessionUser,
      adminContext: adminCtx,
      pendingOrdersCount,
      systemSettings: settings,
      redirectResponse: astro.redirect(`/admin/${firstAllowed}`),
    };
  }

  // Button/Feature permission check
  if (options.requiredPerm && !hasPermission(adminCtx, options.requiredPerm)) {
    return {
      sessionUser,
      adminContext: adminCtx,
      pendingOrdersCount,
      systemSettings: settings,
      redirectResponse: astro.redirect('/admin/orders'),
    };
  }

  return {
    sessionUser,
    adminContext: adminCtx,
    pendingOrdersCount,
    systemSettings: settings,
  };
}

/**
 * Validates request session for admin API endpoints.
 * Enforces active status (not blocked) and dynamically resolves D1 + KV RBAC permissions.
 */
export async function verifyAdminAuth(
  request: Request,
  cfEnv?: any
): Promise<{ user: AuthUser; adminContext: AdminContextInfo } | null> {
  const sessionUser = await getSessionFromRequest(request, cfEnv);
  if (!sessionUser) return null;

  const [dbUser, settings] = await Promise.all([
    getUserByIdOrEmail(sessionUser.id, sessionUser.email).catch(() => null),
    getSettingsPromise(request, cfEnv),
  ]);

  if (dbUser && dbUser.status === 'BLOCKED') {
    return null;
  }

  const adminCtx = await resolveAdminContext(sessionUser.email, cfEnv, settings?.co_admin_emails);
  if (!adminCtx) return null;

  sessionUser.isAdmin = true;
  return { user: sessionUser, adminContext: adminCtx };
}

/**
 * High-precision API permission guard: checks specific button/action permission code
 */
export async function verifyAdminPermission(
  request: Request,
  requiredPerm: string,
  cfEnv?: any
): Promise<{ user: AuthUser; adminContext: AdminContextInfo; errorResponse: null } | { user: null; adminContext: null; errorResponse: Response }> {
  const auth = await verifyAdminAuth(request, cfEnv);
  if (!auth) {
    return {
      user: null,
      adminContext: null,
      errorResponse: jsonNoCache({ error: 'Unauthorized: Admin session required' }, 401),
    };
  }

  if (!hasPermission(auth.adminContext, requiredPerm)) {
    return {
      user: null,
      adminContext: null,
      errorResponse: jsonNoCache(
        {
          error: 'Forbidden: Insufficient privileges',
          requiredPermission: requiredPerm,
          yourRole: auth.adminContext.role.code,
        },
        403
      ),
    };
  }

  return {
    user: auth.user,
    adminContext: auth.adminContext,
    errorResponse: null,
  };
}


