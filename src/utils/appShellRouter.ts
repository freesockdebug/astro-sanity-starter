/**
 * src/utils/appShellRouter.ts
 *
 * Lightweight, zero-dependency App Shell SPA Router for Admin Console & Buyer Portal.
 * Enables instant desktop-class tab switching without full-page reloads while preserving:
 * - Persistent App Shell layout (sidebar, mobile bottom bar, breadcrumb header, command palette)
 * - Sidebar scroll position
 * - 0ms optimistic UI highlight
 * - 65ms hover prefetching with automatic write-mutation cache invalidation
 * - Smooth 2px progress bar
 * - Dynamic class morphing between fullscreen workbench & stream layouts
 * - Dual-track script reactivation (Vite ES modules + inline scripts)
 */

export interface AppShellOptions {
  scope: 'admin' | 'buyer';
}

declare global {
  interface Window {
    __appShellInitialized?: boolean;
    __shellNavigate?: (url: string) => Promise<void>;
  }
}

const PREFETCH_TTL_MS = 15_000;
const PREFETCH_MAX_ENTRIES = 6;
const prefetchCache = new Map<string, { html: string; timestamp: number }>();

export interface ShellFetchResult {
  html: string | null;
  redirectUrl?: string;
}

const inFlightHtml = new Map<string, Promise<ShellFetchResult>>();

interface DomSnapshot {
  canvasHtml: string;
  overlaysHtml: string;
  title: string;
  scrollY: number;
  canvasScrollTop: number;
  timestamp: number;
}

const SNAPSHOT_TTL_MS = 300_000; // 5 min
const SNAPSHOT_MAX_ENTRIES = 10;
const snapshotCache = new Map<string, DomSnapshot>();

function getDomSnapshot(url: string): DomSnapshot | null {
  const entry = snapshotCache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > SNAPSHOT_TTL_MS) {
    snapshotCache.delete(url);
    return null;
  }
  return entry;
}

let currentRenderedUrl = typeof window !== 'undefined' ? window.location.href : '';

function saveCurrentSnapshot(url?: string): void {
  try {
    const curCanvas = document.getElementById('shell-main-canvas');
    if (!curCanvas) return;
    const curOverlays = document.getElementById('shell-overlays');
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const canvasScrollTop = curCanvas.scrollTop || 0;
    const keyUrl = url || currentRenderedUrl || (typeof window !== 'undefined' ? window.location.href : '');
    if (!keyUrl) return;

    if (snapshotCache.size >= SNAPSHOT_MAX_ENTRIES) {
      const oldestKey = snapshotCache.keys().next().value;
      if (oldestKey) snapshotCache.delete(oldestKey);
    }

    snapshotCache.set(keyUrl, {
      canvasHtml: curCanvas.innerHTML,
      overlaysHtml: curOverlays ? curOverlays.innerHTML : '',
      title: document.title,
      scrollY,
      canvasScrollTop,
      timestamp: Date.now(),
    });
  } catch {}
}

function shouldPrefetch(): boolean {
  if (typeof navigator === 'undefined') return true;
  const conn = (navigator as any).connection;
  if (conn) {
    if (conn.saveData) return false;
    if (conn.effectiveType && conn.effectiveType.includes('2g')) return false;
  }
  return true;
}

function fetchShellHtml(url: string, isPrefetch = false, origFetchFn = window.fetch): Promise<ShellFetchResult> {
  const cached = getCachedHtml(url);
  if (cached) return Promise.resolve({ html: cached });

  const existing = inFlightHtml.get(url);
  if (existing) return existing;

  const headers: Record<string, string> = { 'X-Shell-Request': '1' };
  if (isPrefetch) headers['X-Shell-Prefetch'] = '1';

  const promise = origFetchFn(url, { headers })
    .then(async (res) => {
      if (res.redirected) {
        return { html: null, redirectUrl: res.url };
      }
      if (!res.ok) {
        return { html: null };
      }
      const text = await res.text();
      setCachedHtml(url, text);
      return { html: text };
    })
    .catch(() => ({ html: null }))
    .finally(() => {
      inFlightHtml.delete(url);
    });

  inFlightHtml.set(url, promise);
  return promise;
}

