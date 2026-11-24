// src/config/storefrontThemes.ts
// Single Source of Truth for Storefront Visual Themes

export interface StorefrontThemeOption {
  value: 'apple-minimal' | 'warm-atelier' | 'editorial-gallery' | 'luxury-atelier';
  name: string;
  badge: string;
  desc: string;
  swatches: [string, string, string];
  loadDisplaySerif?: boolean;
}

export const STOREFRONT_THEMES = [
  {
    value: 'apple-minimal',
    name: 'Apple Minimal（极简冷灰）',
    badge: 'Classic',
    desc: '纯白画布 + #f5f5f7 冷灰展台 + 系统无衬线 + 高密度 7 列商品货架。',
    swatches: ['#ffffff', '#f5f5f7', '#1d1d1f'],
    loadDisplaySerif: false,
  },
  {
    value: 'warm-atelier',
    name: 'Warm Atelier（原纱暖调画册）',
    badge: 'Loro Piana 调性',
    desc: '全站统一详情页同款暖石宣纸色阶（#fcfbf9 / #f6f3ee）、浓缩咖啡墨色与克制建筑细线。',
    swatches: ['#fcfbf9', '#f6f3ee', '#1c1917'],
    loadDisplaySerif: false,
  },
  {
    value: 'editorial-gallery',
    name: 'Editorial Gallery（高定衬线画廊）',
    badge: 'Atelier',
    desc: '暖麻画布 + Cormorant Garamond 展示衬线体 + 无框画廊 4~5 列大图陈列（隐藏图片遮挡角标）。',
    swatches: ['#faf8f4', '#f2ede4', '#1a1816'],
    loadDisplaySerif: true,
  },
  {
    value: 'luxury-atelier',
    name: 'Luxury Atelier（建筑高定）',
    badge: 'New · 品牌重塑',
    desc: '原纱宣纸暖调 + Cormorant 衬线字阶 + 解除一屏锁高与 Snap 放大建筑留白 + 4:5 无框画廊陈列（清除橙色/绿徽章杂讯）。',
    swatches: ['#fcfbf9', '#f4f0ea', '#3f3228'],
    loadDisplaySerif: true,
  },
] as const satisfies readonly StorefrontThemeOption[];

export type StorefrontTheme = (typeof STOREFRONT_THEMES)[number]['value'];

export const VALID_STOREFRONT_THEMES: readonly StorefrontTheme[] = STOREFRONT_THEMES.map((t) => t.value);

const THEME_MAP = new Map<string, StorefrontThemeOption>(STOREFRONT_THEMES.map((t) => [t.value, t]));

export function isValidStorefrontTheme(value: unknown): value is StorefrontTheme {
  return typeof value === 'string' && THEME_MAP.has(value);
}

export function needsDisplaySerifFont(theme?: string): boolean {
  return Boolean(theme && THEME_MAP.get(theme)?.loadDisplaySerif);
}

export interface StorefrontThemeClasses {
  pageCanvas: string;
  sectionSurface: string;
  cardContainer: string;
  cardImageAspect: string;
  headingFont: string;
  primaryText: string;
  mutedText: string;
  primaryButton: string;
}

export interface StorefrontThemeContext {
  id: StorefrontTheme;
  variant: 'minimal' | 'warm' | 'editorial' | 'luxury';
  isLuxury: boolean;
  isEditorial: boolean;
  isWarm: boolean;
  classes: StorefrontThemeClasses;
}

const THEME_CLASS_MAP: Record<StorefrontTheme, StorefrontThemeClasses> = {
  'apple-minimal': {
    pageCanvas: 'bg-white text-[#1d1d1f]',
    sectionSurface: 'bg-[#f5f5f7]',
    cardContainer: 'rounded-2xl sm:rounded-3xl bg-[#f5f5f7] border border-black/5 hover:border-black/15 hover:shadow-xl p-4 sm:p-5',
    cardImageAspect: 'aspect-square rounded-xl sm:rounded-2xl bg-white shadow-inner',
    headingFont: 'font-sans font-semibold tracking-tight',
    primaryText: 'text-[#1d1d1f]',
    mutedText: 'text-[#86868b]',
    primaryButton: 'bg-[#1d1d1f] hover:bg-black text-white rounded-full',
  },
  'warm-atelier': {
    pageCanvas: 'bg-[#fcfbf9] text-[#1c1917]',
    sectionSurface: 'bg-[#f6f3ee]',
    cardContainer: 'rounded-2xl bg-[#f6f3ee] border border-[#1c1917]/8 hover:shadow-lg p-4 sm:p-5',
    cardImageAspect: 'aspect-square rounded-xl bg-[#fcfbf9]',
    headingFont: 'font-sans font-semibold tracking-tight',
    primaryText: 'text-[#1c1917]',
    mutedText: 'text-[#6b665f]',
    primaryButton: 'bg-[#1c1917] hover:bg-[#3f3228] text-[#fcfbf9] rounded-full',
  },
  'editorial-gallery': {
    pageCanvas: 'bg-[#faf8f4] text-[#1a1816]',
    sectionSurface: 'bg-[#f2ede4]',
    cardContainer: 'rounded-xl bg-[#fdfcfa] border border-[#1a1816]/10 hover:border-[#1a1816]/22 p-4 shadow-none',
    cardImageAspect: 'aspect-square rounded-lg bg-[#f2ede4]',
    headingFont: 'font-display font-medium tracking-[-0.015em]',
    primaryText: 'text-[#1a1816]',
    mutedText: 'text-[#6e685f]',
    primaryButton: 'bg-[#1a1816] hover:bg-[#2c2520] text-[#faf8f4] rounded-md',
  },
  'luxury-atelier': {
    pageCanvas: 'bg-[#fcfbf9] text-[#1c1917]',
    sectionSurface: 'bg-[#f4f0ea]',
    cardContainer: 'rounded-2xl bg-white border border-[#1c1917]/10 hover:border-[#1c1917]/22 p-4 shadow-none',
    cardImageAspect: 'aspect-[4/5] rounded-xl bg-[#f4f0ea] shadow-none',
    headingFont: 'font-display font-medium tracking-[-0.018em]',
    primaryText: 'text-[#1c1917]',
    mutedText: 'text-[#5f5a53]',
    primaryButton: 'bg-[#1c1917] hover:bg-[#3f3228] text-[#fcfbf9] rounded-full',
  },
};

export function resolveThemeContext(rawTheme?: unknown): StorefrontThemeContext {
  const id: StorefrontTheme = isValidStorefrontTheme(rawTheme) ? rawTheme : 'apple-minimal';
  const variantMap: Record<StorefrontTheme, StorefrontThemeContext['variant']> = {
    'apple-minimal': 'minimal',
    'warm-atelier': 'warm',
    'editorial-gallery': 'editorial',
    'luxury-atelier': 'luxury',
  };
  return {
    id,
    variant: variantMap[id],
    isLuxury: id === 'luxury-atelier',
    isEditorial: id === 'editorial-gallery',
    isWarm: id === 'warm-atelier',
    classes: THEME_CLASS_MAP[id],
  };
}

/**
 * Storefront Theme Hook for Astro SSR components.
 * Reads request-scoped context injected by ThemeProvider / Layout, falling back to systemSettings.
 */
export function useStorefrontTheme(locals?: App.Locals | Record<string, any>): StorefrontThemeContext {
  if (locals && (locals as any).themeContext) {
    return (locals as any).themeContext as StorefrontThemeContext;
  }
  const raw = (locals as any)?.systemSettings?.storefront_theme;
  return resolveThemeContext(raw);
}
