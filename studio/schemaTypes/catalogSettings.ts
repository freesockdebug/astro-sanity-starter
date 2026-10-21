import {defineField, defineType} from 'sanity'
import {MasterDetailIcon} from '@sanity/icons/MasterDetail'

export default defineType({
  name: 'catalogSettings',
  title: 'Catalog Hall Settings (产品大厅页面配置)',
  type: 'document',
  icon: MasterDetailIcon,
  groups: [
    {name: 'header', title: 'Hero Header (顶部标题与标语)', default: true},
    {name: 'seo', title: 'SEO & Sharing (网页标题与描述)'},
    {name: 'filters', title: 'Search & Filters (筛选与搜索文案)'},
    {name: 'notices', title: 'Notices & Empty State (提示文案)'},
  ],
  fields: [
    // Header Group
    defineField({
      name: 'badgeText',
      title: 'Badge Text (顶部微标胶囊文案)',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'header',
    }),
    defineField({
      name: 'title',
      title: 'Main Title (大厅主标题)',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'header',
    }),
    defineField({
      name: 'subtitle',
      title: 'Subtitle / Description (大厅副标题描述)',
      type: 'localeText',
      options: { collapsible: true, collapsed: true },
      group: 'header',
    }),

    // SEO Group
    defineField({
      name: 'metaTitle',
      title: 'Browser Tab Title (SEO 网页标题)',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'seo',
    }),
    defineField({
      name: 'metaDescription',
      title: 'Meta Description (SEO 搜索引擎描述)',
      type: 'localeText',
      options: { collapsible: true, collapsed: true },
      group: 'seo',
    }),

    // Filters Group
    defineField({
      name: 'searchPlaceholder',
      title: 'Search Input Placeholder (搜索框提示词)',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'filters',
    }),
    defineField({
      name: 'allSilhouettesLabel',
      title: 'All Categories Tab Label ("全部" 选项卡文案)',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'filters',
    }),

    // Notices Group
    defineField({
      name: 'endOfCatalogText',
      title: 'End of Catalog Notice (触底提示文案)',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'notices',
    }),
    defineField({
      name: 'emptyStateHeading',
      title: 'Empty Search Heading (未搜索到结果大标题)',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'notices',
    }),
    defineField({
      name: 'emptyStateText',
      title: 'Empty Search Description (未搜索到结果描述文案)',
      type: 'localeText',
      options: { collapsible: true, collapsed: true },
      group: 'notices',
    }),
  ],
  preview: {
    select: {
      titleEn: 'title.en',
      rawTitle: 'title',
      subtitleEn: 'subtitle.en',
      rawSubtitle: 'subtitle',
    },
    prepare({titleEn, rawTitle, subtitleEn, rawSubtitle}: any) {
      const resolvedTitle =
        titleEn ||
        (typeof rawTitle === 'string'
          ? rawTitle
          : rawTitle && typeof rawTitle === 'object'
            ? rawTitle.zh || rawTitle.de || rawTitle.fr || rawTitle.es || Object.values(rawTitle)[0]
            : null) ||
        'Catalog Hall Settings';
      const resolvedSubtitle =
        subtitleEn ||
        (typeof rawSubtitle === 'string'
          ? rawSubtitle
          : rawSubtitle && typeof rawSubtitle === 'object'
            ? rawSubtitle.zh || rawSubtitle.de || rawSubtitle.fr || rawSubtitle.es || Object.values(rawSubtitle)[0]
            : null) ||
        'Product Archive & Filters';
      return {
        title: String(resolvedTitle),
        subtitle: String(resolvedSubtitle),
      }
    },
  },
})
