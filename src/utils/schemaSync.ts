// src/utils/schemaSync.ts
/**
 * Data contracts and schema synchronization verification utility.
 * Compares Sanity Studio document schemas with frontend GROQ projections
 * and TypeScript interfaces defined in types/index.ts.
 */

export type FieldSyncStatus =
  | 'synced'          // In Studio schema, in Frontend data, in TS interface
  | 'missing_data'    // In Studio schema, missing in Frontend GROQ / defaults
  | 'missing_ts'      // In Studio schema, missing in TS interface
  | 'missing_both'    // In Studio schema, missing in both Frontend GROQ and TS interface
  | 'extra_data'      // In Frontend data/GROQ, not in Studio schema
  | 'extra_ts';       // In TS interface, not in Studio schema (e.g. computed/allowlisted)

export interface FieldComparison {
  name: string;
  studioType?: string;
  inStudio: boolean;
  inData: boolean;
  inTs: boolean;
  isAllowedExtra?: boolean;
  status: FieldSyncStatus;
  note?: string;
}

export interface DocumentSyncReport {
  id: string;
  title: string;
  schemaName: string;
  tsInterface: string;
  dataLabel: string;
  totalStudioFields: number;
  totalDataFields: number;
  totalTsFields: number;
  syncedFieldsCount: number;
  outOfSyncCount: number;
  syncPercentage: number;
  isFullySynced: boolean;
  fields: FieldComparison[];
}

export interface SchemaSyncSummary {
  timestamp: string;
  totalDocuments: number;
  totalFieldsCompared: number;
  fullySyncedDocumentsCount: number;
  totalOutOfSyncFields: number;
  overallSyncPercentage: number;
  isSimulatedDrift?: boolean;
  documents: DocumentSyncReport[];
}

import { PRODUCT_FIELDS, CATEGORY_FIELDS } from '@data/products';
import { CONFIG_QUERY_OBJ } from '@data/siteConfig';
import { PAGE_QUERY_OBJ } from '@data/page';
import { DEFAULT_RFQ_SETTINGS } from '@data/rfqSettings';
import { DEFAULT_CATALOG } from '@data/defaults';

/**
 * Extracts top-level field names from a GROQ projection block `{ ... }`
 */
export function extractGroqTopLevelFields(groq: string): string[] {
  const fields = new Set<string>();
  const firstBrace = groq.indexOf('{');
  const lastBrace = groq.lastIndexOf('}');
  const inner =
    firstBrace !== -1 && lastBrace > firstBrace
      ? groq.slice(firstBrace + 1, lastBrace)
      : groq;

  let depth = 0;
  let currentToken = '';

  const processEntry = (entry: string) => {
    const cleaned = entry.replace(/\/\/.*$/gm, '').trim();
    if (!cleaned || cleaned.startsWith('...')) return;

    // 1. Quoted alias projection: "fieldName": ...
    const quotedMatch = cleaned.match(/^"([a-zA-Z0-9_]+)"\s*:/);
    if (quotedMatch) {
      fields.add(quotedMatch[1]);
      return;
    }

    // 2. Unquoted alias or nested projection: fieldName: ... or fieldName[] { ... } or fieldName->{ ... }
    const unquotedMatch = cleaned.match(/^([a-zA-Z0-9_]+)\s*(?:\[\])?\s*(?:->|:|\{)/);
    if (unquotedMatch) {
      fields.add(unquotedMatch[1]);
      return;
    }

    // 3. Direct identifier projection: _id, slug, currency
    const bareMatch = cleaned.match(/^([a-zA-Z0-9_]+)$/);
    if (bareMatch) {
      fields.add(bareMatch[1]);
    }
  };

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth = Math.max(0, depth - 1);

    if ((ch === ',' || ch === '\n') && depth === 0) {
      processEntry(currentToken);
      currentToken = '';
    } else {
      currentToken += ch;
    }
  }
  processEntry(currentToken);

  return Array.from(fields);
}

/**
 * Extracts nested sub-projection fields for an array/object field inside a GROQ query (e.g., pricingTiers[]{ ... })
 */
export function extractGroqNestedFields(groq: string, parentField: string): string[] {
  const regex = new RegExp(`["']?${parentField}["']?\\s*(?:\\[\\])?\\s*\\{([\\s\\S]*?)\\}`, 'm');
  const match = groq.match(regex);
  if (!match) return [];
  return extractGroqTopLevelFields(`{${match[1]}}`);
}

