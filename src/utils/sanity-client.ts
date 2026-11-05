import { createClient, type ClientConfig, type SanityClient } from '@sanity/client';
import { getRuntimeEnv } from './auth';
import { getActiveProfiler } from './profiler';

const SANITY_PROJECT_ID = getRuntimeEnv('SANITY_PROJECT_ID');
if (!SANITY_PROJECT_ID) {
    throw new Error('Missing required environment variable: SANITY_PROJECT_ID');
}
const SANITY_DATASET = getRuntimeEnv('SANITY_DATASET') || 'production';
const SANITY_TOKEN = getRuntimeEnv('SANITY_TOKEN');
const STACKBIT_PREVIEW = getRuntimeEnv('STACKBIT_PREVIEW');
const SANITY_PREVIEW_DRAFTS = getRuntimeEnv('SANITY_PREVIEW_DRAFTS');

const isDev = Boolean(import.meta.env?.DEV || (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development'));
const isDeployPreview = typeof process !== 'undefined' && process.env?.CONTEXT === 'deploy-preview';
const previewDrafts = STACKBIT_PREVIEW?.toLowerCase() === 'true' || SANITY_PREVIEW_DRAFTS?.toLowerCase() === 'true';
const isDraftMode = Boolean(SANITY_TOKEN && (isDeployPreview || previewDrafts));

export const sanityConfig: ClientConfig = {
    projectId: SANITY_PROJECT_ID,
    dataset: SANITY_DATASET,
    useCdn: !isDraftMode,
    apiVersion: '2024-01-31',
    // Only pass token in explicit draft/preview mode. Public published requests without token use the 5,000,000 free requests/mo API CDN.
    token: isDraftMode ? SANITY_TOKEN : undefined,
    perspective: isDraftMode ? 'previewDrafts' : 'published'
};

export const client = createClient(sanityConfig);

// Public CDN fallback client if a configured SANITY_TOKEN is expired or unauthorized (401)
const publicClient = createClient({
    projectId: SANITY_PROJECT_ID,
    dataset: SANITY_DATASET,
    useCdn: true,
    apiVersion: '2024-01-31',
    token: undefined,
    perspective: 'published'
});

let usePublicFallback = false;

// Telemetry & Audit Logger to track exact API call volume and CDN status
let apiCallCount = 0;
const rawFetch = client.fetch.bind(client);
const publicFetch = publicClient.fetch.bind(publicClient);
(client as any).fetch = async (query: string, ...rest: any[]) => {
    apiCallCount++;
    const querySummary = typeof query === 'string' 
        ? query.replace(/[\r\n\s]+/g, ' ').trim().slice(0, 90)
        : 'dynamic query';
    const isUsingCdn = usePublicFallback || (sanityConfig.useCdn && !sanityConfig.token);
    const endpointType = isUsingCdn ? 'API CDN (5,000,000 Free/mo)' : 'LIVE API (Paid Quota)';
    if (isDev) {
        console.log(`[SANITY API CALL #${apiCallCount}] [${endpointType}] ${querySummary}...`);
    }

    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
        if (usePublicFallback) {
            return await (publicFetch as any)(query, ...rest);
        }
        try {
            return await (rawFetch as any)(query, ...rest);
        } catch (err: any) {
            if (err?.statusCode === 401 || err?.status === 401 || String(err?.message || '').includes('Unauthorized')) {
                usePublicFallback = true;
                return await (publicFetch as any)(query, ...rest);
            }
            throw err;
        }
    } finally {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const dur = Math.max(0, Math.round(now - t0));
        getActiveProfiler()?.addSpan('sanity', dur);
    }
};

