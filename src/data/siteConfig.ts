import { getSanityClient } from '@utils/sanity-client';
import { SanityImageService } from '@utils/image';
import { createCmsCache } from '@utils/cache';
import { getActiveProfiler } from '@utils/profiler';
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

const configCache = createCmsCache<SiteConfig | null>(
  (forceRefresh) => getSanityClient(forceRefresh).fetch<SiteConfig>(`*[_type == "siteConfig"][0] ${CONFIG_QUERY_OBJ}`),
  {} as SiteConfig,
  {
    kvKey: 'cms:siteConfig',
    scope: 'config',
    purgeAction: 'refresh',
    onUpdate: (cfg) => SanityImageService.setStudioProxyConfig(cfg?.enableImageProxy),
  }
);

/**
 * Service class handling Global Site Configuration
 */
export class SiteConfigService {
  public static seed(config?: SiteConfig | null, recordL2Hit = false): void {
    configCache.seed(config, recordL2Hit);
  }

  public static peek(): SiteConfig | null {
    return configCache.peek();
  }

  public static async getConfig(forceRefresh = false): Promise<SiteConfig | null> {
    if (!forceRefresh) {
      const profiler = getActiveProfiler();
      if (profiler) {
        let pending = profiler.requestMemo.get('siteConfig');
        if (!pending) {
          pending = configCache.get(false);
          profiler.requestMemo.set('siteConfig', pending);
        }
        return pending;
      }
    }
    return configCache.get(forceRefresh);
  }

  public static invalidate(): void {
    configCache.invalidate();
  }
}

// Backward-compatible function export
export const fetchData = (forceRefresh?: boolean) => SiteConfigService.getConfig(forceRefresh);
