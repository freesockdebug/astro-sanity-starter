// src/pages/api/user/profile.ts
import type { APIRoute } from 'astro';
import { verifyBuyerAuth, jsonNoCache } from '@utils/auth';
import { getUserByIdOrEmail, getUserLoginHistory, updateUserProfile } from '@utils/db';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const { user: sessionUser, dbUser, errorResponse } = await verifyBuyerAuth(request, cfEnv);
  if (errorResponse || !sessionUser) {
    return errorResponse!;
  }

  const logins = await getUserLoginHistory(sessionUser.id, 20);

  return jsonNoCache({
    user: dbUser || {
      id: sessionUser.id,
      email: sessionUser.email,
      name: sessionUser.name,
      company: '',
      country: '',
      phone: '',
    },
    loginHistory: logins,
  });
};

export const POST: APIRoute = async ({ request }) => {
  const { user: sessionUser, errorResponse } = await verifyBuyerAuth(request, cfEnv);
  if (errorResponse || !sessionUser) {
    return errorResponse!;
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return jsonNoCache({ error: 'Invalid JSON payload.' }, 400);
  }

  const { name, company, country, phone } = body || {};

  // Basic validation: prevent excessively long strings
  if (name && name.length > 100) {
    return jsonNoCache({ error: 'Name must not exceed 100 characters.' }, 400);
  }
  if (company && company.length > 150) {
    return jsonNoCache({ error: 'Company must not exceed 150 characters.' }, 400);
  }
  if (country && country.length > 100) {
    return jsonNoCache({ error: 'Country must not exceed 100 characters.' }, 400);
  }
  if (phone && phone.length > 50) {
    return jsonNoCache({ error: 'Phone must not exceed 50 characters.' }, 400);
  }

  await updateUserProfile(sessionUser.id, {
    name,
    company,
    country,
    phone,
  });

  const updatedUser = await getUserByIdOrEmail(sessionUser.id, sessionUser.email);

  return jsonNoCache({
    success: true,
    message: 'Profile updated successfully.',
    user: updatedUser,
  });
};
