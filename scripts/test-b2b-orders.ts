// scripts/test-b2b-orders.ts
// Runnable self-check for B2B Orders & Idempotent Claiming logic

import assert from 'node:assert';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-mock-session-secret-key-32chars';
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
  createSessionToken,
  verifySessionToken,
  checkIsAdmin,
} from '../src/utils/auth';

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
  });
  assert.strictEqual(logRecorded, true);

  const initialLogsRes = await listErrorLogs({ source: 'test-runner' });
  assert.ok(initialLogsRes.total >= 1);
  assert.strictEqual(initialLogsRes.logs[0].error_code, 'TEST_ERR_001');

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

  console.log('\n🎉 All B2B Order, Customer & Claiming self-checks passed!\n');
}

runSelfCheck().catch((err) => {
  console.error('❌ Self-check failed:', err);
  process.exit(1);
});

