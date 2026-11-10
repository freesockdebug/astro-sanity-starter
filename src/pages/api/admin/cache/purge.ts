// src/pages/api/admin/cache/purge.ts
// Cloudflare Edge HTML & L2 KV Multi-Tier Cache Purge API
import type { APIRoute } from 'astro';
import { verifyAdminAuth, hasPermission, jsonNoCache } from '@utils/auth';
import { ProductService } from '@data/products';
import { PageService } from '@data/page';
import { invalidateDictCache } from '@utils/dicts';
import {
  invalidateSettingsCache,
  invalidateRbacCache,
  invalidatePendingOrdersCountCache,
  invalidateDashboardStatsCache,
} from '@utils/db';
import { kvDelete } from '@utils/kv';
import { insertAuditLog } from '@utils/audit';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const auth = await verifyAdminAuth(request, cfEnv);
  if (!auth) {
    return jsonNoCache({ error: 'Unauthorized admin access required.' }, 401);
  }

  if (!hasPermission(auth.adminContext, 'cache:purge')) {
    return jsonNoCache({ error: 'Forbidden: Missing cache:purge permission.' }, 403);
  }

  const startTime = Date.now();

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const scope = body.scope || 'all'; // 'all' | 'products' | 'pages' | 'dicts' | 'path'
    const targetPath = body.path ? String(body.path).trim() : null;

    const purgedItems: string[] = [];

    if (scope === 'all' || scope === 'products') {
      ProductService.invalidateCache();
      await kvDelete('cms:products:all', cfEnv).catch(() => {});
      await kvDelete('cms:categories:all', cfEnv).catch(() => {});
      purgedItems.push('Product in-memory and KV lists');
    }

    if (scope === 'all' || scope === 'pages') {
      PageService.invalidateCache();
      purgedItems.push('Page in-memory and KV caches');
    }

    if (scope === 'all' || scope === 'dicts') {
      await invalidateDictCache(cfEnv);
      purgedItems.push('Data Dictionaries (sys:dicts:all)');
    }

    if (scope === 'all' || scope === 'settings') {
      await invalidateSettingsCache(cfEnv);
      purgedItems.push('System Settings (sys:settings:v1 & memory)');
    }

    if (scope === 'all' || scope === 'rbac') {
      invalidateRbacCache();
      purgedItems.push('RBAC Roles & Team Members L1 memory');
    }

    if (scope === 'all' || scope === 'orders') {
      invalidatePendingOrdersCountCache();
      invalidateDashboardStatsCache();
      purgedItems.push('Orders Pending Count & Dashboard Stats L1 memory');
    }

    if (targetPath) {
      if (targetPath.startsWith('/products/')) {
        const slug = targetPath.replace('/products/', '').replace(/\/$/, '');
        await kvDelete(`cms:product:${slug}`, cfEnv).catch(() => {});
        purgedItems.push(`Product slug KV: ${slug}`);
      } else {
        const unslashed = targetPath.replace(/^\//, '').replace(/\/$/, '');
        await kvDelete(`cms:page:${unslashed || 'home'}`, cfEnv).catch(() => {});
        purgedItems.push(`Page KV: ${targetPath}`);
      }
    }

    const durationMs = Date.now() - startTime;

    // Record in Audit Trail
    await insertAuditLog({
      admin_email: auth.user.email,
      action: 'CACHE_PURGE',
      target_type: 'cache',
      target_id: scope + (targetPath ? `:${targetPath}` : ''),
      before_json: null,
      after_json: JSON.stringify({ scope, targetPath, purgedItems }),
      diff_json: null,
      client_ip: request.headers.get('cf-connecting-ip') || '127.0.0.1',
      country: request.headers.get('cf-ipcountry') || 'US',
      duration_ms: durationMs,
    }).catch(() => {});

    return jsonNoCache({
      success: true,
      scope,
      targetPath,
      purgedItems,
      durationMs,
      message: `Cache successfully purged (${purgedItems.length} cache partitions cleared in ${durationMs}ms).`,
    });
  } catch (err: any) {
    console.error('[Cache Purge API] Purge error:', err);
    return jsonNoCache({ error: err.message || 'Cache purge failed.' }, 500);
  }
};

