// scripts/audits/05-waf-rfq-and-ops.audit.ts
import type { AuditViolation, DomainAuditSuite } from './types';
import { findLineMatches } from './types';

const DOC_PATH = 'docs/05-waf-rfq-and-ops.md';
const DOMAIN = '05-waf-rfq-and-ops' as const;

/**
 * 检测 TypeScript 文件中是否在模块顶层作用域（花括号深度 === 0）直接调用了 crypto.randomUUID()
 */
function findTopLevelRandomUuidCalls(content: string): Array<{ line: number; snippet: string }> {
  const lines = content.split(/\r?\n/);
  let braceDepth = 0;
  const violations: Array<{ line: number; snippet: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      continue;
    }

    if (braceDepth === 0 && /\bcrypto\.randomUUID\s*\(/.test(rawLine) && !/=>\s*crypto\.randomUUID/.test(rawLine)) {
      violations.push({ line: i + 1, snippet: trimmed });
    }

    // 简易花括号深度追踪（剔除单行字符串字面量干扰）
    const codeOnly = rawLine.replace(/(['"`])(?:(?!\1|\\).|\\.)*\1/g, '');
    for (const ch of codeOnly) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    }
  }
  return violations;
}

export const wafRfqAndOpsAuditSuite: DomainAuditSuite = {
  domain: DOMAIN,
  name: '边缘预编译 WAF、B2B 询盘链路、Workers 运行时红线与文档同步对抗审计',
  docPath: DOC_PATH,
  triggerPatterns: [
    /^src\/utils\/(waf|rfqNotify|webhook|security|tier|shipping|logger)\.ts$/,
    /^src\/pages\/api\/(submit-quote|telemetry|client-error|geo)\.ts$/,
    /^src\/shims\//,
    /^test\//,
    /^scripts\//,
    /^docs\/05-waf-rfq-and-ops\.md$/,
    /^agents?\.md$/i,
    /^tech\.md$/,
    /^package(-lock)?\.json$/,
    /^\.github\/workflows\//,
  ],
  unitTestFiles: ['test/waf.test.ts', 'test/security.test.ts'],
  rules: [
    {
      id: 'OPS-ADV-01',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '严禁使用 Astro v6 已废弃的 context.locals.runtime.env',
      historicalContext:
        'Astro v6 + @astrojs/cloudflare 已彻底移除 locals.runtime.env，访问该属性会在运行时直接抛错中断请求。',
      remediation:
        '统一通过 import { env } from "cloudflare:workers" 获取边缘运行时环境变量与绑定。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const srcFiles = ctx.listFiles('src', /\.(ts|astro)$/);
        for (const file of srcFiles) {
          const content = ctx.readFile(file);
          const matches = findLineMatches(content, /\blocals\.runtime\.env\b/);
          for (const m of matches) {
            violations.push({
              ruleId: 'OPS-ADV-01',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: '检测到已废弃的 locals.runtime.env 访问',
              historicalContext: 'Astro v6 下访问 locals.runtime.env 会抛出运行时异常。',
              file,
              line: m.line,
              snippet: m.snippet,
              remediation: '改用 import { env as cfEnv } from "cloudflare:workers"。',
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'OPS-ADV-02',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'Cloudflare Workers 模块顶层全局作用域严禁调用 crypto.randomUUID()',
      historicalContext:
        '历史部署事故：在模块顶层写了 const ISOLATE_ID = crypto.randomUUID()，导致 Cloudflare Workers 启动阶段抛出 Disallowed operation called within global scope 崩溃。',
      remediation:
        '将 crypto.randomUUID() 封装进惰性初始化函数（如 getIsolateId()），仅在请求到达后的函数体内部调用。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const tsFiles = ctx.listFiles('src', /\.ts$/);
        for (const file of tsFiles) {
          const content = ctx.readFile(file);
          if (!content.includes('randomUUID')) continue;
          const matches = findTopLevelRandomUuidCalls(content);
          for (const m of matches) {
            violations.push({
              ruleId: 'OPS-ADV-02',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: '检测到在模块顶层全局作用域直接调用 crypto.randomUUID()',
              historicalContext: 'Cloudflare Workers 严禁在全局作用域生成随机熵或发起 I/O。',
              file,
              line: m.line,
              snippet: m.snippet,
              remediation: '移入请求期惰性调用函数内部（braceDepth > 0）。',
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'OPS-ADV-03',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '外部网络调用 (Resend / IM Webhook / Sanity / Turnstile) 刚性超时熔断挑刺',
      historicalContext:
        '任何跨公网外部 API 调用若未挂载 AbortSignal.timeout(6000)，当第三方服务挂起时会一直阻塞边缘 Worker 直至买手端 504 Gateway Timeout。',
      remediation:
        '在所有外部 fetch 调用处挂载 signal: AbortSignal.timeout(6000) 并捕获超时降级。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const outboundFiles = [
          'src/utils/rfqNotify.ts',
          'src/utils/webhook.ts',
          'src/utils/sanity-client.ts',
          'src/pages/cdn-image/[...path].ts',
          'src/pages/api/submit-quote.ts',
        ];

        for (const file of outboundFiles) {
          const content = ctx.readFile(file);
          if (!content) continue;
          if (/\bfetch\s*\(/.test(content) && !content.includes('AbortSignal.timeout')) {
            violations.push({
              ruleId: 'OPS-ADV-03',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: '出站网络通信模块包含 fetch() 但缺失 AbortSignal.timeout 刚性超时熔断',
              historicalContext: '外部依赖不可靠假定：无超时的外部 fetch 会拖死 Worker 实例。',
              file,
              remediation: '为该模块中的外部 fetch 挂载 signal: AbortSignal.timeout(6000)。',
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'OPS-ADV-04',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'EdgeWafService ReDoS 正则安全防线与旧站路径 FAST-404 免 Strike 契约挑刺',
      historicalContext:
        '管理员自定义正则若未经过 validateRegexSafety 检测会引发 ReDoS 阻塞 V8；旧站 /product-tag/* 若被当成恶意攻击累加 Strike，会误封正常爬取旧外链的 Googlebot。',
      remediation:
        '在 src/utils/waf.ts 中保持 validateRegexSafety 安全编译降级与 sys_legacy_cms_paths 的 FAST-404 免 Strike 快路。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const wafCode = ctx.readFile('src/utils/waf.ts');
        const mwCode = ctx.readFile('src/middleware.ts');
        if (!wafCode) return violations;

        if (!wafCode.includes('validateRegexSafety') || !wafCode.includes('sys_legacy_cms_paths') || (mwCode && !mwCode.includes('FAST-404'))) {
          violations.push({
            ruleId: 'OPS-ADV-04',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: '缺失 validateRegexSafety ReDoS 防护或 sys_legacy_cms_paths FAST-404 快路',
            historicalContext: '会导致恶意正则卡死线程或误封搜索引擎爬虫。',
            file: 'src/utils/waf.ts',
            remediation: '确保 validateRegexSafety、sys_legacy_cms_paths 与 middleware FAST-404 分支完整保留。',
          });
        }
        return violations;
      },
    },
    {
      id: 'OPS-ADV-05',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'package.json 与 package-lock.json 依赖树严格同步锁挑刺 (防 GitHub Actions npm ci EUSAGE 崩溃)',
      historicalContext:
        '历史 CI 故障：使用 bun 或手动修改 package.json 新增依赖（如 postgres、rollup-plugin-visualizer、web-vitals、tsx）后未同步更新 package-lock.json，推送 GitHub 后触发 GitHub Actions `npm ci` 直接抛出 `npm error code EUSAGE: Missing from lock file` 导致部署流水线中断。',
      remediation:
        '每次修改 package.json 依赖后必须运行 `npm install --package-lock-only` 同步锁文件，并确保 check/test 脚本依赖的 tsx 已写入 devDependencies。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const pkgRaw = ctx.readFile('package.json');
        const lockRaw = ctx.readFile('package-lock.json');
        if (!pkgRaw || !lockRaw) {
          violations.push({
            ruleId: 'OPS-ADV-05',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: '缺失 package.json 或 package-lock.json',
            historicalContext: 'GitHub Actions `npm ci` 强依赖 package-lock.json。',
            file: 'package-lock.json',
            remediation: '运行 `npm install --package-lock-only` 生成完整的 package-lock.json。',
          });
          return violations;
        }

        try {
          const pkg = JSON.parse(pkgRaw);
          const lock = JSON.parse(lockRaw);
          const rootLockEntry = lock.packages?.[''] || {};
          const lockPackages = lock.packages || {};

          const allDeclaredDeps: Array<{ name: string; version: string; section: 'dependencies' | 'devDependencies' }> = [
            ...Object.entries(pkg.dependencies || {}).map(([name, version]) => ({
              name,
              version: String(version),
              section: 'dependencies' as const,
            })),
            ...Object.entries(pkg.devDependencies || {}).map(([name, version]) => ({
              name,
              version: String(version),
              section: 'devDependencies' as const,
            })),
          ];

          const missingInLock: string[] = [];
          for (const dep of allDeclaredDeps) {
            const rootDeclared =
              rootLockEntry.dependencies?.[dep.name] || rootLockEntry.devDependencies?.[dep.name];
            const nodeModuleResolved = lockPackages[`node_modules/${dep.name}`];
            if (!rootDeclared || !nodeModuleResolved) {
              missingInLock.push(`${dep.name}@${dep.version}`);
            }
          }

          if (missingInLock.length > 0) {
            violations.push({
              ruleId: 'OPS-ADV-05',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `package.json 与 package-lock.json 不同步，以下依赖在锁文件中缺失: ${missingInLock.join(', ')}`,
              historicalContext:
                'GitHub Actions 执行 `npm ci` 时要求 package.json 与 package-lock.json 100% 同步，否则会立即抛出 EUSAGE 错误中断构建。',
              file: 'package-lock.json',
              remediation: '在根目录执行 `npm install --package-lock-only` 更新 package-lock.json 后再提交代码。',
            });
          }
        } catch (err: any) {
          violations.push({
            ruleId: 'OPS-ADV-05',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: `解析 package.json 或 package-lock.json 失败: ${err?.message || String(err)}`,
            historicalContext: '锁文件 JSON 损坏会导致 CI 无法安装依赖。',
            file: 'package-lock.json',
            remediation: '修复 JSON 格式并运行 `npm install --package-lock-only`。',
          });
        }
        return violations;
      },
    },
    {
      id: 'OPS-ADV-06',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '前端遥测端点 /api/telemetry 命名脱敏、反向代理同源校验与 127.0.0.1 本地调试免写日志挑刺',
      historicalContext:
        '1) 若前端遥测端点路径包含 "error"（如 /api/client-error），即使返回 202 也会被开发容器日志扫描器按字符串匹配误报为运行时错误；2) 反向代理下 url.host 为 localhost:3000 而 Origin 为公网代理域名，需兼容 sec-fetch-site 与 x-forwarded-host；3) 127.0.0.1 本地调试与自动化测试流量若写入 system_error_logs 会污染线上诊断日志表。',
      remediation:
        '前端统一上报至 `/api/telemetry`（`src/pages/api/telemetry.ts`），同时兼容 `sec-fetch-site` 与 `x-forwarded-host`，并在 `telemetry.ts`、`logger.ts`、`logs.repo.ts` 中通过 `isLocalLoopbackIp` 拦截 `127.0.0.1` 本地调试流量免写日志。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const telemetryCode = ctx.readFile('src/pages/api/telemetry.ts');
        if (
          !telemetryCode ||
          !telemetryCode.includes('x-forwarded-host') ||
          !telemetryCode.includes('sec-fetch-site') ||
          !telemetryCode.includes('isLocalLoopbackIp')
        ) {
          violations.push({
            ruleId: 'OPS-ADV-06',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/pages/api/telemetry.ts 缺失反向代理同源校验 (x-forwarded-host / sec-fetch-site) 或 127.0.0.1 免写日志守卫 (isLocalLoopbackIp)',
            historicalContext: '反向代理下会导致 403 Forbidden origin，且 127.0.0.1 本地调试请求会污染诊断日志表。',
            file: 'src/pages/api/telemetry.ts',
            remediation: '在 src/pages/api/telemetry.ts 中校验 isLocalLoopbackIp、sec-fetch-site 与 x-forwarded-host。',
          });
        }

        const logsRepoCode = ctx.readFile('src/db/logs.repo.ts');
        if (!logsRepoCode || !logsRepoCode.includes('isLocalLoopbackIp')) {
          violations.push({
            ruleId: 'OPS-ADV-06',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/db/logs.repo.ts 缺失 isLocalLoopbackIp 本地 127.0.0.1 调试日志过滤守卫',
            historicalContext: '127.0.0.1 本地调试测试流量写入数据库会污染线上错误与慢请求统计。',
            file: 'src/db/logs.repo.ts',
            remediation: '在 prepareLogEntry 中使用 isLocalLoopbackIp(input.clientIp) 过滤 127.0.0.1 本地调试流量。',
          });
        }

        const astroCfg = ctx.readFile('astro.config.mjs');
        if (astroCfg && !astroCfg.includes('checkOrigin: false')) {
          violations.push({
            ruleId: 'OPS-ADV-06',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'astro.config.mjs 未显式设置 security: { checkOrigin: false }',
            historicalContext: 'Astro v6 SSR 默认启用 checkOrigin: true，在反向代理 HTTPS -> HTTP 转发下会拦截表单/Beacon POST 请求返回 403。',
            file: 'astro.config.mjs',
            remediation: '在 astro.config.mjs 中配置 security: { checkOrigin: false }（由自定义中间件与 API 守卫接管同源校验）。',
          });
        }

        return violations;
      },
    },
  ],
  verify: async () => {
    const violations: AuditViolation[] = [];
    const { validateRegexSafety } = await import('../../src/utils/waf.js');
    const { SecurityService } = await import('../../src/utils/security.js');

    // 故障注入 1: 注入灾难性回溯 ReDoS 正则 `(a+)+$` -> 必须在预编译阶段拒绝
    const redosCheck = validateRegexSafety('(a+)+$');
    if (redosCheck.valid) {
      violations.push({
        ruleId: 'OPS-ADV-04',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '运行时对抗故障注入失败: validateRegexSafety 未能拦截嵌套量词灾难性回溯正则 (a+)+$',
        historicalContext: '恶意或配置错误的嵌套量词正则会在单次畸形请求下锁死 Cloudflare Worker V8 主线程。',
        file: 'src/utils/waf.ts',
        remediation: '检查 validateRegexSafety 中的嵌套量词与长度校验逻辑。',
      });
    }

    // 故障注入 2: 注入云厂商元数据内网 SSRF 地址 `https://169.254.169.254/latest/meta-data/` -> 必须拦截
    if (SecurityService.isSafeWebhookUrl('https://169.254.169.254/latest/meta-data/')) {
      violations.push({
        ruleId: 'OPS-ADV-03',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '运行时对抗故障注入失败: SecurityService.isSafeWebhookUrl 未能阻断 169.254.169.254 内网元数据 SSRF 攻击地址',
        historicalContext: '管理员 Webhook 若允许指向链路本地或私有网段，会造成内网 SSRF 探测风险。',
        file: 'src/utils/security.ts',
        remediation: '检查 SecurityService.isSafeWebhookUrl 的私有/保留 IP 黑名单正则。',
      });
    }

    return violations;
  },
};