function ensureProgressBar(): HTMLElement {
  let bar = document.getElementById('shell-progress-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'shell-progress-bar';
    bar.style.cssText =
      'position:fixed;top:0;left:0;height:2px;width:0%;z-index:99999;pointer-events:none;background:linear-gradient(90deg,#0071e3,#60a5fa,#38bdf8);transition:width 0.25s ease, opacity 0.2s ease;opacity:0;';
    document.body.appendChild(bar);
  }
  return bar;
}

let progressTimer: any = null;

function startProgressBar(): void {
  const bar = ensureProgressBar();
  clearTimeout(progressTimer);
  bar.style.transition = 'none';
  bar.style.width = '0%';
  bar.style.opacity = '1';
  requestAnimationFrame(() => {
    bar.style.transition = 'width 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
    bar.style.width = '70%';
  });
}

function finishProgressBar(): void {
  const bar = ensureProgressBar();
  bar.style.transition = 'width 0.15s ease-out, opacity 0.2s ease';
  bar.style.width = '100%';
  progressTimer = setTimeout(() => {
    bar.style.opacity = '0';
    setTimeout(() => {
      bar.style.width = '0%';
    }, 200);
  }, 150);
}

function getCachedHtml(url: string): string | null {
  const entry = prefetchCache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > PREFETCH_TTL_MS) {
    prefetchCache.delete(url);
    return null;
  }
  return entry.html;
}

function setCachedHtml(url: string, html: string): void {
  if (prefetchCache.size >= PREFETCH_MAX_ENTRIES) {
    const oldestKey = prefetchCache.keys().next().value;
    if (oldestKey) prefetchCache.delete(oldestKey);
  }
  prefetchCache.set(url, { html, timestamp: Date.now() });
}

export function isScopeMatch(url: URL, scope: 'admin' | 'buyer', baseOrigin?: string): boolean {
  if (baseOrigin && url.origin !== baseOrigin) return false;
  if (typeof window !== 'undefined' && url.origin !== window.location.origin) return false;
  if (scope === 'admin') {
    return url.pathname.startsWith('/admin');
  } else if (scope === 'buyer') {
    return /^\/([a-z]{2}\/)?(orders|account)(\/|$)/.test(url.pathname);
  }
  return false;
}

export function isNavigableLink(a: HTMLAnchorElement, scope: 'admin' | 'buyer', baseOrigin?: string): boolean {
  if (!a || !a.href) return false;
  if (a.target === '_blank' || a.hasAttribute('download') || a.hasAttribute('data-no-pjax')) return false;
  const hrefAttr = a.getAttribute('href') || '';
  if (hrefAttr.startsWith('#') || hrefAttr.startsWith('javascript:')) return false;
  try {
    const origin = baseOrigin || (typeof window !== 'undefined' ? window.location.origin : 'https://gwenvenni.com');
    const url = new URL(a.href, origin);
    if (url.pathname.startsWith('/api/')) return false;
    return isScopeMatch(url, scope, origin);
  } catch {
    return false;
  }
}

