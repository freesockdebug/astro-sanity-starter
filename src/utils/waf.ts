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

export interface WafSettingsSubset {
  waf_active_modes?: WafRuleMode[] | null;
  waf_blocked_ips?: string | null;
  waf_allow_ips?: string | null;
}

const AUTO_BAN_STRIKE_LIMIT = 3;
const AUTO_BAN_DURATION_MS = 15 * 60_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_MAP_ENTRIES = 5000;

const strikeRecords = new Map<string, { strikes: number; bannedUntil: number; updatedAt: number }>();
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

const STATIC_ASSET_EXT = /\.(?:css|js|mjs|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|eot|map|txt|xml)$/i;

const PROBE_PATH_EXT = /\.(?:php\d*|asp|aspx|jsp|cgi|env|git|sql|bak|zip|tar|gz|sh|py|rb|pl|ini|log|ya?ml|toml|action|do|key|pem|crt)$/i;
const PROBE_PATH_PATTERN = /(?:^|\/)(?:wp-[a-z0-9_-]+|wordpress|phpmyadmin|pma|mysql|actuator|\.(?:env|git|npmrc|htpasswd|htaccess)|vendor|cgi-bin|eval-stdin|xmlrpc|wlwmanifest|(?:credentials|secrets|service-account|serviceAccountKey|firebase-adminsdk|config)\.json)(?:\/|$|\.)/i;

const PAYLOAD_RULES: Array<{ label: string; regex: RegExp }> = [
  { label: 'PATH_TRAVERSAL', regex: /(?:\.\.[\/\\]|%2e%2e(?:%2f|%5c|\/|\\))/i },
  { label: 'XSS_SCRIPT', regex: /(?:<\s*script\b|javascript:|on(?:error|load|mouseover|focus)\s*=|<\s*iframe\b|<\s*svg[^>]*onload\s*=)/i },
  { label: 'SQL_INJECTION', regex: /(?:union\s+(?:all\s+)?select\b|information_schema\b|(?:sleep|benchmark)\s*\(|waitfor\s+delay\b|xp_cmdshell\b|(?:'|%27)\s*(?:or|and)\s+(?:1=1|'1'='1'|true)\b)/i },
];

const MALICIOUS_BOT_UA = /(?:sqlmap|nuclei|nikto|nessus|acunetix|masscan|zgrab|dirbuster|gobuster|ffuf|wfuzz|python-requests|python-urllib|aiohttp|scrapy|curl\/|wget\/|go-http-client|java\/\d|libwww-perl|gptbot|bytespider|ccbot|ahrefsbot|semrushbot|dotbot|mj12bot|claudebot|anthropic-ai)/i;

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

  public static recordStrike(ip: string | undefined, now = Date.now()): { strikes: number; autoBanned: boolean } {
    if (!ip) return { strikes: 0, autoBanned: false };
    const key = ip.trim().toLowerCase();
    pruneMapIfNeeded(strikeRecords);
    const prev = strikeRecords.get(key);
    const strikes = (prev && prev.bannedUntil <= now ? prev.strikes : prev?.strikes || 0) + 1;
    const autoBanned = strikes >= AUTO_BAN_STRIKE_LIMIT;
    const bannedUntil = autoBanned ? now + AUTO_BAN_DURATION_MS : 0;
    strikeRecords.set(key, { strikes, bannedUntil, updatedAt: now });
    return { strikes, autoBanned };
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
    now: number
  ): { limited: boolean; limit: number; bucket: string } {
    const isPublicWriteApi =
      method === 'POST' &&
      (pathname === '/api/submit-quote' || pathname === '/api/client-error' || pathname.startsWith('/api/auth/'));
    const isApi = pathname.startsWith('/api/');
    const bucketType = isPublicWriteApi ? 'pub_write' : isApi ? 'api' : 'page';
    const limit = isPublicWriteApi ? 5 : isApi ? 30 : 90;

    const key = `${bucketType}:${ip || 'unknown'}`;
    pruneMapIfNeeded(rateLimitBuckets);
    const existing = rateLimitBuckets.get(key);
    if (!existing || existing.resetAt <= now) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
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

    // 1. Block Malicious IPs + OWASP Payloads + 3-Strike Auto-Ban
    if (activeModes.has('block_malicious_ips')) {
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

      if (this.isAutoBanned(clientIp, now)) {
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

      if (this.isBlockedProbePath(pathname)) {
        const strike = this.recordStrike(clientIp, now);
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

      // Inspect path + query for SQLi / XSS / Path Traversal
      let decodedTarget = `${pathname}${input.search || ''}`;
      try {
        decodedTarget = decodeURIComponent(decodedTarget.replace(/\+/g, ' '));
      } catch {
        // Keep raw if malformed percent-encoding
      }
      for (const rule of PAYLOAD_RULES) {
        const match = decodedTarget.match(rule.regex);
        if (match) {
          const strike = this.recordStrike(clientIp, now);
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
      const rate = this.checkStrictRateLimit(clientIp || 'unknown', pathname, method, now);
      if (rate.limited) {
        return {
          allowed: false,
          status: 429,
          code: 'WAF_STRICT_RATE_LIMIT',
          mode: 'strict_rate_limiting',
          reason: `Strict rate limit exceeded (${rate.limit} req/min for ${rate.bucket}).`,
          matchedSample: `${method} ${pathname} (${rate.limit}/min)`,
          retryAfter: 60,
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
          return {
            allowed: false,
            status: 403,
            code: 'WAF_BOT_CHALLENGE',
            mode: 'bot_challenge',
            reason: 'Missing User-Agent header blocked by Bot Challenge.',
            matchedSample: '(empty user-agent)',
          };
        }
        const uaMatch = ua.match(MALICIOUS_BOT_UA);
        if (uaMatch) {
          return {
            allowed: false,
            status: 403,
            code: 'WAF_BOT_CHALLENGE',
            mode: 'bot_challenge',
            reason: 'Automated scanner or scraper blocked by Bot Challenge.',
            matchedSample: ua.slice(0, 120),
          };
        }

        if (method === 'POST' && pathname === '/api/submit-quote' && input.headers) {
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
