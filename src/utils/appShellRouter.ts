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

async function reactivateScripts(targetDoc: Document): Promise<void> {
  // Clean up dynamic scripts injected from prior navigations
  document.querySelectorAll('script[data-shell-dynamic]').forEach((s) => s.remove());
  document.querySelectorAll('script[data-shell-inline-dynamic]').forEach((s) => s.remove());

  // 1. Dual-Track Track A: Vite Module scripts (Astro hoisted entry points)
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
    const newScript = document.createElement('script');
    newScript.type = 'module';
    newScript.dataset.shellDynamic = 'true';
    const srcUrl = new URL(modScript.src, window.location.origin);
    srcUrl.searchParams.set('t', String(Date.now()));
    newScript.src = srcUrl.pathname + srcUrl.search;
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

  // Intercept write-mutations to clear prefetch cache
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
    }
    return origFetch.apply(this, args);
  };

  // 65ms Hover Prefetch
  let hoverTimer: any = null;
  document.addEventListener('mouseover', (e) => {
    const target = (e.target as HTMLElement)?.closest?.('a') as HTMLAnchorElement | null;
    if (!target || !isNavigableLink(target, options.scope)) {
      clearTimeout(hoverTimer);
      return;
    }
    const href = target.href;
    if (getCachedHtml(href)) return;

    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(async () => {
      try {
        const res = await origFetch(href, { headers: { 'X-Shell-Prefetch': '1' } });
        if (res.ok) {
          const text = await res.text();
          setCachedHtml(href, text);
        }
      } catch {}
    }, 65);
  });

  document.addEventListener('mouseout', (e) => {
    const from = e.target as HTMLElement;
    const to = e.relatedTarget as HTMLElement;
    if (from?.closest('a') && !to?.closest('a')) {
      clearTimeout(hoverTimer);
    }
  });

  // Core navigation function
  async function navigateTo(
    targetUrlStr: string,
    isPopState = false,
    targetTabKey?: string,
    targetTabTitle?: string
  ): Promise<void> {
    const targetUrl = new URL(targetUrlStr, window.location.origin);
    updateActiveNavUI(targetUrl, options.scope, targetTabKey, targetTabTitle);
    startProgressBar();
    cleanupCurrentPageOverlays();

    let html = getCachedHtml(targetUrl.href);
    if (!html) {
      try {
        const res = await origFetch(targetUrl.href);
        if (!res.ok || res.redirected) {
          window.location.href = res.url || targetUrl.href;
          return;
        }
        html = await res.text();
      } catch {
        window.location.href = targetUrl.href;
        return;
      }
    }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const newCanvas = doc.getElementById('shell-main-canvas');
    if (!newCanvas) {
      window.location.href = targetUrl.href;
      return;
    }

    syncShellClasses(doc);

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

    const curRoot = document.getElementById('shell-root');
    if (!curRoot?.classList.contains('overflow-hidden')) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }

    await reactivateScripts(doc);
    finishProgressBar();
    window.dispatchEvent(new CustomEvent('app-shell:navigated', { detail: { url: targetUrl.href } }));
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