function updateActiveNavUI(targetUrl: URL, scope: 'admin' | 'buyer', targetTabKey?: string, targetTabTitle?: string): void {
  let key = targetTabKey;
  if (!key) {
    if (scope === 'admin') {
      const p = targetUrl.pathname.replace(/^\/admin\/?/, '').split('/')[0];
      key = p || 'dashboard';
      if (key === 'cms-config') key = 'cms_config';
    } else {
      key = targetUrl.pathname.includes('/account') ? 'account' : 'orders';
    }
  }

  const allLinks = document.querySelectorAll(`a[data-shell-nav="${scope}"]`);
  allLinks.forEach((linkEl) => {
    const link = linkEl as HTMLAnchorElement;
    const itemKey = link.getAttribute('data-tab-key');
    const isMatch = itemKey === key;

    const isBottomBar = link.closest('nav[aria-label="Mobile Quick Bottom Navigation"]');
    if (isBottomBar) {
      if (isMatch) {
        link.classList.remove('text-[#86868b]');
        link.classList.add('text-[#1d1d1f]', 'font-bold');
      } else {
        link.classList.remove('text-[#1d1d1f]', 'font-bold');
        link.classList.add('text-[#86868b]');
      }
    } else {
      if (isMatch) {
        link.classList.remove('text-[#52525b]', 'hover:text-black', 'hover:bg-black/5', 'hover:bg-[#f5f5f7]');
        link.classList.add('bg-[#1d1d1f]', 'text-white', 'shadow-xs', 'font-semibold');
      } else {
        link.classList.remove('bg-[#1d1d1f]', 'text-white', 'shadow-xs', 'font-semibold');
        link.classList.add('text-[#52525b]', 'hover:text-black', 'hover:bg-black/5');
      }
    }
  });

  const breadcrumb = document.getElementById('shell-breadcrumb-title');
  if (breadcrumb) {
    if (targetTabTitle) {
      breadcrumb.textContent = targetTabTitle;
    } else {
      const matched = document.querySelector(`a[data-shell-nav="${scope}"][data-tab-key="${key}"]`);
      const title = matched?.getAttribute('data-tab-title');
      if (title) breadcrumb.textContent = title;
    }
  }

  if (scope === 'admin') {
    document.getElementById('admin-close-sidebar-btn')?.click();
  } else {
    document.getElementById('buyer-close-sidebar-btn')?.click();
  }
}

function cleanupCurrentPageOverlays(): void {
  document.querySelectorAll('dialog[open]').forEach((d) => {
    if (d.id !== 'cmd-palette-dialog') {
      try {
        (d as HTMLDialogElement).close();
      } catch {}
    }
  });
  document.body.style.overflow = '';
  document.body.classList.remove('overflow-hidden');
}

interface ApiCacheEntry {
  body: string;
  status: number;
  statusText: string;
  headers: [string, string][];
  ts: number;
}

const apiResponseCache = new Map<string, ApiCacheEntry>();
const API_CACHE_TTL_MS = 25_000;
const loadedModuleSrcs = new Set<string>();

function syncShellClasses(targetDoc: Document): void {
  const containers = ['shell-root', 'shell-right-col', 'shell-main-canvas'];
  containers.forEach((id) => {
    const cur = document.getElementById(id);
    const target = targetDoc.getElementById(id);
    if (cur && target) {
      cur.className = target.className;
    }
  });
}

async function syncHeadStyles(targetDoc: Document): Promise<void> {
  const pendingLinks: Promise<void>[] = [];

  targetDoc.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((link) => {
    const href = link.getAttribute('href');
    if (href && !document.head.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
      const newLink = link.cloneNode(true) as HTMLLinkElement;
      const loadPromise = new Promise<void>((resolve) => {
        newLink.onload = () => resolve();
        newLink.onerror = () => resolve();
      });
      pendingLinks.push(loadPromise);
      document.head.appendChild(newLink);
    }
  });

  targetDoc.head.querySelectorAll<HTMLStyleElement>('style').forEach((style) => {
    const devId = style.getAttribute('data-vite-dev-id');
    if (devId && document.head.querySelector(`style[data-vite-dev-id="${devId}"]`)) return;
    const content = style.textContent || '';
    const exists = Array.from(document.head.querySelectorAll('style')).some((s) => s.textContent === content);
    if (!exists) {
      document.head.appendChild(style.cloneNode(true));
    }
  });

  if (pendingLinks.length > 0) {
    await Promise.race([
      Promise.all(pendingLinks),
      new Promise<void>((resolve) => setTimeout(resolve, 500)),
    ]);
  }
}

