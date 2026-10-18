import { createClient, type ClientConfig, type SanityClient } from '@sanity/client';

const getEnv = (key: string): string | undefined => {
    return (import.meta.env && import.meta.env[key]) || (typeof process !== 'undefined' && process.env && process.env[key]);
};

const SANITY_PROJECT_ID = getEnv('SANITY_PROJECT_ID') || 'xvhhd8u0';
const SANITY_DATASET = getEnv('SANITY_DATASET') || 'production';
const SANITY_TOKEN = getEnv('SANITY_TOKEN');
const STACKBIT_PREVIEW = getEnv('STACKBIT_PREVIEW');
const SANITY_PREVIEW_DRAFTS = getEnv('SANITY_PREVIEW_DRAFTS');

const isDev = Boolean(import.meta.env?.DEV || (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development'));
const isDeployPreview = typeof process !== 'undefined' && process.env?.CONTEXT === 'deploy-preview';
const previewDrafts = STACKBIT_PREVIEW?.toLowerCase() === 'true' || SANITY_PREVIEW_DRAFTS?.toLowerCase() === 'true';
const isDraftMode = isDev || isDeployPreview || previewDrafts;

export const sanityConfig: ClientConfig = {
    projectId: SANITY_PROJECT_ID,
    dataset: SANITY_DATASET,
    useCdn: !isDraftMode,
    apiVersion: '2024-01-31',
    // Only pass token in draft/preview mode. Public published requests without token use the 5,000,000 free requests/mo API CDN.
    token: isDraftMode ? SANITY_TOKEN : undefined,
    perspective: isDraftMode ? 'previewDrafts' : 'published'
};

export const client = createClient(sanityConfig);

// Telemetry & Audit Logger to track exact API call volume and CDN status
let apiCallCount = 0;
const rawFetch = client.fetch.bind(client);
(client as any).fetch = async (query: string, ...rest: any[]) => {
    apiCallCount++;
    const querySummary = typeof query === 'string' 
        ? query.replace(/[\r\n\s]+/g, ' ').trim().slice(0, 90)
        : 'dynamic query';
    const endpointType = sanityConfig.useCdn && !sanityConfig.token ? 'API CDN (5,000,000 Free/mo)' : 'LIVE API (Paid Quota)';
    console.log(`[SANITY API CALL #${apiCallCount}] [${endpointType}] ${querySummary}...`);
    return (rawFetch as any)(query, ...rest);
};

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
