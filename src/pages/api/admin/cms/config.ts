// src/pages/api/admin/cms/config.ts
// Direct Sanity Singleton Configurations CMS API (siteConfig, catalogSettings, productStorySettings, rfqSettings)
import type { APIRoute } from 'astro';
import { verifyAdminAuth, hasPermission, jsonNoCache } from '@utils/auth';
import { getSanityAdminClient } from '@utils/sanity-client';
import { ProductService } from '@data/products';
import { SiteConfigService } from '@data/siteConfig';
import { RfqSettingsService, DEFAULT_RFQ_SETTINGS } from '@data/rfqSettings';
import { syncCmsMutation, sanitizeSanityDocument } from '@utils/cmsSync';
import {
  DEFAULT_BRAND_TITLE,
  DEFAULT_COPYRIGHT_TEXT,
  DEFAULT_CATALOG,
  DEFAULT_RFQ,
} from '@data/defaults';
import { computeJsonDiff, insertAuditLog } from '@db/audit.repo';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

const VALID_CONFIG_TYPES = new Set(['siteConfig', 'catalogSettings', 'productStorySettings', 'rfqSettings']);

export const GET: APIRoute = async ({ request, url }) => {
  const auth = await verifyAdminAuth(request, cfEnv);
  if (!auth) {
    return jsonNoCache({ error: 'Unauthorized admin access required.' }, 401);
  }

  if (!hasPermission(auth.adminContext, 'cms:read')) {
    return jsonNoCache({ error: 'Forbidden: Missing cms:read permission.' }, 403);
  }

  const client = getSanityAdminClient(cfEnv);
  const type = url.searchParams.get('type');

  try {
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
      whatsAppPrefillText: 'Hello Gwen & Venni team, I would like to inquire about wholesale production.',
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
  } catch (err: any) {
    console.error('[CMS Config GET API] Error fetching configs:', err);
    return jsonNoCache({ error: err.message || 'Failed to fetch CMS configs.' }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const auth = await verifyAdminAuth(request, cfEnv);
  if (!auth) {
    return jsonNoCache({ error: 'Unauthorized admin access required.' }, 401);
  }

  if (!hasPermission(auth.adminContext, 'cms:write')) {
    return jsonNoCache({ error: 'Forbidden: Missing cms:write permission.' }, 403);
  }

  const startTime = Date.now();
  const client = getSanityAdminClient(cfEnv);

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const rawDoc = body.document;
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

    // Audit Log
    const diff = computeJsonDiff(existingDoc, result);
    await insertAuditLog({
      admin_email: auth.user.email,
      action: 'CMS_CONFIG_UPDATE',
      target_type: docType,
      target_id: singletonId,
      before_json: existingDoc ? JSON.stringify(existingDoc) : null,
      after_json: JSON.stringify(result),
      diff_json: diff ? JSON.stringify(diff) : null,
      client_ip: request.headers.get('cf-connecting-ip') || '127.0.0.1',
      country: request.headers.get('cf-ipcountry') || 'US',
      duration_ms: Date.now() - startTime,
    }).catch((e) => console.warn('[CMS Audit] Failed to record audit log:', e));

    return jsonNoCache({ success: true, document: result });
  } catch (err: any) {
    console.error('[CMS Config POST API] Error mutating config:', err);
    return jsonNoCache({ error: err.message || 'Failed to save config in Sanity.' }, 500);
  }
};

