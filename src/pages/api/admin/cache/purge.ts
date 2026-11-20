// src/pages/api/admin/cache/purge.ts
// Cloudflare Edge HTML & L2 KV Multi-Tier Cache Purge API
import type { APIRoute } from 'astro';
import { defineAdminApi, jsonNoCache } from '@utils/auth';
import { ProductService } from '@data/products';
import { PageService } from '@data/page';
import { SiteConfigService } from '@data/siteConfig';
import { RfqSettingsService } from '@data/rfqSettings';
import '@db';
import '@utils/dicts';
import {
  purgeRegisteredCaches,
  purgeSingleCacheByName,
  getGlobalCacheStatsSnapshot,
  resetGlobalCacheStats,
} from '@utils/cache';
import { recordAdminAudit } from '@db/audit.repo';
import { getRouteRevisions, bumpRouteRevisions, purgeEdgeHtmlCache, rebuildEdgePreloadBundle } from '@utils/cmsSync';

export const prerender = false;

export const GET: APIRoute = defineAdminApi(
  { menu: 'cache' },
  async ({ cfEnv }) => {
    const routeRevisions = await getRouteRevisions(cfEnv).catch(() => ({}));
    return jsonNoCache({
      success: true,
      statsSnapshot: getGlobalCacheStatsSnapshot(),
      routeRevisions,
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

    if (scope === 'partition' && targetCacheName) {
      if (targetCacheName === 'edge:html_cache') {
        const corePaths = new Set(['/', '/products', '/about', '/private-label', '/contact']);
        const prevRevs = await getRouteRevisions(cfEnv).catch(() => ({}));
        await bumpRouteRevisions(corePaths, false, cfEnv).catch(() => {});
        await purgeEdgeHtmlCache({
          targetPaths: corePaths,
          origin: new URL(request.url).origin,
          cfEnv,
          prevRevs,
        }).catch(() => null);
        purgedItems.push('Worker Edge HTML Cache (core routes bumped)');
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
    }

    await rebuildEdgePreloadBundle(cfEnv).catch(() => {});

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

