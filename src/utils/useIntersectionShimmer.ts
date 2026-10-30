// src/utils/useIntersectionShimmer.ts

export interface IntersectionShimmerOptions {
  /**
   * 视口外扩预热边距，默认 '160px 160px'（兼顾纵向滚动与横向轮播提前唤醒）
   */
  rootMargin?: string;
  /**
   * 触发交叉的可见比例阈值，默认 0.01
   */
  threshold?: number;
  /**
   * 激活流光动画的 CSS 类名，默认 'is-shimmer-active'
   */
  activeClass?: string;
  /**
   * 标记图片已加载完成的 CSS 类名，默认 'apple-img-loaded'
   */
  loadedClass?: string;
  /**
   * 是否在 requestIdleCallback 空闲态后再挂载观察，默认 true
   */
  deferUntilIdle?: boolean;
  /**
   * requestIdleCallback 超时时间（毫秒），默认 600
   */
  idleTimeout?: number;
}

export type ShimmerTarget =
  | Element
  | NodeListOf<Element>
  | Element[]
  | string
  | null
  | undefined;

export interface IntersectionShimmerController {
  /** 动态追加新的目标元素或容器进入观察 */
  observe: (nextTarget: ShimmerTarget, scope?: ParentNode) => void;
  /** 停止对指定元素的观察并立即移除 is-shimmer-active */
  unobserve: (el: Element | null | undefined) => void;
  /** 销毁当前控制器注册的所有元素观察 */
  disconnect: () => void;
}

const DEFAULT_SELECTOR =
  '.apple-skeleton, .apple-skeleton-warm, .apple-skeleton-surface, .apple-shimmer-wave';

// 按配置 key 复用底层 IntersectionObserver 单例，避免每个卡片重复创建实例
const observerPool = new Map<string, IntersectionObserver>();

function scheduleIdle(task: () => void, timeout = 600): void {
  if (typeof window === 'undefined') return;
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(task, { timeout });
  } else {
    globalThis.setTimeout(task, 120);
  }
}

function getSharedObserver(
  rootMargin: string,
  threshold: number,
  activeClass: string,
  loadedClass: string
): IntersectionObserver | null {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    return null;
  }

  const poolKey = `${rootMargin}|${threshold}|${activeClass}|${loadedClass}`;
  let obs = observerPool.get(poolKey);
  if (obs) return obs;

  obs = new window.IntersectionObserver(
    (entries, observerInstance) => {
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const el = entry.target;

        // 若图片已加载完毕，立即清理流光类名并永久解除观察
        if (el.classList.contains(loadedClass)) {
          el.classList.remove(activeClass);
          observerInstance.unobserve(el);
          continue;
        }

        // 进入视口激活流光，离开视口立即移除以卸载离屏 GPU 图层
        if (entry.isIntersecting) {
          el.classList.add(activeClass);
        } else {
          el.classList.remove(activeClass);
        }
      }
    },
    {
      root: null,
      rootMargin,
      threshold,
    }
  );

  observerPool.set(poolKey, obs);
  return obs;
}

function resolveElements(
  target: ShimmerTarget,
  scope: ParentNode = document
): Element[] {
  if (!target) return [];
  if (typeof target === 'string') {
    return Array.from(scope.querySelectorAll(target));
  }
  if (target instanceof Element) {
    // 若传入的是容器节点且自身不是骨架元素，同时收集其内部的骨架子节点
    const isSelfSkeleton = target.matches(DEFAULT_SELECTOR);
    const children = Array.from(target.querySelectorAll(DEFAULT_SELECTOR));
    return isSelfSkeleton ? [target, ...children] : children.length > 0 ? children : [target];
  }
  return Array.from(target);
}

/**
 * 将目标占位元素注册到共享的 IntersectionObserver 中，
 * 仅在元素进入（或接近）视口时切换 `is-shimmer-active` 类名。
 */
export function useIntersectionShimmer(
  initialTarget: ShimmerTarget = DEFAULT_SELECTOR,
  options: IntersectionShimmerOptions = {}
): IntersectionShimmerController {
  const {
    rootMargin = '160px 160px',
    threshold = 0.01,
    activeClass = 'is-shimmer-active',
    loadedClass = 'apple-img-loaded',
    deferUntilIdle = true,
    idleTimeout = 600,
  } = options;

  const trackedElements = new Set<Element>();
  const observer = getSharedObserver(rootMargin, threshold, activeClass, loadedClass);

  const registerElements = (elements: Element[]) => {
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el.classList.contains(loadedClass)) {
        el.classList.remove(activeClass);
        continue;
      }

      trackedElements.add(el);

      if (observer) {
        observer.observe(el);
      } else {
        // 不支持 IntersectionObserver 的旧环境降级直接激活
        el.classList.add(activeClass);
      }
    }
  };

  const observe = (nextTarget: ShimmerTarget, scope: ParentNode = document) => {
    const run = () => {
      const elements = resolveElements(nextTarget, scope);
      registerElements(elements);
    };

    if (deferUntilIdle) {
      scheduleIdle(run, idleTimeout);
    } else {
      run();
    }
  };

  const unobserve = (el: Element | null | undefined) => {
    if (!el) return;
    el.classList.remove(activeClass);
    trackedElements.delete(el);
    observer?.unobserve(el);
  };

  const disconnect = () => {
    trackedElements.forEach((el) => {
      el.classList.remove(activeClass);
      observer?.unobserve(el);
    });
    trackedElements.clear();
  };

  // 初始化注册首批目标元素
  if (typeof window !== 'undefined' && initialTarget) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => observe(initialTarget), { once: true });
    } else {
      observe(initialTarget);
    }
  }

  return {
    observe,
    unobserve,
    disconnect,
  };
}
