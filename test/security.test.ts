// test/security.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { SecurityService, maskSecret, isMaskedSecret, sanitizeAdminSettings } from '../src/utils/security.js';
import { createOAuthStateToken, verifyOAuthStateToken, buildLogtoAuthRedirect } from '../src/utils/auth.js';

test('SecurityService.isSafeWebhookUrl allows public HTTPS endpoints and blocks SSRF vectors', () => {
  assert.equal(SecurityService.isSafeWebhookUrl('https://open.feishu.cn/open-apis/bot/v2/hook/abc'), true);
  assert.equal(SecurityService.isSafeWebhookUrl('https://qyapi.weixin.qq.com:443/cgi-bin/webhook/send'), true);

  assert.equal(SecurityService.isSafeWebhookUrl('http://open.feishu.cn/hook'), false);
  assert.equal(SecurityService.isSafeWebhookUrl('https://localhost/hook'), false);
  assert.equal(SecurityService.isSafeWebhookUrl('https://127.0.0.1/hook'), false);
  assert.equal(SecurityService.isSafeWebhookUrl('https://10.0.0.5/hook'), false);
  assert.equal(SecurityService.isSafeWebhookUrl('https://172.16.0.1/hook'), false);
  assert.equal(SecurityService.isSafeWebhookUrl('https://192.168.1.1/hook'), false);
  assert.equal(SecurityService.isSafeWebhookUrl('https://169.254.169.254/latest/meta-data/'), false);
  assert.equal(SecurityService.isSafeWebhookUrl('https://[::1]/hook'), false);
  assert.equal(SecurityService.isSafeWebhookUrl('https://internal.service.local:8443/hook'), false);
  assert.equal(SecurityService.isSafeWebhookUrl('https://example.com:8080/hook'), false);
});

test('maskSecret, isMaskedSecret, and sanitizeAdminSettings redact secret keys safely', () => {
  assert.equal(maskSecret(''), '');
  assert.equal(maskSecret('short'), '••••••••');
  assert.equal(maskSecret('re_1234567890abcdef'), 're_1••••cdef');

  assert.equal(isMaskedSecret('re_1••••cdef'), true);
  assert.equal(isMaskedSecret('••••••••'), true);
  assert.equal(isMaskedSecret('re_1234567890abcdef'), false);

  const sanitized = sanitizeAdminSettings({
    brand_name: 'GWENVENNI',
    resend_api_key: 're_live_secret_token_9988',
    turnstile_secret_key: '0x4AAAAAA_secret_key_1234',
    revalidate_secret: 'my-secret',
    cloudflare_api_token: '',
  });

  assert.equal(sanitized.brand_name, 'GWENVENNI');
  assert.equal(sanitized.resend_api_key, 're_l••••9988');
  assert.equal(sanitized.turnstile_secret_key, '0x4A••••1234');
  assert.equal(sanitized.revalidate_secret, 'my-s••••cret');
  assert.equal(sanitized.cloudflare_api_token, '');
});

test('Stateless HMAC OAuth state token signs, verifies, rejects tampering/expiry, and builds HTTPS redirect', async () => {
  const env = { SESSION_SECRET: 'test-oauth-secret-key-123456' };
  const token = await createOAuthStateToken({ returnUrl: '/account', isPopup: true, ttlSeconds: 3600 }, env);
  const verified = await verifyOAuthStateToken(token, env);
  assert.ok(verified);
  assert.equal(verified.returnUrl, '/account');
  assert.equal(verified.isPopup, true);
  assert.ok(verified.nonce.length > 0);

  // Tampered payload or signature must fail
  assert.equal(await verifyOAuthStateToken(`${token}tampered`, env), null);
  assert.equal(await verifyOAuthStateToken(token, { SESSION_SECRET: 'wrong-secret' }), null);

  // Expired state token must fail
  const expired = await createOAuthStateToken({ returnUrl: '/orders', isPopup: false, ttlSeconds: -10 }, env);
  assert.equal(await verifyOAuthStateToken(expired, env), null);

  // buildLogtoAuthRedirect sets SameSite=None; Secure on HTTPS and Max-Age=3600
  const res = await buildLogtoAuthRedirect({
    request: new Request('https://gwenvenni.com/api/auth/login?returnUrl=/orders'),
    endpoint: 'https://auth.gwenvenni.com',
    appId: 'app_123',
    returnUrl: '/orders',
    isPopup: false,
    cfEnv: env,
  });
  assert.equal(res.status, 302);
  const setCookie = res.headers.get('Set-Cookie') || '';
  assert.match(setCookie, /Max-Age=3600/);
  assert.match(setCookie, /SameSite=None; Secure/);
  const loc = new URL(res.headers.get('Location') || '');
  const stateParam = loc.searchParams.get('state') || '';
  assert.ok(await verifyOAuthStateToken(stateParam, env));
});

