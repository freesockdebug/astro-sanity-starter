// src/pages/api/admin/dicts/[group].ts
// Data Dictionary Item Delete API

import type { APIRoute } from 'astro';
import { defineAdminApi, jsonNoCache } from '@utils/auth';
import { deleteDictItem } from '@utils/db';
import { invalidateDictCache } from '@utils/dicts';
import { recordAdminAudit } from '@db/audit.repo';

export const prerender = false;

export const DELETE: APIRoute = defineAdminApi(
  { permission: 'dicts:manage' },
  async ({ context, params, url, auth, cfEnv }) => {
    const groupCode = params.group;
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
  }
);

