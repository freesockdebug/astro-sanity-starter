// src/pages/api/auth/me.ts
import type { APIRoute } from 'astro';
import { getSessionFromRequest } from '@utils/auth';
import { claimOrdersByEmail } from '@utils/db';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const user = await getSessionFromRequest(request, cfEnv);

  if (!user) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Idempotently claim any newly submitted guest orders with same email
  let claimedCount = 0;
  try {
    claimedCount = await claimOrdersByEmail(user.email, user.id);
  } catch (err) {
    // Non-blocking
  }

  return new Response(
    JSON.stringify({
      authenticated: true,
      user,
      claimedCount,
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

