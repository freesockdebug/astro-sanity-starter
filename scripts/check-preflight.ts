// scripts/check-preflight.ts
/**
 * 对抗性历史故障巡检与架构文档自演进引擎 (Adversarial Preflight & Co-Evolution Runner)
 *
 * 核心能力：
 * 1. 按改动内容自动路由 (Diff-Aware Routing)：根据 git status/diff 或 --files/--domain 参数，精准定位受影响的架构域 (01~05)，按需执行对应领域的挑刺脚本与单元测试。
 * 2. 对抗性挑刺扫描 (Adversarial Audit)：专抓“能编译但边界必炸”的历史血泪故障（如 img.complete 空 src 陷阱、L0 流未 clone、JOIN ON 跨列 OR、PJAX 漏 shell:page-load、Workers 全局 randomUUID 等）。
 * 3. 脚本 <-> 架构文档强制同步门禁 (Doc Co-Evolution Guard)：任何写入 scripts/audits/*.ts 的历史规则 ID (如 UI-ADV-01)，必须在对应的 docs/0X-*.md 中登记复盘记录，否则门禁直接拦截。
 */
import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  createAuditContext,
  type AuditContext,
  type AuditViolation,
  type DomainAuditSuite,
  type PreflightTest,
} from './audits/types';
import { runCoreInvariantsAudit, InvariantEngine } from './audits/00-core-invariants.audit';
import { edgeCacheAuditSuite } from './audits/01-edge-cache.audit';
import { dbAuthRbacAuditSuite } from './audits/02-db-auth-rbac.audit';
import { cmsI18nSeoAuditSuite } from './audits/03-cms-i18n-seo.audit';
import { storefrontAndShellsAuditSuite } from './audits/04-storefront-and-shells.audit';
import { wafRfqAndOpsAuditSuite } from './audits/05-waf-rfq-and-ops.audit';

export { InvariantEngine };
export type { PreflightTest };

const ALL_SUITES: DomainAuditSuite[] = [
  edgeCacheAuditSuite,
  dbAuthRbacAuditSuite,
  cmsI18nSeoAuditSuite,
  storefrontAndShellsAuditSuite,
  wafRfqAndOpsAuditSuite,
];

/**
 * 全局 PreflightTest 注册表：将 5 大架构域针对 src/ 核心模块的运行时状态一致性与对抗故障注入封装为标准 PreflightTest 实例
 */
export const PREFLIGHT_TEST_REGISTRY: Array<PreflightTest & { domain: DomainAuditSuite['domain'] }> =
  ALL_SUITES.flatMap((suite) => {
    const items: Array<PreflightTest & { domain: DomainAuditSuite['domain'] }> = [];
    if (Array.isArray(suite.preflightTests)) {
      for (const pt of suite.preflightTests) {
        items.push({ ...pt, domain: suite.domain });
      }
    }
    if (typeof suite.verify === 'function') {
      items.push({
        domain: suite.domain,
        name: `${suite.domain}:runtime-consistency-verify`,
        description: `${suite.name} — src/ 生产模块内存级状态一致性与故障注入对抗校验`,
        verify: (ctx: AuditContext) => suite.verify!(ctx),
      });
    }
    return items;
  });

