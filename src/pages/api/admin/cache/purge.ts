// src/pages/api/admin/cache/purge.ts
// Cloudflare Edge HTML & L2 KV Multi-Tier Cache Purge API
import type { APIRoute } from 'astro';
import { defineAdminApi, jsonNoCache } from '@utils/auth';
import { ProductService } from '@data/products';
import { PageService } from '@data/page';
import { SiteConfigService } from '@data/siteConfig';
import { RfqSettingsService } from '@data/rfqSettings';
import '@db';
import { getSystemSettings, updateSystemSettings } from '@db';
import '@utils/dicts';
import {
  purgeRegisteredCaches,
  purgeSingleCacheByName,
  getGlobalCacheStatsSnapshot,
  resetGlobalCacheStats,
  purgeLegacyEpochKvKeys,
} from '@utils/cache';
import { recordAdminAudit } from '@db/audit.repo';
import { getRouteRevisions, bumpRouteRevisions, purgeEdgeHtmlCache, rebuildEdgePreloadBundle, prewarmEdgeRoutes, type CacheLedgerScope } from '@utils/cmsSync';

export const prerender = false;

const CACHE_POLICY_RANGES: Record<string, [number, number, string]> = {
  edge_html_cache_ttl_sec: [0, 86400, 'Edge HTML Cache TTL must be between 0 and 86400 seconds.'],
  l1_heartbeat_interval_sec: [0, 3600, 'L1 Heartbeat Interval must be 0 (manual purge only) or 5–3600 seconds.'],
  user_status_cache_ttl_sec: [5, 600, 'User Status Cache TTL must be between 5 and 600 seconds.'],
  admin_order_stats_ttl_sec: [5, 300, 'Admin Order Stats TTL must be between 5 and 300 seconds.'],
  l1_negative_cache_ttl_sec: [10, 600, 'L1 Negative Cache TTL must be between 10 and 600 seconds.'],
  edge_404_cache_ttl_sec: [0, 86400, 'Edge 404 Cache TTL must be between 0 and 86400 seconds.'],
  waf_legacy_404_ttl_sec: [0, 86400, 'WAF Legacy 404 Cache TTL must be between 0 and 86400 seconds.'],
};

function pickCachePolicy(s: any) {
  return {
    edge_html_cache_ttl_sec: Number(s?.edge_html_cache_ttl_sec ?? 300),
    l1_heartbeat_interval_sec: Number(s?.l1_heartbeat_interval_sec ?? 30),
    user_status_cache_ttl_sec: Number(s?.user_status_cache_ttl_sec ?? 30),
    admin_order_stats_ttl_sec: Number(s?.admin_order_stats_ttl_sec ?? 30),
    l1_negative_cache_ttl_sec: Number(s?.l1_negative_cache_ttl_sec ?? 60),
    edge_404_cache_ttl_sec: Number(s?.edge_404_cache_ttl_sec ?? 300),
    waf_legacy_404_ttl_sec: Number(s?.waf_legacy_404_ttl_sec ?? 3600),
    enable_url_cache_stats: Boolean(s?.enable_url_cache_stats ?? true),
  };
}

export const GET: APIRoute = defineAdminApi(
  { menu: 'cache' },
  async ({ cfEnv }) => {
    const [routeRevisions, sysSettings] = await Promise.all([
      getRouteRevisions(cfEnv).catch(() => ({})),
      getSystemSettings(cfEnv).catch(() => null),
    ]);
    return jsonNoCache({
      success: true,
      statsSnapshot: getGlobalCacheStatsSnapshot(),
      routeRevisions,
      cachePolicy: pickCachePolicy(sysSettings),
    });
  }
);

