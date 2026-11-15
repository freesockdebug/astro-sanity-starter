// src/pages/api/admin/cms/config.ts
// Direct Sanity Singleton Configurations CMS API (siteConfig, catalogSettings, productStorySettings, rfqSettings)
import type { APIRoute } from 'astro';
import { defineAdminApi, jsonNoCache } from '@utils/auth';
import { getSanityAdminClient } from '@utils/sanity-client';
import { DEFAULT_RFQ_SETTINGS } from '@data/rfqSettings';
import { syncCmsMutation, sanitizeSanityDocument } from '@utils/cmsSync';
import {
  DEFAULT_BRAND_TITLE,
  DEFAULT_COPYRIGHT_TEXT,
  DEFAULT_CATALOG,
  DEFAULT_RFQ,
  DEFAULT_WHATSAPP_PREFILL,
} from '@data/defaults';
import { recordAdminAudit } from '@db/audit.repo';

export const prerender = false;

const VALID_CONFIG_TYPES = new Set(['siteConfig', 'catalogSettings', 'productStorySettings', 'rfqSettings']);

export const GET: APIRoute = defineAdminApi(
  { permission: 'cms:read' },
  async ({ url, cfEnv }) => {
    const client = getSanityAdminClient(cfEnv);
    const type = url.searchParams.get('type');

    if (type && VALID_CONFIG_TYPES.has(type)) {
      const doc = await client.fetch(`*[_type == $type][0]`, { type });
      return jsonNoCache({ success: true, document: doc || { _type: type } });
    }

    // Query all 4 singletons in parallel with fallback to default data
    const [siteConfig, catalogSettings, productStorySettings, rfqSettings] = await Promise.all([
      client.fetch(`*[_type == "siteConfig"][0]`).catch(() => null),
      client.fetch(`*[_type == "catalogSettings"][0]`).catch(() => null),
      client.fetch(`*[_type == "productStorySettings"][0]`).catch(() => null),
      client.fetch(`*[_type == "rfqSettings"][0]`).catch(() => null),
    ]);

    const defaultSiteConfig = {
      _type: 'siteConfig',
      brandName: DEFAULT_BRAND_TITLE,
      tagline: 'B2B Wholesale & Luxury Apparel Manufacturing',
      copyright: DEFAULT_COPYRIGHT_TEXT,
      header: {
        title: DEFAULT_BRAND_TITLE,
        subtitle: { _type: 'localeString', en: 'B2B Wholesale & Luxury Apparel Manufacturing' },
        navLinks: [
          { _type: 'actionLink', label: { en: 'Products' }, url: '/products' },
          { _type: 'actionLink', label: { en: 'Craftsmanship' }, url: '#specs' },
          { _type: 'actionLink', label: { en: 'Manufacturing' }, url: '#manufacturing' },
          { _type: 'actionLink', label: { en: 'Inquiry' }, url: '#inquiry' },
        ],
      },
      footer: {
        text: { _type: 'localeString', en: DEFAULT_COPYRIGHT_TEXT },
      },
      enableWhatsApp: false,
      whatsAppNumber: '',
      whatsAppPrefillText: DEFAULT_WHATSAPP_PREFILL,
      enableNotificationWebhook: false,
      notificationWebhookUrl: '',
      notificationRecipientEmail: '',
      enableImageProxy: false,
      edgeCacheTtl: 300,
    };

    const defaultCatalogSettings = {
      _type: 'catalogSettings',
      title: { en: DEFAULT_CATALOG.title, de: 'Produktkatalog & Line Sheets' },
      subtitle: { en: DEFAULT_CATALOG.subtitle, de: 'Wählen Sie proprietäre Silhouetten für White-Label-Branding.' },
      badgeText: { en: DEFAULT_CATALOG.badgeText },
    };

    const defaultProductStorySettings = {
      _type: 'productStorySettings',
      storyBadgeText: { _type: 'localeString', en: 'CRAFTSMANSHIP & STORY' },
      storyHeading: { _type: 'localeString', en: 'The Story Behind the Silhouette' },
      credentials: [
        {
          _key: 'cred_lonati',
          iconType: 'lonati',
          title: { _type: 'localeString', en: 'Italian Lonati Calibration' },
          description: { _type: 'localeText', en: 'High-gauge dual-cylinder needle density with zero-friction dimensional architecture.' },
          tag: '200N',
        },
        {
          _key: 'cred_seamless',
          iconType: 'seamless',
          title: { _type: 'localeString', en: 'Hand-Linked Seamless Finish' },
          description: { _type: 'localeText', en: 'True 0.0 mm seam plane eliminating ridge chafing and shoe pressure points.' },
          tag: '0.0 mm',
        },
        {
          _key: 'cred_oekotex',
          iconType: 'oekotex',
          title: { _type: 'localeString', en: 'OEKO-TEX® Standard 100' },
          description: { _type: 'localeText', en: 'Rigorous independent lab screening for harmful aromatic amines and allergens.' },
          tag: 'Class I',
        },
      ],
    };

    const defaultRfqSettings = {
      _type: 'rfqSettings',
      ...DEFAULT_RFQ_SETTINGS,
      drawerTitle: { _type: 'localeString', en: DEFAULT_RFQ.drawerTitle },
      drawerSubtitle: { _type: 'localeString', en: DEFAULT_RFQ.drawerSubtitle },
      drawerEmptyTitle: { _type: 'localeString', en: DEFAULT_RFQ.drawerEmptyTitle },
      btnAddToQuoteText: { _type: 'localeString', en: DEFAULT_RFQ.btnAddToQuoteText },
      drawerSubmitButtonText: { _type: 'localeString', en: DEFAULT_RFQ.drawerSubmitButtonText },
      swatchKitSku: DEFAULT_RFQ.swatchKitSku,
      swatchKitTitle: { _type: 'localeString', en: DEFAULT_RFQ.swatchKitTitle },
      defaultAmazonStoreUrl: DEFAULT_RFQ.defaultAmazonStoreUrl,
    };

    const mergedSite = siteConfig
      ? {
          ...defaultSiteConfig,
          ...siteConfig,
          header: { ...defaultSiteConfig.header, ...(siteConfig.header || {}) },
          footer: { ...defaultSiteConfig.footer, ...(siteConfig.footer || {}) },
        }
      : defaultSiteConfig;
    const mergedCatalog = catalogSettings ? { ...defaultCatalogSettings, ...catalogSettings } : defaultCatalogSettings;
    const mergedStory = productStorySettings ? { ...defaultProductStorySettings, ...productStorySettings } : defaultProductStorySettings;
    const mergedRfq = rfqSettings ? { ...defaultRfqSettings, ...rfqSettings } : defaultRfqSettings;

    return jsonNoCache({
      success: true,
      configs: {
        siteConfig: mergedSite,
        catalogSettings: mergedCatalog,
        productStorySettings: mergedStory,
        rfqSettings: mergedRfq,
      },
    });
  }
);

