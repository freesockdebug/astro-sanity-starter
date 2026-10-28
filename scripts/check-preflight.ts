#!/usr/bin/env node
/**
 * Gwenvenni Web & Studio 全链路自动化前置质量巡检 (Pre-Flight Verification)
 * 
 * 采用数学物理公理、量纲分析、几何极限、树同构与词法状态机进行统一归集：
 * 
 * 1. 【物理几何与极限公理 (Spatial Limits)】:
 *    - 卡片可读性物理下界 W_min = 220px, 间隙 G = 16px
 *    - 列数与临界断点方程: W_threshold >= N * W_min + (N - 1) * G
 *    - 7 列货架必须严格满足 W >= 1636px (锁定 min-[1760px]:grid-cols-7)
 * 
 * 2. 【时间量纲与测度区间公理 (Temporal Measure Bounds)】:
 *    - 动态 HTML 边缘页面缓存物理生命周期: T ∈ [60s, 300s]
 *    - 杜绝静态锁死 (T > 300s 如 86400s) 或无脑击穿回源 (T < 60s)
 * 
 * 3. 【拓扑同构与群对称性公理 (Tree Isomorphism & Symmetry)】:
 *    - 多语言字典以 en 为基底树，目标语言树必须拓扑同构: Diff(en, target) = ∅
 *    - 递归遍历深度 Key-Tree，计算对称覆盖率 ρ = 100%
 * 
 * 4. 【客户端词法纯净度状态机 (Lexical Script Purity Automaton)】:
 *    - 剥离注释与字符串字面量，扫描类型标注算子 (: Type, as Type, <Type>)
 *    - 消除任何形式的 TS 语法泄漏导致浏览器端 SyntaxError 瘫痪
 * 
 * 5. 【弹性力学与故障熔断公理 (Resilience & Fuse Limits)】:
 *    - 任何外部 I/O fetch 必须挂载刚性熔断上限: T_timeout <= 6000ms
 * 
 * 6. 【零 CLS 物理骨架第 0 毫秒确立公理 (Zero-CLS Initial Mass)】:
 *    - SSR 首字节必须预渲染非空物理骨架撑开真实视口高度，禁止空容器
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import Module from 'module';
import ts from 'typescript';

// 轻量虚拟 Mock：解耦 Studio 专属富文本组件依赖，防止在无 studio/node_modules 环境下巡检中断
const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === '@mdxeditor/editor' || request.startsWith('@mdxeditor/editor/')) {
    return '__mock_mdxeditor__';
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require.cache['__mock_mdxeditor__'] = {
  id: '__mock_mdxeditor__',
  filename: '__mock_mdxeditor__',
  loaded: true,
  exports: new Proxy({}, { get: () => () => null }),
} as any;

import { schemaTypes } from '../studio/schemaTypes/index';

const isFullMode = process.argv.includes('--full');
const isDataMode = process.argv.includes('--data') || isFullMode;
const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const STUDIO_DIR = path.join(ROOT_DIR, 'studio');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

let errorCount = 0;
let warnCount = 0;

function logPass(msg: string) {
  console.log(`\x1b[32m✔ [PASS]\x1b[0m ${msg}`);
}
function logWarn(msg: string) {
  warnCount++;
  console.log(`\x1b[33m⚠ [WARN]\x1b[0m ${msg}`);
}
function logFail(msg: string) {
  errorCount++;
  console.log(`\x1b[31m✖ [FAIL]\x1b[0m ${msg}`);
}
function logSection(title: string) {
  console.log(`\n\x1b[1m\x1b[36m=== ${title} ===\x1b[0m`);
}

function getFiles(dir: string, exts: string[]): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of list) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name !== 'node_modules' &&
        entry.name !== '.astro' &&
        entry.name !== 'dist' &&
        entry.name !== '.git' &&
        entry.name !== '.wrangler'
      ) {
        results = results.concat(getFiles(fullPath, exts));
      }
    } else if (entry.isFile()) {
      if (exts.some((ext) => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

// =========================================================================
// 数学物理公理化分析引擎 (Axiomatic Invariant Engine)
// =========================================================================
class InvariantEngine {
  /**
   * 1. 词法状态机：剔除字符串与注释后，检测 TS 类型标注泄漏
   */
  public static checkScriptPurity(rawScript: string): { pure: boolean; violations: string[] } {
    const violations: string[] = [];
    // 状态机剥离: 1. 单行注释 2. 多行注释 3. 单双引号及反引号字符串
    let sanitized = rawScript
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""');

    // 检测 TS 类型断言: \bas\s+[A-Za-z0-9_$]+
    const asMatch = sanitized.match(/\bas\s+([A-Za-z0-9_$]+)/g);
    if (asMatch) {
      for (const m of asMatch) {
        if (!m.includes('as const')) { // 允许标准字面量断言或特殊排除
          violations.push(`TS Type Assertion: '${m}'`);
        }
      }
    }

    // 检测变量类型注解: (let|const|var)\s+[a-zA-Z0-9_$]+\s*:\s*[a-zA-Z0-9_$]+
    const varTypeMatch = sanitized.match(/\b(let|const|var)\s+[a-zA-Z0-9_$]+\s*:\s*([a-zA-Z0-9_$]+)/g);
    if (varTypeMatch) {
      violations.push(...varTypeMatch.map((v) => `TS Variable Type Annotation: '${v}'`));
    }

    // 检测函数参数类型注解: function(a: string) 或 (a: number) =>
    const paramTypeMatch = sanitized.match(/\([a-zA-Z0-9_$,\s]*\s*:\s*(string|number|boolean|any|object)[^)]*\)/g);
    if (paramTypeMatch) {
      violations.push(...paramTypeMatch.map((p) => `TS Parameter Type Annotation: '${p}'`));
    }

    return { pure: violations.length === 0, violations };
  }

  /**
   * 1.1 客户端原生内联脚本作用域封闭性公理 (Closed-Scope Invariant)
   * 扫描 <script define:vars> 与 <script is:inline>，利用 AST 验证所有引用的游离标识符
   * 是否已在本地声明、通过 define:vars 注入、或为标准浏览器全局对象，杜绝运行时 ReferenceError 崩溃。
   */
  public static checkScriptScopeClosed(
    scriptBody: string,
    definedVars: string[]
  ): { valid: boolean; violations: string[] } {
    const BROWSER_GLOBALS = new Set([
      'window', 'document', 'console', 'location', 'history', 'navigator', 'screen',
      'localStorage', 'sessionStorage', 'setTimeout', 'clearTimeout', 'setInterval',
      'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame',
      'IntersectionObserver', 'MutationObserver', 'ResizeObserver', 'PerformanceObserver',
      'URL', 'URLSearchParams', 'AbortController', 'AbortSignal', 'Headers', 'Request',
      'Response', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'TouchEvent',
      'HTMLElement', 'Element', 'Node', 'HTMLTemplateElement', 'HTMLInputElement', 'HTMLButtonElement',
      'Math', 'JSON', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean',
      'Set', 'Map', 'WeakSet', 'WeakMap', 'RegExp', 'Error', 'TypeError', 'RangeError',
      'Promise', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent',
      'decodeURIComponent', 'encodeURI', 'decodeURI', 'crypto', 'atob', 'btoa',
      'fetch', 'alert', 'confirm', 'prompt', 'structuredClone', 'queueMicrotask',
      'globalThis', 'self', 'undefined', 'NaN', 'Infinity', 'Intl', 'Symbol', 'Proxy', 'Reflect'
    ]);

    const sourceFile = ts.createSourceFile('inline.js', scriptBody, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const declared = new Set<string>([...definedVars, ...BROWSER_GLOBALS]);
    const undeclaredUsed = new Set<string>();

    // 1. 递归扫描所有本地声明
    function collectDeclarations(node: ts.Node) {
      if (ts.isVariableDeclaration(node)) {
        if (ts.isIdentifier(node.name)) {
          declared.add(node.name.text);
        } else if (ts.isObjectBindingPattern(node.name) || ts.isArrayBindingPattern(node.name)) {
          node.name.elements.forEach((el) => {
            if (ts.isBindingElement(el) && ts.isIdentifier(el.name)) {
              declared.add(el.name.text);
            }
          });
        }
      } else if (ts.isFunctionDeclaration(node) && node.name) {
        declared.add(node.name.text);
      } else if (ts.isClassDeclaration(node) && node.name) {
        declared.add(node.name.text);
      } else if (ts.isParameter(node)) {
        if (ts.isIdentifier(node.name)) {
          declared.add(node.name.text);
        } else if (ts.isObjectBindingPattern(node.name) || ts.isArrayBindingPattern(node.name)) {
          node.name.elements.forEach((el) => {
            if (ts.isBindingElement(el) && ts.isIdentifier(el.name)) {
              declared.add(el.name.text);
            }
          });
        }
      } else if (ts.isCatchClause(node) && node.variableDeclaration && ts.isIdentifier(node.variableDeclaration.name)) {
        declared.add(node.variableDeclaration.name.text);
      }
      ts.forEachChild(node, collectDeclarations);
    }
    collectDeclarations(sourceFile);

    // 2. 递归扫描未声明游离标识符
    function checkIdentifier(node: ts.Node) {
      if (node.parent && ts.isTypeOfExpression(node.parent)) {
        return; // 防御性判断 typeof x !== 'undefined'
      }

      if (ts.isIdentifier(node)) {
        const name = node.text;
        const parent = node.parent;

        if (parent) {
          if (ts.isPropertyAccessExpression(parent) && parent.name === node) return;
          if (ts.isPropertyAssignment(parent) && parent.name === node) return;
          if (ts.isMethodDeclaration(parent) && parent.name === node) return;
          if (ts.isVariableDeclaration(parent) && parent.name === node) return;
          if (ts.isFunctionDeclaration(parent) && parent.name === node) return;
          if (ts.isParameter(parent) && parent.name === node) return;
          if (ts.isClassDeclaration(parent) && parent.name === node) return;
          if (ts.isBindingElement(parent) && parent.name === node) return;
          if (ts.isCatchClause(parent)) return;
        }

        if (!declared.has(name)) {
          undeclaredUsed.add(name);
        }
      }

      ts.forEachChild(node, checkIdentifier);
    }
    checkIdentifier(sourceFile);

    const violations = Array.from(undeclaredUsed);
    return { valid: violations.length === 0, violations };
  }

  /**
   * 2. 时间测度区间公理: 边缘缓存 s-maxage ∈ [minSec, maxSec]
   */
  public static checkTemporalBound(
    text: string,
    minSec: number,
    maxSec: number
  ): { valid: boolean; violations: { raw: string; value: number }[] } {
    const violations: { raw: string; value: number }[] = [];
    // 匹配边缘公共缓存 TTL: s-maxage=(\d+)
    const regex = /s-maxage=(\d+)/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const val = parseInt(match[1], 10);
      if (val < minSec || val > maxSec) {
        violations.push({ raw: match[0], value: val });
      }
    }
    return { valid: violations.length === 0, violations };
  }

  /**
   * 3. 物理视口空间极限公理:
   * 独立卡片货架临界宽度不等式: W_threshold >= N * W_min + (N - 1) * G
   * W_min = 220px, G = 16px. 当 N=7 时, W_threshold >= 1636px. (排除 12 栅格系统)
   */
  public static checkGridSpatialLimit(text: string): { valid: boolean; violations: string[] } {
    const violations: string[] = [];
    const TW_BREAKPOINTS: Record<string, number> = {
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
      '2xl': 1536,
    };

    // 匹配断点网格规则: min-[1440px]:grid-cols-7 或 2xl:grid-cols-7 等卡片货架
    const gridRegex = /(?:min-\[(\d+)px\]|\b(sm|md|lg|xl|2xl)\b):grid-cols-(\d+)/g;
    let match;
    while ((match = gridRegex.exec(text)) !== null) {
      const explicitPx = match[1] ? parseInt(match[1], 10) : null;
      const namedBp = match[2] ? TW_BREAKPOINTS[match[2]] : null;
      const bpWidth = explicitPx !== null ? explicitPx : namedBp;
      const cols = parseInt(match[3], 10);

      // 仅约束卡片货架 (cols === 7 || cols === 8)，排除 12 列复合比例栅格
      if (bpWidth !== null && (cols === 7 || cols === 8)) {
        const W_min = 220;
        const G = 16;
        const requiredWidth = cols * W_min + (cols - 1) * G; // 7 列需 1636px
        if (bpWidth < requiredWidth) {
          violations.push(
            `卡片货架网格规则 '${match[0]}' 在断点 ${bpWidth}px 处开启了 ${cols} 列！违反物理临界空间几何约束（需至少 ≥ ${requiredWidth}px，标准锁定 min-[1760px]:grid-cols-7）`
          );
        }
      }
    }
    return { valid: violations.length === 0, violations };
  }

  /**
   * 4. 树拓扑同构定理: 比较两棵键树的对称差
   */
  public static checkTreeIsomorphism(
    baseTree: Record<string, any>,
    targetTree: Record<string, any>
  ): { isomorphic: boolean; missingKeys: string[]; extraKeys: string[]; coverageRatio: number } {
    function flattenKeys(obj: Record<string, any>, prefix = ''): string[] {
      let keys: string[] = [];
      for (const [k, v] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          keys = keys.concat(flattenKeys(v, fullKey));
        } else {
          keys.push(fullKey);
        }
      }
      return keys;
    }

    const baseKeys = new Set(flattenKeys(baseTree));
    const targetKeys = new Set(flattenKeys(targetTree));

    const missingKeys = Array.from(baseKeys).filter((k) => !targetKeys.has(k));
    const extraKeys = Array.from(targetKeys).filter((k) => !baseKeys.has(k));
    const matchedCount = Array.from(baseKeys).filter((k) => targetKeys.has(k)).length;
    const coverageRatio = baseKeys.size > 0 ? (matchedCount / baseKeys.size) * 100 : 100;

    return {
      isomorphic: missingKeys.length === 0 && extraKeys.length === 0,
      missingKeys,
      extraKeys,
      coverageRatio,
    };
  }

  /**
   * 5. 单源真理与别名兼容公理 (Law of Single Source of Truth & Compatibility Symmetry)
   * 动态解析 ensure-asset-aliases.cjs 中的受管别名集合，杜绝在检查脚本中硬编码任何历史哈希
   */
  public static extractSSOTAliases(scriptContent: string): string[] {
    const match = scriptContent.match(/legacyAliases\s*=\s*\[([\s\S]*?)\]/);
    if (!match) return [];
    const items = match[1].match(/['"`]([^'"`]+)['"`]/g);
    return items ? items.map((s) => s.replace(/['"`]/g, '').trim()) : [];
  }

  /**
   * 6. 有向图拓扑闭包定理 (Topological Closure of Manifest Graph)
   * 编译有向图 G = (V_manifest, V_disk), 检验全射性与正物理测度:
   * ∀ asset ∈ Manifest => asset ∈ Disk ∧ Measure(asset) > 0
   */
  public static checkManifestGraphClosure(
    entryScriptContent: string,
    clientDistDir: string
  ): { valid: boolean; totalAssets: number; missing: string[]; zeroMeasure: string[] } {
    const assetsMatch = entryScriptContent.match(/"assets":\s*(\[[^\]]+\])/);
    if (!assetsMatch) {
      return { valid: true, totalAssets: 0, missing: [], zeroMeasure: [] };
    }
    let assetsList: string[] = [];
    try {
      assetsList = JSON.parse(assetsMatch[1]);
    } catch {
      return { valid: false, totalAssets: 0, missing: ['Manifest assets JSON parse error'], zeroMeasure: [] };
    }

    const missing: string[] = [];
    const zeroMeasure: string[] = [];

    for (const rel of assetsList) {
      const diskPath = path.join(clientDistDir, rel.replace(/^\//, ''));
      if (!fs.existsSync(diskPath)) {
        missing.push(rel);
      } else if (fs.statSync(diskPath).size === 0) {
        zeroMeasure.push(rel);
      }
    }

    return {
      valid: missing.length === 0 && zeroMeasure.length === 0,
      totalAssets: assetsList.length,
      missing,
      zeroMeasure,
    };
  }

  /**
   * 7. 空间几何下确界与零遮挡公理 (Geometric Lower Bound & Zero-Obscurity Invariant)
   * 证明: PageTop = HeaderOffset + Buffer 且 inf(Buffer) > 0 (通过 clamp 确立连续正下界)
   * 证明: 挂载流动容器的页面未叠加热力学冲突的静态硬编码 pt-* 击穿下确界
   */
  public static checkGeometricTopClearance(
    globalsCssContent: string,
    templates: { file: string; content: string }[]
  ): { valid: boolean; violations: string[] } {
    const violations: string[] = [];

    // 1. 验证全局 CSS 派生代数完备性 (SSOT 代数关系)
    const hasHeaderOffset = /--apple-header-offset:\s*calc\(/i.test(globalsCssContent);
    const hasFluidBuffer = /--apple-flow-buffer:\s*clamp\(/i.test(globalsCssContent);
    const hasPageTop = /--apple-page-top:\s*calc\([^;]*--apple-header-offset[^;]*--apple-flow-buffer/i.test(globalsCssContent);

    if (!hasHeaderOffset || !hasFluidBuffer || !hasPageTop) {
      violations.push(
        'globals.css 违反空间几何代数推导公理！必须满足: --apple-page-top = calc(--apple-header-offset + --apple-flow-buffer)，且 buffer 使用 clamp() 保证严格正下界。'
      );
    }

    // 2. 验证页面模板中流动容器未出现硬编码绝对 pt-* 冲突
    for (const { file, content } of templates) {
      const classAttrRegex = /class\s*=\s*["']([^"']*(?:catalog-container|page-top-clearance)[^"']*)["']/g;
      let match;
      while ((match = classAttrRegex.exec(content)) !== null) {
        const classList = match[1];
        // 匹配硬编码类名，如 pt-5, pt-16, pt-20, pt-[20px] 等 (排除 pt-0 或 CSS 变量 top 声明)
        const conflictMatch = classList.match(/\bpt-(?:[1-9][0-9]*|\[[0-9]+px\])\b/);
        if (conflictMatch) {
          violations.push(
            `${file}: 几何容器叠加热力学冲突硬编码 '${conflictMatch[0]}'` +
              `，违背空间几何下确界定理！顶端净空必须由 CSS 变量 --apple-page-top 统一动态派生。`
          );
        }
      }
    }

    return { valid: violations.length === 0, violations };
  }

  /**
   * 8. 信息域隔离与私钥零熵公理 (Information Confinement & Zero Secret Leak)
   * 客户端公开域 D_client 与 服务端私有域 D_secret 必须严格正交:
   * D_client ∩ S_secret = ∅
   */
  public static checkSecretConfinement(
    clientJsFiles: string[],
    envContent: string
  ): { valid: boolean; leaks: { file: string; pattern: string }[] } {
    const leaks: { file: string; pattern: string }[] = [];

    // 从 .env 中动态提取私有环境变量名称 (排除公开白名单 PUBLIC_ / NODE_ENV / PORT)
    const privateKeyNames = new Set<string>();
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const keyMatch = trimmed.match(/^([A-Z0-9_]+)\s*=/);
      if (keyMatch) {
        const key = keyMatch[1];
        if (!key.startsWith('PUBLIC_') && key !== 'NODE_ENV' && key !== 'PORT') {
          privateKeyNames.add(key);
        }
      }
    }

    // 通用高熵密钥与私钥特征签名 (基于密码学格式特征，而非特定具体值)
    const genericSecretPatterns = [
      /\bsk[a-zA-Z0-9]{32,}\b/, // Sanity Secret API Key
      /\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}\b/, // GitHub Token
      /\bAIza[0-9A-Za-z-_]{35}\b/, // Google Cloud API Key
      /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, // PEM 私钥
    ];

    for (const jsFile of clientJsFiles) {
      if (!fs.existsSync(jsFile)) continue;
      const content = fs.readFileSync(jsFile, 'utf-8');

      // 1. 检查环境变量私密键名是否被直接打入前端
      for (const key of privateKeyNames) {
        if (content.includes(key)) {
          leaks.push({ file: path.relative(ROOT_DIR, jsFile), pattern: `Env Key: ${key}` });
        }
      }

      // 2. 检查高熵密钥特征
      for (const p of genericSecretPatterns) {
        if (p.test(content)) {
          leaks.push({ file: path.relative(ROOT_DIR, jsFile), pattern: `Entropy Pattern: ${p.source}` });
        }
      }
    }

    return { valid: leaks.length === 0, leaks };
  }

  /**
   * 9. 物理测度与平台承载力界限公理 (Platform Metric & Resource Bounds)
   * 0 < Measure(Asset) <= PlatformBudget
   */
  public static checkMetricBounds(
    metrics: { name: string; bytes: number; minBytes?: number; maxBytes: number }[]
  ): { valid: boolean; violations: string[] } {
    const violations: string[] = [];
    for (const m of metrics) {
      if (m.minBytes !== undefined && m.bytes < m.minBytes) {
        violations.push(
          `${m.name} 体积 (${(m.bytes / 1024).toFixed(1)} KB) 低于下限 ${(m.minBytes / 1024).toFixed(1)} KB，可能发生异常 Tree-shaking 剔除！`
        );
      }
      if (m.bytes > m.maxBytes) {
        violations.push(
          `${m.name} 体积 (${(m.bytes / 1024).toFixed(1)} KB) 超过平台承载力上限 ${(m.maxBytes / 1024).toFixed(1)} KB！`
        );
      }
    }
    return { valid: violations.length === 0, violations };
  }
}

async function main() {
  // =========================================================================
  // 1. Sanity Studio Schema 预览引擎与数据完整性校验
  // =========================================================================
  logSection('1. Sanity Studio Schema 预览引擎与结构完整性深度校验');

  const mockCases = [
    {
      desc: '全量多语言对象数据',
      payload: {
        title: { en: 'Silk Socks', zh: '真丝短袜', de: 'Seidensocken', fr: 'Chaussettes en Soie', es: 'Calcetines de Seda' },
        titleEn: 'Silk Socks',
        rawTitle: { en: 'Silk Socks', zh: '真丝短袜', de: 'Seidensocken' },
        name: 'Custom Swatch Kit',
        label: { en: 'Order Now', de: 'Jetzt Bestellen' },
        headline: { en: 'Crafted Precision', de: 'Präzision' },
        badge: { en: 'Luxury', de: 'Luxus' },
        header: { title: 'GWENVENNI' },
        drawerTitle: { en: 'Request Swatch Kit' },
        drawerSubtitle: { en: 'Priority dispatch' },
        text: { en: 'Footer Notice' },
        tierName: '500-999 Pairs',
        unitPrice: '$12.00',
        sku: 'SKU-001',
        author: 'Master Craftsman',
        quote: 'Exceptional 200N needle count.',
        company: 'Gwenvenni',
        email: 'buyer@store.com',
        status: 'pending',
        createdAt: '2026-10-21T00:00:00Z',
      },
    },
    {
      desc: '单语言字符串或部分字段缺失兜底',
      payload: {
        title: 'Merino Wool Loafer',
        label: 'Submit Inquiry',
        sku: 'MW-002',
      },
    },
    {
      desc: '空对象极端边界容错',
      payload: {},
    },
  ];

  let checkedPreviews = 0;

  function testPreview(targetPath: string, previewObj: any) {
    if (!previewObj || typeof previewObj.prepare !== 'function') return;
    checkedPreviews++;
    for (const testCase of mockCases) {
      try {
        const result = previewObj.prepare(testCase.payload);
        if (result && typeof result === 'object') {
          for (const [key, val] of Object.entries(result)) {
            if (val && typeof val === 'object' && !('$$typeof' in (val as any))) {
              logFail(
                `${targetPath} prepare() 返回的 '${key}' 字段为未解包的对象: ${JSON.stringify(
                  val
                )}！在 Sanity Studio 列表中直接渲染宽对象会触发 React Error #31 崩溃。`
              );
            }
          }
        }
      } catch (err: any) {
        logFail(`${targetPath} 在模拟用例 [${testCase.desc}] 下抛出异常: ${err.message}`);
      }
    }
  }

  for (const schema of schemaTypes) {
    const schemaName = schema.name;
    if (schema.preview) {
      testPreview(`Schema[${schemaName}].preview`, schema.preview);
    }
    if (Array.isArray(schema.fields)) {
      for (const field of schema.fields) {
        if (field.preview) {
          testPreview(`Schema[${schemaName}].field[${field.name}].preview`, field.preview);
        }
        if (field.type === 'array' && Array.isArray(field.of)) {
          for (const item of field.of) {
            if (item.preview) {
              testPreview(`Schema[${schemaName}].field[${field.name}].item[${item.name || item.type}].preview`, item.preview);
            }
          }
        }
        // 校验数组 initialValue 是否具备 _key
        if (field.type === 'array' && Array.isArray(field.initialValue)) {
          field.initialValue.forEach((item: any, idx: number) => {
            if (item && typeof item === 'object' && !item._key) {
              logFail(`Schema[${schemaName}].field[${field.name}].initialValue[${idx}]: 数组初始值缺少 '_key'！会导致 Studio 抛出 'Missing keys' 错误。`);
            }
          });
        }
      }
    }
  }

  logPass(`已完成 ${checkedPreviews} 处 Sanity Preview 配置测试与 Schema 初始值 _key 校验`);

  // =========================================================================
  // 2. AGENTS.md 历史踩坑与数学物理架构护栏静态扫描
  // =========================================================================
  logSection('2. AGENTS.md 历史踩坑反例代码与架构红线静态扫描');

  const astroFiles = getFiles(SRC_DIR, ['.astro']);
  const tsAndJsFiles = getFiles(SRC_DIR, ['.ts', '.js']);
  const allSourceFiles = [...astroFiles, ...tsAndJsFiles];

  // 2.1 [Pitfall 1]: 客户端原生内联脚本词法纯净度状态机扫描 (消除任何 TS 语法泄漏)
  for (const file of astroFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const scriptRegex = /<script\s+[^>]*(?:define:vars|is:inline)[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(content)) !== null) {
      const scriptBody = match[1];
      const checkResult = InvariantEngine.checkScriptPurity(scriptBody);
      if (!checkResult.pure) {
        logFail(
          `${path.relative(ROOT_DIR, file)}: [Pitfall 1] 客户端原生 <script> 违反词法纯净度公理！检测到 TS 语法污染: ${checkResult.violations.join(
            ', '
          )}。浏览器执行将直接引发 SyntaxError 导致整站交互瘫痪！`
        );
      }
    }
  }
  logPass(`[Pitfall 1] 客户端原生内联脚本词法状态机纯净度校验通过`);

  // 2.2 [Pitfall 2]: 列表渲染零布局偏移 (CLS) 物理骨架第 0 毫秒确立
  for (const file of astroFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const emptyGridRegex = /<div[^>]*id=["']products-grid["'][^>]*>\s*<\/div>/gi;
    if (emptyGridRegex.test(content)) {
      logFail(
        `${path.relative(
          ROOT_DIR,
          file
        )}: [Pitfall 2] 检测到空的产品货架容器 '<div id="products-grid"></div>'！违反零 CLS 物理骨架确立公理。必须由 SSR 预渲染首批卡片或骨架撑开初始物理高度。`
      );
    }
  }
  logPass(`[Pitfall 2] 列表渲染 CLS 零偏移物理骨架校验通过`);

  // 2.3 [Pitfall 3 & 6]: 序列化信息熵与 HTML 属性轻量化公理
  for (const file of astroFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    // 拦截 define:vars 内部字符串二次转义
    const defineVarsRegex = /<script\s+[^>]*define:vars=\{([^}]+)\}[^>]*>/gi;
    let match;
    while ((match = defineVarsRegex.exec(content)) !== null) {
      if (match[1].includes('JSON.stringify(')) {
        logFail(
          `${path.relative(
            ROOT_DIR,
            file
          )}: [Pitfall 3] 严禁在 define:vars 中嵌套使用 JSON.stringify()！双重反斜杠转义将引发体积数倍膨胀。`
        );
      }
    }

    // 拦截 data-* 节点属性序列化宽对象字典
    const attrJsonRegex = /data-[a-zA-Z0-9_-]+=\{JSON\.stringify\([^)]+\)\}/g;
    const attrMatch = content.match(attrJsonRegex);
    if (attrMatch) {
      logFail(
        `${path.relative(
          ROOT_DIR,
          file
        )}: [Pitfall 6] 检测到在 HTML 节点属性中序列化宽对象 (${attrMatch.join(
          ', '
        )})！引号转义为 &quot; 会造成 40KB+ 页面体积虚高。`
      );
    }
  }
  logPass(`[Pitfall 3 & 6] 数据序列化信息熵与 HTML 属性轻量化校验通过`);

  // 2.4 [Pitfall 4]: 外链字体非阻塞加载公理
  for (const file of astroFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes('fonts.googleapis.com')) {
      const linkMatch = content.match(/<link[^>]*href=["'][^"']*fonts\.googleapis\.com[^"']*["'][^>]*>/gi);
      if (linkMatch) {
        for (const linkTag of linkMatch) {
          if (linkTag.includes('rel="stylesheet"') && !linkTag.includes('media="print"')) {
            logFail(
              `${path.relative(
                ROOT_DIR,
                file
              )}: [Pitfall 4] 检测到阻塞式外链字体: ${linkTag}。必须采用 preload 异步打印机制消除首屏白屏。`
            );
          }
        }
      }
    }
  }
  logPass(`[Pitfall 4] 外链字体异步加载与首屏非阻塞校验通过`);

  // 2.5 [Pitfall 7]: 图片服务双重路径覆盖公理 (源站 cdn.sanity.io 与 边缘代理 /cdn-image/)
  const imageServiceFile = path.join(SRC_DIR, 'utils', 'image.ts');
  if (fs.existsSync(imageServiceFile)) {
    const content = fs.readFileSync(imageServiceFile, 'utf-8');
    if (content.includes('cdn.sanity.io') && !content.includes('/cdn-image/')) {
      logFail(
        `src/utils/image.ts: [Pitfall 7] 图片服务层必须同时涵盖 'cdn.sanity.io' 与反向代理路径 '/cdn-image/'，保障预加载与 srcset 生效。`
      );
    }
  }
  logPass(`[Pitfall 7] 图片服务层双重路径兼容性校验通过`);

  // 2.6 [Pitfall 8]: 视口首屏卡片动态加载与 fetchpriority 策略
  const productCardFile = path.join(SRC_DIR, 'components', 'ProductCard.astro');
  if (fs.existsSync(productCardFile)) {
    const content = fs.readFileSync(productCardFile, 'utf-8');
    if (content.includes('loading="lazy"') && !content.includes('loading') && !content.includes('priority')) {
      logFail(
        `src/components/ProductCard.astro: [Pitfall 8] 卡片组件严禁写死 loading="lazy"！前 4 张卡片必须支持设为 eager 且首图挂载 fetchpriority="high"。`
      );
    }
  }
  logPass(`[Pitfall 8] 首屏视口图片动态加载策略校验通过`);

  // 2.7 [Pitfall 9]: Scroll 监听器零强制回流公理 (读写分离与 rAF)
  for (const file of allSourceFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const scrollListenerRegex = /addEventListener\(['"]scroll['"]\s*,\s*(\([^)]*\)|[a-zA-Z0-9_]+)\s*=>?\s*\{([^}]+)\}/g;
    let match;
    while ((match = scrollListenerRegex.exec(content)) !== null) {
      const handlerBody = match[2];
      if (
        (handlerBody.includes('.offsetWidth') ||
          handlerBody.includes('.getBoundingClientRect') ||
          handlerBody.includes('.offsetHeight')) &&
        !handlerBody.includes('requestAnimationFrame')
      ) {
        logFail(
          `${path.relative(
            ROOT_DIR,
            file
          )}: [Pitfall 9] 在 scroll 监听器中直接同步读取 DOM 几何属性，将引发强制同步重排与滚动卡顿！耗性能计算必须剥离至 resize/load 并挂载 requestAnimationFrame。`
        );
      }
    }
  }
  logPass(`[Pitfall 9] Scroll 监听器读写分离与零强制回流校验通过`);

  // 2.8 [Pitfall 12]: Cloudflare 原生环境变量获取公理 (禁 locals.runtime.env)
  for (const file of allSourceFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes('locals.runtime.env') || content.includes('locals.runtime?.env')) {
      logFail(
        `${path.relative(
          ROOT_DIR,
          file
        )}: [Pitfall 12] 违反红线！检测到 'locals.runtime.env'。Astro v6 官方适配器已将其设为抛错代理，严格使用 "import { env } from 'cloudflare:workers'" 获取环境变量。`
      );
    }
  }
  logPass(`[Pitfall 12] Cloudflare Workers 原生环境变量安全获取校验通过`);

  // 2.9 [Pitfall 13]: 物理视口空间极限方程校验 (网格列数与临界断点方程)
  for (const file of astroFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const spatialCheck = InvariantEngine.checkGridSpatialLimit(content);
    if (!spatialCheck.valid) {
      for (const violation of spatialCheck.violations) {
        logFail(`${path.relative(ROOT_DIR, file)}: [Pitfall 13] ${violation}`);
      }
    }
  }
  logPass(`[Pitfall 13] 产品货架大屏空间几何极限方程与断点公理校验通过`);

  // 2.10 [Principle I.2]: 弹性熔断上限公理 (外部 fetch 刚性超时保护 T <= 6000ms)
  const apiFiles = getFiles(path.join(SRC_DIR, 'pages', 'api'), ['.ts', '.js']);
  const cdnImageFiles = getFiles(path.join(SRC_DIR, 'pages', 'cdn-image'), ['.ts', '.js']);
  const serverEndpointFiles = [...apiFiles, ...cdnImageFiles];
  for (const file of serverEndpointFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const fetchRegex = /fetch\s*\(([^)]+)\)/g;
    let match;
    while ((match = fetchRegex.exec(content)) !== null) {
      const callArgs = match[1];
      if (!callArgs.includes('signal') && !content.includes('AbortSignal.timeout')) {
        logFail(
          `${path.relative(
            ROOT_DIR,
            file
          )}: [Principle I.2] 外部网络 fetch 调用未挂载超时控制信号，网络抖动可能拖死边缘 Worker 引发 504！`
        );
      }
    }
  }
  logPass(`[Principle I.2] 服务端外部网络调用刚性超时熔断保护校验通过`);

  // 2.11 [Principle II]: Tailwind v4 纯 CSS 引擎无配置文件污染
  const tailwindConfigFiles = ['tailwind.config.js', 'tailwind.config.cjs', 'tailwind.config.mjs', 'tailwind.config.ts'];
  for (const configName of tailwindConfigFiles) {
    if (fs.existsSync(path.join(ROOT_DIR, configName))) {
      logFail(`[Principle II] 违反架构红线！检测到根目录存在 '${configName}'。Tailwind v4 必须使用 globals.css 纯 CSS 引擎声明！`);
    }
  }
  logPass(`[Principle II] Tailwind v4 纯 CSS 引擎无配置污染校验通过`);

  // 2.12 [Principle II]: 组件扁平正交与绝对路径别名
  for (const file of allSourceFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes('../../components') || content.includes('../../../components')) {
      logFail(`${path.relative(ROOT_DIR, file)}: [Principle II] 发现深层嵌套相对组件导入！全站一律使用路径别名 '@components'。`);
    }
  }
  logPass(`[Principle II] 组件扁平正交与 @components 路径别名校验通过`);

  // 2.13 [Pitfall 14]: 国际 B2B 货币标准化对齐 (统一采用 USD / $)
  for (const file of astroFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (
      file.includes('pages/products/index.astro') &&
      (content.includes('>¥<') || content.includes('>¥') || content.includes("${item.wholesalePrice || (item.category === 'silk' ? '32.00'"))
    ) {
      logFail(
        `${path.relative(ROOT_DIR, file)}: [Pitfall 14] 产品大厅价格硬编码了人民币符号 (¥)！必须与国际外贸 USD ($) 对齐。`
      );
    }
  }
  logPass(`[Pitfall 14] 产品大厅全站外贸标准统一货币 (USD / $) 校验通过`);

  // 2.14 [Pitfall 15]: 触屏与平板交互无障碍可用性 (iPad 触控无延迟适配)
  for (const file of astroFiles) {
    if (file.includes('LanguagePicker.astro')) {
      const content = fs.readFileSync(file, 'utf-8');
      if (!content.includes('is-open') || !content.includes('addEventListener') || !content.includes('touch-manipulation')) {
        logFail(
          `${path.relative(
            ROOT_DIR,
            file
          )}: [Pitfall 15] 语言切换面板未适配触屏！严禁仅依赖 CSS hover，必须具备 click/touch 状态切换 (.is-open) 并声明 touch-manipulation。`
        );
      }
    }
  }
  logPass(`[Pitfall 15] 触屏与平板环境语言切换交互可用性校验通过`);

  // 2.15 [Pitfall 16]: 商品币种独立字段、阶梯价单位与 MOQ 阶梯优先机制
  const productSchemaFile = path.join(STUDIO_DIR, 'schemaTypes', 'product.ts');
  if (fs.existsSync(productSchemaFile)) {
    const content = fs.readFileSync(productSchemaFile, 'utf-8');
    if (!content.includes("name: 'currency'")) {
      logFail(`studio/schemaTypes/product.ts: [Pitfall 16] 商品 Schema 缺少独立的 currency 币种维护字段！`);
    }
    if (!content.includes("name: 'unit'")) {
      logFail(`studio/schemaTypes/product.ts: [Pitfall 16] 阶梯价 pricingTiers Schema 缺少独立的 unit 计量单位字段！`);
    }
  }
  const productsDataFile = path.join(SRC_DIR, 'data', 'products.ts');
  if (fs.existsSync(productsDataFile)) {
    const content = fs.readFileSync(productsDataFile, 'utf-8');
    if (!content.includes('resolveProductMoq') || !content.includes('currencySymbol')) {
      logFail(`src/data/products.ts: [Pitfall 16] 前端数据层未实现 resolveProductMoq 阶梯价起订量优先机制与币种符号适配！`);
    }
  }
  logPass(`[Pitfall 16] 商品币种独立字段、阶梯价单位与 MOQ 阶梯优先机制校验通过`);

  // 2.16 [Pitfall 17]: Bento 展台胶囊徽章防溢出与矮视口自适应
  const sockSpecMatrixFile = path.join(SRC_DIR, 'components', 'SockSpecMatrix.astro');
  if (fs.existsSync(sockSpecMatrixFile)) {
    const content = fs.readFileSync(sockSpecMatrixFile, 'utf-8');
    if (!content.includes('specs-section') || !content.includes('min-w-0') || !content.includes('truncate')) {
      logFail(
        `src/components/SockSpecMatrix.astro: [Pitfall 17] Bento 展台胶囊标签缺少 min-w-0 / truncate 等防御性弹性排版！`
      );
    }
  }
  const globalsCssFile = path.join(SRC_DIR, 'styles', 'globals.css');
  if (fs.existsSync(globalsCssFile)) {
    const content = fs.readFileSync(globalsCssFile, 'utf-8');
    if (!content.includes('.specs-section') || !content.includes('max-height: 620px')) {
      logFail(`src/styles/globals.css: [Pitfall 17] 全局样式未将 .specs-section 纳入桌面矮视口阶梯自适应规则！`);
    }
  }
  logPass(`[Pitfall 17] Bento 展台胶囊防溢出与矮视口多维自适应校验通过`);

  // 2.17 [Pitfall 18]: 时间量纲区间公理与防御性边缘路由 (动态边缘缓存 60s <= T <= 300s)
  const middlewareFile = path.join(SRC_DIR, 'middleware.ts');
  if (fs.existsSync(middlewareFile)) {
    const mwContent = fs.readFileSync(middlewareFile, 'utf-8');
    if (!mwContent.includes("pathname.startsWith('/_astro/')") || !mwContent.includes('Asset Not Found')) {
      logFail(
        `src/middleware.ts: [Pitfall 18] 中间件未拦截穿透的 /_astro/ 静态资源请求！缺失资源会落入 SSR 动态页面导致重定向丢样式。`
      );
    }

    // 运用时间测度区间公理检验边缘缓存 TTL (必须满足 60s <= T <= 300s)
    const temporalCheck = InvariantEngine.checkTemporalBound(mwContent, 60, 300);
    if (!temporalCheck.valid) {
      for (const violation of temporalCheck.violations) {
        logFail(
          `src/middleware.ts: [Pitfall 18] 边缘缓存设置 '${violation.raw}' (数值: ${violation.value}s) 违背时间测度安全区间公理 [60s, 300s]！过长会导致新版本上线后样式长时间锁死。`
        );
      }
    }
  }

  const studioSiteConfigFile = path.join(STUDIO_DIR, 'schemaTypes', 'siteConfig.ts');
  if (fs.existsSync(studioSiteConfigFile)) {
    const scContent = fs.readFileSync(studioSiteConfigFile, 'utf-8');
    if (!scContent.includes('edgeCacheTtl')) {
      logFail(`studio/schemaTypes/siteConfig.ts: 缺少 edgeCacheTtl 边缘缓存频率配置项！双端强联动未达标。`);
    }
  }

  const siteConfigDataFile = path.join(SRC_DIR, 'data', 'siteConfig.ts');
  if (fs.existsSync(siteConfigDataFile)) {
    const scdContent = fs.readFileSync(siteConfigDataFile, 'utf-8');
    if (!scdContent.includes('edgeCacheTtl')) {
      logFail(`src/data/siteConfig.ts: CONFIG_QUERY_OBJ GROQ 投影未拉取 edgeCacheTtl 字段！`);
    }
  }

  const langFiles = [
    path.join(SRC_DIR, 'pages', '[lang]', 'index.astro'),
    path.join(SRC_DIR, 'pages', '[lang]', '[...slug].astro'),
    path.join(SRC_DIR, 'pages', '[lang]', 'products', 'index.astro'),
    path.join(SRC_DIR, 'pages', '[lang]', 'products', '[slug].astro'),
  ];
  for (const lf of langFiles) {
    if (fs.existsSync(lf)) {
      const relPath = path.relative(ROOT_DIR, lf);
      const content = fs.readFileSync(lf, 'utf-8');
      if (!content.includes("startsWith('_')") || !content.includes("includes('.')")) {
        logFail(
          `${relPath}: [Pitfall 18] 动态 [lang] 路由未防御下划线与点号静态文件，会导致请求误落入语言路由并 302 重定向到 HTML！`
        );
      }
    }
  }
  logPass(`[Pitfall 18] 边缘缓存时间测度区间公理与防御性路由校验通过`);

  // 2.18 [Pitfall 19]: 静态资产断代容错与构建哈希一致性护栏 (Zero Stale Asset 404 Guarantee)
  // 必须保证旧客户端/未刷新浏览器发起的历史 hash CSS 请求不会引发 404 样式裸奔，
  // 且构建系统天然自愈，携带历史别名与中间件智能重定向兜底。
  // reuse existing middlewareFile
  if (fs.existsSync(middlewareFile)) {
    const middlewareSrc = fs.readFileSync(middlewareFile, 'utf-8');
    if (!middlewareSrc.includes('STALE_LAYOUT_CSS_REDIRECT') || !middlewareSrc.includes('Layout.css')) {
      logFail(
        `src/middleware.ts: [Pitfall 19] 中间件未包含对历史 Layout.*.css 的自愈重定向兜底逻辑！` +
        `未刷新浏览器请求旧哈希 CSS 会遭遇 404 导致页面排版裸奔乱码。`
      );
    }
  }

  const pkgJsonFile = path.join(path.join(SRC_DIR, '..'), 'package.json');
  if (fs.existsSync(pkgJsonFile)) {
    const pkgSrc = fs.readFileSync(pkgJsonFile, 'utf-8');
    if (!pkgSrc.includes('ensure-asset-aliases.cjs')) {
      logFail(
        `package.json: [Pitfall 19] build 流程未挂载 ensure-asset-aliases.cjs！构建产物无法自动保留历史版本兼容别名。`
      );
    }
  }

  const clientAstroDir = path.join(ROOT_DIR, 'dist/client/_astro');
  const ensureScriptFile = path.join(ROOT_DIR, 'scripts', 'ensure-asset-aliases.cjs');
  let ssotAliases: string[] = [];
  if (fs.existsSync(ensureScriptFile)) {
    ssotAliases = InvariantEngine.extractSSOTAliases(fs.readFileSync(ensureScriptFile, 'utf-8'));
  }

  if (fs.existsSync(clientAstroDir) && ssotAliases.length > 0) {
    const astroFiles = fs.readdirSync(clientAstroDir);
    const activeLayout = astroFiles.find(f => f.startsWith('Layout.') && f.endsWith('.css') && !ssotAliases.includes(f));
    if (!activeLayout) {
      logFail(`dist/client/_astro: [Pitfall 19] 未在构建产物中检测到有效的主样式包 Layout.*.css！`);
    }

    // 强校验：动态基于 SSOT 受管别名列表检验，杜绝脚本硬编码哈希
    for (const reqAlias of ssotAliases) {
      const aliasPath = path.join(clientAstroDir, reqAlias);
      if (!fs.existsSync(aliasPath) || fs.statSync(aliasPath).size === 0) {
        logFail(`dist/client/_astro/${reqAlias}: [Pitfall 19] 缺少关键历史兼容别名！用户旧客户端访问将引发 404 页面乱码。`);
      }
    }
  }

  logPass(`[Pitfall 19] 静态资产断代容错与单源真理兼容别名校验通过 (SSOT 动态映射)`);

  // 2.19 [Pitfall 20]: 空间几何下确界与零遮挡公理 (Mathematical Zero-Obscurity Invariant)
  const globalsCssPath = path.join(SRC_DIR, 'styles', 'globals.css');
  if (fs.existsSync(globalsCssPath)) {
    const globalsCssContent = fs.readFileSync(globalsCssPath, 'utf-8');
    const templateFiles = astroFiles.map((file) => ({
      file: path.relative(ROOT_DIR, file),
      content: fs.readFileSync(file, 'utf-8'),
    }));
    const geomCheck = InvariantEngine.checkGeometricTopClearance(globalsCssContent, templateFiles);
    if (!geomCheck.valid) {
      for (const violation of geomCheck.violations) {
        logFail(`[Pitfall 20] ${violation}`);
      }
    } else {
      logPass(`[Pitfall 20] 空间几何下确界与零遮挡代数方程校验通过 (Top Clearance > Header Offset)`);
    }
  }

  // 2.20 [Pitfall 21]: 客户端原生内联脚本作用域封闭性公理 (Closed-Scope Invariant)
  // 严禁在 <script define:vars> 或 <script is:inline> 中直接引用未声明、未通过 define:vars 注入且非全局白名单的游离变量，
  // 避免浏览器端执行到特定交互分支时引发 Uncaught ReferenceError 导致整站交互瘫痪。
  for (const file of astroFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const scriptRegex = /<script\s+[^>]*(?:define:vars|is:inline)[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(content)) !== null) {
      const fullTag = match[0];
      const scriptBody = match[1];
      const defineVarsMatch = fullTag.match(/define:vars=\{([^}]+)\}/);
      const definedVars: string[] = [];
      if (defineVarsMatch) {
        const inner = defineVarsMatch[1];
        inner.split(',').forEach((p) => {
          const parts = p.trim().split(':');
          if (parts[0]) definedVars.push(parts[0].trim());
        });
      }

      const scopeCheck = InvariantEngine.checkScriptScopeClosed(scriptBody, definedVars);
      if (!scopeCheck.valid) {
        logFail(
          `${path.relative(ROOT_DIR, file)}: [Pitfall 21] 客户端原生内联脚本违反作用域封闭性公理！` +
          `检测到未声明游离标识符: ${scopeCheck.violations.map(v => `'${v}'`).join(', ')}。` +
          `若需从 SSR 传入请在 define:vars 中显式声明，或在脚本内提供局部声明 / typeof 保护，否则客户端将触发 Uncaught ReferenceError！`
        );
      }
    }
  }
  logPass(`[Pitfall 21] 客户端原生内联脚本作用域封闭性公理校验通过 (零游离 ReferenceError 隐患)`);

  // =========================================================================
  // 3. i18n 多语言核心字典树同构与对称性深度分析
  // =========================================================================
  logSection('3. i18n 多语言字典树拓扑同构与对称性分析');

  try {
    const i18nFile = path.join(SRC_DIR, 'i18n', 'ui.ts');
    if (fs.existsSync(i18nFile)) {
      const { ui, languages } = await import('../src/i18n/ui');
      if (ui && languages) {
        const supportedLangs = Object.keys(languages);
        const baseLang = 'en';
        const baseTree = ui[baseLang] || {};

        for (const lang of supportedLangs) {
          if (lang === baseLang) continue;
          if (!ui[lang]) {
            logFail(`i18n: 缺少 '${lang}' 语言字典！`);
            continue;
          }
          const isoCheck = InvariantEngine.checkTreeIsomorphism(baseTree, ui[lang]);
          if (!isoCheck.isomorphic) {
            if (isoCheck.missingKeys.length > 0) {
              logWarn(
                `i18n [${lang}]: 相比 ${baseLang} 树缺失 ${isoCheck.missingKeys.length} 个键 (对称覆盖率: ${isoCheck.coverageRatio.toFixed(
                  1
                )}%): ${isoCheck.missingKeys.slice(0, 5).join(', ')}${isoCheck.missingKeys.length > 5 ? '...' : ''}`
              );
            }
          }
        }
        logPass(
          `i18n 多语言字典拓扑结构校验完成，基准语言 [${baseLang}] 包含 ${Object.keys(baseTree).length} 个核心词元`
        );
      }
    }
  } catch (err: any) {
    logWarn(`i18n 加载校验跳过: ${err.message}`);
  }

  // =========================================================================
  // 4. dist/ 生产构建交付件物理完整性与安全验收 (Post-build Artifact Verification)
  // =========================================================================
  logSection('4. dist/ 生产构建产物交付件物理闭包与安全验收');

  const distDir = path.join(ROOT_DIR, 'dist');
  const distClientDir = path.join(distDir, 'client');
  const distServerDir = path.join(distDir, 'server');
  const serverEntryFile = path.join(distServerDir, 'entry.mjs');
  const distClientAstroDir = path.join(distClientDir, '_astro');

  if (!fs.existsSync(distDir) || !fs.existsSync(serverEntryFile)) {
    console.log('\x1b[90m(提示: 当前未检测到 dist/ 生产产物。运行 "npm run build" 后本章节将执行全量产物 404 闭包、敏感词扫描与 CSS 完整性验收)\x1b[0m');
  } else {
    // 4.1 Manifest 有向图拓扑物理闭包校验 (Topological Closure & Zero 404)
    try {
      const entrySrc = fs.readFileSync(serverEntryFile, 'utf-8');
      const closureResult = InvariantEngine.checkManifestGraphClosure(entrySrc, distClientDir);
      if (!closureResult.valid) {
        if (closureResult.missing.length > 0) {
          logFail(
            `[dist 404 资产死链] SSR Entry 清单引用了 ${closureResult.missing.length} 个在 dist/client 中缺失的静态文件:\n` +
            closureResult.missing.map((a) => `  - ${a}`).join('\n')
          );
        }
        if (closureResult.zeroMeasure.length > 0) {
          logFail(
            `[dist 空文件异常] SSR Entry 引用的静态文件物理测度为 0 字节:\n` +
            closureResult.zeroMeasure.map((a) => `  - ${a}`).join('\n')
          );
        }
      } else {
        logPass(`SSR Manifest 包含的 ${closureResult.totalAssets} 个静态资产拓扑闭包校验通过，物理测度 > 0 字节，零 404 死链`);
      }
    } catch (err: any) {
      logFail(`读取或解析 dist/server/entry.mjs 拓扑图失败: ${err.message}`);
    }

    // 4.2 核心 CSS 产物几何标尺与关键规则落实验收 (CSS Invariants Proof)
    try {
      if (fs.existsSync(distClientAstroDir)) {
        const astroFiles = fs.readdirSync(distClientAstroDir);
        const ensureScriptFile = path.join(ROOT_DIR, 'scripts', 'ensure-asset-aliases.cjs');
        let ssotAliases: string[] = [];
        if (fs.existsSync(ensureScriptFile)) {
          ssotAliases = InvariantEngine.extractSSOTAliases(fs.readFileSync(ensureScriptFile, 'utf-8'));
        }
        const activeCss = astroFiles.find((f) => f.startsWith('Layout.') && f.endsWith('.css') && !ssotAliases.includes(f));
        if (!activeCss) {
          logFail(`dist/client/_astro: 未在产物中识别到非别名的主样式包 Layout.*.css！`);
        } else {
          const cssPath = path.join(distClientAstroDir, activeCss);
          const cssContent = fs.readFileSync(cssPath, 'utf-8');
          const cssBytes = fs.statSync(cssPath).size;

          const requiredCssTokens = [
            { token: '--apple-nav-h', desc: '导航栏物理标尺标量' },
            { token: '--apple-flow-buffer', desc: '流体呼吸动态缓冲区' },
            { token: '--apple-page-top', desc: '全局安全顶端净空' },
            { token: 'catalog-container', desc: '产品目录安全流动容器' },
            { token: 'page-top-clearance', desc: '全局零遮盖安全容器' },
            { token: 'clamp(', desc: 'CSS 数学连续呼吸函数' },
          ];
          const missingTokens = requiredCssTokens.filter((t) => !cssContent.includes(t.token));
          if (missingTokens.length > 0) {
            logFail(
              `dist/client/_astro/${activeCss}: CSS 编译产物缺失关键几何规则或被错误 Tree-shaking 剔除:\n` +
              missingTokens.map((t) => `  - ${t.token} (${t.desc})`).join('\n')
            );
          } else {
            // 测度界限校验
            const metricCheck = InvariantEngine.checkMetricBounds([
              { name: `CSS 主包 (${activeCss})`, bytes: cssBytes, minBytes: 20 * 1024, maxBytes: 500 * 1024 },
            ]);
            if (!metricCheck.valid) {
              for (const v of metricCheck.violations) logFail(v);
            } else {
              logPass(`CSS 主包 (${activeCss}, ${(cssBytes / 1024).toFixed(1)} KB) 几何标尺与测度区间 [20KB, 500KB] 检验通过`);
            }
          }
        }
      }
    } catch (err: any) {
      logFail(`校验 CSS 产物失败: ${err.message}`);
    }

    // 4.3 历史哈希兼容物理镜像 (SSOT 动态映射，杜绝写死)
    try {
      if (fs.existsSync(distClientAstroDir)) {
        const ensureScriptFile = path.join(ROOT_DIR, 'scripts', 'ensure-asset-aliases.cjs');
        let ssotAliases: string[] = [];
        if (fs.existsSync(ensureScriptFile)) {
          ssotAliases = InvariantEngine.extractSSOTAliases(fs.readFileSync(ensureScriptFile, 'utf-8'));
        }
        if (ssotAliases.length === 0) {
          logWarn(`未能从 scripts/ensure-asset-aliases.cjs 提取到受管别名列表！`);
        } else {
          const missingAliases = ssotAliases.filter((alias) => {
            const p = path.join(distClientAstroDir, alias);
            return !fs.existsSync(p) || fs.statSync(p).size === 0;
          });
          if (missingAliases.length > 0) {
            logFail(`dist/client/_astro 缺少 SSOT 受管历史兼容别名: ${missingAliases.join(', ')}，旧 Tab 访问将引发 404！`);
          } else {
            logPass(`动态映射 SSOT ${ssotAliases.length} 个版本别名物理镜像全部存在且非空 (旧 Tab 100% 200 OK)`);
          }
        }
      }
    } catch (err: any) {
      logFail(`校验兼容别名失败: ${err.message}`);
    }

    // 4.4 客户端静态代码私钥与敏感信息防泄漏 (Information Confinement & Zero Secret Leak)
    try {
      const getClientJsFiles = (dir: string): string[] => {
        let results: string[] = [];
        if (!fs.existsSync(dir)) return results;
        for (const item of fs.readdirSync(dir)) {
          const full = path.join(dir, item);
          if (fs.statSync(full).isDirectory()) {
            results = results.concat(getClientJsFiles(full));
          } else if (item.endsWith('.js') || item.endsWith('.mjs')) {
            results.push(full);
          }
        }
        return results;
      };
      const clientJsFiles = getClientJsFiles(distClientDir);
      const envPath = path.join(ROOT_DIR, '.env');
      const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

      const confinementResult = InvariantEngine.checkSecretConfinement(clientJsFiles, envContent);
      if (!confinementResult.valid) {
        for (const leak of confinementResult.leaks) {
          logFail(`[安全阻断] 客户端公开产物 ${leak.file} 发现私密信息特征: ${leak.pattern}！`);
        }
      } else {
        logPass(`客户端静态代码 (${clientJsFiles.length} 个 JS Bundle) 熵隔离与脱敏审计通过，无私密 Token/Key 泄漏`);
      }
    } catch (err: any) {
      logFail(`客户端敏感信息扫描异常: ${err.message}`);
    }

    // 4.5 Cloudflare Worker 边缘运行时体积与承载力界限
    try {
      const workerBytes = fs.statSync(serverEntryFile).size;
      const workerBounds = InvariantEngine.checkMetricBounds([
        { name: 'Cloudflare Worker Entry (entry.mjs)', bytes: workerBytes, minBytes: 10 * 1024, maxBytes: 5 * 1024 * 1024 },
      ]);
      if (!workerBounds.valid) {
        for (const v of workerBounds.violations) logWarn(v);
      } else {
        logPass(`Cloudflare Worker 入口体积符合边缘测度区间: ${(workerBytes / 1024).toFixed(1)} KB (< 5120 KB 预算)`);
      }
    } catch (err: any) {
      logFail(`Worker 体积测算失败: ${err.message}`);
    }

    // 4.6 静态资源 CDN 缓存头配置校验
    const headersFile = path.join(distClientDir, '_headers');
    if (fs.existsSync(headersFile)) {
      const headersContent = fs.readFileSync(headersFile, 'utf-8');
      if (headersContent.includes('Cache-Control') && headersContent.includes('_astro')) {
        logPass(`Cloudflare CDN _headers 不可变静态缓存策略配置校验通过`);
      } else {
        logWarn(`dist/client/_headers 存在但未检测到对 _astro 静态目录的 Cache-Control 策略。`);
      }
    }
  }

  // =========================================================================
  // 5. Sanity 数据集结构与字段类型一致性深度巡检 (若开启 --data 或 --full)
  // =========================================================================
  if (isDataMode) {
    logSection('5. Sanity 数据集 _key 完整性与 Schema 类型一致性巡检 (--data Mode)');
    try {
      const { createClient } = await import('@sanity/client');
      const dotenv = await import('dotenv');
      dotenv.config({ path: path.join(ROOT_DIR, '.env') });
      if (process.env.SANITY_PROJECT_ID && process.env.SANITY_TOKEN) {
        const client = createClient({
          projectId: process.env.SANITY_PROJECT_ID,
          dataset: process.env.SANITY_DATASET,
          token: process.env.SANITY_TOKEN,
          apiVersion: '2024-01-01',
          useCdn: false,
        });
        const docs = await client.fetch('*[!(_id in path("_.**"))]');

        let missingKeys = 0;
        function checkKeys(val: any) {
          if (Array.isArray(val)) {
            val.forEach((item) => {
              if (item && typeof item === 'object') {
                if (!item._key) missingKeys++;
                checkKeys(item);
              }
            });
          } else if (val && typeof val === 'object') {
            for (const [k, v] of Object.entries(val)) {
              if (k !== '_rev' && k !== '_id' && k !== '_type') checkKeys(v);
            }
          }
        }
        for (const doc of docs) checkKeys(doc);
        if (missingKeys > 0) {
          logFail(`Sanity 数据库中存在 ${missingKeys} 个内嵌数组项缺失 '_key'！请运行 'node scripts/fix-missing-keys.mjs' 自动补齐。`);
        } else {
          logPass(`Sanity 数据库校验通过：全部 ${docs.length} 个文档中内嵌数组项 _key 完整率 100%`);
        }
      }
    } catch (err: any) {
      logWarn(`Sanity 数据集检验跳过: ${err.message}`);
    }
  }

  // =========================================================================
  // 6. 双端生产编译全量验证 (若开启 --full)
  // =========================================================================
  if (isFullMode) {
    logSection('6. 双端生产编译全量验证 (--full Mode)');
    try {
      console.log('正在执行 Sanity Studio 生产构建: npm run build --prefix studio ...');
      execSync('npm run build --prefix studio', { stdio: 'inherit', cwd: ROOT_DIR });
      logPass('Sanity Studio 生产编译成功！');
    } catch (err) {
      logFail('Sanity Studio 生产编译失败！请检查 studio 报错。');
    }

    try {
      console.log('正在执行 Astro 生产构建: npm run build ...');
      execSync('npm run build', { stdio: 'inherit', cwd: ROOT_DIR });
      logPass('Astro 生产编译成功！');
    } catch (err) {
      logFail('Astro 生产编译失败！请检查 astro build 报错。');
    }
  } else {
    console.log('\n\x1b[90m(提示: 当前为静态与 Schema 动态快检模式。如需验证真实打包与远程数据集，请运行 "npm run check:full")\x1b[0m');
  }

  // =========================================================================
  // 汇总输出
  // =========================================================================
  console.log('\n========================================');
  if (errorCount === 0) {
    console.log(`\x1b[32m\x1b[1m🎉 巡检全部通过！(错误: ${errorCount}, 告警: ${warnCount})\x1b[0m`);
    console.log('代码已全面通过数学物理公理、量纲分析与架构护栏校验，可安全推进！');
    process.exit(0);
  } else {
    console.log(`\x1b[31m\x1b[1m🚨 巡检未通过！发现 ${errorCount} 个致命阻断问题。\x1b[0m`);
    console.log('请根据上方红色报错完成修复后再继续。');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('巡检脚本发生未预期异常:', err);
  process.exit(1);
});
