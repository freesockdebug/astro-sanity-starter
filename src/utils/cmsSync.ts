// src/utils/cmsSync.ts
// Unified CMS Cache Synchronization & Edge Purge Engine
import { NON_DEFAULT_LOCALES } from '@i18n';
import { ProductService } from '@data/products';
import { PageService } from '@data/page';
import { SiteConfigService } from '@data/siteConfig';
import { RfqSettingsService } from '@data/rfqSettings';
import { SecurityService } from '@utils/security';
import {
  DEFAULT_SYSTEM_SETTINGS,
  settingsCache,
  wafRuntimeCache,
  getSystemSettings,
  getWafRuntime,
  invalidateSettingsCache,
  type SystemSettings,
} from '@db';
import { getRuntimeEnv } from '@utils/auth';
import { kvGet, kvPut, runInBackground, ROUTE_REVS_KV_KEY, invalidateRegisteredCachesByScope, registerEpochBumpListener, syncActiveCacheEpochs } from '@utils/cache';
import { normalizeWafRuleConfig, type CompiledWafRuntime, type WafRuntimeData } from '@utils/waf';
import type { SiteConfig, RfqSettings } from 'types';

export interface CmsSyncOptions {
  docType?: string;
  slug?: string;
  oldSlug?: string;
  operation?: 'create' | 'update' | 'delete' | 'disappear' | string;
  targetPaths?: Iterable<string>;
  origin: string;
  cfEnv?: any;
  isDebug?: boolean;
  cardFieldsChanged?: boolean;
}

export const EDGE_PRELOAD_KV_KEY = 'edge:preload:v1';
const EDGE_PRELOAD_L0_URL = 'https://edge-preload.internal/edge-preload-v1';
const EDGE_PRELOAD_L0_TTL_SEC = 30;

function getEdgeDefaultCache(): any | null {
  return typeof caches !== 'undefined' && (caches as any).default ? (caches as any).default : null;
}

function isValidPreloadBundle(bundle: any): bundle is EdgePreloadBundle {
  return Boolean(bundle && typeof bundle === 'object' && bundle.routeRevs && typeof bundle.routeRevs === 'object');
}

