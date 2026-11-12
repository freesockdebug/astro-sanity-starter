// src/utils/adminWorkbench.ts
// Shared utilities, controllers, and helpers for Admin Workbench pages

import { toIsoUtcString } from './date';
import { clientCache } from './clientCache';

/**
 * Escapes HTML characters to prevent XSS in table & card rendering.
 */
export function escapeHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Unified Admin UTC Time Formatter.
 * Converts SQLite's unzoned "YYYY-MM-DD HH:MM:SS" or ISO strings to user's local time accurately.
 *
 * @param input Raw date string, timestamp, or Date object
 * @param mode 'short' -> 'MM-DD HH:mm:ss' (ideal for high-density tables)
 *             'full'  -> 'YYYY-MM-DD HH:mm:ss' (ideal for modals, tooltips, detail views)
 * @param fallback Fallback string when input is missing or empty (default: '—')
 */
export function formatAdminTime(
  input: any,
  mode: 'short' | 'full' = 'full',
  fallback: string = '—'
): string {
  if (!input) return fallback;
  const iso = toIsoUtcString(input);
  if (!iso) return fallback;

  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(input);

  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  const s = pad(d.getSeconds());

  if (mode === 'short') {
    return `${m}-${day} ${h}:${min}:${s}`;
  }
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

export interface PaginationConfig {
  containerId: string;
  summaryId: string;
  prevId: string;
  nextId: string;
  currentId: string;
  itemLabel?: string;
  onPageChange: (newPage: number) => void;
}

export interface PaginationController {
  getCurrentPage: () => number;
  setCurrentPage: (p: number) => void;
  render: (page: number, totalPages: number, total: number, limit: number) => void;
}

/**
 * Creates and binds a reactive pagination controller for workbench footers.
 */
export function createPaginationController(cfg: PaginationConfig): PaginationController {
  let currentPage = 1;
  let currentTotalPages = 1;

  const container = document.getElementById(cfg.containerId);
  const summary = document.getElementById(cfg.summaryId);
  const prevBtn = document.getElementById(cfg.prevId) as HTMLButtonElement | null;
  const nextBtn = document.getElementById(cfg.nextId) as HTMLButtonElement | null;
  const currentIndicator = document.getElementById(cfg.currentId);

  prevBtn?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      cfg.onPageChange(currentPage);
    }
  });

  nextBtn?.addEventListener('click', () => {
    if (currentPage < currentTotalPages) {
      currentPage++;
      cfg.onPageChange(currentPage);
    }
  });

  return {
    getCurrentPage: () => currentPage,
    setCurrentPage: (p: number) => {
      currentPage = p;
    },
    render: (page: number, totalPages: number, total: number, limit: number) => {
      currentPage = page;
      currentTotalPages = Math.max(1, totalPages);

      if (!container) return;

      container.classList.remove('hidden');

      const start = total === 0 ? 0 : (page - 1) * limit + 1;
      const end = Math.min(page * limit, total);
      const label = cfg.itemLabel ? ` ${cfg.itemLabel}` : '';

      if (summary) {
        summary.innerHTML = `Showing <strong class="text-[#1d1d1f]">${start}–${end}</strong> of <strong class="text-[#1d1d1f]">${total}</strong>${label}`;
      }

      if (prevBtn) {
        prevBtn.disabled = page <= 1;
        prevBtn.classList.toggle('opacity-50', page <= 1);
        prevBtn.classList.toggle('cursor-not-allowed', page <= 1);
      }

      if (nextBtn) {
        nextBtn.disabled = page >= currentTotalPages;
        nextBtn.classList.toggle('opacity-50', page >= currentTotalPages);
        nextBtn.classList.toggle('cursor-not-allowed', page >= currentTotalPages);
      }

      if (currentIndicator) {
        currentIndicator.textContent = `${page} / ${currentTotalPages}`;
      }
    },
  };
}

export interface WorkbenchFetcherConfig<T = any> {
  skeletonEl?: HTMLElement | null;
  contentEl?: HTMLElement | null;
  emptyEl?: HTMLElement | null;
  delayMs?: number;
  onData: (data: T, isFromCache: boolean) => void;
  onError?: (err: any) => void;
}

/**
 * Creates an anti-flicker request dispatcher with AbortController and SWR client caching.
 */
