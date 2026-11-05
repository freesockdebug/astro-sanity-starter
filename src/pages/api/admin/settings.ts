// src/pages/api/admin/settings.ts
import type { APIRoute } from 'astro';
import { verifyAdminAuth, getRuntimeEnv, jsonNoCache } from '@utils/auth';
import { getSystemSettings, updateSystemSettings } from '@utils/db';
import { SecurityService } from '@utils/security';
import { dispatchWebhookMessage } from '@utils/webhook';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const admin = await verifyAdminAuth(request, cfEnv);
  if (!admin) {
    return jsonNoCache({ error: 'Forbidden. Administrator access required.' }, 403);
  }

  let d1Healthy = true;
  let settings;
  try {
    settings = await getSystemSettings(cfEnv);
  } catch {
    d1Healthy = false;
    settings = await getSystemSettings();
  }

  const health = {
    d1: d1Healthy,
    logtoOidc: !!(getRuntimeEnv('LOGTO_APP_ID', cfEnv) && getRuntimeEnv('LOGTO_ENDPOINT', cfEnv)),
    logtoM2m: !!(getRuntimeEnv('LOGTO_M2M_APP_ID', cfEnv) && getRuntimeEnv('LOGTO_M2M_APP_SECRET', cfEnv)),
    turnstile: !!(getRuntimeEnv('TURNSTILE_SECRET_KEY', cfEnv) || getRuntimeEnv('PUBLIC_TURNSTILE_SITE_KEY', cfEnv) || getRuntimeEnv('TURNSTILE_SITE_KEY', cfEnv)),
    resend: !!getRuntimeEnv('RESEND_API_KEY', cfEnv),
    sanity: !!((getRuntimeEnv('SANITY_TOKEN', cfEnv) || getRuntimeEnv('SANITY_API_TOKEN', cfEnv)) && getRuntimeEnv('SANITY_PROJECT_ID', cfEnv)),
    rootAdminEmails: getRuntimeEnv('ADMIN_EMAILS', cfEnv) || '',
  };

  return jsonNoCache({ success: true, settings, health });
};

