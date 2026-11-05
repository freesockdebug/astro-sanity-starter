// src/pages/api/client-error.ts
import type { APIRoute } from 'astro';
import { SESSION_COOKIE_NAME, getCookieValue, verifySessionToken, jsonNoCache } from '@utils/auth';
import { SecurityService } from '@utils/security';
import { logger } from '@utils/logger';
import { getSystemSettings } from '@utils/db';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

const IGNORED_MESSAGE_PATTERNS = [
  'ResizeObserver loop',
  'Script error.',
  'AbortError',
  'The operation was aborted',
  'Load failed',
  'Failed to fetch',
];

const IGNORED_SOURCE_PATTERNS = [
  'chrome-extension://',
  'moz-extension://',
  'safari-extension://',
  'safari-web-extension://',
  'webkit-masked-url://',
];

export const POST: APIRoute = async ({ request, url, locals }) => {
  // 0. Server-side Toggle: Reject and skip when frontend telemetry is disabled
  const settings = await getSystemSettings(cfEnv).catch(() => null);
  if (settings && settings.log_client_errors === false) {
    return jsonNoCache({ ok: true, skipped: true, reason: 'Client logging disabled in settings' }, 200);
  }

  // 1. Same-origin / Referer guard to prevent cross-site log spam
  const origin = request.headers.get('origin') || '';
  const referer = request.headers.get('referer') || '';
  const host = url.host;
  if (origin && !origin.includes(host) && !origin.includes('localhost')) {
    return jsonNoCache({ error: 'Forbidden origin' }, 403);
  }
  if (!origin && referer && !referer.includes(host) && !referer.includes('localhost')) {
    return jsonNoCache({ error: 'Forbidden referer' }, 403);
  }

  // 2. Parse payload safely (supports both application/json and sendBeacon text/plain)
  let rawText = '';
  try {
    rawText = await request.text();
    if (!rawText || rawText.length > 8192) {
      return jsonNoCache({ ok: false, reason: 'Payload empty or too large' }, 400);
    }
  } catch {
    return jsonNoCache({ ok: false }, 400);
  }

  let body: any;
  try {
    body = JSON.parse(rawText);
  } catch {
    return jsonNoCache({ ok: false, reason: 'Invalid JSON' }, 400);
  }

  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 500) : '';
  const source = typeof body?.source === 'string' ? body.source.trim().slice(0, 300) : '';
  if (!message) {
    return jsonNoCache({ ok: false, reason: 'Missing message' }, 400);
  }

  // 3. Server-side noise & browser extension filtering
  if (IGNORED_MESSAGE_PATTERNS.some((p) => message.includes(p))) {
    return jsonNoCache({ ok: true, skipped: true });
  }
  if (source && IGNORED_SOURCE_PATTERNS.some((p) => source.includes(p))) {
    return jsonNoCache({ ok: true, skipped: true });
  }

  // 4. Resolve client IP/Geo and authenticated user session
  const clientMeta = (locals as any)?.clientMeta || SecurityService.resolveClientMeta(request);
  const rayId = (locals as any)?.rayId || request.headers.get('cf-ray') || crypto.randomUUID();

  const cookieHeader = request.headers.get('cookie') || '';
  const sessionToken = getCookieValue(cookieHeader, SESSION_COOKIE_NAME);
  const sessionUser = sessionToken ? await verifySessionToken(sessionToken, cfEnv).catch(() => null) : null;

  const eventType =
    body?.type === 'unhandledrejection' ? 'CLIENT_UNHANDLED_REJECTION' : 'CLIENT_RUNTIME_ERROR';
  const pagePath =
    typeof body?.path === 'string' && body.path.startsWith('/')
      ? body.path.slice(0, 200)
      : '/client';

  // Clean client breadcrumbs trail (up to 15 items)
  const rawBreadcrumbs = Array.isArray(body?.breadcrumbs) ? body.breadcrumbs.slice(-15) : undefined;
  const sanitizedBreadcrumbs = rawBreadcrumbs
    ? rawBreadcrumbs.map((b: any) => ({
        ts: typeof b?.ts === 'string' ? b.ts.slice(0, 32) : undefined,
        trigger: typeof b?.trigger === 'string' ? b.trigger.slice(0, 24) : undefined,
        from: typeof b?.from === 'string' ? b.from.slice(0, 160) : null,
        to: typeof b?.to === 'string' ? b.to.slice(0, 160) : '',
      }))
    : undefined;

  const isNavigationEvent = body?.type === 'navigation' || body?.level === 'info';

  // Branch A: Client Navigation Event -> logged as info level
  if (isNavigationEvent) {
    logger.info(
      {
        module: 'client/navigation',
        event: 'CLIENT_NAVIGATION',
        message,
        path: pagePath,
        method: 'CLIENT',
        statusCode: 200,
        rayId,
        userId: sessionUser?.id,
        userEmail: sessionUser?.email,
        clientIp: clientMeta.ip,
        country: clientMeta.country,
        city: clientMeta.city,
        context: {
          trigger: typeof body?.trigger === 'string' ? body.trigger.slice(0, 24) : 'pageload',
          from: typeof body?.from === 'string' ? body.from.slice(0, 200) : null,
          to: typeof body?.to === 'string' ? body.to.slice(0, 200) : pagePath,
          viewport: typeof body?.viewport === 'string' ? body.viewport.slice(0, 32) : undefined,
          userAgent: clientMeta.userAgent?.slice(0, 300),
        },
      },
      { cfEnv }
    );

    return jsonNoCache({ ok: true, rayId, level: 'info' }, 202);
  }

  // Branch B: Client Error Event -> logged as error level with attached breadcrumbs
  logger.error(
    {
      module: 'client/browser',
      event: eventType,
      message,
      path: pagePath,
      method: 'CLIENT',
      statusCode: 0,
      rayId,
      userId: sessionUser?.id,
      userEmail: sessionUser?.email,
      clientIp: clientMeta.ip,
      country: clientMeta.country,
      city: clientMeta.city,
      stack: typeof body?.stack === 'string' ? body.stack.slice(0, 1500) : undefined,
      context: {
        source: source || undefined,
        lineno: typeof body?.lineno === 'number' ? body.lineno : undefined,
        colno: typeof body?.colno === 'number' ? body.colno : undefined,
        viewport: typeof body?.viewport === 'string' ? body.viewport.slice(0, 32) : undefined,
        userAgent: clientMeta.userAgent?.slice(0, 300),
        href: typeof body?.href === 'string' ? body.href.slice(0, 300) : undefined,
        breadcrumbs: sanitizedBreadcrumbs,
      },
    },
    { cfEnv }
  );

  return jsonNoCache({ ok: true, rayId }, 202);
};

