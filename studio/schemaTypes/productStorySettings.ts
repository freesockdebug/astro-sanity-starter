import {defineField, defineType} from 'sanity'
import {SparklesIcon} from '@sanity/icons/Sparkles'

export default defineType({
  name: 'productStorySettings',
  title: 'Product Story & Sticky Sidebar (产品故事与吸顶栏统一配置)',
  type: 'document',
  icon: SparklesIcon,
  groups: [
    {name: 'sidebar', title: 'Sticky Sidebar Header (吸顶栏标题与徽章)', default: true},
    {name: 'credentials', title: 'Artisan Credentials (核心制造标准芯片卡片)'},
  ],
  fields: [
    defineField({
      name: 'storyBadgeText',
      title: 'Craftsmanship Badge Text (琥珀光点工艺徽章文案 - 多语言)',
      description: '留空将默认使用全站多语言字典 (en: CRAFTSMANSHIP & STORY, de: HANDWERKSKUNST & GESCHICHTE, fr: ARTISANAT & HISTOIRE, es: ARTESANÍA E HISTORIA)',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'sidebar',
    }),
    defineField({
      name: 'storyHeading',
      title: 'Editorial Story Heading (编辑级大标题文案 - 多语言)',
      description: '留空将默认使用全站多语言字典 (en: The Story Behind the Silhouette, de: Die Geschichte hinter der Silhouette, fr: L\'histoire derrière la silhouette, es: La historia detrás de la silueta)',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'sidebar',
    }),
    defineField({
      name: 'credentials',
      title: 'Artisan Credential Cards (制造标准与公信力芯片卡片列表)',
      description: '大屏左侧吸顶栏展示的核心制造公信力芯片（推荐 3~4 块）。若未添加任何卡片，系统将默认展示：1. Italian Lonati Calibration (意大利罗纳蒂机台校准)、2. Hand-Linked Seamless Finish (手工无缝对目)、3. OEKO-TEX® Standard 100 环保认证。',
      type: 'array',
      group: 'credentials',
      of: [
        {
          type: 'object',
          name: 'artisanCard',
          title: 'Artisan Credential Card (制造标准卡片)',
          fields: [
            defineField({
              name: 'title',
              title: 'Card Title (标准名称/标题 - 多语言)',
              type: 'localeString',
              options: { collapsible: true, collapsed: true },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'description',
              title: 'Card Description (细节技术与品质说明 - 多语言)',
              type: 'localeText',
              options: { collapsible: true, collapsed: true },
            }),
            defineField({
              name: 'iconType',
              title: 'Icon Type (图标预设)',
              type: 'string',
              initialValue: 'lonati',
              options: {
                list: [
                  { title: '⚙️ 意大利罗纳蒂精密针织机 (Italian Lonati Cylinder)', value: 'lonati' },
                  { title: '🪡 0.0mm 手工无缝对目 (Hand-Linked Seamless)', value: 'seamless' },
                  { title: '🌿 OEKO-TEX® 国际环保生态认证 (OEKO-TEX Standard 100)', value: 'oekotex' },
                  { title: '📐 高密度针数与弹性工程 (High-Gauge Needle Calibration)', value: 'gauge' },
                  { title: '🧵 天然高奢纤维原料 (Natural Long-Staple Fibers)', value: 'fiber' },
                  { title: '✨ 自定义 SVG 图标 (Custom SVG)', value: 'custom' },
                ],
                layout: 'radio',
              },
            }),
            defineField({
              name: 'customSvg',
              title: 'Custom SVG Icon (自定义 SVG 代码)',
              description: '当图标选为“自定义 SVG”时填入 <svg>...</svg> 代码',
              type: 'text',
              rows: 3,
              hidden: ({ parent }: any) => parent?.iconType !== 'custom',
            }),
            defineField({
              name: 'tag',
              title: 'Highlight Tag (强调微标，如 200N、0.0mm，可选 - 多语言)',
              type: 'localeString',
              options: { collapsible: true, collapsed: true },
            }),
          ],
          preview: {
            select: {
              titleEn: 'title.en',
              rawTitle: 'title',
              descEn: 'description.en',
              rawDesc: 'description',
              iconType: 'iconType',
            },
            prepare({ titleEn, rawTitle, descEn, rawDesc, iconType }: any) {
              const resolvedTitle =
                titleEn ||
                (typeof rawTitle === 'string'
                  ? rawTitle
                  : rawTitle && typeof rawTitle === 'object'
                    ? rawTitle.zh || rawTitle.de || rawTitle.fr || rawTitle.es || Object.values(rawTitle)[0]
                    : null) ||
                '未命名标准卡片';
              const resolvedDesc =
                descEn ||
                (typeof rawDesc === 'string'
                  ? rawDesc
                  : rawDesc && typeof rawDesc === 'object'
                    ? rawDesc.zh || rawDesc.de || rawDesc.fr || rawDesc.es || Object.values(rawDesc)[0]
                    : null) ||
                '制造工艺说明';
              return {
                title: String(resolvedTitle),
                subtitle: `[${iconType || 'standard'}] ${String(resolvedDesc)}`,
              };
            },
          },
        },
      ],
    }),
  ],
  preview: {
    select: {
      headingEn: 'storyHeading.en',
      rawHeading: 'storyHeading',
      badgeEn: 'storyBadgeText.en',
      rawBadge: 'storyBadgeText',
    },
    prepare({ headingEn, rawHeading, badgeEn, rawBadge }: any) {
      const resolvedHeading =
        headingEn ||
        (typeof rawHeading === 'string'
          ? rawHeading
          : rawHeading && typeof rawHeading === 'object'
            ? rawHeading.zh || rawHeading.de || rawHeading.fr || rawHeading.es || Object.values(rawHeading)[0]
            : null) ||
        'The Story Behind the Silhouette';
      const resolvedBadge =
        badgeEn ||
        (typeof rawBadge === 'string'
          ? rawBadge
          : rawBadge && typeof rawBadge === 'object'
            ? rawBadge.zh || rawBadge.de || rawBadge.fr || rawBadge.es || Object.values(rawBadge)[0]
            : null) ||
        'CRAFTSMANSHIP & STORY';
      return {
        title: `💎 ${String(resolvedHeading)}`,
        subtitle: `徽章: ${String(resolvedBadge)} (全局左侧吸顶栏配置)`,
      };
    },
  },
})
