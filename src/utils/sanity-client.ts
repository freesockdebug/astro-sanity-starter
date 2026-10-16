import { createClient, type ClientConfig, type SanityClient } from '@sanity/client';

const getEnv = (key: string): string | undefined => {
    return (import.meta.env && import.meta.env[key]) || (typeof process !== 'undefined' && process.env && process.env[key]);
};

const SANITY_PROJECT_ID = getEnv('SANITY_PROJECT_ID') || 'xvhhd8u0';
const SANITY_DATASET = getEnv('SANITY_DATASET') || 'production';
const SANITY_TOKEN = getEnv('SANITY_TOKEN');
const STACKBIT_PREVIEW = getEnv('STACKBIT_PREVIEW');
const SANITY_PREVIEW_DRAFTS = getEnv('SANITY_PREVIEW_DRAFTS');

const isDev = import.meta.env?.DEV;
const isDeployPreview = typeof process !== 'undefined' && process.env?.CONTEXT === 'deploy-preview';
const previewDrafts = STACKBIT_PREVIEW?.toLowerCase() === 'true' || SANITY_PREVIEW_DRAFTS?.toLowerCase() === 'true';

export const sanityConfig: ClientConfig = {
    projectId: SANITY_PROJECT_ID,
    dataset: SANITY_DATASET,
    useCdn: false,
    apiVersion: '2024-01-31',
    token: SANITY_TOKEN,
    perspective: isDev || isDeployPreview || previewDrafts ? 'previewDrafts' : 'published'
};

export const client = createClient(sanityConfig);

// Dev-only hot reload listener for local Node.js environment
if (isDev && typeof process !== 'undefined' && typeof process.cwd === 'function') {
    Promise.all([import('fs'), import('path'), import('url')]).then(([{ default: fs }, { default: path }, { fileURLToPath }]) => {
        try {
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            [{ client: client, types: ['page'] }].forEach(({ client, types }: { client: SanityClient; types: Array<String> }) =>
                client.listen(`*[_type in ${JSON.stringify(types)}]`, {}, { visibility: 'query' }).subscribe(async (event: any) => {
                    if (event.transition === 'appear' || event.transition === 'disappear') {
                        const filePath = path.join(__dirname, '../layouts/Layout.astro');
                        const time = new Date();
                        await fs.promises.utimes(filePath, time, time);
                    }
                })
            );
        } catch {}
    }).catch(() => {});
}
