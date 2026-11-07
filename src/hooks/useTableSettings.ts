// src/hooks/useTableSettings.ts
// Universal Administrator Table Settings Hook
// Features:
// - Column Visibility, Widths & Ordering (Drag & Drop + Up/Down buttons)
// - L1 localStorage (300ms debounce) + L2 Cloudflare KV & D1 (1000ms debounce)
// - Cross-device hydration with conflict resolution (updatedAt timestamp)
// - Density mode ('cozy' | 'compact')
// - Pin-right action column preservation

export interface ColumnConfig {
  id: string;
  label: string;
  defaultWidth: number;
  minWidth?: number;
  width?: number;
  visible?: boolean;
  canHide?: boolean;
  pinRight?: boolean;
  align?: 'left' | 'right' | 'center';
}

export interface TableSettingsPayload {
  columns: Array<{ id: string; visible: boolean; width: number }>;
  density: 'compact' | 'cozy';
  updatedAt: number;
}

export interface UseTableSettingsOptions {
  tableKey: string;
  defaultColumns: ColumnConfig[];
  defaultDensity?: 'compact' | 'cozy';
  tableEl?: HTMLElement | null;
  headerRowEl?: HTMLElement | null;
  controllerBtnEl?: HTMLElement | null;
  controllerMenuEl?: HTMLElement | null;
  columnsListEl?: HTMLElement | null;
  countBadgeEl?: HTMLElement | null;
  syncStatusEl?: HTMLElement | null;
  resetBtnEl?: HTMLElement | null;
  densityBtnEl?: HTMLElement | null;
  densityLabelEl?: HTMLElement | null;
  onSettingsChange?: () => void;
  onDensityChange?: (density: 'compact' | 'cozy') => void;
}

export interface TableSettingsController {
  getColumns: () => ColumnConfig[];
  getVisibleColumns: () => ColumnConfig[];
  getDensity: () => 'compact' | 'cozy';
  setDensity: (density: 'compact' | 'cozy') => void;
  toggleDensity: () => void;
  renderHeader: (targetHeaderRowEl?: HTMLElement | null, targetTableEl?: HTMLElement | null) => void;
  renderMenu: () => void;
  resetToDefaults: () => Promise<void>;
  syncTableMinWidth: (targetTableEl?: HTMLElement | null) => void;
}

/**
 * Merge default columns with saved user preferences while preserving order and right-pinned columns.
 */
export function mergeSavedColumns(
  defaults: ColumnConfig[],
  savedItems?: Array<{ id: string; visible?: boolean; width?: number }> | null
): ColumnConfig[] {
  const defaultMap = new Map(defaults.map((c) => [c.id, { ...c }]));
  const result: ColumnConfig[] = [];

  if (Array.isArray(savedItems) && savedItems.length > 0) {
    for (const saved of savedItems) {
      const def = defaultMap.get(saved.id);
      if (def) {
        result.push({
          ...def,
          visible: def.canHide === false ? true : Boolean(saved.visible),
          defaultWidth: typeof saved.width === 'number' && saved.width > 0 ? saved.width : def.defaultWidth,
        });
        defaultMap.delete(saved.id);
      }
    }
  }

  // Append any new default columns not present in saved items
  for (const remaining of defaultMap.values()) {
    result.push({ ...remaining });
  }

  // Force pinRight columns (e.g. 'action') to the very end
  const unpinned = result.filter((c) => !c.pinRight);
  const pinned = result.filter((c) => c.pinRight);
  return [...unpinned, ...pinned];
}

/**
 * Initializes table settings with debounced multi-tier persistence and cross-device hydration.
 */
