// src/pages/api/admin/settings.ts
import type { APIRoute } from 'astro';
import { getSessionFromRequest, checkIsAdmin, getRuntimeEnv } from '@utils/auth';
import { getSystemSettings, updateSystemSettings } from '@utils/db';
import { SecurityService } from '@utils/security';
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

async function verifyAdminAuth(request: Request) {
  const sessionUser = await getSessionFromRequest(request, cfEnv);
  if (!sessionUser) return null;

  let isAdmin = sessionUser.isAdmin;
  if (!isAdmin) {
    try {
      const settings = await getSystemSettings(cfEnv);
      if (checkIsAdmin(sessionUser.email, sessionUser.roles, cfEnv, settings.co_admin_emails)) {
        isAdmin = true;
      }
    } catch {
      // Non-blocking
    }
  }

  return isAdmin ? sessionUser : null;
}

export const GET: APIRoute = async ({ request }) => {
  const admin = await verifyAdminAuth(request);
  if (!admin) {
    return new Response(JSON.stringify({ error: 'Forbidden. Administrator access required.' }), {
      status: 403,
      headers: NO_CACHE_HEADERS,
    });
  }

  let d1Healthy = true;
  let settings;
  try {
    settings = await getSystemSettings(cfEnv);
  } catch (e) {
    d1Healthy = false;
    settings = await getSystemSettings();
  }

  const health = {
    d1: d1Healthy,
    logtoOidc: !!(getRuntimeEnv('LOGTO_APP_ID', cfEnv) && getRuntimeEnv('LOGTO_ENDPOINT', cfEnv)),
    logtoM2m: !!(getRuntimeEnv('LOGTO_M2M_APP_ID', cfEnv) && getRuntimeEnv('LOGTO_M2M_APP_SECRET', cfEnv)),
    turnstile: !!getRuntimeEnv('TURNSTILE_SITE_KEY', cfEnv),
    resend: !!getRuntimeEnv('RESEND_API_KEY', cfEnv),
    sanity: !!(getRuntimeEnv('SANITY_API_TOKEN', cfEnv) && getRuntimeEnv('SANITY_PROJECT_ID', cfEnv)),
    rootAdminEmails: getRuntimeEnv('ADMIN_EMAILS', cfEnv) || '',
  };

  return new Response(JSON.stringify({ success: true, settings, health }), {
    status: 200,
    headers: NO_CACHE_HEADERS,
  });
};