/**
 * Raw contracts schema definition registry (dataFields dynamically derived from src/data/*)
 */
const SCHEMA_CONTRACT_DEFINITIONS = [
  {
    id: 'product',
    title: 'Product (产品款式与订货目录)',
    schemaName: 'product',
    tsInterface: 'Product',
    dataLabel: 'PRODUCT_FIELDS (src/data/products.ts)',
    allowedTsExtras: ['_id'],
    allowedDataExtras: ['_id'],
    studioFields: [
      { name: 'title', type: 'localeString' },
      { name: 'slug', type: 'slug' },
      { name: 'sku', type: 'string' },
      { name: 'tagline', type: 'localeString' },
      { name: 'shortTitle', type: 'localeString' },
      { name: 'category', type: 'reference' },
      { name: 'statusBadge', type: 'localeString' },
      { name: 'supportBadge', type: 'localeString' },
      { name: 'mainImage', type: 'image' },
      { name: 'gallery', type: 'array' },
      { name: 'galleryHint', type: 'localeString' },
      { name: 'currency', type: 'string' },
      { name: 'moq', type: 'string' },
      { name: 'leadTime', type: 'string' },
      { name: 'pricingTiers', type: 'array' },
      { name: 'colors', type: 'array' },
      { name: 'priceNote', type: 'localeString' },
      { name: 'paletteTitle', type: 'localeString' },
      { name: 'specsBadge', type: 'localeString' },
      { name: 'specsHeading', type: 'localeString' },
      { name: 'specifications', type: 'array' },
      { name: 'addToQuoteButtonText', type: 'localeString' },
      { name: 'amazonAsin', type: 'string' },
      { name: 'amazonUrl', type: 'url' },
      { name: 'sampleButtonText', type: 'localeString' },
      { name: 'primaryButtonText', type: 'localeString' },
      { name: 'secondaryButtonText', type: 'localeString' },
    ],
    dataFields: extractGroqTopLevelFields(PRODUCT_FIELDS),
    tsFields: [
      '_id', 'title', 'shortTitle', 'slug', 'sku', 'currency', 'tagline',
      'statusBadge', 'supportBadge', 'specsHeading', 'specsBadge', 'galleryHint',
      'priceNote', 'paletteTitle', 'addToQuoteButtonText', 'amazonAsin', 'amazonUrl',
      'sampleButtonText', 'primaryButtonText', 'secondaryButtonText', 'moq', 'leadTime',
      'category', 'mainImage', 'gallery', 'colors', 'pricingTiers', 'specifications'
    ],
  },
  {
    id: 'category',
    title: 'Category (产品类别与层级)',
    schemaName: 'category',
    tsInterface: 'ProductCategory',
    dataLabel: 'CATEGORY_FIELDS (src/data/products.ts)',
    allowedTsExtras: ['_id'],
    allowedDataExtras: ['_id'],
    studioFields: [
      { name: 'title', type: 'string' },
      { name: 'slug', type: 'slug' },
      { name: 'description', type: 'string' },
      { name: 'order', type: 'number' },
    ],
    dataFields: extractGroqTopLevelFields(CATEGORY_FIELDS),
    tsFields: ['_id', 'title', 'slug', 'description', 'order'],
  },
  {
    id: 'siteConfig',
    title: 'SiteConfig (全局品牌与页头页尾)',
    schemaName: 'siteConfig',
    tsInterface: 'SiteConfig',
    dataLabel: 'CONFIG_QUERY_OBJ (src/data/siteConfig.ts)',
    allowedTsExtras: ['_id', 'rfqConfig'],
    allowedDataExtras: ['_id'],
    studioFields: [
      { name: 'favicon', type: 'image' },
      { name: 'header', type: 'header' },
      { name: 'footer', type: 'footer' },
      { name: 'enableImageProxy', type: 'boolean' },
      { name: 'edgeCacheTtl', type: 'number' },
      { name: 'titleSuffix', type: 'string' },
      { name: 'enableWhatsApp', type: 'boolean' },
      { name: 'whatsAppNumber', type: 'string' },
      { name: 'whatsAppPrefillText', type: 'string' },
      { name: 'whatsAppTooltip', type: 'string' },
      { name: 'enableNotificationWebhook', type: 'boolean' },
      { name: 'notificationWebhookUrl', type: 'string' },
      { name: 'notificationRecipientEmail', type: 'string' },
    ],
    dataFields: extractGroqTopLevelFields(CONFIG_QUERY_OBJ),
    tsFields: [
      '_id', 'favicon', 'header', 'footer', 'titleSuffix', 'rfqConfig',
      'enableImageProxy', 'edgeCacheTtl', 'enableWhatsApp', 'whatsAppNumber',
      'whatsAppPrefillText', 'whatsAppTooltip', 'enableNotificationWebhook',
      'notificationWebhookUrl', 'notificationRecipientEmail'
    ],
  },
  {
    id: 'page',
    title: 'Page (独立页面与积木块容器)',
    schemaName: 'page',
    tsInterface: 'Page',
    dataLabel: 'PAGE_QUERY_OBJ (src/data/page.ts)',
    allowedTsExtras: ['_id'],
    allowedDataExtras: ['_id'],
    studioFields: [
      { name: 'title', type: 'string' },
      { name: 'slug', type: 'slug' },
      { name: 'sections', type: 'array' },
      { name: 'metaTitle', type: 'string' },
      { name: 'addTitleSuffix', type: 'boolean' },
      { name: 'metaDescription', type: 'string' },
      { name: 'socialImage', type: 'customImage' },
    ],
    dataFields: extractGroqTopLevelFields(PAGE_QUERY_OBJ),
    tsFields: [
      '_id', 'slug', 'title', 'sections', 'metaTitle', 'addTitleSuffix',
      'metaDescription', 'socialImage'
    ],
  },
  {
    id: 'rfqSettings',
    title: 'RFQ Settings (询盘车与打样配置)',
    schemaName: 'rfqSettings',
    tsInterface: 'RfqSettings',
    dataLabel: 'DEFAULT_RFQ_SETTINGS (src/data/rfqSettings.ts)',
    allowedTsExtras: ['swatchKitImageUrl', 'swatchKitMoq', 'swatchKitImage'],
    allowedDataExtras: ['swatchKitImageUrl', 'swatchKitMoq'],
    studioFields: [
      { name: 'showSwatchKitButton', type: 'boolean' },
      { name: 'showNavActionButton', type: 'boolean' },
      { name: 'showHeroPrimaryButton', type: 'boolean' },
      { name: 'showHeroSecondaryButton', type: 'boolean' },
      { name: 'showSpecsPrimaryButton', type: 'boolean' },
      { name: 'showSpecsSecondaryButton', type: 'boolean' },
      { name: 'showCollectionsHeaderButton', type: 'boolean' },
      { name: 'showCardQuoteButton', type: 'boolean' },
      { name: 'showManufacturingActionButton', type: 'boolean' },
      { name: 'showInquirySection', type: 'boolean' },
      { name: 'showInquirySectionButton', type: 'boolean' },
      { name: 'showProductBuySampleButton', type: 'boolean' },
      { name: 'showProductAddToQuoteButton', type: 'boolean' },
      { name: 'showProductSpecSheetButton', type: 'boolean' },
      { name: 'btnSampleAmazonText', type: 'string' },
      { name: 'defaultAmazonStoreUrl', type: 'url' },
      { name: 'btnAddToQuoteText', type: 'string' },
      { name: 'cardQuoteBtnText', type: 'string' },
      { name: 'heroSwatchBtnText', type: 'string' },
      { name: 'drawerSubmitButtonText', type: 'string' },
      { name: 'drawerTitle', type: 'string' },
      { name: 'drawerSubtitle', type: 'string' },
      { name: 'drawerStatus', type: 'string' },
      { name: 'drawerEmptyTitle', type: 'string' },
      { name: 'drawerEmptyDesc', type: 'string' },
      { name: 'swatchKitSku', type: 'string' },
      { name: 'swatchKitTitle', type: 'string' },
      { name: 'swatchKitDesc', type: 'string' },
      { name: 'swatchKitOptions', type: 'array' },
      { name: 'drawerSuccessMessage', type: 'string' },
      { name: 'drawerErrorMessage', type: 'string' },
    ],
    dataFields: Object.keys(DEFAULT_RFQ_SETTINGS),
    tsFields: [
      'showSwatchKitButton', 'showNavActionButton', 'showHeroPrimaryButton',
      'showHeroSecondaryButton', 'showSpecsPrimaryButton', 'showSpecsSecondaryButton',
      'showCollectionsHeaderButton', 'showCardQuoteButton', 'showManufacturingActionButton',
      'showInquirySection', 'showInquirySectionButton', 'showProductBuySampleButton',
      'showProductAddToQuoteButton', 'showProductSpecSheetButton', 'btnSampleAmazonText',
      'defaultAmazonStoreUrl', 'btnAddToQuoteText', 'cardQuoteBtnText', 'heroSwatchBtnText',
      'drawerSubmitButtonText', 'drawerTitle', 'drawerSubtitle', 'drawerStatus',
      'drawerEmptyTitle', 'drawerEmptyDesc', 'swatchKitSku', 'swatchKitTitle',
      'swatchKitDesc', 'swatchKitOptions', 'swatchKitImageUrl', 'swatchKitMoq',
      'swatchKitImage', 'drawerSuccessMessage', 'drawerErrorMessage'
    ],
  },
  {
    id: 'catalogSettings',
    title: 'Catalog Settings (产品陈列大厅配置)',
    schemaName: 'catalogSettings',
    tsInterface: 'CatalogSettings',
    dataLabel: 'DEFAULT_CATALOG (src/data/defaults.ts)',
    allowedTsExtras: [],
    allowedDataExtras: ['fallbackCategories'],
    studioFields: [
      { name: 'badgeText', type: 'string' },
      { name: 'title', type: 'string' },
      { name: 'subtitle', type: 'string' },
      { name: 'metaTitle', type: 'string' },
      { name: 'metaDescription', type: 'string' },
      { name: 'searchPlaceholder', type: 'string' },
      { name: 'allSilhouettesLabel', type: 'string' },
      { name: 'endOfCatalogText', type: 'string' },
      { name: 'emptyStateHeading', type: 'string' },
      { name: 'emptyStateText', type: 'string' },
    ],
    dataFields: Object.keys(DEFAULT_CATALOG),
    tsFields: [
      'badgeText', 'title', 'subtitle', 'metaTitle', 'metaDescription',
      'searchPlaceholder', 'allSilhouettesLabel', 'endOfCatalogText',
      'emptyStateHeading', 'emptyStateText'
    ],
  },
  {
    id: 'pricingTiers',
    title: 'PricingTier (阶梯价子结构)',
    schemaName: 'product.pricingTiers',
    tsInterface: 'PricingTier',
    dataLabel: 'pricingTiers[] (src/data/products.ts)',
    allowedTsExtras: ['quantity'],
    allowedDataExtras: [],
    studioFields: [
      { name: 'range', type: 'string' },
      { name: 'price', type: 'string' },
      { name: 'unit', type: 'string' },
    ],
    dataFields: extractGroqNestedFields(PRODUCT_FIELDS, 'pricingTiers'),
    tsFields: ['range', 'quantity', 'price', 'unit'],
  },
  {
    id: 'colors',
    title: 'ColorVariant (颜色色盘子结构)',
    schemaName: 'product.colors',
    tsInterface: 'ColorVariant',
    dataLabel: 'colors[] (src/data/products.ts)',
    allowedTsExtras: ['pantone'],
    allowedDataExtras: [],
    studioFields: [
      { name: 'name', type: 'string' },
      { name: 'hex', type: 'string' },
    ],
    dataFields: extractGroqNestedFields(PRODUCT_FIELDS, 'colors'),
    tsFields: ['name', 'hex', 'pantone'],
  },
  {
    id: 'specifications',
    title: 'ProductSpecification (技术参数子结构)',
    schemaName: 'product.specifications',
    tsInterface: 'ProductSpecification',
    dataLabel: 'specifications[] (src/data/products.ts)',
    allowedTsExtras: [],
    allowedDataExtras: [],
    studioFields: [
      { name: 'label', type: 'string' },
      { name: 'value', type: 'string' },
    ],
    dataFields: extractGroqNestedFields(PRODUCT_FIELDS, 'specifications'),
    tsFields: ['label', 'value'],
  },
];

