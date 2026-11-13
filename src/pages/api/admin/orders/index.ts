// src/pages/api/admin/orders/index.ts
import type { APIRoute } from 'astro';
import { defineAdminApi, jsonNoCache } from '@utils/auth';
import { parsePaginationParams } from '@utils/format';
import { listAdminOrders } from '@utils/db';
import { resolveOrderItemImage, getOrderItemProductUrl } from '@data/products';

export const prerender = false;

export const GET: APIRoute = defineAdminApi({}, async ({ url, auth }) => {
  const status = url.searchParams.get('status') || 'ALL';
  const timeWindow = url.searchParams.get('timeWindow') || 'ALL';
  const rawAssigned = url.searchParams.get('assignedTo');
  const assignedTo = rawAssigned === 'MINE' ? auth.user.email : (rawAssigned || undefined);
  const { page, limit, search } = parsePaginationParams(url.searchParams, 50, 100);

  const result = await listAdminOrders({
    status,
    search,
    timeWindow,
    assignedTo,
    dataScope: auth.adminContext.dataScope,
    currentAdminEmail: auth.user.email,
    page,
    limit,
  });

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
});
