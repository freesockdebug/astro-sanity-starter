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

export interface WafShadowMatch {
  ruleId: string;
  ruleName: string;
  code: WafBlockCode;
  mode: WafRuleMode;
  reason: string;
  matchedSample: string;
}

export interface WafEvaluationResult {
  allowed: boolean;
  status?: 403 | 429;
  code?: WafBlockCode;
  mode?: WafRuleMode;
  ruleId?: string;
  reason?: string;
  matchedSample?: string;
  retryAfter?: number;
  autoBanned?: boolean;
  suppressLog?: boolean;
  blockStats?: WafBlockStats;
  shadowMatch?: WafShadowMatch;
}

export type WafDynamicField =
  | 'path'
  | 'query'
  | 'path_and_query'
  | 'payload_targets'
  | 'header'
  | 'ua'
  | 'method'
  | 'ip'
  | 'country'
  | 'bot_vendor';

export type WafDynamicOperator =
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'not_starts_with'
  | 'equals'
  | 'not_equals'
  | 'regex'
  | 'in_list'
  | 'is_empty'
  | 'is_true';

export type WafDynamicAction = 'allow' | 'block_403' | 'rate_limit_429' | 'challenge_fingerprint' | 'log_only';

export type WafRuleCategory = 'malicious' | 'rate_limit' | 'bot' | 'custom';

export interface WafRuleCondition {
  field: WafDynamicField;
  op: WafDynamicOperator;
  headerName?: string;
  value: string;
}

export interface WafRuleRateLimit {
  limit?: number;
  window_s?: number;
  key_by?: 'ip' | 'ip_and_path';
  bucket_prefix?: string;
}

export interface WafDbRule {
  id: string;
  category: WafRuleCategory;
  name: string;
  is_system: number;
  is_enabled: number;
  priority: number;
  conditions_json: string;
  match_mode: 'ALL' | 'ANY';
  action: WafDynamicAction;
  rate_limit_json: string;
  strike_weight: number;
  expires_at: string | null;
  updated_by?: string;
  updated_at?: string;
}

export interface WafDbIpAcl {
  ip_cidr: string;
  list_type: 'WHITELIST' | 'BLACKLIST' | 'AUTO_BAN';
  reason: string;
  expires_at: string | null;
  created_by?: string;
  created_at?: string;
}

export interface WafRuntimeData {
  rules: WafDbRule[];
  ipAcl: WafDbIpAcl[];
}

export interface CompiledIpAclList {
  exact: Set<string>;
  prefixes: string[];
  cidrs: Array<{ netInt: number; maskInt: number; expiresAtMs: number | null; raw: string; reason: string }>;
  timedExact: Array<{ ip: string; expiresAtMs: number | null; reason: string }>;
  timedPrefixes: Array<{ prefix: string; expiresAtMs: number | null; reason: string }>;
}

export interface CompiledCondition extends WafRuleCondition {
  compiledRegex: RegExp | null;
  listValues: string[];
}

export interface CompiledWafRule {
  id: string;
  category: WafRuleCategory;
  name: string;
  isSystem: boolean;
  isEnabled: boolean;
  priority: number;
  conditions: CompiledCondition[];
  matchMode: 'ALL' | 'ANY';
  action: WafDynamicAction;
  rateLimit: WafRuleRateLimit;
  strikeWeight: number;
  expiresAtMs: number | null;
}

