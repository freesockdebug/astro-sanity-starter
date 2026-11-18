// src/utils/waf.ts
// Edge WAF Shield Engine: IP Blacklist/Whitelist, Auto-Ban Strike Engine, Strict Rate Limiting & Bot Challenge

import type { WafRuleMode } from '../db/settings.repo';

export type WafBlockCode =
  | 'WAF_MALICIOUS_IP'
  | 'WAF_MALICIOUS_PAYLOAD'
  | 'WAF_STRICT_RATE_LIMIT'
  | 'WAF_BOT_CHALLENGE';

export interface WafEvaluationInput {
  clientIp?: string;
  pathname: string;
  search?: string;
  method?: string;
  userAgent?: string;
  headers?: Headers;
  now?: number;
}

export interface WafEvaluationResult {
  allowed: boolean;
  status?: 403 | 429;
  code?: WafBlockCode;
  mode?: WafRuleMode;
  reason?: string;
  matchedSample?: string;
  retryAfter?: number;
  autoBanned?: boolean;
}

export interface WafRuleConfig {
  malicious: {
    enableIpBlacklist: boolean;
    enableAutoBan: boolean;
    strikeLimit: number;
    banDurationMinutes: number;
    enableProbePaths: boolean;
    enablePathTraversal: boolean;
    enableXss: boolean;
    enableSqli: boolean;
    customBlockedPaths: string;
  };
  rateLimit: {
    windowSeconds: number;
    publicWriteLimit: number;
    apiLimit: number;
    pageLimit: number;
  };
  bot: {
    blockEmptyUa: boolean;
    blockScannerTools: boolean;
    blockCliScrapers: boolean;
    blockAiCrawlers: boolean;
    blockSeoBots: boolean;
    enforceQuoteFingerprint: boolean;
    customBlockedUa: string;
  };
}

export const DEFAULT_WAF_RULE_CONFIG: WafRuleConfig = {
  malicious: {
    enableIpBlacklist: true,
    enableAutoBan: true,
    strikeLimit: 3,
    banDurationMinutes: 15,
    enableProbePaths: true,
    enablePathTraversal: true,
    enableXss: true,
    enableSqli: true,
    customBlockedPaths: '',
  },
  rateLimit: {
    windowSeconds: 60,
    publicWriteLimit: 5,
    apiLimit: 30,
    pageLimit: 90,
  },
  bot: {
    blockEmptyUa: true,
    blockScannerTools: true,
    blockCliScrapers: true,
    blockAiCrawlers: true,
    blockSeoBots: true,
    enforceQuoteFingerprint: true,
    customBlockedUa: '',
  },
};

