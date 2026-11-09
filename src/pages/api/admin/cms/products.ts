// src/pages/api/admin/cms/products.ts
// Direct Sanity Products & Categories CMS CRUD API with Automated Cache Purge & Audit Logging
import type { APIRoute } from 'astro';
import { verifyAdminAuth, hasPermission, jsonNoCache } from '@utils/auth';
import { getSanityAdminClient } from '@utils/sanity-admin';
import { ProductService } from '@data/products';
import { kvDelete } from '@utils/kv';
import { computeJsonDiff, insertAuditLog } from '@utils/audit';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

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
  const id = url.searchParams.get('id');

  try {
    if (id) {
      const doc = await client.fetch(`*[_id == $id][0]`, { id });
      if (!doc) {
        return jsonNoCache({ error: 'Document not found' }, 404);
      }
      return jsonNoCache({ success: true, document: doc });
    }

    if (type === 'categories') {
      const categories = await client.fetch(
        `*[_type == "category"] | order(order asc, title.en asc) {
          _id,
          _type,
          title,
          slug,
          description,
          order,
          _updatedAt
        }`
      );
      return jsonNoCache({ success: true, categories });
    }

    // Default: Return list of products
    const [products, categories] = await Promise.all([
      client.fetch(
        `*[_type == "product"] | order(_updatedAt desc) {
          ...,
          category->{ _id, title, slug },
          "mainImageUrl": mainImage.asset->url,
          "galleryUrls": gallery[].asset->url
        }`
      ),
      client.fetch(
        `*[_type == "category"] | order(order asc, title.en asc) {
          ...
        }`
      ),
    ]);

    return jsonNoCache({ success: true, products, categories });
  } catch (err: any) {
    console.error('[CMS Products GET API] Error querying Sanity:', err);
    return jsonNoCache({ error: err.message || 'Failed to query Sanity CMS.' }, 500);
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
    const doc = body.document;
    if (!doc || !doc._type) {
      return jsonNoCache({ error: 'Invalid document payload: missing _type.' }, 400);
    }

    const docType = doc._type;
    let existingDoc: any = null;
    if (doc._id) {
      existingDoc = await client.fetch(`*[_id == $id][0]`, { id: doc._id }).catch(() => null);
    }

    // Save or update in Sanity
    let result: any;
    if (doc._id) {
      result = await client.createOrReplace(doc);
    } else {
      result = await client.create(doc);
    }

    // Automated Cache Invalidation
    ProductService.invalidateCache();
    await kvDelete('cms:products:all', cfEnv).catch(() => {});
    await kvDelete('cms:categories:all', cfEnv).catch(() => {});
    const slugStr = result.slug?.current || (typeof result.slug === 'string' ? result.slug : '');
    if (slugStr) {
      await kvDelete(`cms:product:${slugStr}`, cfEnv).catch(() => {});
    }

    // Audit Logging with Differential Snapshot
    const diff = computeJsonDiff(existingDoc, result);
    const actionName = existingDoc
      ? docType === 'category' ? 'CMS_CATEGORY_UPDATE' : 'CMS_PRODUCT_UPDATE'
      : docType === 'category' ? 'CMS_CATEGORY_CREATE' : 'CMS_PRODUCT_CREATE';

    await insertAuditLog({
      admin_email: auth.user.email,
      action: actionName,
      target_type: docType,
      target_id: result._id || slugStr || result.sku || 'unknown',
      before_json: existingDoc ? JSON.stringify(existingDoc) : null,
      after_json: JSON.stringify(result),
      diff_json: diff ? JSON.stringify(diff) : null,
      client_ip: request.headers.get('cf-connecting-ip') || '127.0.0.1',
      country: request.headers.get('cf-ipcountry') || 'US',
      duration_ms: Date.now() - startTime,
    }).catch((e) => console.warn('[CMS Audit] Failed to record audit log:', e));

    return jsonNoCache({ success: true, document: result });
  } catch (err: any) {
    console.error('[CMS Products POST API] Failed to mutate Sanity:', err);
    return jsonNoCache({ error: err.message || 'Failed to save document in Sanity.' }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, url }) => {
  const auth = await verifyAdminAuth(request, cfEnv);
  if (!auth) {
    return jsonNoCache({ error: 'Unauthorized admin access required.' }, 401);
  }

  if (!hasPermission(auth.adminContext, 'cms:delete')) {
    return jsonNoCache({ error: 'Forbidden: Missing cms:delete permission.' }, 403);
  }

  const startTime = Date.now();
  const client = getSanityAdminClient(cfEnv);
  const id = url.searchParams.get('id');

  if (!id) {
    return jsonNoCache({ error: 'Document ID is required for deletion.' }, 400);
  }

  try {
    const existingDoc = await client.fetch(`*[_id == $id][0]`, { id }).catch(() => null);
    if (!existingDoc) {
      return jsonNoCache({ error: 'Document not found.' }, 404);
    }

    await client.delete(id);

    // Automated Cache Invalidation
    ProductService.invalidateCache();
    await kvDelete('cms:products:all', cfEnv).catch(() => {});
    await kvDelete('cms:categories:all', cfEnv).catch(() => {});
    const slugStr = existingDoc.slug?.current || (typeof existingDoc.slug === 'string' ? existingDoc.slug : '');
    if (slugStr) {
      await kvDelete(`cms:product:${slugStr}`, cfEnv).catch(() => {});
    }

    // Audit Logging
    await insertAuditLog({
      admin_email: auth.user.email,
      action: existingDoc._type === 'category' ? 'CMS_CATEGORY_DELETE' : 'CMS_PRODUCT_DELETE',
      target_type: existingDoc._type,
      target_id: id,
      before_json: JSON.stringify(existingDoc),
      after_json: null,
      diff_json: JSON.stringify({ deleted: { from: existingDoc.title || existingDoc._id, to: null } }),
      client_ip: request.headers.get('cf-connecting-ip') || '127.0.0.1',
      country: request.headers.get('cf-ipcountry') || 'US',
      duration_ms: Date.now() - startTime,
    }).catch((e) => console.warn('[CMS Audit] Failed to record audit log:', e));

    return jsonNoCache({ success: true, message: `Document "${id}" deleted successfully.` });
  } catch (err: any) {
    console.error('[CMS Products DELETE API] Failed to delete in Sanity:', err);
    return jsonNoCache({ error: err.message || 'Failed to delete document in Sanity.' }, 500);
  }
};

