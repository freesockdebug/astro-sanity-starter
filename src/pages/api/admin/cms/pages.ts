// src/pages/api/admin/cms/pages.ts
// Direct Sanity Pages & Modular Sections CMS API with Cache Invalidation and Differential Audit Logging
import type { APIRoute } from 'astro';
import { verifyAdminAuth, hasPermission, jsonNoCache } from '@utils/auth';
import { getSanityAdminClient } from '@utils/sanity-admin';
import { PageService } from '@data/page';
import { syncCmsMutation } from '@utils/cmsSync';
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
  const id = url.searchParams.get('id');

  try {
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
  } catch (err: any) {
    console.error('[CMS Pages GET API] Error querying pages:', err);
    return jsonNoCache({ error: err.message || 'Failed to query CMS pages.' }, 500);
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
    if (!doc || doc._type !== 'page') {
      return jsonNoCache({ error: 'Invalid page payload: _type must be "page".' }, 400);
    }

    let existingDoc: any = null;
    if (doc._id) {
      existingDoc = await client.fetch(`*[_id == $id][0]`, { id: doc._id }).catch(() => null);
    }

    // Upsert in Sanity
    let result: any;
    if (doc._id) {
      result = await client.createOrReplace(doc);
    } else {
      result = await client.create(doc);
    }

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

    // Audit Logging
    const diff = computeJsonDiff(existingDoc, result);
    await insertAuditLog({
      admin_email: auth.user.email,
      action: existingDoc ? 'CMS_PAGE_UPDATE' : 'CMS_PAGE_CREATE',
      target_type: 'page',
      target_id: cleanSlug || result._id,
      before_json: existingDoc ? JSON.stringify(existingDoc) : null,
      after_json: JSON.stringify(result),
      diff_json: diff ? JSON.stringify(diff) : null,
      client_ip: request.headers.get('cf-connecting-ip') || '127.0.0.1',
      country: request.headers.get('cf-ipcountry') || 'US',
      duration_ms: Date.now() - startTime,
    }).catch(() => {});

    return jsonNoCache({ success: true, page: result });
  } catch (err: any) {
    console.error('[CMS Pages POST API] Error saving page:', err);
    return jsonNoCache({ error: err.message || 'Failed to save page in Sanity.' }, 500);
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
    return jsonNoCache({ error: 'Page ID is required for deletion.' }, 400);
  }

  try {
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

    // Audit Log
    await insertAuditLog({
      admin_email: auth.user.email,
      action: 'CMS_PAGE_DELETE',
      target_type: 'page',
      target_id: cleanSlug || id,
      before_json: JSON.stringify(existingDoc),
      after_json: null,
      diff_json: JSON.stringify({ deleted: { from: existingDoc.title || cleanSlug, to: null } }),
      client_ip: request.headers.get('cf-connecting-ip') || '127.0.0.1',
      country: request.headers.get('cf-ipcountry') || 'US',
      duration_ms: Date.now() - startTime,
    }).catch(() => {});

    return jsonNoCache({ success: true, message: `Page "${cleanSlug}" deleted successfully.` });
  } catch (err: any) {
    console.error('[CMS Pages DELETE API] Error deleting page:', err);
    return jsonNoCache({ error: err.message || 'Failed to delete page in Sanity.' }, 500);
  }
};

