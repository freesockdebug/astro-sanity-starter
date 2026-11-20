// src/pages/api/auth/me.ts
import type { APIRoute } from 'astro';
import { getSessionFromRequest, checkIsAdmin, jsonNoCache, SESSION_COOKIE_NAME } from '@utils/auth';
import { getUserByIdOrEmail, getSystemSettings } from '@db';
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
    context.cookies.delete('auth_hint', { path: '/' });
    const headers = new Headers({
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    headers.append('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
    headers.append('Set-Cookie', 'auth_hint=; Path=/; Max-Age=0; SameSite=Lax');
    return new Response(JSON.stringify({ authenticated: false, error: 'account_suspended' }), {
      status: 403,
      headers,
    });
  }

  const enrichedUser = {
    id: user.id,
    email: user.email,
    name: dbUser?.name || user.name || '',
    company: dbUser?.company || '',
    country: dbUser?.country || '',
    phone: dbUser?.phone || '',
    tier: dbUser?.tier || 'STANDARD',
    isAdmin: checkIsAdmin(user.email, user.roles || [], cfEnv, settings?.co_admin_emails),
    picture: (user as any).picture || '',
  };

  return jsonNoCache({
    authenticated: true,
    user: enrichedUser,
  });
};