export function useTableSettings(options: UseTableSettingsOptions): TableSettingsController {
  const { tableKey, defaultColumns } = options;
  const storageKey = `admin_table_settings:${tableKey}`;
  const densityStorageKey = `admin_density:${tableKey}`;

  let localUpdatedAt = 0;
  let densityState: 'compact' | 'cozy' = options.defaultDensity || 'cozy';

  // 1. Initial 0ms synchronous load from localStorage
  let columnsState: ColumnConfig[] = defaultColumns.map((c) => ({ ...c }));
  try {
    const storedDensity = localStorage.getItem(densityStorageKey);
    if (storedDensity === 'compact' || storedDensity === 'cozy') {
      densityState = storedDensity;
    }

    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.columns)) {
        columnsState = mergeSavedColumns(defaultColumns, parsed.columns);
        if (parsed.density === 'compact' || parsed.density === 'cozy') {
          densityState = parsed.density;
        }
        localUpdatedAt = Number(parsed.updatedAt) || 0;
      }
    }
  } catch { }

  let localSaveTimer: any = null;
  let cloudSaveTimer: any = null;

  function updateSyncBadge(status: 'synced' | 'syncing' | 'offline' | 'restored') {
    if (!options.syncStatusEl) return;
    if (status === 'syncing') {
      options.syncStatusEl.innerHTML = `<span class="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>Syncing...</span>`;
    } else if (status === 'synced') {
      options.syncStatusEl.innerHTML = `<span class="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">☁ Synced</span>`;
    } else if (status === 'restored') {
      options.syncStatusEl.innerHTML = `<span class="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">☁ Cloud Restored</span>`;
    } else {
      options.syncStatusEl.innerHTML = `<span class="inline-flex items-center gap-1 text-[#86868b]">Local only</span>`;
    }
  }

  function scheduleSave() {
    localUpdatedAt = Date.now();
    const payload: TableSettingsPayload = {
      columns: columnsState.map((c) => ({
        id: c.id,
        visible: c.canHide === false ? true : Boolean(c.visible !== false),
        width: c.defaultWidth,
      })),
      density: densityState,
      updatedAt: localUpdatedAt,
    };

    // 1. L1 localStorage (300ms debounce)
    if (localSaveTimer) clearTimeout(localSaveTimer);
    localSaveTimer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(payload));
        localStorage.setItem(densityStorageKey, densityState);
      } catch { }
    }, 300);

    // 2. L2 Cloud API (1000ms debounce)
    updateSyncBadge('syncing');
    if (cloudSaveTimer) clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/table-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tableKey, settings: payload }),
        });
        if (res.ok) {
          updateSyncBadge('synced');
        } else {
          updateSyncBadge('offline');
        }
      } catch {
        updateSyncBadge('offline');
      }
    }, 1000);
  }

  function syncTableMinWidth(targetTableEl?: HTMLElement | null) {
    const table = targetTableEl || options.tableEl;
    if (!table) return;
    const totalW = columnsState
      .filter((c) => c.visible !== false)
      .reduce((sum, c) => sum + (c.defaultWidth || 100), 0);
    table.style.minWidth = `${totalW}px`;
  }

  function renderHeader(targetHeaderRowEl?: HTMLElement | null, targetTableEl?: HTMLElement | null) {
    if (targetHeaderRowEl) options.headerRowEl = targetHeaderRowEl;
    if (targetTableEl) options.tableEl = targetTableEl;
    if (!options.headerRowEl) return;

    options.headerRowEl.innerHTML = columnsState
      .filter((col) => col.visible !== false)
      .map((col) => {
        const isRight = col.align === 'right' || col.id === 'action';
        const isPinned = col.pinRight;
        return `
          <th
            data-col-id="${col.id}"
            style="width: ${col.defaultWidth}px;"
            class="py-2.5 px-3 ${isRight ? 'text-right' : 'text-left'} text-[11px] font-semibold text-[#86868b] tracking-tight relative select-none truncate"
          >
            <span>${col.label}</span>
            ${!isPinned ? `<span class="col-resizer absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-black/20 dark:hover:bg-white/20 transition-colors"></span>` : ''}
          </th>
        `;
      })
      .join('');

    syncTableMinWidth();
    initColumnResize();
  }

  function initColumnResize() {
    if (!options.headerRowEl) return;
    options.headerRowEl.querySelectorAll('.col-resizer').forEach((resizer) => {
      const th = resizer.parentElement as HTMLTableCellElement;
      const colId = th.getAttribute('data-col-id');
      const col = columnsState.find((c) => c.id === colId);
      if (!col) return;

      let startX = 0;
      let startWidth = 0;

      function onMouseMove(e: MouseEvent) {
        const delta = e.clientX - startX;
        const newWidth = Math.max(col?.minWidth || 40, startWidth + delta);
        th.style.width = `${newWidth}px`;
        if (col) col.defaultWidth = newWidth;
        syncTableMinWidth();
      }

      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        scheduleSave();
        options.onSettingsChange?.();
      }

      resizer.addEventListener('mousedown', (e) => {
        const me = e as MouseEvent;
        startX = me.clientX;
        startWidth = th.offsetWidth;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        me.preventDefault();
      });
    });
  }

  function renderMenu() {
    if (options.countBadgeEl) {
      const visibleCount = columnsState.filter((c) => c.visible !== false).length;
      options.countBadgeEl.textContent = `${visibleCount}/${columnsState.length}`;
    }

    if (options.densityLabelEl) {
      options.densityLabelEl.textContent = densityState === 'compact' ? 'Compact' : 'Cozy';
    }

    if (!options.columnsListEl) return;

    options.columnsListEl.innerHTML = columnsState
      .map((col, index) => {
        const isVisible = col.visible !== false;
        const canHide = col.canHide !== false;
        const isPinned = Boolean(col.pinRight);
        const canMoveUp = index > 0 && !isPinned;
        const canMoveDown = index < columnsState.length - 1 && !columnsState[index + 1]?.pinRight;

        return `
          <div
            class="column-item flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-xs select-none transition-colors ${isPinned ? 'opacity-90' : 'cursor-grab active:cursor-grabbing'}"
            data-col-id="${col.id}"
            data-index="${index}"
            draggable="${!isPinned}"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span class="drag-handle text-[#86868b] text-[10px] ${isPinned ? 'invisible' : ''}" title="Drag to reorder">⠿</span>
              <label class="flex items-center gap-2 truncate cursor-pointer">
                <input
                  type="checkbox"
                  class="col-visibility-chk accent-[#1d1d1f] dark:accent-white rounded cursor-pointer"
                  data-col-id="${col.id}"
                  ${isVisible ? 'checked' : ''}
                  ${!canHide ? 'disabled title="This column is required"' : ''}
                />
                <span class="truncate text-[#1d1d1f] dark:text-zinc-100 font-medium ${!canHide ? 'opacity-80' : ''}">${col.label}</span>
              </label>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              ${isPinned ? '<span class="text-[10px] text-[#86868b] px-1 bg-black/5 rounded">Pinned</span>' : `
                <button
                  type="button"
                  class="move-col-btn p-1 text-[11px] rounded hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-20 disabled:pointer-events-none"
                  data-col-id="${col.id}"
                  data-dir="up"
                  ${!canMoveUp ? 'disabled' : ''}
                  title="Move column up"
                >↑</button>
                <button
                  type="button"
                  class="move-col-btn p-1 text-[11px] rounded hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-20 disabled:pointer-events-none"
                  data-col-id="${col.id}"
                  data-dir="down"
                  ${!canMoveDown ? 'disabled' : ''}
                  title="Move column down"
                >↓</button>
              `}
            </div>
          </div>
        `;
      })
      .join('');

    bindMenuEvents();
  }

  function bindMenuEvents() {
    if (!options.columnsListEl) return;

    // Checkbox toggles
    options.columnsListEl.querySelectorAll('.col-visibility-chk').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        const input = e.target as HTMLInputElement;
        const colId = input.getAttribute('data-col-id');
        const col = columnsState.find((c) => c.id === colId);
        if (col && col.canHide !== false) {
          col.visible = input.checked;
          renderHeader();
          renderMenu();
          scheduleSave();
          options.onSettingsChange?.();
        }
      });
    });

    // Up / Down button reordering
    options.columnsListEl.querySelectorAll('.move-col-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const button = (e.currentTarget as HTMLElement);
        const colId = button.getAttribute('data-col-id');
        const dir = button.getAttribute('data-dir');
        const idx = columnsState.findIndex((c) => c.id === colId);
        if (idx === -1) return;

        const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= columnsState.length) return;
        if (columnsState[targetIdx]?.pinRight || columnsState[idx]?.pinRight) return;

        const item = columnsState.splice(idx, 1)[0];
        columnsState.splice(targetIdx, 0, item);

        renderHeader();
        renderMenu();
        scheduleSave();
        options.onSettingsChange?.();
      });
    });

    // HTML5 Drag and Drop row reordering
    let draggedId: string | null = null;
    options.columnsListEl.querySelectorAll('.column-item[draggable="true"]').forEach((row) => {
      row.addEventListener('dragstart', (e) => {
        const el = row as HTMLElement;
        draggedId = el.getAttribute('data-col-id');
        el.classList.add('opacity-40');
      });

      row.addEventListener('dragend', () => {
        (row as HTMLElement).classList.remove('opacity-40');
        draggedId = null;
      });

      row.addEventListener('dragover', (e) => {
        e.preventDefault();
      });

      row.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetId = (row as HTMLElement).getAttribute('data-col-id');
        if (!draggedId || draggedId === targetId) return;

        const srcIdx = columnsState.findIndex((c) => c.id === draggedId);
        const dstIdx = columnsState.findIndex((c) => c.id === targetId);
        if (srcIdx === -1 || dstIdx === -1) return;
        if (columnsState[dstIdx]?.pinRight) return;

        const item = columnsState.splice(srcIdx, 1)[0];
        columnsState.splice(dstIdx, 0, item);

        renderHeader();
        renderMenu();
        scheduleSave();
        options.onSettingsChange?.();
      });
    });
  }

  // Toggle Dropdown Menu visibility
  if (options.controllerBtnEl && options.controllerMenuEl) {
    options.controllerBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      options.controllerMenuEl?.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (
        options.controllerMenuEl &&
        !options.controllerMenuEl.contains(e.target as Node) &&
        !options.controllerBtnEl?.contains(e.target as Node)
      ) {
        options.controllerMenuEl.classList.add('hidden');
      }
    });
  }

  // Density Toggle Button
  if (options.densityBtnEl) {
    options.densityBtnEl.addEventListener('click', () => {
      densityState = densityState === 'compact' ? 'cozy' : 'compact';
      if (options.densityLabelEl) {
        options.densityLabelEl.textContent = densityState === 'compact' ? 'Compact' : 'Cozy';
      }
      scheduleSave();
      options.onDensityChange?.(densityState);
    });
  }

  // Reset Button
  if (options.resetBtnEl) {
    options.resetBtnEl.addEventListener('click', async () => {
      await resetToDefaults();
    });
  }

  async function resetToDefaults() {
    if (localSaveTimer) {
      clearTimeout(localSaveTimer);
      localSaveTimer = null;
    }
    if (cloudSaveTimer) {
      clearTimeout(cloudSaveTimer);
      cloudSaveTimer = null;
    }

    columnsState = defaultColumns.map((c) => ({ ...c }));
    densityState = options.defaultDensity || 'cozy';
    if (options.densityLabelEl) {
      options.densityLabelEl.textContent = densityState === 'compact' ? 'Compact' : 'Cozy';
    }
    localUpdatedAt = Date.now();

    try {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(densityStorageKey);
    } catch { }

    renderHeader();
    renderMenu();
    updateSyncBadge('syncing');

    try {
      await fetch(`/api/admin/table-settings?tableKey=${tableKey}`, { method: 'DELETE' });
      updateSyncBadge('synced');
    } catch {
      updateSyncBadge('offline');
    }

    if (options.onSettingsChange) {
      options.onSettingsChange();
    } else {
      options.onDensityChange?.(densityState);
    }
  }

  // Background Cloud Hydration (pull cross-device preferences)
  (async function hydrateFromCloud() {
    try {
      const res = await fetch(`/api/admin/table-settings?tableKey=${tableKey}`, {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { success?: boolean; settings?: TableSettingsPayload } | null;
      if (!data?.success || !data?.settings) {
        updateSyncBadge('synced');
        return;
      }

      const cloudSettings: TableSettingsPayload = data.settings;
      if (cloudSettings.updatedAt && cloudSettings.updatedAt > localUpdatedAt) {
        columnsState = mergeSavedColumns(defaultColumns, cloudSettings.columns);
        if (cloudSettings.density === 'compact' || cloudSettings.density === 'cozy') {
          densityState = cloudSettings.density;
          if (options.densityLabelEl) {
            options.densityLabelEl.textContent = densityState === 'compact' ? 'Compact' : 'Cozy';
          }
        }
        localUpdatedAt = cloudSettings.updatedAt;

        try {
          localStorage.setItem(storageKey, JSON.stringify(cloudSettings));
          localStorage.setItem(densityStorageKey, densityState);
        } catch { }

        renderHeader();
        renderMenu();
        if (options.onSettingsChange) {
          options.onSettingsChange();
        } else {
          options.onDensityChange?.(densityState);
        }
        updateSyncBadge('restored');
      } else {
        updateSyncBadge('synced');
      }
    } catch {
      updateSyncBadge('offline');
    }
  })();

  return {
    getColumns: () => [...columnsState],
    getVisibleColumns: () => columnsState.filter((c) => c.visible !== false),
    getDensity: () => densityState,
    setDensity: (d) => {
      densityState = d;
      if (options.densityLabelEl) {
        options.densityLabelEl.textContent = d === 'compact' ? 'Compact' : 'Cozy';
      }
      scheduleSave();
      options.onDensityChange?.(densityState);
    },
    toggleDensity: () => {
      densityState = densityState === 'compact' ? 'cozy' : 'compact';
      if (options.densityLabelEl) {
        options.densityLabelEl.textContent = densityState === 'compact' ? 'Compact' : 'Cozy';
      }
      scheduleSave();
      options.onDensityChange?.(densityState);
    },
    renderHeader,
    renderMenu,
    resetToDefaults,
    syncTableMinWidth,
  };
}