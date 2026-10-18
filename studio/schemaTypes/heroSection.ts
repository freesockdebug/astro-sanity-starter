import {defineField, defineType} from 'sanity'
import {StarIcon} from '@sanity/icons/Star'
export default defineType({
  name: 'heroSection',
  title: '🌟 主视觉首屏 (Hero Showcase)',
  type: 'object',
  icon: StarIcon,
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
      description: '【推荐后台备注】在页面版块列表中直观显示此名字（如：首页首屏、春季品牌主图等）',
      type: 'string',
    }),
    defineField({
      name: 'superTitle',
      title: 'Super Title (顶部眉标/类别胶囊文字)',
      type: 'string',
      initialValue: 'B2B Manufacturing & Private Label Atelier',
    }),
    defineField({
      name: 'headline',
      title: 'Main Headline (主标题 - 支持句号分隔两段灰度对比)',
      type: 'string',
      description: '示例：Engineered Elegance. 200-Needle Micro Weave.（第二句将自动渲染为 Apple 标志性浅灰色）',
      initialValue: 'Engineered Elegance. 200-Needle Micro Weave.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'subline',
      title: 'Subline / Tagline (核心叙事副标题)',
      type: 'text',
      rows: 2,
      initialValue:
        'Knitted on Italian Lonati machinery with 100% artisan hand-linked seamless toes. Built for modern private-label brands and luxury retail.',
    }),
    defineField({
      name: 'heroImage',
      title: 'Hero Cover Image (居中超大高精微距大图)',
      type: 'image',
      options: {hotspot: true},
    }),
    defineField({
      name: 'showPrimaryButton',
      title: 'Show Primary Button (是否显示主按钮)',
      description: '控制黑色主按钮（如 Request Swatch Kit）是否显示',
      type: 'boolean',
      initialValue: false,
      fieldset: 'buttons',
    }),
    defineField({
      name: 'primaryButtonText',
      title: 'Primary Button Text (主按钮文字)',
      type: 'string',
      initialValue: 'Request Swatch Kit',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'primaryButtonUrl',
      title: 'Primary Button Link (主按钮链接)',
      type: 'string',
      initialValue: '#inquiry',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'swatchSku',
      title: 'Custom Swatch Kit SKU (本区块专属样卡编号)',
      description: '指定本版块主按钮申领时装载的样卡 SKU（留空则默认继承 RFQ Settings 中的官方通用 SKU）',
      type: 'string',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'showSecondaryButton',
      title: 'Show Secondary Button (是否显示次按钮)',
      description: '控制浅灰色次按钮（如 Explore Capsule Lines）是否显示',
      type: 'boolean',
      initialValue: true,
      fieldset: 'buttons',
    }),
    defineField({
      name: 'secondaryButtonText',
      title: 'Secondary Button Text (次按钮文字)',
      type: 'string',
      initialValue: 'Explore Capsule Lines',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'secondaryButtonUrl',
      title: 'Secondary Button Link (次按钮链接)',
      type: 'string',
      initialValue: '#collections',
      fieldset: 'buttons',
    }),
  ],
  preview: {
    select: {
      headline: 'headline',
      adminLabel: 'adminLabel',
      btn: 'primaryButtonText',
      showBtn: 'showPrimaryButton',
      media: 'heroImage',
    },
    prepare({headline, adminLabel, btn, showBtn, media}) {
      const name = adminLabel ? adminLabel : (headline ? headline.split('.')[0] : '未命名首屏');
      return {
        title: `🌟 [主视觉首屏] ${name}`,
        subtitle: `类型: heroSection · 主按钮: ${showBtn ? (btn || '开启') : '隐藏'} · ${headline || ''}`,
        media,
      }
    },
  },
})
