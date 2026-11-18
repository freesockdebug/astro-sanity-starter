// test/waf.test.ts
// Unit tests for EdgeWafService using Node 22 native test runner
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EdgeWafService,
  parseIpList,
  isValidIpRule,
  matchesIpRule,
  normalizeWafRuleConfig,
  WAF_CONDITION_CATALOG,
} from '../src/utils/waf.js';

const BROWSER_HEADERS = new Headers({
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
  'accept-language': 'en-US,en;q=0.9',
  'sec-fetch-site': 'same-origin',
});

test('parseIpList, isValidIpRule, and matchesIpRule handle exact, wildcard, and CIDR rules', () => {
  const rules = parseIpList('185.220.101.1, 45.155.205.*\n192.0.2.0/24');
  assert.deepEqual(rules, ['185.220.101.1', '45.155.205.*', '192.0.2.0/24']);

  assert.equal(isValidIpRule('185.220.101.1'), true);
  assert.equal(isValidIpRule('45.155.205.*'), true);
  assert.equal(isValidIpRule('192.0.2.0/24'), true);
  assert.equal(isValidIpRule('999.999.1.1'), false);
  assert.equal(isValidIpRule('not-an-ip'), false);

  assert.equal(matchesIpRule('185.220.101.1', rules), true);
  assert.equal(matchesIpRule('45.155.205.88', rules), true);
  assert.equal(matchesIpRule('192.0.2.42', rules), true);
  assert.equal(matchesIpRule('192.0.3.42', rules), false);
});

test('EdgeWafService respects empty waf_active_modes and whitelist bypass', () => {
  EdgeWafService.clearAllStrikes();

  // All modes disabled -> allows even blacklisted IP & scanner UA
  const standbyRes = EdgeWafService.evaluate(
    {
      clientIp: '185.220.101.1',
      pathname: '/products',
      search: '?q=<script>alert(1)</script>',
      userAgent: 'sqlmap/1.7',
    },
    {
      waf_active_modes: [],
      waf_blocked_ips: '185.220.101.1',
    }
  );
  assert.equal(standbyRes.allowed, true);

  // Whitelist bypasses all active modes
  const allowRes = EdgeWafService.evaluate(
    {
      clientIp: '203.0.113.10',
      pathname: '/products',
      search: '?id=1 UNION SELECT * FROM users',
      userAgent: 'sqlmap/1.7',
    },
    {
      waf_active_modes: ['block_malicious_ips', 'strict_rate_limiting', 'bot_challenge'],
      waf_blocked_ips: '203.0.113.10',
      waf_allow_ips: '203.0.113.*',
    }
  );
  assert.equal(allowRes.allowed, true);
});

test('block_malicious_ips blocks blacklisted IPs, SQLi/XSS/path traversal, and auto-bans after 3 strikes', () => {
  EdgeWafService.clearAllStrikes();
  const settings = {
    waf_active_modes: ['block_malicious_ips'] as const,
    waf_blocked_ips: '185.220.101.*',
  };

  // Blacklist wildcard match
  const ipBlock = EdgeWafService.evaluate(
    { clientIp: '185.220.101.55', pathname: '/', headers: BROWSER_HEADERS },
    { waf_active_modes: [...settings.waf_active_modes], waf_blocked_ips: settings.waf_blocked_ips }
  );
  assert.equal(ipBlock.allowed, false);
  assert.equal(ipBlock.status, 403);
  assert.equal(ipBlock.code, 'WAF_MALICIOUS_IP');

  // SQL Injection
  const sqli = EdgeWafService.evaluate(
    { clientIp: '198.51.100.2', pathname: '/products', search: '?q=1+UNION+SELECT+password+FROM+users', headers: BROWSER_HEADERS },
    { waf_active_modes: [...settings.waf_active_modes] }
  );
  assert.equal(sqli.allowed, false);
  assert.equal(sqli.code, 'WAF_MALICIOUS_PAYLOAD');

  // XSS
  const xss = EdgeWafService.evaluate(
    { clientIp: '198.51.100.3', pathname: '/products', search: '?q=<script>alert(1)</script>', headers: BROWSER_HEADERS },
    { waf_active_modes: [...settings.waf_active_modes] }
  );
  assert.equal(xss.allowed, false);
  assert.equal(xss.code, 'WAF_MALICIOUS_PAYLOAD');

  // Path Traversal
  const trav = EdgeWafService.evaluate(
    { clientIp: '198.51.100.4', pathname: '/products/../../etc/passwd', headers: BROWSER_HEADERS },
    { waf_active_modes: [...settings.waf_active_modes] }
  );
  assert.equal(trav.allowed, false);
  assert.equal(trav.code, 'WAF_MALICIOUS_PAYLOAD');

  // 3-strike Auto-Ban on probe IP
  const attackerIp = '198.51.100.99';
  const now = 1_700_000_000_000;
  for (let i = 1; i <= 2; i++) {
    const res = EdgeWafService.evaluate(
      { clientIp: attackerIp, pathname: '/wp-login.php', headers: BROWSER_HEADERS, now },
      { waf_active_modes: [...settings.waf_active_modes] }
    );
    assert.equal(res.allowed, false);
    assert.equal(res.autoBanned, false);
  }
  const strike3 = EdgeWafService.evaluate(
    { clientIp: attackerIp, pathname: '/.env', headers: BROWSER_HEADERS, now },
    { waf_active_modes: [...settings.waf_active_modes] }
  );
  assert.equal(strike3.allowed, false);
  assert.equal(strike3.autoBanned, true);
  assert.equal(strike3.code, 'WAF_MALICIOUS_IP');

  // Clean request from auto-banned IP is now blocked for 15 minutes
  const cleanFollowup = EdgeWafService.evaluate(
    { clientIp: attackerIp, pathname: '/', headers: BROWSER_HEADERS, now: now + 60_000 },
    { waf_active_modes: [...settings.waf_active_modes] }
  );
  assert.equal(cleanFollowup.allowed, false);
  assert.equal(cleanFollowup.autoBanned, true);

  EdgeWafService.clearAllStrikes();
  const afterClear = EdgeWafService.evaluate(
    { clientIp: attackerIp, pathname: '/', headers: BROWSER_HEADERS, now: now + 60_000 },
    { waf_active_modes: [...settings.waf_active_modes] }
  );
  assert.equal(afterClear.allowed, true);
});