async function readPreloadBundleFromL0(): Promise<EdgePreloadBundle | null> {
  const cache = getEdgeDefaultCache();
  if (!cache) return null;
  try {
    const res = await cache.match(new Request(EDGE_PRELOAD_L0_URL, { method: 'GET' }));
    if (!res) return null;
    const parsed = await res.json();
    return isValidPreloadBundle(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writePreloadBundleToL0(bundle: EdgePreloadBundle): Promise<void> {
  const cache = getEdgeDefaultCache();
  if (!cache) return;
  try {
    const res = new Response(JSON.stringify(bundle), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${EDGE_PRELOAD_L0_TTL_SEC}, s-maxage=${EDGE_PRELOAD_L0_TTL_SEC}`,
      },
    });
    await cache.put(new Request(EDGE_PRELOAD_L0_URL, { method: 'GET' }), res);
  } catch {
    // Non-blocking L0 cache write failure
  }
}

async function deletePreloadBundleFromL0(): Promise<void> {
  const cache = getEdgeDefaultCache();
  if (!cache) return;
  try {
    await cache.delete(new Request(EDGE_PRELOAD_L0_URL, { method: 'GET' }));
  } catch {
    // Non-blocking L0 cache delete failure
  }
}

export type CacheLedgerScope = 'settings' | 'waf' | 'dicts' | 'rbac' | 'config' | 'products' | 'pages';

export const ALL_LEDGER_SCOPES: readonly CacheLedgerScope[] = [
  'settings',
  'waf',
  'dicts',
  'rbac',
  'config',
  'products',
  'pages',
];

export interface RouteRevisionsLedger {
  v: number;
  scopes: Partial<Record<CacheLedgerScope, number>>;
  routes: Record<string, number>;
}

export interface EdgePreloadBundle {
  updatedAt: number;
  routeRevs: RouteRevisionsLedger;
  systemSettings: SystemSettings | null;
  wafRuntime: WafRuntimeData | null;
  siteConfig: SiteConfig | null;
  rfqSettings: RfqSettings | null;
  pageSlugs?: string[];
  productSlugs?: string[];
}

let localRouteRevs: RouteRevisionsLedger | null = null;
let localRouteRevsLoadedAt = 0;
let localPreloadLoadedAt = 0;
let localPreloadBundleUpdatedAt = 0;
let isRebuildingPreload = false;
let preloadRebuildPending = false;
let preloadRebuildEnv: any = undefined;
const ROUTE_REVS_SYNC_INTERVAL_MS = 30_000;

function normalizeLedger(raw: any): RouteRevisionsLedger {
  if (raw && typeof raw === 'object' && typeof raw.v === 'number' && raw.routes && typeof raw.routes === 'object') {
    return {
      v: raw.v,
      scopes: raw.scopes && typeof raw.scopes === 'object' ? { ...raw.scopes } : {},
      routes: { ...raw.routes },
    };
  }
  const routes: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [k, val] of Object.entries(raw)) {
      if (typeof val === 'number' && (k === '__layout' || k.startsWith('/'))) {
        routes[k] = val;
      }
    }
  }
  return { v: 0, scopes: {}, routes };
}

function applyRouteRevisionsUpdate(rawRevs: any, now: number): void {
  const nextLedger = normalizeLedger(rawRevs);
  const prevLedger = localRouteRevs;
  localRouteRevs = nextLedger;
  syncActiveCacheEpochs(nextLedger.scopes);

  if (prevLedger && prevLedger.v > 0) {
    for (const scope of ALL_LEDGER_SCOPES) {
      if (nextLedger.scopes[scope] !== prevLedger.scopes[scope]) {
        invalidateRegisteredCachesByScope(scope);
      }
    }
  }

  localRouteRevsLoadedAt = now;
}

registerEpochBumpListener((epochKey, ts, cfEnv) => {
  const scope = epochKey.replace(/^__/, '') as CacheLedgerScope;
  if (!localRouteRevs) {
    localRouteRevs = { v: ts, scopes: {}, routes: {} };
  }
  localRouteRevs.v = ts;
  localRouteRevs.scopes[scope] = ts;
  localRouteRevsLoadedAt = ts;

  runInBackground(
    (async () => {
      const kvRaw = await kvGet<any>(ROUTE_REVS_KV_KEY, cfEnv).catch(() => null);
      const merged = normalizeLedger(kvRaw);
      merged.v = Math.max(merged.v, ts);
      merged.scopes = { ...merged.scopes, ...localRouteRevs?.scopes, [scope]: ts };
      merged.routes = { ...merged.routes, ...localRouteRevs?.routes };
      localRouteRevs = merged;
      await kvPut(ROUTE_REVS_KV_KEY, merged, undefined, cfEnv).catch(() => { });
      await rebuildEdgePreloadBundle(cfEnv).catch(() => null);
    })()
  );
});

export async function getRouteRevisions(cfEnv?: any, force = false): Promise<RouteRevisionsLedger> {
  const now = Date.now();
  if (!force && localRouteRevs && localRouteRevsLoadedAt > 0 && now - localRouteRevsLoadedAt < ROUTE_REVS_SYNC_INTERVAL_MS) {
    return localRouteRevs;
  }
  const kvRevs = await kvGet<any>(ROUTE_REVS_KV_KEY, cfEnv).catch(() => null);
  if (kvRevs && typeof kvRevs === 'object') {
    applyRouteRevisionsUpdate(kvRevs, now);
  } else {
    if (!localRouteRevs) localRouteRevs = { v: 0, scopes: {}, routes: {} };
    localRouteRevsLoadedAt = now;
  }
  return localRouteRevs!;
}

/**
 * Rebuilds the single aggregated cold-start preload bundle (`edge:preload:v1`) from warm L1 or L2/L3 sources
 */
export async function rebuildEdgePreloadBundle(cfEnv?: any): Promise<EdgePreloadBundle | null> {
  if (isRebuildingPreload) {
    preloadRebuildPending = true;
    if (cfEnv !== undefined) preloadRebuildEnv = cfEnv;
    return null;
  }
  isRebuildingPreload = true;
  try {
    const routeRevs = localRouteRevs
      ? { v: localRouteRevs.v, scopes: { ...localRouteRevs.scopes }, routes: { ...localRouteRevs.routes } }
      : await getRouteRevisions(cfEnv).catch(() => ({ v: 0, scopes: {}, routes: {} }));
    const systemSettings = settingsCache.peek() ?? (await getSystemSettings(cfEnv).catch(() => null));
    let wafRaw = wafRuntimeCache.peekRaw();
    if (!wafRaw) {
      await getWafRuntime(cfEnv).catch(() => null);
      wafRaw = wafRuntimeCache.peekRaw();
    }
    const siteConfig = SiteConfigService.peek() ?? (await SiteConfigService.getConfig().catch(() => null));
    const rfqSettings = RfqSettingsService.peek() ?? (await RfqSettingsService.getSettings().catch(() => null));
    const pageSlugs = PageService.getCachedSlugs() ?? (await PageService.getSlugs(cfEnv).catch(() => []));
    const productSlugs = ProductService.getCachedSlugs() ?? (await ProductService.getSlugs(cfEnv).catch(() => []));

    const updatedAt = Date.now();
    const bundle: EdgePreloadBundle = {
      updatedAt,
      routeRevs: routeRevs && typeof (routeRevs as any).v === 'number' ? (routeRevs as RouteRevisionsLedger) : { v: 0, scopes: {}, routes: {} },
      systemSettings,
      wafRuntime: wafRaw,
      siteConfig,
      rfqSettings,
      pageSlugs,
      productSlugs,
    };

    await kvPut(EDGE_PRELOAD_KV_KEY, bundle, undefined, cfEnv).catch(() => { });
    await writePreloadBundleToL0(bundle);
    localPreloadLoadedAt = updatedAt;
    localRouteRevsLoadedAt = updatedAt;
    localPreloadBundleUpdatedAt = updatedAt;
    return bundle;
  } finally {
    isRebuildingPreload = false;
    if (preloadRebuildPending) {
      preloadRebuildPending = false;
      const nextEnv = preloadRebuildEnv ?? cfEnv;
      preloadRebuildEnv = undefined;
      await rebuildEdgePreloadBundle(nextEnv).catch(() => null);
    }
  }
}

export type PreloadStatus =
  | 'L1_HIT'
  | 'L1_HIT_SWR'
  | 'L0_PRELOAD_HIT'
  | 'OPTIMISTIC_SWR'
  | 'L2_KV_HIT'
  | 'L3_MISS';

let isHeartbeatInFlight = false;

function hydrateFromPreloadBundle(
  bundle: EdgePreloadBundle,
  now: number,
  heartbeatLedger: RouteRevisionsLedger | null = null
): void {
  const bundleLedger = normalizeLedger(bundle.routeRevs);
  const mergedLedger: RouteRevisionsLedger =
    heartbeatLedger && heartbeatLedger.v >= bundleLedger.v
      ? {
          v: heartbeatLedger.v,
          scopes: { ...bundleLedger.scopes, ...heartbeatLedger.scopes },
          routes: { ...bundleLedger.routes, ...heartbeatLedger.routes },
        }
      : bundleLedger;
  applyRouteRevisionsUpdate(mergedLedger, now);

  const bundleChanged = bundle.updatedAt !== localPreloadBundleUpdatedAt;
  if (
    (bundleChanged || !settingsCache.peek()) &&
    bundle.systemSettings &&
    typeof bundle.systemSettings === 'object' &&
    bundle.systemSettings.brand_name
  ) {
    settingsCache.seed({
      ...DEFAULT_SYSTEM_SETTINGS,
      ...bundle.systemSettings,
      waf_rule_config: normalizeWafRuleConfig(bundle.systemSettings.waf_rule_config),
    }, true);
  }
  if (
    (bundleChanged || !wafRuntimeCache.peek()) &&
    bundle.wafRuntime &&
    Array.isArray(bundle.wafRuntime.rules) &&
    Array.isArray(bundle.wafRuntime.ipAcl) &&
    bundle.wafRuntime.rules.some((r: any) => r?.id === 'sys_legacy_cms_paths')
  ) {
    wafRuntimeCache.seed(bundle.wafRuntime, true);
  }
  if ((bundleChanged || !SiteConfigService.peek()) && bundle.siteConfig) {
    SiteConfigService.seed(bundle.siteConfig, true);
  }
  if ((bundleChanged || !RfqSettingsService.peek()) && bundle.rfqSettings) {
    RfqSettingsService.seed(bundle.rfqSettings, true);
  }
  if (Array.isArray(bundle.pageSlugs) && bundle.pageSlugs.length > 0) {
    PageService.seedSlugs(bundle.pageSlugs, true);
  }
  if (Array.isArray(bundle.productSlugs) && bundle.productSlugs.length > 0) {
    ProductService.seedSlugs(bundle.productSlugs, true);
  }

  localPreloadLoadedAt = now;
  localPreloadBundleUpdatedAt = bundle.updatedAt || now;
}

/**
 * Non-blocking SWR Background Heartbeat:
 * Checks `cms:route_revs` (v integer) in the background via waitUntil.
 * If remote ledger version changed, pulls `edge:preload:v1` and hot-swaps L1 caches without stalling user response.
 */
async function runHeartbeatSync(cfEnv?: any): Promise<void> {
  if (isHeartbeatInFlight) return;
  isHeartbeatInFlight = true;
  const now = Date.now();
  try {
    const kvRaw = await kvGet<any>(ROUTE_REVS_KV_KEY, cfEnv).catch(() => null);
    const heartbeatLedger = kvRaw && typeof kvRaw === 'object' ? normalizeLedger(kvRaw) : null;

    if (
      localRouteRevs &&
      ((heartbeatLedger !== null && heartbeatLedger.v === localRouteRevs.v) ||
        (heartbeatLedger === null && localRouteRevs.v === 0))
    ) {
      localPreloadLoadedAt = Date.now();
      localRouteRevsLoadedAt = Date.now();
      return;
    }

    const bundle = await kvGet<EdgePreloadBundle>(EDGE_PRELOAD_KV_KEY, cfEnv).catch(() => null);
    if (isValidPreloadBundle(bundle)) {
      hydrateFromPreloadBundle(bundle, now, heartbeatLedger);
      runInBackground(writePreloadBundleToL0(bundle));
    } else if (heartbeatLedger) {
      applyRouteRevisionsUpdate(heartbeatLedger, now);
      localPreloadLoadedAt = Date.now();
    }
  } catch {
    // Non-fatal background heartbeat error
  } finally {
    isHeartbeatInFlight = false;
  }
}

let inFlightHydratePromise: Promise<{
  routeRevisions: RouteRevisionsLedger;
  wafSettings: SystemSettings | null;
  wafRuntime: CompiledWafRuntime | null;
  preloadStatus: PreloadStatus;
}> | null = null;

function hydratePreloadFromKv(
  cfEnv: any,
  now: number
): Promise<{
  routeRevisions: RouteRevisionsLedger;
  wafSettings: SystemSettings | null;
  wafRuntime: CompiledWafRuntime | null;
  preloadStatus: PreloadStatus;
}> {
  if (inFlightHydratePromise) return inFlightHydratePromise;
  inFlightHydratePromise = (async () => {
    try {
      const bundle = await kvGet<EdgePreloadBundle>(EDGE_PRELOAD_KV_KEY, cfEnv).catch(() => null);
      if (isValidPreloadBundle(bundle)) {
        hydrateFromPreloadBundle(bundle, now, null);
        runInBackground(writePreloadBundleToL0(bundle));

        const neededFallback = !settingsCache.peek() || !wafRuntimeCache.peek();
        const wafSettings = settingsCache.peek() ?? (await getSystemSettings(cfEnv).catch(() => null));
        const wafRuntime = wafRuntimeCache.peek() ?? (await getWafRuntime(cfEnv).catch(() => null));
        return {
          routeRevisions: localRouteRevs || { v: 0, scopes: {}, routes: {} },
          wafSettings,
          wafRuntime,
          preloadStatus: neededFallback ? ('L3_MISS' as const) : ('L2_KV_HIT' as const),
        };
      }

      // Fallback when edge:preload:v1 has not been populated yet
      const [routeRevisions, wafSettings, wafRuntime] = await Promise.all([
        getRouteRevisions(cfEnv).catch(() => ({ v: 0, scopes: {}, routes: {} } as RouteRevisionsLedger)),
        getSystemSettings(cfEnv).catch(() => null),
        getWafRuntime(cfEnv).catch(() => null),
        SiteConfigService.getConfig().catch(() => null),
        RfqSettingsService.getSettings().catch(() => null),
      ]);
      localPreloadLoadedAt = now;
      runInBackground(rebuildEdgePreloadBundle(cfEnv));
      return { routeRevisions, wafSettings, wafRuntime, preloadStatus: 'L3_MISS' as const };
    } finally {
      inFlightHydratePromise = null;
    }
  })();
  return inFlightHydratePromise;
}

/**
 * Cold-start single-KV preload: hydrates routeRevs, settings, WAF runtime, siteConfig, rfqSettings & slug guards in 1 KV read
 */
export async function preloadEdgeIsolate(
  cfEnv?: any,
  force = false,
  allowOptimistic = false
): Promise<{
  routeRevisions: RouteRevisionsLedger;
  wafSettings: SystemSettings | null;
  wafRuntime: CompiledWafRuntime | null;
  preloadStatus: PreloadStatus;
}> {
  const now = Date.now();
  const isL1Populated = Boolean(
    localRouteRevs &&
    localPreloadLoadedAt > 0 &&
    settingsCache.peek() &&
    wafRuntimeCache.peek()
  );

  if (!force && isL1Populated) {
    const heartbeatSec = settingsCache.peek()?.l1_heartbeat_interval_sec ?? 30;
    const syncIntervalMs = heartbeatSec <= 0 ? Infinity : Math.max(5, heartbeatSec) * 1000;
    const needsSync = now - localPreloadLoadedAt >= syncIntervalMs;
    if (needsSync) {
      localPreloadLoadedAt = now;
      runInBackground(runHeartbeatSync(cfEnv));
    }
    return {
      routeRevisions: localRouteRevs!,
      wafSettings: settingsCache.peek(true),
      wafRuntime: wafRuntimeCache.peek(true),
      preloadStatus: needsSync ? 'L1_HIT_SWR' : 'L1_HIT',
    };
  }

  // 1. Cold Isolate fast-path: share colo-wide L0 (caches.default) preload envelope (~1ms, 0 KV reads)
  if (!force) {
    const l0Bundle = await readPreloadBundleFromL0();
    if (l0Bundle) {
      hydrateFromPreloadBundle(l0Bundle, now, null);
      const wafSettings = settingsCache.peek(true);
      const wafRuntime = wafRuntimeCache.peek(true);
      if (wafSettings && wafRuntime) {
        runInBackground(runHeartbeatSync(cfEnv));
        return {
          routeRevisions: localRouteRevs || { v: 0, scopes: {}, routes: {} },
          wafSettings,
          wafRuntime,
          preloadStatus: 'L0_PRELOAD_HIT',
        };
      }
    }

    // 2. Optimistic SWR fast-path for public cacheable GETs when both L1 & L0 preload are cold:
    //    proceed immediately with static DEFAULT_SYSTEM_SETTINGS WAF + unversioned L0 HTML alias while hydrating KV in background.
    if (allowOptimistic) {
      runInBackground(hydratePreloadFromKv(cfEnv, now));
      return {
        routeRevisions: { v: 0, scopes: {}, routes: {} },
        wafSettings: DEFAULT_SYSTEM_SETTINGS,
        wafRuntime: null,
        preloadStatus: 'OPTIMISTIC_SWR',
      };
    }
  } else {
    await deletePreloadBundleFromL0();
  }

  return hydratePreloadFromKv(cfEnv, now);
}

/**
 * Increment revision timestamps for specific base paths (e.g. ['/products/cashmere', '/products'])
 */
export async function bumpRouteRevisions(
  basePaths: Iterable<string>,
  bumpGlobalLayout = false,
  cfEnv?: any,
  affectedScopes?: Iterable<CacheLedgerScope>
): Promise<RouteRevisionsLedger> {
  const kvRaw = await kvGet<any>(ROUTE_REVS_KV_KEY, cfEnv).catch(() => null);
  const kvLedger = normalizeLedger(kvRaw);
  const now = Date.now();

  const updated: RouteRevisionsLedger = {
    v: Math.max(kvLedger.v, localRouteRevs?.v || 0, now),
    scopes: { ...kvLedger.scopes, ...(localRouteRevs?.scopes || {}) },
    routes: { ...kvLedger.routes, ...(localRouteRevs?.routes || {}) },
  };

  if (bumpGlobalLayout) {
    updated.routes.__layout = now;
  }
  for (const rawPath of basePaths) {
    if (!rawPath) continue;
    const clean = rawPath === '/' ? '/' : `/${rawPath.replace(/^\/+|\/+$/g, '')}`;
    updated.routes[clean] = now;
  }
  if (affectedScopes) {
    for (const scope of affectedScopes) {
      updated.scopes[scope] = now;
    }
  }

  // Prune redundant per-route keys older than __layout when route map exceeds 100 entries
  const layoutRev = updated.routes.__layout || 0;
  if (layoutRev > 0 && Object.keys(updated.routes).length > 100) {
    for (const [k, rev] of Object.entries(updated.routes)) {
      if (k !== '__layout' && rev <= layoutRev) {
        delete updated.routes[k];
      }
    }
  }

  localRouteRevs = updated;
  localRouteRevsLoadedAt = now;
  syncActiveCacheEpochs(updated.scopes);
  await kvPut(ROUTE_REVS_KV_KEY, updated, undefined, cfEnv).catch(() => { });
  await rebuildEdgePreloadBundle(cfEnv).catch(() => { });
  return updated;
}

/**
 * Resolves the effective route revision timestamp for a given pathname
 */
export function resolvePathRevision(
  pathname: string,
  revs: RouteRevisionsLedger | Record<string, number> | null | undefined,
  supportedLocales: readonly string[]
): number {
  let basePath = pathname.replace(/\/+$/, '') || '/';
  for (const loc of supportedLocales) {
    if (basePath === `/${loc}`) {
      basePath = '/';
      break;
    }
    if (basePath.startsWith(`/${loc}/`)) {
      basePath = basePath.slice(loc.length + 1) || '/';
      break;
    }
  }
  const routes: Record<string, number> =
    revs && 'routes' in revs && revs.routes && typeof revs.routes === 'object'
      ? (revs.routes as Record<string, number>)
      : ((revs as Record<string, number>) || {});
  const routeRev = routes[basePath] || 0;
  const layoutRev = routes.__layout || 0;
  return Math.max(routeRev, layoutRev);
}

const CARD_IMPACT_KEYS = [
  'title', 'shortTitle', 'slug', 'sku', 'currency', 'tagline',
  'moq', 'leadTime', 'mainImage', 'colors', 'pricingTiers', 'category'
];

/**
 * Compares two product documents to check if listing card attributes changed
 */
export function hasProductCardFieldsChanged(beforeDoc: any, afterDoc: any): boolean {
  if (!beforeDoc || !afterDoc) return true;
  for (const key of CARD_IMPACT_KEYS) {
    if (JSON.stringify(beforeDoc[key]) !== JSON.stringify(afterDoc[key])) {
      return true;
    }
  }
  const specBefore = (beforeDoc.specifications || []).slice(0, 2);
  const specAfter = (afterDoc.specifications || []).slice(0, 2);
  if (JSON.stringify(specBefore) !== JSON.stringify(specAfter)) {
    return true;
  }
  return false;
}

export interface CmsPurgeResult {
  urlsToPurge: string[];
  workerEntriesPurged: number;
  edgeCachePurged: boolean;
  cdnPurged: boolean;
  cloudflareMessage?: string;
  diagnostics?: any;
}

export interface CmsSyncResult extends CmsPurgeResult {
  success: boolean;
  operation: string;
  docType?: string;
  slug?: string;
  refreshedTasks: string[];
  warmedPaths?: string[];
}

/**
 * Normalises a relative path or absolute URL into canonical URL pairs (with & without trailing slash).
 */
export const expandCanonicalUrls = (origin: string, pathOrUrl: string): string[] => {
  let pathname = pathOrUrl.trim();
  if (pathname.startsWith('http://') || pathname.startsWith('https://')) {
    try {
      const u = new URL(pathname);
      pathname = u.pathname;
    } catch {
      return [pathOrUrl];
    }
  }

  // Ensure leading slash
  if (!pathname.startsWith('/')) {
    pathname = `/${pathname}`;
  }

  if (pathname === '/') {
    return [`${origin}/`];
  }

  const clean = pathname.replace(/\/+$/, '');
  return [
    `${origin}${clean}`,
    `${origin}${clean}/`,
  ];
};

/**
 * Automatically expands paths across default locale and all supported non-default locales derived from SSOT.
 */
export const expandLocalizedPaths = (paths: Iterable<string>): string[] => {
  const supportedLocales = NON_DEFAULT_LOCALES;
  const allPaths = new Set<string>();

  for (const raw of paths) {
    if (!raw) continue;
    const cleanPath = raw.startsWith('/') ? raw : `/${raw}`;
    allPaths.add(cleanPath);

    // Expand to locale prefixes unless already localized
    const startsWithLocale = supportedLocales.some((l) => cleanPath.startsWith(`/${l}/`) || cleanPath === `/${l}`);
    if (!startsWithLocale) {
      for (const loc of supportedLocales) {
        const localized = cleanPath === '/' ? `/${loc}` : `/${loc}${cleanPath}`;
        allPaths.add(localized);
      }
    }
  }

  return Array.from(allPaths);
};

/**
 * Verifies official Sanity Webhook signature: `sanity-webhook-signature: t=<timestamp>,v1=<signature>`
 * Computes HMAC-SHA256(`${t}.${rawBody}`) using Web Crypto and performs constant-time equality check.
 */
export async function verifySanitySignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
  toleranceSeconds = 300
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;

  try {
    const pairs = signatureHeader.split(',').reduce((acc, part) => {
      const eqIdx = part.indexOf('=');
      if (eqIdx !== -1) {
        const k = part.slice(0, eqIdx).trim();
        const v = part.slice(eqIdx + 1).trim();
        if (k && v) acc[k] = v;
      }
      return acc;
    }, {} as Record<string, string>);

    const timestamp = parseInt(pairs.t, 10);
    const signature = pairs.v1;

    if (!timestamp || isNaN(timestamp) || !signature) {
      return false;
    }

    // Replay attack prevention: verify timestamp freshness
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > toleranceSeconds) {
      return false;
    }

    // Compute HMAC-SHA256 using standard Web Crypto API
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const dataToSign = enc.encode(`${timestamp}.${rawBody}`);
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, dataToSign);
    const computedHex = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return SecurityService.timingSafeEqual(computedHex, signature);
  } catch {
    return false;
  }
}

/**
 * Purges Cloudflare Worker Edge HTML Cache (`caches.default`) and Cloudflare Global CDN.
 */
export async function purgeEdgeHtmlCache(params: {
  targetPaths: Iterable<string>;
  origin: string;
  cfEnv?: any;
  isDebug?: boolean;
  prevRevs?: RouteRevisionsLedger | Record<string, number>;
  purgeEverything?: boolean;
}): Promise<CmsPurgeResult> {
  const { targetPaths, origin, cfEnv, isDebug, prevRevs, purgeEverything = false } = params;

  // 1. Expand paths across locales and trailing slashes
  const localizedPaths = expandLocalizedPaths(targetPaths);
  const revs = prevRevs || await getRouteRevisions(cfEnv).catch(() => ({}));
  const targetOrigins = new Set<string>([origin]);
  const urlsToPurge: string[] = [];
  const cdnFilesToPurge: string[] = [];
  const urlSet = new Set<string>();
  const cdnSet = new Set<string>();

  for (const p of localizedPaths) {
    const pathRev = resolvePathRevision(p, revs, NON_DEFAULT_LOCALES);
    for (const org of targetOrigins) {
      const expanded = expandCanonicalUrls(org, p);
      for (const u of expanded) {
        if (!urlSet.has(u)) {
          urlSet.add(u);
          urlsToPurge.push(u);
        }
        if (!cdnSet.has(u)) {
          cdnSet.add(u);
          cdnFilesToPurge.push(u);
        }
        if (pathRev > 0) {
          const revUrl = new URL(u);
          revUrl.searchParams.set('__rev', String(pathRev));
          const revStr = revUrl.toString();
          if (!urlSet.has(revStr)) {
            urlSet.add(revStr);
            urlsToPurge.push(revStr);
          }
        }
      }
    }
  }

  // 2. Layer 1: Worker Edge HTML Cache (caches.default in middleware.ts)
  await deletePreloadBundleFromL0();
  let workerPurgedCount = 0;
  const workerCache = typeof caches !== 'undefined' && (caches as any).default
    ? (caches as any).default
    : null;

  if (workerCache && urlsToPurge.length > 0) {
    const deleteResults = await Promise.allSettled(
      urlsToPurge.map((targetUrl) =>
        workerCache.delete(new Request(targetUrl, { method: 'GET' }))
      )
    );
    for (const res of deleteResults) {
      if (res.status === 'fulfilled' && res.value) {
        workerPurgedCount++;
      }
    }
  }

  // 3. Layer 2: Cloudflare Global CDN Zone Purge API
  const systemSettings = await getSystemSettings(cfEnv).catch(() => null);
  let cfZoneId = (systemSettings?.cloudflare_zone_id || getRuntimeEnv('CLOUDFLARE_ZONE_ID', cfEnv))?.trim();
  const rawCfToken = systemSettings?.cloudflare_api_token || getRuntimeEnv('CLOUDFLARE_API_TOKEN', cfEnv);
  const cfApiToken = rawCfToken?.trim();

  let cfPurged = false;
  let cfMessage = 'Skipped (credentials not configured)';
  let cfDiagnostics: any = undefined;

  const currentUrl = new URL(origin);

  if (cfApiToken && (purgeEverything || cdnFilesToPurge.length > 0)) {
    try {
      // Diagnostic probe when isDebug is active
      if (isDebug) {
        let tokenVerifyData: any = null;
        try {
          const verifyRes = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
            headers: {
              'Authorization': `Bearer ${cfApiToken}`,
              'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(6000),
          });
          tokenVerifyData = await verifyRes.json();
        } catch (e: any) {
          tokenVerifyData = { error: e?.message };
        }
        cfDiagnostics = {
          zoneIdProvided: Boolean(cfZoneId),
          tokenLength: cfApiToken.length,
          tokenVerification: tokenVerifyData,
        };
      }

      // Auto-discover Zone ID if not explicitly specified
      if (!cfZoneId && !currentUrl.hostname.includes('localhost') && !currentUrl.hostname.includes('127.0.0.1')) {
        const domainParts = currentUrl.hostname.split('.');
        const rootDomain = domainParts.length >= 2 ? domainParts.slice(-2).join('.') : currentUrl.hostname;
        const zoneKey = `cf:zone_id:${rootDomain}`;

        cfZoneId = await kvGet<string>(zoneKey, cfEnv);

        if (!cfZoneId) {
          const zoneRes = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${rootDomain}`, {
            headers: {
              'Authorization': `Bearer ${cfApiToken}`,
              'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(6000),
          });

          if (zoneRes.ok) {
            const zoneData: any = await zoneRes.json();
            if (zoneData?.result?.[0]?.id) {
              cfZoneId = zoneData.result[0].id;
              await kvPut(zoneKey, cfZoneId, { expirationTtl: 604800 }, cfEnv).catch(() => { });
            }
          }
        }
      }

      if (cfZoneId) {
        if (purgeEverything) {
          const cfRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${cfZoneId}/purge_cache`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${cfApiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ purge_everything: true }),
            signal: AbortSignal.timeout(6000),
          });
          const cfData: any = await cfRes.json();
          if (cfData?.success) {
            cfPurged = true;
            cfMessage = 'Successfully purged everything from Cloudflare Global CDN';
          } else {
            cfMessage = JSON.stringify(cfData?.errors || 'Purge API error');
          }
        } else {
          // Cloudflare purge_cache supports up to 30 files per request
          const chunks: string[][] = [];
          for (let i = 0; i < cdnFilesToPurge.length; i += 30) {
            chunks.push(cdnFilesToPurge.slice(i, i + 30));
          }

          let allSuccessful = true;
          for (const chunk of chunks) {
            const cfRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${cfZoneId}/purge_cache`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${cfApiToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ files: chunk }),
              signal: AbortSignal.timeout(6000),
            });

            const cfData: any = await cfRes.json();
            if (!cfData?.success) {
              allSuccessful = false;
              cfMessage = JSON.stringify(cfData?.errors || 'Purge API error');
              break;
            }
          }

          if (allSuccessful) {
            cfPurged = true;
            cfMessage = `Successfully purged ${cdnFilesToPurge.length} URLs from Cloudflare Global CDN`;
          }
        }
      } else {
        cfMessage = 'Cloudflare API Token found, but Zone ID could not be identified';
      }
    } catch (err: any) {
      cfMessage = `Cloudflare CDN purge error: ${err?.message || 'Network failure'}`;
    }
  }

  return {
    urlsToPurge,
    workerEntriesPurged: workerPurgedCount,
    edgeCachePurged: workerPurgedCount > 0 || Boolean(workerCache),
    cdnPurged: cfPurged,
    cloudflareMessage: cfMessage,
    diagnostics: cfDiagnostics,
  };
}

