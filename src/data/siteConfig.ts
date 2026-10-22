import { client } from '@utils/sanity-client';
import { SanityImageService } from '@utils/image';
import { IMAGE } from './blocks';
import type { SiteConfig } from 'types';

export const CONFIG_QUERY_OBJ = `{
  _id,
  "favicon": {
    "src": favicon.asset->url
  },
  header {
    ...,
    logo ${IMAGE}
  },
  footer,
  titleSuffix,
  enableImageProxy,
  edgeCacheTtl,
  enableWhatsApp,
  whatsAppNumber,
  whatsAppPrefillText,
  whatsAppTooltip,
  enableNotificationWebhook,
  notificationWebhookUrl,
  notificationRecipientEmail
}`;

/**
 * Service class handling Global Site Configuration
 */
export class SiteConfigService {
  private static cachedConfig: SiteConfig | null = null;
  private static hasSeededValue: boolean = false;
  private static cacheTimestamp: number = 0;
  private static inflightPromise: Promise<SiteConfig | null> | null = null;
  private static readonly CACHE_TTL_MS = 10_000;

  public static seed(config?: SiteConfig | null): void {
    this.cachedConfig = config || ({} as SiteConfig);
    this.hasSeededValue = true;
    this.cacheTimestamp = Date.now();
    SanityImageService.setStudioProxyConfig(this.cachedConfig?.enableImageProxy);
  }

  public static async getConfig(forceRefresh = false): Promise<SiteConfig | null> {
    const now = Date.now();
    if (!forceRefresh && this.hasSeededValue && (now - this.cacheTimestamp < this.CACHE_TTL_MS)) {
      return this.cachedConfig;
    }

    if (!forceRefresh && this.inflightPromise) {
      return this.inflightPromise;
    }

    this.inflightPromise = (async () => {
      try {
        const data = await client.fetch<SiteConfig>(`*[_type == "siteConfig"][0] ${CONFIG_QUERY_OBJ}`);
        this.cachedConfig = data || ({} as SiteConfig);
        this.hasSeededValue = true;
        this.cacheTimestamp = Date.now();
        SanityImageService.setStudioProxyConfig(this.cachedConfig?.enableImageProxy);
        return this.cachedConfig;
      } catch (err: any) {
        console.error('SiteConfigService.getConfig failed:', err?.message);
        this.cachedConfig = this.cachedConfig || ({} as SiteConfig);
        this.hasSeededValue = true;
        this.cacheTimestamp = Date.now();
        return this.cachedConfig;
      } finally {
        this.inflightPromise = null;
      }
    })();

    return this.inflightPromise;
  }
}

// Backward-compatible function export
export const fetchData = (forceRefresh?: boolean) => SiteConfigService.getConfig(forceRefresh);
