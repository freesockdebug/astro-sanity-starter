// src/db/settings.repo.ts
// System Settings Repository: Unified Dynamic Configuration Engine with In-Memory Caching

import { getDb, type DbClient } from './client';
import { executeWithAutoSchema } from './schema';
import { getRuntimeEnv } from '../utils/auth';
import { kvGet, kvPut, kvDelete } from '../utils/cache';

export type LogMinLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export interface SystemSettings {
  // 1. Brand & Buyer Concierge
  brand_name: string;
  app_url: string;
  contact_email: string;
  whatsapp_number: string;
  whatsapp_prefill: string;

  // 2. RFQ Notifications & Webhook
  enable_email_notify: boolean;
  resend_api_key: string;
  resend_from_email: string;
  resend_to_emails: string;
  resend_subject_prefix: string;
  enable_webhook_notify: boolean;
  notification_webhook_url: string;

  // 3. Orders & Fulfillment Rules
  order_no_prefix: string;
  shipping_carriers: string;
  print_sheet_title: string;
  print_sheet_footer: string;

  // 4. Access Control & Security
  co_admin_emails: string;
  turnstile_site_key: string;
  turnstile_secret_key: string;
  turnstile_hostnames: string;
  login_retention_days: number;

  // 5. Diagnostics & Observability
  enable_error_logging: boolean;
  log_authenticated_users: boolean;
  log_client_errors: boolean;
  log_retention_days: number;
  log_min_level: LogMinLevel;
  slow_request_threshold_ms: number;

  // 6. Edge CDN & Cache Invalidation
  revalidate_secret: string;
  cloudflare_zone_id: string;
  cloudflare_api_token: string;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  brand_name: 'B2B ATELIER',
  app_url: 'https://gwenvenni.com',
  contact_email: '',
  whatsapp_number: '',
  whatsapp_prefill: 'Hello, I would like to consult on custom manufacturing & wholesale orders.',
  enable_email_notify: true,
  resend_api_key: '',
  resend_from_email: '',
  resend_to_emails: '',
  resend_subject_prefix: '[New RFQ]',
  enable_webhook_notify: true,
  notification_webhook_url: '',
  order_no_prefix: 'ORD',
  shipping_carriers: 'DHL Express,FedEx,UPS,SF Express,EMS',
  print_sheet_title: 'OFFICIAL B2B PROCUREMENT REQUISITION',
  print_sheet_footer: 'This document is an official B2B sample & procurement requisition sheet.',
  co_admin_emails: '',
  turnstile_site_key: '',
  turnstile_secret_key: '',
  turnstile_hostnames: '',
  login_retention_days: 90,
  enable_error_logging: true,
  log_authenticated_users: true,
  log_client_errors: true,
  log_retention_days: 30,
  log_min_level: 'warn',
  slow_request_threshold_ms: 1000,
  revalidate_secret: '',
  cloudflare_zone_id: '',
  cloudflare_api_token: '',
};

export const KV_SETTINGS_KEY = 'sys:settings:v1';

// L1 in-memory TTL cache (5s) for instant micro-loop execution
let cachedSettings: SystemSettings | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5_000;

export async function invalidateSettingsCache(customEnv?: any) {
  cachedSettings = null;
  cacheExpiry = 0;
  await kvDelete(KV_SETTINGS_KEY, customEnv).catch(() => {});
}

/**
 * Resolves current system settings with priority:
 * L1 Memory Cache (5s) -> L2 Cloudflare KV (sys:settings:v1) -> L3 D1 Database -> Runtime Env -> Defaults
 */
