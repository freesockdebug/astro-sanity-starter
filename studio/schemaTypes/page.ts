import {defineField, defineType} from 'sanity'
import {ComposeIcon} from '@sanity/icons/Compose'
export default defineType({
  name: 'page',
  title: 'Page',
  description: 'A page with dynamic list of sections',
  type: 'document',
  icon: ComposeIcon,
  groups: [
    {
      name: 'content',
      title: 'Content',
      default: true,
    },
    {
      name: 'seo',
      title: 'SEO',
    },
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Title (页面标题 - 多语言)',
      type: 'localeString',
      group: 'content',
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      description: 'Should not contain a leading slash and must contain a trailing slash.',
      type: 'slug',
      options: {
        source: (doc: any) =>
          typeof doc?.title === 'object' && doc?.title ? (doc.title.en || Object.values(doc.title)[0]) : doc?.title,
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
      group: 'content',
    }),
    defineField({
      name: 'sections',
      title: 'Sections (页面版块列表)',
      description: '本页面的内容版块列表，可随意上下拖拽排序或增删。列表中已清晰标明每个版块的【名称】与【类型】。',
      type: 'array',
      of: [
        {type: 'heroSection'},
        {type: 'productShowcaseSection'},
        {type: 'featureMatrixSection'},
        {type: 'manufacturingSection'},
        {type: 'inquirySection'},
        {type: 'customSection'},
      ],
      group: 'content',
    }),
    defineField({
      name: 'metaTitle',
      title: 'SEO Meta Title (网页标题 - 多语言)',
      description: 'A page title for SEO and social sharing. Ideally between 15 and 70 characters.',
      type: 'localeString',
      group: 'seo',
    }),
    defineField({
      name: 'addTitleSuffix',
      title: 'Add title suffix',
      description:
        'If enabled, the title suffix defined in the site configuration is appended to the title tag of this page.',
      type: 'boolean',
      initialValue: true,
      group: 'seo',
    }),
    defineField({
      name: 'metaDescription',
      title: 'SEO Meta Description (网页描述 - 多语言)',
      description:
        'A short paragraph for SEO and social sharing. Ideally between 70 and 160 characters.',
      type: 'localeText',
      group: 'seo',
    }),
    defineField({
      name: 'socialImage',
      title: 'Image',
      description: 'Open graph image used in social sharing.',
      type: 'image',
      group: 'seo',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'slug.current',
    },
    prepare({title, subtitle}) {
      return {
        title: title,
        subtitle: subtitle ? subtitle : '',
      }
    },
  },
})
