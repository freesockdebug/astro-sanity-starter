import {defineField, defineType} from 'sanity'
import {StarIcon} from '@sanity/icons/Star'
export default defineType({
  name: 'hosieryHeroSection',
  title: 'Hosiery Hero Showcase (Apple 居中沉浸巨幕)',
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
      name: 'superTitle',
      title: 'Super Title (顶部眉标/类别胶囊文字)',
      type: 'string',
      initialValue: 'B2B Hosiery Manufacturing & Private Label',
    }),
    defineField({
      name: 'headline',
      title: 'Main Headline (主标题 - 支持句号分隔两段灰度对比)',
      type: 'string',
      description: '示例：Engineered Elegance. 140-Needle Micro Weave.（第二句将自动渲染为 Apple 标志性浅灰色）',
      initialValue: 'Engineered Elegance. 140-Needle Micro Weave.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'subline',
      title: 'Subline / Tagline (核心工艺叙事副标题)',
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
      title: 'headline',
      btn: 'primaryButtonText',
      media: 'heroImage',
    },
    prepare({title, btn, media}) {
      return {
        title: title || 'Hosiery Hero Showcase',
        subtitle: `🔘 按钮: ${btn || 'Request Swatch Kit'}`,
        media,
      }
    },
  },
})
