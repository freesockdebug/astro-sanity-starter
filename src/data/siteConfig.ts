import { client } from '@utils/sanity-client';
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
  private static cacheTimestamp: number = 0;
  private static readonly CACHE_TTL_MS = 10_000;

  public static seed(config?: SiteConfig | null): void {
    if (config) {
      this.cachedConfig = config;
      this.cacheTimestamp = Date.now();
    }
  }

  public static async getConfig(forceRefresh = false): Promise<SiteConfig | null> {
    const now = Date.now();
    if (!forceRefresh && this.cachedConfig && (now - this.cacheTimestamp < this.CACHE_TTL_MS)) {
      return this.cachedConfig;
    }

    try {
      const data = await client.fetch<SiteConfig>(`*[_type == "siteConfig"][0] ${CONFIG_QUERY_OBJ}`);
      this.cachedConfig = data || null;
      this.cacheTimestamp = now;
      return this.cachedConfig;
    } catch (err: any) {
      console.error('SiteConfigService.getConfig failed:', err?.message);
      return this.cachedConfig;
    }
  }
}

// Backward-compatible function export
export const fetchData = (forceRefresh?: boolean) => SiteConfigService.getConfig(forceRefresh);
