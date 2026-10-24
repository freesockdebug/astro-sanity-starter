import {defineType} from 'sanity'
import {SUPPORTED_LANGUAGES} from './localeString'

export default defineType({
  name: 'localeMarkdown',
  title: 'Localized Markdown (多语言 Markdown 图文内容)',
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
    type: 'markdown',
    fieldset: lang.isDefault ? undefined : 'translations',
  })),
  preview: {
    select: {
      en: 'en',
      de: 'de',
      fr: 'fr',
      es: 'es',
    },
    prepare({en, de, fr, es}: any) {
      const previewText = String(en || de || fr || es || 'Empty Markdown')
      return {
        title: previewText.length > 60 ? `${previewText.slice(0, 60)}...` : previewText,
      }
    },
  },
})
