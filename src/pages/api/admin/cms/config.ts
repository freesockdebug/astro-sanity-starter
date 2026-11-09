// src/pages/api/admin/cms/config.ts
// Direct Sanity Singleton Configurations CMS API (siteConfig, catalogSettings, productStorySettings, rfqSettings)
import type { APIRoute } from 'astro';
import { verifyAdminAuth, hasPermission, jsonNoCache } from '@utils/auth';
import { getSanityAdminClient } from '@utils/sanity-admin';
import { ProductService } from '@data/products';
import { kvDelete } from '@utils/kv';
import { computeJsonDiff, insertAuditLog } from '@utils/audit';
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

    // Query all 4 singletons in parallel
    const [siteConfig, catalogSettings, productStorySettings, rfqSettings] = await Promise.all([
      client.fetch(`*[_type == "siteConfig"][0]`).catch(() => null),
      client.fetch(`*[_type == "catalogSettings"][0]`).catch(() => null),
      client.fetch(`*[_type == "productStorySettings"][0]`).catch(() => null),
      client.fetch(`*[_type == "rfqSettings"][0]`).catch(() => null),
    ]);

    return jsonNoCache({
      success: true,
      configs: {
        siteConfig: siteConfig || { _type: 'siteConfig' },
        catalogSettings: catalogSettings || { _type: 'catalogSettings' },
        productStorySettings: productStorySettings || { _type: 'productStorySettings' },
        rfqSettings: rfqSettings || { _type: 'rfqSettings' },
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
    const body = await request.json();
    const doc = body.document;
    if (!doc || !VALID_CONFIG_TYPES.has(doc._type)) {
      return jsonNoCache({ error: `Invalid config document: must be one of ${Array.from(VALID_CONFIG_TYPES).join(', ')}` }, 400);
    }

    const docType = doc._type;
    const existingDoc = await client.fetch(`*[_type == $docType][0]`, { docType }).catch(() => null);

    // Ensure fixed document ID for singletons
    const singletonId = existingDoc?._id || docType;
    doc._id = singletonId;

    const result = await client.createOrReplace(doc);

    // Invalidate local SWR & KV
    ProductService.invalidateCache();
    await kvDelete(`cms:${docType}`, cfEnv).catch(() => {});
    await kvDelete('cms:products:all', cfEnv).catch(() => {});

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

