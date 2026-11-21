// src/db/settings.repo.ts
// System Settings Repository: Unified Dynamic Configuration Engine with In-Memory Caching

import { type DbClient } from './client';
import { executeWithAutoSchema } from './schema';
import { getRuntimeEnv } from '../utils/auth';
import { bumpCacheEpoch, createTieredCache, setDefaultNegativeTtlMsResolver, type TieredCacheFetchResult } from '../utils/cache';
import {
  DEFAULT_BRAND_TITLE,
  DEFAULT_SITE_URL,
  DEFAULT_WHATSAPP_PREFILL,
  DEFAULT_CONTACT_EMAIL,
} from '../data/defaults';

import type { StorefrontTheme } from '../config/storefrontThemes';
import {
  DEFAULT_WAF_RULE_CONFIG,
  normalizeWafRuleConfig,
  type WafRuleConfig,
} from '../utils/waf';
export type { StorefrontTheme, WafRuleConfig };

export type LogMinLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export const VALID_WAF_MODES = [
  'block_malicious_ips',
  'strict_rate_limiting',
  'bot_challenge',
] as const;

export type WafRuleMode = (typeof VALID_WAF_MODES)[number];

export interface SystemSettings {
  // 1. Brand & Buyer Concierge
  brand_name: string;
  storefront_theme: StorefrontTheme;
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
  waf_active_modes: WafRuleMode[];
  waf_blocked_ips: string;
  waf_allow_ips: string;
  waf_rule_config: WafRuleConfig;

  // 5. Diagnostics & Observability
  enable_error_logging: boolean;
  log_authenticated_users: boolean;
  log_client_errors: boolean;
  log_retention_days: number;
  log_min_level: LogMinLevel;
  slow_request_threshold_ms: number;

  // 6. Edge CDN & Cache Policy
  revalidate_secret: string;
  cloudflare_zone_id: string;
  cloudflare_api_token: string;
  edge_html_cache_ttl_sec: number;
  edge_404_cache_ttl_sec: number;
  waf_legacy_404_ttl_sec: number;
  l1_heartbeat_interval_sec: number;
  user_status_cache_ttl_sec: number;
  admin_order_stats_ttl_sec: number;
  l1_negative_cache_ttl_sec: number;
  enable_url_cache_stats: boolean;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  brand_name: DEFAULT_BRAND_TITLE,
  storefront_theme: 'apple-minimal',
  app_url: DEFAULT_SITE_URL,
  contact_email: DEFAULT_CONTACT_EMAIL,
  whatsapp_number: '',
  whatsapp_prefill: DEFAULT_WHATSAPP_PREFILL,
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
  waf_active_modes: ['block_malicious_ips', 'bot_challenge'],
  waf_blocked_ips: '',
  waf_allow_ips: '',
  waf_rule_config: DEFAULT_WAF_RULE_CONFIG,
  enable_error_logging: true,
  log_authenticated_users: true,
  log_client_errors: true,
  log_retention_days: 30,
  log_min_level: 'warn',
  slow_request_threshold_ms: 1000,
  revalidate_secret: '',
  cloudflare_zone_id: '',
  cloudflare_api_token: '',
  edge_html_cache_ttl_sec: 300,
  edge_404_cache_ttl_sec: 300,
  waf_legacy_404_ttl_sec: 3600,
  l1_heartbeat_interval_sec: 30,
  user_status_cache_ttl_sec: 30,
  admin_order_stats_ttl_sec: 30,
  l1_negative_cache_ttl_sec: 60,
  enable_url_cache_stats: true,
};

export const KV_SETTINGS_KEY = 'sys:settings:v1';