test('strict_rate_limiting enforces 5 req/min on /api/submit-quote with 429 + Retry-After', () => {
  EdgeWafService.clearAllStrikes();
  const now = 1_700_000_000_000;
  const settings = { waf_active_modes: ['strict_rate_limiting'] as ('strict_rate_limiting')[] };

  for (let i = 0; i < 5; i++) {
    const res = EdgeWafService.evaluate(
      { clientIp: '198.51.100.50', pathname: '/api/submit-quote', method: 'POST', headers: BROWSER_HEADERS, now: now + i * 100 },
      settings
    );
    assert.equal(res.allowed, true);
  }

  const limited = EdgeWafService.evaluate(
    { clientIp: '198.51.100.50', pathname: '/api/submit-quote', method: 'POST', headers: BROWSER_HEADERS, now: now + 1000 },
    settings
  );
  assert.equal(limited.allowed, false);
  assert.equal(limited.status, 429);
  assert.equal(limited.code, 'WAF_STRICT_RATE_LIMIT');
  assert.equal(limited.retryAfter, 60);
});

test('bot_challenge blocks scanner/bot UAs and fingerprint-less POST /api/submit-quote', () => {
  EdgeWafService.clearAllStrikes();
  const settings = { waf_active_modes: ['bot_challenge'] as ('bot_challenge')[] };

  for (const ua of ['sqlmap/1.7.8', 'python-requests/2.31.0', 'Mozilla/5.0 (compatible; GPTBot/1.0)', '']) {
    const res = EdgeWafService.evaluate(
      { clientIp: '198.51.100.77', pathname: '/products', userAgent: ua },
      settings
    );
    assert.equal(res.allowed, false, `Expected block for UA: ${ua}`);
    assert.equal(res.status, 403);
    assert.equal(res.code, 'WAF_BOT_CHALLENGE');
  }

  // Normal browser allowed
  const browserRes = EdgeWafService.evaluate(
    { clientIp: '198.51.100.77', pathname: '/products', headers: BROWSER_HEADERS },
    settings
  );
  assert.equal(browserRes.allowed, true);

  // Sensitive POST without browser fingerprint headers blocked
  const headlessPost = EdgeWafService.evaluate(
    {
      clientIp: '198.51.100.78',
      pathname: '/api/submit-quote',
      method: 'POST',
      headers: new Headers({ 'user-agent': 'Mozilla/5.0' }),
    },
    settings
  );
  assert.equal(headlessPost.allowed, false);
  assert.equal(headlessPost.code, 'WAF_BOT_CHALLENGE');
});

