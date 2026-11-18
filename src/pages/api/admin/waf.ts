// src/pages/api/admin/waf.ts
import type { APIRoute } from 'astro';
import { jsonNoCache, defineAdminApi } from '@utils/authGuards';
import {
  VALID_WAF_MODES,
  getSystemSettings,
  updateSystemSettings,
  listErrorLogs,
  getWaf24hSummary,
  recordAdminAudit,
  type WafRuleMode,
} from '@db';
import { EdgeWafService, parseIpList, isValidIpRule, normalizeWafRuleConfig } from '@utils/waf';

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
    const [settings, recentRes, daySummary] = await Promise.all([
      getSystemSettings(cfEnv),
      listErrorLogs({ source: 'EDGE_WAF', limit: 30, page: 1 }, cfEnv),
      getWaf24hSummary(cfEnv),
    ]);

    return jsonNoCache({
      success: true,
      waf_active_modes: settings.waf_active_modes,
      waf_blocked_ips: settings.waf_blocked_ips,
      waf_allow_ips: settings.waf_allow_ips,
      waf_rule_config: normalizeWafRuleConfig(settings.waf_rule_config),
      strikeStats: EdgeWafService.getStrikeStats(),
      activeBans: EdgeWafService.getActiveBans(),
      blocked24hCount: daySummary.totalHits,
      blocked24hEvents: daySummary.eventsCount,
      logs: recentRes.logs,
    });
  }
);

export const POST: APIRoute = defineAdminApi<{
  action?: string;
  ip?: string;
  sim?: Record<string, any>;
  waf_active_modes?: unknown;
  waf_blocked_ips?: unknown;
  waf_allow_ips?: unknown;
  waf_rule_config?: unknown;
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
        activeBans: EdgeWafService.getActiveBans(),
      });
    }

    if (action === 'unban_ip') {
      const targetIp = typeof body?.ip === 'string' ? body.ip.trim() : '';
      if (!targetIp) {
        return jsonNoCache({ error: 'IP address is required.' }, 400);
      }
      EdgeWafService.unbanIp(targetIp);
      recordAdminAudit(context, {
        adminEmail: auth.user.email,
        action: 'UNBAN_WAF_IP',
        targetType: 'SETTINGS',
        targetId: targetIp,
        after: { unbannedIp: targetIp },
        cfEnv,
      });
      return jsonNoCache({
        success: true,
        message: `Unbanned ${targetIp} from edge isolate strike cache.`,
        strikeStats: EdgeWafService.getStrikeStats(),
        activeBans: EdgeWafService.getActiveBans(),
      });
    }

    if (action === 'simulate') {
      const sim = body?.sim && typeof body.sim === 'object' ? body.sim : {};
      const currentSettings = await getSystemSettings(cfEnv);
      const validSet = new Set<string>(VALID_WAF_MODES);
      const simModes = Array.isArray(body?.waf_active_modes)
        ? (body.waf_active_modes.filter((m): m is WafRuleMode => typeof m === 'string' && validSet.has(m)))
        : currentSettings.waf_active_modes;
      const simRuleConfig = body?.waf_rule_config !== undefined
        ? normalizeWafRuleConfig(body.waf_rule_config)
        : normalizeWafRuleConfig(currentSettings.waf_rule_config);

      const rawTarget = typeof sim.pathname === 'string' && sim.pathname.trim() ? sim.pathname.trim() : '/';
      const qIdx = rawTarget.indexOf('?');
      const pathname = qIdx >= 0 ? (rawTarget.slice(0, qIdx) || '/') : rawTarget;
      const search = qIdx >= 0 ? rawTarget.slice(qIdx) : '';

      const simHeaders = new Headers();
      if (typeof sim.userAgent === 'string' && sim.userAgent.trim()) {
        simHeaders.set('user-agent', sim.userAgent.trim());
      }
      if (typeof sim.country === 'string' && sim.country.trim()) {
        simHeaders.set('cf-ipcountry', sim.country.trim().toUpperCase());
      }
      if (typeof sim.headerRaw === 'string' && sim.headerRaw.trim()) {
        for (const line of sim.headerRaw.split(/[\r\n]+/)) {
          const idx = line.indexOf(':');
          if (idx > 0) {
            const k = line.slice(0, idx).trim();
            const v = line.slice(idx + 1).trim();
            if (k) simHeaders.set(k, v);
          }
        }
      }

      const result = EdgeWafService.evaluate(
        {
          clientIp: typeof sim.clientIp === 'string' ? sim.clientIp.trim() : '198.51.100.10',
          pathname: pathname.startsWith('/') ? pathname : `/${pathname}`,
          search,
          method: typeof sim.method === 'string' ? sim.method.toUpperCase() : 'GET',
          userAgent: typeof sim.userAgent === 'string' ? sim.userAgent.trim() : undefined,
          country: typeof sim.country === 'string' ? sim.country.trim().toUpperCase() : undefined,
          headers: simHeaders,
          dryRun: true,
        },
        {
          waf_active_modes: simModes,
          waf_blocked_ips: typeof body?.waf_blocked_ips === 'string' ? body.waf_blocked_ips : currentSettings.waf_blocked_ips,
          waf_allow_ips: typeof body?.waf_allow_ips === 'string' ? body.waf_allow_ips : currentSettings.waf_allow_ips,
          waf_rule_config: simRuleConfig,
        }
      );

      return jsonNoCache({ success: true, result });
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
    const normalizedRuleConfig = body?.waf_rule_config !== undefined
      ? normalizeWafRuleConfig(body.waf_rule_config)
      : normalizeWafRuleConfig(currentSettings.waf_rule_config);

    const before = {
      waf_active_modes: currentSettings.waf_active_modes,
      waf_blocked_ips: currentSettings.waf_blocked_ips,
      waf_allow_ips: currentSettings.waf_allow_ips,
      waf_rule_config: normalizeWafRuleConfig(currentSettings.waf_rule_config),
    };
    const after = {
      waf_active_modes: normalizedModes,
      waf_blocked_ips: blockedParsed.value,
      waf_allow_ips: allowParsed.value,
      waf_rule_config: normalizedRuleConfig,
    };

    const res = await updateSystemSettings(after, auth.user.email, cfEnv);
    if (!res.success) {
      return jsonNoCache({ error: res.error || 'Failed to save WAF rules.' }, 500);
    }
    EdgeWafService.clearLogSuppressions();

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
