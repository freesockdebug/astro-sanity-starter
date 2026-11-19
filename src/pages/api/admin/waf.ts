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
  listWafRules,
  listWafIpAcl,
  upsertWafRule,
  toggleWafRule,
  deleteWafRule,
  upsertWafIpAcl,
  deleteWafIpAcl,
  clearWafAutoBansInDb,
  syncWafSettingsToDbTables,
  type WafRuleMode,
} from '@db';
import {
  EdgeWafService,
  buildSystemWafRulesSeed,
  compileWafRuntime,
  mergeActiveTimedBans,
  parseIpList,
  parseLegacyIpListToAcl,
  isValidIpRule,
  normalizeWafRuleConfig,
  type WafDbIpAcl,
} from '@utils/waf';

export const prerender = false;

function deriveAclText(ipAcl: WafDbIpAcl[], type: 'BLACKLIST' | 'WHITELIST'): string {
  return ipAcl
    .filter((r) => r.list_type === type && !r.expires_at)
    .map((r) => r.ip_cidr)
    .join('\n');
}

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
    const [settings, recentRes, daySummary, dbRules, ipAcl] = await Promise.all([
      getSystemSettings(cfEnv),
      listErrorLogs({ source: 'EDGE_WAF', limit: 30, page: 1 }, cfEnv),
      getWaf24hSummary(cfEnv),
      listWafRules(cfEnv),
      listWafIpAcl(cfEnv),
    ]);

    const activeBans = mergeActiveTimedBans(ipAcl);
    const localStats = EdgeWafService.getStrikeStats();

    return jsonNoCache({
      success: true,
      waf_active_modes: settings.waf_active_modes,
      waf_blocked_ips: deriveAclText(ipAcl, 'BLACKLIST') || settings.waf_blocked_ips,
      waf_allow_ips: deriveAclText(ipAcl, 'WHITELIST') || settings.waf_allow_ips,
      waf_rule_config: normalizeWafRuleConfig(settings.waf_rule_config),
      dbRules,
      ipAcl,
      strikeStats: { activeBans: activeBans.length, trackedIps: Math.max(localStats.trackedIps, activeBans.length) },
      activeBans,
      blocked24hCount: daySummary.totalHits,
      blocked24hEvents: daySummary.eventsCount,
      logs: recentRes.logs,
    });
  }
);