function detectGitChangedFiles(rootDir: string): string[] {
  try {
    const statusOut = execSync('git status --porcelain', {
      cwd: rootDir,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const files = new Set<string>();
    for (const line of statusOut.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const rawPath = line.slice(3).trim();
      const actualPath = rawPath.includes(' -> ') ? rawPath.split(' -> ').pop()!.trim() : rawPath;
      if (actualPath) files.add(actualPath.replace(/^"+|"+$/g, ''));
    }
    return Array.from(files);
  } catch {
    return [];
  }
}

function resolveTargetSuites(
  changedFiles: string[],
  domainArg?: string,
  forceFull = false
): { suites: DomainAuditSuite[]; modeLabel: string } {
  if (forceFull) {
    return { suites: ALL_SUITES, modeLabel: 'FULL (全量 5 大架构域对抗巡检)' };
  }

  if (domainArg) {
    const matched = ALL_SUITES.filter(
      (s) => s.domain.startsWith(domainArg) || s.domain.includes(domainArg)
    );
    if (matched.length > 0) {
      return {
        suites: matched,
        modeLabel: `DOMAIN-TARGETED (指定领域: ${matched.map((s) => s.domain).join(', ')})`,
      };
    }
  }

  if (changedFiles.length === 0) {
    return { suites: ALL_SUITES, modeLabel: 'FULL (未检测到局部未提交改动，默认执行全量 5 大域巡检)' };
  }

  const matchedSuites = ALL_SUITES.filter((suite) =>
    changedFiles.some((file) => suite.triggerPatterns.some((pattern) => pattern.test(file)))
  );

  if (matchedSuites.length === 0) {
    return { suites: ALL_SUITES, modeLabel: 'FULL (改动跨公共基础文件，升级为全量 5 大域巡检)' };
  }

  return {
    suites: matchedSuites,
    modeLabel: `DIFF-ROUTED (根据 ${changedFiles.length} 个改动文件自动路由至 ${matchedSuites.length} 个架构域)`,
  };
}

function checkRuleDocumentationSync(
  suites: DomainAuditSuite[],
  readFile: (relPath: string) => string
): AuditViolation[] {
  const violations: AuditViolation[] = [];
  const protectedFiles = [
    'agent.md',
    'tech.md',
    'docs/00-module-template.md',
    'docs/01-edge-cache.md',
    'docs/02-db-auth-rbac.md',
    'docs/03-cms-i18n-seo.md',
    'docs/04-storefront-and-shells.md',
    'docs/05-waf-rfq-and-ops.md',
    'scripts/audits/00-core-invariants.audit.ts',
  ];

  for (const pf of protectedFiles) {
    const content = readFile(pf);
    if (!content || content.trim().length < 100) {
      violations.push({
        ruleId: 'DOC-ANTI-DELETE-GUARD',
        domain: '05-waf-rfq-and-ops',
        docPath: 'agent.md',
        title: `核心架构文档或历史公理巡检文件 [${pf}] 被删除或被异常清空！`,
        historicalContext:
          '架构红线第 8 条 (只增不擅删公理)：严禁未经用户明确确认擅自删除既有架构文档、章节表格或历史 Pitfall 巡检模块。',
        file: pf,
        remediation: `立即恢复 ${pf} 的完整内容；若确需废弃，必须先向用户列出原因并获得明确确认后再同步调整。`,
      });
    }
  }

  for (const suite of suites) {
    const docContent = readFile(suite.docPath);
    for (const rule of suite.rules) {
      if (!docContent || !docContent.includes(rule.id)) {
        violations.push({
          ruleId: 'DOC-SYNC-GUARD',
          domain: suite.domain,
          docPath: suite.docPath,
          title: `历史挑刺规则 [${rule.id}] 尚未同步登记至架构设计文档 ${suite.docPath}`,
          historicalContext:
            '仅将故障写入检查脚本而不同步更新对应的架构专篇，会导致后续排查同类问题时缺乏上下文文档指引。',
          file: suite.docPath,
          remediation: `打开 ${suite.docPath}，在「历史故障与对抗挑刺规则索引」章节中补充 [${rule.id}] ${rule.title} 的根因与定位说明。`,
        });
      }
    }
    if (typeof suite.verify === 'function') {
      const verifyId = `${suite.domain}:runtime-consistency-verify`;
      if (!docContent || !docContent.includes(verifyId)) {
        violations.push({
          ruleId: 'DOC-SYNC-GUARD',
          domain: suite.domain,
          docPath: suite.docPath,
          title: `内存级运行时故障注入测试 [${verifyId}] 尚未同步登记至架构设计文档 ${suite.docPath}`,
          historicalContext:
            '所有注册在 PREFLIGHT_TEST_REGISTRY 中的运行时 verify() 故障注入钩子必须在对应架构专篇索引表中留痕。',
          file: suite.docPath,
          remediation: `打开 ${suite.docPath}，在「历史故障与对抗挑刺规则索引」表格中补充 [${verifyId}] 的故障注入场景说明。`,
        });
      }
    }
  }
  return violations;
}

async function main() {
  const startTime = Date.now();
  const rootDir = process.cwd();
  const args = process.argv.slice(2);

  const isFast = args.includes('--fast') || args.includes('--skip-ts');
  const isFull = args.includes('--full');
  const domainArg = args.find((a) => a.startsWith('--domain='))?.split('=')[1];
  const filesArg = args.find((a) => a.startsWith('--files='))?.split('=')[1];

  const changedFiles = filesArg
    ? filesArg.split(',').map((s) => s.trim()).filter(Boolean)
    : detectGitChangedFiles(rootDir);

  const { suites, modeLabel } = resolveTargetSuites(changedFiles, domainArg, isFull);
  const ctx = createAuditContext(rootDir, changedFiles, isFull || suites.length === ALL_SUITES.length);

  console.log('======================================================================');
  console.log('🛡️  对抗性历史故障巡检与架构自演进门禁 (check-preflight)');
  console.log(`📌 巡检模式: ${modeLabel}`);
  if (changedFiles.length > 0) {
    console.log(`📂 感知改动 (${changedFiles.length}): ${changedFiles.slice(0, 6).join(', ')}${changedFiles.length > 6 ? ' ...' : ''}`);
  }
  console.log(`🎯 命中架构域: 00-core-invariants | ${suites.map((s) => s.domain).join(' | ')}`);
  console.log('======================================================================');

  // 0. 执行基础公理化引擎全量检查 (Sections 0~6: 四大 AST 探针自检、Studio 36 项 Preview 模糊测试、Pitfalls 1~24、i18n 树同构、dist/ 拓扑闭包与脱敏审计)
  const coreResult = await runCoreInvariantsAudit();
  if (coreResult.errorCount > 0) {
    console.error(`\n🚨 [PREFLIGHT BLOCKED] 基础公理化巡检 (00-core-invariants) 发现 ${coreResult.errorCount} 个致命阻断问题！`);
    process.exit(1);
  }

  const allViolations: AuditViolation[] = [];
  let totalRulesChecked = 0;
  let totalVerifyHooksRan = 0;

  console.log('\n\x1b[1m\x1b[36m=== 7. 五大正交架构域对抗探针、内存故障注入 verify() 与文档同步巡检 ===\x1b[0m');

  // 1. 执行命中架构域的静态对抗挑刺规则
  for (const suite of suites) {
    for (const rule of suite.rules) {
      totalRulesChecked++;
      const ruleViolations = rule.check(ctx);
      allViolations.push(...ruleViolations);
    }
  }

  // 2. 执行命中架构域的内存级运行时故障注入 (suite.verify() & suite.preflightTests)
  for (const suite of suites) {
    if (Array.isArray(suite.preflightTests)) {
      for (const pt of suite.preflightTests) {
        totalVerifyHooksRan++;
        const ptViolations = await pt.verify(ctx);
        allViolations.push(...ptViolations);
      }
    }
    if (typeof suite.verify === 'function') {
      totalVerifyHooksRan++;
      const verifyViolations = await suite.verify(ctx);
      allViolations.push(...verifyViolations);
    }
  }

  // 3. 执行「挑刺脚本 <-> 架构设计文档 docs/0X-*.md」双向同步守卫
  const docSyncViolations = checkRuleDocumentationSync(suites, ctx.readFile);
  allViolations.push(...docSyncViolations);

  if (allViolations.length > 0) {
    console.error(`\n🚨 [PREFLIGHT BLOCKED] 对抗性巡检发现 ${allViolations.length} 项架构红线/历史故障违规：\n`);
    allViolations.forEach((v, idx) => {
      const loc = v.line ? `${v.file}:${v.line}` : v.file;
      console.error(`  ${idx + 1}. [${v.ruleId}] ${v.title}`);
      console.error(`     📍 位置: ${loc}`);
      if (v.snippet) {
        console.error(`     🔍 代码: ${v.snippet}`);
      }
      console.error(`     💥 历史故障根因: ${v.historicalContext}`);
      console.error(`     🛠️ 修复方案: ${v.remediation}`);
      console.error(`     📖 关联架构文档: ${v.docPath}\n`);
    });
    process.exit(1);
  }

  console.log(
    `\x1b[32m✔ [PASS]\x1b[0m 5 大架构域静态对抗挑刺 (${totalRulesChecked} 条探针)、内存故障注入 verify() (${totalVerifyHooksRan} 个领域) 与文档同步检查全部通过`
  );

  // 4. 在非 --fast 模式下执行命中领域的完整单元测试套件 (注: TS 增量类型检查已在 Section 0.2 进程内完成)
  if (!isFast) {
    const targetTests = Array.from(new Set(suites.flatMap((s) => s.unitTestFiles)));
    console.log(`\n\x1b[1m\x1b[36m=== 8. 命中领域运行时对抗单测套件 (${targetTests.join(', ')}) ===\x1b[0m`);
    const testRes = spawnSync('npx', ['tsx', '--test', ...targetTests], {
      cwd: rootDir,
      stdio: 'inherit',
    });
    if (testRes.status !== 0) {
      console.error('🚨 [PREFLIGHT BLOCKED] 领域运行时对抗单测未通过！');
      process.exit(testRes.status || 1);
    }
    console.log('\x1b[32m✔ [PASS]\x1b[0m 领域运行时对抗单测全部通过');
  } else {
    console.log('\x1b[90m⚡ [--fast] 已完成 Section 0~4 + Section 7 (24 项 Pitfalls + 20 条领域探针 + 5 域内存 verify())，跳过完整单测子进程\x1b[0m');
  }

  const elapsedMs = Date.now() - startTime;
  const touchedDocs = suites.map((s) => s.docPath).join(', ');
  console.log('\n======================================================================');
  console.log(`\x1b[32m\x1b[1m🎉 [PREFLIGHT PASSED] 全链路公理化 + 领域对抗巡检全部通过！(错误: 0, 告警: ${coreResult.warnCount}, 耗时 ${elapsedMs}ms)\x1b[0m`);
  console.log(`📚 架构演进提示: 若本次修复了新类型故障，请确认已同步沉淀至 scripts/audits/ 并更新 [${touchedDocs}]`);
  console.log('======================================================================');
}

main().catch((err) => {
  console.error('🚨 [PREFLIGHT CRASHED]', err);
  process.exit(1);
});
