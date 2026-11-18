// src/db/waf.repo.ts
// Database Repository & Unified L1/L2/L3 Pre-Compiled Cache for WAF Rules & IP ACLs

import { type DbClient } from './client';
import { executeWithAutoSchema } from './schema';
import { createTieredCache, type TieredCacheFetchResult } from '../utils/cache';
import {
  buildSystemWafRulesSeed,
  compileWafRuntime,
  convertCustomRuleToDbRule,
  formatUtcSqlTimestamp,
  isValidIpRule,
  normalizeWafRuleConfig,
  parseCustomKeywords,
  parseLegacyIpListToAcl,
  validateRegexSafety,
  type CompiledWafRuntime,
  type WafDbIpAcl,
  type WafDbRule,
  type WafRuleCondition,
  type WafRuleConfig,
  type WafRuntimeData,
} from '../utils/waf';

export const KV_WAF_RUNTIME_KEY = 'waf:compiled_ruleset:v1';

async function ensureWafSeededAndMigrated(db: DbClient): Promise<void> {
  const countRow = await db.first<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM waf_rules');
  if (Number(countRow?.cnt || 0) > 0) return;

  // One-time smooth migration from legacy system_settings keys
  const legacyRows = await db
    .query<{ key: string; value: string }>(
      "SELECT key, value FROM system_settings WHERE key IN ('waf_rule_config', 'waf_blocked_ips', 'waf_allow_ips')"
    )
    .catch(() => []);
  const legacyMap = new Map<string, string>(
    legacyRows.map((r) => [String(r.key || ''), String(r.value || '')] as const)
  );
  const legacyCfg = normalizeWafRuleConfig(legacyMap.get('waf_rule_config'));

  const seedRules: WafDbRule[] = buildSystemWafRulesSeed(legacyCfg);

  const legacyPaths = parseCustomKeywords(legacyCfg.malicious.customBlockedPaths);
  if (legacyPaths.length > 0) {
    seedRules.push({
      id: 'legacy_custom_paths',
      category: 'custom',
      name: 'Migrated Blocked Path Keywords',
      is_system: 0,
      is_enabled: 1,
      priority: 40,
      conditions_json: JSON.stringify(legacyPaths.map((kw) => ({ field: 'path', op: 'contains', value: kw }))),
      match_mode: 'ANY',
      action: 'block_403',
      rate_limit_json: '{}',
      strike_weight: 1,
      expires_at: null,
      updated_by: 'system_migration',
    });
  }

  const legacyUas = parseCustomKeywords(legacyCfg.bot.customBlockedUa);
  if (legacyUas.length > 0) {
    seedRules.push({
      id: 'legacy_custom_ua',
      category: 'custom',
      name: 'Migrated Blocked User-Agent Keywords',
      is_system: 0,
      is_enabled: 1,
      priority: 41,
      conditions_json: JSON.stringify(legacyUas.map((kw) => ({ field: 'ua', op: 'contains', value: kw }))),
      match_mode: 'ANY',
      action: 'block_403',
      rate_limit_json: '{}',
      strike_weight: 0,
      expires_at: null,
      updated_by: 'system_migration',
    });
  }

  legacyCfg.customRules.forEach((cr, idx) => {
    seedRules.push({
      ...convertCustomRuleToDbRule(cr, idx),
      updated_by: 'system_migration',
    });
  });

  const ops = seedRules.map((rule) => ({
    sql: `
      INSERT INTO waf_rules (
        id, category, name, is_system, is_enabled, priority,
        conditions_json, match_mode, action, rate_limit_json,
        strike_weight, expires_at, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO NOTHING
    `,
    params: [
      rule.id,
      rule.category,
      rule.name,
      rule.is_system ? 1 : 0,
      rule.is_enabled ? 1 : 0,
      rule.priority,
      rule.conditions_json,
      rule.match_mode,
      rule.action,
      rule.rate_limit_json,
      rule.strike_weight,
      rule.expires_at,
      rule.updated_by || 'system_init',
    ],
  }));

  if (ops.length > 0) {
    await db.batch(ops);
  }

  const aclCount = await db.first<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM waf_ip_acl');
  if (Number(aclCount?.cnt || 0) === 0) {
    const aclEntries = parseLegacyIpListToAcl(legacyMap.get('waf_blocked_ips'), legacyMap.get('waf_allow_ips'));
    if (aclEntries.length > 0) {
      await db.batch(
        aclEntries.map((a) => ({
          sql: `
            INSERT INTO waf_ip_acl (ip_cidr, list_type, reason, expires_at, created_by, created_at)
            VALUES (?, ?, ?, ?, 'system_migration', datetime('now'))
            ON CONFLICT(ip_cidr) DO NOTHING
          `,
          params: [a.ip_cidr, a.list_type, a.reason, a.expires_at],
        }))
      );
    }
  }
}

