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
 * Resolve dynamic origin from Astro.url with fallback to Astro.site or APP_URL
 */
export function resolveSiteOrigin(astroUrl?: URL | string, astroSite?: URL | string): string {
  if (astroUrl) {
    try {
      const parsed = typeof astroUrl === 'string' ? new URL(astroUrl) : astroUrl;
      if (parsed.origin && parsed.origin !== 'null') {
        return parsed.origin;
      }
    } catch {}
  }

  if (astroSite) {
    try {
      const parsedSite = typeof astroSite === 'string' ? new URL(astroSite) : astroSite;
      if (parsedSite.origin && parsedSite.origin !== 'null') {
        return parsedSite.origin;
      }
    } catch {}
  }

  const appUrlEnv =
    (typeof process !== 'undefined' && process.env?.APP_URL) ||
    (import.meta.env && import.meta.env.APP_URL);
  if (appUrlEnv) {
    try {
      return new URL(appUrlEnv).origin;
    } catch {}
  }

  return 'https://gwenvenni.com';
}

/**
 * Normalize canonical & hreflang URLs for Google SEO:
 * - Strips query parameters (?...) and hash fragments (#...)
 * - Strips trailing slashes except for the root path "/"
 */
export function normalizeCanonicalUrl(rawUrl: string | URL, baseOrigin?: string | URL): string {
  const origin = baseOrigin ? String(baseOrigin) : 'https://gwenvenni.com';
  const parsed = new URL(rawUrl.toString(), origin);
  parsed.search = '';
  parsed.hash = '';

  const collapsedPath = parsed.pathname.replace(/\/+/g, '/');
  parsed.pathname =
    collapsedPath.length > 1 ? collapsedPath.replace(/\/+$/, '') : '/';

  return parsed.toString();
}

/**
 * Generate bidirectional Google SEO hreflang links (en, de, fr, es + x-default)
 * automatically from the current Astro.url
 */
export function getHreflangAlternates(
  astroUrl: URL,
  astroSite?: URL
): Array<{ hreflang: string; href: string }> {
  const origin = resolveSiteOrigin(astroUrl, astroSite);
  const locales = Object.keys(LANGUAGES) as SupportedLocale[];

  const alternates: Array<{ hreflang: string; href: string }> = locales.map((loc) => ({
    hreflang: loc,
    href: normalizeCanonicalUrl(switchLocalePath(astroUrl.pathname, loc), origin),
  }));

  alternates.push({
    hreflang: 'x-default',
    href: normalizeCanonicalUrl(switchLocalePath(astroUrl.pathname, DEFAULT_LOCALE), origin),
  });

  return alternates;
}

const COMMON_CMS_TERM_TRANSLATIONS: Partial<Record<SupportedLocale, Record<string, string>>> = {
  de: {
    'Composition': 'Materialzusammensetzung',
    'Needle Count': 'Nadelanzahl',
    'Needle Gauge': 'Nadelstärke',
    'Toe Closure': 'Spitzennaht',
    'Toe Linking': 'Spitzenverarbeitung',
    'Weight': 'Gewicht',
    'Sizing': 'Größenlauf',
    'Sizing Standard': 'Größenstandard',
    'Care': 'Pflegehinweis',
    'Care Instructions': 'Pflegehinweise',
    'Certifications': 'Zertifizierungen',
    'Origin': 'Herkunft',
    'Packaging': 'Verpackung',
    'MOQ': 'Mindestmenge',
    'Lead Time': 'Lieferzeit',
    'Silk Series': 'Seiden-Serie',
    'Cashmere & Wool': 'Kaschmir & Wolle',
    '15D Sheer Series': '15D Feinstrumpf',
    'Combed Cotton': 'Gekämmte Baumwolle',
    'Athletic Terry': 'Sport-Frottee',
  },
  fr: {
    'Composition': 'Composition',
    'Needle Count': 'Nombre d’aiguilles',
    'Needle Gauge': 'Jauge d’aiguille',
    'Toe Closure': 'Fermeture pointe',
    'Toe Linking': 'Rémaillage pointe',
    'Weight': 'Poids',
    'Sizing': 'Pointures',
    'Sizing Standard': 'Norme de taille',
    'Care': 'Entretien',
    'Care Instructions': 'Conseils d’entretien',
    'Certifications': 'Certifications',
    'Origin': 'Origine',
    'Packaging': 'Conditionnement',
    'MOQ': 'Quantité min.',
    'Lead Time': 'Délai de production',
    'Silk Series': 'Série Soie',
    'Cashmere & Wool': 'Cachemire & Laine',
    '15D Sheer Series': 'Série Voile 15D',
    'Combed Cotton': 'Coton Peigné',
    'Athletic Terry': 'Éponge Sport',
  },
  es: {
    'Composition': 'Composición',
    'Needle Count': 'Número de agujas',
    'Needle Gauge': 'Grosor de aguja',
    'Toe Closure': 'Cierre de puntera',
    'Toe Linking': 'Remallado de puntera',
    'Weight': 'Peso',
    'Sizing': 'Tallas',
    'Sizing Standard': 'Estándar de tallas',
    'Care': 'Cuidado',
    'Care Instructions': 'Instrucciones de lavado',
    'Certifications': 'Certificaciones',
    'Origin': 'Origen',
    'Packaging': 'Embalaje',
    'MOQ': 'Pedido mín.',
    'Lead Time': 'Plazo de entrega',
    'Silk Series': 'Serie Seda',
    'Cashmere & Wool': 'Cachemira y Lana',
    '15D Sheer Series': 'Serie Fina 15D',
    'Combed Cotton': 'Algodón Peinado',
    'Athletic Terry': 'Rizo Deportivo',
  },
};

/**
 * Gracefully extract localized text from Sanity CMS field
 * Supports:
 * 1. Multilingual object: { en: "Silk Sock", de: "Seidensocke" }
 * 2. Localized fallback for non-default locales when CMS only has English or flat string
 * 3. Legacy flat string: "Silk Sock"
 */
export function getLocalizedValue(
  field: any,
  lang: SupportedLocale = DEFAULT_LOCALE,
  fallback?: string
): string {
  if (!field) return fallback || '';

  if (typeof field === 'object') {
    const targetVal = field[lang];
    if (typeof targetVal === 'string' && targetVal.trim()) {
      return targetVal.trim();
    }
    if (lang !== DEFAULT_LOCALE && fallback) {
      return fallback;
    }
    if (typeof field[DEFAULT_LOCALE] === 'string' && field[DEFAULT_LOCALE].trim()) {
      const enVal = field[DEFAULT_LOCALE].trim();
      if (lang !== DEFAULT_LOCALE) {
        const mapped = COMMON_CMS_TERM_TRANSLATIONS[lang]?.[enVal];
        if (mapped) return mapped;
      }
      return enVal;
    }
    // Fallback to first available value in object
    const values = Object.values(field).filter((v) => typeof v === 'string' && v.trim());
    if (values.length > 0) return String(values[0]).trim();
    return fallback || '';
  }

  if (typeof field === 'string') {
    const trimmed = field.trim();
    if (!trimmed) return fallback || '';
    if (lang !== DEFAULT_LOCALE) {
      if (fallback) return fallback;
      const mapped = COMMON_CMS_TERM_TRANSLATIONS[lang]?.[trimmed];
      if (mapped) return mapped;
    }
    return trimmed;
  }

  return fallback || '';
}