export const POST: APIRoute = defineAdminApi<{
  action?: string;
  ip?: string;
  rule?: Record<string, any>;
  ruleId?: string;
  is_enabled?: boolean;
  ipAcl?: Record<string, any>;
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
      await clearWafAutoBansInDb(cfEnv);
      const ipAcl = await listWafIpAcl(cfEnv);
      const activeBans = mergeActiveTimedBans(ipAcl);
      return jsonNoCache({
        success: true,
        message: 'Auto-ban strikes cleared across edge isolate and DB ACL.',
        strikeStats: { activeBans: activeBans.length, trackedIps: 0 },
        activeBans,
        ipAcl,
      });
    }

    if (action === 'unban_ip') {
      const targetIp = typeof body?.ip === 'string' ? body.ip.trim().toLowerCase() : '';
      if (!targetIp) {
        return jsonNoCache({ error: 'IP address is required.' }, 400);
      }
      EdgeWafService.unbanIp(targetIp);
      await deleteWafIpAcl(targetIp, cfEnv);
      const ipAcl = await listWafIpAcl(cfEnv);
      const activeBans = mergeActiveTimedBans(ipAcl);
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
        message: `Unbanned ${targetIp} across edge isolate and DB ACL.`,
        strikeStats: { activeBans: activeBans.length, trackedIps: Math.max(EdgeWafService.getStrikeStats().trackedIps, activeBans.length) },
        activeBans,
        ipAcl,
      });
    }

    if (action === 'upsert_rule') {
      const r = body?.rule && typeof body.rule === 'object' ? body.rule : {};
      const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `cr_${Date.now()}`;
      const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : id;
      const t0 = Date.now();
      const saveRes = await upsertWafRule(
        {
          id,
          category: r.category,
          name,
          is_system: r.is_system ? 1 : 0,
          is_enabled: r.is_enabled === 0 || r.is_enabled === false ? 0 : 1,
          priority: r.priority,
          conditions_json: typeof r.conditions_json === 'string' ? r.conditions_json : JSON.stringify(r.conditions || []),
          match_mode: r.match_mode,
          action: r.action,
          rate_limit_json: typeof r.rate_limit_json === 'string' ? r.rate_limit_json : JSON.stringify(r.rate_limit || {}),
          strike_weight: r.strike_weight,
          expires_at: r.expires_at ?? null,
        },
        auth.user.email,
        cfEnv
      );
      if (!saveRes.success) {
        return jsonNoCache({ error: saveRes.error || 'Failed to save WAF rule.' }, 400);
      }
      const dbRules = await listWafRules(cfEnv);
      recordAdminAudit(context, {
        adminEmail: auth.user.email,
        action: 'UPDATE_WAF_RULES',
        targetType: 'SETTINGS',
        targetId: id,
        after: r,
        durationMs: Date.now() - t0,
        cfEnv,
      });
      return jsonNoCache({ success: true, message: `Saved WAF rule "${name}" to D1 + Edge KV.`, dbRules });
    }

    if (action === 'toggle_rule') {
      const ruleId = typeof body?.ruleId === 'string' ? body.ruleId.trim() : '';
      if (!ruleId) return jsonNoCache({ error: 'ruleId is required.' }, 400);
      const isEnabled = body?.is_enabled !== false;
      const res = await toggleWafRule(ruleId, isEnabled, auth.user.email, cfEnv);
      if (!res.success) return jsonNoCache({ error: res.error || 'Failed to toggle rule.' }, 400);
      const dbRules = await listWafRules(cfEnv);
      return jsonNoCache({ success: true, message: `Rule ${ruleId} ${isEnabled ? 'enabled' : 'disabled'}.`, dbRules });
    }

    if (action === 'delete_rule') {
      const ruleId = typeof body?.ruleId === 'string' ? body.ruleId.trim() : '';
      if (!ruleId) return jsonNoCache({ error: 'ruleId is required.' }, 400);
      const res = await deleteWafRule(ruleId, cfEnv);
      if (!res.success) return jsonNoCache({ error: res.error || 'Failed to delete rule.' }, 400);
      const dbRules = await listWafRules(cfEnv);
      return jsonNoCache({ success: true, message: `Deleted rule ${ruleId}.`, dbRules });
    }

    if (action === 'block_ip_acl') {
      const acl = body?.ipAcl && typeof body.ipAcl === 'object' ? body.ipAcl : {};
      const ipCidr = typeof acl.ip_cidr === 'string' ? acl.ip_cidr.trim() : '';
      if (!ipCidr) return jsonNoCache({ error: 'ip_cidr is required.' }, 400);
      const res = await upsertWafIpAcl(
        {
          ip_cidr: ipCidr,
          list_type: acl.list_type === 'WHITELIST' ? 'WHITELIST' : acl.list_type === 'AUTO_BAN' ? 'AUTO_BAN' : 'BLACKLIST',
          reason: typeof acl.reason === 'string' ? acl.reason : '',
          ttlMinutes: acl.ttlMinutes ? Number(acl.ttlMinutes) : null,
        },
        auth.user.email,
        cfEnv
      );
      if (!res.success) return jsonNoCache({ error: res.error || 'Failed to update IP ACL.' }, 400);
      const ipAcl = await listWafIpAcl(cfEnv);
      const activeBans = mergeActiveTimedBans(ipAcl);
      recordAdminAudit(context, {
        adminEmail: auth.user.email,
        action: 'UPDATE_WAF_RULES',
        targetType: 'SETTINGS',
        targetId: ipCidr,
        after: acl,
        cfEnv,
      });
      return jsonNoCache({
        success: true,
        message: `Updated IP ACL for ${ipCidr}.`,
        ipAcl,
        activeBans,
        waf_blocked_ips: deriveAclText(ipAcl, 'BLACKLIST'),
        waf_allow_ips: deriveAclText(ipAcl, 'WHITELIST'),
      });
    }

    if (action === 'unblock_ip_acl') {
      const ipCidr = typeof body?.ip === 'string' ? body.ip.trim() : '';
      if (!ipCidr) return jsonNoCache({ error: 'ip is required.' }, 400);
      EdgeWafService.unbanIp(ipCidr);
      await deleteWafIpAcl(ipCidr, cfEnv);
      const ipAcl = await listWafIpAcl(cfEnv);
      const activeBans = mergeActiveTimedBans(ipAcl);
      return jsonNoCache({
        success: true,
        message: `Removed ${ipCidr} from IP ACL.`,
        ipAcl,
        activeBans,
        waf_blocked_ips: deriveAclText(ipAcl, 'BLACKLIST'),
        waf_allow_ips: deriveAclText(ipAcl, 'WHITELIST'),
      });
    }

    if (action === 'simulate') {
      const sim = body?.sim && typeof body.sim === 'object' ? body.sim : {};
      const [currentSettings, liveRules, liveAcl] = await Promise.all([
        getSystemSettings(cfEnv),
        listWafRules(cfEnv).catch(() => buildSystemWafRulesSeed()),
        listWafIpAcl(cfEnv).catch(() => [] as WafDbIpAcl[]),
      ]);
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

      // Overlay unsaved UI drafts (IP black/whitelist textareas + rate-limit parameters) onto DB rules & timed bans
      const simBlockedIps = typeof body?.waf_blocked_ips === 'string' ? body.waf_blocked_ips : currentSettings.waf_blocked_ips;
      const simAllowIps = typeof body?.waf_allow_ips === 'string' ? body.waf_allow_ips : currentSettings.waf_allow_ips;
      const timedDbAcl = sim.useDraftOnly === true
        ? []
        : liveAcl.filter((row) => row.list_type === 'AUTO_BAN' || Boolean(row.expires_at));
      const draftPermanentAcl = parseLegacyIpListToAcl(simBlockedIps, simAllowIps);

      const rlOverrides: Record<string, { limit: number; window_s: number; key_by: 'ip'; bucket_prefix: string }> = {
        sys_rl_public_write: { limit: simRuleConfig.rateLimit.publicWriteLimit, window_s: simRuleConfig.rateLimit.windowSeconds, key_by: 'ip', bucket_prefix: 'pub_write' },
        sys_rl_api: { limit: simRuleConfig.rateLimit.apiLimit, window_s: simRuleConfig.rateLimit.windowSeconds, key_by: 'ip', bucket_prefix: 'api' },
        sys_rl_page: { limit: simRuleConfig.rateLimit.pageLimit, window_s: simRuleConfig.rateLimit.windowSeconds, key_by: 'ip', bucket_prefix: 'page' },
      };
      const baseRules = sim.useDraftOnly === true ? buildSystemWafRulesSeed(simRuleConfig) : liveRules;
      const mergedRules = baseRules.map((r) =>
        rlOverrides[r.id] ? { ...r, rate_limit_json: JSON.stringify(rlOverrides[r.id]) } : r
      );
      const simRuntime = compileWafRuntime({
        rules: mergedRules,
        ipAcl: [...timedDbAcl, ...draftPermanentAcl],
      });

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
          waf_blocked_ips: simBlockedIps,
          waf_allow_ips: simAllowIps,
          waf_rule_config: simRuleConfig,
        },
        simRuntime
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
    await syncWafSettingsToDbTables(
      {
        blockedIpsStr: blockedParsed.value,
        allowIpsStr: allowParsed.value,
        ruleConfig: normalizedRuleConfig,
        updatedBy: auth.user.email,
      },
      cfEnv
    );
    EdgeWafService.clearLogSuppressions();
    const [dbRules, ipAcl] = await Promise.all([listWafRules(cfEnv), listWafIpAcl(cfEnv)]);

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
      message: 'Edge WAF rules saved and propagated to DB + Edge KV.',
      settings: after,
      dbRules,
      ipAcl,
      activeBans: mergeActiveTimedBans(ipAcl),
    });
  }
);