async function loadWafRuntimeFromDb(): Promise<TieredCacheFetchResult<WafRuntimeData>> {
  let succeeded = false;
  const data = await executeWithAutoSchema(async (db: DbClient) => {
    await ensureWafSeededAndMigrated(db);
    const nowSql = formatUtcSqlTimestamp(Date.now());
    const [rules, ipAcl] = await Promise.all([
      db.query<WafDbRule>(
        'SELECT id, category, name, is_system, is_enabled, priority, conditions_json, match_mode, action, rate_limit_json, strike_weight, expires_at, updated_by, updated_at FROM waf_rules ORDER BY priority ASC, id ASC'
      ),
      db.query<WafDbIpAcl>(
        'SELECT ip_cidr, list_type, reason, expires_at, created_by, created_at FROM waf_ip_acl WHERE expires_at IS NULL OR expires_at > ? ORDER BY created_at DESC',
        [nowSql]
      ),
    ]);
    succeeded = true;
    return { rules, ipAcl };
  }).catch((err) => {
    console.warn('[WafRepo] DB runtime fetch failed, using fallback:', err);
    return { rules: buildSystemWafRulesSeed(), ipAcl: [] as WafDbIpAcl[] };
  });

  return { data, persistToKv: succeeded };
}

/**
 * Unified L1 (5s Pre-Compiled) -> L2 (Cloudflare KV) -> L3 (DB waf_rules + waf_ip_acl) Runtime Cache.
 */
export const wafRuntimeCache = createTieredCache<WafRuntimeData, CompiledWafRuntime>({
  name: 'waf_runtime',
  kvKey: KV_WAF_RUNTIME_KEY,
  ttlMs: 5_000,
  kvTtlSeconds: 86400,
  fallbackRaw: { rules: buildSystemWafRulesSeed(), ipAcl: [] },
  compile: (raw) => compileWafRuntime(raw),
  deserializeKv: (kvVal) => {
    if (kvVal && typeof kvVal === 'object' && Array.isArray(kvVal.rules) && Array.isArray(kvVal.ipAcl)) {
      return kvVal as WafRuntimeData;
    }
    return null;
  },
  fetchRaw: () => loadWafRuntimeFromDb(),
});

export async function getWafRuntime(customEnv?: any, forceRefresh = false): Promise<CompiledWafRuntime> {
  return wafRuntimeCache.get(customEnv, { forceRefresh, syncKv: forceRefresh });
}

export async function refreshWafRuntimeCache(customEnv?: any): Promise<CompiledWafRuntime> {
  return wafRuntimeCache.refresh(customEnv);
}

export async function listWafRules(customEnv?: any): Promise<WafDbRule[]> {
  await getWafRuntime(customEnv);
  const raw = wafRuntimeCache.peekRaw();
  if (raw?.rules) return raw.rules;
  return executeWithAutoSchema(async (db: DbClient) => {
    await ensureWafSeededAndMigrated(db);
    return db.query<WafDbRule>('SELECT * FROM waf_rules ORDER BY priority ASC, id ASC');
  });
}

