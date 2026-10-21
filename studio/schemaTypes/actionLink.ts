import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'actionLink',
  title: 'Link',
  type: 'object',
  groups: [
    {
      name: 'content',
      title: 'Content',
      default: true,
    },
  ],
  fields: [
    defineField({
      name: 'label',
      title: 'Label (链接文本 - 多语言)',
      type: 'localeString',
      options: {collapsible: true, collapsed: true},
      group: 'content',
    }),
    defineField({
      name: 'url',
      title: 'URL',
      type: 'string',
      group: 'content',
    }),
    defineField({
      name: 'ariaLabel',
      title: 'ARIA Label',
      description:
        "(Optional) Provide additional information about the element's purpose and functionality to assistive technologies, such as screen readers",
      type: 'string',
      group: 'content',
    }),
  ],
  preview: {
    select: {
      titleEn: 'label.en',
      rawLabel: 'label',
      subtitle: 'url',
    },
    prepare({titleEn, rawLabel, subtitle}) {
      const resolved = typeof rawLabel === 'string' ? rawLabel : titleEn;
      return {
        title: resolved || subtitle || 'Link',
        subtitle: subtitle || 'Link',
      }
    },
  },
})
