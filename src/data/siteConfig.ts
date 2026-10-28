import { client } from '@utils/sanity-client';
import { SanityImageService } from '@utils/image';
import { createSwrCache } from '@utils/cache';
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

const configCache = createSwrCache<SiteConfig | null>(
  () => client.fetch<SiteConfig>(`*[_type == "siteConfig"][0] ${CONFIG_QUERY_OBJ}`),
  {} as SiteConfig,
  10_000,
  (cfg) => SanityImageService.setStudioProxyConfig(cfg?.enableImageProxy)
);

/**
 * Service class handling Global Site Configuration
 */
export class SiteConfigService {
  public static seed(config?: SiteConfig | null): void {
    configCache.seed(config);
  }

  public static async getConfig(forceRefresh = false): Promise<SiteConfig | null> {
    return configCache.get(forceRefresh);
  }

  public static invalidate(): void {
    configCache.invalidate();
  }
}

// Backward-compatible function export
export const fetchData = (forceRefresh?: boolean) => SiteConfigService.getConfig(forceRefresh);