/**
 * Generate full schema & frontend projection synchronization report
 */
export function getSchemaSyncSummary(simulateDrift: boolean = false): SchemaSyncSummary {
  const reports: DocumentSyncReport[] = [];
  let totalCompared = 0;
  let totalOutOfSync = 0;
  let fullySyncedDocs = 0;

  for (const def of SCHEMA_CONTRACT_DEFINITIONS) {
    let studioFields = [...def.studioFields];
    let dataFields = [...def.dataFields];
    let tsFields = [...def.tsFields];

    // If simulation is enabled, inject simulated drift into the first document
    if (simulateDrift && def.id === 'product') {
      studioFields.push({ name: 'sustainabilityCert', type: 'string' });
      studioFields.push({ name: 'customPackagingOption', type: 'boolean' });
      dataFields.push('untrackedLegacyCode');
    }

    const studioMap = new Map(studioFields.map((f) => [f.name, f.type]));
    const dataSet = new Set(dataFields);
    const tsSet = new Set(tsFields);
    const allowedTsExtras = new Set(def.allowedTsExtras || []);
    const allowedDataExtras = new Set(def.allowedDataExtras || []);

    const allFieldNames = Array.from(
      new Set([...Array.from(studioMap.keys()), ...dataFields, ...tsFields])
    ).sort();

    const comparisons: FieldComparison[] = [];
    let docSyncedCount = 0;
    let docOutOfSyncCount = 0;

    for (const fieldName of allFieldNames) {
      const inStudio = studioMap.has(fieldName);
      const inData = dataSet.has(fieldName);
      const inTs = tsSet.has(fieldName);
      const studioType = studioMap.get(fieldName) || 'unknown';

      let status: FieldSyncStatus = 'synced';
      let isAllowed = false;
      let note: string | undefined = undefined;

      if (inStudio && inData && inTs) {
        status = 'synced';
        note = 'Full 3-way synchronization active.';
      } else if (inStudio && !inData && !inTs) {
        status = 'missing_both';
        note = 'Field defined in Sanity Studio but completely omitted from GROQ projections and TS interface!';
      } else if (inStudio && !inData) {
        status = 'missing_data';
        note = 'Field defined in Sanity Studio but omitted from frontend GROQ projection or default data.';
      } else if (inStudio && !inTs) {
        status = 'missing_ts';
        note = 'Field defined in Sanity Studio but missing in types/index.ts TypeScript interface.';
      } else if (!inStudio && inData) {
        if (allowedDataExtras.has(fieldName)) {
          status = 'extra_data';
          isAllowed = true;
          note = 'Approved frontend computed/fallback property.';
        } else {
          status = 'extra_data';
          note = 'Ghost field queried in frontend GROQ that does not exist in Sanity Studio schema!';
        }
      } else if (!inStudio && inTs) {
        if (allowedTsExtras.has(fieldName)) {
          status = 'extra_ts';
          isAllowed = true;
          note = 'Approved frontend UI client extension property.';
        } else {
          status = 'extra_ts';
          note = 'TypeScript property exists without corresponding Studio field or approved allowlist.';
        }
      }

      const isOutOfSync = !isAllowed && status !== 'synced';
      if (isOutOfSync) {
        docOutOfSyncCount++;
      } else {
        docSyncedCount++;
      }

      comparisons.push({
        name: fieldName,
        studioType,
        inStudio,
        inData,
        inTs,
        isAllowedExtra: isAllowed,
        status,
        note,
      });
    }

    const totalFields = comparisons.length;
    const syncPercentage = totalFields > 0 ? Math.round((docSyncedCount / totalFields) * 100) : 100;
    const isFullySynced = docOutOfSyncCount === 0;

    if (isFullySynced) {
      fullySyncedDocs++;
    }

    totalCompared += totalFields;
    totalOutOfSync += docOutOfSyncCount;

    reports.push({
      id: def.id,
      title: def.title,
      schemaName: def.schemaName,
      tsInterface: def.tsInterface,
      dataLabel: def.dataLabel,
      totalStudioFields: studioFields.length,
      totalDataFields: dataFields.length,
      totalTsFields: tsFields.length,
      syncedFieldsCount: docSyncedCount,
      outOfSyncCount: docOutOfSyncCount,
      syncPercentage,
      isFullySynced,
      fields: comparisons,
    });
  }

  const overallPercentage =
    totalCompared > 0
      ? Math.round(((totalCompared - totalOutOfSync) / totalCompared) * 100)
      : 100;

  return {
    timestamp: new Date().toISOString(),
    totalDocuments: reports.length,
    totalFieldsCompared: totalCompared,
    fullySyncedDocumentsCount: fullySyncedDocs,
    totalOutOfSyncFields: totalOutOfSync,
    overallSyncPercentage: overallPercentage,
    isSimulatedDrift: simulateDrift,
    documents: reports,
  };
}
