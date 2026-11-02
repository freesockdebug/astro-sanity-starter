// src/pages/api/user/profile.ts
import type { APIRoute } from 'astro';
import { getSessionFromRequest } from '@utils/auth';
import { getUserByIdOrEmail, getUserLoginHistory, updateUserProfile } from '@utils/db';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

const NO_CACHE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store',
  'Pragma': 'no-cache',
  'Expires': '0',
};

export const GET: APIRoute = async ({ request }) => {
  const sessionUser = await getSessionFromRequest(request, cfEnv);
  if (!sessionUser) {
    return new Response(JSON.stringify({ error: 'Unauthorized. Please sign in.' }), {
      status: 401,
      headers: NO_CACHE_HEADERS,
    });
  }

  const [dbUser, logins] = await Promise.all([
    getUserByIdOrEmail(sessionUser.id, sessionUser.email),
    getUserLoginHistory(sessionUser.id, 20),
  ]);

  if (dbUser && dbUser.status === 'BLOCKED') {
    return new Response(
      JSON.stringify({ error: 'Your account is suspended. Please contact concierge@gwenvenni.com.' }),
      { status: 403, headers: NO_CACHE_HEADERS }
    );
  }

  return new Response(
    JSON.stringify({
      user: dbUser || {
        id: sessionUser.id,
        email: sessionUser.email,
        name: sessionUser.name,
        company: '',
        country: '',
        phone: '',
      },
      loginHistory: logins,
    }),
    {
      status: 200,
      headers: NO_CACHE_HEADERS,
    }
  );
};

export const POST: APIRoute = async ({ request }) => {
  const sessionUser = await getSessionFromRequest(request, cfEnv);
  if (!sessionUser) {
    return new Response(JSON.stringify({ error: 'Unauthorized. Please sign in.' }), {
      status: 401,
      headers: NO_CACHE_HEADERS,
    });
  }

  const dbUser = await getUserByIdOrEmail(sessionUser.id, sessionUser.email);
  if (dbUser && dbUser.status === 'BLOCKED') {
    return new Response(
      JSON.stringify({ error: 'Your account is suspended. Please contact admin@gwenvenni.com.' }),
      { status: 403, headers: NO_CACHE_HEADERS }
    );
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { name, company, country, phone } = body || {};

  // Basic validation: prevent excessively long strings
  if (name && name.length > 100) {
    return new Response(JSON.stringify({ error: 'Name must not exceed 100 characters.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (company && company.length > 150) {
    return new Response(JSON.stringify({ error: 'Company must not exceed 150 characters.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (country && country.length > 100) {
    return new Response(JSON.stringify({ error: 'Country must not exceed 100 characters.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (phone && phone.length > 50) {
    return new Response(JSON.stringify({ error: 'Phone must not exceed 50 characters.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const success = await updateUserProfile(sessionUser.id, {
    name,
    company,
    country,
    phone,
  });

  const updatedUser = await getUserByIdOrEmail(sessionUser.id, sessionUser.email);

  return new Response(
    JSON.stringify({
      success: true,
      message: 'Profile updated successfully.',
      user: updatedUser,
    }),
    {
      status: 200,
      headers: NO_CACHE_HEADERS,
    }
  );
};

