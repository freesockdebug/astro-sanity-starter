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
    prepare({titleEn, rawLabel, subtitle}: any) {
      const resolved =
        titleEn ||
        (typeof rawLabel === 'string'
          ? rawLabel
          : rawLabel && typeof rawLabel === 'object'
            ? rawLabel.zh || rawLabel.de || rawLabel.fr || rawLabel.es || Object.values(rawLabel)[0]
            : null) ||
        subtitle ||
        'Link'
      return {
        title: String(resolved),
        subtitle: subtitle ? String(subtitle) : 'Link',
      }
    },
  },
})
