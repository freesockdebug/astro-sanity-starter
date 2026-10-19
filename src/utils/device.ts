// src/utils/device.ts
/**
 * Unified Device & Screen Detection Utility
 * - UA Analysis powered by open-source 'ua-parser-js' (SSR + Client)
 * - Viewport & Responsive Breakpoint Detection (W3C / Tailwind standards)
 * - Single Source of Truth for Right Gutter Geometry & Floating Component Alignment
 */
import { UAParser } from 'ua-parser-js';

export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  os: string;
  browser: string;
}

export interface ClientScreenInfo {
  // Viewport dimensions (excludes scrollbars to prevent edge clipping)
  width: number;
  height: number;

  // Interaction & Breakpoints
  isTouch: boolean;
  isMobileScreen: boolean; // < 768px
  isSmallScreen: boolean;  // < 1024px
  isDesktop: boolean;      // >= 1024px
  isWideScreen: boolean;   // >= 1600px

  // Container Rail & Right Gutter Geometry
  contentWidth: number;
  contentRight: number;
  remainingRight: number;
  gutterCenterX: number | null;
  isDockMode: boolean;
}

/**
 * Detect device info from User Agent (SSR or Client)
 */
export function getDeviceInfo(userAgent?: string): DeviceInfo {
  const ua = userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const parser = new UAParser(ua);
  const device = parser.getDevice();
  const os = parser.getOS();
  const browser = parser.getBrowser();

  const type = device.type;
  const isMobile = type === 'mobile';
  const isTablet = type === 'tablet';
  const isDesktop = !isMobile && !isTablet;

  return {
    isMobile,
    isTablet,
    isDesktop,
    deviceType: isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop',
    os: os.name || 'unknown',
    browser: browser.name || 'unknown'
  };
}

/**
 * Client-side Unified Screen & Layout Geometry Detection
 * Single Source of Truth for responsive breakpoints and gutter alignment.
 */
export function getClientScreenInfo(): ClientScreenInfo {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      width: 0,
      height: 0,
      isTouch: false,
      isMobileScreen: false,
      isSmallScreen: false,
      isDesktop: false,
      isWideScreen: false,
      contentWidth: 0,
      contentRight: 0,
      remainingRight: 0,
      gutterCenterX: null,
      isDockMode: true
    };
  }

  // documentElement.clientWidth accurately excludes vertical scrollbar
  const clientWidth = document.documentElement.clientWidth;
  const clientHeight = window.innerHeight;

  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  const isMobileScreen = clientWidth < 768;
  const isSmallScreen = clientWidth < 1024;
  const isDesktop = clientWidth >= 1024;
  const isWideScreen = clientWidth >= 1600;

  // Find the primary wide content block container on the page (bento, showcase, wide)
  const blocks = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.apple-rail-showcase, .apple-rail-bento, .apple-rail-wide, .hero-showcase-box'
    )
  );

  let blockRight = 0;
  let blockWidth = 0;

  for (const b of blocks) {
    const rect = b.getBoundingClientRect();
    if (rect.width > blockWidth) {
      blockWidth = rect.width;
      blockRight = rect.right;
    }
  }

  // Fallback calculation if DOM block not found or too narrow
  if (!blockWidth) {
    blockWidth = Math.min(clientWidth - 48, isWideScreen ? 1440 : 1360);
    blockRight = (clientWidth + blockWidth) / 2;
  }

  const remainingRight = clientWidth - blockRight;

  // On desktop (width >= 1024px) with reasonable gutter (>= 32px)
  if (isDesktop && remainingRight >= 32) {
    const naturalCenterX = Math.round(blockRight + remainingRight / 2);

    // Safe edge clamping: ensure the widest component (Top button, 44px width)
    // always retains at least 16px clearance from viewport right edge
    const maxCompHalfWidth = 22; // 44px / 2
    const minRightMargin = 16;
    const maxAllowedCenterX = clientWidth - minRightMargin - maxCompHalfWidth;
    const safeCenterX = Math.min(naturalCenterX, maxAllowedCenterX);

    return {
      width: clientWidth,
      height: clientHeight,
      isTouch,
      isMobileScreen,
      isSmallScreen,
      isDesktop,
      isWideScreen,
      contentWidth: blockWidth,
      contentRight: blockRight,
      remainingRight,
      gutterCenterX: safeCenterX,
      isDockMode: false
    };
  }

  return {
    width: clientWidth,
    height: clientHeight,
    isTouch,
    isMobileScreen,
    isSmallScreen,
    isDesktop,
    isWideScreen,
    contentWidth: blockWidth,
    contentRight: blockRight,
    remainingRight,
    gutterCenterX: null,
    isDockMode: true
  };
}

/**
 * Backward compatibility alias for right gutter center calculation
 */
export function getRightGutterCenterAxis(): {
  isDockMode: boolean;
  centerX: number | null;
  remainingRight: number;
} {
  const info = getClientScreenInfo();
  return {
    isDockMode: info.isDockMode,
    centerX: info.gutterCenterX,
    remainingRight: info.remainingRight
  };
}

/**
 * Helper: Align any fixed/floating dock element directly to the right gutter center axis.
 * Automatically handles desktop center-alignment and mobile safe-dock fallback.
 */
export function alignElementToRightGutter(
  element: HTMLElement | null,
  options?: {
    fallbackRight?: string;
    elementWidth?: number;
  }
): void {
  if (!element || typeof window === 'undefined') return;
  const screen = getClientScreenInfo();

  window.requestAnimationFrame(() => {
    if (!element) return;
    if (screen.isDockMode || screen.gutterCenterX === null) {
      element.style.left = 'auto';
      element.style.right = options?.fallbackRight || '';
      return;
    }

    const width = options?.elementWidth || 44;
    element.style.left = `${Math.round(screen.gutterCenterX - width / 2)}px`;
    element.style.right = 'auto';
  });
}
