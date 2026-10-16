import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { schemaTypes } from './schemaTypes'
import { markdownSchema } from 'sanity-plugin-markdown'
import { deskStructure } from './deskStructure'

export default defineConfig({
  name: 'default',
  title: "Content Studio",

  projectId: (process.env.SANITY_STUDIO_PROJECT_ID ?? process.env.SANITY_PROJECT_ID ?? 'xvhhd8u0') as string,
  dataset: (process.env.SANITY_STUDIO_DATASET ?? process.env.SANITY_DATASET ?? 'production') as string,

  plugins: [structureTool({ structure: deskStructure }), visionTool(), markdownSchema()],

  schema: {
    types: schemaTypes,
  },
})