export interface CompiledWafRuntime {
  rules: CompiledWafRule[];
  blacklistEnabled: boolean;
  autoBanEnabled: boolean;
  autoBanOnRateAbuseEnabled: boolean;
  whitelist: CompiledIpAclList;
  blacklist: CompiledIpAclList;
  autoBans: CompiledIpAclList;
  rawAcl: WafDbIpAcl[];
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

export function formatUtcSqlTimestamp(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

export function parseUtcTimestampMs(raw?: string | null): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(trimmed)
    ? `${trimmed.replace(' ', 'T')}Z`
    : /[+-]\d{2}$/.test(trimmed)
      ? `${trimmed.replace(' ', 'T')}:00`
      : trimmed;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

const REDOS_NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]|(?:[+*]\s*[+*?{])/;

/**
 * Validates regex length and prevents nested-quantifier ReDoS patterns before storing or compiling.
 */
export function validateRegexSafety(pattern: string, maxLen = 256): { valid: boolean; error?: string } {
  if (typeof pattern !== 'string' || !pattern.trim()) {
    return { valid: false, error: 'Regex pattern cannot be empty.' };
  }
  if (pattern.length > maxLen) {
    return { valid: false, error: `Regex pattern exceeds ${maxLen} characters.` };
  }
  if (REDOS_NESTED_QUANTIFIER.test(pattern)) {
    return { valid: false, error: 'Unsafe nested quantifier detected (ReDoS guard).' };
  }
  try {
    new RegExp(pattern, 'i');
    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'Invalid regular expression syntax.' };
  }
}

export function compileSafeRegex(pattern: string, maxLen = 512): RegExp | null {
  const check = validateRegexSafety(pattern, maxLen);
  if (!check.valid) return null;
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

function emptyCompiledAclList(): CompiledIpAclList {
  return { exact: new Set<string>(), prefixes: [], cidrs: [], timedExact: [], timedPrefixes: [] };
}

function addEntryToCompiledAcl(list: CompiledIpAclList, rawEntry: string, expiresAtMs: number | null, reason: string) {
  const rule = rawEntry.trim().toLowerCase();
  if (!rule) return;
  if (rule.endsWith('*') || rule.endsWith('.')) {
    const prefix = rule.endsWith('*') ? rule.slice(0, -1) : rule;
    if (!prefix) return;
    if (expiresAtMs !== null) {
      list.timedPrefixes.push({ prefix, expiresAtMs, reason });
    } else {
      list.prefixes.push(prefix);
    }
    return;
  }
  if (rule.includes('/')) {
    const [baseIp, maskStr] = rule.split('/');
    const baseInt = ipv4ToInt(baseIp);
    const prefixLen = Number(maskStr);
    if (baseInt !== null && Number.isInteger(prefixLen) && prefixLen >= 0 && prefixLen <= 32) {
      const maskInt = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
      list.cidrs.push({ netInt: (baseInt & maskInt) >>> 0, maskInt, expiresAtMs, raw: rule, reason });
    }
    return;
  }
  if (expiresAtMs !== null) {
    list.timedExact.push({ ip: rule, expiresAtMs, reason });
  } else {
    list.exact.add(rule);
  }
}

export function matchesCompiledIpAcl(
  clientIp: string | undefined,
  list: CompiledIpAclList,
  now: number
): { matched: boolean; reason?: string } {
  if (!clientIp) return { matched: false };
  const ip = clientIp.trim().toLowerCase();
  if (!ip) return { matched: false };
  if (list.exact.has(ip)) return { matched: true };
  for (const item of list.timedExact) {
    if (item.ip === ip && now < (item.expiresAtMs ?? Infinity)) {
      return { matched: true, reason: item.reason };
    }
  }
  for (const prefix of list.prefixes) {
    if (ip.startsWith(prefix)) return { matched: true };
  }
  for (const item of list.timedPrefixes) {
    if (ip.startsWith(item.prefix) && now < (item.expiresAtMs ?? Infinity)) {
      return { matched: true, reason: item.reason };
    }
  }
  if (list.cidrs.length > 0) {
    const ipInt = ipv4ToInt(ip);
    if (ipInt !== null) {
      for (const c of list.cidrs) {
        if (c.expiresAtMs !== null && now >= c.expiresAtMs) continue;
        if (((ipInt & c.maskInt) >>> 0) === c.netInt) {
          return { matched: true, reason: c.reason };
        }
      }
    }
  }
  return { matched: false };
}

export function convertCustomRuleToDbRule(rule: WafCustomConditionRule, idx = 0): WafDbRule {
  const fieldMap: Record<WafConditionField, WafDynamicField> = {
    path_matches: 'path',
    header_contains: 'header',
    query_contains: 'query',
    ua_contains: 'ua',
    ip_matches: 'ip',
    country_equals: 'country',
  };
  const cond: WafRuleCondition = {
    field: fieldMap[rule.field] || 'path',
    op: rule.operator,
    ...(rule.headerName ? { headerName: rule.headerName } : {}),
    value: rule.value,
  };
  return {
    id: rule.id || `cr_${idx + 1}`,
    category: 'custom',
    name: rule.note || `Custom: ${cond.field} ${cond.op} "${rule.value.slice(0, 32)}"`,
    is_system: 0,
    is_enabled: rule.enabled ? 1 : 0,
    priority: 50 + idx,
    conditions_json: JSON.stringify([cond]),
    match_mode: 'ALL',
    action: rule.action === 'rate_limit_429' ? 'rate_limit_429' : 'block_403',
    rate_limit_json: rule.action === 'rate_limit_429' && rule.limit ? JSON.stringify({ limit: rule.limit, key_by: 'ip' }) : '{}',
    strike_weight: 0,
    expires_at: null,
  };
}

export function parseLegacyIpListToAcl(blockedStr?: string | null, allowStr?: string | null): WafDbIpAcl[] {
  const out: WafDbIpAcl[] = [];
  for (const ip of parseIpList(allowStr)) {
    out.push({ ip_cidr: ip, list_type: 'WHITELIST', reason: 'Trusted Whitelist', expires_at: null });
  }
  for (const ip of parseIpList(blockedStr)) {
    out.push({ ip_cidr: ip, list_type: 'BLACKLIST', reason: 'Manual Blacklist', expires_at: null });
  }
  return out;
}

/**
 * Generates the 17 default built-in system WAF rules cleanly backed by WafDbRule rows.
 */
export function buildSystemWafRulesSeed(legacyCfg?: WafRuleConfig): WafDbRule[] {
  const c = legacyCfg ? normalizeWafRuleConfig(legacyCfg) : DEFAULT_WAF_RULE_CONFIG;
  const sys = (
    id: string,
    category: WafRuleCategory,
    name: string,
    enabled: boolean,
    priority: number,
    conditions: WafRuleCondition[],
    matchMode: 'ALL' | 'ANY',
    action: WafDynamicAction,
    rateLimit: WafRuleRateLimit = {},
    strikeWeight = 0
  ): WafDbRule => ({
    id,
    category,
    name,
    is_system: 1,
    is_enabled: enabled ? 1 : 0,
    priority,
    conditions_json: JSON.stringify(conditions),
    match_mode: matchMode,
    action,
    rate_limit_json: JSON.stringify(rateLimit),
    strike_weight: strikeWeight,
    expires_at: null,
    updated_by: 'system_init',
  });

  return [
    sys('sys_ip_blacklist', 'malicious', 'IP / CIDR Blacklist Match', c.malicious.enableIpBlacklist, 10, [], 'ALL', 'block_403', {}, 0),
    sys('sys_ip_autoban', 'malicious', 'Dynamic Strike Auto-Ban', c.malicious.enableAutoBan, 11, [], 'ALL', 'block_403', {}, 0),
    sys('sys_rate_abuse_ban', 'malicious', 'Rate-Limit Flood Auto-Ban Escalation', c.malicious.autoBanOnRateAbuse, 12, [], 'ALL', 'block_403', {}, 1),
    sys(
      'sys_probe_paths',
      'malicious',
      'Vulnerability Probe Paths',
      c.malicious.enableProbePaths,
      20,
      [
        { field: 'path', op: 'regex', value: '^/\\.well-known/' },
        { field: 'path', op: 'regex', value: PROBE_PATH_EXT.source },
        { field: 'path', op: 'regex', value: PROBE_PATH_PATTERN.source },
      ],
      'ANY',
      'block_403',
      {},
      1
    ),
    sys(
      'sys_owasp_sqli',
      'malicious',
      'OWASP SQL Injection (SQLi)',
      c.malicious.enableSqli,
      30,
      [{ field: 'payload_targets', op: 'regex', value: PAYLOAD_RULES[2].regex.source }],
      'ALL',
      'block_403',
      {},
      1
    ),
    sys(
      'sys_owasp_xss',
      'malicious',
      'OWASP Cross-Site Scripting (XSS)',
      c.malicious.enableXss,
      31,
      [{ field: 'payload_targets', op: 'regex', value: PAYLOAD_RULES[1].regex.source }],
      'ALL',
      'block_403',
      {},
      1
    ),
    sys(
      'sys_path_traversal',
      'malicious',
      'Directory Traversal (LFI)',
      c.malicious.enablePathTraversal,
      32,
      [{ field: 'payload_targets', op: 'regex', value: PAYLOAD_RULES[0].regex.source }],
      'ALL',
      'block_403',
      {},
      1
    ),
    sys(
      'sys_rl_public_write',
      'rate_limit',
      'Public Write / Auth Endpoints',
      true,
      100,
      [
        { field: 'method', op: 'equals', value: 'POST' },
        { field: 'path', op: 'in_list', value: '/api/submit-quote,/api/client-error,/api/auth/login,/api/auth/callback,/api/auth/logout,/api/auth/session' },
      ],
      'ALL',
      'rate_limit_429',
      { limit: c.rateLimit.publicWriteLimit, window_s: c.rateLimit.windowSeconds, key_by: 'ip', bucket_prefix: 'pub_write' },
      0
    ),
    sys(
      'sys_rl_api',
      'rate_limit',
      'Standard API Endpoints',
      true,
      101,
      [{ field: 'path', op: 'starts_with', value: '/api/' }],
      'ALL',
      'rate_limit_429',
      { limit: c.rateLimit.apiLimit, window_s: c.rateLimit.windowSeconds, key_by: 'ip', bucket_prefix: 'api' },
      0
    ),
    sys(
      'sys_rl_page',
      'rate_limit',
      'SSR Storefront & Dynamic Pages',
      true,
      102,
      [{ field: 'path', op: 'not_starts_with', value: '/api/' }],
      'ALL',
      'rate_limit_429',
      { limit: c.rateLimit.pageLimit, window_s: c.rateLimit.windowSeconds, key_by: 'ip', bucket_prefix: 'page' },
      0
    ),
    sys(
      'sys_bot_empty_ua',
      'bot',
      'Empty User-Agent Header',
      c.bot.blockEmptyUa,
      110,
      [{ field: 'ua', op: 'is_empty', value: '1' }],
      'ALL',
      'block_403',
      {},
      0
    ),
    sys(
      'sys_bot_ua_rotation',
      'bot',
      'Spoofed Bot UA Rotation',
      c.bot.blockUaRotation,
      111,
      [{ field: 'bot_vendor', op: 'is_true', value: 'rotate>=3' }],
      'ALL',
      'block_403',
      {},
      1
    ),
    sys(
      'sys_bot_scanner',
      'bot',
      'Security & Vulnerability Scanners',
      c.bot.blockScannerTools,
      112,
      [{ field: 'ua', op: 'regex', value: BOT_UA_GROUPS[0].regex.source }],
      'ALL',
      'block_403',
      {},
      0
    ),
    sys(
      'sys_bot_cli',
      'bot',
      'Automated CLI & Script Scrapers',
      c.bot.blockCliScrapers,
      113,
      [{ field: 'ua', op: 'regex', value: BOT_UA_GROUPS[1].regex.source }],
      'ALL',
      'block_403',
      {},
      0
    ),
    sys(
      'sys_bot_ai',
      'bot',
      'AI Training & LLM Crawlers',
      c.bot.blockAiCrawlers,
      114,
      [{ field: 'ua', op: 'regex', value: BOT_UA_GROUPS[2].regex.source }],
      'ALL',
      'block_403',
      {},
      0
    ),
    sys(
      'sys_bot_seo',
      'bot',
      'Commercial SEO Backlink Crawlers',
      c.bot.blockSeoBots,
      115,
      [{ field: 'ua', op: 'regex', value: BOT_UA_GROUPS[3].regex.source }],
      'ALL',
      'block_403',
      {},
      0
    ),
    sys(
      'sys_bot_quote_fp',
      'bot',
      'RFQ Submission Browser Fingerprint',
      c.bot.enforceQuoteFingerprint,
      116,
      [
        { field: 'method', op: 'equals', value: 'POST' },
        { field: 'path', op: 'equals', value: '/api/submit-quote' },
      ],
      'ALL',
      'challenge_fingerprint',
      {},
      0
    ),
  ];
}

function compileConditionsList(rawJson: string): CompiledCondition[] {
  let parsed: WafRuleCondition[] = [];
  try {
    const tmp = JSON.parse(rawJson || '[]');
    if (Array.isArray(tmp)) parsed = tmp;
  } catch {
    parsed = [];
  }
  return parsed
    .filter((c) => c && typeof c.field === 'string' && typeof c.op === 'string')
    .map((c) => {
      const value = typeof c.value === 'string' ? c.value : String(c.value ?? '');
      const compiledRegex = c.op === 'regex' ? compileSafeRegex(value, 512) : null;
      const listValues = c.op === 'in_list'
        ? value.split(/[\r\n,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
        : [];
      return {
        field: c.field,
        op: c.op,
        ...(c.headerName ? { headerName: c.headerName.toLowerCase() } : {}),
        value,
        compiledRegex,
        listValues,
      };
    });
}

/**
 * Compiles DB WAF rules + IP ACL once into pre-parsed RegExps & integer CIDR masks for sub-ms evaluation.
 */
export function compileWafRuntime(data: WafRuntimeData): CompiledWafRuntime {
  const whitelist = emptyCompiledAclList();
  const blacklist = emptyCompiledAclList();
  const autoBans = emptyCompiledAclList();

  for (const row of data.ipAcl || []) {
    const expMs = parseUtcTimestampMs(row.expires_at);
    if (row.list_type === 'WHITELIST') {
      addEntryToCompiledAcl(whitelist, row.ip_cidr, expMs, row.reason || 'Whitelisted');
    } else if (row.list_type === 'AUTO_BAN') {
      addEntryToCompiledAcl(autoBans, row.ip_cidr, expMs, row.reason || 'Auto-Banned');
    } else {
      addEntryToCompiledAcl(blacklist, row.ip_cidr, expMs, row.reason || 'Blacklisted');
    }
  }

  let blacklistEnabled = true;
  let autoBanEnabled = true;
  let autoBanOnRateAbuseEnabled = true;

  const compiledRules: CompiledWafRule[] = [];
  for (const row of data.rules || []) {
    if (row.id === 'sys_ip_blacklist') blacklistEnabled = row.is_enabled !== 0;
    if (row.id === 'sys_ip_autoban') autoBanEnabled = row.is_enabled !== 0;
    if (row.id === 'sys_rate_abuse_ban') autoBanOnRateAbuseEnabled = row.is_enabled !== 0;

    let rateLimit: WafRuleRateLimit = {};
    try {
      const rl = JSON.parse(row.rate_limit_json || '{}');
      if (rl && typeof rl === 'object') rateLimit = rl;
    } catch {}

    compiledRules.push({
      id: row.id,
      category: row.category || 'custom',
      name: row.name || row.id,
      isSystem: row.is_system === 1,
      isEnabled: row.is_enabled !== 0,
      priority: Number.isFinite(row.priority) ? Number(row.priority) : 100,
      conditions: compileConditionsList(row.conditions_json),
      matchMode: row.match_mode === 'ANY' ? 'ANY' : 'ALL',
      action: row.action || 'block_403',
      rateLimit,
      strikeWeight: Math.max(0, Math.min(50, Math.round(Number(row.strike_weight || 0)))),
      expiresAtMs: parseUtcTimestampMs(row.expires_at),
    });
  }

  compiledRules.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));

  return {
    rules: compiledRules,
    blacklistEnabled,
    autoBanEnabled,
    autoBanOnRateAbuseEnabled,
    whitelist,
    blacklist,
    autoBans,
    rawAcl: data.ipAcl || [],
  };
}

function buildRuntimeFromLegacySettings(settings?: WafSettingsSubset | null): CompiledWafRuntime {
  const cfg = normalizeWafRuleConfig(settings?.waf_rule_config);
  const rules = buildSystemWafRulesSeed(cfg);

  const customPaths = parseCustomKeywords(cfg.malicious.customBlockedPaths);
  if (customPaths.length > 0) {
    rules.push({
      id: 'legacy_custom_paths',
      category: 'malicious',
      name: 'Legacy Custom Blocked Paths',
      is_system: 1,
      is_enabled: 1,
      priority: 25,
      conditions_json: JSON.stringify(customPaths.map((kw) => ({ field: 'path', op: 'contains', value: kw }))),
      match_mode: 'ANY',
      action: 'block_403',
      rate_limit_json: '{}',
      strike_weight: 1,
      expires_at: null,
    });
  }

  const customUas = parseCustomKeywords(cfg.bot.customBlockedUa);
  if (customUas.length > 0) {
    rules.push({
      id: 'legacy_custom_ua',
      category: 'bot',
      name: 'Legacy Custom Blocked UAs',
      is_system: 1,
      is_enabled: 1,
      priority: 115,
      conditions_json: JSON.stringify(customUas.map((kw) => ({ field: 'ua', op: 'contains', value: kw }))),
      match_mode: 'ANY',
      action: 'block_403',
      rate_limit_json: '{}',
      strike_weight: 0,
      expires_at: null,
    });
  }

  cfg.customRules.forEach((cr, idx) => {
    rules.push(convertCustomRuleToDbRule(cr, idx));
  });

  return compileWafRuntime({
    rules,
    ipAcl: parseLegacyIpListToAcl(settings?.waf_blocked_ips, settings?.waf_allow_ips),
  });
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
    banDurationMs = AUTO_BAN_DURATION_MS,
    weight = 1
  ): { strikes: number; autoBanned: boolean } {
    if (!ip || weight <= 0) return { strikes: 0, autoBanned: false };
    const key = ip.trim().toLowerCase();
    pruneMapIfNeeded(strikeRecords);
    const prev = strikeRecords.get(key);
    const prevStrikes = prev && prev.bannedUntil <= now ? prev.strikes : prev?.strikes || 0;
    const strikes = prevStrikes + Math.max(1, Math.round(weight));
    const autoBanned = strikes >= strikeLimit;
    const bannedUntil = autoBanned ? now + banDurationMs : 0;
    strikeRecords.set(key, { strikes, bannedUntil, updatedAt: now });
    return { strikes, autoBanned };
  }

  private static maybeRecordStrike(
    ip: string,
    now: number,
    cfg: WafRuleConfig['malicious'],
    dryRun = false,
    weight = 1
  ): { strikes: number; autoBanned: boolean } {
    if (!cfg.enableAutoBan || weight <= 0) return { strikes: 0, autoBanned: false };
    if (dryRun) {
      const key = ip.trim().toLowerCase();
      const prev = key ? strikeRecords.get(key) : undefined;
      const prevStrikes = prev && prev.bannedUntil <= now ? prev.strikes : prev?.strikes || 0;
      const strikes = prevStrikes + Math.max(1, Math.round(weight));
      return { strikes, autoBanned: strikes >= cfg.strikeLimit };
    }
    return this.recordStrike(ip, now, cfg.strikeLimit, cfg.banDurationMinutes * 60_000, weight);
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

  private static evaluateCompiledCondition(
    cond: CompiledCondition,
    ctx: {
      rawPathname: string;
      pathname: string;
      search: string;
      pathAndQuery: string;
      payloadTargets: string[];
      method: string;
      clientIp: string;
      ua: string;
      country: string;
      headers?: Headers;
      now: number;
      dryRun: boolean;
    }
  ): { matched: boolean; sample: string } {
    const { op, field, value } = cond;

    if (field === 'bot_vendor' && op === 'is_true') {
      if (!ctx.ua || !ctx.clientIp) return { matched: false, sample: '' };
      const vendor = detectBotVendor(ctx.ua);
      if (!vendor) return { matched: false, sample: '' };
      const rotation = this.trackUaVendorRotation(ctx.clientIp, vendor, ctx.now, ctx.dryRun);
      return {
        matched: rotation.rotating,
        sample: rotation.rotating ? `${vendor}: ${ctx.ua} (${rotation.vendorList.slice(0, 5).join(', ')})` : '',
      };
    }

    if (field === 'payload_targets') {
      for (const target of ctx.payloadTargets) {
        if (op === 'regex' && cond.compiledRegex) {
          const m = target.match(cond.compiledRegex);
          if (m) return { matched: true, sample: m[0].slice(0, 120) };
        } else if (op !== 'regex' && this.matchDynamicOp(target, op, value, cond.compiledRegex, cond.listValues)) {
          return { matched: true, sample: target.slice(0, 120) };
        }
      }
      if (op === 'regex' && !cond.compiledRegex && value) {
        const needle = value.toLowerCase();
        for (const target of ctx.payloadTargets) {
          if (target.toLowerCase().includes(needle)) return { matched: true, sample: value.slice(0, 120) };
        }
      }
      return { matched: false, sample: '' };
    }

    if (field === 'ip') {
      const rules = cond.listValues.length > 0 ? cond.listValues : [value.toLowerCase()];
      if (op === 'not_equals') {
        const matched = !matchesIpRule(ctx.clientIp, rules);
        return { matched, sample: ctx.clientIp || '(unknown)' };
      }
      if (op === 'not_contains') {
        const matched = !ctx.clientIp.toLowerCase().includes(value.toLowerCase());
        return { matched, sample: ctx.clientIp || '(unknown)' };
      }
      if (op === 'equals' || op === 'in_list' || value.includes('*') || value.includes('/')) {
        const matched = matchesIpRule(ctx.clientIp, rules);
        return { matched, sample: ctx.clientIp || '(unknown)' };
      }
      const matched = Boolean(ctx.clientIp) && this.matchDynamicOp(ctx.clientIp, op, value, cond.compiledRegex, cond.listValues);
      return { matched, sample: ctx.clientIp || '(unknown)' };
    }

    if (field === 'header') {
      const isNegated = op === 'not_contains' || op === 'not_equals' || op === 'not_starts_with';
      if (cond.headerName) {
        const val = (ctx.headers?.get(cond.headerName) ?? (cond.headerName === 'user-agent' ? ctx.ua : '') ?? '').trim();
        if (!val && !isNegated && op !== 'is_empty') return { matched: false, sample: '' };
        const matched = this.matchDynamicOp(val, op, value, cond.compiledRegex, cond.listValues);
        return { matched, sample: `${cond.headerName}: ${val || '(missing)'}`.slice(0, 120) };
      }
      if (ctx.headers) {
        if (isNegated) {
          const positiveOp: WafDynamicOperator = op === 'not_equals' ? 'equals' : op === 'not_starts_with' ? 'starts_with' : 'contains';
          let anyMatched = false;
          for (const hdrVal of ctx.headers.values()) {
            if (this.matchDynamicOp(hdrVal, positiveOp, value, cond.compiledRegex, cond.listValues)) {
              anyMatched = true;
              break;
            }
          }
          return { matched: !anyMatched, sample: `(no header matches "${value}")` };
        }
        for (const [hdrKey, hdrVal] of ctx.headers.entries()) {
          if (this.matchDynamicOp(hdrVal, op, value, cond.compiledRegex, cond.listValues)) {
            return { matched: true, sample: `${hdrKey}: ${hdrVal}`.slice(0, 120) };
          }
        }
      }
      return { matched: false, sample: '' };
    }

    let targetVal = '';
    if (field === 'path') targetVal = ctx.pathname;
    else if (field === 'query') targetVal = ctx.search;
    else if (field === 'path_and_query') targetVal = ctx.pathAndQuery;
    else if (field === 'method') targetVal = ctx.method;
    else if (field === 'ua') targetVal = ctx.ua;
    else if (field === 'country') targetVal = ctx.country;

    const isNegated = op === 'not_contains' || op === 'not_equals' || op === 'not_starts_with';
    if (!targetVal && !isNegated && op !== 'is_empty') {
      return { matched: false, sample: '' };
    }
    const matched = this.matchDynamicOp(targetVal, op, value, cond.compiledRegex, cond.listValues);
    return { matched, sample: (targetVal || '(empty)').slice(0, 120) };
  }

  private static matchDynamicOp(
    haystackRaw: string,
    op: WafDynamicOperator,
    valueRaw: string,
    compiledRegex: RegExp | null,
    listValues: string[]
  ): boolean {
    if (op === 'is_empty') return !haystackRaw.trim();
    if (op === 'regex') {
      if (compiledRegex) return compiledRegex.test(haystackRaw);
      // Graceful ReDoS/invalid-regex downgrade to literal substring match
      return valueRaw ? haystackRaw.toLowerCase().includes(valueRaw.toLowerCase()) : false;
    }
    const haystack = haystackRaw.toLowerCase();
    if (op === 'in_list') {
      return listValues.includes(haystack);
    }
    const needle = valueRaw.toLowerCase();
    if (!needle) return false;
    if (op === 'equals') return haystack === needle;
    if (op === 'not_equals') return haystack !== needle;
    if (op === 'starts_with') return haystack.startsWith(needle);
    if (op === 'not_starts_with') return !haystack.startsWith(needle);
    if (op === 'not_contains') return !haystack.includes(needle);
    return haystack.includes(needle);
  }

  private static buildRateLimitBlockResult(params: {
    clientIp: string;
    excess: number;
    limit: number;
    windowSeconds: number;
    ruleId?: string;
    reason: string;
    matchedSample: string;
    maliciousCfg?: WafRuleConfig['malicious'];
    strikeWeight?: number;
    autoBanOnAbuse?: boolean;
    now: number;
    dryRun: boolean;
  }): WafEvaluationResult {
    const { clientIp, excess, limit, windowSeconds, maliciousCfg, now, dryRun } = params;
    const abuseEnabled = Boolean(
      maliciousCfg?.enableAutoBan && (params.autoBanOnAbuse ?? maliciousCfg.autoBanOnRateAbuse)
    );
    const weight = Math.max(1, params.strikeWeight || 1);
    if (abuseEnabled) {
      if (this.isAutoBanned(clientIp, now)) {
        return {
          allowed: false,
          status: 403,
          code: 'WAF_MALICIOUS_IP',
          mode: 'block_malicious_ips',
          ruleId: params.ruleId,
          reason: 'IP temporarily auto-banned after repeated rate-limit abuse.',
          matchedSample: clientIp || params.matchedSample,
          autoBanned: true,
        };
      }
      if (excess >= 10 && excess % 10 === 0) {
        const strike = this.maybeRecordStrike(clientIp, now, maliciousCfg!, dryRun, weight);
        if (strike.autoBanned) {
          return {
            allowed: false,
            status: 403,
            code: 'WAF_MALICIOUS_IP',
            mode: 'block_malicious_ips',
            ruleId: params.ruleId,
            reason: `Auto-banned after ignoring ${limit} req/${windowSeconds}s rate limit repeatedly.`,
            matchedSample: `${params.matchedSample} (+${excess} excess 429s)`.slice(0, 160),
            autoBanned: true,
          };
        }
      }
    }
    return {
      allowed: false,
      status: 429,
      code: 'WAF_STRICT_RATE_LIMIT',
      mode: 'strict_rate_limiting',
      ruleId: params.ruleId,
      reason: params.reason,
      matchedSample: params.matchedSample.slice(0, 160),
      retryAfter: windowSeconds,
    };
  }

  public static evaluateCustomRules(
    input: WafEvaluationInput,
    rules: WafCustomConditionRule[],
    rateCfg: WafRuleConfig['rateLimit'] = DEFAULT_WAF_RULE_CONFIG.rateLimit,
    now = input.now ?? Date.now(),
    maliciousCfg?: WafRuleConfig['malicious']
  ): WafEvaluationResult | null {
    if (!Array.isArray(rules) || rules.length === 0) return null;
    const dbRules = rules.map((cr, idx) => convertCustomRuleToDbRule(cr, idx));
    const runtime = compileWafRuntime({ rules: dbRules, ipAcl: [] });
    const res = this.evaluateCompiledRules(
      input,
      runtime,
      new Set<WafRuleMode>(),
      { rateLimit: rateCfg, malicious: maliciousCfg || DEFAULT_WAF_RULE_CONFIG.malicious },
      now
    );
    return res.allowed ? null : res;
  }

  public static evaluate(
    input: WafEvaluationInput,
    settings?: WafSettingsSubset | null,
    compiledRuntime?: CompiledWafRuntime | null
  ): WafEvaluationResult {
    const pathname = input.pathname || '/';
    const now = input.now ?? Date.now();
    const runtime = compiledRuntime ?? buildRuntimeFromLegacySettings(settings);
    const res = this.evaluateCore(input, settings, runtime, now);
    if (input.dryRun) return res;

    const ipKey = (input.clientIp || '').trim().toLowerCase();

    if (res.allowed) {
      if (ipKey && !this.isStaticAsset(pathname) && !this.isAntiLockoutPath(pathname)) {
        const activeModes = Array.isArray(settings?.waf_active_modes) ? settings.waf_active_modes : [];
        const hasEnabledCustom = runtime.rules.some((r) => r.category === 'custom' && r.isEnabled && (r.expiresAtMs === null || now < r.expiresAtMs));
        const isStandby = activeModes.length === 0 && !hasEnabledCustom;
        const isWhitelisted = matchesCompiledIpAcl(ipKey, runtime.whitelist, now).matched;

        if (input.isAuthenticatedAdmin || isStandby || isWhitelisted) {
          this.clearLogSuppressions(ipKey);
        } else {
          const isBlacklisted = runtime.blacklistEnabled && matchesCompiledIpAcl(ipKey, runtime.blacklist, now).matched;
          const isDbAutoBanned = runtime.autoBanEnabled && matchesCompiledIpAcl(ipKey, runtime.autoBans, now).matched;
          if (!this.isAutoBanned(ipKey, now) && !isDbAutoBanned && !isBlacklisted) {
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

  private static evaluateCore(
    input: WafEvaluationInput,
    settings: WafSettingsSubset | null | undefined,
    runtime: CompiledWafRuntime,
    now: number
  ): WafEvaluationResult {
    const pathname = input.pathname || '/';
    const clientIp = (input.clientIp || '').trim();

    if (this.isStaticAsset(pathname)) {
      return { allowed: true };
    }

    // Never lock out WAF management, OIDC auth callback/login/logout, or authenticated admins
    if (this.isAntiLockoutPath(pathname) || input.isAuthenticatedAdmin) {
      return { allowed: true };
    }

    // Trusted IP whitelist (pre-compiled CIDR/exact/prefix from waf_ip_acl) always bypasses all WAF rules
    if (matchesCompiledIpAcl(clientIp, runtime.whitelist, now).matched) {
      return { allowed: true };
    }

    const activeModes = new Set<WafRuleMode>(
      Array.isArray(settings?.waf_active_modes) ? settings.waf_active_modes : []
    );
    const cfg = normalizeWafRuleConfig(settings?.waf_rule_config);
    const hasCustomRules = runtime.rules.some((r) => r.category === 'custom' && r.isEnabled && (r.expiresAtMs === null || now < r.expiresAtMs));
    if (activeModes.size === 0 && !hasCustomRules) {
      return { allowed: true };
    }

    return this.evaluateCompiledRules(
      input,
      runtime,
      activeModes,
      { rateLimit: cfg.rateLimit, malicious: cfg.malicious },
      now
    );
  }

  private static evaluateCompiledRules(
    input: WafEvaluationInput,
    runtime: CompiledWafRuntime,
    activeModes: Set<WafRuleMode>,
    cfg: { rateLimit: WafRuleConfig['rateLimit']; malicious: WafRuleConfig['malicious'] },
    now: number
  ): WafEvaluationResult {
    const rawPathname = input.pathname || '/';
    const pathname = this.decodeSafe(rawPathname);
    const search = this.decodeSafe(input.search || '');
    const pathAndQuery = this.decodeSafe(`${rawPathname}${input.search || ''}`);
    const method = (input.method || 'GET').toUpperCase();
    const clientIp = (input.clientIp || '').trim();
    const ua = (input.userAgent ?? input.headers?.get('user-agent') ?? '').trim();
    const country = (input.country ?? input.headers?.get('cf-ipcountry') ?? '').trim();
    const dryRun = Boolean(input.dryRun);

    const headerTargets: string[] = [pathAndQuery];
    for (const hdr of ['referer', 'user-agent', 'x-forwarded-host']) {
      const val = hdr === 'user-agent' ? ua : (input.headers?.get(hdr) || '');
      if (val) headerTargets.push(this.decodeSafe(val));
    }

    const hasWebhookSecret = Boolean(
      input.headers?.get('x-sanity-signature') ||
      input.headers?.get('x-webhook-secret') ||
      input.headers?.get('x-revalidate-secret')
    );

    const ctx = {
      rawPathname,
      pathname,
      search,
      pathAndQuery,
      payloadTargets: headerTargets,
      method,
      clientIp,
      ua,
      country,
      headers: input.headers,
      now,
      dryRun,
    };

    const effectiveMaliciousCfg: WafRuleConfig['malicious'] = {
      ...cfg.malicious,
      enableIpBlacklist: runtime.blacklistEnabled,
      enableAutoBan: runtime.autoBanEnabled,
      autoBanOnRateAbuse: runtime.autoBanOnRateAbuseEnabled,
    };

    let firstShadowMatch: WafShadowMatch | undefined;

    for (const rule of runtime.rules) {
      if (!rule.isEnabled) continue;
      if (rule.expiresAtMs !== null && now >= rule.expiresAtMs) continue;

      if (rule.category === 'malicious' && !activeModes.has('block_malicious_ips')) continue;
      if (rule.category === 'rate_limit' && !activeModes.has('strict_rate_limiting')) continue;
      if (rule.category === 'bot') {
        if (!activeModes.has('bot_challenge')) continue;
        if (rawPathname === '/api/revalidate' && hasWebhookSecret) continue;
      }

      // Built-in ACL & Auto-Ban meta rules evaluated at their configured priority slot
      if (rule.id === 'sys_ip_blacklist') {
        const blMatch = matchesCompiledIpAcl(clientIp, runtime.blacklist, now);
        if (blMatch.matched) {
          return {
            allowed: false,
            status: 403,
            code: 'WAF_MALICIOUS_IP',
            mode: 'block_malicious_ips',
            ruleId: rule.id,
            reason: blMatch.reason || 'Access denied by Edge WAF IP blacklist.',
            matchedSample: clientIp,
          };
        }
        continue;
      }
      if (rule.id === 'sys_ip_autoban') {
        const dbBan = matchesCompiledIpAcl(clientIp, runtime.autoBans, now);
        if (dbBan.matched || this.isAutoBanned(clientIp, now)) {
          return {
            allowed: false,
            status: 403,
            code: 'WAF_MALICIOUS_IP',
            mode: 'block_malicious_ips',
            ruleId: rule.id,
            reason: dbBan.reason || 'IP temporarily auto-banned after repeated security violations.',
            matchedSample: clientIp,
            autoBanned: true,
          };
        }
        continue;
      }
      if (rule.id === 'sys_rate_abuse_ban') continue;
      if (rule.id === 'sys_probe_paths' && ALLOWED_WELL_KNOWN.test(rawPathname)) continue;
      if (rule.conditions.length === 0) continue;

      let ruleMatched = rule.matchMode === 'ALL';
      let sample = '';
      for (const cond of rule.conditions) {
        const cRes = this.evaluateCompiledCondition(cond, ctx);
        if (rule.matchMode === 'ANY') {
          if (cRes.matched) {
            ruleMatched = true;
            sample = cRes.sample;
            break;
          }
        } else {
          if (!cRes.matched) {
            ruleMatched = false;
            break;
          }
          if (!sample && cRes.sample) sample = cRes.sample;
        }
      }
      if (!ruleMatched) continue;

      if (rule.action === 'allow') {
        return { allowed: true, ruleId: rule.id };
      }

      const modeForCategory: WafRuleMode =
        rule.category === 'bot' ? 'bot_challenge' : rule.category === 'rate_limit' ? 'strict_rate_limiting' : 'block_malicious_ips';
      const defaultCode: WafBlockCode =
        rule.category === 'bot' ? 'WAF_BOT_CHALLENGE' : rule.id.startsWith('sys_ip') ? 'WAF_MALICIOUS_IP' : 'WAF_MALICIOUS_PAYLOAD';

      if (rule.action === 'log_only') {
        firstShadowMatch ??= {
          ruleId: rule.id,
          ruleName: rule.name,
          code: defaultCode,
          mode: modeForCategory,
          reason: `Shadow rule matched: ${rule.name}`,
          matchedSample: (sample || rawPathname).slice(0, 120),
        };
        continue;
      }

      if (rule.action === 'rate_limit_429') {
        const limit = rule.rateLimit.limit ?? cfg.rateLimit.publicWriteLimit;
        const windowSeconds = rule.rateLimit.window_s ?? cfg.rateLimit.windowSeconds;
        const prefix = rule.rateLimit.bucket_prefix || `custom:${rule.id}`;
        const bucketKey = rule.rateLimit.key_by === 'ip_and_path'
          ? `${prefix}:${clientIp || 'unknown'}:${rawPathname}`
          : `${prefix}:${clientIp || 'unknown'}`;
        const { limited, excess } = this.consumeRateLimitBucket(bucketKey, limit, windowSeconds, now, dryRun);
        if (!limited) continue;
        return this.buildRateLimitBlockResult({
          clientIp,
          excess,
          limit,
          windowSeconds,
          ruleId: rule.id,
          reason: rule.isSystem
            ? `Strict rate limit exceeded (${limit} req/${windowSeconds}s for ${prefix}).`
            : `Custom Rule (${rule.name}) rate limit exceeded (${limit} req/${windowSeconds}s).`,
          matchedSample: rule.isSystem
            ? `${method} ${rawPathname} (${limit}/${windowSeconds}s)`
            : `${rule.name} → ${sample || rawPathname}`,
          maliciousCfg: activeModes.has('block_malicious_ips') ? effectiveMaliciousCfg : undefined,
          strikeWeight: rule.strikeWeight || 1,
          autoBanOnAbuse: effectiveMaliciousCfg.autoBanOnRateAbuse || rule.strikeWeight > 0,
          now,
          dryRun,
        });
      }

      if (rule.action === 'challenge_fingerprint') {
        if (!input.headers) continue;
        const hasAcceptLang = Boolean(input.headers.get('accept-language'));
        const hasBrowserFetchMeta = Boolean(
          input.headers.get('sec-fetch-site') || input.headers.get('sec-ch-ua')
        );
        const hasTurnstileHeader = Boolean(input.headers.get('cf-turnstile-response'));
        if (hasAcceptLang || hasBrowserFetchMeta || hasTurnstileHeader) continue;

        const strike = activeModes.has('block_malicious_ips') && rule.strikeWeight > 0
          ? this.maybeRecordStrike(clientIp, now, effectiveMaliciousCfg, dryRun, rule.strikeWeight)
          : { strikes: 0, autoBanned: false };
        return {
          allowed: false,
          status: 403,
          code: strike.autoBanned ? 'WAF_MALICIOUS_IP' : 'WAF_BOT_CHALLENGE',
          mode: strike.autoBanned ? 'block_malicious_ips' : 'bot_challenge',
          ruleId: rule.id,
          reason: 'Missing browser fingerprint headers on sensitive submission.',
          matchedSample: 'missing accept-language & sec-fetch-*',
          autoBanned: strike.autoBanned,
        };
      }

      // action === 'block_403'
      const strike = activeModes.has('block_malicious_ips') && rule.strikeWeight > 0
        ? this.maybeRecordStrike(clientIp, now, effectiveMaliciousCfg, dryRun, rule.strikeWeight)
        : { strikes: 0, autoBanned: false };

      return {
        allowed: false,
        status: 403,
        code: strike.autoBanned ? 'WAF_MALICIOUS_IP' : defaultCode,
        mode: strike.autoBanned ? 'block_malicious_ips' : modeForCategory,
        ruleId: rule.id,
        reason: rule.isSystem
          ? `Blocked by ${rule.name}.`
          : `Blocked by Custom Rule: ${rule.name}.`,
        matchedSample: (sample || rawPathname).slice(0, 120),
        autoBanned: strike.autoBanned,
      };
    }

    return firstShadowMatch ? { allowed: true, shadowMatch: firstShadowMatch } : { allowed: true };
  }
}