export const CRITICAL_WARMUP_ROUTES = ['/', '/products', '/about', '/private-label', '/contact'] as const;

/**
 * Automated background worker function that pre-warms critical application routes
 * (L1/L2 core data + L0 Edge HTML Cache) via waitUntil / runInBackground.
 */
export function prewarmEdgeRoutes(params: {
  targetPaths?: Iterable<string>;
  origin: string;
  cfEnv?: any;
  includeCriticalRoutes?: boolean;
  maxRoutes?: number;
}): string[] {
  const { targetPaths = [], origin, cfEnv, includeCriticalRoutes = true, maxRoutes = 8 } = params;
  if (!origin || origin === 'null') return [];

  const queue = new Set<string>();
  if (includeCriticalRoutes) {
    queue.add('/');
    queue.add('/products');
  }
  for (const raw of targetPaths) {
    if (!raw) continue;
    const clean = raw.startsWith('/') ? raw : `/${raw}`;
    queue.add(clean);
  }
  if (includeCriticalRoutes) {
    for (const critical of CRITICAL_WARMUP_ROUTES) {
      queue.add(critical);
    }
  }

  const warmPaths = Array.from(queue).slice(0, maxRoutes);
  if (warmPaths.length === 0) return [];

  runInBackground(
    (async () => {
      await Promise.allSettled([
        PageService.getHomePage(false, cfEnv),
        ProductService.getAll(false, cfEnv),
      ]);
      await Promise.allSettled(
        warmPaths.map((p) =>
          fetch(`${origin}${p}`, {
            method: 'GET',
            headers: {
              'User-Agent': 'Cloudflare-Edge-Warmup/1.0',
              'Accept': 'text/html',
            },
            signal: AbortSignal.timeout(6000),
          })
        )
      );
    })()
  );

  return warmPaths;
}

