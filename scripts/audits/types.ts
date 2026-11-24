// scripts/audits/types.ts
import fs from 'node:fs';
import path from 'node:path';

export type AuditDomainId =
  | '01-edge-cache'
  | '02-db-auth-rbac'
  | '03-cms-i18n-seo'
  | '04-storefront-and-shells'
  | '05-waf-rfq-and-ops';

export interface AuditViolation {
  ruleId: string;
  domain: AuditDomainId;
  docPath: string;
  title: string;
  historicalContext: string;
  file: string;
  line?: number;
  snippet?: string;
  remediation: string;
}

export interface AdversarialRule {
  /** 唯一规则编号，例如 UI-ADV-01，必须同步登记在对应的 docs/0X-*.md 中 */
  id: string;
  domain: AuditDomainId;
  docPath: string;
  title: string;
  /** 该规则对应的历史真实踩坑背景或第一性原理风险 */
  historicalContext: string;
  /** 精确修复指引 */
  remediation: string;
  /** 执行对抗性挑刺检查，返回发现的所有违规项 */
  check: (ctx: AuditContext) => AuditViolation[];
}

export interface PreflightTest {
  /** 测试用例唯一名称 */
  name: string;
  /** 对抗性验证目标描述 */
  description: string;
  /** 执行运行时状态一致性与故障注入校验，返回违规列表 */
  verify: (ctx: AuditContext) => Promise<AuditViolation[]>;
}

export interface DomainAuditSuite {
  domain: AuditDomainId;
  name: string;
  docPath: string;
  /** 改动哪些路径模式时自动触发本领域的挑刺脚本 */
  triggerPatterns: RegExp[];
  /** 关联的运行时单元测试文件 */
  unitTestFiles: string[];
  /** 静态源码对抗挑刺规则集 */
  rules: AdversarialRule[];
  /** 结构化运行时对抗测试用例注册表 (PreflightTest[]) */
  preflightTests?: PreflightTest[];
  /**
   * 内存级运行时故障注入与边界对抗校验 (In-Process Adversarial Fault-Injection Hook)
   * 注意：放在 scripts/audits/ 而非生产 src/ 目录，确保生产 Cloudflare Worker 打包体积零膨胀。
   */
  verify?: (ctx: AuditContext) => Promise<AuditViolation[]>;
}

export interface AuditContext {
  rootDir: string;
  changedFiles: string[];
  isFullScan: boolean;
  readFile: (relPath: string) => string;
  fileExists: (relPath: string) => boolean;
  listFiles: (dirRelPath: string, extFilter?: RegExp) => string[];
}

export function createAuditContext(rootDir: string, changedFiles: string[], isFullScan: boolean): AuditContext {
  const fileCache = new Map<string, string>();

  const readFile = (relPath: string): string => {
    const cleanRel = relPath.replace(/^\/+/, '');
    if (fileCache.has(cleanRel)) return fileCache.get(cleanRel)!;
    const abs = path.join(rootDir, cleanRel);
    if (!fs.existsSync(abs)) return '';
    const content = fs.readFileSync(abs, 'utf-8');
    fileCache.set(cleanRel, content);
    return content;
  };

  const fileExists = (relPath: string): boolean => {
    const cleanRel = relPath.replace(/^\/+/, '');
    return fs.existsSync(path.join(rootDir, cleanRel));
  };

  const listFiles = (dirRelPath: string, extFilter?: RegExp): string[] => {
    const cleanRel = dirRelPath.replace(/^\/+/, '');
    const absDir = path.join(rootDir, cleanRel);
    if (!fs.existsSync(absDir)) return [];
    const results: string[] = [];

    const walk = (currentAbs: string, currentRel: string) => {
      const entries = fs.readdirSync(currentAbs, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git' || entry.name === '.astro') {
          continue;
        }
        const nextAbs = path.join(currentAbs, entry.name);
        const nextRel = path.posix.join(currentRel, entry.name);
        if (entry.isDirectory()) {
          walk(nextAbs, nextRel);
        } else if (!extFilter || extFilter.test(nextRel)) {
          results.push(nextRel);
        }
      }
    };

    walk(absDir, cleanRel);
    return results.sort();
  };

  return {
    rootDir,
    changedFiles,
    isFullScan,
    readFile,
    fileExists,
    listFiles,
  };
}

/**
 * 辅助函数：定位正则匹配在文件中的行号与代码片段（自动忽略单行注释行）
 */
export function findLineMatches(
  content: string,
  pattern: RegExp,
  options: { ignoreComments?: boolean } = { ignoreComments: true }
): Array<{ line: number; snippet: string }> {
  const lines = content.split(/\r?\n/);
  const matches: Array<{ line: number; snippet: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    if (options.ignoreComments && (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*'))) {
      continue;
    }
    pattern.lastIndex = 0;
    if (pattern.test(rawLine)) {
      matches.push({ line: i + 1, snippet: trimmed.slice(0, 140) });
    }
  }
  return matches;
}
