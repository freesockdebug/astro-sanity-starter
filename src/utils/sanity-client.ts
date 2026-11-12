// Zero-dependency Native Edge Sanity Client (Replaces @sanity/client & RxJS bundle)
import { getRuntimeEnv } from './auth';
import { getActiveProfiler } from './profiler';

export interface SanityClientConfig {
  projectId: string;
  dataset: string;
  apiVersion: string;
  useCdn: boolean;
  token?: string;
  perspective?: string;
}

export interface SanityClient {
  fetch<T = any>(query: string, params?: Record<string, any>, options?: any): Promise<T>;
  create<T = any>(doc: Record<string, any>): Promise<T>;
  createOrReplace<T = any>(doc: Record<string, any>): Promise<T>;
  delete(id: string): Promise<any>;
  assets: {
    upload(
      assetType: 'image' | 'file',
      body: ArrayBuffer | Uint8Array | Blob,
      options?: { filename?: string; contentType?: string }
    ): Promise<any>;
  };
}

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

const API_VERSION = 'v2024-01-31';
const TIMEOUT_MS = 6000;

export const sanityConfig: SanityClientConfig = {
  projectId: SANITY_PROJECT_ID,
  dataset: SANITY_DATASET,
  useCdn: !isDraftMode,
  apiVersion: '2024-01-31',
  // Only pass token in explicit draft/preview mode. Public published requests without token use the free API CDN.
  token: isDraftMode ? SANITY_TOKEN : undefined,
  perspective: isDraftMode ? 'previewDrafts' : 'published',
};

let apiCallCount = 0;

/**
 * Lightweight factory creating a Sanity HTTP client backed by native Edge fetch + 6s AbortSignal
 */
export function createEdgeSanityClient(cfg: SanityClientConfig, label = 'CDN'): SanityClient {
  let forceNoTokenFallback = false;

  const getHost = (useCdn: boolean) =>
    `https://${cfg.projectId}.${useCdn ? 'apicdn' : 'api'}.sanity.io/${API_VERSION}`;

  async function executeQuery<T>(query: string, params: Record<string, any> = {}, useToken = true): Promise<T> {
    const activeToken = useToken && !forceNoTokenFallback ? cfg.token : undefined;
    // Sanity API CDN only caches unauthenticated requests on published perspective
    const effectiveCdn = cfg.useCdn && !activeToken;
    const url = new URL(`${getHost(effectiveCdn)}/data/query/${cfg.dataset}`);
    url.searchParams.set('query', query);
    if (cfg.perspective) url.searchParams.set('perspective', cfg.perspective);

    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) {
        url.searchParams.set(`$${k}`, JSON.stringify(v));
      }
    }

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (activeToken) headers.Authorization = `Bearer ${activeToken}`;

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status === 401 && activeToken) {
      console.warn(`⚠️ [Sanity:${label}] 401 Unauthorized with token. Falling back to public client...`);
      forceNoTokenFallback = true;
      return executeQuery<T>(query, params, false);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Sanity query failed (${res.status}): ${errText.slice(0, 200)}`);
    }

    const json = (await res.json()) as { result: T };
    return json.result;
  }

  async function mutate(mutations: any[], returnDocuments = true): Promise<any> {
    if (!cfg.token) throw new Error('SANITY_TOKEN is required for write mutations');
    const url = `${getHost(false)}/data/mutate/${cfg.dataset}?returnIds=true&returnDocuments=${returnDocuments}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify({ mutations }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Sanity mutation failed (${res.status}): ${errText.slice(0, 300)}`);
    }
    const data = (await res.json()) as any;
    const firstResult = data?.results?.[0];
    return firstResult?.document || { _id: firstResult?.id, ...data };
  }

  return {
    async fetch<T = any>(query: string, params?: Record<string, any>): Promise<T> {
      apiCallCount++;
      if (isDev) {
        const summary = typeof query === 'string' ? query.replace(/[\r\n\s]+/g, ' ').trim().slice(0, 80) : 'query';
        console.log(`[SANITY:${label} #${apiCallCount}] ${summary}...`);
      }
      const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      try {
        return await executeQuery<T>(query, params);
      } finally {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        getActiveProfiler()?.addSpan('sanity', Math.max(0, Math.round(now - t0)));
      }
    },

    async create<T = any>(doc: Record<string, any>): Promise<T> {
      const res = await mutate([{ create: doc }], true);
      return { ...doc, ...res } as T;
    },

    async createOrReplace<T = any>(doc: Record<string, any>): Promise<T> {
      const res = await mutate([{ createOrReplace: doc }], true);
      return { ...doc, ...res } as T;
    },

    async delete(id: string): Promise<any> {
      return mutate([{ delete: { id } }], false);
    },

    assets: {
      async upload(assetType, body, options = {}) {
        if (!cfg.token) throw new Error('SANITY_TOKEN is required for asset upload');
        const url = new URL(`${getHost(false)}/assets/${assetType}s/${cfg.dataset}`);
        if (options.filename) url.searchParams.set('filename', options.filename);

        const res = await fetch(url.toString(), {
          method: 'POST',
          headers: {
            'Content-Type': options.contentType || 'application/octet-stream',
            Authorization: `Bearer ${cfg.token}`,
          },
          body: body as any,
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Sanity asset upload failed (${res.status}): ${errText.slice(0, 200)}`);
        }
        const json = (await res.json()) as { document: any };
        return json.document;
      },
    },
  };
}

export const client = createEdgeSanityClient(sanityConfig, 'CDN');

// Dedicated Live API client bypassing API CDN 1~10s eventual consistency lag
// Used exclusively during forceRefresh (CMS write-through & Webhook cache rebuild)
export const liveClient = createEdgeSanityClient(
  {
    projectId: SANITY_PROJECT_ID,
    dataset: SANITY_DATASET,
    useCdn: false,
    apiVersion: '2024-01-31',
    token: SANITY_TOKEN || undefined,
    perspective: 'published',
  },
  'Live'
);

// Public Live API fallback client if SANITY_TOKEN is expired or 401 Unauthorized
export const publicLiveClient = createEdgeSanityClient(
  {
    projectId: SANITY_PROJECT_ID,
    dataset: SANITY_DATASET,
    useCdn: false,
    apiVersion: '2024-01-31',
    token: undefined,
    perspective: 'published',
  },
  'Live'
);

/**
 * Returns either the cached API CDN client (default) or the Live API client (when forceLive = true)
 */
export function getSanityClient(forceLive = false): SanityClient {
  return forceLive ? liveClient : client;
}
