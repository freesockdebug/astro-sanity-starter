// src/pages/api/user/profile.ts
import type { APIRoute } from 'astro';
import { defineBuyerApi, jsonNoCache } from '@utils/auth';
import { getUserByIdOrEmail, getUserLoginHistory, updateUserProfile } from '@utils/db';

export const prerender = false;

const PROFILE_FIELD_LIMITS: Array<[string, string, number]> = [
  ['name', 'Name', 100],
  ['company', 'Company', 150],
  ['country', 'Country', 100],
  ['phone', 'Phone', 50],
];

export const GET: APIRoute = defineBuyerApi({}, async ({ user: sessionUser, dbUser }) => {
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
});

export const POST: APIRoute = defineBuyerApi({ parseJson: true }, async ({ user: sessionUser, body }) => {
  const payload = body && typeof body === 'object' ? body : {};

  for (const [key, label, maxLen] of PROFILE_FIELD_LIMITS) {
    const val = payload[key];
    if (val && typeof val === 'string' && val.length > maxLen) {
      return jsonNoCache({ error: `${label} must not exceed ${maxLen} characters.` }, 400);
    }
  }

  const { name, company, country, phone } = payload;

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
});
