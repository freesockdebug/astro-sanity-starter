import {defineField, defineType} from 'sanity'
import {EnvelopeIcon} from '@sanity/icons/Envelope'
export default defineType({
  name: 'hosieryInquirySection',
  title: 'B2B Swatch & RFQ Section (样卡申领与询盘区)',
  type: 'object',
  icon: EnvelopeIcon,
  fieldsets: [
    {
      name: 'buttons',
      title: '🔘 Submit Button (提交按钮配置)',
      options: {collapsible: true, collapsed: false},
    },
  ],
  fields: [
    defineField({
      name: 'badge',
      title: 'Badge (上标标签)',
      type: 'string',
      initialValue: 'B2B Sample Room',
    }),
    defineField({
      name: 'headline',
      title: 'Headline (标题)',
      type: 'string',
      initialValue: 'Request Your Curated Swatch Kit',
    }),
    defineField({
      name: 'subline',
      title: 'Subline (说明文案)',
      type: 'text',
      rows: 2,
      initialValue:
        'Feel the micron-level hand feel in person. Verified fashion labels, buying offices, and independent designers receive curated swatch books dispatched within 48 hours.',
    }),
    defineField({
      name: 'showSection',
      title: 'Show This Section (是否显示此样卡询盘整个版块)',
      type: 'boolean',
      initialValue: true,
      fieldset: 'buttons',
    }),
    defineField({
      name: 'showButton',
      title: 'Show Submit Button (是否显示申领样卡按钮)',
      description: '控制区块内部的“Request Swatch Kit”提交按钮是否显示',
      type: 'boolean',
      initialValue: false,
      fieldset: 'buttons',
    }),
    defineField({
      name: 'buttonText',
      title: 'Submit Button Text (提交按钮文字)',
      type: 'string',
      initialValue: 'Request Swatch Kit',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'swatchSku',
      title: 'Custom Swatch Kit SKU (本区块专属样卡编号)',
      description: '指定本版块申领时装载的样卡 SKU（留空则默认继承 RFQ Settings 中的官方通用 SKU）',
      type: 'string',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'categories',
      title: 'Sample Category Checkboxes (样卡可选品类勾选项 - 纯英文)',
      description: 'Apple 规范：请使用纯英文命名（如 Mulberry Silk、Cashmere-Silk），不要添加中文括号注释',
      type: 'array',
      of: [{type: 'string'}],
      initialValue: [
        'Double Ruffle Lace',
        'Mulberry Silk',
        'Cashmere-Silk',
        '15D Sheer Tights',
      ],
    }),
    defineField({
      name: 'successTitle',
      title: 'Success Notice Title (提交成功提示主标题)',
      type: 'string',
      initialValue: 'Swatch Request Confirmed!',
    }),
    defineField({
      name: 'successMessage',
      title: 'Success Notice Message (提交成功提示说明文案)',
      type: 'text',
      rows: 2,
      initialValue:
        'Our international account manager has received your inquiry and will dispatch the swatch dossier via DHL Express within 48 hours.',
    }),
  ],
  preview: {
    select: {
      title: 'headline',
      btn: 'buttonText',
    },
    prepare({title, btn}) {
      return {
        title: title || 'B2B Swatch & RFQ',
        subtitle: `🔘 提交按钮: ${btn || 'Request Swatch Kit'}`,
      }
    },
  },
})
