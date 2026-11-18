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
  country?: string;
  headers?: Headers;
  now?: number;
  isAuthenticatedAdmin?: boolean;
  dryRun?: boolean;
}

export interface WafBlockStats {
  hitCount: number;
  lastHitAt: number;
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
  suppressLog?: boolean;
  blockStats?: WafBlockStats;
}

export type WafConditionField =
  | 'path_matches'
  | 'header_contains'
  | 'query_contains'
  | 'ua_contains'
  | 'ip_matches'
  | 'country_equals';

export type WafConditionOperator = 'contains' | 'starts_with' | 'equals' | 'not_contains' | 'not_equals';
export type WafConditionAction = 'block_403' | 'rate_limit_429';

export interface WafCustomConditionRule {
  id: string;
  enabled: boolean;
  field: WafConditionField;
  operator: WafConditionOperator;
  headerName?: string;
  value: string;
  action: WafConditionAction;
  limit?: number;
  note?: string;
}

export interface WafRuleConfig {
  malicious: {
    enableIpBlacklist: boolean;
    enableAutoBan: boolean;
    autoBanOnRateAbuse: boolean;
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
    blockUaRotation: boolean;
    enforceQuoteFingerprint: boolean;
    customBlockedUa: string;
  };
  customRules: WafCustomConditionRule[];
}

export const DEFAULT_WAF_RULE_CONFIG: WafRuleConfig = {
  malicious: {
    enableIpBlacklist: true,
    enableAutoBan: true,
    autoBanOnRateAbuse: true,
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
    blockUaRotation: true,
    enforceQuoteFingerprint: true,
    customBlockedUa: '',
  },
  customRules: [],
};

