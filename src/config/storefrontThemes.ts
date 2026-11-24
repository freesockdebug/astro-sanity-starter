// src/config/storefrontThemes.ts
// Single Source of Truth for Storefront Visual Themes

export interface StorefrontThemeSpecs {
  palette: string;
  typography: string;
  grid: string;
  rhythm: string;
}

export interface StorefrontThemeWireframe {
  canvasHex: string;
  surfaceHex: string;
  cardHex: string;
  inkHex: string;
  mutedHex: string;
  accentHex: string;
  borderCss: string;
  radiusCss: string;
  columns: 4 | 7;
  aspect: '1:1' | '4:5';
  isSerif: boolean;
}

export interface StorefrontThemeOption {
  value: 'apple-minimal' | 'warm-atelier' | 'editorial-gallery' | 'luxury-atelier';
  name: string;
  badge: string;
  desc: string;
  swatches: [string, string, string];
  loadDisplaySerif?: boolean;
  specs: StorefrontThemeSpecs;
  wireframe: StorefrontThemeWireframe;
}

export const STOREFRONT_THEMES = [
  {
    value: 'apple-minimal',
    name: 'Apple Minimal（极简冷灰）',
    badge: 'Classic · 默认',
    desc: '纯白画布 + #f5f5f7 苹果冷灰展台 + 系统无衬线体 + 高密度 7 列 1:1 紧凑看货货架。',
    swatches: ['#ffffff', '#f5f5f7', '#1d1d1f'],
    loadDisplaySerif: false,
    specs: {
      palette: '纯白 #fff + 冷灰 #f5f5f7',
      typography: 'Sans 系统无衬线',
      grid: '7 列高密度 · 1:1 方图',
      rhythm: '100svh 整屏吸附 (Snap)',
    },
    wireframe: {
      canvasHex: '#ffffff',
      surfaceHex: '#f5f5f7',
      cardHex: '#f5f5f7',
      inkHex: '#1d1d1f',
      mutedHex: '#86868b',
      accentHex: '#1d1d1f',
      borderCss: 'rgba(0, 0, 0, 0.08)',
      radiusCss: '8px',
      columns: 7,
      aspect: '1:1',
      isSerif: false,
    },
  },
  {
    value: 'warm-atelier',
    name: 'Warm Atelier（原纱暖调画册）',
    badge: 'Loro Piana 暖调',
    desc: '保持 7 列高密度工业货架与无衬线结构不变，将全站底色切换为羊绒原纱暖石色阶与浓缩咖啡墨色。',
    swatches: ['#fcfbf9', '#efeae1', '#2b2118'],
    loadDisplaySerif: false,
    specs: {
      palette: '羊绒米白 + 暖石 #f6f3ee',
      typography: 'Sans 系统无衬线',
      grid: '7 列高密度 · 1:1 方图',
      rhythm: '100svh 整屏吸附 (Snap)',
    },
    wireframe: {
      canvasHex: '#fcfbf9',
      surfaceHex: '#efeae1',
      cardHex: '#f6f3ee',
      inkHex: '#2b2118',
      mutedHex: '#78716a',
      accentHex: '#4a3728',
      borderCss: 'rgba(43, 33, 24, 0.12)',
      radiusCss: '8px',
      columns: 7,
      aspect: '1:1',
      isSerif: false,
    },
  },
  {
    value: 'editorial-gallery',
    name: 'Editorial Gallery（墨韵策展画廊）',
    badge: 'Nordic Slate · 策展',
    desc: '北欧冷冽矿物岩灰画布 + Cormorant 衬线字阶 + 2px 锋利建筑黑框线 + 4 列无角标艺术馆级策展陈列。',
    swatches: ['#f3f4f6', '#d5dae1', '#0f1419'],
    loadDisplaySerif: true,
    specs: {
      palette: '矿物岩灰 #f3f4f6 + 曜石黑框',
      typography: 'Cormorant 高定衬线体',
      grid: '4 列策展画廊 · 锋利直框',
      rhythm: '自由长卷 · 隐藏杂讯角标',
    },
    wireframe: {
      canvasHex: '#f3f4f6',
      surfaceHex: '#e2e6ec',
      cardHex: '#ffffff',
      inkHex: '#0f1419',
      mutedHex: '#5b6470',
      accentHex: '#1e293b',
      borderCss: 'rgba(15, 20, 25, 0.22)',
      radiusCss: '2px',
      columns: 4,
      aspect: '1:1',
      isSerif: true,
    },
  },
  {
    value: 'luxury-atelier',
    name: 'Luxury Atelier（建筑高定画册）',
    badge: 'Flagship · 4:5 画册',
    desc: '原纱宣纸暖调 + Cormorant 衬线字阶 + 解除一屏锁高放大建筑留白 + 4:5 竖幅时尚画册大图陈列。',
    swatches: ['#fcfbf9', '#e8dfd1', '#3f3228'],
    loadDisplaySerif: true,
    specs: {
      palette: '原纱宣纸 + 深咖 #3f3228',
      typography: 'Cormorant 高定衬线体',
      grid: '4 列宽松画廊 · 4:5 竖幅大图',
      rhythm: '解除一屏锁高 · 大留白画册',
    },
    wireframe: {
      canvasHex: '#fcfbf9',
      surfaceHex: '#e8dfd1',
      cardHex: '#ffffff',
      inkHex: '#1c1917',
      mutedHex: '#6e655c',
      accentHex: '#3f3228',
      borderCss: 'rgba(63, 50, 40, 0.16)',
      radiusCss: '6px',
      columns: 4,
      aspect: '4:5',
      isSerif: true,
    },
  },
] as const satisfies readonly StorefrontThemeOption[];

export type StorefrontTheme = (typeof STOREFRONT_THEMES)[number]['value'];

export const VALID_STOREFRONT_THEMES: readonly StorefrontTheme[] = STOREFRONT_THEMES.map((t) => t.value);

const THEME_MAP = new Map<string, StorefrontThemeOption>(STOREFRONT_THEMES.map((t) => [t.value, t]));

export function isValidStorefrontTheme(value: unknown): value is StorefrontTheme {
  return typeof value === 'string' && THEME_MAP.has(value);
}

export function getStorefrontThemeOption(theme?: string): StorefrontThemeOption {
  return (theme && THEME_MAP.get(theme)) || STOREFRONT_THEMES[0];
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
    pageCanvas: 'bg-[#f3f4f6] text-[#0f1419]',
    sectionSurface: 'bg-[#e5e8ec]',
    cardContainer: 'rounded-[2px] bg-white border border-[#0f1419]/15 hover:border-[#0f1419] p-4 shadow-none',
    cardImageAspect: 'aspect-square rounded-none bg-[#e5e8ec]',
    headingFont: 'font-display font-medium tracking-[-0.015em]',
    primaryText: 'text-[#0f1419]',
    mutedText: 'text-[#5b6470]',
    primaryButton: 'bg-[#0f1419] hover:bg-[#1e293b] text-[#f3f4f6] rounded-[2px]',
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
 * Reads request-scoped context injected by ThemeProvider / Layout, falling back to previewTheme or systemSettings.
 */
export function useStorefrontTheme(locals?: App.Locals | Record<string, any>): StorefrontThemeContext {
  if (locals && (locals as any).themeContext) {
    return (locals as any).themeContext as StorefrontThemeContext;
  }
  const preview = (locals as any)?.previewTheme;
  if (isValidStorefrontTheme(preview)) {
    return resolveThemeContext(preview);
  }
  const raw = (locals as any)?.systemSettings?.storefront_theme;
  return resolveThemeContext(raw);
}
