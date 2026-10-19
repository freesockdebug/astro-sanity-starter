// src/utils/image.ts
/**
 * Sanity CDN Image Optimization Service
 * Features:
 * - Dynamic parameter optimization (w, q, auto=format)
 * - Optional Cloudflare Edge Proxy Routing to bypass direct Sanity bandwidth consumption
 * - Controllable via ENABLE_IMAGE_PROXY environment variable
 */
export interface ImageOptimizationOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'auto' | 'webp' | 'avif' | 'jpg';
  fit?: 'clip' | 'crop' | 'fill' | 'fillmax' | 'max' | 'scale' | 'min';
}

export class SanityImageService {
  private static _studioConfigOverride: boolean | null = null;

  /**
   * Set proxy state dynamically from Sanity Studio siteConfig document
   */
  public static setStudioProxyConfig(enabled?: boolean): void {
    if (typeof enabled === 'boolean') {
      this._studioConfigOverride = enabled;
    }
  }

  /**
   * Check whether Cloudflare Edge Image Proxying is enabled.
   * Priority:
   * 1. Sanity Studio siteConfig setting (if defined)
   * 2. ENABLE_IMAGE_PROXY environment variable
   * 3. Defaults to true for optimal Cloudflare caching
   */
  public static isProxyEnabled(): boolean {
    if (this._studioConfigOverride !== null) {
      return this._studioConfigOverride;
    }

    const envVal =
      (import.meta.env && import.meta.env.ENABLE_IMAGE_PROXY) ||
      (typeof process !== 'undefined' && process.env && process.env.ENABLE_IMAGE_PROXY);

    if (envVal !== undefined && envVal !== null) {
      return envVal === 'true' || envVal === true;
    }

    // Default to true (safe, high performance edge caching)
    return true;
  }

  /**
   * Appends Sanity CDN image pipeline query parameters for dynamic resizing, WebP compression, and optimal delivery.
   * If proxy is enabled, routes through /cdn-image/* for Cloudflare free edge caching.
   */
  public static optimize(url?: string | null, options: ImageOptimizationOptions = {}): string {
    if (!url || typeof url !== 'string') return url || '';

    // Fast-path for local optimized static assets
    if (url.includes('/images/hero-light')) return '/images/hero-light.webp';
    if (url.includes('/images/spec-light')) return '/images/spec-light.webp';

    // Only apply to Sanity CDN URLs (direct cdn.sanity.io or already proxied /cdn-image/)
    const isDirectSanity = url.includes('cdn.sanity.io');
    const isProxiedSanity = url.includes('/cdn-image/');
    if (!isDirectSanity && !isProxiedSanity) {
      return url;
    }

    const {
      width,
      height,
      quality = 80,
      format = 'auto',
      fit = 'max'
    } = options;

    try {
      const fullUrl = isProxiedSanity
        ? (url.startsWith('http') ? url.replace('/cdn-image/', 'https://cdn.sanity.io/') : `https://cdn.sanity.io${url.replace(/^\/cdn-image/, '')}`)
        : url;

      const parsedUrl = new URL(fullUrl.startsWith('http') ? fullUrl : `https://cdn.sanity.io${fullUrl.startsWith('/') ? '' : '/'}${fullUrl}`);
      if (width) parsedUrl.searchParams.set('w', String(width));
      if (height) parsedUrl.searchParams.set('h', String(height));
      if (quality) parsedUrl.searchParams.set('q', String(quality));
      if (format) parsedUrl.searchParams.set('auto', 'format');
      if (fit) parsedUrl.searchParams.set('fit', fit);

      const optimizedUrl = parsedUrl.toString();

      // If Edge Proxy is enabled: route through local Cloudflare Edge Cache (/cdn-image)
      if (this.isProxyEnabled()) {
        return optimizedUrl.replace('https://cdn.sanity.io', '/cdn-image');
      }

      return optimizedUrl;
    } catch {
      return url;
    }
  }

  /**
   * Directly routes any Sanity CDN URL to the Cloudflare Edge Proxy (/cdn-image) without adding query parameters
   */
  public static toEdgeUrl(url?: string | null): string {
    if (!url || typeof url !== 'string') return url || '';
    if (url.includes('/cdn-image/')) return url;
    if (!url.includes('cdn.sanity.io')) return url;
    if (this.isProxyEnabled()) {
      return url.replace('https://cdn.sanity.io', '/cdn-image');
    }
    return url;
  }

  /**
   * Helper to get high-performance card thumbnail image (e.g. 600px wide, 80% quality, auto-format WebP)
   */
  public static thumbnail(url?: string | null, width: number = 600): string {
    return this.optimize(url, { width, quality: 80, format: 'auto' });
  }

  /**
   * Helper to get hero or high-resolution banner image (e.g. 1600px wide)
   */
  public static hero(url?: string | null, width: number = 1600): string {
    return this.optimize(url, { width, quality: 85, format: 'auto' });
  }

  /**
   * Helper to get macro texture / specification visual (e.g. 1200px wide)
   */
  public static macro(url?: string | null, width: number = 1200): string {
    return this.optimize(url, { width, quality: 85, format: 'auto' });
  }

  /**
   * Helper to get brand logos or small UI icons (e.g. 300px wide, high quality)
   */
  public static logo(url?: string | null, width: number = 300): string {
    return this.optimize(url, { width, quality: 90, format: 'auto' });
  }

  /**
   * Helper to get user avatars or small badges (e.g. 120px wide)
   */
  public static avatar(url?: string | null, width: number = 120): string {
    return this.optimize(url, { width, quality: 85, format: 'auto' });
  }

  /**
   * Generates a responsive srcset string with automated format conversion (WebP/AVIF).
   * Perfect for mobile device responsive scaling to eliminate oversized downloads.
   */
  public static srcSet(
    url?: string | null,
    widths: number[] = [480, 800, 1200, 1600],
    options: Omit<ImageOptimizationOptions, 'width'> = {}
  ): string {
    if (!url || typeof url !== 'string') {
      return '';
    }

    if (url.includes('/images/hero-light')) {
      return '/images/hero-light-480.webp 480w, /images/hero-light-800.webp 800w, /images/hero-light-1200.webp 1200w, /images/hero-light.webp 1376w';
    }

    if (url.includes('/images/spec-light')) {
      return '/images/spec-light-480.webp 480w, /images/spec-light-800.webp 800w, /images/spec-light.webp 1376w';
    }

    if (!url.includes('cdn.sanity.io') && !url.includes('/cdn-image/')) {
      return '';
    }
    return widths
      .map((w) => `${this.optimize(url, { ...options, width: w })} ${w}w`)
      .join(', ');
  }

  /**
   * Generates a high-priority preload descriptor for LCP Hero images.
   * Centralizes responsive breakpoints and fetch sizes to prevent oversized downloads on mobile.
   */
  public static resolveHeroPreload(
    url?: string | null,
    widths: number[] = [480, 800, 1200, 1600],
    sizes: string = '(max-width: 640px) 100vw, (max-width: 1024px) 95vw, 1520px'
  ): { src: string; srcset?: string; sizes?: string } | undefined {
    if (!url || typeof url !== 'string') {
      return undefined;
    }

    if (url.includes('/images/hero-light')) {
      return {
        src: '/images/hero-light.webp',
        srcset: this.srcSet(url, widths),
        sizes,
      };
    }

    if (!url.includes('cdn.sanity.io') && !url.includes('/cdn-image/')) {
      return undefined;
    }
    return {
      src: this.hero(url, widths[widths.length - 1] || 1600),
      srcset: this.srcSet(url, widths, { quality: 80 }),
      sizes,
    };
  }
}
