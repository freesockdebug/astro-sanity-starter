/// <reference types="astro/client" />
/// <reference types="@astrojs/cloudflare/types.d.ts" />

declare module '*.astro' {
    const Component: (_props: Record<string, any>) => any;
    export default Component;
}

interface ImportMetaEnv {
    readonly SANITY_PROJECT_ID?: string;
    readonly SANITY_DATASET?: string;
    readonly SANITY_TOKEN?: string;
    readonly SANITY_STUDIO_PROJECT_ID?: string;
    readonly SANITY_STUDIO_DATASET?: string;
    readonly SANITY_STUDIO_SITE_URL?: string;
    readonly SANITY_STUDIO_REVALIDATE_SECRET?: string;
    readonly REVALIDATE_SECRET?: string;
    readonly SITE_URL?: string;
    readonly STACKBIT_PREVIEW?: string;
    readonly SANITY_PREVIEW_DRAFTS?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
