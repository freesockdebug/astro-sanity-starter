// src/pages/api/admin/cms/pages.ts
// Direct Sanity Pages & Modular Sections CMS API with Cache Invalidation and Differential Audit Logging
import type { APIRoute } from 'astro';
import { defineAdminApi, jsonNoCache } from '@utils/auth';
import { getSanityAdminClient } from '@utils/sanity-client';
import { syncCmsMutation, sanitizeSanityDocument } from '@utils/cmsSync';
import { recordAdminAudit } from '@db/audit.repo';

export const prerender = false;

export const GET: APIRoute = defineAdminApi(
  { permission: 'cms:read' },
  async ({ url, cfEnv }) => {
    const client = getSanityAdminClient(cfEnv);
    const id = url.searchParams.get('id');

    if (id) {
      const doc = await client.fetch(`*[_id == $id][0]`, { id });
      if (!doc) {
        return jsonNoCache({ error: 'Page document not found' }, 404);
      }
      return jsonNoCache({ success: true, page: doc });
    }

    // List all pages
    const pages = await client.fetch(
      `*[_type == "page"] | order(slug.current asc) {
        _id,
        _type,
        title,
        slug,
        metaTitle,
        metaDescription,
        "sectionCount": count(sections),
        _updatedAt,
        _createdAt
      }`
    );

    return jsonNoCache({ success: true, pages });
  }
);

export const POST: APIRoute = defineAdminApi(
  { permission: 'cms:write', parseJson: true },
  async ({ context, request, auth, body, cfEnv }) => {
    const startTime = Date.now();
    const client = getSanityAdminClient(cfEnv);

    const rawDoc = body?.document;
    if (!rawDoc || rawDoc._type !== 'page') {
      return jsonNoCache({ error: 'Invalid page payload: _type must be "page".' }, 400);
    }
    const doc = sanitizeSanityDocument(rawDoc);

    let existingDoc: any = null;
    if (doc._id) {
      existingDoc = await client.fetch(`*[_id == $id][0]`, { id: doc._id }).catch(() => null);
    }

    // Upsert in Sanity
    const result: any = doc._id ? await client.createOrReplace(doc) : await client.create(doc);

    // Write-Through Cache Update & Edge HTML Purge
    const oldSlug = existingDoc?.slug?.current || '';
    const slugStr = result.slug?.current || (typeof result.slug === 'string' ? result.slug : '');
    const cleanSlug = slugStr.replace(/^\//, '').replace(/\/$/, '') || 'home';
    await syncCmsMutation({
      docType: 'page',
      slug: cleanSlug,
      oldSlug,
      operation: existingDoc ? 'update' : 'create',
      origin: new URL(request.url).origin,
      cfEnv,
    }).catch((e) => console.warn('[CMS Pages POST] Cache sync warning:', e));

    recordAdminAudit(context, {
      adminEmail: auth.user.email,
      action: existingDoc ? 'CMS_PAGE_UPDATE' : 'CMS_PAGE_CREATE',
      targetType: 'page',
      targetId: cleanSlug || result._id,
      before: existingDoc,
      after: result,
      durationMs: Date.now() - startTime,
      cfEnv,
    });

    return jsonNoCache({ success: true, page: result });
  }
);

export const DELETE: APIRoute = defineAdminApi(
  { permission: 'cms:delete' },
  async ({ context, request, url, auth, cfEnv }) => {
    const startTime = Date.now();
    const client = getSanityAdminClient(cfEnv);
    const id = url.searchParams.get('id');

    if (!id) {
      return jsonNoCache({ error: 'Page ID is required for deletion.' }, 400);
    }

    const existingDoc = await client.fetch(`*[_id == $id][0]`, { id }).catch(() => null);
    if (!existingDoc) {
      return jsonNoCache({ error: 'Page document not found.' }, 404);
    }

    const slugStr = existingDoc.slug?.current || '';
    if (slugStr === '/' || slugStr === 'home' || slugStr === '') {
      return jsonNoCache({ error: 'Security Guard: Homepage cannot be deleted.' }, 400);
    }

    await client.delete(id);

    // Evict deleted page from KV & Edge HTML Purge
    const cleanSlug = slugStr.replace(/^\//, '').replace(/\/$/, '');
    await syncCmsMutation({
      docType: 'page',
      slug: cleanSlug,
      operation: 'delete',
      origin: new URL(request.url).origin,
      cfEnv,
    }).catch((e) => console.warn('[CMS Pages DELETE] Cache sync warning:', e));

    recordAdminAudit(context, {
      adminEmail: auth.user.email,
      action: 'CMS_PAGE_DELETE',
      targetType: 'page',
      targetId: cleanSlug || id,
      before: existingDoc,
      durationMs: Date.now() - startTime,
      cfEnv,
    });

    return jsonNoCache({ success: true, message: `Page "${cleanSlug}" deleted successfully.` });
  }
);

