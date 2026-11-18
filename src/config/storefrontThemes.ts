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
    name: 'Luxury Atelier（GWENVENNI 建筑高定）',
    badge: 'New · 品牌重塑',
    desc: '原纱宣纸暖调 + Cormorant 衬线字阶 + 解除一屏锁高与 Snap 放大建筑留白 + 4:5 无框画廊陈列（清除橙色/绿徽章杂讯）。',
    swatches: ['#fcfbf9', '#f4f0ea', '#3f3228'],
    loadDisplaySerif: true,
  },
] as const satisfies readonly StorefrontThemeOption[];

export type StorefrontTheme = (typeof STOREFRONT_THEMES)[number]['value'];

export const VALID_STOREFRONT_THEMES: readonly StorefrontTheme[] = STOREFRONT_THEMES.map((t) => t.value);

const THEME_MAP = new Map<string, StorefrontThemeOption>(STOREFRONT_THEMES.map((t) => [t.value, t]));

export function isValidStorefrontTheme(value: string): value is StorefrontTheme {
  return THEME_MAP.has(value);
}

export function needsDisplaySerifFont(theme?: string): boolean {
  return Boolean(theme && THEME_MAP.get(theme)?.loadDisplaySerif);
}
