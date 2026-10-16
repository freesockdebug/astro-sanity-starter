import {defineField, defineType} from 'sanity'
import {CogIcon} from '@sanity/icons/Cog'
export default defineType({
  name: 'hosieryManufacturingSection',
  title: 'Manufacturing & OEM/ODM Capabilities (垂直制造与供应链实力)',
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
        'From spinning fiber selection to finished packaging, our smart manufacturing line delivers bespoke hosiery solutions with rapid prototyping and global export compliance.',
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
  ],
  preview: {
    select: {
      title: 'headline',
      btn: 'actionButtonText',
    },
    prepare({title, btn}) {
      return {
        title: title || 'Manufacturing Capabilities',
        subtitle: `🔘 按钮: ${btn || 'Request Swatch Kit'}`,
      }
    },
  },
})
