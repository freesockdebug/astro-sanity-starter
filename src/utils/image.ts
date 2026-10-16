/**
 * Sanity CDN Image Optimization Service
 */
export interface ImageOptimizationOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'auto' | 'webp' | 'avif' | 'jpg';
  fit?: 'clip' | 'crop' | 'fill' | 'fillmax' | 'max' | 'scale' | 'min';
}

export class SanityImageService {
  /**
   * Appends Sanity CDN image pipeline query parameters for dynamic resizing, WebP compression, and optimal delivery.
   */
  public static optimize(url?: string | null, options: ImageOptimizationOptions = {}): string {
    if (!url || typeof url !== 'string') return url || '';
    
    // Only apply to Sanity CDN URLs
    if (!url.includes('cdn.sanity.io')) {
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
      const parsedUrl = new URL(url);
      if (width) parsedUrl.searchParams.set('w', String(width));
      if (height) parsedUrl.searchParams.set('h', String(height));
      if (quality) parsedUrl.searchParams.set('q', String(quality));
      if (format) parsedUrl.searchParams.set('auto', 'format');
      if (fit) parsedUrl.searchParams.set('fit', fit);

      return parsedUrl.toString();
    } catch {
      return url;
    }
  }

  /**
   * Helper to get high-performance card thumbnail image (e.g. 600px wide, 80% quality, auto-format WebP)
   */
  public static thumbnail(url?: string | null, width: number = 600): string {
    return this.optimize(url, { width, quality: 80, format: 'auto' });
  }

  /**
   * Helper to get hero or high-resolution banner image (e.g. 1400px wide)
   */
  public static hero(url?: string | null, width: number = 1400): string {
    return this.optimize(url, { width, quality: 85, format: 'auto' });
  }
}