export async function getSystemSettings(customEnv?: any, forceRefresh: boolean = false): Promise<SystemSettings> {
  const now = Date.now();
  if (!forceRefresh && cachedSettings && now < cacheExpiry) {
    return cachedSettings;
  }

  // L2: Try Cloudflare Edge KV cache (1~5ms edge response)
  if (!forceRefresh) {
    try {
      const kvData = await kvGet<SystemSettings>(KV_SETTINGS_KEY, customEnv);
      if (kvData && typeof kvData === 'object' && kvData.brand_name) {
        cachedSettings = kvData;
        cacheExpiry = now + CACHE_TTL_MS;
        return kvData;
      }
    } catch {
      // Non-blocking fallback to D1
    }
  }

  let dbRecords: { key: string; value: string }[] = [];
  let d1QuerySucceeded = false;
  try {
    dbRecords = await executeWithAutoSchema(async (db: DbClient) => {
      return db.query<{ key: string; value: string }>(
        'SELECT key, value FROM system_settings'
      );
    });
    d1QuerySucceeded = true;
  } catch (err) {
    console.warn('[SettingsRepo] D1 settings query warning, falling back to env/defaults:', err);
  }

  const dbMap = new Map<string, string>();
  for (const r of dbRecords) {
    if (r.key && typeof r.value === 'string') {
      dbMap.set(r.key, r.value);
    }
  }

  // Resolve setting by checking DB -> Env -> Default
  // If a key has been configured in DB (dbMap.has), respect the DB value (even if cleared to "")
  // unless allowEmpty is false (e.g. required identifiers like brand_name or order_no_prefix).
  const resolveStr = (key: keyof SystemSettings, envKey: string, fallback: string, allowEmpty: boolean = true): string => {
    if (dbMap.has(key)) {
      const valFromDb = (dbMap.get(key) ?? '').trim();
      if (valFromDb.length > 0 || allowEmpty) {
        return valFromDb;
      }
    }
    const valFromEnv = getRuntimeEnv(envKey, customEnv);
    if (typeof valFromEnv === 'string' && valFromEnv.trim().length > 0) {
      return valFromEnv.trim();
    }
    return fallback;
  };

  const resolveBool = (key: keyof SystemSettings, envKey: string, fallback: boolean): boolean => {
    if (dbMap.has(key)) {
      const val = (dbMap.get(key) ?? '').trim().toLowerCase();
      return val === 'true' || val === '1';
    }
    const valFromEnv = getRuntimeEnv(envKey, customEnv);
    if (typeof valFromEnv === 'string' && valFromEnv.trim().length > 0) {
      return valFromEnv.trim().toLowerCase() === 'true' || valFromEnv.trim() === '1';
    }
    return fallback;
  };

  const resolveNum = (key: keyof SystemSettings, envKey: string, fallback: number): number => {
    if (dbMap.has(key)) {
      const parsed = parseInt((dbMap.get(key) ?? '').trim(), 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    const valFromEnv = getRuntimeEnv(envKey, customEnv);
    if (typeof valFromEnv === 'string' && valFromEnv.trim().length > 0) {
      const parsed = parseInt(valFromEnv.trim(), 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return fallback;
  };

  const settings: SystemSettings = {
    brand_name: resolveStr('brand_name', 'PUBLIC_BRAND_NAME', DEFAULT_SYSTEM_SETTINGS.brand_name, false),
    app_url: resolveStr('app_url', 'APP_URL', DEFAULT_SYSTEM_SETTINGS.app_url, false),
    contact_email: resolveStr('contact_email', 'PUBLIC_CONTACT_EMAIL', DEFAULT_SYSTEM_SETTINGS.contact_email),
    whatsapp_number: resolveStr('whatsapp_number', 'PUBLIC_WHATSAPP_NUMBER', DEFAULT_SYSTEM_SETTINGS.whatsapp_number),
    whatsapp_prefill: resolveStr('whatsapp_prefill', 'PUBLIC_WHATSAPP_PREFILL', DEFAULT_SYSTEM_SETTINGS.whatsapp_prefill),

    enable_email_notify: resolveBool('enable_email_notify', 'ENABLE_EMAIL_NOTIFY', DEFAULT_SYSTEM_SETTINGS.enable_email_notify),
    resend_api_key: resolveStr('resend_api_key', 'RESEND_API_KEY', DEFAULT_SYSTEM_SETTINGS.resend_api_key),
    resend_from_email: resolveStr('resend_from_email', 'RESEND_FROM_EMAIL', DEFAULT_SYSTEM_SETTINGS.resend_from_email),
    resend_to_emails: resolveStr('resend_to_emails', 'RESEND_TO_EMAIL', DEFAULT_SYSTEM_SETTINGS.resend_to_emails),
    resend_subject_prefix: resolveStr('resend_subject_prefix', 'RESEND_SUBJECT_PREFIX', DEFAULT_SYSTEM_SETTINGS.resend_subject_prefix),
    enable_webhook_notify: resolveBool('enable_webhook_notify', 'ENABLE_WEBHOOK_NOTIFY', DEFAULT_SYSTEM_SETTINGS.enable_webhook_notify),
    notification_webhook_url: resolveStr('notification_webhook_url', 'NOTIFICATION_WEBHOOK_URL', DEFAULT_SYSTEM_SETTINGS.notification_webhook_url),

    order_no_prefix: resolveStr('order_no_prefix', 'ORDER_NO_PREFIX', DEFAULT_SYSTEM_SETTINGS.order_no_prefix, false),
    shipping_carriers: resolveStr('shipping_carriers', 'SHIPPING_CARRIERS', DEFAULT_SYSTEM_SETTINGS.shipping_carriers),
    print_sheet_title: resolveStr('print_sheet_title', 'PRINT_SHEET_TITLE', DEFAULT_SYSTEM_SETTINGS.print_sheet_title),
    print_sheet_footer: resolveStr('print_sheet_footer', 'PRINT_SHEET_FOOTER', DEFAULT_SYSTEM_SETTINGS.print_sheet_footer),

    co_admin_emails: resolveStr('co_admin_emails', 'CO_ADMIN_EMAILS', DEFAULT_SYSTEM_SETTINGS.co_admin_emails),
    turnstile_site_key: resolveStr('turnstile_site_key', 'PUBLIC_TURNSTILE_SITE_KEY', DEFAULT_SYSTEM_SETTINGS.turnstile_site_key),
    turnstile_secret_key: resolveStr('turnstile_secret_key', 'TURNSTILE_SECRET_KEY', DEFAULT_SYSTEM_SETTINGS.turnstile_secret_key),
    turnstile_hostnames: resolveStr('turnstile_hostnames', 'TURNSTILE_HOSTNAMES', DEFAULT_SYSTEM_SETTINGS.turnstile_hostnames),
    login_retention_days: resolveNum('login_retention_days', 'LOGIN_RETENTION_DAYS', DEFAULT_SYSTEM_SETTINGS.login_retention_days),

    enable_error_logging: resolveBool('enable_error_logging', 'ENABLE_ERROR_LOGGING', DEFAULT_SYSTEM_SETTINGS.enable_error_logging),
    log_authenticated_users: resolveBool('log_authenticated_users', 'LOG_AUTHENTICATED_USERS', DEFAULT_SYSTEM_SETTINGS.log_authenticated_users),
    log_client_errors: resolveBool('log_client_errors', 'LOG_CLIENT_ERRORS', DEFAULT_SYSTEM_SETTINGS.log_client_errors),
    log_retention_days: resolveNum('log_retention_days', 'LOG_RETENTION_DAYS', DEFAULT_SYSTEM_SETTINGS.log_retention_days),
    log_min_level: (resolveStr('log_min_level', 'LOG_MIN_LEVEL', DEFAULT_SYSTEM_SETTINGS.log_min_level).toLowerCase() as LogMinLevel),
    slow_request_threshold_ms: resolveNum('slow_request_threshold_ms', 'SLOW_REQUEST_THRESHOLD_MS', DEFAULT_SYSTEM_SETTINGS.slow_request_threshold_ms),

    revalidate_secret: resolveStr('revalidate_secret', 'REVALIDATE_SECRET', DEFAULT_SYSTEM_SETTINGS.revalidate_secret),
    cloudflare_zone_id: resolveStr('cloudflare_zone_id', 'CLOUDFLARE_ZONE_ID', DEFAULT_SYSTEM_SETTINGS.cloudflare_zone_id),
    cloudflare_api_token: resolveStr('cloudflare_api_token', 'CLOUDFLARE_API_TOKEN', DEFAULT_SYSTEM_SETTINGS.cloudflare_api_token),
  };

  cachedSettings = settings;
  cacheExpiry = now + CACHE_TTL_MS;

  // L2: Asynchronously populate KV cache if D1 query succeeded
  if (d1QuerySucceeded) {
    await kvPut(KV_SETTINGS_KEY, settings, { expirationTtl: 86400 }, customEnv).catch(() => {});
  }

  return settings;
}

/**
 * Updates multiple settings atomically with upsert
 */
export async function updateSystemSettings(
  updates: Record<string, any>,
  updatedBy: string,
  customEnv?: any
): Promise<{ success: boolean; error?: string }> {
  try {
    const validKeys = new Set(Object.keys(DEFAULT_SYSTEM_SETTINGS));
    const entries = Object.entries(updates).filter(([k]) => validKeys.has(k));

    if (entries.length === 0) {
      return { success: true };
    }

    await executeWithAutoSchema(async (db: DbClient) => {
      const sql = `
        INSERT INTO system_settings (key, value, updated_by, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at
      `;

      const operations = entries.map(([key, rawVal]) => {
        const valStr = typeof rawVal === 'boolean' || typeof rawVal === 'number'
          ? String(rawVal)
          : String(rawVal || '').trim();
        return { sql, params: [key, valStr, updatedBy] };
      });

      await db.batch(operations);
    });

    // Invalidate local memory and force D1 read + KV overwrite in a single write
    cachedSettings = null;
    cacheExpiry = 0;
    await getSystemSettings(customEnv, true);
    return { success: true };
  } catch (err: any) {
    console.error('[SettingsRepo] Failed to update settings:', err);
    return { success: false, error: err.message || 'Failed to persist settings in database.' };
  }
}

export { getMergedAdminEmails } from '../utils/auth';