/**
 * Unified Write-Through CMS Mutation Handler
 * 
 * Synchronizes:
 * 1. L1 Worker Memory & L2 Permanent Cloudflare KV
 * 2. Cloudflare Worker Edge HTML Cache (`caches.default`)
 * 3. Cloudflare Global CDN Zone Cache
 */
export async function syncCmsMutation(options: CmsSyncOptions): Promise<CmsSyncResult> {
  const {
    docType,
    slug: rawSlug,
    oldSlug: rawOldSlug,
    operation = 'update',
    targetPaths: rawTargetPaths,
    origin,
    cfEnv,
    isDebug = false,
  } = options;

  const slug = rawSlug?.trim() || '';
  const oldSlug = rawOldSlug?.trim() || '';
  const isDelete = operation === 'delete' || operation === 'disappear';

  const collectedPaths = new Set<string>();
  if (rawTargetPaths) {
    for (const p of rawTargetPaths) {
      if (p) collectedPaths.add(p);
    }
  }

  const refreshTasks: Promise<any>[] = [];
  const taskDescriptions: string[] = [];

  // Determine paths and KV updates based on docType or path targeted
  if (docType) {
    switch (docType) {
      case 'product': {
        const prevProductList = await ProductService.getAll(false, cfEnv).catch(() => []);
        const addNeighborPaths = (targetSlug: string) => {
          const idx = prevProductList.findIndex((p: any) => p.slug === targetSlug);
          if (idx !== -1 && prevProductList.length > 1) {
            const prevSlug = prevProductList[(idx - 1 + prevProductList.length) % prevProductList.length]?.slug;
            const nextSlug = prevProductList[(idx + 1) % prevProductList.length]?.slug;
            if (prevSlug) collectedPaths.add(`/products/${prevSlug}`);
            if (nextSlug) collectedPaths.add(`/products/${nextSlug}`);
          }
        };

        if (slug) collectedPaths.add(`/products/${slug}`);
        if (oldSlug && oldSlug !== slug) {
          collectedPaths.add(`/products/${oldSlug}`);
          addNeighborPaths(oldSlug);
        }

        // Assess if listing cards need refresh or only detail page
        const cardChanged = options.cardFieldsChanged ?? true;
        if (isDelete || operation === 'create' || (oldSlug && oldSlug !== slug)) {
          if (slug) addNeighborPaths(slug);
          collectedPaths.add('/');
          collectedPaths.add('/products');
        } else if (cardChanged) {
          collectedPaths.add('/');
          collectedPaths.add('/products');
        }

        if (isDelete) {
          // On delete: strictly evict from KV, do NOT query Sanity!
          if (slug) {
            refreshTasks.push(ProductService.evictSlug(slug, cfEnv));
            taskDescriptions.push(`evictProductSlug(${slug})`);
          }
          refreshTasks.push(ProductService.refreshAll(cfEnv));
          taskDescriptions.push('refreshProductAll()');
        } else {
          // On create / update: evict oldSlug if changed, refresh new slug & list
          if (oldSlug && oldSlug !== slug) {
            refreshTasks.push(ProductService.evictSlug(oldSlug, cfEnv));
            taskDescriptions.push(`evictOldProductSlug(${oldSlug})`);
          }
          if (slug) {
            refreshTasks.push(ProductService.refreshSlug(slug, cfEnv));
            taskDescriptions.push(`refreshProductSlug(${slug})`);
          }
          if (cardChanged || operation === 'create' || (oldSlug && oldSlug !== slug)) {
            refreshTasks.push(ProductService.refreshAll(cfEnv));
            taskDescriptions.push('refreshProductAll()');
          }
        }
        break;
      }

      case 'category': {
        collectedPaths.add('/');
        collectedPaths.add('/products');
        refreshTasks.push(ProductService.refreshAll(cfEnv));
        taskDescriptions.push('refreshProductCategories()');
        break;
      }

      case 'catalogSettings': {
        collectedPaths.add('/');
        collectedPaths.add('/products');
        refreshTasks.push(ProductService.getCatalogSettings(true, cfEnv));
        taskDescriptions.push('refreshCatalogSettings()');
        break;
      }

      case 'productStorySettings': {
        refreshTasks.push(ProductService.getProductStorySettings(true, cfEnv));
        taskDescriptions.push('refreshProductStorySettings()');
        const allProds = await ProductService.getAll(false, cfEnv).catch(() => []);
        for (const p of allProds) {
          if (p?.slug) collectedPaths.add(`/products/${p.slug}`);
        }
        break;
      }

      case 'page': {
        const cleanSlug = slug.replace(/^\//, '').replace(/\/$/, '') || 'home';
        const cleanOldSlug = oldSlug.replace(/^\//, '').replace(/\/$/, '') || '';

        if (cleanSlug === 'home' || cleanSlug === 'index') {
          collectedPaths.add('/');
        } else {
          collectedPaths.add(`/${cleanSlug}`);
        }

        if (cleanOldSlug && cleanOldSlug !== cleanSlug) {
          collectedPaths.add(cleanOldSlug === 'home' ? '/' : `/${cleanOldSlug}`);
        }

        if (isDelete) {
          // On page delete: evict from KV and refresh page slugs list
          refreshTasks.push(PageService.evictSlug(cleanSlug, cfEnv));
          taskDescriptions.push(`evictPageSlug(${cleanSlug})`);
        } else {
          if (cleanOldSlug && cleanOldSlug !== cleanSlug) {
            refreshTasks.push(PageService.evictSlug(cleanOldSlug, cfEnv));
            taskDescriptions.push(`evictOldPageSlug(${cleanOldSlug})`);
          }
          if (cleanSlug === 'home' || cleanSlug === 'index') {
            refreshTasks.push(PageService.getHomePage(true, cfEnv));
            taskDescriptions.push('refreshHomePage()');
          } else {
            refreshTasks.push(PageService.refreshSlug(cleanSlug, cfEnv));
            taskDescriptions.push(`refreshPageSlug(${cleanSlug})`);
          }
        }
        refreshTasks.push(PageService.refreshSlugs(cfEnv));
        taskDescriptions.push('refreshPageSlugs()');
        break;
      }

      case 'siteConfig':
      case 'header':
      case 'footer': {
        collectedPaths.add('/');
        collectedPaths.add('/products');
        collectedPaths.add('/about');
        collectedPaths.add('/private-label');
        collectedPaths.add('/contact');
        // Include all product detail pages and dynamic custom CMS pages
        const [allProds, allPageSlugs] = await Promise.all([
          ProductService.getAll(false, cfEnv).catch(() => []),
          PageService.getSlugs(cfEnv).catch(() => []),
        ]);
        for (const p of allProds) {
          if (p?.slug) collectedPaths.add(`/products/${p.slug}`);
        }
        for (const pgSlug of allPageSlugs) {
          const clean = String(pgSlug || '').replace(/^\/+/, '').replace(/\/+$/, '');
          if (clean && clean !== 'home' && clean !== 'index') {
            collectedPaths.add(`/${clean}`);
          }
        }
        refreshTasks.push(SiteConfigService.getConfig(true));
        taskDescriptions.push('refreshSiteConfig()');
        break;
      }

      case 'rfqSettings': {
        collectedPaths.add('/');
        collectedPaths.add('/products');
        refreshTasks.push(RfqSettingsService.getSettings(true));
        taskDescriptions.push('refreshRfqSettings()');
        break;
      }

      default: {
        // Unknown or custom docType: flush primary landing pages and refresh all
        collectedPaths.add('/');
        collectedPaths.add('/products');
        refreshTasks.push(
          ProductService.refreshAll(cfEnv),
          PageService.getHomePage(true, cfEnv)
        );
        taskDescriptions.push('refreshCoreLanding()');
        break;
      }
    }
  } else if (collectedPaths.size > 0) {
    // Targeted path-based revalidation (e.g. ?path=/about or ?path=/products/cashmere-crew)
    // Avoids firing all 6 Sanity queries unnecessarily
    const pathList = Array.from(collectedPaths);
    let refreshedAnyProduct = false;

    for (const p of pathList) {
      const clean = p.trim();
      if (clean.startsWith('/products/')) {
        const itemSlug = clean.replace('/products/', '').replace(/\/$/, '');
        if (itemSlug) {
          refreshTasks.push(ProductService.refreshSlug(itemSlug, cfEnv));
          taskDescriptions.push(`refreshProductSlug(${itemSlug})`);
          refreshedAnyProduct = true;
        }
      } else if (clean === '/products' || clean === '/products/') {
        refreshTasks.push(
          ProductService.refreshAll(cfEnv),
          ProductService.getCatalogSettings(true, cfEnv)
        );
        taskDescriptions.push('refreshProductsCatalog()');
      } else if (clean === '/' || clean === '') {
        refreshTasks.push(PageService.getHomePage(true, cfEnv));
        taskDescriptions.push('refreshHomePage()');
      } else {
        const pageSlug = clean.replace(/^\//, '').replace(/\/$/, '');
        if (pageSlug) {
          refreshTasks.push(PageService.refreshSlug(pageSlug, cfEnv));
          taskDescriptions.push(`refreshPageSlug(${pageSlug})`);
        }
      }
    }

    if (refreshedAnyProduct) {
      refreshTasks.push(ProductService.refreshAll(cfEnv));
      taskDescriptions.push('refreshProductAll()');
    }
  } else {
    // Zero target paths and no docType: Full manual cache flush requested
    collectedPaths.add('/');
    collectedPaths.add('/products');
    collectedPaths.add('/about');
    collectedPaths.add('/private-label');
    collectedPaths.add('/contact');

    const [allProds, allPageSlugs] = await Promise.all([
      ProductService.getAll(false, cfEnv).catch(() => []),
      PageService.getSlugs(cfEnv).catch(() => []),
    ]);
    for (const p of allProds) {
      if (p?.slug) collectedPaths.add(`/products/${p.slug}`);
    }
    for (const pgSlug of allPageSlugs) {
      const clean = String(pgSlug || '').replace(/^\/+/, '').replace(/\/+$/, '');
      if (clean && clean !== 'home' && clean !== 'index') {
        collectedPaths.add(`/${clean}`);
      }
    }

    refreshTasks.push(
      SiteConfigService.getConfig(true),
      RfqSettingsService.getSettings(true),
      ProductService.refreshAll(cfEnv),
      ProductService.getCatalogSettings(true, cfEnv),
      ProductService.getProductStorySettings(true, cfEnv),
      PageService.getHomePage(true, cfEnv),
      PageService.refreshSlugs(cfEnv)
    );
    taskDescriptions.push('refreshAllCoreServices()');
  }

  // Execute KV sync
  await Promise.allSettled(refreshTasks);

  // Bump route revisions & affected L1 scopes in KV so global edge PoPs invalidate only what changed
  const isGlobalLayout = docType === 'siteConfig' || docType === 'header' || docType === 'footer' || !docType;
  const affectedScopes: CacheLedgerScope[] =
    docType === 'siteConfig' || docType === 'header' || docType === 'footer' || docType === 'rfqSettings'
      ? ['config']
      : docType === 'product' || docType === 'category' || docType === 'catalogSettings' || docType === 'productStorySettings'
        ? ['products']
        : docType === 'page'
          ? ['pages']
          : ['config', 'products', 'pages'];
  await bumpRouteRevisions(collectedPaths, isGlobalLayout, cfEnv, affectedScopes).catch(() => { });

  // Execute Edge HTML Cache & Cloudflare CDN purge
  const purgeResult = await purgeEdgeHtmlCache({
    targetPaths: collectedPaths,
    origin,
    cfEnv,
    isDebug,
  });

  // Background Edge Warmup (Purge & Instant Re-warm via waitUntil / runInBackground)
  const warmedPaths = !isDelete
    ? prewarmEdgeRoutes({ targetPaths: collectedPaths, origin, cfEnv })
    : [];

  return {
    success: true,
    operation,
    docType,
    slug: slug || undefined,
    refreshedTasks: taskDescriptions,
    warmedPaths,
    ...purgeResult,
  };
}

/**
 * Recursively cleans a document before saving to Sanity.
 * Removes illegal properties (such as 'url') from Sanity reference objects.
 * In Sanity GROQ/mutations, a reference must strictly contain `_type: 'reference'`, `_ref`, and optionally `_weak` or `_key`.
 */
export function sanitizeSanityDocument<T = any>(val: T): T {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeSanityDocument(item)) as unknown as T;
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, any>;
    // Check if this object is a Sanity reference
    if (obj._type === 'reference' || (typeof obj._ref === 'string' && !obj._type)) {
      const cleanRef: Record<string, any> = {
        _type: 'reference',
        _ref: obj._ref,
      };
      if (obj._weak !== undefined) cleanRef._weak = Boolean(obj._weak);
      if (obj._key !== undefined) cleanRef._key = String(obj._key);
      return cleanRef as unknown as T;
    }

    const cleanObj: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      // Omit ephemeral preview helpers that should never be written to Sanity
      if (k === 'mainImageUrl' || k === 'galleryUrls') continue;
      cleanObj[k] = sanitizeSanityDocument(v);
    }
    return cleanObj as unknown as T;
  }
  return val;
}