export const WAF_CONDITION_CATALOG = {
  block_malicious_ips: [
    {
      key: 'enableIpBlacklist',
      label: 'IP / CIDR Blacklist Match',
      condition: 'clientIp matches waf_blocked_ips (Exact IPv4/v6, Wildcard 185.220.*, CIDR /24)',
    },
    {
      key: 'enableProbePaths',
      label: 'Vulnerability Probe Paths',
      condition: '/.env, /.git, /wp-*, /phpmyadmin, /actuator, /cgi-bin, /xmlrpc, *.php, *.asp, *.jsp, *.sql, *.bak, *.pem',
    },
    {
      key: 'enableSqli',
      label: 'OWASP SQL Injection (SQLi)',
      condition: 'UNION [ALL] SELECT, information_schema, sleep(), benchmark(), waitfor delay, xp_cmdshell, OR 1=1',
    },
    {
      key: 'enableXss',
      label: 'OWASP Cross-Site Scripting (XSS)',
      condition: '<script, javascript:, onerror=, onload=, onmouseover=, <iframe, <svg onload=',
    },
    {
      key: 'enablePathTraversal',
      label: 'Directory Traversal (LFI)',
      condition: '../, ..\\, %2e%2e%2f, %2e%2e/',
    },
    {
      key: 'enableAutoBan',
      label: 'Dynamic Strike Auto-Ban',
      condition: 'Automatically bans IP in edge memory when probe/payload strikes >= strikeLimit',
    },
  ],
  strict_rate_limiting: [
    {
      key: 'publicWriteLimit',
      label: 'Public Write / Auth Endpoints',
      condition: 'POST /api/submit-quote, POST /api/client-error, POST /api/auth/*',
    },
    {
      key: 'apiLimit',
      label: 'Standard API Endpoints',
      condition: 'ALL /api/* routes (excluding /api/admin/waf)',
    },
    {
      key: 'pageLimit',
      label: 'SSR Storefront & Dynamic Pages',
      condition: 'All non-static HTML document requests (excludes /_astro/*, *.css, *.js, images)',
    },
  ],
  bot_challenge: [
    {
      key: 'blockEmptyUa',
      label: 'Empty User-Agent Header',
      condition: 'Request header User-Agent is missing or empty string',
    },
    {
      key: 'blockScannerTools',
      label: 'Security & Vulnerability Scanners',
      condition: 'sqlmap, nuclei, nikto, nessus, acunetix, masscan, zgrab, dirbuster, gobuster, ffuf, wfuzz',
    },
    {
      key: 'blockCliScrapers',
      label: 'Automated CLI & Script Scrapers',
      condition: 'curl/, wget/, python-requests, python-urllib, aiohttp, scrapy, go-http-client, java/, libwww-perl',
    },
    {
      key: 'blockAiCrawlers',
      label: 'AI Training & LLM Crawlers',
      condition: 'GPTBot, ClaudeBot, anthropic-ai, Bytespider, CCBot',
    },
    {
      key: 'blockSeoBots',
      label: 'Commercial SEO Backlink Crawlers',
      condition: 'AhrefsBot, SemrushBot, DotBot, MJ12bot',
    },
    {
      key: 'enforceQuoteFingerprint',
      label: 'RFQ Submission Browser Fingerprint',
      condition: 'POST /api/submit-quote must include Accept-Language, Sec-Fetch-Site/Sec-CH-UA, or CF-Turnstile-Response',
    },
  ],
} as const;

export interface WafSettingsSubset {
  waf_active_modes?: WafRuleMode[] | null;
  waf_blocked_ips?: string | null;
  waf_allow_ips?: string | null;
  waf_rule_config?: Partial<WafRuleConfig> | WafRuleConfig | string | null;
}

function clampInt(val: unknown, fallback: number, min: number, max: number): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function toBool(val: unknown, fallback: boolean): boolean {
  return typeof val === 'boolean' ? val : fallback;
}

/**
 * Normalizes partial or JSON-serialized WAF rule configuration with safe bounds and defaults.
 */