export const POST: APIRoute = defineAdminApi(
  { permission: 'cache:purge' },
  async ({ context, request, auth, cfEnv }) => {
    const startTime = Date.now();

    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const scope = body.scope || 'all'; // 'all' | 'products' | 'pages' | 'config' | 'dicts' | 'settings' | 'waf' | 'rbac' | 'orders' | 'path' | 'partition' | 'reset_stats'
    const targetPath = body.path ? String(body.path).trim() : null;
    const targetCacheName = body.partition ? String(body.partition).trim() : null;

    if (scope === 'save_policy') {
      const rawUpdates = body.updates && typeof body.updates === 'object' ? body.updates : {};
      const updates: Record<string, number | boolean> = {};
      for (const [key, [min, max, errMsg]] of Object.entries(CACHE_POLICY_RANGES)) {
        if (rawUpdates[key] === undefined) continue;
        const val = parseInt(String(rawUpdates[key]), 10);
        if (isNaN(val) || val < min || val > max || (key === 'l1_heartbeat_interval_sec' && val > 0 && val < 5)) {
          return jsonNoCache({ error: errMsg }, 400);
        }
        updates[key] = val;
      }
      if (rawUpdates.enable_url_cache_stats !== undefined) {
        updates.enable_url_cache_stats = Boolean(rawUpdates.enable_url_cache_stats);
      }
      if (Object.keys(updates).length === 0) {
        return jsonNoCache({ error: 'No valid cache policy fields provided.' }, 400);
      }
      const saveRes = await updateSystemSettings(updates, auth.user.email, cfEnv);
      if (!saveRes.success) {
        return jsonNoCache({ error: saveRes.error || 'Failed to save cache policy.' }, 500);
      }
      const refreshed = await getSystemSettings(cfEnv).catch(() => null);
      const durationMs = Date.now() - startTime;
      recordAdminAudit(context, {
        adminEmail: auth.user.email,
        action: 'CACHE_POLICY_UPDATE',
        targetType: 'cache',
        targetId: 'policy',
        after: updates,
        durationMs,
        cfEnv,
      });
      return jsonNoCache({
        success: true,
        scope,
        cachePolicy: pickCachePolicy(refreshed),
        durationMs,
        message: 'Cache policy settings saved and synced.',
      });
    }

    if (scope === 'reset_stats') {
      resetGlobalCacheStats();
      const routeRevisions = await getRouteRevisions(cfEnv).catch(() => ({}));
      return jsonNoCache({
        success: true,
        scope,
        purgedItems: ['Reset isolate Hit/Miss telemetry counters'],
        durationMs: Date.now() - startTime,
        statsSnapshot: getGlobalCacheStatsSnapshot(),
        routeRevisions,
        message: 'Cache telemetry counters reset.',
      });
    }

    const purgedItems: string[] = [];
    let bundleRebuilt = false;

    if (scope === 'partition' && targetCacheName) {
      if (targetCacheName === 'edge:html_cache') {
        const corePaths = new Set(['/', '/products', '/about', '/private-label', '/contact']);
        const prevRevs = await getRouteRevisions(cfEnv).catch(() => ({}));
        await bumpRouteRevisions(corePaths, false, cfEnv).catch(() => {});
        bundleRebuilt = true;
        await purgeEdgeHtmlCache({
          targetPaths: corePaths,
          origin: new URL(request.url).origin,
          cfEnv,
          prevRevs,
        }).catch(() => null);
        const warmed = prewarmEdgeRoutes({ targetPaths: corePaths, origin: new URL(request.url).origin, cfEnv });
        purgedItems.push(`Worker Edge HTML Cache (core routes bumped, prewarmed ${warmed.length} routes)`);
      } else {
        const ok = await purgeSingleCacheByName(targetCacheName, cfEnv);
        if (!ok) {
          return jsonNoCache({ error: `Unknown cache partition: ${targetCacheName}` }, 404);
        }
        purgedItems.push(`Partition refreshed/invalidated: ${targetCacheName}`);
      }
    } else {
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

      const regPurged = await purgeRegisteredCaches(scope, cfEnv);
      if (regPurged.length > 0) {
        purgedItems.push(`Registered caches (${regPurged.join(', ')})`);
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
        const affectedScopes: CacheLedgerScope[] =
          scope === 'all'
            ? ['products', 'pages', 'config', 'settings', 'waf', 'dicts', 'rbac']
            : scope === 'products'
              ? ['products']
              : scope === 'pages'
                ? ['pages']
                : scope === 'config'
                  ? ['config']
                  : scope === 'settings'
                    ? ['settings', 'waf']
                    : targetPath?.startsWith('/products/')
                      ? ['products']
                      : ['pages'];
        await bumpRouteRevisions(edgePaths, bumpGlobalLayout, cfEnv, affectedScopes).catch(() => {});
        bundleRebuilt = true;

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
        const warmed = prewarmEdgeRoutes({
          targetPaths: edgePaths,
          origin: new URL(request.url).origin,
          cfEnv,
        });
        if (warmed.length > 0) {
          purgedItems.push(`Background prewarmed ${warmed.length} routes (${warmed.slice(0, 3).join(', ')}...)`);
        }
      }
    }

    if (!bundleRebuilt) {
      await rebuildEdgePreloadBundle(cfEnv).catch(() => {});
    }

    if (scope === 'all') {
      const legacyDeleted = await purgeLegacyEpochKvKeys(cfEnv).catch(() => 0);
      if (legacyDeleted > 0) {
        purgedItems.push(`Legacy @epoch KV keys cleaned (${legacyDeleted} keys)`);
      }
    }

    const durationMs = Date.now() - startTime;
    const routeRevisions = await getRouteRevisions(cfEnv).catch(() => ({}));

    recordAdminAudit(context, {
      adminEmail: auth.user.email,
      action: 'CACHE_PURGE',
      targetType: 'cache',
      targetId: scope + (targetPath ? `:${targetPath}` : targetCacheName ? `:${targetCacheName}` : ''),
      after: { scope, targetPath, targetCacheName, purgedItems },
      durationMs,
      cfEnv,
    });

    return jsonNoCache({
      success: true,
      scope,
      targetPath,
      purgedItems,
      durationMs,
      statsSnapshot: getGlobalCacheStatsSnapshot(),
      routeRevisions,
      message: `Cache successfully purged (${purgedItems.length} cache partitions cleared in ${durationMs}ms).`,
    });
  }
);

