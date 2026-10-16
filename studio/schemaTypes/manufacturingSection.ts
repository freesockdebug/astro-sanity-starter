import {defineField, defineType} from 'sanity'
import {CogIcon} from '@sanity/icons/Cog'
export default defineType({
  name: 'manufacturingSection',
  title: '🏭 制造实力与工坊能力 (Manufacturing & Capabilities)',
  type: 'object',
  icon: CogIcon,
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
      description: '【推荐后台备注】在页面版块列表中直观显示此名字（如：工厂产能介绍、BSCI验厂等）',
      type: 'string',
    }),
    defineField({
      name: 'badge',
      title: 'Badge (上标标签)',
      type: 'string',
      initialValue: 'OEM / ODM & Private Label',
    }),
    defineField({
      name: 'headline',
      title: 'Headline (标题)',
      type: 'string',
      initialValue: 'Vertical Knitting Infrastructure',
    }),
    defineField({
      name: 'subline',
      title: 'Subline (说明文案)',
      type: 'text',
      rows: 2,
      initialValue:
        'From spinning fiber selection to finished packaging, our smart manufacturing line delivers bespoke apparel solutions with rapid prototyping and global export compliance.',
    }),
    defineField({
      name: 'capabilities',
      title: 'Capabilities List (制造实力项目卡片)',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'title', title: 'Title (项目标题)', type: 'string'},
            {name: 'description', title: 'Description (说明)', type: 'text', rows: 2},
          ],
          preview: {
            select: {title: 'title', subtitle: 'description'},
          },
        },
      ],
      initialValue: [
        {
          _key: 'c1',
          title: '350+ Lonati Cylinders',
          description:
            'State-of-the-art Italian single and double cylinder electronic machines capable of 96N to 200N gauge high-density knitting.',
        },
        {
          _key: 'c2',
          title: '72h Sample Prototyping',
          description:
            'CAD digital patterning to custom physical sample dispatched within 72 hours with yarn lab dip verification.',
        },
        {
          _key: 'c3',
          title: 'Full Private Labeling',
          description:
            'Jacquard logos, micro embroidery, silicone sole grippers, custom Pantone dyeing, and FSC certified retail packaging.',
        },
        {
          _key: 'c4',
          title: 'Zero-Defect Audit',
          description:
            '100% optical camera inspection and manual hand stretch testing. Fully Sedex, BSCI, and ISO9001 compliant.',
        },
      ],
    }),
    defineField({
      name: 'showActionButton',
      title: 'Show Action Button (是否显示操作按钮)',
      description: '控制制造基础设施版块底部的操作按钮是否显示',
      type: 'boolean',
      initialValue: false,
      fieldset: 'buttons',
    }),
    defineField({
      name: 'actionButtonText',
      title: 'Action Button Text (操作按钮文字)',
      type: 'string',
      initialValue: 'Request Swatch Kit',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'actionButtonUrl',
      title: 'Action Button URL (操作按钮跳转链接)',
      type: 'string',
      initialValue: '#inquiry',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'swatchSku',
      title: 'Custom Swatch Kit SKU (本区块专属样卡编号)',
      description: '指定本制造基础设施版块按钮申领时装载的样卡 SKU（留空则默认继承 RFQ Settings 中的官方通用 SKU）',
      type: 'string',
      fieldset: 'buttons',
    }),
  ],
  preview: {
    select: {
      headline: 'headline',
      adminLabel: 'adminLabel',
      badge: 'badge',
      btn: 'actionButtonText',
    },
    prepare({headline, adminLabel, badge, btn}) {
      const name = adminLabel ? adminLabel : (headline || '制造实力基础设施');
      return {
        title: `🏭 [制造实力] ${name}`,
        subtitle: `类型: manufacturingSection · 标签: ${badge || 'OEM/ODM Capabilities'}`,
      }
    },
  },
})
