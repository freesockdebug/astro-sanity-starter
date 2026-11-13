// src/pages/api/admin/dicts/[group].ts
// Data Dictionary Item Delete API

import type { APIRoute } from 'astro';
import { verifyAdminAuth, jsonNoCache } from '@utils/auth';
import { hasPermission } from '@utils/rbac';
import { deleteDictItem } from '@utils/db';
import { invalidateDictCache } from '@utils/dicts';
import { recordAdminAudit } from '@db/audit.repo';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false;

export const DELETE: APIRoute = async (context) => {
  const { request, params } = context;
  const auth = await verifyAdminAuth(request, cfEnv);
  if (!auth) {
    return jsonNoCache({ error: 'Forbidden. Admin access required.' }, 403);
  }

  if (!hasPermission(auth.adminContext, 'dicts:manage')) {
    return jsonNoCache({ error: 'Forbidden: Missing dicts:manage permission.' }, 403);
  }

  const groupCode = params.group;
  const url = new URL(request.url);
  const itemKey = url.searchParams.get('itemKey');

  if (!groupCode || !itemKey) {
    return jsonNoCache({ error: 'group and itemKey are required.' }, 400);
  }

  const result = await deleteDictItem(groupCode, itemKey);
  if (!result.success) {
    return jsonNoCache({ error: result.error || 'Failed to delete dictionary item.' }, 400);
  }

  await invalidateDictCache(cfEnv);

  recordAdminAudit(context, {
    adminEmail: auth.user.email,
    action: 'DELETE_DICT_ITEM',
    targetType: 'SYS_DICT_ITEM',
    targetId: `${groupCode}:${itemKey}`,
    before: { groupCode, itemKey },
  });

  return jsonNoCache({ success: true, message: `Dictionary item "${itemKey}" deleted successfully.` });
};

