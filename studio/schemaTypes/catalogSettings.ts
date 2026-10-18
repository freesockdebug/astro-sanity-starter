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
      type: 'string',
      initialValue: 'B2B Production Archive · 2026 Ready-To-Order',
      group: 'header',
    }),
    defineField({
      name: 'title',
      title: 'Main Title (大厅主标题)',
      type: 'string',
      initialValue: 'Product Catalog & Line Sheets',
      group: 'header',
    }),
    defineField({
      name: 'subtitle',
      title: 'Subtitle / Description (大厅副标题描述)',
      type: 'text',
      rows: 2,
      initialValue: 'Select proprietary silhouettes engineered for white-label branding, customized colorways, and rapid low-MOQ reordering.',
      group: 'header',
    }),

    // SEO Group
    defineField({
      name: 'metaTitle',
      title: 'Browser Tab Title (SEO 网页标题)',
      type: 'string',
      initialValue: 'Complete Product Archive & Line Sheets | Gwenvenni B2B Atelier',
      group: 'seo',
    }),
    defineField({
      name: 'metaDescription',
      title: 'Meta Description (SEO 搜索引擎描述)',
      type: 'text',
      rows: 2,
      initialValue: 'Explore our full ready-to-order capsule silhouettes, technical knit compositions, and low-MOQ rapid wholesale reordering archive.',
      group: 'seo',
    }),

    // Filters Group
    defineField({
      name: 'searchPlaceholder',
      title: 'Search Input Placeholder (搜索框提示词)',
      type: 'string',
      initialValue: 'Search silhouette, SKU...',
      group: 'filters',
    }),
    defineField({
      name: 'allSilhouettesLabel',
      title: 'All Categories Tab Label ("全部" 选项卡文案)',
      type: 'string',
      initialValue: 'All Silhouettes',
      group: 'filters',
    }),

    // Notices Group
    defineField({
      name: 'endOfCatalogText',
      title: 'End of Catalog Notice (触底提示文案)',
      type: 'string',
      initialValue: 'End of Catalog · All Products Loaded',
      group: 'notices',
    }),
    defineField({
      name: 'emptyStateHeading',
      title: 'Empty Search Heading (未搜索到结果大标题)',
      type: 'string',
      initialValue: 'No matching silhouettes found',
      group: 'notices',
    }),
    defineField({
      name: 'emptyStateText',
      title: 'Empty Search Description (未搜索到结果描述文案)',
      type: 'text',
      rows: 2,
      initialValue: "We couldn't find any products matching your current filters. Try searching for other fiber blends or reset categories.",
      group: 'notices',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'subtitle',
    },
  },
})