export async function listWafIpAcl(customEnv?: any, includeExpired = false): Promise<WafDbIpAcl[]> {
  return executeWithAutoSchema(async (db: DbClient) => {
    await ensureWafSeededAndMigrated(db);
    if (includeExpired) {
      return db.query<WafDbIpAcl>('SELECT * FROM waf_ip_acl ORDER BY created_at DESC');
    }
    return db.query<WafDbIpAcl>(
      'SELECT * FROM waf_ip_acl WHERE expires_at IS NULL OR expires_at > ? ORDER BY created_at DESC',
      [formatUtcSqlTimestamp(Date.now())]
    );
  }).catch(async () => {
    await getWafRuntime(customEnv);
    return wafRuntimeCache.peekRaw()?.ipAcl || [];
  });
}

function validateConditionsList(conditions: WafRuleCondition[]): { valid: boolean; error?: string } {
  if (!Array.isArray(conditions)) {
    return { valid: false, error: 'conditions must be an array.' };
  }
  for (const cond of conditions) {
    if (!cond || typeof cond.field !== 'string' || typeof cond.op !== 'string') {
      return { valid: false, error: 'Each condition must specify field and op.' };
    }
    if (cond.op === 'regex') {
      const res = validateRegexSafety(cond.value || '', 256);
      if (!res.valid) {
        return { valid: false, error: res.error || 'Unsafe regex pattern.' };
      }
    }
  }
  return { valid: true };
}

export async function upsertWafRule(
  input: Partial<WafDbRule> & { id: string; name: string },
  updatedBy: string,
  customEnv?: any
): Promise<{ success: boolean; error?: string }> {
  const id = String(input.id || '').trim().slice(0, 64);
  const name = String(input.name || '').trim().slice(0, 120);
  if (!id || !name) {
    return { success: false, error: 'Rule id and name are required.' };
  }

  let conditions: WafRuleCondition[] = [];
  try {
    const parsed = typeof input.conditions_json === 'string'
      ? JSON.parse(input.conditions_json)
      : Array.isArray((input as any).conditions)
        ? (input as any).conditions
        : [];
    if (Array.isArray(parsed)) conditions = parsed;
  } catch {
    return { success: false, error: 'Invalid conditions_json JSON.' };
  }

  const validCheck = validateConditionsList(conditions);
  if (!validCheck.valid) {
    return { success: false, error: validCheck.error };
  }

  const category = ['malicious', 'rate_limit', 'bot', 'custom'].includes(String(input.category))
    ? (input.category as WafDbRule['category'])
    : 'custom';
  const matchMode = input.match_mode === 'ANY' ? 'ANY' : 'ALL';
  const action = ['allow', 'block_403', 'rate_limit_429', 'challenge_fingerprint', 'log_only'].includes(String(input.action))
    ? (input.action as WafDbRule['action'])
    : 'block_403';
  const priority = Math.max(1, Math.min(9999, Math.round(Number(input.priority ?? 100))));
  const strikeWeight = Math.max(0, Math.min(50, Math.round(Number(input.strike_weight ?? 0))));
  const isEnabled = input.is_enabled === 0 ? 0 : 1;
  const conditionsJson = JSON.stringify(conditions);

  let rateLimitJson = '{}';
  if (typeof input.rate_limit_json === 'string' && input.rate_limit_json.trim()) {
    try {
      const rl = JSON.parse(input.rate_limit_json);
      if (rl && typeof rl === 'object') rateLimitJson = JSON.stringify(rl);
    } catch {
      return { success: false, error: 'Invalid rate_limit_json JSON.' };
    }
  }

  const expiresAt = typeof input.expires_at === 'string' && input.expires_at.trim()
    ? input.expires_at.trim()
    : null;

  await executeWithAutoSchema(async (db: DbClient) => {
    await ensureWafSeededAndMigrated(db);
    const existing = await db.first<{ is_system: number }>('SELECT is_system FROM waf_rules WHERE id = ?', [id]);
    const isSystem = existing?.is_system === 1 ? 1 : (input.is_system === 1 ? 1 : 0);

    await db.execute(
      `INSERT INTO waf_rules (
         id, category, name, is_system, is_enabled, priority,
         conditions_json, match_mode, action, rate_limit_json,
         strike_weight, expires_at, updated_by, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         category = excluded.category,
         name = excluded.name,
         is_enabled = excluded.is_enabled,
         priority = excluded.priority,
         conditions_json = excluded.conditions_json,
         match_mode = excluded.match_mode,
         action = excluded.action,
         rate_limit_json = excluded.rate_limit_json,
         strike_weight = excluded.strike_weight,
         expires_at = excluded.expires_at,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`,
      [id, category, name, isSystem, isEnabled, priority, conditionsJson, matchMode, action, rateLimitJson, strikeWeight, expiresAt, updatedBy]
    );
  });

  await refreshWafRuntimeCache(customEnv);
  return { success: true };
}

