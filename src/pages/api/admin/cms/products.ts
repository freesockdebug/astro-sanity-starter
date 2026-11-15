// src/pages/api/admin/cms/products.ts
// Direct Sanity Products & Categories CMS CRUD API with Automated Cache Purge & Audit Logging
import type { APIRoute } from 'astro';
import { defineAdminApi, jsonNoCache } from '@utils/auth';
import { getSanityAdminClient } from '@utils/sanity-client';
import { syncCmsMutation, sanitizeSanityDocument, hasProductCardFieldsChanged } from '@utils/cmsSync';
import { recordAdminAudit } from '@db/audit.repo';

export const prerender = false;

export const GET: APIRoute = defineAdminApi(
  { permission: 'cms:read' },
  async ({ url, cfEnv }) => {
    const client = getSanityAdminClient(cfEnv);
    const type = url.searchParams.get('type');
    const id = url.searchParams.get('id');

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
  }
);

export const POST: APIRoute = defineAdminApi(
  { permission: 'cms:write', parseJson: true },
  async ({ context, request, auth, body, cfEnv }) => {
    const startTime = Date.now();
    const client = getSanityAdminClient(cfEnv);

    const rawDoc = body?.document;
    if (!rawDoc || !rawDoc._type) {
      return jsonNoCache({ error: 'Invalid document payload: missing _type.' }, 400);
    }
    const doc = sanitizeSanityDocument(rawDoc);

    const docType = doc._type;
    let existingDoc: any = null;
    if (doc._id) {
      existingDoc = await client.fetch(`*[_id == $id][0]`, { id: doc._id }).catch(() => null);
    }

    // Save or update in Sanity
    const result: any = doc._id ? await client.createOrReplace(doc) : await client.create(doc);

    // Write-Through Cache Update & Edge HTML Purge
    const oldSlug = existingDoc?.slug?.current || (typeof existingDoc?.slug === 'string' ? existingDoc.slug : '');
    const slugStr = result.slug?.current || (typeof result.slug === 'string' ? result.slug : '');
    const cardFieldsChanged = docType === 'product' ? hasProductCardFieldsChanged(existingDoc, result) : true;
    await syncCmsMutation({
      docType,
      slug: slugStr,
      oldSlug,
      operation: existingDoc ? 'update' : 'create',
      origin: new URL(request.url).origin,
      cfEnv,
      cardFieldsChanged,
    }).catch((e) => console.warn('[CMS Products POST] Cache sync warning:', e));

    const actionName = existingDoc
      ? docType === 'category' ? 'CMS_CATEGORY_UPDATE' : 'CMS_PRODUCT_UPDATE'
      : docType === 'category' ? 'CMS_CATEGORY_CREATE' : 'CMS_PRODUCT_CREATE';

    recordAdminAudit(context, {
      adminEmail: auth.user.email,
      action: actionName,
      targetType: docType,
      targetId: result._id || slugStr || result.sku || 'unknown',
      before: existingDoc,
      after: result,
      durationMs: Date.now() - startTime,
      cfEnv,
    });

    return jsonNoCache({ success: true, document: result });
  }
);

export const DELETE: APIRoute = defineAdminApi(
  { permission: 'cms:delete' },
  async ({ context, request, url, auth, cfEnv }) => {
    const startTime = Date.now();
    const client = getSanityAdminClient(cfEnv);
    const id = url.searchParams.get('id');

    if (!id) {
      return jsonNoCache({ error: 'Document ID is required for deletion.' }, 400);
    }

    const existingDoc = await client.fetch(`*[_id == $id][0]`, { id }).catch(() => null);
    if (!existingDoc) {
      return jsonNoCache({ error: 'Document not found.' }, 404);
    }

    await client.delete(id);

    // Write-Through Cache Eviction & Edge HTML Purge
    const slugStr = existingDoc.slug?.current || (typeof existingDoc.slug === 'string' ? existingDoc.slug : '');
    await syncCmsMutation({
      docType: existingDoc._type,
      slug: slugStr,
      operation: 'delete',
      origin: new URL(request.url).origin,
      cfEnv,
    }).catch((e) => console.warn('[CMS Products DELETE] Cache sync warning:', e));

    recordAdminAudit(context, {
      adminEmail: auth.user.email,
      action: existingDoc._type === 'category' ? 'CMS_CATEGORY_DELETE' : 'CMS_PRODUCT_DELETE',
      targetType: existingDoc._type,
      targetId: id,
      before: existingDoc,
      durationMs: Date.now() - startTime,
      cfEnv,
    });

    return jsonNoCache({ success: true, message: `Document "${id}" deleted successfully.` });
  }
);