export const WAF_CONDITION_CATALOG = {
  block_malicious_ips: [
    {
      key: 'enableIpBlacklist',
      label: 'IP / CIDR Blacklist Match',
      fieldExpr: 'If Client IP',
      operatorExpr: 'matches ACL',
      condition: 'waf_blocked_ips (Exact IPv4/v6, Wildcard 185.220.*, CIDR /24)',
      actionLabel: '403 Block',
      actionTone: 'err',
    },
    {
      key: 'enableProbePaths',
      label: 'Vulnerability Probe Paths',
      fieldExpr: 'If Path',
      operatorExpr: 'matches regex',
      condition: '/.env, /.git, /wp-*, /phpmyadmin, /actuator, /cgi-bin, /xmlrpc, *.php, *.asp, *.jsp, *.sql, *.bak, *.pem',
      actionLabel: '403 Block',
      actionTone: 'err',
    },
    {
      key: 'enableSqli',
      label: 'OWASP SQL Injection (SQLi)',
      fieldExpr: 'If Path + Query',
      operatorExpr: 'matches OWASP',
      condition: 'UNION [ALL] SELECT, information_schema, sleep(), benchmark(), waitfor delay, xp_cmdshell, OR 1=1',
      actionLabel: '403 Block',
      actionTone: 'err',
    },
    {
      key: 'enableXss',
      label: 'OWASP Cross-Site Scripting (XSS)',
      fieldExpr: 'If Path + Query',
      operatorExpr: 'matches OWASP',
      condition: '<script, javascript:, onerror=, onload=, onmouseover=, <iframe, <svg onload=',
      actionLabel: '403 Block',
      actionTone: 'err',
    },
    {
      key: 'enablePathTraversal',
      label: 'Directory Traversal (LFI)',
      fieldExpr: 'If Path + Query',
      operatorExpr: 'matches OWASP',
      condition: '../, ..\\, %2e%2e%2f, %2e%2e/',
      actionLabel: '403 Block',
      actionTone: 'err',
    },
    {
      key: 'enableAutoBan',
      label: 'Dynamic Strike Auto-Ban',
      fieldExpr: 'If Strike Count',
      operatorExpr: '>= threshold',
      condition: '3 strikes → auto-ban IP for 15m',
      actionLabel: '403 Auto-Ban',
      actionTone: 'err',
    },
    {
      key: 'autoBanOnRateAbuse',
      label: 'Rate-Limit Flood Auto-Ban Escalation',
      fieldExpr: 'If 429 Excess',
      operatorExpr: '>= +10 hits',
      condition: 'ignores 429 throttling repeatedly → +1 strike toward Auto-Ban',
      actionLabel: '403 Auto-Ban',
      actionTone: 'err',
    },
  ],
  strict_rate_limiting: [
    {
      key: 'publicWriteLimit',
      label: 'Public Write / Auth Endpoints',
      fieldExpr: 'If Route',
      operatorExpr: 'matches',
      condition: 'POST /api/submit-quote, POST /api/client-error, POST /api/auth/*',
      actionLabel: '429 Throttle',
      actionTone: 'warn',
    },
    {
      key: 'apiLimit',
      label: 'Standard API Endpoints',
      fieldExpr: 'If Route',
      operatorExpr: 'starts with',
      condition: '/api/* (excludes /api/admin/waf)',
      actionLabel: '429 Throttle',
      actionTone: 'warn',
    },
    {
      key: 'pageLimit',
      label: 'SSR Storefront & Dynamic Pages',
      fieldExpr: 'If Document Route',
      operatorExpr: 'excludes',
      condition: 'static assets (/_astro/*, *.css, *.js, images)',
      actionLabel: '429 Throttle',
      actionTone: 'warn',
    },
  ],
  bot_challenge: [
    {
      key: 'blockEmptyUa',
      label: 'Empty User-Agent Header',
      fieldExpr: 'If User-Agent',
      operatorExpr: 'is empty',
      condition: 'missing or empty User-Agent header',
      actionLabel: '403 Block',
      actionTone: 'info',
    },
    {
      key: 'blockScannerTools',
      label: 'Security & Vulnerability Scanners',
      fieldExpr: 'If User-Agent',
      operatorExpr: 'matches regex',
      condition: 'sqlmap, nuclei, nikto, nessus, acunetix, masscan, zgrab, dirbuster, gobuster, ffuf, wfuzz',
      actionLabel: '403 Block',
      actionTone: 'info',
    },
    {
      key: 'blockCliScrapers',
      label: 'Automated CLI & Script Scrapers',
      fieldExpr: 'If User-Agent',
      operatorExpr: 'matches regex',
      condition: 'curl/, wget/, python-requests, python-urllib, aiohttp, scrapy, go-http-client, java/, libwww-perl',
      actionLabel: '403 Block',
      actionTone: 'info',
    },
    {
      key: 'blockAiCrawlers',
      label: 'AI Training & LLM Crawlers',
      fieldExpr: 'If User-Agent',
      operatorExpr: 'matches regex',
      condition: 'GPTBot, OAI-SearchBot, ClaudeBot, Bytespider, Qwenbot, ChatGLM-Spider, DeepSeekBot, Hunyuan, GrokBot, Meta-ExternalAgent, CCBot',
      actionLabel: '403 Block',
      actionTone: 'info',
    },
    {
      key: 'blockSeoBots',
      label: 'Commercial SEO Backlink Crawlers',
      fieldExpr: 'If User-Agent',
      operatorExpr: 'matches regex',
      condition: 'AhrefsBot, SemrushBot, DotBot, MJ12bot',
      actionLabel: '403 Block',
      actionTone: 'info',
    },
    {
      key: 'blockUaRotation',
      label: 'Spoofed Bot UA Rotation',
      fieldExpr: 'If User-Agent',
      operatorExpr: 'rotates >=3 bots',
      condition: 'same IP impersonates >=3 crawler vendors in 10m (triggers Strike)',
      actionLabel: '403 Auto-Ban',
      actionTone: 'err',
    },
    {
      key: 'enforceQuoteFingerprint',
      label: 'RFQ Submission Browser Fingerprint',
      fieldExpr: 'If Request Header',
      operatorExpr: 'missing on POST',
      condition: '/api/submit-quote lacking Accept-Language, Sec-Fetch-Site/Sec-CH-UA, or CF-Turnstile-Response',
      actionLabel: '403 Challenge',
      actionTone: 'info',
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

const VALID_CONDITION_FIELDS = new Set<WafConditionField>([
  'path_matches',
  'header_contains',
  'query_contains',
  'ua_contains',
  'ip_matches',
  'country_equals',
]);
const VALID_CONDITION_OPERATORS = new Set<WafConditionOperator>([
  'contains',
  'starts_with',
  'equals',
  'not_contains',
  'not_equals',
]);
const VALID_CONDITION_ACTIONS = new Set<WafConditionAction>(['block_403', 'rate_limit_429']);

function sanitizeHeaderName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 64);
  return cleaned || undefined;
}

export function normalizeCustomRules(raw: unknown): WafCustomConditionRule[] {
  if (!Array.isArray(raw)) return [];
  const out: WafCustomConditionRule[] = [];
  for (let i = 0; i < raw.length && out.length < 50; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object') continue;
    const field = VALID_CONDITION_FIELDS.has(item.field) ? (item.field as WafConditionField) : null;
    if (!field) continue;
    const operator: WafConditionOperator = VALID_CONDITION_OPERATORS.has(item.operator)
      ? item.operator
      : field === 'country_equals'
        ? 'equals'
        : 'contains';
    const action: WafConditionAction = VALID_CONDITION_ACTIONS.has(item.action)
      ? item.action
      : 'block_403';

    let headerName = field === 'header_contains' ? sanitizeHeaderName(item.headerName) : undefined;
    let value = typeof item.value === 'string' ? item.value.trim().slice(0, 200) : '';
    if (field === 'header_contains' && !headerName && value.includes(':')) {
      const colonIdx = value.indexOf(':');
      const prefix = sanitizeHeaderName(value.slice(0, colonIdx));
      const rest = value.slice(colonIdx + 1).trim();
      if (prefix && rest) {
        headerName = prefix;
        value = rest;
      }
    }
    if (!value) continue;

    const id = typeof item.id === 'string' && item.id.trim()
      ? item.id.trim().slice(0, 64)
      : `cr_${out.length + 1}`;
    const note = typeof item.note === 'string' && item.note.trim() ? item.note.trim().slice(0, 120) : undefined;
    const parsedLimit = action === 'rate_limit_429' && item.limit !== undefined && item.limit !== null && item.limit !== ''
      ? clampInt(item.limit, 20, 1, 5000)
      : undefined;

    out.push({
      id,
      enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
      field,
      operator,
      ...(headerName ? { headerName } : {}),
      value,
      action,
      ...(parsedLimit !== undefined ? { limit: parsedLimit } : {}),
      ...(note ? { note } : {}),
    });
  }
  return out;
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
      autoBanOnRateAbuse: toBool(m.autoBanOnRateAbuse, d.malicious.autoBanOnRateAbuse),
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
      blockUaRotation: toBool(b.blockUaRotation, d.bot.blockUaRotation),
      enforceQuoteFingerprint: toBool(b.enforceQuoteFingerprint, d.bot.enforceQuoteFingerprint),
      customBlockedUa: typeof b.customBlockedUa === 'string' ? b.customBlockedUa.trim().slice(0, 2000) : '',
    },
    customRules: normalizeCustomRules(obj?.customRules),
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
const UA_ROTATION_WINDOW_MS = 10 * 60_000;
const UA_ROTATION_VENDOR_THRESHOLD = 3;
const DEFAULT_LOG_SUPPRESS_MS = 60 * 60_000;
const MAX_MAP_ENTRIES = 5000;

const strikeRecords = new Map<string, { strikes: number; bannedUntil: number; updatedAt: number }>();
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
const uaRotationRecords = new Map<string, { vendors: Set<string>; resetAt: number }>();
const blockLogSuppressions = new Map<
  string,
  { ip: string; suppressedUntil: number; hitCount: number; lastHitAt: number }
>();

const STATIC_ASSET_EXT = /\.(?:css|js|mjs|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|eot|map|txt|xml)$/i;
const ALLOWED_WELL_KNOWN = /^\/\.well-known\/(?:acme-challenge\/|pki-validation\/|security\.txt$|assetlinks\.json$|apple-app-site-association$|apple-developer-merchantid-domain-association$)/i;
const SAFE_AUTH_PATHS = new Set([
  '/admin/login',
  '/admin/waf',
  '/api/admin/waf',
  '/api/auth/login',
  '/api/auth/callback',
  '/api/auth/logout',
  '/api/auth/session',
]);

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
    regex: /(?:gptbot|oai-searchbot|chatgpt-user|claudebot|claude-searchbot|claude-user|anthropic-ai|bytespider|ccbot|qwenbot|chatglm-spider|deepseekbot|hunyuan|moonshotbot|kimi-searchbot|grokbot|cohere-ai|meta-external|meta-webindexer)/i,
  },
  {
    flagKey: 'blockSeoBots',
    label: 'SEO crawler',
    regex: /(?:ahrefsbot|semrushbot|dotbot|mj12bot)/i,
  },
];

