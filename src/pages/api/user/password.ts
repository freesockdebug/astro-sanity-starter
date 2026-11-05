// src/pages/api/user/password.ts
import type { APIRoute } from 'astro';
import { verifyBuyerAuth, jsonNoCache, updateLogtoUserPassword } from '@utils/auth';
import { recordUserLogin } from '@utils/db';
import { SecurityService } from '@utils/security';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const { user, errorResponse } = await verifyBuyerAuth(request, cfEnv);
  if (errorResponse || !user) {
    return errorResponse!;
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return jsonNoCache({ error: 'Invalid JSON request payload.' }, 400);
  }

  const { password, confirmPassword } = body;

  if (!password || typeof password !== 'string' || password.length < 8) {
    return jsonNoCache({ error: 'Password must be at least 8 characters long.' }, 400);
  }

  if (password !== confirmPassword) {
    return jsonNoCache({ error: 'New password and confirmation do not match.' }, 400);
  }

  // Update password in Logto
  const result = await updateLogtoUserPassword(user.id, user.email, password, cfEnv);

  if (!result.success) {
    return jsonNoCache({ error: result.error || 'Failed to update password.' }, 400);
  }

  // Record security audit event in login logs
  try {
    const { ip: clientIp, country, city } = SecurityService.resolveClientMeta(request);
    await recordUserLogin({
      userId: user.id,
      email: user.email,
      ip: clientIp || '127.0.0.1',
      country: country || 'Security Action',
      city,
      userAgent: 'Password Changed (Self-Service Modal)',
    }, cfEnv);
  } catch (auditErr) {
    console.warn('[User Password] Failed to record audit log:', auditErr);
  }

  return jsonNoCache({
    success: true,
    message: 'Your account password has been updated successfully.',
  });
};
