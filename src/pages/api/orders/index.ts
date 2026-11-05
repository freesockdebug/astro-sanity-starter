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
  try {
    await claimOrdersByEmail(user.email, user.id);
  } catch (err) {
    console.error('Error auto-claiming orders:', err);
  }

  const view = url.searchParams.get('view') || 'my';
  let rawOrders: any[] = [];
  if (user.isAdmin && view === 'all') {
    const adminRes = await listAdminOrders({ limit: 100 });
    rawOrders = adminRes.orders;
  } else {
    rawOrders = await getOrdersByUserId(user.id, user.email);
  }

  const enrichedOrders = rawOrders.map((order) => ({
    ...order,
    items: (order.items || []).map((item: any) => ({
      ...item,
      resolved_image: resolveOrderItemImage(item),
      product_url: getOrderItemProductUrl(item, 'en'),
    })),
  }));

  return jsonNoCache({
    success: true,
    orders: enrichedOrders,
  });
};

