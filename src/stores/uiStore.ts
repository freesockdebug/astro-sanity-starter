// src/stores/uiStore.ts
import { atom } from 'nanostores';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  durationMs: number;
}

export const toastsStore = atom<ToastItem[]>([]);

const MAX_VISIBLE_TOASTS = 3;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * 移除指定 ID 的 Toast
 */
export function dismissToast(id: string): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  toastsStore.set(toastsStore.get().filter((t) => t.id !== id));
}

/**
 * 触发全局轻提示 Toast
 * @param message 提示文案
 * @param typeOrSuccess 支持 'success' | 'error' | 'info' 或布尔值（兼容旧版 showToast(msg, true) 签名）
 * @param durationMs 自动关闭时长（默认 3200ms）
 */
export function showToast(
  message: string,
  typeOrSuccess: ToastType | boolean = 'success',
  durationMs = 3200
): string {
  const cleanMsg = String(message || '').trim();
  if (!cleanMsg) return '';

  const type: ToastType =
    typeof typeOrSuccess === 'boolean'
      ? typeOrSuccess
        ? 'success'
        : 'error'
      : typeOrSuccess;

  const current = toastsStore.get();
  // 防抖：若当前已存在完全相同的提示文案，先移除旧条目重新计时
  const existing = current.find((t) => t.message === cleanMsg && t.type === type);
  if (existing) {
    dismissToast(existing.id);
  }

  const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const nextItem: ToastItem = { id, message: cleanMsg, type, durationMs };

  const updated = [...toastsStore.get(), nextItem].slice(-MAX_VISIBLE_TOASTS);
  toastsStore.set(updated);

  if (durationMs > 0 && typeof window !== 'undefined') {
    const timer = setTimeout(() => {
      dismissToast(id);
    }, durationMs);
    timers.set(id, timer);
  }

  return id;
}

/**
 * 统一剪贴板复制并自动触发 Toast 反馈
 */
export async function copyToClipboard(text: string, label = 'Content'): Promise<boolean> {
  if (!text || typeof navigator === 'undefined' || !navigator.clipboard) {
    showToast(`Failed to copy ${label}`, 'error');
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast(`${label} copied to clipboard`, 'success', 2400);
    return true;
  } catch {
    showToast(`Unable to copy ${label}`, 'error');
    return false;
  }
}

// 暴露全局句柄，方便 Astro 页面中的 is:inline 脚本或原生事件直接调用
if (typeof window !== 'undefined') {
  const win = window as any;
  win.__showToast = showToast;
  win.__dismissToast = dismissToast;
  win.__copyToClipboard = copyToClipboard;
}

