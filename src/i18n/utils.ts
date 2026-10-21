// src/i18n/utils.ts
import { UI_STRINGS, LANGUAGES, DEFAULT_LOCALE, type SupportedLocale } from './ui';

/**
 * Extract active locale from current URL pathname
 * e.g. "/de/products" -> "de", "/products" -> "en"
 */
export function getLangFromUrl(url: URL | string): SupportedLocale {
  const pathname = typeof url === 'string' ? url : url.pathname;
  const segments = pathname.split('/').filter(Boolean);
  const firstSegment = segments[0] as SupportedLocale;

  if (firstSegment && firstSegment in LANGUAGES && firstSegment !== DEFAULT_LOCALE) {
    return firstSegment;
  }
  return DEFAULT_LOCALE;
}

/**
 * Returns translation function for given locale
 */
export function useTranslations(lang: SupportedLocale = DEFAULT_LOCALE) {
  const dict = UI_STRINGS[lang] || UI_STRINGS[DEFAULT_LOCALE];
  const fallbackDict = UI_STRINGS[DEFAULT_LOCALE];

  return function t(key: string, fallback?: string): string {
    return dict[key] || fallbackDict[key] || fallback || key;
  };
}

/**
 * Compute the switch URL when changing language
 * e.g. switchLocalePath("/products/silk-sock", "de") -> "/de/products/silk-sock"
 * e.g. switchLocalePath("/de/products/silk-sock", "en") -> "/products/silk-sock"
 */
export function switchLocalePath(currentPathname: string, targetLang: SupportedLocale): string {
  // Strip trailing and leading slashes for normalized segments
  const segments = currentPathname.split('/').filter(Boolean);
  const currentFirst = segments[0] as SupportedLocale;

  // If current URL already has a non-default locale prefix, remove it
  if (currentFirst && currentFirst in LANGUAGES && currentFirst !== DEFAULT_LOCALE) {
    segments.shift();
  }

  const rawPath = segments.join('/');

  if (targetLang === DEFAULT_LOCALE) {
    return `/${rawPath}`;
  }

  return `/${targetLang}${rawPath ? `/${rawPath}` : ''}`;
}

/**
 * Helper to localize a link
 * e.g. getLocalizedPath("/products", "de") -> "/de/products"
 * e.g. getLocalizedPath("/products", "en") -> "/products"
 */
export function getLocalizedPath(path: string = '', lang: SupportedLocale = DEFAULT_LOCALE): string {
  if (!path) {
    return lang === DEFAULT_LOCALE ? '/' : `/${lang}`;
  }

  // 1. External URLs (http/https/mailto/tel/javascript) left untouched
  if (/^(?:https?:|\/\/|mailto:|tel:|javascript:)/i.test(path)) {
    return path;
  }

  // 2. Pure in-page anchor (#something or #) left untouched
  if (path.startsWith('#')) {
    return path;
  }

  // 3. Separate hash and search query if any
  const [pathnameAndSearch, hash] = path.split('#');
  const [pathname, search] = (pathnameAndSearch || '').split('?');
  const hashSuffix = hash !== undefined ? `#${hash}` : '';
  const searchSuffix = search !== undefined ? `?${search}` : '';

  // 4. Strip existing language prefix if present to avoid /de/de/
  const segments = (pathname || '').split('/').filter(Boolean);
  const first = segments[0] as SupportedLocale;
  if (first && first in LANGUAGES) {
    segments.shift();
  }
  const cleanPath = segments.join('/');

  // 5. Construct localized path with identical slug
  if (lang === DEFAULT_LOCALE) {
    return `/${cleanPath}${searchSuffix}${hashSuffix}`;
  }

  return `/${lang}${cleanPath ? `/${cleanPath}` : ''}${searchSuffix}${hashSuffix}`;
}

/**
 * Gracefully extract localized text from Sanity CMS field
 * Supports:
 * 1. Multilingual object: { en: "Silk Sock", de: "Seidensocke" }
 * 2. Legacy flat string: "Silk Sock"
 * 3. Fallback to English, then to any available language
 */
export function getLocalizedValue(field: any, lang: SupportedLocale = DEFAULT_LOCALE): string {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'object') {
    if (field[lang]) return String(field[lang]);
    if (field[DEFAULT_LOCALE]) return String(field[DEFAULT_LOCALE]);
    // Fallback to first available value in object
    const values = Object.values(field).filter((v) => typeof v === 'string');
    if (values.length > 0) return String(values[0]);
  }
  return '';
}