export async function toggleWafRule(
  id: string,
  isEnabled: boolean,
  updatedBy: string,
  customEnv?: any
): Promise<{ success: boolean; error?: string }> {
  const cleanId = String(id || '').trim();
  if (!cleanId) return { success: false, error: 'Rule id is required.' };

  const updated = await executeWithAutoSchema(async (db: DbClient) => {
    await ensureWafSeededAndMigrated(db);
    return db.execute(
      `UPDATE waf_rules SET is_enabled = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
      [isEnabled ? 1 : 0, updatedBy, cleanId]
    );
  });
  if ((updated?.changes || 0) === 0) {
    return { success: false, error: `Rule "${cleanId}" not found.` };
  }
  await refreshWafRuntimeCache(customEnv);
  return { success: true };
}

export async function deleteWafRule(
  id: string,
  customEnv?: any
): Promise<{ success: boolean; error?: string }> {
  const cleanId = String(id || '').trim();
  if (!cleanId) return { success: false, error: 'Rule id is required.' };

  const res = await executeWithAutoSchema(async (db: DbClient) => {
    await ensureWafSeededAndMigrated(db);
    const existing = await db.first<{ is_system: number }>('SELECT is_system FROM waf_rules WHERE id = ?', [cleanId]);
    if (!existing) return { error: 'Rule not found.' };
    if (existing.is_system === 1) return { error: 'System preset rules cannot be deleted; disable them instead.' };
    await db.execute('DELETE FROM waf_rules WHERE id = ? AND is_system = 0', [cleanId]);
    return { error: null };
  });

  if (res.error) return { success: false, error: res.error };
  await refreshWafRuntimeCache(customEnv);
  return { success: true };
}

export async function upsertWafIpAcl(
  entry: {
    ip_cidr: string;
    list_type: 'WHITELIST' | 'BLACKLIST' | 'AUTO_BAN';
    reason?: string;
    ttlMinutes?: number | null;
  },
  createdBy: string,
  customEnv?: any
): Promise<{ success: boolean; error?: string }> {
  const ipCidr = String(entry.ip_cidr || '').trim().toLowerCase();
  if (!isValidIpRule(ipCidr)) {
    return { success: false, error: `Invalid IP/CIDR rule: ${ipCidr}` };
  }
  const listType = ['WHITELIST', 'BLACKLIST', 'AUTO_BAN'].includes(entry.list_type)
    ? entry.list_type
    : 'BLACKLIST';
  const reason = String(entry.reason || '').trim().slice(0, 200);
  const ttl = Number(entry.ttlMinutes || 0);
  const expiresAt = ttl > 0 ? formatUtcSqlTimestamp(Date.now() + ttl * 60_000) : null;

  await executeWithAutoSchema(async (db: DbClient) => {
    await ensureWafSeededAndMigrated(db);
    await db.execute(
      `INSERT INTO waf_ip_acl (ip_cidr, list_type, reason, expires_at, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(ip_cidr) DO UPDATE SET
         list_type = excluded.list_type,
         reason = excluded.reason,
         expires_at = excluded.expires_at,
         created_by = excluded.created_by,
         created_at = excluded.created_at`,
      [ipCidr, listType, reason, expiresAt, createdBy]
    );
  });

  await refreshWafRuntimeCache(customEnv);
  return { success: true };
}

export async function deleteWafIpAcl(
  ipCidr: string,
  customEnv?: any
): Promise<{ success: boolean; error?: string }> {
  const clean = String(ipCidr || '').trim().toLowerCase();
  if (!clean) return { success: false, error: 'IP/CIDR is required.' };

  await executeWithAutoSchema(async (db: DbClient) => {
    await ensureWafSeededAndMigrated(db);
    await db.execute('DELETE FROM waf_ip_acl WHERE ip_cidr = ?', [clean]);
  });

  await refreshWafRuntimeCache(customEnv);
  return { success: true };
}

export async function clearWafAutoBansInDb(customEnv?: any): Promise<void> {
  await executeWithAutoSchema(async (db: DbClient) => {
    await ensureWafSeededAndMigrated(db);
    await db.execute("DELETE FROM waf_ip_acl WHERE list_type = 'AUTO_BAN'");
  });
  await refreshWafRuntimeCache(customEnv);
}

/**
 * Synchronizes bulk Admin settings save (save_rules) into waf_rules & waf_ip_acl
 * while preserving user-edited system rule priorities/conditions.
 */
export async function syncWafSettingsToDbTables(
  params: {
    blockedIpsStr: string;
    allowIpsStr: string;
    ruleConfig: WafRuleConfig;
    updatedBy: string;
  },
  customEnv?: any
): Promise<void> {
  const cfg = normalizeWafRuleConfig(params.ruleConfig);
  const systemUpdates: Array<{ id: string; enabled: number; rateLimit?: any }> = [
    { id: 'sys_ip_blacklist', enabled: cfg.malicious.enableIpBlacklist ? 1 : 0 },
    { id: 'sys_ip_autoban', enabled: cfg.malicious.enableAutoBan ? 1 : 0 },
    { id: 'sys_rate_abuse_ban', enabled: cfg.malicious.autoBanOnRateAbuse ? 1 : 0 },
    { id: 'sys_probe_paths', enabled: cfg.malicious.enableProbePaths ? 1 : 0 },
    { id: 'sys_owasp_sqli', enabled: cfg.malicious.enableSqli ? 1 : 0 },
    { id: 'sys_owasp_xss', enabled: cfg.malicious.enableXss ? 1 : 0 },
    { id: 'sys_path_traversal', enabled: cfg.malicious.enablePathTraversal ? 1 : 0 },
    { id: 'sys_rl_public_write', enabled: 1, rateLimit: { limit: cfg.rateLimit.publicWriteLimit, window_s: cfg.rateLimit.windowSeconds, key_by: 'ip', bucket_prefix: 'pub_write' } },
    { id: 'sys_rl_api', enabled: 1, rateLimit: { limit: cfg.rateLimit.apiLimit, window_s: cfg.rateLimit.windowSeconds, key_by: 'ip', bucket_prefix: 'api' } },
    { id: 'sys_rl_page', enabled: 1, rateLimit: { limit: cfg.rateLimit.pageLimit, window_s: cfg.rateLimit.windowSeconds, key_by: 'ip', bucket_prefix: 'page' } },
    { id: 'sys_bot_empty_ua', enabled: cfg.bot.blockEmptyUa ? 1 : 0 },
    { id: 'sys_bot_ua_rotation', enabled: cfg.bot.blockUaRotation ? 1 : 0 },
    { id: 'sys_bot_scanner', enabled: cfg.bot.blockScannerTools ? 1 : 0 },
    { id: 'sys_bot_cli', enabled: cfg.bot.blockCliScrapers ? 1 : 0 },
    { id: 'sys_bot_ai', enabled: cfg.bot.blockAiCrawlers ? 1 : 0 },
    { id: 'sys_bot_seo', enabled: cfg.bot.blockSeoBots ? 1 : 0 },
    { id: 'sys_bot_quote_fp', enabled: cfg.bot.enforceQuoteFingerprint ? 1 : 0 },
  ];

  await executeWithAutoSchema(async (db: DbClient) => {
    await ensureWafSeededAndMigrated(db);
    const ops: Array<{ sql: string; params?: any[] }> = [];

    for (const u of systemUpdates) {
      if (u.rateLimit) {
        ops.push({
          sql: `UPDATE waf_rules SET is_enabled = ?, rate_limit_json = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
          params: [u.enabled, JSON.stringify(u.rateLimit), params.updatedBy, u.id],
        });
      } else {
        ops.push({
          sql: `UPDATE waf_rules SET is_enabled = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`,
          params: [u.enabled, params.updatedBy, u.id],
        });
      }
    }

    const legacyPaths = parseCustomKeywords(cfg.malicious.customBlockedPaths);
    if (legacyPaths.length > 0) {
      ops.push({
        sql: `INSERT INTO waf_rules (id, category, name, is_system, is_enabled, priority, conditions_json, match_mode, action, rate_limit_json, strike_weight, expires_at, updated_by, updated_at)
              VALUES ('legacy_custom_paths', 'custom', 'Migrated Blocked Path Keywords', 0, 1, 40, ?, 'ANY', 'block_403', '{}', 1, NULL, ?, datetime('now'))
              ON CONFLICT(id) DO UPDATE SET conditions_json = excluded.conditions_json, is_enabled = 1, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
        params: [JSON.stringify(legacyPaths.map((kw) => ({ field: 'path', op: 'contains', value: kw }))), params.updatedBy],
      });
    } else {
      ops.push({ sql: "DELETE FROM waf_rules WHERE id = 'legacy_custom_paths'", params: [] });
    }

    const legacyUas = parseCustomKeywords(cfg.bot.customBlockedUa);
    if (legacyUas.length > 0) {
      ops.push({
        sql: `INSERT INTO waf_rules (id, category, name, is_system, is_enabled, priority, conditions_json, match_mode, action, rate_limit_json, strike_weight, expires_at, updated_by, updated_at)
              VALUES ('legacy_custom_ua', 'custom', 'Migrated Blocked User-Agent Keywords', 0, 1, 41, ?, 'ANY', 'block_403', '{}', 0, NULL, ?, datetime('now'))
              ON CONFLICT(id) DO UPDATE SET conditions_json = excluded.conditions_json, is_enabled = 1, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
        params: [JSON.stringify(legacyUas.map((kw) => ({ field: 'ua', op: 'contains', value: kw }))), params.updatedBy],
      });
    } else {
      ops.push({ sql: "DELETE FROM waf_rules WHERE id = 'legacy_custom_ua'", params: [] });
    }

    // Sync permanent WHITELIST / BLACKLIST entries (preserving AUTO_BAN rows!)
    ops.push({ sql: "DELETE FROM waf_ip_acl WHERE list_type IN ('WHITELIST', 'BLACKLIST') AND expires_at IS NULL", params: [] });
    const aclEntries = parseLegacyIpListToAcl(params.blockedIpsStr, params.allowIpsStr);
    for (const a of aclEntries) {
      ops.push({
        sql: `
          INSERT INTO waf_ip_acl (ip_cidr, list_type, reason, expires_at, created_by, created_at)
          VALUES (?, ?, ?, NULL, ?, datetime('now'))
          ON CONFLICT(ip_cidr) DO UPDATE SET
            list_type = excluded.list_type,
            reason = excluded.reason,
            expires_at = excluded.expires_at,
            created_by = excluded.created_by,
            created_at = excluded.created_at
        `,
        params: [a.ip_cidr, a.list_type, a.reason, params.updatedBy],
      });
    }

    await db.batch(ops);
  });

  await refreshWafRuntimeCache(customEnv);
}
