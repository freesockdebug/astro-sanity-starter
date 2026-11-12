// src/pages/api/auth/me.ts
import type { APIRoute } from 'astro';
import { getSessionFromRequest, checkIsAdmin, jsonNoCache, SESSION_COOKIE_NAME } from '@utils/auth';
import { getUserByIdOrEmail, getSystemSettings } from '@utils/db';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const user = await getSessionFromRequest(context, cfEnv);

  if (!user) {
    return jsonNoCache({ authenticated: false });
  }

  // Parallel DB lookups: user status & dynamic system settings
  const [dbUser, settings] = await Promise.all([
    getUserByIdOrEmail(user.id, user.email).catch(() => null),
    getSystemSettings(cfEnv).catch(() => null),
  ]);

  if (dbUser && dbUser.status === 'BLOCKED') {
    context.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
    return jsonNoCache(
      { authenticated: false, error: 'account_suspended' },
      403,
      { 'Set-Cookie': `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax` }
    );
  }

  const enrichedUser: any = {
    ...user,
    name: dbUser?.name || user.name || '',
    company: dbUser?.company || '',
    country: dbUser?.country || '',
    phone: dbUser?.phone || '',
    tier: dbUser?.tier || 'STANDARD',
    isAdmin: checkIsAdmin(user.email, user.roles || [], cfEnv, settings?.co_admin_emails),
  };

  return jsonNoCache({
    authenticated: true,
    user: enrichedUser,
  });
};
