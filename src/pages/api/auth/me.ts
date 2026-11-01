// src/pages/api/auth/me.ts
import type { APIRoute } from 'astro';
import { getSessionFromRequest } from '@utils/auth';
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

