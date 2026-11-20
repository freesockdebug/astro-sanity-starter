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
  validateRegexSafety,
  compileSafeRegex,
  compileWafRuntime,
  buildSystemWafRulesSeed,
  mergeActiveTimedBans,
  WAF_CONDITION_CATALOG,
} from '../src/utils/waf.js';
import {
  createTieredCache,
  createKeyedCache,
  purgeRegisteredCaches,
  purgeSingleCacheByName,
  recordEdgeHtmlCacheResult,
  getGlobalCacheStatsSnapshot,
  resetGlobalCacheStats,
} from '../src/utils/cache.js';

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

  assert.equal(normalized.malicious.autoBanOnRateAbuse, true);
  assert.equal(normalized.bot.blockSeoBots, false);
  assert.equal(normalized.bot.blockAiCrawlers, false);
  assert.equal(normalized.bot.blockScannerTools, true);
  assert.equal(normalized.bot.blockUaRotation, true);
  assert.equal(normalized.bot.customBlockedUa, 'MyScraper');
  assert.equal(WAF_CONDITION_CATALOG.block_malicious_ips.length, 8);
  assert.equal(WAF_CONDITION_CATALOG.strict_rate_limiting.length, 3);
  assert.equal(WAF_CONDITION_CATALOG.bot_challenge.length, 7);
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

test('EdgeWafService suppresses duplicate block logs while blocked and resumes after unlock', () => {
  EdgeWafService.clearAllStrikes();
  const now = 1_700_000_000_000;

  // 1. Auto-ban scenario: initial violation logs, repeats suppress, ban trigger logs once, subsequent banned hits suppress, post-unlock resumes
  const malSettings = {
    waf_active_modes: ['block_malicious_ips'] as ('block_malicious_ips')[],
    waf_rule_config: normalizeWafRuleConfig({
      malicious: { strikeLimit: 3, banDurationMinutes: 5 },
    }),
  };

  const strike1 = EdgeWafService.evaluate({ clientIp: '198.51.100.88', pathname: '/wp-login.php', headers: BROWSER_HEADERS, now }, malSettings);
  assert.equal(strike1.allowed, false);
  assert.ok(!strike1.suppressLog);

  const strike2 = EdgeWafService.evaluate({ clientIp: '198.51.100.88', pathname: '/.env', headers: BROWSER_HEADERS, now: now + 1000 }, malSettings);
  assert.equal(strike2.allowed, false);
  assert.equal(strike2.suppressLog, true);

  // Static asset should NOT clear suppression
  assert.equal(EdgeWafService.evaluate({ clientIp: '198.51.100.88', pathname: '/favicon.ico', headers: BROWSER_HEADERS, now: now + 1500 }, malSettings).allowed, true);

  // Strike 3 triggers auto-ban (logs ban event once)
  const strike3 = EdgeWafService.evaluate({ clientIp: '198.51.100.88', pathname: '/phpmyadmin', headers: BROWSER_HEADERS, now: now + 2000 }, malSettings);
  assert.equal(strike3.allowed, false);
  assert.equal(strike3.autoBanned, true);
  assert.ok(!strike3.suppressLog);

  // Repeated hits while auto-banned are suppressed and accumulate hitCount
  for (let i = 1; i <= 3; i++) {
    const repeatBanHit = EdgeWafService.evaluate({ clientIp: '198.51.100.88', pathname: `/spam-${i}`, headers: BROWSER_HEADERS, now: now + 3000 + i * 1000 }, malSettings);
    assert.equal(repeatBanHit.allowed, false);
    assert.equal(repeatBanHit.autoBanned, true);
    assert.equal(repeatBanHit.suppressLog, true);
    assert.equal(repeatBanHit.blockStats?.hitCount, i + 1);
  }

  // Admin unlocks via clearAllStrikes -> clean request passes, next violation logs normally again
  EdgeWafService.clearAllStrikes();
  assert.equal(EdgeWafService.evaluate({ clientIp: '198.51.100.88', pathname: '/', headers: BROWSER_HEADERS, now: now + 10_000 }, malSettings).allowed, true);
  const postUnlockHit = EdgeWafService.evaluate({ clientIp: '198.51.100.88', pathname: '/wp-login.php', headers: BROWSER_HEADERS, now: now + 11_000 }, malSettings);
  assert.equal(postUnlockHit.allowed, false);
  assert.ok(!postUnlockHit.suppressLog);

  // 2. Manual blacklist + unblocking via allowed request (e.g. IP removed from blacklist or whitelisted)
  const ip = '203.0.113.77';
  const blk1 = EdgeWafService.evaluate({ clientIp: ip, pathname: '/', headers: BROWSER_HEADERS, now }, { waf_active_modes: ['block_malicious_ips'], waf_blocked_ips: ip });
  assert.equal(blk1.allowed, false);
  assert.ok(!blk1.suppressLog);

  const blk2 = EdgeWafService.evaluate({ clientIp: ip, pathname: '/products', headers: BROWSER_HEADERS, now: now + 500 }, { waf_active_modes: ['block_malicious_ips'], waf_blocked_ips: ip });
  assert.equal(blk2.allowed, false);
  assert.equal(blk2.suppressLog, true);
  assert.equal(blk2.blockStats?.hitCount, 2);

  // IP unblocked (passes clean request) -> suppression cleared; if blocked again later, logs once
  assert.equal(EdgeWafService.evaluate({ clientIp: ip, pathname: '/', headers: BROWSER_HEADERS, now: now + 1000 }, { waf_active_modes: ['block_malicious_ips'], waf_blocked_ips: '' }).allowed, true);
  const blkReblocked = EdgeWafService.evaluate({ clientIp: ip, pathname: '/', headers: BROWSER_HEADERS, now: now + 2000 }, { waf_active_modes: ['block_malicious_ips'], waf_blocked_ips: ip });
  assert.equal(blkReblocked.allowed, false);
  assert.ok(!blkReblocked.suppressLog);
  assert.equal(blkReblocked.blockStats?.hitCount, 1);

  // 3. Rate limit (429) accumulates hitCount across suppressed repeats in same window
  const rlSettings = {
    waf_active_modes: ['strict_rate_limiting'] as ('strict_rate_limiting')[],
    waf_rule_config: normalizeWafRuleConfig({ rateLimit: { windowSeconds: 30, publicWriteLimit: 1 } }),
  };
  const rlIp = '203.0.113.88';
  assert.equal(EdgeWafService.evaluate({ clientIp: rlIp, pathname: '/api/submit-quote', method: 'POST', headers: BROWSER_HEADERS, now }, rlSettings).allowed, true);
  const rl1 = EdgeWafService.evaluate({ clientIp: rlIp, pathname: '/api/submit-quote', method: 'POST', headers: BROWSER_HEADERS, now: now + 100 }, rlSettings);
  assert.equal(rl1.status, 429);
  assert.ok(!rl1.suppressLog);
  assert.equal(rl1.blockStats?.hitCount, 1);

  const rl2 = EdgeWafService.evaluate({ clientIp: rlIp, pathname: '/api/submit-quote', method: 'POST', headers: BROWSER_HEADERS, now: now + 200 }, rlSettings);
  assert.equal(rl2.status, 429);
  assert.equal(rl2.suppressLog, true);
  assert.equal(rl2.blockStats?.hitCount, 2);

  // Interleaving benign GET / must NOT reset 429 log suppression
  assert.equal(EdgeWafService.evaluate({ clientIp: rlIp, pathname: '/', headers: BROWSER_HEADERS, now: now + 250 }, rlSettings).allowed, true);
  const rl3 = EdgeWafService.evaluate({ clientIp: rlIp, pathname: '/api/submit-quote', method: 'POST', headers: BROWSER_HEADERS, now: now + 300 }, rlSettings);
  assert.equal(rl3.status, 429);
  assert.equal(rl3.suppressLog, true);
  assert.equal(rl3.blockStats?.hitCount, 3);
});

