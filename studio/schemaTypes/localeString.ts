import {defineType} from 'sanity'

export const SUPPORTED_LANGUAGES = [
  {id: 'en', title: 'English (英语 - 默认)', isDefault: true},
  {id: 'de', title: 'Deutsch (德语)'},
  {id: 'fr', title: 'Français (法语)'},
  {id: 'es', title: 'Español (西班牙语)'},
]

export default defineType({
  name: 'localeString',
  title: 'Localized String',
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
    type: 'string',
    fieldset: lang.isDefault ? undefined : 'translations',
  })),
})
