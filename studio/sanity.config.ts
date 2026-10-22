import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { schemaTypes } from './schemaTypes'
import { markdownSchema } from 'sanity-plugin-markdown'
import { deskStructure, defaultDocumentNode } from './deskStructure'
import { createPurgeCacheAction } from './actions/purgeCacheAction'

const env = (typeof process !== 'undefined' && process.env ? process.env : {}) as Record<string, string | undefined>
const metaEnv = (typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env : {}) as Record<string, string | undefined>

export default defineConfig({
  name: 'default',
  title: "Content Studio",

  projectId: (env.SANITY_STUDIO_PROJECT_ID ?? env.SANITY_PROJECT_ID ?? metaEnv.PUBLIC_SANITY_PROJECT_ID ?? 'xvhhd8u0') as string,
  dataset: (env.SANITY_STUDIO_DATASET ?? env.SANITY_DATASET ?? metaEnv.PUBLIC_SANITY_DATASET ?? 'production') as string,

  plugins: [
    structureTool({
      structure: deskStructure,
      defaultDocumentNode,
    }),
    visionTool(),
    markdownSchema(),
  ],

  schema: {
    types: schemaTypes,
  },

  document: {
    actions: (prev, context) => {
      // 在产品、页面、产品设置、全站配置中加入一键清除缓存 Action
      if (['product', 'page', 'catalogSettings', 'siteConfig'].includes(context.schemaType)) {
        return [...prev, createPurgeCacheAction()]
      }
      return prev
    },
  },
})
