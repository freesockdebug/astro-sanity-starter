// src/pages/api/orders/index.ts
import type { APIRoute } from 'astro';
import { verifyBuyerAuth, jsonNoCache } from '@utils/auth';
import { getOrdersByUserId, claimOrdersByEmail, listAdminOrders } from '@utils/db';
import { resolveOrderItemImage, getOrderItemProductUrl } from '@data/products';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const { user, errorResponse } = await verifyBuyerAuth(request, cfEnv);
  if (errorResponse || !user) {
    return errorResponse!;
  }

  // Idempotently claim any new guest orders matching user's email
  let claimedCount = 0;
  try {
    claimedCount = await claimOrdersByEmail(user.email, user.id);
  } catch (err) {
    console.error('Error auto-claiming orders:', err);
  }

  const view = url.searchParams.get('view') || 'my';
  const lang = url.searchParams.get('lang') || 'en';

  let rawOrders: any[] = [];
  let myOrdersCount = 0;
  let allOrdersCount = 0;

  if (user.isAdmin) {
    const [myRes, adminRes] = await Promise.all([
      getOrdersByUserId(user.id, user.email),
      listAdminOrders({ limit: 100 }),
    ]);
    myOrdersCount = myRes.length;
    allOrdersCount = adminRes.total || adminRes.orders.length;
    rawOrders = view === 'all' ? adminRes.orders : myRes;
  } else {
    rawOrders = await getOrdersByUserId(user.id, user.email);
    myOrdersCount = rawOrders.length;
  }

  const stats = {
    all: rawOrders.length,
    pending: rawOrders.filter((o) => o.status === 'PENDING_APPROVAL').length,
    approved: rawOrders.filter((o) => o.status === 'APPROVED').length,
    shipped: rawOrders.filter((o) => o.status === 'SHIPPED').length,
    rejected: rawOrders.filter((o) => o.status === 'REJECTED').length,
  };

  const enrichedOrders = rawOrders.map((order) => ({
    ...order,
    items: (order.items || []).map((item: any) => ({
      ...item,
      resolved_image: resolveOrderItemImage(item),
      product_url: getOrderItemProductUrl(item, lang),
    })),
  }));

  return jsonNoCache({
    success: true,
    orders: enrichedOrders,
    stats,
    counts: {
      my: myOrdersCount,
      all: allOrdersCount,
    },
    claimedCount,
  });
};


