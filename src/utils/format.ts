// src/utils/format.ts
// Unified date normalization and brand/text formatting utilities
import { DEFAULT_BRAND_TITLE } from '@data/defaults';

/**
 * Normalizes any date representation (SQLite datetime, ISO string, timestamp)
 * to a standard ISO 8601 UTC string (e.g. "2026-11-02T02:18:09Z").
 */
export function toIsoUtcString(dateStr?: string | number | Date | null): string {
  if (!dateStr) return '';
  if (dateStr instanceof Date) return dateStr.toISOString();
  if (typeof dateStr === 'number') return new Date(dateStr).toISOString();

  const str = String(dateStr).trim();
  if (!str) return '';

  // Already valid ISO format with Z or timezone offset
  if (str.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(str)) {
    return str;
  }

  // SQLite format "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DDTHH:MM:SSZ"
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}(:\d{2})?$/.test(str)) {
    const iso = str.replace(' ', 'T');
    return iso.length === 16 ? `${iso}:00Z` : `${iso}Z`;
  }

  try {
    const d = new Date(str.includes('T') ? str : `${str}Z`);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch {
    // fallback
  }
  return str;
}

/**
 * Returns a clean UTC display string "YYYY-MM-DD HH:mm UTC" for SSR fallback.
 */
export function formatUtcFallback(dateStr?: string | number | Date | null): string {
  const iso = toIsoUtcString(dateStr);
  if (!iso) return '—';
  const clean = iso.replace('T', ' ').replace(/Z$/, '');
  return `${clean.slice(0, 16)} UTC`;
}

/**
 * Strips Chinese characters and bracketed Chinese annotations from labels (e.g. "(款式系列)")
 */
export function cleanEnglishText(text?: string): string {
  if (!text) return '';
  return text
    .replace(/[\(（][^\)）]*[\u4e00-\u9fa5]+[^\)）]*[\)）]|[\u4e00-\u9fa5]+/g, '')
    .trim();
}

/**
 * Extracts pure brand name from full titles (e.g. "GWENVENNI | Luxury Atelier" -> "GWENVENNI")
 */
export function cleanBrandTitle(title?: string, defaultTitle = DEFAULT_BRAND_TITLE): string {
  if (!title) return defaultTitle;
  return title.split(/\s*\|\s*/)[0].trim().toUpperCase();
}

