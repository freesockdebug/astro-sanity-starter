// src/pages/api/auth/me.ts
import type { APIRoute } from 'astro';
import { getSessionFromRequest } from '@utils/auth';
import { getUserByIdOrEmail } from '@utils/db';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const user = await getSessionFromRequest(context, cfEnv);

  if (!user) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Session invalidation guard: verify account is not BLOCKED
  try {
    const dbUser = await getUserByIdOrEmail(user.id, user.email);
    if (dbUser && dbUser.status === 'BLOCKED') {
      context.cookies.delete('gwenvenni_session', { path: '/' });
      return new Response(
        JSON.stringify({ authenticated: false, error: 'account_suspended' }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, max-age=0',
            'Set-Cookie': 'gwenvenni_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
          },
        }
      );
    }
  } catch {
    // Non-blocking
  }

  return new Response(
    JSON.stringify({
      authenticated: true,
      user,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
};

