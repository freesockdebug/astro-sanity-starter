import {defineCliConfig} from 'sanity/cli'

const projectId = process.env.SANITY_STUDIO_PROJECT_ID || process.env.SANITY_PROJECT_ID
if (!projectId) {
  throw new Error('Missing required environment variable: SANITY_STUDIO_PROJECT_ID or SANITY_PROJECT_ID')
}

export default defineCliConfig({
  api: {
    projectId,
    dataset: process.env.SANITY_STUDIO_DATASET || process.env.SANITY_DATASET || 'production',
  },
})
