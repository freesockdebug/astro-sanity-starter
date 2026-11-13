// src/pages/api/admin/cache/purge.ts
// Cloudflare Edge HTML & L2 KV Multi-Tier Cache Purge API
import type { APIRoute } from 'astro';
import { verifyAdminAuth, hasPermission, jsonNoCache } from '@utils/auth';
import { ProductService } from '@data/products';
import { PageService } from '@data/page';
import { SiteConfigService } from '@data/siteConfig';
import { RfqSettingsService } from '@data/rfqSettings';
import { invalidateDictCache } from '@utils/dicts';
import {
  invalidateSettingsCache,
  invalidateRbacCache,
  invalidatePendingOrdersCountCache,
  invalidateDashboardStatsCache,
} from '@utils/db';
import { insertAuditLog } from '@db/audit.repo';
import { purgeEdgeHtmlCache } from '@utils/cmsSync';
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
      await Promise.all([
        ProductService.refreshAll(cfEnv),
        ProductService.getCatalogSettings(true, cfEnv),
        ProductService.getProductStorySettings(true, cfEnv),
      ]).catch(() => {});
      purgedItems.push('Product lists, categories & settings refreshed in KV');
    }

    if (scope === 'all' || scope === 'pages') {
      PageService.invalidateCache();
      await PageService.getHomePage(true, cfEnv).catch(() => {});
      purgedItems.push('Page L1 memory cleared & homepage refreshed in KV');
    }

    if (scope === 'all' || scope === 'config') {
      await Promise.all([
        SiteConfigService.getConfig(true),
        RfqSettingsService.getSettings(true),
      ]).catch(() => {});
      purgedItems.push('SiteConfig & RFQ Settings refreshed in KV');
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
        await ProductService.refreshSlug(slug, cfEnv).catch(() => {});
        purgedItems.push(`Product slug KV refreshed: ${slug}`);
      } else {
        const unslashed = targetPath.replace(/^\//, '').replace(/\/$/, '');
        await PageService.refreshSlug(unslashed || 'home', cfEnv).catch(() => {});
        purgedItems.push(`Page KV refreshed: ${targetPath}`);
      }
    }

    // Purge Edge HTML Cache (caches.default in middleware.ts) & Cloudflare CDN
    const edgePaths = new Set<string>();
    if (targetPath) {
      edgePaths.add(targetPath);
    }
    if (scope === 'all' || scope === 'products' || scope === 'pages' || scope === 'config') {
      edgePaths.add('/');
      edgePaths.add('/products');
      edgePaths.add('/about');
      edgePaths.add('/private-label');
      edgePaths.add('/contact');
    }

    if (edgePaths.size > 0) {
      const purgeRes = await purgeEdgeHtmlCache({
        targetPaths: edgePaths,
        origin: new URL(request.url).origin,
        cfEnv,
      }).catch(() => null);
      if (purgeRes?.edgeCachePurged) {
        purgedItems.push(`Worker Edge HTML Cache (${purgeRes.urlsToPurge.length} URL keys purged)`);
      }
      if (purgeRes?.cdnPurged) {
        purgedItems.push('Cloudflare Global CDN Zone Cache purged');
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

