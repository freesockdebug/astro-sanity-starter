// src/pages/api/admin/cms/upload.ts
// Direct Sanity CDN Asset Uploader & Media Library Query API for CMS
import type { APIRoute } from 'astro';
import { verifyAdminAuth, hasPermission, jsonNoCache } from '@utils/auth';
import { getSanityAdminClient } from '@utils/sanity-admin';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

/**
 * GET /api/admin/cms/upload
 * Query Sanity image assets in cloud media library with search filter and pagination
 */
export const GET: APIRoute = async ({ request, url }) => {
  const auth = await verifyAdminAuth(request, cfEnv);
  if (!auth) {
    return jsonNoCache({ error: 'Unauthorized admin access required.' }, 401);
  }

  if (!hasPermission(auth.adminContext, 'cms:read')) {
    return jsonNoCache({ error: 'Forbidden: Missing cms:read permission.' }, 403);
  }

  try {
    const q = url.searchParams.get('q')?.trim() || '';
    const limitParam = parseInt(url.searchParams.get('limit') || '120', 10);
    const limit = Math.min(Math.max(isNaN(limitParam) ? 120 : limitParam, 1), 500);

    const client = getSanityAdminClient(cfEnv);
    const qFilter = q ? `*${q}*` : '*';

    const assets = await client.fetch(
      `*[_type == "sanity.imageAsset" && ($q == "" || originalFilename match $qFilter || title match $qFilter)]
        | order(_createdAt desc)[0...$limit] {
          _id,
          url,
          originalFilename,
          size,
          mimeType,
          "width": metadata.dimensions.width,
          "height": metadata.dimensions.height,
          _createdAt
        }`,
      { q, qFilter, limit }
    );

    return jsonNoCache({
      success: true,
      assets: assets || [],
      total: assets?.length || 0,
    });
  } catch (err: any) {
    console.error('[CMS Upload GET API] Failed to fetch assets from Sanity:', err);
    return jsonNoCache({ error: err.message || 'Failed to query media library.' }, 500);
  }
};

/**
 * POST /api/admin/cms/upload
 * Upload new image file directly to Sanity CDN
 */
export const POST: APIRoute = async ({ request }) => {
  const auth = await verifyAdminAuth(request, cfEnv);
  if (!auth) {
    return jsonNoCache({ error: 'Unauthorized admin access required.' }, 401);
  }

  if (!hasPermission(auth.adminContext, 'cms:write')) {
    return jsonNoCache({ error: 'Forbidden: Missing cms:write permission.' }, 403);
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file || typeof file === 'string') {
      return jsonNoCache({ error: 'No valid image file uploaded.' }, 400);
    }

    const filename = file.name || 'cms-upload.jpg';
    const contentType = file.type || 'image/jpeg';
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const client = getSanityAdminClient(cfEnv);
    const assetDoc = await client.assets.upload('image', buffer, {
      filename,
      contentType,
    });

    return jsonNoCache({
      success: true,
      asset: {
        _type: 'image',
        asset: {
          _type: 'reference',
          _ref: assetDoc._id,
        },
      },
      url: assetDoc.url,
      id: assetDoc._id,
      originalFilename: assetDoc.originalFilename || filename,
      width: assetDoc.metadata?.dimensions?.width,
      height: assetDoc.metadata?.dimensions?.height,
      size: assetDoc.size,
    });
  } catch (err: any) {
    console.error('[CMS Upload API] Failed to upload asset to Sanity:', err);
    return jsonNoCache({ error: err.message || 'Failed to upload asset to Sanity CDN.' }, 500);
  }
};
