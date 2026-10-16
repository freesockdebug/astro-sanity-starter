import {defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID ?? process.env.SANITY_PROJECT_ID ?? 'xvhhd8u0',
    dataset: process.env.SANITY_STUDIO_DATASET ?? process.env.SANITY_DATASET ?? 'production',
  },
})
