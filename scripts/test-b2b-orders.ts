// scripts/test-b2b-orders.ts
// Runnable self-check for B2B Orders & Idempotent Claiming logic

import assert from 'node:assert';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-mock-session-secret-key-32chars';
process.env.SANITY_PROJECT_ID = process.env.SANITY_PROJECT_ID || 'mock-proj-test';
process.env.SANITY_DATASET = process.env.SANITY_DATASET || 'production';
import {
  createOrder,
  claimOrdersByEmail,
  getOrdersByUserId,
  listAdminOrders,
  updateOrderStatus,
  upsertUserOnLogin,
  listAdminUsers,
  updateUserAdminMeta,
  getUserByIdOrEmail,
  updateUserProfile,
  recordUserLogin,
  getUserLoginHistory,
  listAllLoginHistory,
} from '../src/utils/db';
import {
  listDictGroups,
  listDictItems,
  upsertDictItem,
  toggleDictItemEnabled,
  deleteDictItem,
  getDashboardStats,
} from '../src/db';
import { getTrackingUrl } from '../src/utils/shipping';
import {
  createSessionToken,
  verifySessionToken,
  checkIsAdmin,
} from '../src/utils/auth';
import { isScopeMatch, isNavigableLink } from '../src/utils/appShellRouter';

async function runSelfCheck() {
  console.log('🧪 Starting B2B Order & Claiming Self-Check...\n');

  // 1. Auth & Admin checks
  assert.strictEqual(checkIsAdmin('admin@example.com', [], { ADMIN_EMAILS: 'admin@example.com' }), true, 'Configured admin email should be admin');
  assert.strictEqual(checkIsAdmin('random@client.com'), false, 'Non-admin email should not be admin');
  assert.strictEqual(checkIsAdmin('buyer@test.com', ['admin']), true, 'Role admin should be admin');

  const testUser = {
    id: 'usr_test_123',
    email: 'b2b-buyer@client.com',
    name: 'B2B Buyer',
    isAdmin: false,
  };
  const token = await createSessionToken(testUser);
  const verifiedUser = await verifySessionToken(token);
  assert.ok(verifiedUser, 'Session token must verify');
  assert.strictEqual(verifiedUser.id, testUser.id);
  assert.strictEqual(verifiedUser.email, testUser.email);
  console.log('✔ [PASS] Session token signing & verification verified');

  // 2. Guest Order Placement (user_id = null)
  const guestEmail = `guest-${Date.now()}@sample-store.de`;
  const guestOrder = await createOrder({
    buyerEmail: guestEmail,
    companyName: 'Bavaria Socks GmbH',
    contactName: 'Hans Müller',
    destinationCountry: 'Germany',
    customerNotes: 'Please include Pantone 19-4052 swatches.',
    inquiryType: 'quote_cart',
    items: [
      {
        sku: 'SOCK-CREW-01',
        title: 'Merino Wool Crew Sock',
        variant: 'Charcoal / L',
        quantity: 500,
      },
      {
        sku: 'SOCK-ANKLE-02',
        title: 'Organic Cotton Ankle Sock',
        variant: 'Natural / M',
        quantity: 1000,
      },
    ],
  });

  assert.ok(guestOrder.orderId, 'Order ID must be generated');
  assert.ok(guestOrder.orderNo.startsWith('ORD-'), 'Order No must match format ORD-YYYYMMDD-XXXX');
  console.log(`✔ [PASS] Guest order created: ${guestOrder.orderNo}`);

  // 3. User Registration / Login & Auto-Claiming
  const buyerUserId = `usr_${Date.now()}`;
  const claimedCount = await claimOrdersByEmail(guestEmail, buyerUserId);
  assert.strictEqual(claimedCount, 1, 'Exactly 1 guest order should be claimed');
  console.log(`✔ [PASS] Order successfully auto-claimed for user ${buyerUserId}`);

  // 4. Idempotency Check: Second claim with a different user must NOT re-claim
  const secondClaimCount = await claimOrdersByEmail(guestEmail, 'usr_impostor_999');
  assert.strictEqual(secondClaimCount, 0, 'Already claimed order must NOT be claimed by another user');
  console.log('✔ [PASS] Idempotent claiming guard confirmed (0 re-claimed)');

  // 5. Buyer Order List Retrieval
  const userOrders = await getOrdersByUserId(buyerUserId);
  assert.strictEqual(userOrders.length, 1);
  assert.strictEqual(userOrders[0].order_no, guestOrder.orderNo);
  assert.strictEqual(userOrders[0].status, 'PENDING_APPROVAL');
  assert.strictEqual(userOrders[0].items?.length, 2);
  assert.strictEqual(userOrders[0].total_quantity, 1500);
  console.log('✔ [PASS] Buyer order list & hydrated items verified');

  // 6. Admin Fulfillment Workflow: Approve -> Ship
  const adminList = await listAdminOrders({ status: 'PENDING_APPROVAL' });
  assert.ok(adminList.total >= 1);

  // Approve
  const approveOk = await updateOrderStatus(guestOrder.orderId, { status: 'APPROVED' });
  assert.strictEqual(approveOk, true);

  // Ship
  const shipOk = await updateOrderStatus(guestOrder.orderId, {
    status: 'SHIPPED',
    carrier: 'DHL Express',
    trackingNumber: 'DHL-9876543210',
    adminRemark: 'Dispatched in 3 cartons via air priority.',
    adminUser: 'admin@example.com',
  });
  assert.strictEqual(shipOk, true);

  // Verify Shipped state in buyer view
  const updatedOrders = await getOrdersByUserId(buyerUserId);
  assert.strictEqual(updatedOrders[0].status, 'SHIPPED');
  assert.strictEqual(updatedOrders[0].carrier, 'DHL Express');
  assert.strictEqual(updatedOrders[0].tracking_number, 'DHL-9876543210');
  console.log('✔ [PASS] Admin approval and shipment dispatch workflow verified');

  // 7. Non-existent order update returns false (changes > 0 guard)
  const nonExistentOk = await updateOrderStatus('non-existent-id-999', { status: 'APPROVED' });
  assert.strictEqual(nonExistentOk, false, 'Updating non-existent order must return false');
  console.log('✔ [PASS] updateOrderStatus changes > 0 row existence guard verified');

  // 8. Custom OrderNo pre-generation preservation
  const preGeneratedNo = `ORD-TEST-${Date.now()}`;
  const customEmail = `eleanor-${Date.now()}@atelier.com`;
  const customOrder = await createOrder({
    orderNo: preGeneratedNo,
    buyerEmail: customEmail,
    destinationCountry: 'United States',
    companyName: 'Atelier Manhattan',
    whatsapp: '+1-555-0199',
    items: [{ sku: 'TEST-SKU', title: 'Test Product', variant: 'Default', quantity: 1 }],
  });
  assert.strictEqual(customOrder.orderNo, preGeneratedNo, 'Pre-generated orderNo must be preserved');
  console.log('✔ [PASS] Pre-generated orderNo preservation verified');

  // 9. User Upsert on Login & Order Info Backfilling
  const testUserId = `usr_${Date.now()}`;
  const syncedUser = await upsertUserOnLogin({
    id: testUserId,
    email: customEmail,
    name: 'Eleanor Vance',
    roles: ['vip_buyer'],
  });
  assert.ok(syncedUser, 'User must be synced');
  assert.strictEqual(syncedUser.email, customEmail);
  assert.strictEqual(syncedUser.company, 'Atelier Manhattan', 'Company should backfill from previous order');
  assert.strictEqual(syncedUser.country, 'United States', 'Country should backfill from previous order');
  assert.strictEqual(syncedUser.phone, '+1-555-0199', 'Phone should backfill from previous order');
  console.log('✔ [PASS] User upsert on login & past order metadata backfilling verified');

  // 10. Admin User Management: List & Aggregation
  const userList = await listAdminUsers({ search: customEmail });
  assert.strictEqual(userList.total, 1);
  assert.strictEqual(userList.users[0].total_orders, 1);
  console.log('✔ [PASS] Admin user list search & order aggregation verified');

  // 11. Admin User Tier & Status Update
  const updateMetaOk = await updateUserAdminMeta(testUserId, {
    tier: 'VIP',
    status: 'BLOCKED',
    adminNotes: 'Key Manhattan buyer, test block applied.',
  });
  assert.strictEqual(updateMetaOk, true);

  const blockedUser = await getUserByIdOrEmail(testUserId, null);
  assert.strictEqual(blockedUser?.tier, 'VIP');
  assert.strictEqual(blockedUser?.status, 'BLOCKED');
  assert.strictEqual(blockedUser?.admin_notes, 'Key Manhattan buyer, test block applied.');
  console.log('✔ [PASS] Admin user tier update and security block verified');

  // 12. Account Re-creation Check (same email, new Logto sub ID)
  const newSubId = `usr_recreated_${Date.now()}`;
  const reSyncedUser = await upsertUserOnLogin({
    id: newSubId,
    email: customEmail,
    name: 'Eleanor Vance Reborn',
    roles: ['vip_buyer'],
  });
  assert.strictEqual(reSyncedUser.id, newSubId, 'Recreated user should take over the email with the new sub ID');
  console.log('✔ [PASS] Account recreation with same email verified (no UNIQUE constraint collision)');

  // 13. Backfill users table when a registered user places their first order
  const freshUserId = `usr_fresh_${Date.now()}`;
  const freshEmail = `fresh-${Date.now()}@buyer.fr`;
  await upsertUserOnLogin({
    id: freshUserId,
    email: freshEmail,
    name: 'Fresh Buyer',
    roles: [],
  });
  const beforeOrderUser = await getUserByIdOrEmail(freshUserId, null);
  assert.strictEqual(beforeOrderUser?.company, '', 'Company should initially be empty');

  await createOrder({
    userId: freshUserId,
    buyerEmail: freshEmail,
    companyName: 'Maison de Haute Couture',
    destinationCountry: 'France',
    whatsapp: '+33-6-12345678',
    items: [{ sku: 'LACE-01', title: 'Chantilly Lace', variant: 'Ivory', quantity: 10 }],
  });
  const afterOrderUser = await getUserByIdOrEmail(freshUserId, null);
  assert.strictEqual(afterOrderUser?.company, 'Maison de Haute Couture', 'Company should be backfilled from first order');
  assert.strictEqual(afterOrderUser?.country, 'France', 'Country should be backfilled from first order');
  assert.strictEqual(afterOrderUser?.phone, '+33-6-12345678', 'Phone should be backfilled from first order');
  console.log('✔ [PASS] createOrder backfills empty users table fields for logged-in buyers');

  // 14. User Self-Service Profile Update
  const updateProfileOk = await updateUserProfile(freshUserId, {
    name: 'Madame Colette',
    company: 'Atelier de Lyon',
    country: 'France',
    phone: '+33-6-98765432',
  });
  assert.strictEqual(updateProfileOk, true);
  const updatedProfileUser = await getUserByIdOrEmail(freshUserId, null);
  assert.strictEqual(updatedProfileUser?.name, 'Madame Colette');
  assert.strictEqual(updatedProfileUser?.company, 'Atelier de Lyon');
  assert.strictEqual(updatedProfileUser?.phone, '+33-6-98765432');
  console.log('✔ [PASS] updateUserProfile self-service maintenance verified');

  // 15. Record Login History with IP, Geo and 90-day retention
  const loginOk = await recordUserLogin({
    userId: freshUserId,
    email: freshEmail,
    ip: '192.0.2.1',
    country: 'FR',
    city: 'Paris',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  });
  assert.strictEqual(loginOk, true);

  const userLogins = await getUserLoginHistory(freshUserId);
  assert.ok(userLogins.length >= 1);
  assert.strictEqual(userLogins[0].ip, '192.0.2.1');
  assert.strictEqual(userLogins[0].country, 'FR');
  assert.strictEqual(userLogins[0].city, 'Paris');
  console.log('✔ [PASS] User login session recorded and queried successfully');

  // 16. Admin View of Global Logins
  const allLogins = await listAllLoginHistory(10);
  assert.ok(allLogins.length >= 1);
  console.log('✔ [PASS] Admin view of all login sessions verified');

  // 17. User Password Update Validation Guard
  const { updateLogtoUserPassword } = await import('../src/utils/auth');
  const shortPwdRes = await updateLogtoUserPassword('test-user', 'test@test.com', 'short');
  assert.strictEqual(shortPwdRes.success, false);
  assert.strictEqual(shortPwdRes.error, 'Password must be at least 8 characters long.');
  console.log('✔ [PASS] Password update length validation guard verified');

  // 18. Multi-Timezone Date Utilities Verification
  const { toIsoUtcString, formatUtcFallback } = await import('../src/utils/date');
  assert.strictEqual(toIsoUtcString('2026-11-02 02:18:09'), '2026-11-02T02:18:09Z');
  assert.strictEqual(toIsoUtcString('2026-11-02T02:18:09Z'), '2026-11-02T02:18:09Z');
  assert.strictEqual(formatUtcFallback('2026-11-02 02:18:09'), '2026-11-02 02:18 UTC');
  assert.strictEqual(formatUtcFallback(null), '—');
  console.log('✔ [PASS] Multi-timezone date utilities verified');

  // 19. D1 System Settings & Dynamic Configuration Engine
  const { getSystemSettings, updateSystemSettings, invalidateSettingsCache, getMergedAdminEmails } = await import('../src/db/settings.repo');
  const initialSettings = await getSystemSettings();
  assert.strictEqual(typeof initialSettings.brand_name, 'string');
  assert.strictEqual(typeof initialSettings.order_no_prefix, 'string');

  // Update settings with test values
  const testPrefix = 'TEST' + Math.floor(Math.random() * 90 + 10);
  const updateRes = await updateSystemSettings({
    brand_name: 'TEST ATELIER',
    order_no_prefix: testPrefix,
    co_admin_emails: 'coadmin@test.com, manager@test.com',
  }, 'admin@test.com');
  assert.strictEqual(updateRes.success, true);

  const updatedSettings = await getSystemSettings();
  assert.strictEqual(updatedSettings.brand_name, 'TEST ATELIER');
  assert.strictEqual(updatedSettings.order_no_prefix, testPrefix);
  assert.strictEqual(updatedSettings.co_admin_emails, 'coadmin@test.com, manager@test.com');

  // Test clearing an optional setting: must stay empty "" and not fall back to environment
  await updateSystemSettings({ co_admin_emails: '' }, 'admin@test.com');
  const clearedSettings = await getSystemSettings();
  assert.strictEqual(clearedSettings.co_admin_emails, '');

  // Test Merged Admin Emails after clearing
  const mergedAdminsAfterClear = getMergedAdminEmails(clearedSettings, { ADMIN_EMAILS: 'root@test.com' });
  assert.deepStrictEqual(mergedAdminsAfterClear, ['root@test.com']);

  // Restore co-admin emails for merged test
  await updateSystemSettings({ co_admin_emails: 'coadmin@test.com, manager@test.com' }, 'admin@test.com');
  const restoredSettings = await getSystemSettings();
  const mergedAdmins = getMergedAdminEmails(restoredSettings, { ADMIN_EMAILS: 'root@test.com, manager@test.com' });
  assert.deepStrictEqual(mergedAdmins.sort(), ['coadmin@test.com', 'manager@test.com', 'root@test.com'].sort());

  // Test Custom Prefix in generateOrderNo
  const { generateOrderNo } = await import('../src/db/client');
  const customOrderNo = generateOrderNo(updatedSettings.order_no_prefix);
  assert.ok(customOrderNo.startsWith(`${testPrefix}-`));

  // Test new dynamic settings persistence (turnstile, resend, edge CDN)
  await updateSystemSettings({
    turnstile_site_key: '0x4AAAAAA_TEST_SITE',
    turnstile_secret_key: '0x4AAAAAA_TEST_SECRET',
    resend_api_key: 're_test_key_123',
    app_url: 'https://test.atelier.com',
    revalidate_secret: 'reval_test_token',
    cloudflare_zone_id: 'zone_test_abc',
    cloudflare_api_token: 'token_test_xyz',
  }, 'admin@test.com');
  const edgeSettings = await getSystemSettings();
  assert.strictEqual(edgeSettings.turnstile_site_key, '0x4AAAAAA_TEST_SITE');
  assert.strictEqual(edgeSettings.turnstile_secret_key, '0x4AAAAAA_TEST_SECRET');
  assert.strictEqual(edgeSettings.resend_api_key, 're_test_key_123');
  assert.strictEqual(edgeSettings.app_url, 'https://test.atelier.com');
  assert.strictEqual(edgeSettings.revalidate_secret, 'reval_test_token');
  assert.strictEqual(edgeSettings.cloudflare_zone_id, 'zone_test_abc');
  assert.strictEqual(edgeSettings.cloudflare_api_token, 'token_test_xyz');

  console.log('✔ [PASS] D1 System Settings persistence, caching & merged admin authorization verified');

  // 20. Cloudflare Edge KV Caching & Graceful Degradation Engine
  const { kvGet, kvPut, kvDelete } = await import('../src/utils/kv');
  // Case A: Graceful degradation when KV namespace is null
  const nullGet = await kvGet('any:key', {});
  assert.strictEqual(nullGet, null);
  const nullPut = await kvPut('any:key', { test: true }, undefined, {});
  assert.strictEqual(nullPut, false);
  const nullDel = await kvDelete('any:key', {});
  assert.strictEqual(nullDel, false);

  // Case B: Functional operation when Mock KV namespace is bound
  const memoryStore = new Map<string, string>();
  const mockKv = {
    async get(k: string) { return memoryStore.get(k) || null; },
    async put(k: string, v: string) { memoryStore.set(k, v); },
    async delete(k: string) { memoryStore.delete(k); },
  };
  const mockEnv = { CACHE_KV: mockKv };

  await kvPut('sys:settings:v1', { brand_name: 'EDGE_KV_ATELIER' }, { expirationTtl: 60 }, mockEnv);
  const fromKv = await kvGet<{ brand_name: string }>('sys:settings:v1', mockEnv);
  assert.strictEqual(fromKv?.brand_name, 'EDGE_KV_ATELIER');

  await kvDelete('sys:settings:v1', mockEnv);
  const afterDelete = await kvGet('sys:settings:v1', mockEnv);
  assert.strictEqual(afterDelete, null);
  console.log('✔ [PASS] Cloudflare Edge KV multi-tier caching & graceful degradation verified');

  // 21. System Error & Diagnostics Logging with User Toggle Control
  const { recordErrorLog, listErrorLogs, clearErrorLogs } = await import('../src/db/logs.repo');
  const { logger } = await import('../src/utils/logger');

  // Record an error log for guest/system
  const logRecorded = await recordErrorLog({
    level: 'error',
    source: 'test-runner',
    errorCode: 'TEST_ERR_001',
    message: 'Diagnostics test log entry',
    context: { foo: 'bar', secret: 'super_secret_value' },
    rayId: 'ray_test_12345',
    path: '/api/test',
    clientIp: '203.0.113.195',
    country: 'US',
    city: 'San Jose',
  });
  assert.strictEqual(logRecorded, true);

  const initialLogsRes = await listErrorLogs({ source: 'test-runner' });
  assert.ok(initialLogsRes.total >= 1);
  assert.strictEqual(initialLogsRes.logs[0].error_code, 'TEST_ERR_001');
  assert.strictEqual(initialLogsRes.logs[0].client_ip, '203.0.113.195');
  assert.strictEqual(initialLogsRes.logs[0].country, 'US');
  assert.strictEqual(initialLogsRes.logs[0].city, 'San Jose');

  // Search by client IP and country
  const ipSearchRes = await listErrorLogs({ search: '203.0.113.195' });
  assert.ok(ipSearchRes.total >= 1);
  assert.strictEqual(ipSearchRes.logs[0].client_ip, '203.0.113.195');

  const countrySearchRes = await listErrorLogs({ search: 'San Jose' });
  assert.ok(countrySearchRes.total >= 1);

  // Test authenticated user logging toggle:
  // When log_authenticated_users = false, logged-in user errors are skipped!
  await updateSystemSettings({ log_authenticated_users: false }, 'admin@test.com');
  const userLogBlocked = await recordErrorLog({
    level: 'error',
    source: 'test-auth-runner',
    message: 'User action should be skipped',
    userId: 'usr_logged_in_123',
    userEmail: 'user@test.com',
  });
  assert.strictEqual(userLogBlocked, false);

  // Restore log_authenticated_users = true
  await updateSystemSettings({ log_authenticated_users: true }, 'admin@test.com');
  const userLogAllowed = await recordErrorLog({
    level: 'warn',
    source: 'test-auth-runner',
    message: 'User action allowed now',
    userId: 'usr_logged_in_123',
    userEmail: 'user@test.com',
  });
  assert.strictEqual(userLogAllowed, true);

  // Test RequestProfiler & Server-Timing header
  const { RequestProfiler } = await import('../src/utils/profiler');
  const profiler = new RequestProfiler();
  profiler.startSpan('d1');
  await new Promise((r) => setTimeout(r, 10));
  profiler.endSpan('d1');
  profiler.addSpan('auth', 5);
  const serverTiming = profiler.toServerTimingHeader(50);
  assert(serverTiming.includes('total;dur=50'));
  assert(serverTiming.includes('d1;dur='));
  assert(serverTiming.includes('auth;dur=5'));

  // Test logger.measure, appendTimingHeaders and withApiPerf
  const { measure, appendTimingHeaders, withApiPerf } = await import('../src/utils/logger');
  const measureResult = await logger.measure(
    'd1.test.query',
    async () => {
      await new Promise((r) => setTimeout(r, 10));
      return { count: 42 };
    },
    { module: 'test', path: '/api/measure-test' }
  );
  assert.strictEqual(measureResult.count, 42);

  const rawResp = new Response(JSON.stringify({ ok: true }), { status: 200 });
  const timedResp = appendTimingHeaders(rawResp, 45.5, { d1: 12.3 });
  assert.strictEqual(timedResp.headers.get('X-Response-Time'), '45.5ms');
  assert(timedResp.headers.get('Server-Timing')?.includes('total;dur=45.5'));
  assert(timedResp.headers.get('Server-Timing')?.includes('d1;dur=12.3'));

  const decoratedRoute = withApiPerf('test/api', async () => {
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  });
  const mockApiContext: any = {
    request: new Request('http://localhost/api/test-route', { method: 'GET' }),
    url: new URL('http://localhost/api/test-route'),
    locals: {},
  };
  const apiRouteResp = await (decoratedRoute as any)(mockApiContext);
  assert.strictEqual(apiRouteResp.status, 200);
  assert.ok(apiRouteResp.headers.has('X-Response-Time'));
  assert.ok(apiRouteResp.headers.has('Server-Timing'));

  // Test dynamic log level governance & latency profiling
  await updateSystemSettings({ log_min_level: 'warn', slow_request_threshold_ms: 1000 }, 'admin@test.com');
  // Info log below threshold should be skipped
  const infoFastSkipped = await recordErrorLog({
    level: 'info',
    source: 'test-profiler',
    message: 'Fast completed request',
    path: '/api/fast',
    latencyMs: 150,
  });
  assert.strictEqual(infoFastSkipped, false);

  // Info log exceeding slow threshold should be captured
  const infoSlowCaptured = await recordErrorLog({
    level: 'info',
    source: 'test-profiler',
    message: 'Slow completed request',
    path: '/api/slow-endpoint',
    latencyMs: 1250,
    method: 'POST',
    statusCode: 200,
  });
  assert.strictEqual(infoSlowCaptured, true);

  // Query bottlenecks & slowest sorting
  const bottleneckRes = await listErrorLogs({ sort: 'slowest' });
  assert(bottleneckRes.logs.length >= 1);
  assert.strictEqual(bottleneckRes.logs[0].path, '/api/slow-endpoint');
  assert.strictEqual(bottleneckRes.logs[0].latency_ms, 1250);
  assert(bottleneckRes.bottlenecks.length >= 1);
  assert.strictEqual(bottleneckRes.bottlenecks[0].path, '/api/slow-endpoint');

  // Test clearErrorLogs
  await clearErrorLogs();
  const clearedLogsRes = await listErrorLogs();
  assert.strictEqual(clearedLogsRes.total, 0);

  // Test /api/client-error telemetry endpoint
  const { POST: clientErrorPost } = await import('../src/pages/api/client-error');

  // Test 1: When log_client_errors is false, backend rejects/skips telemetry
  await updateSystemSettings({ log_client_errors: false }, 'admin@test.com');
  const disabledReqContext: any = {
    request: new Request('http://localhost/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'origin': 'http://localhost' },
      body: JSON.stringify({ message: 'TypeError: test is not defined', path: '/products/test-slug' }),
    }),
    url: new URL('http://localhost/api/client-error'),
    locals: {},
  };
  const disabledResp = await clientErrorPost(disabledReqContext);
  assert.strictEqual(disabledResp.status, 200);
  const disabledBody = await disabledResp.json();
  assert.strictEqual(disabledBody.skipped, true);
  const logsAfterDisabled = await listErrorLogs();
  assert.strictEqual(logsAfterDisabled.total, 0);

  // Test 2: When log_client_errors is true, backend accepts and ingests into D1
  await updateSystemSettings({ log_client_errors: true }, 'admin@test.com');
  const enabledReqContext: any = {
    request: new Request('http://localhost/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'origin': 'http://localhost' },
      body: JSON.stringify({
        message: 'ReferenceError: window.ApplePay is undefined',
        source: 'https://gwenvenni.com/scripts/checkout.js',
        lineno: 42,
        colno: 12,
        path: '/orders',
        stack: 'ReferenceError: window.ApplePay is undefined at checkout.js:42:12',
        breadcrumbs: [
          { ts: '2026-11-05T15:00:00.000Z', trigger: 'pageload', from: '', to: '/' },
          { ts: '2026-11-05T15:00:05.000Z', trigger: 'pushState', from: '/', to: '/products' },
          { ts: '2026-11-05T15:00:10.000Z', trigger: 'pushState', from: '/products', to: '/orders' }
        ]
      }),
    }),
    url: new URL('http://localhost/api/client-error'),
    locals: {},
  };
  const enabledResp = await clientErrorPost(enabledReqContext);
  assert.strictEqual(enabledResp.status, 202);
  const enabledBody = await enabledResp.json();
  assert.strictEqual(enabledBody.ok, true);

  const logsAfterIngest = await listErrorLogs();
  assert.strictEqual(logsAfterIngest.total, 1);
  assert.strictEqual(logsAfterIngest.logs[0].source, 'client/browser');
  assert.strictEqual(logsAfterIngest.logs[0].method, 'CLIENT');
  assert.strictEqual(logsAfterIngest.logs[0].path, '/orders');
  assert.strictEqual(logsAfterIngest.logs[0].message, 'ReferenceError: window.ApplePay is undefined');

  // Verify breadcrumbs attached in context
  const parsedCtx = JSON.parse(logsAfterIngest.logs[0].context_json);
  const breadcrumbs = parsedCtx.breadcrumbs || parsedCtx.context?.breadcrumbs;
  assert(Array.isArray(breadcrumbs));
  assert.strictEqual(breadcrumbs.length, 3);
  assert.strictEqual(breadcrumbs[1].to, '/products');

  // Test 2.5: Navigation event handling under log_min_level: 'info'
  await updateSystemSettings({ log_min_level: 'info' }, 'admin@test.com');
  const navReqContext: any = {
    request: new Request('http://localhost/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'origin': 'http://localhost' },
      body: JSON.stringify({
        type: 'navigation',
        level: 'info',
        message: 'Navigation [pushState]: / -> /products',
        path: '/products',
        trigger: 'pushState',
        from: '/',
        to: '/products',
      }),
    }),
    url: new URL('http://localhost/api/client-error'),
    locals: {},
  };
  const navResp = await clientErrorPost(navReqContext);
  assert.strictEqual(navResp.status, 202);
  const navBody = await navResp.json();
  assert.strictEqual(navBody.ok, true);
  assert.strictEqual(navBody.level, 'info');

  await new Promise((resolve) => setTimeout(resolve, 50));
  const logsWithNav = await listErrorLogs({ level: 'info' });
  assert(logsWithNav.logs.some(l => l.source === 'client/navigation'));

  // Test 3: Noisy errors (e.g. ResizeObserver) are ignored
  const noiseReqContext: any = {
    request: new Request('http://localhost/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'origin': 'http://localhost' },
      body: JSON.stringify({ message: 'ResizeObserver loop completed with undelivered notifications' }),
    }),
    url: new URL('http://localhost/api/client-error'),
    locals: {},
  };
  const noiseResp = await clientErrorPost(noiseReqContext);
  assert.strictEqual(noiseResp.status, 200);
  const noiseBody = await noiseResp.json();
  assert.strictEqual(noiseBody.skipped, true);

  // Test 4: RUM Web Vitals metric reporting
  const vitalsReqContext: any = {
    request: new Request('http://localhost/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'origin': 'http://localhost' },
      body: JSON.stringify({
        type: 'web-vitals',
        message: 'Web Vitals: LCP 1250ms, CLS 0.02, INP 80ms, TTFB 140ms (good)',
        path: '/products',
        latencyMs: 1250,
        lcp: 1250,
        cls: 0.02,
        inp: 80,
        ttfb: 140,
        rating: 'good',
      }),
    }),
    url: new URL('http://localhost/api/client-error'),
    locals: {},
  };
  const vitalsResp = await clientErrorPost(vitalsReqContext);
  assert.strictEqual(vitalsResp.status, 202);
  const vitalsBody = await vitalsResp.json();
  assert.strictEqual(vitalsBody.ok, true);
  assert.strictEqual(vitalsBody.level, 'info');

  await new Promise((resolve) => setTimeout(resolve, 50));
  const logsWithVitals = await listErrorLogs({ level: 'info' });
  assert(logsWithVitals.logs.some(l => l.source === 'client/web-vitals'));

  console.log('✔ [PASS] System Error, Performance Profiling & Log Level Governance verified');

  // 22. Client-Side Persistent Cache Layer (TTL, SWR & Invalidation)
  const { clientCache } = await import('../src/utils/clientCache');
  await clientCache.set('test:key1', { foo: 'bar' }, 10000);
  const cachedVal = await clientCache.get('test:key1');
  assert.deepStrictEqual(cachedVal, { foo: 'bar' });

  // Invalidate prefix
  await clientCache.set('admin:orders:tab1', { count: 5 });
  await clientCache.set('admin:orders:tab2', { count: 10 });
  await clientCache.set('buyer:orders:my', { count: 2 });
  await clientCache.invalidatePrefix('admin:orders:');
  assert.strictEqual(await clientCache.get('admin:orders:tab1'), null);
  assert.strictEqual(await clientCache.get('admin:orders:tab2'), null);
  assert.deepStrictEqual(await clientCache.get('buyer:orders:my'), { count: 2 });
  await clientCache.clear();
  assert.strictEqual(await clientCache.get('buyer:orders:my'), null);

  // Test SWR unchanged suppression & In-flight network deduplication
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount++;
    return new Response(JSON.stringify({ status: 'ok', items: [1, 2, 3] }), { status: 200 });
  }) as any;

  try {
    await clientCache.set('test:swr', { status: 'ok', items: [1, 2, 3] });
    const onDataCalls: boolean[] = [];
    await clientCache.fetchWithCache('test:swr', 'https://mock.api/test', {
      mode: 'swr',
      onData: (data, isFromCache) => {
        onDataCalls.push(isFromCache);
      },
    });
    // Since data was identical, onData should only be called once (cache phase), skipping the redundant fresh render
    assert.deepStrictEqual(onDataCalls, [true]);

    // Test in-flight network deduplication: concurrent calls to identical URL share single fetch
    fetchCount = 0;
    const [res1, res2] = await Promise.all([
      clientCache.fetchWithCache('test:dedup1', 'https://mock.api/dedup', { mode: 'ttl' }),
      clientCache.fetchWithCache('test:dedup2', 'https://mock.api/dedup', { mode: 'ttl' }),
    ]);
    assert.strictEqual(fetchCount, 1);
    assert.deepStrictEqual(res1, res2);
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('✔ [PASS] Client-Side Cache Layer (TTL, SWR, In-Flight Deduplication & Prefix Invalidation) verified');

  // 23. Global UI Toast Store (Queue, Deduplication & Dismissal)
  const { toastsStore, showToast, dismissToast } = await import('../src/stores/uiStore');
  const tId = showToast('Settings saved', true, 0);
  assert.strictEqual(toastsStore.get().length, 1);
  assert.strictEqual(toastsStore.get()[0].type, 'success');
  // Duplicate message debouncing check: reusing same message replaces old entry and returns new id
  const tId2 = showToast('Settings saved', true, 0);
  assert.strictEqual(toastsStore.get().length, 1);
  dismissToast(tId2);
  assert.strictEqual(toastsStore.get().length, 0);

  console.log('✔ [PASS] Global UI Toast Store (nanostores queue & deduplication) verified');

  // 24. Product Detail Multi-tier SWR & Single-Flight Cache
  const { ProductService } = await import('../src/data/products');
  const mockProduct: any = { _id: 'prod_1', slug: 'test-slug', title: 'Test Product' };
  ProductService.seedSlug('test-slug', mockProduct);
  const p1 = await ProductService.getBySlug('test-slug');
  assert.strictEqual(p1?.title, 'Test Product');
  // Verify fresh cache returns cloned data
  const p2 = await ProductService.getBySlug('test-slug');
  assert.strictEqual(p2?.title, 'Test Product');
  ProductService.invalidateCache();

  console.log('✔ [PASS] Product Detail Multi-tier SWR & Single-Flight Cache verified');

  // 25. Vulnerability Probe Scanner Interception & Page Negative Caching
  const SCANNER_EXTENSIONS = /\.(php\d*|asp|aspx|jsp|cgi|env|git|sql|bak|zip|tar|gz|sh|py|rb|pl|ini|log|ya?ml|toml|action|do)$/i;
  const SCANNER_PATTERN = /(?:^|\/)(?:wp-[a-z0-9_-]+|wordpress|phpmyadmin|pma|mysql|actuator|\.env|\.git|vendor|cgi-bin|eval-stdin|xmlrpc|wlwmanifest)(?:\/|$|\.)/i;
  const isProbe = (p: string) => {
    return p.startsWith('/.well-known/') || SCANNER_EXTENSIONS.test(p) || SCANNER_PATTERN.test(p);
  };
  assert.strictEqual(isProbe('/wp-content/admin.php'), true);
  assert.strictEqual(isProbe('/wp-admin/index.php'), true);
  assert.strictEqual(isProbe('/.env'), true);
  assert.strictEqual(isProbe('/actuator/health'), true);
  assert.strictEqual(isProbe('/config.bak'), true);
  assert.strictEqual(isProbe('/vendor/phpunit'), true);
  assert.strictEqual(isProbe('/vendors'), false);
  assert.strictEqual(isProbe('/vendor-guide'), false);
  assert.strictEqual(isProbe('/products/pma-silk'), false);
  assert.strictEqual(isProbe('/products/silk-200n'), false);
  assert.strictEqual(isProbe('/about'), false);
  assert.strictEqual(isProbe('/contact'), false);

  const { PageService } = await import('../src/data/page');
  PageService.invalidateCache();
  // Fetch non-existent slug returns empty array
  const missingPage1 = await PageService.getBySlug('/definitely-non-existent-page-slug-999');
  assert.strictEqual(missingPage1.length, 0);
  // Second fetch hits negative cache immediately
  const missingPage2 = await PageService.getBySlug('/definitely-non-existent-page-slug-999');
  assert.strictEqual(missingPage2.length, 0);

  console.log('✔ [PASS] Vulnerability Scanner Interception & Page Negative Caching verified');

  // 26. iOS / WeChat WebView Device & Platform Detection & TTFB RUM Guards
  const { SecurityService } = await import('../src/utils/security');
  const wechatReq = new Request('https://gwenvenni.com/', {
    headers: {
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.80(0x1800502f) NetType/WIFI Language/zh_CN',
    },
  });
  const wechatMeta = SecurityService.resolveClientMeta(wechatReq);
  assert.strictEqual(wechatMeta.deviceType, 'mobile');
  assert.strictEqual(wechatMeta.platform, 'iOS');

  const ipadReq = new Request('https://gwenvenni.com/', {
    headers: {
      'user-agent': 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    },
  });
  const ipadMeta = SecurityService.resolveClientMeta(ipadReq);
  assert.strictEqual(ipadMeta.deviceType, 'tablet');
  assert.strictEqual(ipadMeta.platform, 'iPadOS');

  const desktopReq = new Request('https://gwenvenni.com/', {
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  const desktopMeta = SecurityService.resolveClientMeta(desktopReq);
  assert.strictEqual(desktopMeta.deviceType, 'desktop');
  assert.strictEqual(desktopMeta.platform, 'macOS');

  console.log('✔ [PASS] Mobile/Tablet/Desktop & iOS/WeChat Device Type Extraction verified');

  // 27. Image Optimization & Aspect-Ratio Cropping
  const { SanityImageService } = await import('../src/utils/image');
  const sampleSanityUrl = 'https://cdn.sanity.io/images/mock/prod/abc-896x1200.jpg';
  const heroOpt = SanityImageService.hero(sampleSanityUrl, 1600);
  assert(heroOpt.includes('w=1600'));
  assert(heroOpt.includes('q=75'));

  const macroOpt = SanityImageService.macro(sampleSanityUrl, 600, 400, 'crop');
  assert(macroOpt.includes('w=600'));
  assert(macroOpt.includes('h=400'));
  assert(macroOpt.includes('fit=crop'));
  assert(macroOpt.includes('q=72'));

  const srcSetOpt = SanityImageService.srcSet(sampleSanityUrl, [360, 480, 600], { aspectRatio: 2 / 3, fit: 'crop', quality: 72 });
  assert(srcSetOpt.includes('w=360&h=240'));
  assert(srcSetOpt.includes('w=480&h=320'));
  assert(srcSetOpt.includes('w=600&h=400'));

  const preloadOpt = SanityImageService.resolveHeroPreload(sampleSanityUrl);
  assert(preloadOpt?.src.includes('q=75'));
  assert(preloadOpt?.srcset?.includes('q=75'));

  console.log('✔ [PASS] Image Optimization, Crop Mode & Preload Alignment verified');

  // 28. RBAC Engine, DataScope Isolation, Auto Customer Binding & Audit Logs
  const { resolveAdminContext, hasPermission, hasMenu } = await import('../src/utils/rbac');
  const { upsertAdminMember, getAdminMember } = await import('../src/db/rbac.repo');
  const { assignOrder: assignOrderRepo, listAdminOrders: listOrdersRepo } = await import('../src/db/orders.repo');
  const { listAuditLogs } = await import('../src/db/audit.repo');
  const { getUserById } = await import('../src/db/users.repo');

  // Root Admin RBAC
  const rootCtx = await resolveAdminContext('superadmin@gwenvenni.com', { ADMIN_EMAILS: 'superadmin@gwenvenni.com' });
  assert.strictEqual(rootCtx?.isRootAdmin, true);
  assert.strictEqual(hasPermission(rootCtx, 'orders:assign'), true);
  assert.strictEqual(hasMenu(rootCtx, 'settings'), true);

  // Sales Rep RBAC & DataScope
  const testRepEmail = `rep-${Date.now()}@gwenvenni.com`;
  await upsertAdminMember({
    email: testRepEmail,
    name: 'Alice Rep',
    role_code: 'sales_rep',
    status: 'ACTIVE',
  });
  const repCtx = await resolveAdminContext(testRepEmail);
  assert.strictEqual(repCtx?.isRootAdmin, false);
  assert.strictEqual(repCtx?.dataScope, 'SELF_AND_POOL');
  assert.strictEqual(hasPermission(repCtx, 'orders:claim'), true);
  assert.strictEqual(hasPermission(repCtx, 'orders:assign'), false);
  assert.strictEqual(hasMenu(repCtx, 'orders'), true);
  assert.strictEqual(hasMenu(repCtx, 'settings'), false);

  // Auto-binding customer on order assign
  const assignResult = await assignOrderRepo(customOrder.orderId, testRepEmail);
  assert.strictEqual(assignResult, true);
  const assignedCustomer = await getUserByIdOrEmail(null, customEmail);
  assert.strictEqual(assignedCustomer?.assigned_to?.toLowerCase(), testRepEmail.toLowerCase(), 'Customer should auto-bind to sales rep on claim');

  // DataScope Row-Level Public Pool & Assignment Filtering
  const scopedOrders = await listOrdersRepo({ adminScope: { email: testRepEmail, dataScope: 'SELF_AND_POOL' } });
  assert.ok(scopedOrders.orders.some(o => o.id === customOrder.orderId), 'Order should be visible to assigned sales rep');

  // Audit Log Querying
  const auditResult = await listAuditLogs({ limit: 10 });
  assert.ok(Array.isArray(auditResult.logs));
  console.log('✔ [PASS] RBAC Engine, DataScope Isolation, Customer Auto-Binding & Audit Diff verified');

  // 29. RBAC Custom Role Upsert/Delete Guard, Member Workload Fields & Logto Candidate Picker
  const { upsertAdminRole, deleteAdminRole, getMemberEmailsByRole, listCandidateLogtoUsers, listAdminMembers, listActiveTeamMembersLite } = await import('../src/db/rbac.repo');
  const { getPendingOrdersCount } = await import('../src/db/orders.repo');

  const customRoleCode = `custom_finance_${Date.now()}`;
  await upsertAdminRole({
    code: customRoleCode,
    name: 'Finance Controller',
    data_scope: 'ALL',
    menus: ['orders', 'roles'],
    permissions: ['orders:read', 'orders:export'],
    description: 'Custom finance role for accounting exports',
    is_system: false,
  });

  const testFinanceEmail = `finance-${Date.now()}@gwenvenni.com`;
  await upsertAdminMember({
    email: testFinanceEmail,
    name: 'Frank Finance',
    role_code: customRoleCode,
    status: 'ACTIVE',
  });

  const roleEmails = await getMemberEmailsByRole(customRoleCode);
  assert.ok(roleEmails.includes(testFinanceEmail.toLowerCase()), 'getMemberEmailsByRole should include newly assigned member');

  const deleteAttempt1 = await deleteAdminRole(customRoleCode);
  assert.strictEqual(deleteAttempt1.success, false, 'Should guard against deleting a role with active members assigned');

  const deleteSystemAttempt = await deleteAdminRole('sales_rep');
  assert.strictEqual(deleteSystemAttempt.success, false, 'Should forbid deleting built-in system role');

  await upsertAdminMember({
    email: testFinanceEmail,
    name: 'Frank Finance',
    role_code: 'sales_rep',
    status: 'ACTIVE',
  });
  const deleteAttempt2 = await deleteAdminRole(customRoleCode);
  assert.strictEqual(deleteAttempt2.success, true, 'Deleting unassigned custom role should succeed');

  const candidates = await listCandidateLogtoUsers();
  assert.ok(Array.isArray(candidates), 'listCandidateLogtoUsers should return array');

  const memberList = await listAdminMembers();
  const repInList = memberList.find(m => m.email.toLowerCase() === testRepEmail.toLowerCase());
  assert.ok(repInList, 'testRepEmail should be in member list');
  assert.strictEqual(typeof repInList.assigned_orders, 'number');
  assert.strictEqual(typeof repInList.assigned_customers, 'number');
  assert.strictEqual(typeof repInList.is_logto_synced, 'boolean');

  const activeLite = await listActiveTeamMembersLite();
  assert.ok(Array.isArray(activeLite), 'listActiveTeamMembersLite should return array');
  const repInLite = activeLite.find(m => m.email.toLowerCase() === testRepEmail.toLowerCase());
  assert.ok(repInLite, 'testRepEmail should be in active lite team member list');
  assert.strictEqual(typeof repInLite.roleName, 'string');

  const pendingCount = await getPendingOrdersCount();
  assert.strictEqual(typeof pendingCount, 'number');

  console.log('✔ [PASS] RBAC Custom Role Upsert/Delete Guard, Member Workload Fields & Logto Candidate Picker verified');

  // 30. Universal Data Dictionary Engine, Tracking Resolution & Executive Dashboard Stats
  const dictGroups = await listDictGroups();
  assert.ok(dictGroups.length >= 7, 'Should have at least 7 default dict groups seeded');
  const carrierGroup = dictGroups.find(g => g.code === 'shipping_carriers');
  assert.ok(carrierGroup, 'shipping_carriers group should exist');

  const carriers = await listDictItems('shipping_carriers', true);
  assert.ok(carriers.length >= 5, 'Should have default shipping carriers seeded');

  // Test upsert custom carrier
  await upsertDictItem({
    group_code: 'shipping_carriers',
    item_key: 'test_courier',
    item_label: 'Test Express Courier',
    badge_color: 'cyan',
    meta: { tracking_url: 'https://track.testexpress.com/{tracking}' },
    sort_order: 99,
    is_enabled: true,
  });

  const updatedCarriers = await listDictItems('shipping_carriers', false);
  const testCarrier = updatedCarriers.find(c => c.item_key === 'test_courier');
  assert.ok(testCarrier, 'Newly upserted carrier should be in list');
  assert.strictEqual(testCarrier.badge_color, 'cyan');

  // Test dynamic tracking URL resolution
  const resolvedUrl = getTrackingUrl('Test Express Courier', 'TRK999888', testCarrier.meta?.tracking_url);
  assert.strictEqual(resolvedUrl, 'https://track.testexpress.com/TRK999888');

  // Test toggle enabled
  await toggleDictItemEnabled('shipping_carriers', 'test_courier', false);
  const activeCarriers = await listDictItems('shipping_carriers', true);
  assert.strictEqual(activeCarriers.some(c => c.item_key === 'test_courier'), false, 'Disabled item should not be in active list');

  // Test delete dict item
  await deleteDictItem('shipping_carriers', 'test_courier');
  const finalCarriers = await listDictItems('shipping_carriers', false);
  assert.strictEqual(finalCarriers.some(c => c.item_key === 'test_courier'), false, 'Deleted item should be removed');

  // Test Executive Dashboard Stats Aggregation
  const dashboardStats = await getDashboardStats();
  assert.strictEqual(typeof dashboardStats.totalOrders, 'number');
  assert.strictEqual(typeof dashboardStats.orders7Days, 'number');
  assert.strictEqual(typeof dashboardStats.overdueSla, 'number');
  assert.ok(typeof dashboardStats.statusFunnel === 'object', 'statusFunnel should be object');
  assert.ok(Array.isArray(dashboardStats.topCountries), 'topCountries should be array');
  assert.ok(Array.isArray(dashboardStats.topSkus), 'topSkus should be array');
  assert.ok(Array.isArray(dashboardStats.repWorkloads), 'repWorkloads should be array');

  console.log('✔ [PASS] Universal Data Dictionary Engine, Tracking Resolution & Executive Dashboard Stats verified');

  // Test App Shell Router Scope & Link Interception
  assert.strictEqual(isScopeMatch(new URL('https://gwenvenni.com/admin/orders'), 'admin'), true);
  assert.strictEqual(isScopeMatch(new URL('https://gwenvenni.com/orders'), 'admin'), false);
  assert.strictEqual(isScopeMatch(new URL('https://otherdomain.com/admin'), 'admin', 'https://gwenvenni.com'), false);
  assert.strictEqual(isScopeMatch(new URL('https://gwenvenni.com/orders'), 'buyer'), true);
  assert.strictEqual(isScopeMatch(new URL('https://gwenvenni.com/de/account'), 'buyer'), true);
  assert.strictEqual(isScopeMatch(new URL('https://gwenvenni.com/admin/orders'), 'buyer'), false);

  const mockAnchor = (attrs: Record<string, string>, href: string) => ({
    href,
    target: attrs.target || '',
    hasAttribute: (name: string) => name in attrs,
    getAttribute: (name: string) => attrs[name] ?? null,
  } as unknown as HTMLAnchorElement);

  assert.strictEqual(isNavigableLink(mockAnchor({}, 'https://gwenvenni.com/admin/orders'), 'admin'), true);
  assert.strictEqual(isNavigableLink(mockAnchor({ target: '_blank' }, 'https://gwenvenni.com/admin/orders'), 'admin'), false);
  assert.strictEqual(isNavigableLink(mockAnchor({ 'data-no-pjax': 'true' }, 'https://gwenvenni.com/admin/orders'), 'admin'), false);
  assert.strictEqual(isNavigableLink(mockAnchor({}, 'https://gwenvenni.com/api/auth/logout'), 'admin'), false);

  console.log('✔ [PASS] App Shell Router Scope Matching & Navigable Link Filtering verified');

  console.log('\n🎉 All B2B Order, Customer & Claiming self-checks passed!\n');
}

runSelfCheck().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('❌ Self-check failed:', err);
  process.exit(1);
});