export function createWorkbenchFetcher<T = any>(cfg: WorkbenchFetcherConfig<T>) {
  let activeAbortController: AbortController | null = null;
  let skeletonTimer: any = null;
  const delayMs = cfg.delayMs ?? 80;

  async function execute(
    url: string,
    cacheKey: string,
    forceFresh: boolean = false
  ): Promise<void> {
    if (activeAbortController) {
      activeAbortController.abort();
    }
    activeAbortController = new AbortController();

    if (skeletonTimer) clearTimeout(skeletonTimer);
    skeletonTimer = setTimeout(() => {
      if (cfg.skeletonEl) cfg.skeletonEl.classList.remove('hidden');
    }, delayMs);

    try {
      if (forceFresh) {
        await clientCache.del(cacheKey);
      }

      await clientCache.fetchWithCache<T>(cacheKey, url, {
        mode: 'swr',
        init: { signal: activeAbortController.signal },
        onData: (data: T, isFromCache: boolean) => {
          if (skeletonTimer) clearTimeout(skeletonTimer);
          if (cfg.skeletonEl) cfg.skeletonEl.classList.add('hidden');
          cfg.onData(data, isFromCache);
        },
      });
    } catch (err: any) {
      if (skeletonTimer) clearTimeout(skeletonTimer);
      if (err?.name === 'AbortError') return;

      console.error('[WorkbenchFetcher] Request failed:', err);
      if (cfg.skeletonEl) cfg.skeletonEl.classList.add('hidden');

      if (cfg.onError) {
        cfg.onError(err);
      } else if (cfg.contentEl) {
        cfg.contentEl.innerHTML = `
          <div class="py-16 text-center text-xs text-rose-600 space-y-2">
            <p>Failed to load data (${escapeHtml(err.message || 'Unknown network error')}).</p>
            <button type="button" id="workbench-retry-btn" class="px-3 py-1.5 rounded-lg bg-black text-white text-xs font-semibold cursor-pointer hover:bg-black/80 transition-all">
              Retry
            </button>
          </div>
        `;
        cfg.contentEl.classList.remove('hidden');
        document.getElementById('workbench-retry-btn')?.addEventListener('click', () => {
          execute(url, cacheKey, true);
        });
      }
    }
  }

  return {
    fetch: execute,
    abort: () => {
      if (activeAbortController) activeAbortController.abort();
      if (skeletonTimer) clearTimeout(skeletonTimer);
    },
  };
}

export interface SearchRefreshBindingConfig {
  searchInputId: string;
  clearBtnId?: string;
  refreshBtnId?: string;
  formId?: string;
  debounceMs?: number;
  onSearch: (val: string) => void;
  onRefresh: () => void;
}

/**
 * Binds search input debouncing, clear button visibility, and keyboard shortcut 'R'.
 */
export function bindSearchAndRefresh(cfg: SearchRefreshBindingConfig) {
  const searchInput = document.getElementById(cfg.searchInputId) as HTMLInputElement | null;
  const clearBtn = cfg.clearBtnId ? document.getElementById(cfg.clearBtnId) : null;
  const refreshBtn = cfg.refreshBtnId ? document.getElementById(cfg.refreshBtnId) : null;
  const searchForm = cfg.formId ? document.getElementById(cfg.formId) : null;

  let searchTimer: any = null;
  const debounceMs = cfg.debounceMs ?? 250;

  searchInput?.addEventListener('input', () => {
    const val = searchInput.value.trim();
    if (clearBtn) {
      clearBtn.classList.toggle('hidden', !val);
    }
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      cfg.onSearch(val);
    }, debounceMs);
  });

  clearBtn?.addEventListener('click', () => {
    if (searchInput) {
      searchInput.value = '';
    }
    clearBtn.classList.add('hidden');
    cfg.onSearch('');
  });

  searchForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(searchTimer);
    const val = searchInput?.value.trim() || '';
    cfg.onSearch(val);
  });

  refreshBtn?.addEventListener('click', () => {
    cfg.onRefresh();
  });

  document.addEventListener('keydown', (e) => {
    if (
      (e.key === 'r' || e.key === 'R') &&
      !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)
    ) {
      e.preventDefault();
      cfg.onRefresh();
    }
  });
}

