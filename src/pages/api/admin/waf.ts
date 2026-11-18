// src/pages/api/admin/waf.ts
import type { APIRoute } from 'astro';
import { jsonNoCache, defineAdminApi } from '@utils/authGuards';
import {
  VALID_WAF_MODES,
  getSystemSettings,
  updateSystemSettings,
  listErrorLogs,
  recordAdminAudit,
  type WafRuleMode,
} from '@db';
import { EdgeWafService, parseIpList, isValidIpRule } from '@utils/waf';

export const prerender = false;

function normalizeIpListInput(raw: unknown): { value: string; invalid: string[] } {
  const tokens = parseIpList(typeof raw === 'string' ? raw : '');
  const invalid = tokens.filter((t) => !isValidIpRule(t));
  return {
    value: tokens.join('\n'),
    invalid,
  };
}

export const GET: APIRoute = defineAdminApi(
  {
    menu: 'waf',
  },
  async ({ cfEnv }) => {
    const [settings, recentRes, dayRes] = await Promise.all([
      getSystemSettings(cfEnv),
      listErrorLogs({ source: 'EDGE_WAF', limit: 30, page: 1 }, cfEnv),
      listErrorLogs({ source: 'EDGE_WAF', timeWindow: '24h', limit: 1, page: 1 }, cfEnv),
    ]);

    return jsonNoCache({
      success: true,
      waf_active_modes: settings.waf_active_modes,
      waf_blocked_ips: settings.waf_blocked_ips,
      waf_allow_ips: settings.waf_allow_ips,
      strikeStats: EdgeWafService.getStrikeStats(),
      blocked24hCount: dayRes.total,
      logs: recentRes.logs,
    });
  }
);

export const POST: APIRoute = defineAdminApi<{
  action?: string;
  waf_active_modes?: unknown;
  waf_blocked_ips?: unknown;
  waf_allow_ips?: unknown;
}>(
  {
    permission: 'waf:manage',
    parseJson: true,
  },
  async ({ context, auth, body, cfEnv }) => {
    const action = body?.action || 'save_rules';

    if (action === 'clear_strikes') {
      EdgeWafService.clearAllStrikes();
      return jsonNoCache({
        success: true,
        message: 'Edge isolate auto-ban strikes cleared.',
        strikeStats: EdgeWafService.getStrikeStats(),
      });
    }

    if (action !== 'save_rules') {
      return jsonNoCache({ error: `Unsupported WAF action: ${String(action)}` }, 400);
    }

    if (!Array.isArray(body?.waf_active_modes)) {
      return jsonNoCache({ error: 'waf_active_modes must be an array.' }, 400);
    }

    const validSet = new Set<string>(VALID_WAF_MODES);
    const invalidModes = body.waf_active_modes.filter((m) => typeof m !== 'string' || !validSet.has(m));
    if (invalidModes.length > 0) {
      return jsonNoCache({ error: `Invalid WAF mode(s): ${invalidModes.join(', ')}` }, 400);
    }
    const normalizedModes = Array.from(new Set(body.waf_active_modes as WafRuleMode[]));

    const blockedParsed = normalizeIpListInput(body.waf_blocked_ips);
    if (blockedParsed.invalid.length > 0) {
      return jsonNoCache(
        { error: `Invalid blocked IP/CIDR entry: ${blockedParsed.invalid.slice(0, 3).join(', ')}` },
        400
      );
    }

    const allowParsed = normalizeIpListInput(body.waf_allow_ips);
    if (allowParsed.invalid.length > 0) {
      return jsonNoCache(
        { error: `Invalid whitelist IP/CIDR entry: ${allowParsed.invalid.slice(0, 3).join(', ')}` },
        400
      );
    }

    const t0 = Date.now();
    const currentSettings = await getSystemSettings(cfEnv);
    const before = {
      waf_active_modes: currentSettings.waf_active_modes,
      waf_blocked_ips: currentSettings.waf_blocked_ips,
      waf_allow_ips: currentSettings.waf_allow_ips,
    };
    const after = {
      waf_active_modes: normalizedModes,
      waf_blocked_ips: blockedParsed.value,
      waf_allow_ips: allowParsed.value,
    };

    const res = await updateSystemSettings(after, auth.user.email, cfEnv);
    if (!res.success) {
      return jsonNoCache({ error: res.error || 'Failed to save WAF rules.' }, 500);
    }

    recordAdminAudit(context, {
      adminEmail: auth.user.email,
      action: 'UPDATE_WAF_RULES',
      targetType: 'SETTINGS',
      targetId: 'edge_waf',
      before,
      after,
      durationMs: Date.now() - t0,
      cfEnv,
    });

    return jsonNoCache({
      success: true,
      message: 'Edge WAF rules saved and propagated.',
      settings: after,
    });
  }
);
