// src/pages/api/user/password.ts
import type { APIRoute } from 'astro';
import { getSessionFromRequest, updateLogtoUserPassword } from '@utils/auth';
import { recordUserLogin } from '@utils/db';
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

export const POST: APIRoute = async ({ request }) => {
  const user = await getSessionFromRequest(request, cfEnv);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized. Please sign in first.' }), {
      status: 401,
      headers: NO_CACHE_HEADERS,
    });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON request payload.' }), {
      status: 400,
      headers: NO_CACHE_HEADERS,
    });
  }

  const { password, confirmPassword } = body;

  if (!password || typeof password !== 'string' || password.length < 8) {
    return new Response(
      JSON.stringify({ error: 'Password must be at least 8 characters long.' }),
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  if (password !== confirmPassword) {
    return new Response(
      JSON.stringify({ error: 'New password and confirmation do not match.' }),
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  // Update password in Logto
  const result = await updateLogtoUserPassword(user.id, user.email, password, cfEnv);

  if (!result.success) {
    return new Response(
      JSON.stringify({ error: result.error || 'Failed to update password.' }),
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  // Record security audit event in login logs
  try {
    const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
    const country = request.headers.get('cf-ipcountry') || '';
    const city = request.headers.get('cf-ipcity') || '';
    await recordUserLogin({
      userId: user.id,
      email: user.email,
      ip: clientIp,
      country: country || 'Security Action',
      city,
      userAgent: 'Password Changed (Self-Service Modal)',
    });
  } catch (auditErr) {
    console.warn('[User Password] Failed to record audit log:', auditErr);
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: 'Your account password has been updated successfully.',
    }),
    {
      status: 200,
      headers: NO_CACHE_HEADERS,
    }
  );
};