async function reactivateScripts(targetDoc: Document): Promise<void> {
  // Clean up dynamic inline scripts from prior navigations
  document.querySelectorAll('script[data-shell-inline-dynamic]').forEach((s) => s.remove());

  // 1. Dual-Track Track A: Vite Module scripts (Loaded once, natural browser HTTP caching)
  const layoutExcludes = [
    'Layout.',
    'AdminLayout.',
    'BuyerLayout.',
    'BuyerSidebar.',
    'AdminSidebar.',
    'AppleNav.',
    'AppleFooter.',
    'QuoteDrawer.',
    'appShellRouter.',
  ];
  const allModuleScripts = Array.from(targetDoc.querySelectorAll('script[type="module"][src]')) as HTMLScriptElement[];
  const pageModuleScripts = allModuleScripts.filter((s) => {
    const src = s.getAttribute('src') || '';
    return !layoutExcludes.some((ex) => src.includes(ex));
  });

  for (const modScript of pageModuleScripts) {
    const rawSrc = modScript.getAttribute('src') || '';
    if (!rawSrc || loadedModuleSrcs.has(rawSrc)) continue;
    loadedModuleSrcs.add(rawSrc);

    const newScript = document.createElement('script');
    newScript.type = 'module';
    newScript.src = rawSrc;
    document.body.appendChild(newScript);
  }

  // 2. Dual-Track Track B: Inline scripts anywhere in targetDoc (including define:vars placed outside layout)
  // First strip inert non-module scripts from newly swapped containers to avoid dead script clutter
  const containers = [
    document.getElementById('shell-main-canvas'),
    document.getElementById('shell-overlays'),
  ].filter(Boolean) as HTMLElement[];
  containers.forEach((container) => {
    container.querySelectorAll('script:not([type="module"])').forEach((s) => s.remove());
  });

  // Query all non-module inline scripts that are not persistent layout scripts or JSON-LD
  const inlineScripts = Array.from(
    targetDoc.querySelectorAll<HTMLScriptElement>(
      'script:not([type="module"]):not([src]):not([data-shell-persist]):not([type="application/ld+json"])'
    )
  );

  for (const oldScript of inlineScripts) {
    const newScript = document.createElement('script');
    Array.from(oldScript.attributes).forEach((attr) => {
      newScript.setAttribute(attr.name, attr.value);
    });
    newScript.textContent = oldScript.textContent;
    newScript.dataset.shellInlineDynamic = 'true';
    document.body.appendChild(newScript);
  }
}