test('EdgeWafService P0/P1/P2: anti-lockout, well-known, double-encoding, header scan, not_contains, country, unbanIp & dryRun', () => {
  EdgeWafService.clearAllStrikes();
  const now = 1_700_000_000_000;

  // P0: Legitimate .well-known paths allowed; malicious .well-known/.env blocked
  assert.equal(EdgeWafService.isBlockedProbePath('/.well-known/acme-challenge/token123'), false);
  assert.equal(EdgeWafService.isBlockedProbePath('/.well-known/security.txt'), false);
  assert.equal(EdgeWafService.isBlockedProbePath('/.well-known/unknown-probe'), true);

  // P0: Auth login/callback & authenticated admins are never locked out even under aggressive custom rule
  const lockCfg = normalizeWafRuleConfig({
    customRules: [
      { id: 'c_all', enabled: true, field: 'path_matches', operator: 'starts_with', value: '/', action: 'block_403' },
    ],
  });
  const lockSettings = { waf_active_modes: ['block_malicious_ips'] as ('block_malicious_ips')[], waf_rule_config: lockCfg };
  assert.equal(EdgeWafService.evaluate({ clientIp: '198.51.100.1', pathname: '/admin/login', headers: BROWSER_HEADERS, now }, lockSettings).allowed, true);
  assert.equal(EdgeWafService.evaluate({ clientIp: '198.51.100.1', pathname: '/api/auth/login', headers: BROWSER_HEADERS, now }, lockSettings).allowed, true);
  assert.equal(EdgeWafService.evaluate({ clientIp: '198.51.100.1', pathname: '/api/auth/callback', headers: BROWSER_HEADERS, now }, lockSettings).allowed, true);
  assert.equal(EdgeWafService.evaluate({ clientIp: '198.51.100.1', pathname: '/admin/orders', headers: BROWSER_HEADERS, isAuthenticatedAdmin: true, now }, lockSettings).allowed, true);
  assert.equal(EdgeWafService.evaluate({ clientIp: '198.51.100.1', pathname: '/products', headers: BROWSER_HEADERS, now }, lockSettings).allowed, false);

  // P1: Double-URL-encoded XSS & SQLi in Referer header blocked
  const malSettings = { waf_active_modes: ['block_malicious_ips'] as ('block_malicious_ips')[] };
  assert.equal(
    EdgeWafService.evaluate({ clientIp: '198.51.100.40', pathname: '/products', search: '?q=%253Cscript%253Ealert(1)%253C%252Fscript%253E', headers: BROWSER_HEADERS, now }, malSettings).code,
    'WAF_MALICIOUS_PAYLOAD'
  );
  assert.equal(
    EdgeWafService.evaluate({ clientIp: '198.51.100.41', pathname: '/products', headers: new Headers({ referer: 'https://evil.com/?x=1 UNION SELECT password FROM users' }), now }, malSettings).code,
    'WAF_MALICIOUS_PAYLOAD'
  );

  // P1: not_contains, country_equals, and per-rule custom 429 limit
  const advSettings = {
    waf_active_modes: [],
    waf_rule_config: normalizeWafRuleConfig({
      customRules: [
        { id: 'c_origin', enabled: true, field: 'header_contains', headerName: 'origin', operator: 'not_contains', value: 'gwenvenni.com', action: 'block_403' },
        { id: 'c_country', enabled: true, field: 'country_equals', operator: 'equals', value: 'XX', action: 'block_403' },
        { id: 'c_ua_limit', enabled: true, field: 'ua_contains', operator: 'contains', value: 'TestBot', action: 'rate_limit_429', limit: 2 },
      ],
    }),
  };
  // Missing origin matches not_contains -> 403; matching origin -> passes first rule
  assert.equal(
    EdgeWafService.evaluate({ clientIp: '198.51.100.50', pathname: '/api/x', headers: new Headers({}), country: 'US', now }, advSettings).status,
    403
  );
  assert.equal(
    EdgeWafService.evaluate({ clientIp: '198.51.100.50', pathname: '/api/x', headers: new Headers({ origin: 'https://gwenvenni.com' }), country: 'XX', now }, advSettings).status,
    403
  );
  for (let i = 0; i < 2; i++) {
    assert.equal(
      EdgeWafService.evaluate({ clientIp: '198.51.100.50', pathname: '/products', headers: new Headers({ origin: 'https://gwenvenni.com' }), country: 'US', userAgent: 'TestBot/1.0', now: now + i * 10 }, advSettings).allowed,
      true
    );
  }
  assert.equal(
    EdgeWafService.evaluate({ clientIp: '198.51.100.50', pathname: '/products', headers: new Headers({ origin: 'https://gwenvenni.com' }), country: 'US', userAgent: 'TestBot/1.0', now: now + 30 }, advSettings).status,
    429
  );

  // P2: dryRun does not mutate strikes, getActiveBans & unbanIp work on single IP
  EdgeWafService.clearAllStrikes();
  const dry = EdgeWafService.evaluate({ clientIp: '198.51.100.60', pathname: '/.env', headers: BROWSER_HEADERS, dryRun: true, now }, {
    waf_active_modes: ['block_malicious_ips'],
    waf_rule_config: normalizeWafRuleConfig({ malicious: { strikeLimit: 1 } }),
  });
  assert.equal(dry.allowed, false);
  assert.equal(EdgeWafService.getActiveBans(now).length, 0);

  // Real ban & single IP unban
  EdgeWafService.evaluate({ clientIp: '198.51.100.61', pathname: '/.env', headers: BROWSER_HEADERS, now }, {
    waf_active_modes: ['block_malicious_ips'],
    waf_rule_config: normalizeWafRuleConfig({ malicious: { strikeLimit: 1, banDurationMinutes: 10 } }),
  });
  const bans = EdgeWafService.getActiveBans(now);
  assert.equal(bans.length, 1);
  assert.equal(bans[0].ip, '198.51.100.61');
  assert.equal(EdgeWafService.unbanIp('198.51.100.61'), true);
  assert.equal(EdgeWafService.getActiveBans(now).length, 0);
});