const BOT_VENDOR_MATCHERS: Array<[string, RegExp]> = [
  ['google', /googlebot|google-inspectiontool/i],
  ['bing', /bingbot|msnbot|adidxbot/i],
  ['baidu', /baiduspider/i],
  ['yandex', /yandexbot/i],
  ['duckduckgo', /duckduckbot|duckassistbot/i],
  ['apple', /applebot/i],
  ['openai', /gptbot|chatgpt-user|oai-searchbot|oai-adsbot/i],
  ['anthropic', /claudebot|claude-searchbot|claude-user|anthropic-ai/i],
  ['meta', /meta-external|meta-webindexer|facebookexternalhit/i],
  ['bytedance', /bytespider/i],
  ['alibaba', /qwenbot/i],
  ['zhipu', /chatglm-spider/i],
  ['tencent', /hunyuan/i],
  ['moonshot', /moonshotbot|kimibot|kimi-searchbot/i],
  ['deepseek', /deepseekbot/i],
  ['xai', /grokbot/i],
  ['cohere', /cohere-ai/i],
  ['amazon', /amazonbot/i],
  ['perplexity', /perplexitybot|perplexity-user/i],
  ['brave', /bravebot/i],
  ['ccbot', /\bccbot\b/i],
  ['ahrefs', /ahrefsbot/i],
  ['semrush', /semrushbot/i],
  ['dotbot', /dotbot/i],
  ['mj12', /mj12bot/i],
];