export function normalizeWafRuleConfig(raw: unknown): WafRuleConfig {
  let obj: any = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      obj = null;
    }
  }
  const m = obj && typeof obj.malicious === 'object' && obj.malicious ? obj.malicious : {};
  const r = obj && typeof obj.rateLimit === 'object' && obj.rateLimit ? obj.rateLimit : {};
  const b = obj && typeof obj.bot === 'object' && obj.bot ? obj.bot : {};
  const d = DEFAULT_WAF_RULE_CONFIG;

  return {
    malicious: {
      enableIpBlacklist: toBool(m.enableIpBlacklist, d.malicious.enableIpBlacklist),
      enableAutoBan: toBool(m.enableAutoBan, d.malicious.enableAutoBan),
      strikeLimit: clampInt(m.strikeLimit, d.malicious.strikeLimit, 1, 50),
      banDurationMinutes: clampInt(m.banDurationMinutes, d.malicious.banDurationMinutes, 1, 1440),
      enableProbePaths: toBool(m.enableProbePaths, d.malicious.enableProbePaths),
      enablePathTraversal: toBool(m.enablePathTraversal, d.malicious.enablePathTraversal),
      enableXss: toBool(m.enableXss, d.malicious.enableXss),
      enableSqli: toBool(m.enableSqli, d.malicious.enableSqli),
      customBlockedPaths: typeof m.customBlockedPaths === 'string' ? m.customBlockedPaths.trim().slice(0, 2000) : '',
    },
    rateLimit: {
      windowSeconds: clampInt(r.windowSeconds, d.rateLimit.windowSeconds, 10, 3600),
      publicWriteLimit: clampInt(r.publicWriteLimit, d.rateLimit.publicWriteLimit, 1, 500),
      apiLimit: clampInt(r.apiLimit, d.rateLimit.apiLimit, 1, 1000),
      pageLimit: clampInt(r.pageLimit, d.rateLimit.pageLimit, 1, 5000),
    },
    bot: {
      blockEmptyUa: toBool(b.blockEmptyUa, d.bot.blockEmptyUa),
      blockScannerTools: toBool(b.blockScannerTools, d.bot.blockScannerTools),
      blockCliScrapers: toBool(b.blockCliScrapers, d.bot.blockCliScrapers),
      blockAiCrawlers: toBool(b.blockAiCrawlers, d.bot.blockAiCrawlers),
      blockSeoBots: toBool(b.blockSeoBots, d.bot.blockSeoBots),
      enforceQuoteFingerprint: toBool(b.enforceQuoteFingerprint, d.bot.enforceQuoteFingerprint),
      customBlockedUa: typeof b.customBlockedUa === 'string' ? b.customBlockedUa.trim().slice(0, 2000) : '',
    },
  };
}

export function parseCustomKeywords(raw?: string | null): string[] {
  if (!raw || typeof raw !== 'string') return [];
  return Array.from(
    new Set(
      raw
        .split(/[\r\n,]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length >= 2)
    )
  ).slice(0, 100);
}

function matchCustomKeyword(targetLower: string, rawKeywords: string): string | null {
  for (const kw of parseCustomKeywords(rawKeywords)) {
    if (targetLower.includes(kw)) return kw;
  }
  return null;
}

const AUTO_BAN_STRIKE_LIMIT = DEFAULT_WAF_RULE_CONFIG.malicious.strikeLimit;
const AUTO_BAN_DURATION_MS = DEFAULT_WAF_RULE_CONFIG.malicious.banDurationMinutes * 60_000;
const RATE_LIMIT_WINDOW_MS = DEFAULT_WAF_RULE_CONFIG.rateLimit.windowSeconds * 1000;
const MAX_MAP_ENTRIES = 5000;

const strikeRecords = new Map<string, { strikes: number; bannedUntil: number; updatedAt: number }>();
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

const STATIC_ASSET_EXT = /\.(?:css|js|mjs|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|eot|map|txt|xml)$/i;

const PROBE_PATH_EXT = /\.(?:php\d*|asp|aspx|jsp|cgi|env|git|sql|bak|zip|tar|gz|sh|py|rb|pl|ini|log|ya?ml|toml|action|do|key|pem|crt)$/i;
const PROBE_PATH_PATTERN = /(?:^|\/)(?:wp-[a-z0-9_-]+|wordpress|phpmyadmin|pma|mysql|actuator|\.(?:env|git|npmrc|htpasswd|htaccess)|vendor|cgi-bin|eval-stdin|xmlrpc|wlwmanifest|(?:credentials|secrets|service-account|serviceAccountKey|firebase-adminsdk|config)\.json)(?:\/|$|\.)/i;

