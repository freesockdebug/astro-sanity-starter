import {defineType} from 'sanity'
import {SUPPORTED_LANGUAGES} from './localeString'

export default defineType({
  name: 'localeText',
  title: 'Localized Text',
  type: 'object',
  options: {
    collapsible: true,
    collapsed: false,
  },
  fieldsets: [
    {
      title: 'Translations (多语言翻译)',
      name: 'translations',
      options: {collapsible: true, collapsed: true},
    },
  ],
  fields: SUPPORTED_LANGUAGES.map((lang) => ({
    name: lang.id,
    title: lang.title,
    type: 'text',
    rows: 2,
    fieldset: lang.isDefault ? undefined : 'translations',
    validation: (Rule: any) => (lang.isDefault ? Rule.required() : Rule.optional()),
  })),
})