test('normalizeWafRuleConfig clamps out-of-range thresholds and merges partial overrides', () => {
  const normalized = normalizeWafRuleConfig(JSON.stringify({
    malicious: { strikeLimit: 999, banDurationMinutes: 0, enableXss: false, customBlockedPaths: ' /secret-dump , /bak ' },
    rateLimit: { windowSeconds: 5, publicWriteLimit: 9000 },
    bot: { blockSeoBots: false, blockAiCrawlers: false, customBlockedUa: 'MyScraper' },
  }));

  assert.equal(normalized.malicious.strikeLimit, 50);
  assert.equal(normalized.malicious.banDurationMinutes, 1);
  assert.equal(normalized.malicious.enableXss, false);
  assert.equal(normalized.malicious.enableSqli, true);
  assert.equal(normalized.malicious.customBlockedPaths, '/secret-dump , /bak');

  assert.equal(normalized.rateLimit.windowSeconds, 10);
  assert.equal(normalized.rateLimit.publicWriteLimit, 500);
  assert.equal(normalized.rateLimit.apiLimit, 30);

  assert.equal(normalized.bot.blockSeoBots, false);
  assert.equal(normalized.bot.blockAiCrawlers, false);
  assert.equal(normalized.bot.blockScannerTools, true);
  assert.equal(normalized.bot.customBlockedUa, 'MyScraper');
  assert.equal(WAF_CONDITION_CATALOG.block_malicious_ips.length, 6);
  assert.equal(WAF_CONDITION_CATALOG.strict_rate_limiting.length, 3);
  assert.equal(WAF_CONDITION_CATALOG.bot_challenge.length, 6);
});

