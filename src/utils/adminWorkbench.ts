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

export interface ColumnDefinition {
  id: string;
  label: string;
  minWidth: number;
  defaultWidth: number;
  visible: boolean;
  canHide: boolean;
}

export interface ColumnManagerConfig {
  storageKey: string;
  defaultColumns: ColumnDefinition[];
  tableEl?: HTMLElement | null;
  headerRowEl?: HTMLElement | null;
  menuPanelEl?: HTMLElement | null;
  checkboxListEl?: HTMLElement | null;
  countLabelEl?: HTMLElement | null;
  densityLabelEl?: HTMLElement | null;
  onColumnsChange?: () => void;
  onDensityChange?: (density: 'compact' | 'cozy') => void;
}

/**
 * Manages table columns resizing, visibility toggles, localStorage sync, and density mode.
 */
export function createColumnManager(cfg: ColumnManagerConfig) {
  // Defensive clone to prevent mutating DEFAULT_COLUMNS
  let columnsState: ColumnDefinition[] = cfg.defaultColumns.map((col) => ({ ...col }));
  let densityState: 'compact' | 'cozy' = 'compact';

  // Load persisted columns
  try {
    const raw = localStorage.getItem(cfg.storageKey);
    if (raw) {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved)) {
        columnsState = columnsState.map((col) => {
          const match = saved.find((s: any) => s.id === col.id);
          if (match) {
            return {
              ...col,
              visible: col.canHide ? Boolean(match.visible) : true,
              defaultWidth: typeof match.width === 'number' ? match.width : col.defaultWidth,
            };
          }
          return { ...col };
        });
      }
    }
  } catch {}

  function saveColumnsState() {
    try {
      const payload = columnsState.map((c) => ({
        id: c.id,
        visible: c.visible,
        width: c.defaultWidth,
      }));
      localStorage.setItem(cfg.storageKey, JSON.stringify(payload));
    } catch {}
  }

  function syncTableMinWidth() {
    if (!cfg.tableEl) return;
    const totalW = columnsState
      .filter((c) => c.visible)
      .reduce((sum, c) => sum + c.defaultWidth, 0);
    cfg.tableEl.style.minWidth = `${totalW}px`;
  }

  function renderHeader() {
    if (!cfg.headerRowEl) return;

    cfg.headerRowEl.innerHTML = columnsState
      .filter((col) => col.visible)
      .map((col) => {
        const isRight = col.id === 'action';
        return `
          <th
            data-col-id="${col.id}"
            style="width: ${col.defaultWidth}px;"
            class="py-2 px-2.5 ${isRight ? 'text-right' : 'text-left'} text-[11px] font-semibold text-[#86868b] tracking-tight relative select-none truncate"
          >
            <span>${col.label}</span>
            ${col.id !== 'action' ? `<span class="col-resizer absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-black/20 transition-colors"></span>` : ''}
          </th>
        `;
      })
      .join('');

    syncTableMinWidth();
    initColumnResize();
  }

  function initColumnResize() {
    if (!cfg.headerRowEl) return;
    cfg.headerRowEl.querySelectorAll('.col-resizer').forEach((resizer) => {
      const th = resizer.parentElement as HTMLTableCellElement;
      const colId = th.getAttribute('data-col-id');
      const col = columnsState.find((c) => c.id === colId);
      if (!col) return;

      let startX = 0;
      let startWidth = 0;

      function onMouseMove(e: MouseEvent) {
        const delta = e.clientX - startX;
        const newWidth = Math.max(col?.minWidth || 50, startWidth + delta);
        th.style.width = `${newWidth}px`;
        if (col) col.defaultWidth = newWidth;
        syncTableMinWidth();
      }

      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        saveColumnsState();
        cfg.onColumnsChange?.();
      }

      resizer.addEventListener('mousedown', (e: any) => {
        e.preventDefault();
        e.stopPropagation();
        startX = e.clientX;
        startWidth = th.offsetWidth;
        document.body.style.cursor = 'col-resize';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    });
  }

  function renderMenu() {
    if (!cfg.checkboxListEl) return;
    const visibleCount = columnsState.filter((c) => c.visible).length;
    if (cfg.countLabelEl) {
      cfg.countLabelEl.textContent = `Cols (${visibleCount}/${columnsState.length})`;
    }

    cfg.checkboxListEl.innerHTML = columnsState
      .map((col) => {
        return `
          <label class="flex items-center gap-2 px-2 py-1 rounded hover:bg-[#f5f5f7] cursor-pointer text-xs select-none ${!col.canHide ? 'opacity-50 pointer-events-none' : ''}">
            <input
              type="checkbox"
              class="col-visibility-toggle rounded text-black focus:ring-0"
              data-col-id="${col.id}"
              ${col.visible ? 'checked' : ''}
              ${!col.canHide ? 'disabled' : ''}
            />
            <span class="truncate">${col.label}</span>
          </label>
        `;
      })
      .join('');

    cfg.checkboxListEl.querySelectorAll('.col-visibility-toggle').forEach((cb) => {
      cb.addEventListener('change', (e: any) => {
        const colId = e.target.getAttribute('data-col-id');
        const col = columnsState.find((c) => c.id === colId);
        if (col && col.canHide) {
          col.visible = e.target.checked;
          saveColumnsState();
          renderHeader();
          renderMenu();
          cfg.onColumnsChange?.();
        }
      });
    });
  }

  function resetColumns() {
    localStorage.removeItem(cfg.storageKey);
    columnsState = cfg.defaultColumns.map((col) => ({ ...col }));
    saveColumnsState();
    renderHeader();
    renderMenu();
    cfg.onColumnsChange?.();
  }

  function toggleDensity() {
    densityState = densityState === 'compact' ? 'cozy' : 'compact';
    if (cfg.densityLabelEl) {
      cfg.densityLabelEl.textContent = densityState === 'compact' ? 'Compact' : 'Cozy';
    }
    cfg.onDensityChange?.(densityState);
  }

  return {
    getColumns: () => columnsState,
    isColumnVisible: (id: string) => columnsState.find((c) => c.id === id)?.visible ?? true,
    getColumnWidth: (id: string) => columnsState.find((c) => c.id === id)?.defaultWidth ?? 100,
    getDensity: () => densityState,
    renderHeader,
    renderMenu,
    resetColumns,
    toggleDensity,
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

