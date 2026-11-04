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
  assert.strictEqual(initialSettings.order_no_prefix, 'ORD');

  // Update settings
  const updateRes = await updateSystemSettings({
    brand_name: 'TEST ATELIER',
    order_no_prefix: 'RFQ',
    co_admin_emails: 'coadmin@test.com, manager@test.com',
  }, 'admin@test.com');
  assert.strictEqual(updateRes.success, true);

  const updatedSettings = await getSystemSettings();
  assert.strictEqual(updatedSettings.brand_name, 'TEST ATELIER');
  assert.strictEqual(updatedSettings.order_no_prefix, 'RFQ');
  assert.strictEqual(updatedSettings.co_admin_emails, 'coadmin@test.com, manager@test.com');

  // Test Merged Admin Emails
  const mergedAdmins = getMergedAdminEmails(updatedSettings, { ADMIN_EMAILS: 'root@test.com, manager@test.com' });
  assert.deepStrictEqual(mergedAdmins.sort(), ['coadmin@test.com', 'manager@test.com', 'root@test.com'].sort());

  // Test Custom Prefix in generateOrderNo
  const { generateOrderNo } = await import('../src/db/client');
  const customOrderNo = generateOrderNo(updatedSettings.order_no_prefix);
  assert.ok(customOrderNo.startsWith('RFQ-'));
  console.log('✔ [PASS] D1 System Settings persistence, caching & merged admin authorization verified');

  console.log('\n🎉 All B2B Order, Customer & Claiming self-checks passed!\n');
}

runSelfCheck().catch((err) => {
  console.error('❌ Self-check failed:', err);
  process.exit(1);
});

