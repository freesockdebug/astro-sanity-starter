import { DEFAULT_BRAND_TITLE } from '@data/defaults';

/**
 * Global text normalization utilities for brand identity and clean English display
 */

/**
 * Strips Chinese characters and bracketed Chinese annotations from labels (e.g. "(款式系列)")
 */
export function cleanEnglishText(text?: string): string {
  if (!text) return '';
  return text
    .replace(/[\(（][^\)）]*[\u4e00-\u9fa5]+[^\)）]*[\)）]/g, '')
    .replace(/[\u4e00-\u9fa5]+/g, '')
    .trim();
}

/**
 * Extracts pure brand name from full titles (e.g. "GWENVENNI | Luxury Atelier" -> "GWENVENNI")
 */
export function cleanBrandTitle(title?: string, defaultTitle = DEFAULT_BRAND_TITLE): string {
  if (!title) return defaultTitle;
  return title.split(/\s*\|\s*/)[0].trim().toUpperCase();
}