export const POST: APIRoute = async ({ request }) => {
  const admin = await verifyAdminAuth(request, cfEnv);
  if (!admin) {
    return jsonNoCache({ error: 'Forbidden. Administrator access required.' }, 403);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonNoCache({ error: 'Invalid JSON payload.' }, 400);
  }

  const action = body?.action || 'save';

  // Action: Test Webhook dispatch
  if (action === 'test_webhook') {
    const targetUrl = typeof body?.url === 'string' ? body.url.trim() : '';
    if (!targetUrl) {
      return jsonNoCache({ success: false, error: 'Webhook URL cannot be empty.' }, 400);
    }

    if (!SecurityService.isSafeWebhookUrl(targetUrl)) {
      return jsonNoCache(
        {
          success: false,
          error: 'Security rejection: Webhook URL must be a public HTTPS endpoint (RFC 1918 / localhost / internal addresses blocked).',
        },
        400
      );
    }

    try {
      const currentSettings = await getSystemSettings(cfEnv);
      const brand = currentSettings.brand_name || 'GWENVENNI';
      const plainText = `🔔 【${brand}】Webhook 连接测试成功\n- 触发者：${admin.email}\n- 时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n- 运行环境：Cloudflare Workers\n- 状态：测试消息发送正常`;
      const markdownText = `### 🔔 [${brand}] Webhook 验证成功\n\n- **触发者**：${admin.email}\n- **时间**：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n- **运行环境**：Cloudflare Workers\n- **状态**：Live Delivery OK`;

      const result = await dispatchWebhookMessage(targetUrl, {
        title: `【${brand}】Webhook 验证测试`,
        markdownText,
        plainText,
      });

      if (!result.success) {
        return jsonNoCache(
          {
            success: false,
            error: `Target server error: ${result.error || 'Dispatch failed'}`,
          },
          200
        );
      }

      return jsonNoCache(
        { success: true, message: `Webhook reached successfully (HTTP ${result.status || 200}).` },
        200
      );
    } catch (err: any) {
      return jsonNoCache(
        {
          success: false,
          error: err.name === 'TimeoutError' ? 'Target webhook server timed out (>6s).' : (err.message || 'Network fetch failure.'),
        },
        200
      );
    }
  }

  // Action: Save Settings
  if (action === 'save') {
    const rawUpdates = body?.updates;
    if (!rawUpdates || typeof rawUpdates !== 'object') {
      return jsonNoCache({ error: 'Missing updates object.' }, 400);
    }

    const updates: Record<string, any> = {};

    // Validate Webhook URL if provided
    if (typeof rawUpdates.notification_webhook_url === 'string') {
      const trimmedUrl = rawUpdates.notification_webhook_url.trim();
      if (trimmedUrl.length > 0 && !SecurityService.isSafeWebhookUrl(trimmedUrl)) {
        return jsonNoCache(
          {
            error: 'Webhook URL must be a valid public HTTPS URL (internal and non-HTTPS URLs are blocked).',
          },
          400
        );
      }
      updates.notification_webhook_url = trimmedUrl;
    }

    // Validate Order Prefix
    if (typeof rawUpdates.order_no_prefix === 'string') {
      const prefix = rawUpdates.order_no_prefix.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{2,8}$/.test(prefix)) {
        return jsonNoCache(
          {
            error: 'Order Prefix must be 2 to 8 alphanumeric characters, underscores, or dashes (e.g. ORD, REQ, RFQ).',
          },
          400
        );
      }
      updates.order_no_prefix = prefix;
    }

    // Validate Retention Days
    if (rawUpdates.login_retention_days !== undefined) {
      const days = parseInt(rawUpdates.login_retention_days, 10);
      if (isNaN(days) || days < 7 || days > 365) {
        return jsonNoCache(
          {
            error: 'Login Retention Days must be an integer between 7 and 365.',
          },
          400
        );
      }
      updates.login_retention_days = days;
    }

    // Validate Log Retention Days
    if (rawUpdates.log_retention_days !== undefined) {
      const days = parseInt(rawUpdates.log_retention_days, 10);
      if (isNaN(days) || days < 1 || days > 365) {
        return jsonNoCache(
          {
            error: 'Log Retention Days must be an integer between 1 and 365.',
          },
          400
        );
      }
      updates.log_retention_days = days;
    }

    // Validate Minimum Log Level
    if (rawUpdates.log_min_level !== undefined) {
      const lvl = String(rawUpdates.log_min_level).trim().toLowerCase();
      if (!['debug', 'info', 'warn', 'error', 'critical'].includes(lvl)) {
        return jsonNoCache(
          {
            error: 'Log Minimum Level must be one of: debug, info, warn, error, critical.',
          },
          400
        );
      }
      updates.log_min_level = lvl;
    }

    // Validate Slow Request Threshold
    if (rawUpdates.slow_request_threshold_ms !== undefined) {
      const ms = parseInt(rawUpdates.slow_request_threshold_ms, 10);
      if (isNaN(ms) || ms < 50 || ms > 30000) {
        return jsonNoCache(
          {
            error: 'Slow Request Threshold must be between 50ms and 30000ms.',
          },
          400
        );
      }
      updates.slow_request_threshold_ms = ms;
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

    const boolKeys = [
      'enable_email_notify',
      'enable_webhook_notify',
      'enable_error_logging',
      'log_authenticated_users',
    ];
    for (const key of boolKeys) {
      if (rawUpdates[key] !== undefined) {
        updates[key] = Boolean(rawUpdates[key]);
      }
    }

    const saveResult = await updateSystemSettings(updates, admin.email, cfEnv);
    if (!saveResult.success) {
      return jsonNoCache({ error: saveResult.error || 'Failed to save settings.' }, 500);
    }

    const refreshedSettings = await getSystemSettings(cfEnv);
    return jsonNoCache({
      success: true,
      message: 'Settings saved successfully.',
      settings: refreshedSettings,
    });
  }

  return jsonNoCache({ error: `Unknown action: ${action}` }, 400);
};
