// src/pages/api/admin/dicts/index.ts
// Data Dictionary Management API: Query, Upsert, and KV Invalidation

import type { APIRoute } from 'astro';
import { defineAdminApi, jsonNoCache } from '@utils/auth';
import { listDictGroups, upsertDictItem, toggleDictItemEnabled } from '@utils/db';
import { getDictItems, getAllCachedDictItems, invalidateDictCache } from '@utils/dicts';
import { recordAdminAudit } from '@db/audit.repo';

export const prerender = false;

export const GET: APIRoute = defineAdminApi(
  { permission: 'dicts:read' },
  async ({ url, cfEnv }) => {
    const groupCode = url.searchParams.get('group');
    const onlyEnabled = url.searchParams.get('enabled') === 'true';

    if (groupCode) {
      const items = await getDictItems(cfEnv, groupCode, onlyEnabled);
      return jsonNoCache({ items });
    }

    const [groups, allItems] = await Promise.all([
      listDictGroups(),
      getAllCachedDictItems(cfEnv),
    ]);
    const items = onlyEnabled ? allItems.filter((i) => i.is_enabled) : allItems;

    return jsonNoCache({ groups, items });
  }
);

export const POST: APIRoute = defineAdminApi(
  { permission: 'dicts:manage', parseJson: true },
  async ({ context, auth, body, cfEnv }) => {
    const { action = 'upsert_item', groupCode, itemKey, itemLabel, badgeColor, meta, sortOrder, isEnabled } = body;

    if (!groupCode || !groupCode.trim()) {
      return jsonNoCache({ error: 'groupCode is required.' }, 400);
    }

    if (action === 'toggle_enabled') {
      if (!itemKey) return jsonNoCache({ error: 'itemKey is required.' }, 400);
      await toggleDictItemEnabled(groupCode, itemKey, Boolean(isEnabled));
      await invalidateDictCache(cfEnv);

      recordAdminAudit(context, {
        adminEmail: auth.user.email,
        action: 'UPSERT_DICT_ITEM',
        targetType: 'SYS_DICT_ITEM',
        targetId: `${groupCode}:${itemKey}`,
        after: { isEnabled },
      });

      return jsonNoCache({ success: true, message: `Dict item "${itemKey}" status updated.` });
    }

    if (!itemKey || !itemLabel) {
      return jsonNoCache({ error: 'itemKey and itemLabel are required.' }, 400);
    }

    await upsertDictItem({
      group_code: groupCode,
      item_key: itemKey,
      item_label: itemLabel,
      badge_color: badgeColor || 'slate',
      meta: meta || {},
      sort_order: sortOrder !== undefined ? Number(sortOrder) : 100,
      is_enabled: isEnabled !== false,
    });

    await invalidateDictCache(cfEnv);

    recordAdminAudit(context, {
      adminEmail: auth.user.email,
      action: 'UPSERT_DICT_ITEM',
      targetType: 'SYS_DICT_ITEM',
      targetId: `${groupCode}:${itemKey}`,
      after: { groupCode, itemKey, itemLabel, badgeColor, meta, sortOrder, isEnabled },
    });

    return jsonNoCache({ success: true, message: `Dictionary item "${itemLabel}" saved successfully.` });
  }
);