test('EdgeWafService honors fine-grained sub-rule toggles, custom limits, custom paths, and custom UAs', () => {
  EdgeWafService.clearAllStrikes();
  const now = 1_700_000_000_000;

  // 1. Custom strikeLimit = 1 auto-bans immediately; custom blocked path blocked; XSS disabled passes
  const malSettings = {
    waf_active_modes: ['block_malicious_ips'] as ('block_malicious_ips')[],
    waf_rule_config: normalizeWafRuleConfig({
      malicious: {
        enableXss: false,
        strikeLimit: 1,
        banDurationMinutes: 5,
        customBlockedPaths: '/backup-sql, /internal-secret',
      },
    }),
  };

  const xssAllowed = EdgeWafService.evaluate(
    { clientIp: '198.51.100.10', pathname: '/products', search: '?q=<script>alert(1)</script>', headers: BROWSER_HEADERS, now },
    malSettings
  );
  assert.equal(xssAllowed.allowed, true);

  const customPathBlock = EdgeWafService.evaluate(
    { clientIp: '198.51.100.11', pathname: '/backup-sql/dump', headers: BROWSER_HEADERS, now },
    malSettings
  );
  assert.equal(customPathBlock.allowed, false);
  assert.equal(customPathBlock.autoBanned, true);

  // Follow-up clean request is banned for 5m, expires after 5m
  const duringBan = EdgeWafService.evaluate(
    { clientIp: '198.51.100.11', pathname: '/', headers: BROWSER_HEADERS, now: now + 4 * 60_000 },
    malSettings
  );
  assert.equal(duringBan.allowed, false);

  const afterBan = EdgeWafService.evaluate(
    { clientIp: '198.51.100.11', pathname: '/', headers: BROWSER_HEADERS, now: now + 6 * 60_000 },
    malSettings
  );
  assert.equal(afterBan.allowed, true);

  // 2. Custom rateLimit windowSeconds = 15 & publicWriteLimit = 2
  const rlSettings = {
    waf_active_modes: ['strict_rate_limiting'] as ('strict_rate_limiting')[],
    waf_rule_config: normalizeWafRuleConfig({
      rateLimit: { windowSeconds: 15, publicWriteLimit: 2 },
    }),
  };
  for (let i = 0; i < 2; i++) {
    assert.equal(
      EdgeWafService.evaluate(
        { clientIp: '198.51.100.20', pathname: '/api/submit-quote', method: 'POST', headers: BROWSER_HEADERS, now: now + i * 100 },
        rlSettings
      ).allowed,
      true
    );
  }
  const rlBlocked = EdgeWafService.evaluate(
    { clientIp: '198.51.100.20', pathname: '/api/submit-quote', method: 'POST', headers: BROWSER_HEADERS, now: now + 500 },
    rlSettings
  );
  assert.equal(rlBlocked.allowed, false);
  assert.equal(rlBlocked.retryAfter, 15);

  // 3. Bot granular control: allow SEO/AI bots, block scanners & custom UA keyword
  const botSettings = {
    waf_active_modes: ['bot_challenge'] as ('bot_challenge')[],
    waf_rule_config: normalizeWafRuleConfig({
      bot: {
        blockAiCrawlers: false,
        blockSeoBots: false,
        blockScannerTools: true,
        customBlockedUa: 'MyEvilScraper',
      },
    }),
  };
  assert.equal(
    EdgeWafService.evaluate({ clientIp: '198.51.100.30', pathname: '/products', userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.0)' }, botSettings).allowed,
    true
  );
  assert.equal(
    EdgeWafService.evaluate({ clientIp: '198.51.100.30', pathname: '/products', userAgent: 'Mozilla/5.0 (compatible; AhrefsBot/7.0)' }, botSettings).allowed,
    true
  );
  assert.equal(
    EdgeWafService.evaluate({ clientIp: '198.51.100.30', pathname: '/products', userAgent: 'nuclei/3.1' }, botSettings).allowed,
    false
  );
  assert.equal(
    EdgeWafService.evaluate({ clientIp: '198.51.100.30', pathname: '/products', userAgent: 'Custom/1.0 MyEvilScraper' }, botSettings).allowed,
    false
  );
});

test('EdgeWafService evaluates customRules across path, header, query, ua, ip, actions, and whitelist safety', () => {
  EdgeWafService.clearAllStrikes();
  const now = 1_700_000_000_000;

  const cfg = normalizeWafRuleConfig({
    rateLimit: { windowSeconds: 30, publicWriteLimit: 2 },
    customRules: [
      { id: 'r_path', enabled: true, field: 'path_matches', operator: 'starts_with', value: '/secret-admin', action: 'block_403' },
      { id: 'r_hdr_named', enabled: true, field: 'header_contains', operator: 'contains', value: 'referer: evil-ref.com', action: 'block_403' },
      { id: 'r_hdr_any', enabled: true, field: 'header_contains', operator: 'equals', value: 'forbidden-token', action: 'block_403' },
      { id: 'r_query', enabled: true, field: 'query_contains', operator: 'contains', value: 'base64_decode', action: 'block_403' },
      { id: 'r_ua', enabled: true, field: 'ua_contains', operator: 'contains', value: 'PetalBot', action: 'rate_limit_429' },
      { id: 'r_ip', enabled: true, field: 'ip_matches', operator: 'equals', value: '203.0.113.0/24', action: 'block_403' },
      { id: 'r_disabled', enabled: false, field: 'path_matches', operator: 'equals', value: '/allowed-path', action: 'block_403' },
    ],
  });
  assert.equal(cfg.customRules.length, 7);
  assert.equal(cfg.customRules[1].headerName, 'referer');
  assert.equal(cfg.customRules[1].value, 'evil-ref.com');

  const settings = { waf_active_modes: [], waf_allow_ips: '203.0.113.99', waf_rule_config: cfg };

  assert.equal(EdgeWafService.evaluate({ clientIp: '198.51.100.1', pathname: '/allowed-path', headers: BROWSER_HEADERS, now }, settings).allowed, true);
  assert.equal(EdgeWafService.evaluate({ clientIp: '198.51.100.1', pathname: '/secret-admin/panel', headers: BROWSER_HEADERS, now }, settings).status, 403);
  assert.equal(EdgeWafService.evaluate({ clientIp: '198.51.100.1', pathname: '/products', headers: new Headers({ referer: 'https://evil-ref.com/x' }), now }, settings).status, 403);
  assert.equal(EdgeWafService.evaluate({ clientIp: '198.51.100.1', pathname: '/products', headers: new Headers({ 'x-api-key': 'forbidden-token' }), now }, settings).status, 403);
  assert.equal(EdgeWafService.evaluate({ clientIp: '198.51.100.1', pathname: '/products', search: '?payload=base64_decode(abc)', headers: BROWSER_HEADERS, now }, settings).status, 403);
  assert.equal(EdgeWafService.evaluate({ clientIp: '203.0.113.50', pathname: '/', headers: BROWSER_HEADERS, now }, settings).status, 403);

  // Whitelisted IP still bypasses custom IP rule
  assert.equal(EdgeWafService.evaluate({ clientIp: '203.0.113.99', pathname: '/secret-admin', headers: BROWSER_HEADERS, now }, settings).allowed, true);

  // rate_limit_429 on custom rule uses publicWriteLimit (2) and windowSeconds (30)
  for (let i = 0; i < 2; i++) {
    assert.equal(
      EdgeWafService.evaluate({ clientIp: '198.51.100.2', pathname: '/', userAgent: 'Mozilla/5.0 PetalBot', now: now + i * 100 }, settings).allowed,
      true
    );
  }
  const throttled = EdgeWafService.evaluate({ clientIp: '198.51.100.2', pathname: '/', userAgent: 'Mozilla/5.0 PetalBot', now: now + 300 }, settings);
  assert.equal(throttled.allowed, false);
  assert.equal(throttled.status, 429);
  assert.equal(throttled.retryAfter, 30);
});