export const POST: APIRoute = async ({ request }) => {
  const admin = await verifyAdminAuth(request);
  if (!admin) {
    return new Response(JSON.stringify({ error: 'Forbidden. Administrator access required.' }), {
      status: 403,
      headers: NO_CACHE_HEADERS,
    });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload.' }), {
      status: 400,
      headers: NO_CACHE_HEADERS,
    });
  }

  const action = body.action || 'save';

  // Action: Test Webhook dispatch
  if (action === 'test_webhook') {
    const targetUrl = typeof body.url === 'string' ? body.url.trim() : '';
    if (!targetUrl) {
      return new Response(JSON.stringify({ success: false, error: 'Webhook URL cannot be empty.' }), {
        status: 400,
        headers: NO_CACHE_HEADERS,
      });
    }

    if (!SecurityService.isSafeWebhookUrl(targetUrl)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Security rejection: Webhook URL must be a public HTTPS endpoint (RFC 1918 / localhost / internal addresses blocked).',
        }),
        {
          status: 400,
          headers: NO_CACHE_HEADERS,
        }
      );
    }

    try {
      const currentSettings = await getSystemSettings(cfEnv);
      const testPayload = {
        msgtype: 'markdown',
        markdown: {
          content: `### 🔔 [${currentSettings.brand_name}] Webhook Connection Verified\n\n- **Triggered By**: ${admin.email}\n- **Timestamp**: ${new Date().toISOString()}\n- **Environment**: Cloudflare Edge Workers\n- **Status**: Live Delivery OK`,
        },
        text: {
          content: `🔔 [${currentSettings.brand_name}] Webhook connection test successful from ${admin.email}`,
        },
      };

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return new Response(
          JSON.stringify({
            success: false,
            error: `Target server responded with HTTP ${res.status}: ${errText.slice(0, 160)}`,
          }),
          { status: 200, headers: NO_CACHE_HEADERS }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: `Webhook reached successfully (HTTP ${res.status}).` }),
        { status: 200, headers: NO_CACHE_HEADERS }
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          success: false,
          error: err.name === 'TimeoutError' ? 'Target webhook server timed out (>6s).' : (err.message || 'Network fetch failure.'),
        }),
        { status: 200, headers: NO_CACHE_HEADERS }
      );
    }
  }

  // Action: Save Settings
  if (action === 'save') {
    const rawUpdates = body.updates;
    if (!rawUpdates || typeof rawUpdates !== 'object') {
      return new Response(JSON.stringify({ error: 'Missing updates object.' }), {
        status: 400,
        headers: NO_CACHE_HEADERS,
      });
    }

    const updates: Record<string, any> = {};

    // Validate Webhook URL if provided
    if (typeof rawUpdates.notification_webhook_url === 'string') {
      const trimmedUrl = rawUpdates.notification_webhook_url.trim();
      if (trimmedUrl.length > 0 && !SecurityService.isSafeWebhookUrl(trimmedUrl)) {
        return new Response(
          JSON.stringify({
            error: 'Webhook URL must be a valid public HTTPS URL (internal and non-HTTPS URLs are blocked).',
          }),
          { status: 400, headers: NO_CACHE_HEADERS }
        );
      }
      updates.notification_webhook_url = trimmedUrl;
    }

    // Validate Order Prefix
    if (typeof rawUpdates.order_no_prefix === 'string') {
      const prefix = rawUpdates.order_no_prefix.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{2,8}$/.test(prefix)) {
        return new Response(
          JSON.stringify({
            error: 'Order Prefix must be 2 to 8 alphanumeric characters, underscores, or dashes (e.g. ORD, REQ, RFQ).',
          }),
          { status: 400, headers: NO_CACHE_HEADERS }
        );
      }
      updates.order_no_prefix = prefix;
    }

    // Validate Retention Days
    if (rawUpdates.login_retention_days !== undefined) {
      const days = parseInt(rawUpdates.login_retention_days, 10);
      if (isNaN(days) || days < 7 || days > 365) {
        return new Response(
          JSON.stringify({
            error: 'Login Retention Days must be an integer between 7 and 365.',
          }),
          { status: 400, headers: NO_CACHE_HEADERS }
        );
      }
      updates.login_retention_days = days;
    }

    // Pass through string and boolean fields safely
    const stringKeys = [
      'brand_name',
      'contact_email',
      'whatsapp_number',
      'whatsapp_prefill',
      'resend_from_email',
      'resend_to_emails',
      'resend_subject_prefix',
      'shipping_carriers',
      'print_sheet_title',
      'print_sheet_footer',
      'co_admin_emails',
      'turnstile_hostnames',
    ];

    for (const key of stringKeys) {
      if (rawUpdates[key] !== undefined) {
        updates[key] = String(rawUpdates[key]).trim();
      }
    }

    const boolKeys = ['enable_email_notify', 'enable_webhook_notify'];
    for (const key of boolKeys) {
      if (rawUpdates[key] !== undefined) {
        updates[key] = Boolean(rawUpdates[key]);
      }
    }

    const saveResult = await updateSystemSettings(updates, admin.email);
    if (!saveResult.success) {
      return new Response(JSON.stringify({ error: saveResult.error || 'Failed to save settings.' }), {
        status: 500,
        headers: NO_CACHE_HEADERS,
      });
    }

    const refreshedSettings = await getSystemSettings(cfEnv);
    return new Response(
      JSON.stringify({ success: true, message: 'Settings saved successfully.', settings: refreshedSettings }),
      { status: 200, headers: NO_CACHE_HEADERS }
    );
  }

  return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
    status: 400,
    headers: NO_CACHE_HEADERS,
  });
};
