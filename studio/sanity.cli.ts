import {defineCliConfig} from 'sanity/cli'

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID || 'xvhhd8u0'

export default defineCliConfig({
  api: {
    projectId,
    dataset: process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production',
  },
})
