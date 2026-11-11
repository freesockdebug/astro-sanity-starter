// src/utils/cmsSync.ts
// Unified CMS Cache Synchronization & Edge Purge Engine
import { NON_DEFAULT_LOCALES } from '@i18n';
import { ProductService } from '@data/products';
import { PageService } from '@data/page';
import { SiteConfigService } from '@data/siteConfig';
import { RfqSettingsService } from '@data/rfqSettings';
import { SecurityService } from '@utils/security';
import { getSystemSettings } from '@utils/db';
import { getRuntimeEnv } from '@utils/auth';
import { kvGet, kvPut } from '@utils/kv';
import { runInBackground } from '@utils/cache';

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

export const ROUTE_REVS_KV_KEY = 'cms:route_revs';
let localRouteRevs: Record<string, number> | null = null;
let localRouteRevsLoadedAt = 0;
const ROUTE_REVS_SYNC_INTERVAL_MS = 5_000;

export async function getRouteRevisions(cfEnv?: any, force = false): Promise<Record<string, number>> {
  const now = Date.now();
  if (!force && localRouteRevs && now - localRouteRevsLoadedAt < ROUTE_REVS_SYNC_INTERVAL_MS) {
    return localRouteRevs;
  }
  const kvRevs = await kvGet<Record<string, number>>(ROUTE_REVS_KV_KEY, cfEnv).catch(() => null);
  localRouteRevs = kvRevs && typeof kvRevs === 'object' ? kvRevs : {};
  localRouteRevsLoadedAt = now;
  return localRouteRevs;
}

/**
 * Increment revision timestamps for specific base paths (e.g. ['/products/cashmere', '/products'])
 */
export async function bumpRouteRevisions(basePaths: Iterable<string>, bumpGlobalLayout = false, cfEnv?: any): Promise<Record<string, number>> {
  const current = await getRouteRevisions(cfEnv, true);
  const now = Date.now();
  const updated = { ...current };

  if (bumpGlobalLayout) {
    updated['__layout'] = now;
  }
  for (const rawPath of basePaths) {
    if (!rawPath) continue;
    const clean = rawPath === '/' ? '/' : `/${rawPath.replace(/^\/+|\/+$/g, '')}`;
    updated[clean] = now;
  }

  localRouteRevs = updated;
  localRouteRevsLoadedAt = now;
  await kvPut(ROUTE_REVS_KV_KEY, updated, undefined, cfEnv).catch(() => {});
  return updated;
}

/**
 * Resolves the effective route revision timestamp for a given pathname
 */
export function resolvePathRevision(pathname: string, revs: Record<string, number>, supportedLocales: readonly string[]): number {
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
  const routeRev = revs[basePath] || 0;
  const layoutRev = revs['__layout'] || 0;
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
}): Promise<CmsPurgeResult> {
  const { targetPaths, origin, cfEnv, isDebug } = params;

  // 1. Expand paths across locales and trailing slashes
  const localizedPaths = expandLocalizedPaths(targetPaths);
  const targetOrigins = new Set<string>([origin]);
  const urlsToPurge: string[] = [];
  const urlSet = new Set<string>();

  for (const p of localizedPaths) {
    for (const org of targetOrigins) {
      const expanded = expandCanonicalUrls(org, p);
      for (const u of expanded) {
        if (!urlSet.has(u)) {
          urlSet.add(u);
          urlsToPurge.push(u);
        }
      }
    }
  }

  // 2. Layer 1: Worker Edge HTML Cache (caches.default in middleware.ts)
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

  if (cfApiToken && urlsToPurge.length > 0) {
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
              await kvPut(zoneKey, cfZoneId, { expirationTtl: 604800 }, cfEnv).catch(() => {});
            }
          }
        }
      }

      if (cfZoneId) {
        // Cloudflare purge_cache supports up to 30 files per request
        const chunks: string[][] = [];
        for (let i = 0; i < urlsToPurge.length; i += 30) {
          chunks.push(urlsToPurge.slice(i, i + 30));
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
          cfMessage = `Successfully purged ${urlsToPurge.length} URLs from Cloudflare Global CDN`;
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
          // On page delete: evict from KV, do NOT query Sanity!
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
        // Include all product detail pages dynamically so global header/footer updates never leave them stale
        const allProds = await ProductService.getAll(false, cfEnv).catch(() => []);
        for (const p of allProds) {
          if (p?.slug) collectedPaths.add(`/products/${p.slug}`);
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

    refreshTasks.push(
      SiteConfigService.getConfig(true),
      RfqSettingsService.getSettings(true),
      ProductService.refreshAll(cfEnv),
      ProductService.getCatalogSettings(true, cfEnv),
      ProductService.getProductStorySettings(true, cfEnv),
      PageService.getHomePage(true, cfEnv)
    );
    taskDescriptions.push('refreshAllCoreServices()');
  }

  // Execute KV sync
  await Promise.allSettled(refreshTasks);

  // Bump route revisions for all affected paths in KV so global edge PoPs transition to the new cacheKey version instantly
  const isGlobalLayout = docType === 'siteConfig' || docType === 'header' || docType === 'footer' || !docType;
  await bumpRouteRevisions(collectedPaths, isGlobalLayout, cfEnv).catch(() => {});

  // Execute Edge HTML Cache & Cloudflare CDN purge
  const purgeResult = await purgeEdgeHtmlCache({
    targetPaths: collectedPaths,
    origin,
    cfEnv,
    isDebug,
  });

  // Background Edge Warmup (Purge & Warm via waitUntil / runInBackground)
  if (!isDelete && collectedPaths.size > 0) {
    const warmPaths = Array.from(collectedPaths).slice(0, 5);
    runInBackground(
      Promise.allSettled(
        warmPaths.map((p) =>
          fetch(`${origin}${p.startsWith('/') ? p : `/${p}`}`, {
            method: 'GET',
            headers: { 'User-Agent': 'Cloudflare-Edge-Warmup/1.0' },
          })
        )
      )
    );
  }

  return {
    success: true,
    operation,
    docType,
    slug: slug || undefined,
    refreshedTasks: taskDescriptions,
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