/**
 * Native, zero-dependency browser CSV export utility.
 */
export function exportToCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
): void {
  const escapeCell = (val: string | number | null | undefined) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvRows = [headers.map(escapeCell).join(',')];
  for (const row of rows) {
    csvRows.push(row.map(escapeCell).join(','));
  }

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// 1. Unified Multi-Language (localeString / localeText) Primitives
// ============================================================================
export function getLocaleVal(val: any, lang = 'en'): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  return val[lang] || '';
}

export function getFallbackEn(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  return val.en || (Object.values(val).find((v) => typeof v === 'string' && v !== 'localeString' && v !== 'localeText') as string) || '';
}

export function setLocaleVal(
  orig: any,
  text: string,
  lang = 'en',
  type: 'localeString' | 'localeText' = 'localeString'
): any {
  if (typeof orig === 'object' && orig !== null) {
    return { ...orig, _type: orig._type || type, [lang]: text };
  }
  return { _type: type, [lang]: text };
}

// ============================================================================
// 2. Saltline-Style Table-Driven Form Descriptor & Two-Way DOM Binder
// ============================================================================
export interface FieldSpec {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'checkbox' | 'select' | 'localeString' | 'localeText' | 'csv';
  col?: 1 | 2 | 3 | 4 | 6 | 12;
  rows?: number;
  bold?: boolean;
  mono?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

/**
 * Renders an array of declarative FieldSpecs into a 12-column responsive grid
 */
export function renderSchemaFields(fields: FieldSpec[], doc: Record<string, any>, lang = 'en'): string {
  const colClassMap: Record<number, string> = {
    12: 'sm:col-span-12',
    6: 'sm:col-span-6',
    4: 'sm:col-span-4',
    3: 'sm:col-span-3',
    2: 'sm:col-span-2',
    1: 'sm:col-span-1',
  };

  return `<div class="grid grid-cols-1 sm:grid-cols-12 gap-3">
    ${fields
      .map((f) => {
        const spanClass = colClassMap[f.col || 12] || 'sm:col-span-12';
        const isLocale = f.type === 'localeString' || f.type === 'localeText';
        const rawVal = doc?.[f.key];
        const strVal = isLocale
          ? getLocaleVal(rawVal, lang)
          : f.type === 'csv'
          ? Array.isArray(rawVal) ? rawVal.join(', ') : ''
          : String(rawVal ?? '');
        const ph = f.placeholder ?? (isLocale ? getFallbackEn(rawVal) : '');
        const langBadge = isLocale ? ` <span class="text-[10px] font-mono text-[#86868b]">(${lang.toUpperCase()})</span>` : '';
        const fontMod = `${f.bold ? 'font-bold ' : ''}${f.mono ? 'font-mono ' : ''}`;

        if (f.type === 'checkbox') {
          const checked = rawVal === true || (rawVal !== false && f.placeholder === 'defaultTrue');
          return `
            <div class="col-span-1 ${spanClass} flex items-center gap-2 pt-1">
              <input type="checkbox" data-bind="${escapeHtml(f.key)}" data-ftype="checkbox" class="rounded cursor-pointer" ${checked ? 'checked' : ''} />
              <label class="font-semibold text-xs text-[#1d1d1f] cursor-pointer">${escapeHtml(f.label)}</label>
            </div>`;
        }

        if (f.type === 'select') {
          return `
            <div class="col-span-1 ${spanClass}">
              <label class="adm-label">${escapeHtml(f.label)}</label>
              <select data-bind="${escapeHtml(f.key)}" data-ftype="select" class="adm-input">
                ${(f.options || [])
                  .map((o) => `<option value="${escapeHtml(o.value)}" ${strVal === o.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`)
                  .join('')}
              </select>
            </div>`;
        }

        if (f.type === 'textarea' || f.type === 'localeText') {
          return `
            <div class="col-span-1 ${spanClass}">
              <label class="adm-label">${escapeHtml(f.label)}${langBadge}</label>
              <textarea rows="${f.rows || 2}" data-bind="${escapeHtml(f.key)}" data-ftype="${f.type}" class="adm-input ${fontMod}" placeholder="${escapeHtml(ph)}">${escapeHtml(strVal)}</textarea>
            </div>`;
        }

        return `
          <div class="col-span-1 ${spanClass}">
            <label class="adm-label">${escapeHtml(f.label)}${langBadge}</label>
            <input type="${f.type === 'number' ? 'number' : 'text'}" data-bind="${escapeHtml(f.key)}" data-ftype="${f.type}" class="adm-input ${fontMod}" value="${escapeHtml(strVal)}" placeholder="${escapeHtml(ph)}" />
          </div>`;
      })
      .join('')}
  </div>`;
}

/**
 * Automatically reads all [data-bind] inputs inside rootEl and updates target doc in-place
 */
export function syncSchemaFieldsFromDom(rootEl: ParentNode, doc: Record<string, any>, lang = 'en'): void {
  rootEl.querySelectorAll('[data-bind]').forEach((node) => {
    const el = node as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const key = el.getAttribute('data-bind');
    const ftype = el.getAttribute('data-ftype') || 'text';
    if (!key) return;

    if (ftype === 'checkbox') {
      doc[key] = (el as HTMLInputElement).checked;
    } else if (ftype === 'number') {
      const n = Number(el.value);
      doc[key] = isNaN(n) ? 0 : n;
    } else if (ftype === 'csv') {
      doc[key] = el.value.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (ftype === 'localeString' || ftype === 'localeText') {
      doc[key] = setLocaleVal(doc[key], el.value.trim(), lang, ftype);
    } else {
      doc[key] = el.value.trim();
    }
  });
}

// ============================================================================
// 3. Saltline-Style Micro DOM, URL & Drawer Primitives
// ============================================================================
export const $id = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

export const $val = (id: string, v?: string | number | null): string => {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  if (v !== undefined && el) el.value = String(v ?? '');
  return el?.value?.trim() || '';
};

export const $chk = (id: string, v?: boolean): boolean => {
  const el = $id<HTMLInputElement>(id);
  if (v !== undefined && el) el.checked = Boolean(v);
  return Boolean(el?.checked);
};

export const $txt = (id: string, v?: string | number | null): void => {
  const el = $id(id);
  if (el && v !== undefined) el.textContent = String(v ?? '');
};

/**
 * Compact URL searchParams synchronizer: deletes keys matching default/empty values
 */
export function syncUrlParams(
  params: Record<string, string | number | undefined | null>,
  defaults: Record<string, string | number> = {},
  push = true
): void {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(params)) {
    const def = defaults[k] ?? 'ALL';
    if (v !== undefined && v !== null && v !== '' && v !== def) {
      url.searchParams.set(k, String(v));
    } else {
      url.searchParams.delete(k);
    }
  }
  if (url.toString() !== window.location.href) {
    window.history[push ? 'pushState' : 'replaceState']({}, '', url.toString());
  }
}

/**
 * Universal Slide-Over Drawer Controller (supports both translate-x-full & data-state="open")
 */
export function createSlideDrawer(cfg: {
  drawerId: string;
  backdropId: string;
  closeIds?: string[];
  useDataState?: boolean;
  lockBody?: boolean;
  onClose?: () => void;
}) {
  const open = () => {
    const drawer = $id(cfg.drawerId);
    const backdrop = $id(cfg.backdropId);
    if (cfg.useDataState) {
      if (drawer) drawer.dataset.state = 'open';
    } else {
      drawer?.classList.remove('translate-x-full');
    }
    backdrop?.classList.remove('hidden');
    setTimeout(() => backdrop?.classList.remove('opacity-0'), 10);
    if (cfg.lockBody !== false) document.body.classList.add('overflow-hidden');
  };

  const close = () => {
    const drawer = $id(cfg.drawerId);
    const backdrop = $id(cfg.backdropId);
    if (cfg.useDataState) {
      if (drawer) drawer.dataset.state = 'closed';
    } else {
      drawer?.classList.add('translate-x-full');
    }
    backdrop?.classList.add('opacity-0');
    setTimeout(() => {
      backdrop?.classList.add('hidden');
      if (cfg.lockBody !== false) document.body.classList.remove('overflow-hidden');
    }, 300);
    cfg.onClose?.();
  };

  $id(cfg.backdropId)?.addEventListener('click', close);
  (cfg.closeIds || []).forEach((id) => $id(id)?.addEventListener('click', close));

  return { open, close };
}