export const POST: APIRoute = defineAdminApi(
  { permission: 'cms:write', parseJson: true },
  async ({ context, request, auth, body, cfEnv }) => {
    const startTime = Date.now();
    const client = getSanityAdminClient(cfEnv);

    const rawDoc = body?.document;
    if (!rawDoc || !VALID_CONFIG_TYPES.has(rawDoc._type)) {
      return jsonNoCache({ error: `Invalid config document: must be one of ${Array.from(VALID_CONFIG_TYPES).join(', ')}` }, 400);
    }
    const doc = sanitizeSanityDocument(rawDoc);

    const docType = doc._type;
    const existingDoc = await client.fetch(`*[_type == $docType][0]`, { docType }).catch(() => null);

    // Ensure fixed document ID for singletons
    const singletonId = existingDoc?._id || docType;
    doc._id = singletonId;

    const result = await client.createOrReplace(doc);

    // Write-Through Cache Update & Edge HTML Purge
    await syncCmsMutation({
      docType,
      origin: new URL(request.url).origin,
      cfEnv,
    }).catch((e) => console.warn('[CMS Config POST] Cache sync warning:', e));

    recordAdminAudit(context, {
      adminEmail: auth.user.email,
      action: 'CMS_CONFIG_UPDATE',
      targetType: docType,
      targetId: singletonId,
      before: existingDoc,
      after: result,
      durationMs: Date.now() - startTime,
      cfEnv,
    });

    return jsonNoCache({ success: true, document: result });
  }
);

