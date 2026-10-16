import {defineField, defineType} from 'sanity'
import {ProjectsIcon} from '@sanity/icons/Projects'
export default defineType({
  name: 'productShowcaseSection',
  title: '🗂️ 精选产品展廊 (Product Showcase)',
  type: 'object',
  icon: ProjectsIcon,
  fieldsets: [
    {
      name: 'buttons',
      title: '🔘 Action Buttons (按钮元素配置)',
      options: {collapsible: true, collapsed: false},
    },
  ],
  fields: [
    defineField({
      name: 'adminLabel',
      title: 'Admin Label (版块管理别名 / 备注)',
      description: '【推荐后台备注】在页面版块列表中直观显示此名字（如：首页订货胶囊、桑蚕丝专区等）',
      type: 'string',
    }),
    defineField({
      name: 'badge',
      title: 'Badge Label (上标标签)',
      type: 'string',
      initialValue: 'Capsule Catalog 2026',
    }),
    defineField({
      name: 'title',
      title: 'Title (版块标题)',
      type: 'string',
      initialValue: 'Ready-to-Order Line Sheets',
    }),
    defineField({
      name: 'subtitle',
      title: 'Subtitle (简介说明)',
      type: 'text',
      rows: 2,
      initialValue:
        'Proprietary silhouettes developed for white-labeling, brand customization, and low-MOQ rapid wholesale reordering.',
    }),
    defineField({
      name: 'products',
      title: 'Products to Showcase (选入展示的款式)',
      description: '在此添加或拖拽排序需要在此版块展示的款式。只有添加到此列表的款式才会展示。',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [{type: 'product'}],
        },
      ],
    }),
    defineField({
      name: 'showActionButton',
      title: 'Show Action Button (是否显示右上角操作按钮)',
      description: '控制产品展示区右上角操作按钮是否显示',
      type: 'boolean',
      initialValue: false,
      fieldset: 'buttons',
    }),
    defineField({
      name: 'actionButtonText',
      title: 'Action Button Text (右上角操作按钮文字)',
      type: 'string',
      initialValue: 'Request Swatch Kit',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'actionButtonUrl',
      title: 'Action Button URL (右上角操作按钮链接)',
      type: 'string',
      initialValue: '#inquiry',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'swatchSku',
      title: 'Custom Swatch Kit SKU (本区块专属样卡编号)',
      description: '指定本产品展示版块按钮申领时装载的样卡 SKU（留空则默认继承 RFQ Settings 中的官方通用 SKU）',
      type: 'string',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'showCardQuoteButton',
      title: 'Show Card Quote Button (是否显示卡片 Quote 询价按钮)',
      description: '控制每个款式卡片右下角的黑色“+ Quote”询价按钮是否显示',
      type: 'boolean',
      initialValue: true,
      fieldset: 'buttons',
    }),
    defineField({
      name: 'cardDetailsButtonText',
      title: 'Card Details Button Text (卡片左侧详情按钮文字)',
      type: 'string',
      initialValue: 'View Gallery & Specs',
      fieldset: 'buttons',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      adminLabel: 'adminLabel',
      badge: 'badge',
      products: 'products',
    },
    prepare({title, adminLabel, badge, products}) {
      const count = Array.isArray(products) ? products.length : 0;
      const name = adminLabel ? adminLabel : (title || '精选款式画册');
      return {
        title: `🗂️ [产品展廊] ${name}`,
        subtitle: `类型: productShowcaseSection · 款式数: ${count} 款 · 标签: ${badge || 'Capsule Catalog'}`,
      }
    },
  },
})