export function initAppShellRouter(options: AppShellOptions): void {
  if (typeof window === 'undefined') return;
  if (window.__appShellInitialized) return;
  window.__appShellInitialized = true;

  // Register initially rendered module scripts so they are not re-inserted on SPA switch
  document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]').forEach((s) => {
    const src = s.getAttribute('src');
    if (src) loadedModuleSrcs.add(src);
  });

  // Intercept write-mutations and provide client-side GET API caching
  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const req = args[0];
    const init = args[1];
    let method = 'GET';
    if (init?.method) {
      method = init.method.toUpperCase();
    } else if (typeof req === 'object' && req && 'method' in req && typeof req.method === 'string') {
      method = req.method.toUpperCase();
    }

    if (method !== 'GET' && method !== 'HEAD') {
      prefetchCache.clear();
      apiResponseCache.clear();
      inFlightHtml.clear();
      snapshotCache.clear();
      return origFetch.apply(this, args);
    }

    let urlStr = '';
    if (typeof req === 'string') {
      urlStr = req;
    } else if (req instanceof URL) {
      urlStr = req.href;
    } else if (req && 'url' in req && typeof req.url === 'string') {
      urlStr = req.url;
    }

    const isCacheableApi =
      urlStr &&
      (urlStr.startsWith('/api/admin/') ||
        urlStr.includes('/api/admin/') ||
        urlStr.startsWith('/api/orders') ||
        urlStr.includes('/api/orders')) &&
      init?.cache !== 'no-store' &&
      init?.cache !== 'reload';

    if (isCacheableApi) {
      const now = Date.now();
      const cached = apiResponseCache.get(urlStr);
      if (cached && now - cached.ts < API_CACHE_TTL_MS) {
        return Promise.resolve(
          new Response(cached.body, {
            status: cached.status,
            statusText: cached.statusText,
            headers: new Headers(cached.headers),
          })
        );
      }

      return origFetch.apply(this, args).then(async (res) => {
        if (res.ok) {
          try {
            const clone = res.clone();
            const body = await clone.text();
            const headers: [string, string][] = [];
            clone.headers.forEach((v, k) => headers.push([k, v]));
            apiResponseCache.set(urlStr, {
              body,
              status: clone.status,
              statusText: clone.statusText,
              headers,
              ts: Date.now(),
            });
          } catch {}
        }
        return res;
      });
    }

    return origFetch.apply(this, args);
  };

  // Instant.page: pointerdown / touchstart instant prefetch with Save-Data & 2G guard
  const instantPrefetch = (e: Event) => {
    if (!shouldPrefetch()) return;
    const target = (e.target as HTMLElement)?.closest?.('a') as HTMLAnchorElement | null;
    if (!target || !isNavigableLink(target, options.scope)) return;
    const href = target.href;
    if (href === window.location.href || getCachedHtml(href) || inFlightHtml.has(href)) return;
    fetchShellHtml(href, true, origFetch);
  };

  document.addEventListener('touchstart', instantPrefetch, { passive: true });
  document.addEventListener('mousedown', instantPrefetch, { passive: true });

  // 65ms Hover Prefetch
  let hoverTimer: any = null;
  let lastHoveredHref = '';
  document.addEventListener('mouseover', (e) => {
    if (!shouldPrefetch()) return;
    const target = (e.target as HTMLElement)?.closest?.('a') as HTMLAnchorElement | null;
    if (!target || !isNavigableLink(target, options.scope)) {
      clearTimeout(hoverTimer);
      lastHoveredHref = '';
      return;
    }
    const href = target.href;
    if (href === window.location.href || getCachedHtml(href) || inFlightHtml.has(href)) return;
    if (href === lastHoveredHref) return;
    lastHoveredHref = href;

    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      fetchShellHtml(href, true, origFetch);
    }, 65);
  });

  document.addEventListener('mouseout', (e) => {
    const from = e.target as HTMLElement;
    const to = e.relatedTarget as HTMLElement;
    if (from?.closest('a') && !to?.closest('a')) {
      clearTimeout(hoverTimer);
      lastHoveredHref = '';
    }
  });

  // Concurrency navigation sequence counter
  let navSeq = 0;

  // Core navigation function
  async function navigateTo(
    targetUrlStr: string,
    isPopState = false,
    targetTabKey?: string,
    targetTabTitle?: string
  ): Promise<void> {
    const currentSeq = ++navSeq;
    const targetUrl = new URL(targetUrlStr, window.location.origin);

    // 1. Hot DOM Snapshot: save current view state using currentRenderedUrl before departing
    saveCurrentSnapshot(currentRenderedUrl);

    // 2. Check if target URL has warm DOM snapshot
    const snapshot = getDomSnapshot(targetUrl.href);

    updateActiveNavUI(targetUrl, options.scope, targetTabKey, targetTabTitle);
    startProgressBar();
    cleanupCurrentPageOverlays();

    // 3. Turbo 8 Slow Network Dimming (>120ms feedback to prevent rage-clicks)
    const slowDimTimer = setTimeout(() => {
      if (currentSeq !== navSeq) return;
      const canvas = document.getElementById('shell-main-canvas');
      if (canvas) {
        canvas.classList.add('opacity-60', 'pointer-events-none', 'transition-opacity', 'duration-150');
      }
    }, 120);

    const clearDimming = () => {
      clearTimeout(slowDimTimer);
      const canvas = document.getElementById('shell-main-canvas');
      if (canvas) {
        canvas.classList.remove('opacity-60', 'pointer-events-none');
      }
    };

    // 4. Hot Snapshot instant preview (0ms visual restore while network in-flight)
    if (snapshot) {
      const curCanvas = document.getElementById('shell-main-canvas');
      if (curCanvas) {
        curCanvas.innerHTML = snapshot.canvasHtml;
        if (snapshot.canvasScrollTop) curCanvas.scrollTop = snapshot.canvasScrollTop;
      }
      const curOverlays = document.getElementById('shell-overlays');
      if (curOverlays && snapshot.overlaysHtml) {
        curOverlays.innerHTML = snapshot.overlaysHtml;
      }
      document.title = snapshot.title;
      if (snapshot.scrollY) {
        window.scrollTo({ top: snapshot.scrollY, behavior: 'instant' });
      }
    }

    try {
      const result = await fetchShellHtml(targetUrl.href, false, origFetch);

      // 5. Concurrency Race Condition Lock (Latest-Click-Wins)
      if (currentSeq !== navSeq) {
        clearDimming();
        return;
      }

      if (result.redirectUrl) {
        clearDimming();
        window.location.href = result.redirectUrl;
        return;
      }

      if (!result.html) {
        clearDimming();
        window.location.href = targetUrl.href;
        return;
      }

      const doc = new DOMParser().parseFromString(result.html, 'text/html');
      const newCanvas = doc.getElementById('shell-main-canvas');
      if (!newCanvas) {
        clearDimming();
        window.location.href = targetUrl.href;
        return;
      }

      // 6. Zero FOUC: await new stylesheet loads
      await syncHeadStyles(doc);
      if (currentSeq !== navSeq) {
        clearDimming();
        return;
      }

      syncShellClasses(doc);

      // Standard Turbo Preview Pattern: Fresh DOM nodes ensure clean event listeners & state
      const curCanvas = document.getElementById('shell-main-canvas');
      if (curCanvas) curCanvas.innerHTML = newCanvas.innerHTML;
      const curOverlays = document.getElementById('shell-overlays');
      const newOverlays = doc.getElementById('shell-overlays');
      if (curOverlays && newOverlays) {
        curOverlays.innerHTML = newOverlays.innerHTML;
      }

      document.title = doc.title;
      if (!isPopState) {
        window.history.pushState({ shell: true, url: targetUrl.href }, doc.title, targetUrl.href);
      }
      currentRenderedUrl = targetUrl.href;

      clearDimming();
      await reactivateScripts(doc);
      finishProgressBar();
      document.dispatchEvent(new CustomEvent('shell:page-load', { detail: { url: targetUrl.href } }));
      window.dispatchEvent(new CustomEvent('app-shell:navigated', { detail: { url: targetUrl.href } }));

      // Restore scroll position after microtask queue (e.g. instant cache-hydrated tables)
      if (snapshot && isPopState) {
        Promise.resolve().then(() => {
          if (curCanvas && snapshot.canvasScrollTop) curCanvas.scrollTop = snapshot.canvasScrollTop;
          if (snapshot.scrollY) window.scrollTo({ top: snapshot.scrollY, behavior: 'instant' });
        });
      } else {
        const curRoot = document.getElementById('shell-root');
        if (!curRoot?.classList.contains('overflow-hidden')) {
          window.scrollTo({ top: 0, behavior: 'instant' });
        }
      }
    } catch {
      clearDimming();
      window.location.href = targetUrl.href;
    }
  }

  // Intercept in-scope link clicks
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const target = (e.target as HTMLElement)?.closest?.('a') as HTMLAnchorElement | null;
    if (!target || !isNavigableLink(target, options.scope)) return;

    e.preventDefault();
    const tabKey = target.getAttribute('data-tab-key') || undefined;
    const tabTitle = target.getAttribute('data-tab-title') || undefined;
    navigateTo(target.href, false, tabKey, tabTitle);
  });

  // Handle browser Back / Forward history
  window.addEventListener('popstate', () => {
    navigateTo(window.location.href, true);
  });

  // Expose global navigator for ⌘K or programmatic transitions
  window.__shellNavigate = (url: string) => navigateTo(url);
}
