// src/pages/api/admin/cache/purge.ts
// Cloudflare Edge HTML & L2 KV Multi-Tier Cache Purge API
import type { APIRoute } from 'astro';
import { defineAdminApi, jsonNoCache } from '@utils/auth';
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
} from '@db';
import { recordAdminAudit } from '@db/audit.repo';
import { getRouteRevisions, bumpRouteRevisions, purgeEdgeHtmlCache } from '@utils/cmsSync';

export const prerender = false;

export const POST: APIRoute = defineAdminApi(
  { permission: 'cache:purge' },
  async ({ context, request, auth, cfEnv }) => {
    const startTime = Date.now();

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
    if (scope === 'all' || scope === 'products' || scope === 'pages' || scope === 'config' || scope === 'settings') {
      edgePaths.add('/');
      edgePaths.add('/products');
      edgePaths.add('/about');
      edgePaths.add('/private-label');
      edgePaths.add('/contact');
    }

    if (edgePaths.size > 0) {
      const prevRevs = await getRouteRevisions(cfEnv).catch(() => ({}));
      const bumpGlobalLayout = scope === 'all' || scope === 'config' || scope === 'settings';
      await bumpRouteRevisions(edgePaths, bumpGlobalLayout, cfEnv).catch(() => {});

      const purgeRes = await purgeEdgeHtmlCache({
        targetPaths: edgePaths,
        origin: new URL(request.url).origin,
        cfEnv,
        prevRevs,
        purgeEverything: scope === 'all',
      }).catch(() => null);
      if (purgeRes?.edgeCachePurged) {
        purgedItems.push(`Worker Edge HTML Cache (${purgeRes.urlsToPurge.length} URL keys purged)`);
      }
      if (purgeRes?.cdnPurged) {
        purgedItems.push('Cloudflare Global CDN Zone Cache purged');
      }
    }

    const durationMs = Date.now() - startTime;

    recordAdminAudit(context, {
      adminEmail: auth.user.email,
      action: 'CACHE_PURGE',
      targetType: 'cache',
      targetId: scope + (targetPath ? `:${targetPath}` : ''),
      after: { scope, targetPath, purgedItems },
      durationMs,
      cfEnv,
    });

    return jsonNoCache({
      success: true,
      scope,
      targetPath,
      purgedItems,
      durationMs,
      message: `Cache successfully purged (${purgedItems.length} cache partitions cleared in ${durationMs}ms).`,
    });
  }
);

