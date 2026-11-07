// src/pages/api/admin/orders/index.ts
import type { APIRoute } from 'astro';
import { verifyAdminAuth, jsonNoCache } from '@utils/auth';
import { listAdminOrders } from '@utils/db';
import { resolveOrderItemImage, getOrderItemProductUrl } from '@data/products';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const user = await verifyAdminAuth(request, cfEnv);
  if (!user) {
    return jsonNoCache({ error: 'Forbidden. Administrator access required.' }, 403);
  }

  const status = url.searchParams.get('status') || 'ALL';
  const search = url.searchParams.get('search') || '';
  const timeWindow = url.searchParams.get('timeWindow') || 'ALL';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));

  const result = await listAdminOrders({ status, search, timeWindow, page, limit });

  // 零 Sanity 阻塞：直接基于 D1 已存的 image_url 和 product_id 计算图片与跳转链接
  const enrichedOrders = result.orders.map((order) => ({
    ...order,
    items: (order.items || []).map((item) => ({
      ...item,
      resolved_image: resolveOrderItemImage(item),
      product_url: getOrderItemProductUrl(item, 'en'),
    })),
  }));

  return jsonNoCache({
    success: true,
    ...result,
    orders: enrichedOrders,
    totalPages: Math.max(1, Math.ceil(result.total / limit)),
  });
};
