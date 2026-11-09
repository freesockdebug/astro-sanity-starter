// src/pages/api/admin/cms/upload.ts
// Direct Sanity CDN Asset Uploader for CMS Products & Pages
import type { APIRoute } from 'astro';
import { verifyAdminAuth, hasPermission, jsonNoCache } from '@utils/auth';
import { getSanityAdminClient } from '@utils/sanity-admin';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

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
    });
  } catch (err: any) {
    console.error('[CMS Upload API] Failed to upload asset to Sanity:', err);
    return jsonNoCache({ error: err.message || 'Failed to upload asset to Sanity CDN.' }, 500);
  }
};