function detectBotVendor(ua: string): string | null {
  for (const [vendor, regex] of BOT_VENDOR_MATCHERS) {
    if (regex.test(ua)) return vendor;
  }
  return null;
}

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
    if (ALLOWED_WELL_KNOWN.test(pathname)) {
      return false;
    }
    return pathname.startsWith('/.well-known/') || PROBE_PATH_EXT.test(pathname) || PROBE_PATH_PATTERN.test(pathname);
  }

  public static isAntiLockoutPath(pathname: string): boolean {
    return SAFE_AUTH_PATHS.has(pathname);
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
    cfg: WafRuleConfig['malicious'],
    dryRun = false
  ): { strikes: number; autoBanned: boolean } {
    if (!cfg.enableAutoBan) return { strikes: 0, autoBanned: false };
    if (dryRun) {
      const key = ip.trim().toLowerCase();
      const prev = key ? strikeRecords.get(key) : undefined;
      const strikes = (prev && prev.bannedUntil <= now ? prev.strikes : prev?.strikes || 0) + 1;
      return { strikes, autoBanned: strikes >= cfg.strikeLimit };
    }
    return this.recordStrike(ip, now, cfg.strikeLimit, cfg.banDurationMinutes * 60_000);
  }

  public static getActiveBans(now = Date.now()): Array<{ ip: string; strikes: number; remainingMinutes: number; bannedUntil: number }> {
    const bans: Array<{ ip: string; strikes: number; remainingMinutes: number; bannedUntil: number }> = [];
    for (const [ip, rec] of strikeRecords.entries()) {
      if (rec.bannedUntil > now) {
        bans.push({
          ip,
          strikes: rec.strikes,
          remainingMinutes: Math.max(1, Math.ceil((rec.bannedUntil - now) / 60_000)),
          bannedUntil: rec.bannedUntil,
        });
      } else if (rec.bannedUntil > 0) {
        strikeRecords.delete(ip);
      }
    }
    return bans.sort((a, b) => b.bannedUntil - a.bannedUntil);
  }

  public static unbanIp(ip: string | undefined): boolean {
    if (!ip || typeof ip !== 'string') return false;
    const key = ip.trim().toLowerCase();
    if (!key) return false;
    const deleted = strikeRecords.delete(key);
    uaRotationRecords.delete(key);
    this.clearLogSuppressions(key);
    return deleted;
  }

  public static getStrikeStats(now = Date.now()): { activeBans: number; trackedIps: number } {
    const bans = this.getActiveBans(now);
    return { activeBans: bans.length, trackedIps: strikeRecords.size };
  }

  public static clearLogSuppressions(ip?: string, codeFilter?: WafBlockCode): void {
    if (!ip && !codeFilter) {
      blockLogSuppressions.clear();
      return;
    }
    const targetIp = ip ? ip.trim().toLowerCase() : null;
    for (const [k, rec] of blockLogSuppressions.entries()) {
      if (targetIp && rec.ip !== targetIp) continue;
      if (codeFilter && !k.includes(`:${codeFilter}:`)) continue;
      blockLogSuppressions.delete(k);
    }
  }

  public static clearAllStrikes(): void {
    strikeRecords.clear();
    rateLimitBuckets.clear();
    uaRotationRecords.clear();
    blockLogSuppressions.clear();
  }

  private static trackUaVendorRotation(
    ip: string,
    vendor: string,
    now: number,
    dryRun = false
  ): { rotating: boolean; vendorList: string[] } {
    const key = ip.trim().toLowerCase();
    if (!key) return { rotating: false, vendorList: [] };
    const existing = uaRotationRecords.get(key);
    if (dryRun) {
      const vendors = new Set<string>(existing && existing.resetAt > now ? existing.vendors : []);
      vendors.add(vendor);
      return {
        rotating: vendors.size >= UA_ROTATION_VENDOR_THRESHOLD,
        vendorList: Array.from(vendors),
      };
    }
    pruneMapIfNeeded(uaRotationRecords);
    let rec = existing;
    if (!rec || rec.resetAt <= now) {
      rec = { vendors: new Set<string>(), resetAt: now + UA_ROTATION_WINDOW_MS };
      uaRotationRecords.set(key, rec);
    }
    rec.vendors.add(vendor);
    return {
      rotating: rec.vendors.size >= UA_ROTATION_VENDOR_THRESHOLD,
      vendorList: Array.from(rec.vendors),
    };
  }

  private static consumeRateLimitBucket(
    key: string,
    limit: number,
    windowSeconds: number,
    now: number,
    dryRun = false
  ): { limited: boolean; excess: number } {
    const windowMs = (windowSeconds * 1000) || RATE_LIMIT_WINDOW_MS;
    if (dryRun) {
      const existing = rateLimitBuckets.get(key);
      if (!existing || existing.resetAt <= now || existing.resetAt > now + windowMs) {
        return { limited: 1 > limit, excess: Math.max(0, 1 - limit) };
      }
      const next = existing.count + 1;
      return { limited: next > limit, excess: Math.max(0, next - limit) };
    }
    pruneMapIfNeeded(rateLimitBuckets);
    const existing = rateLimitBuckets.get(key);
    if (!existing || existing.resetAt <= now || existing.resetAt > now + windowMs) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return { limited: false, excess: 0 };
    }
    existing.count += 1;
    return { limited: existing.count > limit, excess: Math.max(0, existing.count - limit) };
  }

  private static decodeSafe(raw: string): string {
    if (!raw) return '';
    let current = raw;
    for (let i = 0; i < 2; i++) {
      try {
        const next = decodeURIComponent(current.replace(/\+/g, ' '));
        if (next === current) break;
        current = next;
        if (!/%[0-9a-f]{2}/i.test(current)) break;
      } catch {
        break;
      }
    }
    return current;
  }

  private static matchConditionValue(
    haystackRaw: string,
    needleRaw: string,
    operator: WafConditionOperator
  ): boolean {
    const haystack = haystackRaw.toLowerCase();
    const needle = needleRaw.toLowerCase();
    if (!needle) return false;
    if (operator === 'equals') return haystack === needle;
    if (operator === 'not_equals') return haystack !== needle;
    if (operator === 'starts_with') return haystack.startsWith(needle);
    if (operator === 'not_contains') return !haystack.includes(needle);
    return haystack.includes(needle);
  }

  private static formatConditionSummary(rule: WafCustomConditionRule): string {
    const fieldNames: Record<WafConditionField, string> = {
      path_matches: 'Path',
      header_contains: rule.headerName ? `Request Header [${rule.headerName}]` : 'Request Header',
      query_contains: 'Query String',
      ua_contains: 'User-Agent',
      ip_matches: 'Client IP',
      country_equals: 'Country Code',
    };
    return `If ${fieldNames[rule.field]} ${rule.operator.replace('_', ' ')} "${rule.value}"`;
  }

  public static evaluateCustomRules(
    input: WafEvaluationInput,
    rules: WafCustomConditionRule[],
    rateCfg: WafRuleConfig['rateLimit'] = DEFAULT_WAF_RULE_CONFIG.rateLimit,
    now = input.now ?? Date.now()
  ): WafEvaluationResult | null {
    if (!Array.isArray(rules) || rules.length === 0) return null;

    const pathname = this.decodeSafe(input.pathname || '/');
    const search = this.decodeSafe(input.search || '');
    const clientIp = (input.clientIp || '').trim();
    const ua = (input.userAgent ?? input.headers?.get('user-agent') ?? '').trim();
    const country = (input.country ?? input.headers?.get('cf-ipcountry') ?? '').trim();

    for (const rule of rules) {
      if (!rule?.enabled || !rule.value) continue;

      let matched = false;
      let sample = rule.value;
      const isNegated = rule.operator === 'not_contains' || rule.operator === 'not_equals';

      if (rule.field === 'path_matches') {
        matched = this.matchConditionValue(pathname, rule.value, rule.operator);
        if (matched) sample = pathname.slice(0, 120);
      } else if (rule.field === 'query_contains') {
        matched = this.matchConditionValue(search, rule.value, rule.operator);
        if (matched) sample = (search || '(empty)').slice(0, 120);
      } else if (rule.field === 'ua_contains') {
        matched = (Boolean(ua) || isNegated) && this.matchConditionValue(ua, rule.value, rule.operator);
        if (matched) sample = (ua || '(empty)').slice(0, 120);
      } else if (rule.field === 'country_equals') {
        matched = (Boolean(country) || isNegated) && this.matchConditionValue(country, rule.value, rule.operator);
        if (matched) sample = country || '(unknown)';
      } else if (rule.field === 'ip_matches') {
        if (rule.operator === 'not_equals') {
          matched = !matchesIpRule(clientIp, [rule.value.toLowerCase()]);
        } else if (rule.operator === 'not_contains') {
          matched = this.matchConditionValue(clientIp, rule.value, 'not_contains');
        } else if (rule.operator === 'equals' || rule.value.includes('*') || rule.value.includes('/')) {
          matched = matchesIpRule(clientIp, [rule.value.toLowerCase()]);
        } else {
          matched = Boolean(clientIp) && this.matchConditionValue(clientIp, rule.value, rule.operator);
        }
        if (matched) sample = clientIp || '(unknown)';
      } else if (rule.field === 'header_contains') {
        if (rule.headerName) {
          const val = (input.headers?.get(rule.headerName) ?? (rule.headerName === 'user-agent' ? ua : '') ?? '').trim();
          if ((Boolean(val) || isNegated) && this.matchConditionValue(val, rule.value, rule.operator)) {
            matched = true;
            sample = `${rule.headerName}: ${val || '(missing)'}`.slice(0, 120);
          }
        } else if (input.headers) {
          if (isNegated) {
            const positiveOp = rule.operator === 'not_equals' ? 'equals' : 'contains';
            let anyMatched = false;
            for (const hdrVal of input.headers.values()) {
              if (this.matchConditionValue(hdrVal, rule.value, positiveOp)) {
                anyMatched = true;
                break;
              }
            }
            if (!anyMatched) {
              matched = true;
              sample = `(no header matches "${rule.value}")`;
            }
          } else {
            for (const [hdrKey, hdrVal] of input.headers.entries()) {
              if (this.matchConditionValue(hdrVal, rule.value, rule.operator)) {
                matched = true;
                sample = `${hdrKey}: ${hdrVal}`.slice(0, 120);
                break;
              }
            }
          }
        }
      }

      if (!matched) continue;

      const summary = this.formatConditionSummary(rule);
      if (rule.action === 'rate_limit_429') {
        const ruleLimit = rule.limit ?? rateCfg.publicWriteLimit;
        const { limited } = this.consumeRateLimitBucket(
          `custom:${rule.id}:${clientIp || 'unknown'}`,
          ruleLimit,
          rateCfg.windowSeconds,
          now,
          Boolean(input.dryRun)
        );
        if (!limited) continue;
        return {
          allowed: false,
          status: 429,
          code: 'WAF_STRICT_RATE_LIMIT',
          mode: 'strict_rate_limiting',
          reason: `Custom Rule (${summary}) rate limit exceeded (${ruleLimit} req/${rateCfg.windowSeconds}s).`,
          matchedSample: `${summary} → ${sample}`.slice(0, 160),
          retryAfter: rateCfg.windowSeconds,
        };
      }

      return {
        allowed: false,
        status: 403,
        code: rule.field === 'ua_contains' ? 'WAF_BOT_CHALLENGE' : rule.field === 'ip_matches' ? 'WAF_MALICIOUS_IP' : 'WAF_MALICIOUS_PAYLOAD',
        mode: rule.field === 'ua_contains' ? 'bot_challenge' : 'block_malicious_ips',
        reason: `Blocked by Custom Rule: ${summary}.`,
        matchedSample: `${summary} → ${sample}`.slice(0, 160),
      };
    }

    return null;
  }

  private static checkStrictRateLimit(
    ip: string,
    pathname: string,
    method: string,
    now: number,
    rateCfg: WafRuleConfig['rateLimit'] = DEFAULT_WAF_RULE_CONFIG.rateLimit,
    dryRun = false
  ): { limited: boolean; excess: number; limit: number; bucket: string } {
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

    const { limited, excess } = this.consumeRateLimitBucket(`${bucketType}:${ip || 'unknown'}`, limit, rateCfg.windowSeconds, now, dryRun);
    return { limited, excess, limit, bucket: bucketType };
  }

  public static evaluate(input: WafEvaluationInput, settings?: WafSettingsSubset | null): WafEvaluationResult {
    const pathname = input.pathname || '/';
    const now = input.now ?? Date.now();
    const res = this.evaluateCore(input, settings, now);
    if (input.dryRun) return res;

    const ipKey = (input.clientIp || '').trim().toLowerCase();

    if (res.allowed) {
      if (ipKey && !this.isStaticAsset(pathname) && !this.isAntiLockoutPath(pathname)) {
        const allowList = parseIpList(settings?.waf_allow_ips);
        const cfg = normalizeWafRuleConfig(settings?.waf_rule_config);
        const activeModes = Array.isArray(settings?.waf_active_modes) ? settings.waf_active_modes : [];
        const isStandby = activeModes.length === 0 && !cfg.customRules.some((r) => r.enabled);

        if (input.isAuthenticatedAdmin || isStandby || matchesIpRule(ipKey, allowList)) {
          this.clearLogSuppressions(ipKey);
        } else {
          // Clear IP blacklist/auto-ban suppression only once IP is no longer blocked by IP rules
          const blockedList = parseIpList(settings?.waf_blocked_ips);
          if (!this.isAutoBanned(ipKey, now) && (!cfg.malicious.enableIpBlacklist || !matchesIpRule(ipKey, blockedList))) {
            this.clearLogSuppressions(ipKey, 'WAF_MALICIOUS_IP');
          }
        }
      }
      return res;
    }

    const stage = res.autoBanned ? 'ban' : 'hit';
    const suppressKey = `${ipKey || 'unknown'}:${res.code || 'WAF'}:${stage}`;
    const existing = blockLogSuppressions.get(suppressKey);
    if (existing && existing.suppressedUntil > now) {
      existing.hitCount += 1;
      existing.lastHitAt = now;
      return {
        ...res,
        suppressLog: true,
        blockStats: {
          hitCount: existing.hitCount,
          lastHitAt: now,
        },
      };
    }

    let suppressedUntil = now + DEFAULT_LOG_SUPPRESS_MS;
    if (res.autoBanned && ipKey) {
      suppressedUntil = strikeRecords.get(ipKey)?.bannedUntil || (now + AUTO_BAN_DURATION_MS);
    } else if (res.code === 'WAF_STRICT_RATE_LIMIT') {
      suppressedUntil = now + ((res.retryAfter || 60) * 1000);
    }
    pruneMapIfNeeded(blockLogSuppressions);
    const entry = {
      ip: ipKey || 'unknown',
      suppressedUntil,
      hitCount: 1,
      lastHitAt: now,
    };
    blockLogSuppressions.set(suppressKey, entry);
    return {
      ...res,
      blockStats: {
        hitCount: entry.hitCount,
        lastHitAt: entry.lastHitAt,
      },
    };
  }

  private static evaluateCore(input: WafEvaluationInput, settings: WafSettingsSubset | null | undefined, now: number): WafEvaluationResult {
    const pathname = input.pathname || '/';
    const method = (input.method || 'GET').toUpperCase();
    const clientIp = (input.clientIp || '').trim();
    const dryRun = Boolean(input.dryRun);

    if (this.isStaticAsset(pathname)) {
      return { allowed: true };
    }

    // Never lock out WAF management, OIDC auth callback/login/logout, or authenticated admins
    if (this.isAntiLockoutPath(pathname) || input.isAuthenticatedAdmin) {
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
    const cfg = normalizeWafRuleConfig(settings?.waf_rule_config);
    const hasCustomRules = cfg.customRules.some((r) => r.enabled);
    if (activeModes.size === 0 && !hasCustomRules) {
      return { allowed: true };
    }

    // 0. Custom Visual Logical Condition Rules
    if (hasCustomRules) {
      const customResult = this.evaluateCustomRules(input, cfg.customRules, cfg.rateLimit, now);
      if (customResult) return customResult;
    }

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
        const strike = this.maybeRecordStrike(clientIp, now, cfg.malicious, dryRun);
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

      const decodedPath = this.decodeSafe(pathname);
      const matchedCustomPath = matchCustomKeyword(decodedPath.toLowerCase(), cfg.malicious.customBlockedPaths);
      if (matchedCustomPath) {
        const strike = this.maybeRecordStrike(clientIp, now, cfg.malicious, dryRun);
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

      // Inspect multi-pass decoded URL target + high-risk headers for SQLi / XSS / Path Traversal
      const decodedTarget = this.decodeSafe(`${pathname}${input.search || ''}`);
      const headerTargets: string[] = [];
      for (const hdr of ['referer', 'user-agent', 'x-forwarded-host']) {
        const val = hdr === 'user-agent'
          ? (input.userAgent ?? input.headers?.get('user-agent') ?? '')
          : (input.headers?.get(hdr) || '');
        if (val) headerTargets.push(this.decodeSafe(val));
      }
      const inspectTargets = [decodedTarget, ...headerTargets];

      for (const rule of PAYLOAD_RULES) {
        if (!cfg.malicious[rule.flagKey]) continue;
        for (const target of inspectTargets) {
          const match = target.match(rule.regex);
          if (match) {
            const strike = this.maybeRecordStrike(clientIp, now, cfg.malicious, dryRun);
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
    }

    // 2. Strict Rate Limiting (+ persistent 429 abuse strike escalation)
    if (activeModes.has('strict_rate_limiting')) {
      const rate = this.checkStrictRateLimit(clientIp || 'unknown', pathname, method, now, cfg.rateLimit, dryRun);
      if (rate.limited) {
        if (
          activeModes.has('block_malicious_ips') &&
          cfg.malicious.enableAutoBan &&
          cfg.malicious.autoBanOnRateAbuse &&
          rate.excess >= 10 &&
          rate.excess % 10 === 0
        ) {
          const strike = this.maybeRecordStrike(clientIp, now, cfg.malicious, dryRun);
          if (strike.autoBanned) {
            return {
              allowed: false,
              status: 403,
              code: 'WAF_MALICIOUS_IP',
              mode: 'block_malicious_ips',
              reason: `Auto-banned after ignoring ${rate.limit} req/${cfg.rateLimit.windowSeconds}s rate limit repeatedly.`,
              matchedSample: `${method} ${pathname} (+${rate.excess} excess 429s)`,
              autoBanned: true,
            };
          }
        }
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
          if (cfg.bot.blockUaRotation && clientIp) {
            const botVendor = detectBotVendor(ua);
            if (botVendor) {
              const rotation = this.trackUaVendorRotation(clientIp, botVendor, now, dryRun);
              if (rotation.rotating) {
                const strike = activeModes.has('block_malicious_ips')
                  ? this.maybeRecordStrike(clientIp, now, cfg.malicious, dryRun)
                  : { strikes: 0, autoBanned: false };
                return {
                  allowed: false,
                  status: 403,
                  code: strike.autoBanned ? 'WAF_MALICIOUS_IP' : 'WAF_BOT_CHALLENGE',
                  mode: strike.autoBanned ? 'block_malicious_ips' : 'bot_challenge',
                  reason: `Spoofed bot User-Agent rotation detected (${rotation.vendorList.slice(0, 5).join(', ')}).`,
                  matchedSample: `${botVendor}: ${ua}`.slice(0, 120),
                  autoBanned: strike.autoBanned,
                };
              }
            }
          }
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
