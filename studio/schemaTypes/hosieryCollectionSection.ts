import {defineField, defineType} from 'sanity'
import {ProjectsIcon} from '@sanity/icons/Projects'
export default defineType({
  name: 'hosieryCollectionSection',
  title: 'Hosiery Capsule Collection (胶囊系列展廊)',
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
      description: '控制胶囊系列产品展示区右上角操作按钮是否显示',
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
      btn: 'actionButtonText',
    },
    prepare({title, btn}) {
      return {
        title: title || 'Capsule Collections',
        subtitle: `🔘 按钮: ${btn || 'Request Swatch Kit'}`,
      }
    },
  },
})
