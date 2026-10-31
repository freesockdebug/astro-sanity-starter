// scripts/test-b2b-orders.ts
// Runnable self-check for B2B Orders & Idempotent Claiming logic

import assert from 'node:assert';
import {
  createOrder,
  claimOrdersByEmail,
  getOrdersByUserId,
  listAdminOrders,
  updateOrderStatus,
} from '../src/utils/db';
import {
  createSessionToken,
  verifySessionToken,
  checkIsAdmin,
} from '../src/utils/auth';

async function runSelfCheck() {
  console.log('🧪 Starting B2B Order & Claiming Self-Check...\n');

  // 1. Auth & Admin checks
  assert.strictEqual(checkIsAdmin('forhaisome@gmail.com'), true, 'Default admin email should be admin');
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
    adminUser: 'forhaisome@gmail.com',
  });
  assert.strictEqual(shipOk, true);

  // Verify Shipped state in buyer view
  const updatedOrders = await getOrdersByUserId(buyerUserId);
  assert.strictEqual(updatedOrders[0].status, 'SHIPPED');
  assert.strictEqual(updatedOrders[0].carrier, 'DHL Express');
  assert.strictEqual(updatedOrders[0].tracking_number, 'DHL-9876543210');
  console.log('✔ [PASS] Admin approval and shipment dispatch workflow verified');

  console.log('\n🎉 All B2B Order & Claiming self-checks passed!\n');
}

runSelfCheck().catch((err) => {
  console.error('❌ Self-check failed:', err);
  process.exit(1);
});