test('EdgeWafService auto-bans spoofed bot UA rotation and persistent 429 flood abuse without false positives', () => {
  EdgeWafService.clearAllStrikes();
  const now = 1_700_000_000_000;

  // 1. Spoofed bot UA rotation (matches real prod settings where blockAiCrawlers=false)
  const rotSettings = {
    waf_active_modes: ['block_malicious_ips', 'bot_challenge'] as ('block_malicious_ips' | 'bot_challenge')[],
    waf_rule_config: normalizeWafRuleConfig({
      malicious: { enableAutoBan: true, strikeLimit: 3, banDurationMinutes: 20 },
      bot: { blockAiCrawlers: false, blockSeoBots: true, blockUaRotation: true },
    }),
  };

  // Same vendor multiple requests from legitimate crawler IP must NOT trigger rotation ban
  const legitIp = '66.249.66.1';
  for (let i = 0; i < 4; i++) {
    assert.equal(
      EdgeWafService.evaluate(
        { clientIp: legitIp, pathname: '/products', userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', now: now + i * 50 },
        rotSettings
      ).allowed,
      true
    );
  }
  // Corporate NAT sharing Safari + Chrome + Edge browsers must NOT trigger bot rotation
  const natIp = '198.51.100.70';
  for (const ua of [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/126.0.0.0',
  ]) {
    assert.equal(EdgeWafService.evaluate({ clientIp: natIp, pathname: '/products', userAgent: ua, now }, rotSettings).allowed, true);
  }

  // Attacker IP rotating >= 3 bot vendor families gets blocked & escalated to Auto-Ban
  const spoofIp = '35.198.52.23';
  assert.equal(EdgeWafService.evaluate({ clientIp: spoofIp, pathname: '/', userAgent: 'Mozilla/5.0 (compatible; Baiduspider/2.0)', now }, rotSettings).allowed, true);
  assert.equal(EdgeWafService.evaluate({ clientIp: spoofIp, pathname: '/', userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.4)', now: now + 10 }, rotSettings).allowed, true);
  // 3rd distinct bot vendor -> 403 strike #1
  const r3 = EdgeWafService.evaluate({ clientIp: spoofIp, pathname: '/', userAgent: 'Mozilla/5.0 (compatible; Qwenbot/1.0)', now: now + 20 }, rotSettings);
  assert.equal(r3.allowed, false);
  assert.equal(r3.status, 403);
  // 2 more rotating hits -> strike #3 -> Auto-Ban (WAF_MALICIOUS_IP)
  EdgeWafService.evaluate({ clientIp: spoofIp, pathname: '/', userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)', now: now + 30 }, rotSettings);
  const r5 = EdgeWafService.evaluate({ clientIp: spoofIp, pathname: '/', userAgent: 'Mozilla/5.0 (compatible; Bytespider)', now: now + 40 }, rotSettings);
  assert.equal(r5.status, 403);
  assert.equal(r5.code, 'WAF_MALICIOUS_IP');
  assert.equal(r5.autoBanned, true);
  // Subsequent plain browser request from same IP is now fast-blocked for 20m
  const followUp = EdgeWafService.evaluate({ clientIp: spoofIp, pathname: '/products', userAgent: 'Mozilla/5.0 Chrome/126.0', now: now + 50 }, rotSettings);
  assert.equal(followUp.status, 403);
  assert.equal(followUp.code, 'WAF_MALICIOUS_IP');

  // 2. Persistent 429 flood abuse escalates to Auto-Ban after excess hits, while minor 429 does not
  EdgeWafService.clearAllStrikes();
  const abuseSettings = {
    waf_active_modes: ['block_malicious_ips', 'strict_rate_limiting'] as ('block_malicious_ips' | 'strict_rate_limiting')[],
    waf_rule_config: normalizeWafRuleConfig({
      malicious: { enableAutoBan: true, autoBanOnRateAbuse: true, strikeLimit: 3, banDurationMinutes: 20 },
      rateLimit: { windowSeconds: 60, pageLimit: 5 },
    }),
  };
  const floodIp = '34.65.85.51';
  for (let i = 0; i < 5; i++) {
    assert.equal(EdgeWafService.evaluate({ clientIp: floodIp, pathname: '/', headers: BROWSER_HEADERS, now }, abuseSettings).allowed, true);
  }
  // Excess 1..29 returns 429 without banning yet
  for (let ex = 1; ex < 30; ex++) {
    const res = EdgeWafService.evaluate({ clientIp: floodIp, pathname: '/', headers: BROWSER_HEADERS, now: now + ex }, abuseSettings);
    assert.equal(res.status, 429);
  }
  // Excess 30 triggers 3rd strike -> 403 Auto-Ban
  const escalated = EdgeWafService.evaluate({ clientIp: floodIp, pathname: '/', headers: BROWSER_HEADERS, now: now + 40 }, abuseSettings);
  assert.equal(escalated.status, 403);
  assert.equal(escalated.code, 'WAF_MALICIOUS_IP');
  assert.equal(escalated.autoBanned, true);

  // 3. Custom rule rate_limit_429 also escalates into Auto-Ban via shared buildRateLimitBlockResult
  EdgeWafService.clearAllStrikes();
  const customAbuseSettings = {
    waf_active_modes: ['block_malicious_ips'] as ('block_malicious_ips')[],
    waf_rule_config: normalizeWafRuleConfig({
      malicious: { enableAutoBan: true, autoBanOnRateAbuse: true, strikeLimit: 3, banDurationMinutes: 20 },
      customRules: [
        { id: 'c_rl', enabled: true, field: 'path_matches', operator: 'starts_with', value: '/products', action: 'rate_limit_429', limit: 2 },
      ],
    }),
  };
  const crIp = '198.51.100.88';
  for (let i = 0; i < 2; i++) {
    assert.equal(EdgeWafService.evaluate({ clientIp: crIp, pathname: '/products', headers: BROWSER_HEADERS, now }, customAbuseSettings).allowed, true);
  }
  for (let ex = 1; ex < 30; ex++) {
    assert.equal(EdgeWafService.evaluate({ clientIp: crIp, pathname: '/products', headers: BROWSER_HEADERS, now: now + ex }, customAbuseSettings).status, 429);
  }
  const crBan = EdgeWafService.evaluate({ clientIp: crIp, pathname: '/products', headers: BROWSER_HEADERS, now: now + 40 }, customAbuseSettings);
  assert.equal(crBan.status, 403);
  assert.equal(crBan.code, 'WAF_MALICIOUS_IP');
  assert.equal(crBan.autoBanned, true);
  // Follow-up hit stays 403 while banned
  assert.equal(EdgeWafService.evaluate({ clientIp: crIp, pathname: '/products', headers: BROWSER_HEADERS, now: now + 50 }, customAbuseSettings).status, 403);
});

test('EdgeTieredCache provides unified L1 pre-compiled -> L2 KV -> L3 DB lifecycle', async () => {
  const kvStore = new Map<string, string>();
  const mockEnv = {
    CACHE_KV: {
      get: async (k: string) => kvStore.get(k) ?? null,
      put: async (k: string, v: string) => {
        kvStore.set(k, v);
      },
      delete: async (k: string) => {
        kvStore.delete(k);
      },
    },
  };

  let dbFetchCount = 0;
  let compileCount = 0;
  let dbVersion = 1;

  const cache = createTieredCache<{ items: string[] }, { set: Set<string>; version: number }>({
    name: 'test_waf',
    kvKey: 'test:waf:v1',
    ttlMs: 5_000,
    fallbackRaw: { items: [] },
    compile: (raw) => {
      compileCount += 1;
      return { set: new Set(raw.items), version: compileCount };
    },
    fetchRaw: async () => {
      dbFetchCount += 1;
      return { data: { items: [`v${dbVersion}`, 'rule-a'] }, persistToKv: true };
    },
  });

  // 1. Cold miss: hits L3 DB once, compiles once, populates L1 & L2 KV
  const first = await cache.get(mockEnv);
  assert.equal(first.set.has('v1'), true);
  assert.equal(dbFetchCount, 1);
  assert.equal(compileCount, 1);

  // Wait briefly for runInBackground KV write
  await new Promise((r) => setTimeout(r, 15));
  assert.ok(kvStore.has('test:waf:v1'));

  // 2. Hot L1 hit: 0 DB fetches, 0 recompilations
  const second = await cache.get(mockEnv);
  assert.equal(second.version, first.version);
  assert.equal(dbFetchCount, 1);
  assert.equal(compileCount, 1);

  // 3. L1 invalidated (simulating another Isolate or TTL expiry): reads from L2 KV, compiles once, 0 DB calls!
  cache.invalidate();
  const fromKv = await cache.get(mockEnv);
  assert.equal(fromKv.set.has('v1'), true);
  assert.equal(dbFetchCount, 1);
  assert.equal(compileCount, 2);

  // 4. Explicit refresh (simulating DB mutation): reads L3 DB, compiles, updates L2 KV
  dbVersion = 2;
  const refreshed = await cache.refresh(mockEnv);
  assert.equal(refreshed.set.has('v2'), true);
  assert.equal(dbFetchCount, 2);
  assert.equal(compileCount, 3);
  assert.match(kvStore.get('test:waf:v1') || '', /"v2"/);

  // 5. Evict clears L1 and L2 KV
  await cache.evict(mockEnv);
  assert.equal(cache.peek(), null);
  assert.equal(kvStore.has('test:waf:v1'), false);

  // 6. L1-only cache mode (no kvKey) with seed() & onUpdate() hook
  let onUpdateCount = 0;
  let l1FetchCount = 0;
  const l1OnlyCache = createTieredCache<{ tag: string }>({
    name: 'test_l1_only',
    ttlMs: 5_000,
    fallbackRaw: { tag: 'fallback' },
    onUpdate: () => {
      onUpdateCount += 1;
    },
    fetchRaw: async () => {
      l1FetchCount += 1;
      return { data: { tag: 'db' }, persistToKv: false };
    },
  });
  l1OnlyCache.seed({ tag: 'seeded' });
  assert.equal(l1OnlyCache.peek()?.tag, 'seeded');
  assert.equal(onUpdateCount, 1);
  assert.equal((await l1OnlyCache.get(mockEnv)).tag, 'seeded');
  assert.equal(l1FetchCount, 0);
  await l1OnlyCache.evict(mockEnv);
  assert.equal((await l1OnlyCache.get(mockEnv)).tag, 'db');
  assert.equal(l1FetchCount, 1);
  assert.equal(onUpdateCount, 2);
});

test('EdgeTieredCache avoids @epoch KV duplication and purgeLegacyEpochKvKeys cleans legacy @ keys', async () => {
  const { purgeLegacyEpochKvKeys } = await import('../src/utils/cache');
  const kvStore = new Map<string, string>([
    ['cms:product_slugs:v1@1795118776915', '[]'],
    ['cms:siteConfig@1795118776916', '{}'],
    ['cms:siteConfig', '{}'],
  ]);
  const mockEnv = {
    CACHE_KV: {
      get: async (k: string) => kvStore.get(k) ?? null,
      put: async (k: string, v: string) => {
        kvStore.set(k, v);
      },
      delete: async (k: string) => {
        kvStore.delete(k);
      },
      list: async (opts?: { cursor?: string }) => {
        const all = Array.from(kvStore.keys()).map((name) => ({ name }));
        if (!opts?.cursor) {
          return { keys: all.slice(0, 2), list_complete: false, cursor: 'p2' };
        }
        return { keys: all.slice(2), list_complete: true };
      },
    },
  };

  const epochCache = createTieredCache<{ ok: boolean }, { ok: boolean }>({
    name: 'test_no_epoch_dup',
    kvKey: 'test:no_epoch:v1',
    epochKey: '__test_no_epoch',
    ttlMs: 5_000,
    fallbackRaw: { ok: false },
    compile: (raw) => raw,
    fetchRaw: async () => ({ data: { ok: true }, persistToKv: true }),
  });

  await epochCache.get(mockEnv, { syncKv: true });
  assert.equal(kvStore.has('test:no_epoch:v1'), true);
  assert.equal(kvStore.has('cms:route_revs'), false, 'passive L3 backfill must not bump cms:route_revs');

  await epochCache.refresh(mockEnv);
  assert.equal(kvStore.has('cms:route_revs'), true, 'explicit refresh must bump cms:route_revs');
  assert.equal(
    Array.from(kvStore.keys()).some((k) => k.startsWith('test:no_epoch:v1@')),
    false,
    'must not write @epoch duplicate key'
  );

  const deletedCount = await purgeLegacyEpochKvKeys(mockEnv);
  assert.equal(deletedCount, 2);
  assert.equal(kvStore.has('cms:product_slugs:v1@1795118776915'), false);
  assert.equal(kvStore.has('cms:siteConfig@1795118776916'), false);
  assert.equal(kvStore.has('cms:siteConfig'), true);
  assert.equal(kvStore.has('test:no_epoch:v1'), true);
});

test('Compiled DB WAF runtime enforces ReDoS protection, composite ALL/ANY rules, priority allow, shadow log_only, strike_weight & expires_at', () => {
  EdgeWafService.clearAllStrikes();
  const now = 1_700_000_000_000;

  // ReDoS checks
  assert.equal(validateRegexSafety('(a+)+').valid, false);
  assert.equal(validateRegexSafety('([a-z]+)*').valid, false);
  assert.equal(validateRegexSafety('a'.repeat(300)).valid, false);
  assert.equal(compileSafeRegex('(a+)+'), null);
  assert.ok(compileSafeRegex('^/products/custom-[0-9]+$') instanceof RegExp);

  const dbRules = [
    ...buildSystemWafRulesSeed(),
    {
      id: 'cr_allow_vip_ip',
      category: 'custom' as const,
      name: 'Allow VIP Partner CIDR Early',
      is_system: 0,
      is_enabled: 1,
      priority: 5,
      conditions_json: JSON.stringify([{ field: 'ip', op: 'equals', value: '198.51.200.0/24' }]),
      match_mode: 'ALL' as const,
      action: 'allow' as const,
      rate_limit_json: '{}',
      strike_weight: 0,
      expires_at: null,
    },
    {
      id: 'cr_shadow_test',
      category: 'custom' as const,
      name: 'Shadow Observe /beta',
      is_system: 0,
      is_enabled: 1,
      priority: 20,
      conditions_json: JSON.stringify([{ field: 'path', op: 'starts_with', value: '/beta' }]),
      match_mode: 'ALL' as const,
      action: 'log_only' as const,
      rate_limit_json: '{}',
      strike_weight: 0,
      expires_at: null,
    },
    {
      id: 'cr_composite_and',
      category: 'custom' as const,
      name: 'Composite POST /api/submit-quote from XX',
      is_system: 0,
      is_enabled: 1,
      priority: 40,
      conditions_json: JSON.stringify([
        { field: 'method', op: 'equals', value: 'POST' },
        { field: 'path', op: 'starts_with', value: '/api/submit-quote' },
        { field: 'country', op: 'equals', value: 'XX' },
      ]),
      match_mode: 'ALL' as const,
      action: 'block_403' as const,
      rate_limit_json: '{}',
      strike_weight: 3, // Instant 1-hit auto-ban!
      expires_at: null,
    },
    {
      id: 'cr_expired',
      category: 'custom' as const,
      name: 'Expired Emergency Rule',
      is_system: 0,
      is_enabled: 1,
      priority: 15,
      conditions_json: JSON.stringify([{ field: 'path', op: 'equals', value: '/expired-test' }]),
      match_mode: 'ALL' as const,
      action: 'block_403' as const,
      rate_limit_json: '{}',
      strike_weight: 0,
      expires_at: '2020-01-01 00:00:00',
    },
    {
      id: 'cr_redos_downgrade',
      category: 'custom' as const,
      name: 'Downgraded Unsafe Regex Fallback',
      is_system: 0,
      is_enabled: 1,
      priority: 45,
      conditions_json: JSON.stringify([{ field: 'query', op: 'regex', value: '(a+)+' }]),
      match_mode: 'ALL' as const,
      action: 'block_403' as const,
      rate_limit_json: '{}',
      strike_weight: 0,
      expires_at: null,
    },
  ];

  const runtime = compileWafRuntime({
    rules: dbRules,
    ipAcl: [
      { ip_cidr: '203.0.113.77', list_type: 'BLACKLIST', reason: 'Manual DB Ban', expires_at: null },
      { ip_cidr: '203.0.113.88', list_type: 'AUTO_BAN', reason: 'Cross-Node DB Ban', expires_at: new Date(now + 60_000).toISOString().slice(0, 19).replace('T', ' ') },
    ],
  });

  const settings = { waf_active_modes: ['block_malicious_ips'] as ('block_malicious_ips')[] };

  // Pre-compiled DB BLACKLIST & timed AUTO_BAN enforce across nodes
  assert.equal(EdgeWafService.evaluate({ clientIp: '203.0.113.77', pathname: '/', headers: BROWSER_HEADERS, now }, settings, runtime).status, 403);
  assert.equal(EdgeWafService.evaluate({ clientIp: '203.0.113.88', pathname: '/', headers: BROWSER_HEADERS, now }, settings, runtime).autoBanned, true);
  // Expired AUTO_BAN (now + 120s) is allowed
  assert.equal(EdgeWafService.evaluate({ clientIp: '203.0.113.88', pathname: '/', headers: BROWSER_HEADERS, now: now + 120_000 }, settings, runtime).allowed, true);

  // Priority 5 custom allow rule bypasses .env probe check
  assert.equal(EdgeWafService.evaluate({ clientIp: '198.51.200.42', pathname: '/.env', headers: BROWSER_HEADERS, now }, settings, runtime).allowed, true);

  // Shadow mode allows request while attaching shadowMatch
  const shadow = EdgeWafService.evaluate({ clientIp: '198.51.100.1', pathname: '/beta/feature', headers: BROWSER_HEADERS, now }, settings, runtime);
  assert.equal(shadow.allowed, true);
  assert.equal(shadow.shadowMatch?.ruleId, 'cr_shadow_test');

  // Expired rule skipped
  assert.equal(EdgeWafService.evaluate({ clientIp: '198.51.100.1', pathname: '/expired-test', headers: BROWSER_HEADERS, now }, settings, runtime).allowed, true);

  // Unsafe regex downgraded to literal substring match (no crash; only blocks literal '(a+)+' substring)
  assert.equal(EdgeWafService.evaluate({ clientIp: '198.51.100.1', pathname: '/products', search: '?q=aaaa', headers: BROWSER_HEADERS, now }, settings, runtime).allowed, true);
  assert.equal(EdgeWafService.evaluate({ clientIp: '198.51.100.1', pathname: '/products', search: '?q=%28a%2B%29%2B', headers: BROWSER_HEADERS, now }, settings, runtime).status, 403);

  // Composite ALL condition with strike_weight=3 auto-bans on 1st hit
  const nonMatchCountry = EdgeWafService.evaluate({ clientIp: '198.51.100.2', pathname: '/api/submit-quote', method: 'POST', country: 'US', headers: BROWSER_HEADERS, now }, settings, runtime);
  assert.equal(nonMatchCountry.allowed, true);
  const strike3 = EdgeWafService.evaluate({ clientIp: '198.51.100.2', pathname: '/api/submit-quote', method: 'POST', country: 'XX', headers: BROWSER_HEADERS, now }, settings, runtime);
  assert.equal(strike3.status, 403);
  assert.equal(strike3.autoBanned, true);
});

test('IPv6 exact/CIDR matching, timed Ban 24h visibility, and shadow log memory debounce work cleanly', () => {
  EdgeWafService.clearAllStrikes();
  const now = 1_700_000_000_000;

  // 1. IPv6 validation & canonical matching
  assert.equal(isValidIpRule('2a06:98c0:3600::103'), true);
  assert.equal(isValidIpRule('2408:8207::/32'), true);
  assert.equal(isValidIpRule('2001:::1'), false);
  assert.equal(isValidIpRule('2001:db8::/129'), false);
  assert.equal(matchesIpRule('2a06:98c0:3600:0000:0000:0000:0000:0103', ['2a06:98c0:3600::103']), true);
  assert.equal(matchesIpRule('2408:8207:1234::1', ['2408:8207::/32']), true);
  assert.equal(matchesIpRule('2408:8208::1', ['2408:8207::/32']), false);

  const v6Runtime = compileWafRuntime({
    rules: [
      ...buildSystemWafRulesSeed(),
      {
        id: 'cr_shadow_v6',
        category: 'custom',
        name: 'Shadow /observe',
        is_system: 0,
        is_enabled: 1,
        priority: 30,
        conditions_json: JSON.stringify([{ field: 'path', op: 'starts_with', value: '/observe' }]),
        match_mode: 'ALL',
        action: 'log_only',
        rate_limit_json: '{}',
        strike_weight: 0,
        expires_at: null,
      },
    ],
    ipAcl: [
      { ip_cidr: '2a06:98c0:3600::103', list_type: 'BLACKLIST', reason: 'Ban 24h IPv6', expires_at: new Date(now + 86_400_000).toISOString().slice(0, 19).replace('T', ' ') },
      { ip_cidr: '2408:8207::/32', list_type: 'BLACKLIST', reason: 'Permanent v6 CIDR', expires_at: null },
    ],
  });

  const settings = { waf_active_modes: ['block_malicious_ips'] as ('block_malicious_ips')[] };
  assert.equal(EdgeWafService.evaluate({ clientIp: '2a06:98c0:3600:0:0:0:0:103', pathname: '/', headers: BROWSER_HEADERS, now }, settings, v6Runtime).status, 403);
  assert.equal(EdgeWafService.evaluate({ clientIp: '2408:8207:abcd::9', pathname: '/', headers: BROWSER_HEADERS, now }, settings, v6Runtime).status, 403);

  // 2. mergeActiveTimedBans surfaces timed BLACKLIST (Ban 24h) alongside AUTO_BAN, excluding permanent BLACKLIST
  const timedBans = mergeActiveTimedBans(
    [
      { ip_cidr: '2a06:98c0:3600::103', list_type: 'BLACKLIST', reason: 'Ban 24h IPv6', expires_at: new Date(now + 86_400_000).toISOString().slice(0, 19).replace('T', ' ') },
      { ip_cidr: '2408:8207::/32', list_type: 'BLACKLIST', reason: 'Permanent', expires_at: null },
      { ip_cidr: '198.51.100.77', list_type: 'AUTO_BAN', reason: 'Auto-Ban', expires_at: new Date(now + 900_000).toISOString().slice(0, 19).replace('T', ' ') },
    ],
    now
  );
  assert.equal(timedBans.length, 2);
  assert.ok(timedBans.some((b) => b.ip === '2a06:98c0:3600::103'));
  assert.ok(timedBans.some((b) => b.ip === '198.51.100.77'));

  // 3. Shadow (log_only) debounces repeated hits in isolate memory
  const s1 = EdgeWafService.evaluate({ clientIp: '198.51.100.90', pathname: '/observe/test', headers: BROWSER_HEADERS, now }, settings, v6Runtime);
  const s2 = EdgeWafService.evaluate({ clientIp: '198.51.100.90', pathname: '/observe/test', headers: BROWSER_HEADERS, now: now + 100 }, settings, v6Runtime);
  assert.equal(s1.allowed, true);
  assert.equal(s1.shadowMatch?.suppressLog, undefined);
  assert.equal(s1.shadowMatch?.hitCount, 1);
  assert.equal(s2.shadowMatch?.suppressLog, true);
  assert.equal(s2.shadowMatch?.hitCount, 2);
});

test('createKeyedCache zero-copy reads and purgeRegisteredCaches scope dispatch work cleanly', async () => {
  let fetches = 0;
  const obj = { id: 'p1', nested: { title: 'Silk' } };
  const keyed = createKeyedCache<{ id: string; nested: { title: string } }>(
    async (k) => {
      fetches += 1;
      return k === 'p1' ? obj : null;
    },
    { name: 'test_keyed_reg', scope: 'test_scope_a', ttlMs: 5_000, negativeTtlMs: 0 }
  );
  const first = await keyed.get('p1');
  const second = await keyed.get('p1');
  assert.equal(first, obj); // Zero-copy reference (no structuredClone overhead)
  assert.equal(second, first);
  assert.equal(fetches, 1);

  const singleCache = createTieredCache<{ v: number }>({
    name: 'test_tiered_reg',
    scope: 'test_scope_b',
    ttlMs: 5_000,
    fallbackRaw: { v: 0 },
    fetchRaw: async () => ({ v: 1 }),
  });
  singleCache.seed({ v: 9 });
  assert.equal(singleCache.peek()?.v, 9);

  // Purging test_scope_a clears keyed cache without clearing test_scope_b
  const purgedA = await purgeRegisteredCaches('test_scope_a');
  assert.ok(purgedA.includes('test_keyed_reg'));
  assert.equal(singleCache.peek()?.v, 9);
  await keyed.get('p1');
  assert.equal(fetches, 2);

  // Purging 'all' clears test_scope_b too
  const purgedAll = await purgeRegisteredCaches('all');
  assert.ok(purgedAll.includes('test_tiered_reg'));
  assert.equal(singleCache.peek(), null);

  // Telemetry snapshot, Edge HTML counters, purgeSingleCacheByName & resetGlobalCacheStats
  resetGlobalCacheStats();
  await singleCache.get(); // L3 miss -> WARM
  await singleCache.get(); // L1 hit
  recordEdgeHtmlCacheResult('HIT', '/products');
  recordEdgeHtmlCacheResult('MISS', '/about');
  const snap = getGlobalCacheStatsSnapshot();
  assert.ok(snap.l1Hits >= 1);
  assert.equal(snap.edgeHtmlHits, 1);
  assert.equal(snap.edgeHtmlMisses, 1);
  assert.equal(snap.edgeHtmlHitRatePct, 50);
  const singleSnap = snap.partitions.find((p) => p.name === 'test_tiered_reg');
  assert.equal(singleSnap?.l1State, 'WARM');
  assert.equal(singleSnap?.l1Hits, 1);
  assert.equal(singleSnap?.l3Misses, 1);
  assert.equal(await purgeSingleCacheByName('test_tiered_reg'), true);
  assert.equal(singleCache.peek(), null);
  resetGlobalCacheStats();
  assert.equal(getGlobalCacheStatsSnapshot().edgeHtmlHits, 0);

  // existsGuard blocks random 404 penetration with 0 KV/fetcher calls while refresh() bypasses it
  const validSet = new Set(['known-item']);
  let guardedFetches = 0;
  let guardedKvReads = 0;
  const mockKvEnv = {
    CACHE_KV: {
      get: async () => {
        guardedKvReads += 1;
        return null;
      },
      put: async () => {},
      delete: async () => {},
    },
  };
  const guardedCache = createKeyedCache<{ id: string }>(
    async (k) => {
      guardedFetches += 1;
      return k === 'known-item' || k === 'fresh-published' ? { id: k } : null;
    },
    {
      name: 'test_guarded_404',
      scope: 'test_guard_scope',
      kvPrefix: 'test:guard',
      existsGuard: (k) => validSet.has(k),
    }
  );
  assert.equal(await guardedCache.get('random-attack-1', mockKvEnv), null);
  assert.equal(await guardedCache.get('random-attack-2', mockKvEnv), null);
  assert.equal(guardedFetches, 0);
  assert.equal(guardedKvReads, 0);
  const guardSnap = getGlobalCacheStatsSnapshot().partitions.find((p) => p.name === 'test_guarded_404');
  assert.equal(guardSnap?.negativeHits, 2);
  assert.equal(guardSnap?.l1Hits, 2);
  // forceRefresh via refresh() bypasses existsGuard
  const forced = await guardedCache.refresh('fresh-published', mockKvEnv);
  assert.equal(forced?.id, 'fresh-published');
  assert.equal(guardedFetches, 1);
});

test('EdgeWafService sys_legacy_cms_paths returns 404 fast-path without strikes or auto-ban', () => {
  EdgeWafService.clearAllStrikes();
  const now = 1_700_000_000_000;
  const settings = {
    waf_active_modes: ['block_malicious_ips'] as ('block_malicious_ips')[],
    waf_rule_config: normalizeWafRuleConfig({
      malicious: { enableAutoBan: true, strikeLimit: 2, banDurationMinutes: 20 },
    }),
  };

  for (let i = 0; i < 5; i++) {
    const res = EdgeWafService.evaluate(
      { clientIp: '66.249.66.77', pathname: '/product-tag/lighting/', headers: BROWSER_HEADERS, now: now + i * 1000 },
      settings
    );
    assert.equal(res.allowed, false);
    assert.equal(res.status, 404);
    assert.equal(res.code, 'WAF_LEGACY_404');
    assert.equal(res.ruleId, 'sys_legacy_cms_paths');
    assert.equal(res.autoBanned, false);
    assert.equal(res.blockStats?.hitCount, i + 1);
    assert.equal(Boolean(res.suppressLog), i > 0);
  }
  // Crawler IP must NOT be auto-banned and still passes normal routes
  assert.equal(EdgeWafService.getActiveBans(now).length, 0);
  assert.equal(
    EdgeWafService.evaluate({ clientIp: '66.249.66.77', pathname: '/products/cotton-lace', headers: BROWSER_HEADERS, now: now + 6000 }, settings).allowed,
    true
  );
});

test('rebuildEdgePreloadBundle & preloadEdgeIsolate hydrate all L1 caches in 1 KV read and stay warm', async () => {
  process.env.SANITY_PROJECT_ID = process.env.SANITY_PROJECT_ID || 'xvhhd8u0';
  const [{ rebuildEdgePreloadBundle, preloadEdgeIsolate, EDGE_PRELOAD_KV_KEY }, { DEFAULT_SYSTEM_SETTINGS, settingsCache }, { wafRuntimeCache }, { SiteConfigService }, { RfqSettingsService }, { PageService }, { ProductService }] = await Promise.all([
    import('../src/utils/cmsSync.js'),
    import('../src/db/settings.repo.js'),
    import('../src/db/waf.repo.js'),
    import('../src/data/siteConfig.js'),
    import('../src/data/rfqSettings.js'),
    import('../src/data/page.js'),
    import('../src/data/products.js'),
  ]);
  const kvStore = new Map<string, string>();
  let kvReads = 0;
  const mockEnv = {
    CACHE_KV: {
      get: async (k: string) => {
        kvReads += 1;
        return kvStore.get(k) ?? null;
      },
      put: async (k: string, v: string) => {
        kvStore.set(k, v);
      },
      delete: async (k: string) => {
        kvStore.delete(k);
      },
    },
  };

  settingsCache.seed({ ...DEFAULT_SYSTEM_SETTINGS, brand_name: 'PRELOAD_BRAND' });
  wafRuntimeCache.seed({ rules: buildSystemWafRulesSeed(), ipAcl: [] });
  SiteConfigService.seed({ enableImageProxy: false, edgeCacheTtl: 600 } as any);
  RfqSettingsService.seed({ showSwatchKitButton: false } as any);
  PageService.seedSlugs(['home', 'about', 'contact']);
  ProductService.seedSlugs(['silk-slip-001', 'cotton-robe-002']);

  const built = await rebuildEdgePreloadBundle(mockEnv);
  assert.ok(built);
  assert.ok(kvStore.has(EDGE_PRELOAD_KV_KEY));

  // Clear all L1 caches to simulate a fresh cold Cloudflare Isolate
  settingsCache.invalidate();
  wafRuntimeCache.invalidate();
  SiteConfigService.invalidate();
  RfqSettingsService.invalidate();
  PageService.invalidateCache();
  ProductService.invalidateCache();
  kvReads = 0;

  // Cold preload must perform ONLY 1 KV read (edge:preload:v1) and hydrate all 6 L1 modules
  const prevSettingsL2 = settingsCache.getMetricsSnapshot('settings').l2Hits;
  const prevWafL2 = wafRuntimeCache.getMetricsSnapshot('waf').l2Hits;
  const cold = await preloadEdgeIsolate(mockEnv, true);
  assert.equal(kvReads, 1);
  assert.equal(cold.preloadStatus, 'L2_KV_HIT');
  assert.equal(settingsCache.getMetricsSnapshot('settings').l2Hits, prevSettingsL2 + 1);
  assert.equal(wafRuntimeCache.getMetricsSnapshot('waf').l2Hits, prevWafL2 + 1);
  assert.equal(cold.wafSettings?.brand_name, 'PRELOAD_BRAND');
  assert.ok(cold.wafRuntime);
  assert.equal(settingsCache.peek()?.brand_name, 'PRELOAD_BRAND');
  assert.ok(wafRuntimeCache.peek());
  assert.equal(SiteConfigService.peek()?.edgeCacheTtl, 600);
  assert.equal(RfqSettingsService.peek()?.showSwatchKitButton, false);
  assert.deepEqual(PageService.getCachedSlugs(), ['home', 'about', 'contact']);
  assert.deepEqual(ProductService.getCachedSlugs(), ['silk-slip-001', 'cotton-robe-002']);

  // Warm call must perform 0 additional KV reads and increment L1 hit counters
  const prevSettingsL1 = settingsCache.getMetricsSnapshot('settings').l1Hits;
  const prevWafL1 = wafRuntimeCache.getMetricsSnapshot('waf').l1Hits;
  const warm = await preloadEdgeIsolate(mockEnv);
  assert.equal(kvReads, 1);
  assert.equal(warm.preloadStatus, 'L1_HIT');
  assert.equal(settingsCache.getMetricsSnapshot('settings').l1Hits, prevSettingsL1 + 1);
  assert.equal(wafRuntimeCache.getMetricsSnapshot('waf').l1Hits, prevWafL1 + 1);
  assert.equal(warm.wafSettings?.brand_name, 'PRELOAD_BRAND');

  // bumpRouteRevisions must NOT invalidate just-refreshed L1 caches even when KV route_revs differs
  const { bumpRouteRevisions } = await import('../src/utils/cmsSync.js');
  kvStore.set('cms:route_revs', JSON.stringify({ '/': 1, __cms_stale: 1 }));
  await bumpRouteRevisions(['/'], false, mockEnv);
  assert.equal(SiteConfigService.peek()?.edgeCacheTtl, 600);
  assert.equal(RfqSettingsService.peek()?.showSwatchKitButton, false);
  assert.deepEqual(PageService.getCachedSlugs(), ['home', 'about', 'contact']);
  assert.deepEqual(ProductService.getCachedSlugs(), ['silk-slip-001', 'cotton-robe-002']);

  // 30s heartbeat: unchanged cms:route_revs extends L1 window without reloading edge:preload:v1 or bumping l2Hits;
  // changed cms:route_revs (simulating another Isolate) triggers L2_KV_HIT reload
  const origNow = Date.now;
  let fakeNow = origNow() + 31_000;
  Date.now = () => fakeNow;
  try {
    const l2BeforeHeartbeat = settingsCache.getMetricsSnapshot('settings').l2Hits;
    const l1BeforeHeartbeat = settingsCache.getMetricsSnapshot('settings').l1Hits;
    const hbUnchanged = await preloadEdgeIsolate(mockEnv);
    assert.equal(hbUnchanged.preloadStatus, 'L1_HIT');
    assert.equal(settingsCache.getMetricsSnapshot('settings').l2Hits, l2BeforeHeartbeat);
    assert.equal(settingsCache.getMetricsSnapshot('settings').l1Hits, l1BeforeHeartbeat + 1);

    // Simulate another Isolate writing a new routeRev + updated preload bundle to KV
    fakeNow += 31_000;
    const currentBundle = JSON.parse(kvStore.get(EDGE_PRELOAD_KV_KEY) || '{}');
    const remoteRevs = { ...(currentBundle.routeRevs || {}), '/products': fakeNow };
    kvStore.set('cms:route_revs', JSON.stringify(remoteRevs));
    kvStore.set(EDGE_PRELOAD_KV_KEY, JSON.stringify({
      ...currentBundle,
      updatedAt: fakeNow,
      routeRevs: remoteRevs,
      systemSettings: { ...currentBundle.systemSettings, brand_name: 'REMOTE_ISOLATE_BRAND' },
    }));

    const hbChanged = await preloadEdgeIsolate(mockEnv);
    assert.equal(hbChanged.preloadStatus, 'L2_KV_HIT');
    assert.equal(hbChanged.wafSettings?.brand_name, 'REMOTE_ISOLATE_BRAND');

    // Even if cms:route_revs had an out-of-band __dicts bump not yet in bundle.routeRevs,
    // merging heartbeatKvRevs prevents subsequent 30s heartbeats from looping L2_KV_HIT
    fakeNow += 31_000;
    kvStore.set('cms:route_revs', JSON.stringify({ ...remoteRevs, __dicts: fakeNow }));
    const hbDictsSync = await preloadEdgeIsolate(mockEnv);
    assert.equal(hbDictsSync.preloadStatus, 'L2_KV_HIT');
    fakeNow += 31_000;
    const hbDictsSteady = await preloadEdgeIsolate(mockEnv);
    assert.equal(hbDictsSteady.preloadStatus, 'L1_HIT');
  } finally {
    Date.now = origNow;
  }
});

test('RequestProfiler + recordUrlCacheStats tracks per-URL L1/L2/L3 triggers accurately', async () => {
  const { RequestProfiler, requestProfilerStorage } = await import('../src/utils/profiler.js');
  const { recordUrlCacheStats, getGlobalCacheStatsSnapshot, resetGlobalCacheStats } = await import('../src/utils/cache.js');
  resetGlobalCacheStats();

  const p1 = new RequestProfiler();
  await requestProfilerStorage.run(p1, async () => {
    const c = createTieredCache<{ v: number }>({
      name: 'test_url_stats',
      ttlMs: 60_000,
      fallbackRaw: { v: 0 },
      fetchRaw: async () => ({ data: { v: 1 }, persistToKv: false }),
    });
    await c.get(); // L3 miss
    await c.get(); // L1 hit
    recordUrlCacheStats('/products/silk-slip', p1.getCacheTiers());
  });

  const p2 = new RequestProfiler();
  await requestProfilerStorage.run(p2, async () => {
    p2.recordCacheTier('l1');
    p2.recordCacheTier('l1');
    p2.recordCacheTier('l2');
    recordUrlCacheStats('/products/silk-slip', p2.getCacheTiers());
  });

  const snap = getGlobalCacheStatsSnapshot();
  const entry = snap.urlStats.find((u) => u.url === '/products/silk-slip');
  assert.ok(entry);
  assert.equal(entry.requests, 2);
  assert.equal(entry.l1Triggers, 3);
  assert.equal(entry.l2Triggers, 1);
  assert.equal(entry.l3Triggers, 1);

  resetGlobalCacheStats();
  assert.equal(getGlobalCacheStatsSnapshot().urlStats.length, 0);
});