async function loadSystemSettingsFromDb(customEnv?: any): Promise<TieredCacheFetchResult<SystemSettings>> {
  let dbRecords: { key: string; value: string }[] = [];
  let d1QuerySucceeded = false;
  try {
    dbRecords = await executeWithAutoSchema(async (db: DbClient) => {
      return db.query<{ key: string; value: string }>(
        "SELECT key, value FROM system_settings WHERE key NOT LIKE 'table_pref:%'"
      );
    });
    d1QuerySucceeded = true;
  } catch (err) {
    console.warn('[SettingsRepo] DB settings query warning, falling back to env/defaults:', err);
  }

  const dbMap = new Map<string, string>();
  for (const r of dbRecords) {
    if (r.key && typeof r.value === 'string') {
      dbMap.set(r.key, r.value);
    }
  }

  // Resolve setting by checking DB -> Env -> Default
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
    const allowZero = key.endsWith('_ttl_sec') || key === 'l1_heartbeat_interval_sec';
    const isValid = (n: number) => !isNaN(n) && (allowZero ? n >= 0 : n > 0);
    if (dbMap.has(key)) {
      const parsed = parseInt((dbMap.get(key) ?? '').trim(), 10);
      if (isValid(parsed)) return parsed;
    }
    const valFromEnv = getRuntimeEnv(envKey, customEnv);
    if (typeof valFromEnv === 'string' && valFromEnv.trim().length > 0) {
      const parsed = parseInt(valFromEnv.trim(), 10);
      if (isValid(parsed)) return parsed;
    }
    return fallback;
  };

  const resolveWafModes = (key: keyof SystemSettings, envKey: string, fallback: WafRuleMode[]): WafRuleMode[] => {
    const parseModes = (raw: string): WafRuleMode[] | null => {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.filter((m): m is WafRuleMode => VALID_WAF_MODES.includes(m as WafRuleMode));
        }
      } catch {
        return trimmed
          .split(',')
          .map((s) => s.trim())
          .filter((m): m is WafRuleMode => VALID_WAF_MODES.includes(m as WafRuleMode));
      }
      return null;
    };

    if (dbMap.has(key)) {
      const parsed = parseModes(dbMap.get(key) ?? '');
      if (parsed !== null) return parsed;
    }
    const valFromEnv = getRuntimeEnv(envKey, customEnv);
    if (typeof valFromEnv === 'string' && valFromEnv.trim().length > 0) {
      const parsed = parseModes(valFromEnv);
      if (parsed !== null) return parsed;
    }
    return [...fallback];
  };

  const ENV_KEY_OVERRIDES: Partial<Record<keyof SystemSettings, string>> = {
    brand_name: 'PUBLIC_BRAND_NAME',
    contact_email: 'PUBLIC_CONTACT_EMAIL',
    whatsapp_number: 'PUBLIC_WHATSAPP_NUMBER',
    whatsapp_prefill: 'PUBLIC_WHATSAPP_PREFILL',
    resend_to_emails: 'RESEND_TO_EMAIL',
    turnstile_site_key: 'PUBLIC_TURNSTILE_SITE_KEY',
  };
  const NON_EMPTY_STRING_KEYS = new Set<keyof SystemSettings>(['brand_name', 'storefront_theme', 'app_url', 'order_no_prefix']);

  const settings = {} as SystemSettings;
  for (const [rawKey, defaultVal] of Object.entries(DEFAULT_SYSTEM_SETTINGS)) {
    const key = rawKey as keyof SystemSettings;
    const envKey = ENV_KEY_OVERRIDES[key] || key.toUpperCase();
    if (typeof defaultVal === 'boolean') {
      (settings as any)[key] = resolveBool(key, envKey, defaultVal);
    } else if (typeof defaultVal === 'number') {
      (settings as any)[key] = resolveNum(key, envKey, defaultVal);
    } else if (Array.isArray(defaultVal)) {
      (settings as any)[key] = resolveWafModes(key, envKey, defaultVal as WafRuleMode[]);
    } else if (key === 'waf_rule_config') {
      const rawJson = dbMap.has(key) ? dbMap.get(key) : getRuntimeEnv(envKey, customEnv);
      (settings as any)[key] = normalizeWafRuleConfig(rawJson);
    } else {
      const val = resolveStr(key, envKey, String(defaultVal), !NON_EMPTY_STRING_KEYS.has(key));
      (settings as any)[key] = key === 'log_min_level' ? (val.toLowerCase() as LogMinLevel) : val;
    }
  }

  return { data: settings, persistToKv: d1QuerySucceeded };
}

export const settingsCache = createTieredCache<SystemSettings>({
  name: 'system_settings',
  scope: 'settings',
  purgeAction: 'refresh',
  kvKey: KV_SETTINGS_KEY,
  epochKey: '__settings',
  ttlMs: Infinity,
  fallbackRaw: DEFAULT_SYSTEM_SETTINGS,
  deserializeKv: (kvData) => {
    if (kvData && typeof kvData === 'object' && kvData.brand_name) {
      return { ...kvData, waf_rule_config: normalizeWafRuleConfig(kvData.waf_rule_config) };
    }
    return null;
  },
  fetchRaw: (customEnv) => loadSystemSettingsFromDb(customEnv),
});

setDefaultNegativeTtlMsResolver(() => (settingsCache.peek()?.l1_negative_cache_ttl_sec ?? 60) * 1000);

export async function invalidateSettingsCache(customEnv?: any) {
  await settingsCache.refresh(customEnv);
}

/**
 * Resolves current system settings via unified L1/L2/L3 cache.
 */
export async function getSystemSettings(customEnv?: any, forceRefresh: boolean = false): Promise<SystemSettings> {
  return settingsCache.get(customEnv, { forceRefresh, syncKv: forceRefresh });
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
      // Single multi-row upsert (1 RTT instead of N round-trips inside a transaction)
      const valuesPlaceholders = entries.map(() => "(?, ?, ?, datetime('now'))").join(', ');
      const sql = `
        INSERT INTO system_settings (key, value, updated_by, updated_at)
        VALUES ${valuesPlaceholders}
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at
      `;

      const params: any[] = [];
      for (const [key, rawVal] of entries) {
        const valStr = Array.isArray(rawVal) || (typeof rawVal === 'object' && rawVal !== null)
          ? JSON.stringify(rawVal)
          : typeof rawVal === 'boolean' || typeof rawVal === 'number'
            ? String(rawVal)
            : String(rawVal || '').trim();
        params.push(key, valStr, updatedBy);
      }

      await db.execute(sql, params);
    });

    await settingsCache.refresh(customEnv);
    return { success: true };
  } catch (err: any) {
    console.error('[SettingsRepo] Failed to update settings:', err);
    return { success: false, error: err.message || 'Failed to persist settings in database.' };
  }
}

export { getMergedAdminEmails } from '../utils/auth';

