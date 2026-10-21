import {defineField, defineType} from 'sanity'

export default defineType({
  name: 'actionButton',
  title: 'Button',
  type: 'object',
  groups: [
    {
      name: 'content',
      title: 'Content',
      default: true,
    },
    {
      name: 'styles',
      title: 'Styles',
    },
  ],
  fields: [
    defineField({
      name: 'label',
      title: 'Label (按钮文本 - 多语言)',
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
    defineField({
      name: 'theme',
      title: 'Theme',
      description: 'The color theme of call-to-action button',
      type: 'string',
      options: {
        list: [
          {title: 'Primary', value: 'primary'},
          {title: 'Secondary', value: 'secondary'},
          {title: 'Accent', value: 'accent'},
          {title: 'Neutral', value: 'neutral'},
        ],
      },
      initialValue: 'primary',
      group: 'styles',
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
        title: resolved || subtitle || 'Button',
        subtitle: subtitle || 'Button',
      }
    },
  },
})