type MaliciousFlagKey = 'enablePathTraversal' | 'enableXss' | 'enableSqli';
const PAYLOAD_RULES: Array<{ flagKey: MaliciousFlagKey; label: string; regex: RegExp }> = [
  { flagKey: 'enablePathTraversal', label: 'PATH_TRAVERSAL', regex: /(?:\.\.[\/\\]|%2e%2e(?:%2f|%5c|\/|\\))/i },
  { flagKey: 'enableXss', label: 'XSS_SCRIPT', regex: /(?:<\s*script\b|javascript:|on(?:error|load|mouseover|focus)\s*=|<\s*iframe\b|<\s*svg[^>]*onload\s*=)/i },
  { flagKey: 'enableSqli', label: 'SQL_INJECTION', regex: /(?:union\s+(?:all\s+)?select\b|information_schema\b|(?:sleep|benchmark)\s*\(|waitfor\s+delay\b|xp_cmdshell\b|(?:'|%27)\s*(?:or|and)\s+(?:1=1|'1'='1'|true)\b)/i },
];

type BotFlagKey = 'blockScannerTools' | 'blockCliScrapers' | 'blockAiCrawlers' | 'blockSeoBots';
const BOT_UA_GROUPS: Array<{ flagKey: BotFlagKey; label: string; regex: RegExp }> = [
  {
    flagKey: 'blockScannerTools',
    label: 'security scanner',
    regex: /(?:sqlmap|nuclei|nikto|nessus|acunetix|masscan|zgrab|dirbuster|gobuster|ffuf|wfuzz)/i,
  },
  {
    flagKey: 'blockCliScrapers',
    label: 'CLI scraper',
    regex: /(?:python-requests|python-urllib|aiohttp|scrapy|curl\/|wget\/|go-http-client|java\/\d|libwww-perl)/i,
  },
  {
    flagKey: 'blockAiCrawlers',
    label: 'AI crawler',
    regex: /(?:gptbot|claudebot|anthropic-ai|bytespider|ccbot)/i,
  },
  {
    flagKey: 'blockSeoBots',
    label: 'SEO crawler',
    regex: /(?:ahrefsbot|semrushbot|dotbot|mj12bot)/i,
  },
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    num = (num << 8) | n;
  }
  return num >>> 0;
}

function pruneMapIfNeeded<K, V>(map: Map<K, V>) {
  if (map.size <= MAX_MAP_ENTRIES) return;
  const excess = map.size - MAX_MAP_ENTRIES + 500;
  let deleted = 0;
  for (const key of map.keys()) {
    map.delete(key);
    deleted++;
    if (deleted >= excess) break;
  }
}

export function parseIpList(raw?: string | null): string[] {
  if (!raw || typeof raw !== 'string') return [];
  return Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

export function isValidIpRule(rule: string): boolean {
  const r = rule.trim().toLowerCase();
  if (!r || r.length > 64) return false;
  // IPv4 exact
  if (ipv4ToInt(r) !== null) return true;
  // IPv4 CIDR (e.g. 185.220.101.0/24)
  const cidrMatch = r.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d{1,2})$/);
  if (cidrMatch) {
    const mask = Number(cidrMatch[2]);
    return ipv4ToInt(cidrMatch[1]) !== null && mask >= 0 && mask <= 32;
  }
  // Wildcard prefix (e.g. 185.220.101.* or 185.220.*)
  if (/^\d{1,3}(?:\.\d{1,3}){0,2}\.\*$/.test(r)) return true;
  // Basic IPv6 exact/prefix
  if (r.includes(':') && /^[0-9a-f:.*\/]+$/.test(r)) return true;
  return false;
}

export function matchesIpRule(clientIp: string | undefined, rules: string[]): boolean {
  if (!clientIp || rules.length === 0) return false;
  const ip = clientIp.trim().toLowerCase();
  if (!ip) return false;
  const ipInt = ipv4ToInt(ip);

  for (const rule of rules) {
    if (ip === rule) return true;

    if (rule.endsWith('*')) {
      const prefix = rule.slice(0, -1);
      if (prefix && ip.startsWith(prefix)) return true;
      continue;
    }

    if (rule.endsWith('.')) {
      if (ip.startsWith(rule)) return true;
      continue;
    }

    if (rule.includes('/') && ipInt !== null) {
      const [baseIp, maskStr] = rule.split('/');
      const baseInt = ipv4ToInt(baseIp);
      const prefixLen = Number(maskStr);
      if (baseInt !== null && Number.isInteger(prefixLen) && prefixLen >= 0 && prefixLen <= 32) {
        const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
        if ((ipInt & mask) === (baseInt & mask)) return true;
      }
    }
  }
  return false;
}

export class EdgeWafService {
  public static isStaticAsset(pathname: string): boolean {
    if (pathname.startsWith('/_astro/') || pathname.startsWith('/images/') || pathname.startsWith('/favicon')) {
      return true;
    }
    return STATIC_ASSET_EXT.test(pathname);
  }

  public static isBlockedProbePath(pathname: string): boolean {
    return pathname.startsWith('/.well-known/') || PROBE_PATH_EXT.test(pathname) || PROBE_PATH_PATTERN.test(pathname);
  }

  public static isAutoBanned(ip: string | undefined, now = Date.now()): boolean {
    if (!ip) return false;
    const key = ip.trim().toLowerCase();
    const record = strikeRecords.get(key);
    if (!record) return false;
    if (record.bannedUntil > now) return true;
    if (record.bannedUntil > 0 && record.bannedUntil <= now) {
      strikeRecords.delete(key);
    }
    return false;
  }

  public static recordStrike(
    ip: string | undefined,
    now = Date.now(),
    strikeLimit = AUTO_BAN_STRIKE_LIMIT,
    banDurationMs = AUTO_BAN_DURATION_MS
  ): { strikes: number; autoBanned: boolean } {
    if (!ip) return { strikes: 0, autoBanned: false };
    const key = ip.trim().toLowerCase();
    pruneMapIfNeeded(strikeRecords);
    const prev = strikeRecords.get(key);
    const strikes = (prev && prev.bannedUntil <= now ? prev.strikes : prev?.strikes || 0) + 1;
    const autoBanned = strikes >= strikeLimit;
    const bannedUntil = autoBanned ? now + banDurationMs : 0;
    strikeRecords.set(key, { strikes, bannedUntil, updatedAt: now });
    return { strikes, autoBanned };
  }

  private static maybeRecordStrike(
    ip: string,
    now: number,
    cfg: WafRuleConfig['malicious']
  ): { strikes: number; autoBanned: boolean } {
    if (!cfg.enableAutoBan) return { strikes: 0, autoBanned: false };
    return this.recordStrike(ip, now, cfg.strikeLimit, cfg.banDurationMinutes * 60_000);
  }

  public static getStrikeStats(now = Date.now()): { activeBans: number; trackedIps: number } {
    let activeBans = 0;
    for (const [ip, rec] of strikeRecords.entries()) {
      if (rec.bannedUntil > now) {
        activeBans++;
      } else if (rec.bannedUntil > 0) {
        strikeRecords.delete(ip);
      }
    }
    return { activeBans, trackedIps: strikeRecords.size };
  }

  public static clearAllStrikes(): void {
    strikeRecords.clear();
    rateLimitBuckets.clear();
  }

  private static checkStrictRateLimit(
    ip: string,
    pathname: string,
    method: string,
    now: number,
    rateCfg: WafRuleConfig['rateLimit'] = DEFAULT_WAF_RULE_CONFIG.rateLimit
  ): { limited: boolean; limit: number; bucket: string } {
    const isPublicWriteApi =
      method === 'POST' &&
      (pathname === '/api/submit-quote' || pathname === '/api/client-error' || pathname.startsWith('/api/auth/'));
    const isApi = pathname.startsWith('/api/');
    const bucketType = isPublicWriteApi ? 'pub_write' : isApi ? 'api' : 'page';
    const limit = isPublicWriteApi
      ? rateCfg.publicWriteLimit
      : isApi
        ? rateCfg.apiLimit
        : rateCfg.pageLimit;
    const windowMs = (rateCfg.windowSeconds * 1000) || RATE_LIMIT_WINDOW_MS;

    const key = `${bucketType}:${ip || 'unknown'}`;
    pruneMapIfNeeded(rateLimitBuckets);
    const existing = rateLimitBuckets.get(key);
    if (!existing || existing.resetAt <= now || existing.resetAt > now + windowMs) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return { limited: false, limit, bucket: bucketType };
    }
    existing.count += 1;
    if (existing.count > limit) {
      return { limited: true, limit, bucket: bucketType };
    }
    return { limited: false, limit, bucket: bucketType };
  }

  public static evaluate(input: WafEvaluationInput, settings?: WafSettingsSubset | null): WafEvaluationResult {
    const pathname = input.pathname || '/';
    const method = (input.method || 'GET').toUpperCase();
    const now = input.now ?? Date.now();
    const clientIp = (input.clientIp || '').trim();

    if (this.isStaticAsset(pathname)) {
      return { allowed: true };
    }

    // Never lock out the WAF management route itself
    if (pathname === '/admin/waf' || pathname === '/api/admin/waf') {
      return { allowed: true };
    }

    // Trusted IP whitelist always bypasses all WAF rules
    const allowList = parseIpList(settings?.waf_allow_ips);
    if (matchesIpRule(clientIp, allowList)) {
      return { allowed: true };
    }

    const activeModes = new Set<WafRuleMode>(
      Array.isArray(settings?.waf_active_modes) ? settings.waf_active_modes : []
    );
    if (activeModes.size === 0) {
      return { allowed: true };
    }

    const cfg = normalizeWafRuleConfig(settings?.waf_rule_config);

    // 1. Block Malicious IPs + OWASP Payloads + Configurable Strike Auto-Ban
    if (activeModes.has('block_malicious_ips')) {
      if (cfg.malicious.enableIpBlacklist) {
        const blockedList = parseIpList(settings?.waf_blocked_ips);
        if (matchesIpRule(clientIp, blockedList)) {
          return {
            allowed: false,
            status: 403,
            code: 'WAF_MALICIOUS_IP',
            mode: 'block_malicious_ips',
            reason: 'Access denied by Edge WAF IP blacklist.',
            matchedSample: clientIp,
          };
        }
      }

      if (cfg.malicious.enableAutoBan && this.isAutoBanned(clientIp, now)) {
        return {
          allowed: false,
          status: 403,
          code: 'WAF_MALICIOUS_IP',
          mode: 'block_malicious_ips',
          reason: 'IP temporarily auto-banned after repeated security violations.',
          matchedSample: clientIp,
          autoBanned: true,
        };
      }

      if (cfg.malicious.enableProbePaths && this.isBlockedProbePath(pathname)) {
        const strike = this.maybeRecordStrike(clientIp, now, cfg.malicious);
        return {
          allowed: false,
          status: 403,
          code: strike.autoBanned ? 'WAF_MALICIOUS_IP' : 'WAF_MALICIOUS_PAYLOAD',
          mode: 'block_malicious_ips',
          reason: 'Blocked vulnerability probe path.',
          matchedSample: pathname.slice(0, 120),
          autoBanned: strike.autoBanned,
        };
      }

      let decodedPath = pathname;
      try {
        decodedPath = decodeURIComponent(pathname.replace(/\+/g, ' '));
      } catch {
        // Keep raw if malformed percent-encoding
      }
      const matchedCustomPath = matchCustomKeyword(decodedPath.toLowerCase(), cfg.malicious.customBlockedPaths);
      if (matchedCustomPath) {
        const strike = this.maybeRecordStrike(clientIp, now, cfg.malicious);
        return {
          allowed: false,
          status: 403,
          code: strike.autoBanned ? 'WAF_MALICIOUS_IP' : 'WAF_MALICIOUS_PAYLOAD',
          mode: 'block_malicious_ips',
          reason: `Blocked custom path keyword (${matchedCustomPath}).`,
          matchedSample: pathname.slice(0, 120),
          autoBanned: strike.autoBanned,
        };
      }

      // Inspect path + query for SQLi / XSS / Path Traversal
      let decodedTarget = `${pathname}${input.search || ''}`;
      try {
        decodedTarget = decodeURIComponent(decodedTarget.replace(/\+/g, ' '));
      } catch {
        // Keep raw if malformed percent-encoding
      }
      for (const rule of PAYLOAD_RULES) {
        if (!cfg.malicious[rule.flagKey]) continue;
        const match = decodedTarget.match(rule.regex);
        if (match) {
          const strike = this.maybeRecordStrike(clientIp, now, cfg.malicious);
          return {
            allowed: false,
            status: 403,
            code: 'WAF_MALICIOUS_PAYLOAD',
            mode: 'block_malicious_ips',
            reason: `Blocked malicious ${rule.label} payload.`,
            matchedSample: match[0].slice(0, 120),
            autoBanned: strike.autoBanned,
          };
        }
      }
    }

    // 2. Strict Rate Limiting
    if (activeModes.has('strict_rate_limiting')) {
      const rate = this.checkStrictRateLimit(clientIp || 'unknown', pathname, method, now, cfg.rateLimit);
      if (rate.limited) {
        return {
          allowed: false,
          status: 429,
          code: 'WAF_STRICT_RATE_LIMIT',
          mode: 'strict_rate_limiting',
          reason: `Strict rate limit exceeded (${rate.limit} req/${cfg.rateLimit.windowSeconds}s for ${rate.bucket}).`,
          matchedSample: `${method} ${pathname} (${rate.limit}/${cfg.rateLimit.windowSeconds}s)`,
          retryAfter: cfg.rateLimit.windowSeconds,
        };
      }
    }

    // 3. Bot Challenge
    if (activeModes.has('bot_challenge')) {
      const hasWebhookSecret = Boolean(
        input.headers?.get('x-sanity-signature') ||
        input.headers?.get('x-webhook-secret') ||
        input.headers?.get('x-revalidate-secret')
      );
      if (!(pathname === '/api/revalidate' && hasWebhookSecret)) {
        const ua = (input.userAgent ?? input.headers?.get('user-agent') ?? '').trim();
        if (!ua) {
          if (cfg.bot.blockEmptyUa) {
            return {
              allowed: false,
              status: 403,
              code: 'WAF_BOT_CHALLENGE',
              mode: 'bot_challenge',
              reason: 'Missing User-Agent header blocked by Bot Challenge.',
              matchedSample: '(empty user-agent)',
            };
          }
        } else {
          for (const group of BOT_UA_GROUPS) {
            if (!cfg.bot[group.flagKey]) continue;
            if (group.regex.test(ua)) {
              return {
                allowed: false,
                status: 403,
                code: 'WAF_BOT_CHALLENGE',
                mode: 'bot_challenge',
                reason: `Automated ${group.label} blocked by Bot Challenge.`,
                matchedSample: ua.slice(0, 120),
              };
            }
          }
          const matchedCustomUa = matchCustomKeyword(ua.toLowerCase(), cfg.bot.customBlockedUa);
          if (matchedCustomUa) {
            return {
              allowed: false,
              status: 403,
              code: 'WAF_BOT_CHALLENGE',
              mode: 'bot_challenge',
              reason: `Custom User-Agent rule (${matchedCustomUa}) blocked by Bot Challenge.`,
              matchedSample: ua.slice(0, 120),
            };
          }
        }

        if (cfg.bot.enforceQuoteFingerprint && method === 'POST' && pathname === '/api/submit-quote' && input.headers) {
          const hasAcceptLang = Boolean(input.headers.get('accept-language'));
          const hasBrowserFetchMeta = Boolean(
            input.headers.get('sec-fetch-site') || input.headers.get('sec-ch-ua')
          );
          const hasTurnstileHeader = Boolean(input.headers.get('cf-turnstile-response'));
          if (!hasAcceptLang && !hasBrowserFetchMeta && !hasTurnstileHeader) {
            return {
              allowed: false,
              status: 403,
              code: 'WAF_BOT_CHALLENGE',
              mode: 'bot_challenge',
              reason: 'Missing browser fingerprint headers on sensitive submission.',
              matchedSample: 'missing accept-language & sec-fetch-*',
            };
          }
        }
      }
    }

    return { allowed: true };
  }
}
