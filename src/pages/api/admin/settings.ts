// src/pages/api/admin/settings.ts
import type { APIRoute } from 'astro';
import { verifyAdminAuth, getRuntimeEnv, jsonNoCache } from '@utils/auth';
import { hasMenu } from '@utils/rbac';
import { DEFAULT_SYSTEM_SETTINGS, getSystemSettings, updateSystemSettings } from '@utils/db';
import { SecurityService, sanitizeAdminSettings, isMaskedSecret, SECRET_SETTING_KEYS } from '@utils/security';
import { dispatchWebhookMessage } from '@utils/webhook';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const admin = await verifyAdminAuth(request, cfEnv);
  if (!admin || !hasMenu(admin.adminContext, 'settings')) {
    return jsonNoCache({ error: 'Forbidden. Settings access required.' }, 403);
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
    turnstile: !!(settings.turnstile_secret_key || settings.turnstile_site_key || getRuntimeEnv('TURNSTILE_SECRET_KEY', cfEnv) || getRuntimeEnv('PUBLIC_TURNSTILE_SITE_KEY', cfEnv) || getRuntimeEnv('TURNSTILE_SITE_KEY', cfEnv)),
    resend: !!(settings.resend_api_key || getRuntimeEnv('RESEND_API_KEY', cfEnv)),
    sanity: !!((getRuntimeEnv('SANITY_TOKEN', cfEnv) || getRuntimeEnv('SANITY_API_TOKEN', cfEnv)) && getRuntimeEnv('SANITY_PROJECT_ID', cfEnv)),
    cloudflareCdn: !!(settings.cloudflare_api_token || getRuntimeEnv('CLOUDFLARE_API_TOKEN', cfEnv)),
    rootAdminEmails: getRuntimeEnv('ADMIN_EMAILS', cfEnv) || '',
  };

  return jsonNoCache({ success: true, settings: sanitizeAdminSettings(settings), health });
};

export const POST: APIRoute = async ({ request }) => {
  const admin = await verifyAdminAuth(request, cfEnv);
  if (!admin || !hasMenu(admin.adminContext, 'settings')) {
    return jsonNoCache({ error: 'Forbidden. Settings access required.' }, 403);
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
      const plainText = `🔔 【${brand}】Webhook 连接测试成功\n- 触发者：${admin.user.email}\n- 时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n- 运行环境：Cloudflare Workers\n- 状态：测试消息发送正常`;
      const markdownText = `### 🔔 [${brand}] Webhook 验证成功\n\n- **触发者**：${admin.user.email}\n- **时间**：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n- **运行环境**：Cloudflare Workers\n- **状态**：Live Delivery OK`;

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

    // Validate numeric settings via range table
    const NUMBER_RANGES: Record<string, [number, number, string]> = {
      login_retention_days: [7, 365, 'Login Retention Days must be an integer between 7 and 365.'],
      log_retention_days: [1, 365, 'Log Retention Days must be an integer between 1 and 365.'],
      slow_request_threshold_ms: [50, 30000, 'Slow Request Threshold must be between 50ms and 30000ms.'],
    };
    for (const [key, [min, max, errMsg]] of Object.entries(NUMBER_RANGES)) {
      if (rawUpdates[key] !== undefined) {
        const val = parseInt(rawUpdates[key], 10);
        if (isNaN(val) || val < min || val > max) {
          return jsonNoCache({ error: errMsg }, 400);
        }
        updates[key] = val;
      }
    }

    // Validate Minimum Log Level
    if (rawUpdates.log_min_level !== undefined) {
      const lvl = String(rawUpdates.log_min_level).trim().toLowerCase();
      if (!['debug', 'info', 'warn', 'error', 'critical'].includes(lvl)) {
        return jsonNoCache({ error: 'Log Minimum Level must be one of: debug, info, warn, error, critical.' }, 400);
      }
      updates.log_min_level = lvl;
    }

    // Pass through remaining string and boolean fields driven by DEFAULT_SYSTEM_SETTINGS
    const secretSet = new Set<string>(SECRET_SETTING_KEYS);
    for (const [key, defaultVal] of Object.entries(DEFAULT_SYSTEM_SETTINGS)) {
      if (rawUpdates[key] === undefined || updates[key] !== undefined || key in NUMBER_RANGES || key === 'log_min_level') continue;
      if (typeof defaultVal === 'boolean') {
        updates[key] = Boolean(rawUpdates[key]);
      } else if (typeof defaultVal === 'string') {
        const val = String(rawUpdates[key]).trim();
        if (secretSet.has(key) && isMaskedSecret(val)) continue;
        updates[key] = val;
      }
    }

    const saveResult = await updateSystemSettings(updates, admin.user.email, cfEnv);
    if (!saveResult.success) {
      return jsonNoCache({ error: saveResult.error || 'Failed to save settings.' }, 500);
    }

    const refreshedSettings = await getSystemSettings(cfEnv);
    return jsonNoCache({
      success: true,
      message: 'Settings saved successfully.',
      settings: sanitizeAdminSettings(refreshedSettings),
    });
  }

  return jsonNoCache({ error: `Unknown action: ${action}` }, 400);
};
