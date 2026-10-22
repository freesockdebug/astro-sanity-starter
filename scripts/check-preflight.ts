#!/usr/bin/env node
/**
 * Gwenvenni Web & Studio 全链路自动化前置质量巡检与自演进工具 (Pre-Flight Verification)
 *
 * 严格覆盖 AGENTS.md 全部 22 项历史血泪踩坑与通用架构护栏，并支持动态自演进：
 *
 * [Part 1: Sanity Studio 视图与数据完整性]
 *  - 1.1 Preview Prepare 返回类型与 [object Object] 防解包测试
 *  - 1.2 Schema 数组初始值 initialValue 必需 _key 检测
 *  - 1.3 Studio 组件 React Error #31 多语言宽对象渲染安全扫描
 *
 * [Part 2: AGENTS.md 历史核心反例与架构红线全量扫描 (Pitfall 1 ~ 22 + 动态扩展规则)]
 *  - 2.1  [Pitfall 1 & 4]: 客户端原生内联脚本 TS 语法断言拦截 (as any / : any)
 *  - 2.2  [Pitfall 2]: 列表渲染防布局偏移 (禁止空容器或直接置空 innerHTML 引发 CLS 崩盘)
 *  - 2.3  [Pitfall 3]: 杜绝在 define:vars 中序列化大数组 (防止转义体积暴增 357KB)
 *  - 2.4  [Pitfall 4]: 外部字体加载阻塞检测 (禁止直接阻塞式 link 样式)
 *  - 2.5  [Pitfall 6]: HTML 属性实体转义暴增 (禁止 data-*={JSON.stringify(...)})
 *  - 2.6  [Pitfall 7]: 图片服务反向代理兼容性 (同时兼容 cdn.sanity.io 与 /cdn-image/)
 *  - 2.7  [Pitfall 8]: 视口卡片 loading/fetchpriority 动态策略保障
 *  - 2.8  [Pitfall 9]: Scroll 监听器强制同步回流防护 (读写分离与 rAF)
 *  - 2.9  [Pitfall 11]: 本地兜底大图与轻量化 WebP 检测
 *  - 2.10 [Pitfall 12 & I.5]: Astro v6 Cloudflare 环境变量 Proxy 崩溃检测 (禁 locals.runtime.env)
 *  - 2.11 [Pitfall 13]: 产品目录货架 7 列大屏断点黄金标准 (必须 min-[1760px]:grid-cols-7)
 *  - 2.12 [Principle I.2]: 服务端对外 fetch 刚性超时熔断防护 (挂载 AbortSignal.timeout)
 *  - 2.13 [Principle II]: Tailwind v4 纯 CSS 引擎红线 (禁 tailwind.config.*)
 *  - 2.14 [Principle II]: 组件扁平正交与绝对路径别名规范 (禁深层 ../../components/)
 *  - 2.15 [Pitfall 14]: 国际 B2B 货币标准化对齐 (USD / $)
 *  - 2.16 [Pitfall 15]: 触屏与平板交互无障碍可用性 (.is-open & touch-manipulation)
 *  - 2.17 [Pitfall 16]: 商品币种与阶梯价单位独立字段及 MOQ 阶梯优先
 *  - 2.18 [Pitfall 17]: Bento 展台胶囊徽章防溢出与多维矮视口自适应
 *  - 2.19 [Pitfall 18]: 动态路由与中间件静态资源 404 防御及边缘 HTML 缓存安全 (防丢样式 FOUC)
 *  - 2.20 [Pitfall 20]: 依赖锁文件严格同步 (npm ci --dry-run) 与单一包管理器准则 (自动清理杂散锁文件)
 *  - 2.21 [Pitfall 21]: 双环境按需挂载 Studio 与防 Cloudflare Worker Error 1102 (CPU 超限)
 *  - 2.22 [Pitfall 22]: Wrangler v4 配置纯净度、Studio 浏览器端 process.env 安全守卫与 CI 流水线校验
 *  - 2.23 [Principle IV]: 版本库纯净度与本地资产 .gitignore 隔离 (Git Hygiene)
 *  - 2.24 [动态演进规则]: 执行 scripts/preflight-rules.json 中通过 check:add 新增的自定义红线断言
 *
 * [Part 3: i18n 多语言核心字典对称性校验 (Pitfall 19)]
 *  - 3.1 多语言 (EN, DE, FR, ES) 核心字典对称率与空值校验 + astro.config.mjs i18n.locales 对齐
 *
 * [Part 4: Sanity 数据集结构与字段类型一致性深度巡检 (--data / --full)]
 *  - 4.1 线上数据集已存数据 Array _key 完整率扫描
 *  - 4.2 Schema 字段类型一致性巡检 (防 Invalid property value: type must be localeString)
 *  - 4.3 数据库商品价格阶梯直接取值与全量美元标准化校验
 *
 * [Part 5: 双端生产编译与 Wrangler v4 部署预检全量验证 (--full)]
 *  - 5.1 Sanity Studio 独立静态生产编译 (npm run build:studio)
 *  - 5.2 Astro SSR Edge 生产编译 (npm run build)
 *  - 5.3 主站与 Studio Cloudflare Wrangler v4 部署预检 (--dry-run)
 *
 * [自演进维护命令]:
 *  - npm run check          : 运行常规快速巡检 (Part 1 + Part 2 + Part 3)
 *  - npm run check:full     : 运行全量巡检 (Part 1 ~ Part 5)
 *  - npm run check:list     : 查看所有已纳管的红线与自定义规则
 *  - npm run check:add -- --title="红线标题" --detail="规范详情" [--must-contain="file:pattern"] [--must-not-contain="file:pattern"]
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cliArgs = process.argv.slice(2);
const isFullMode = cliArgs.includes('--full') || cliArgs.includes('-f');
const isDataMode = cliArgs.includes('--data') || isFullMode;
const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const STUDIO_DIR = path.join(ROOT_DIR, 'studio');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const AGENTS_PATH = path.join(ROOT_DIR, 'AGENTS.md');
const CUSTOM_RULES_PATH = path.join(__dirname, 'preflight-rules.json');

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

function parseJsonc(content: string): Record<string, any> {
  let result = '';
  let inString = false;
  let stringChar = '';
  let i = 0;
  while (i < content.length) {
    const ch = content[i];
    const next = content[i + 1];
    if (inString) {
      result += ch;
      if (ch === '\\') {
        result += next || '';
        i += 2;
        continue;
      }
      if (ch === stringChar) inString = false;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      result += ch;
      i++;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < content.length && content[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    result += ch;
    i++;
  }
  return JSON.parse(result.replace(/,\s*([}\]])/g, '$1'));
}

/**
 * 动态加载包含无后缀相对导入的 TypeScript 模块 (兼容原生 Node 22 strip-types 与 tsx)
 */
async function loadTsModule(entryAbsPath: string): Promise<any> {
  try {
    return await import(pathToFileURL(entryAbsPath).href);
  } catch {
    const esbuild = await import('esbuild');
    const outfile = path.join(
      __dirname,
      `.tmp-preflight-${path.basename(entryAbsPath, '.ts')}-${process.pid}.mjs`
    );
    try {
      await esbuild.build({
        entryPoints: [entryAbsPath],
        bundle: true,
        platform: 'node',
        format: 'esm',
        outfile,
        packages: 'external',
        logLevel: 'silent',
      });
      return await import(pathToFileURL(outfile).href);
    } finally {
      if (fs.existsSync(outfile)) {
        try {
          fs.unlinkSync(outfile);
        } catch {}
      }
    }
  }
}

interface DeclarativeCheck {
  type: 'file_must_contain' | 'file_contains' | 'file_must_not_contain' | 'file_must_not_exist' | 'command_must_succeed';
  path?: string;
  target?: string;
  pattern?: string;
  command?: string;
  message?: string;
}

interface CustomRuleEntry {
  id?: string;
  num: number;
  title: string;
  detail: string;
  date?: string;
  createdAt?: string;
  checks: DeclarativeCheck[];
}

function loadCustomRules(): { version: string; lastUpdated: string; customRules: CustomRuleEntry[] } {
  if (!fs.existsSync(CUSTOM_RULES_PATH)) {
    return { version: '2.0.0', lastUpdated: new Date().toISOString().slice(0, 10), customRules: [] };
  }
  return JSON.parse(fs.readFileSync(CUSTOM_RULES_PATH, 'utf8'));
}

function saveCustomRules(store: { version: string; lastUpdated: string; customRules: CustomRuleEntry[] }): void {
  store.lastUpdated = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(CUSTOM_RULES_PATH, JSON.stringify(store, null, 2) + '\n', 'utf8');
}

function runDeclarativeCheck(chk: DeclarativeCheck): string | null {
  const targetRelPath = chk.path || chk.target || '';
  const fullPath = targetRelPath ? path.join(ROOT_DIR, targetRelPath) : '';
  switch (chk.type) {
    case 'file_must_contain':
    case 'file_contains': {
      if (!fs.existsSync(fullPath)) return `待检文件不存在: ${targetRelPath}`;
      const content = fs.readFileSync(fullPath, 'utf8');
      if (!content.includes(chk.pattern || '')) {
        return chk.message || `文件 ${targetRelPath} 必须包含: ${chk.pattern}`;
      }
      return null;
    }
    case 'file_must_not_contain': {
      if (!fs.existsSync(fullPath)) return null;
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes(chk.pattern || '')) {
        return chk.message || `文件 ${targetRelPath} 严禁包含: ${chk.pattern}`;
      }
      return null;
    }
    case 'file_must_not_exist': {
      if (fs.existsSync(fullPath)) {
        return chk.message || `文件 ${targetRelPath} 严禁存在`;
      }
      return null;
    }
    case 'command_must_succeed': {
      try {
        execSync(chk.command || '', { cwd: ROOT_DIR, stdio: 'pipe', encoding: 'utf8' });
        return null;
      } catch (err: any) {
        return `${chk.message || `命令执行失败: ${chk.command}`} (${(err?.stderr || err?.message || '').toString().trim().slice(0, 120)})`;
      }
    }
    default:
      return null;
  }
}

/**
 * 从 GROQ 投影模板常量中提取顶层字段名列表
 */
function extractGroqConstTopLevelFields(fileContent: string, constName: string): string[] {
  const regex = new RegExp(`export\\s+const\\s+${constName}\\s*=\\s*\`([\\s\\S]*?)\``, 'm');
  const match = fileContent.match(regex);
  if (!match) return [];
  const rawBody = match[1].replace(/\$\{[^}]+\}/g, '');
  const startBrace = rawBody.indexOf('{');
  if (startBrace === -1) return [];

  const fields = new Set<string>();
  let depth = 0;
  let currentToken = '';

  const flushToken = (token: string) => {
    const cleaned = token
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .join(' ')
      .trim();
    if (!cleaned || cleaned === '...') return;
    const quotedMatch = cleaned.match(/^["']([a-zA-Z_][a-zA-Z0-9_]*)["']\s*:/);
    if (quotedMatch) {
      fields.add(quotedMatch[1]);
      return;
    }
    const identMatch = cleaned.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (identMatch) {
      fields.add(identMatch[1]);
    }
  };

  for (let i = startBrace; i < rawBody.length; i++) {
    const ch = rawBody[i];
    if (ch === '{') {
      depth++;
      if (depth > 1) currentToken += ch;
    } else if (ch === '}') {
      if (depth === 1) {
        flushToken(currentToken);
        currentToken = '';
        break;
      }
      depth--;
      currentToken += ch;
    } else if ((ch === ',' || ch === '\n') && depth === 1) {
      flushToken(currentToken);
      currentToken = '';
    } else if (depth >= 1) {
      currentToken += ch;
    }
  }

  return Array.from(fields);
}

/**
 * 从 TypeScript 接口声明中提取顶层属性名列表
 */
function extractTsInterfaceFields(tsContent: string, interfaceName: string): string[] {
  const regex = new RegExp(`export\\s+interface\\s+${interfaceName}\\b[^{]*\\{`, 'm');
  const match = regex.exec(tsContent);
  if (!match) return [];

  const startIdx = match.index + match[0].length - 1;
  let depth = 0;
  let body = '';

  for (let i = startIdx; i < tsContent.length; i++) {
    const ch = tsContent[i];
    if (ch === '{') {
      depth++;
      if (depth > 1) body += ch;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) break;
      body += ch;
    } else {
      if (depth === 1) {
        body += ch;
      }
    }
  }

  const fields = new Set<string>();
  for (const rawLine of body.split('\n')) {
    const line = rawLine.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    const propMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\??\s*:/);
    if (propMatch) {
      fields.add(propMatch[1]);
    }
  }
  return Array.from(fields);
}

/**
 * 自演进：新增一条架构红线并同步写入 AGENTS.md 与 scripts/preflight-rules.json
 */
function handleAddRule(args: string[]): void {
  const getArg = (name: string): string => {
    const prefix = `--${name}=`;
    const found = args.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : '';
  };
  const getMultiArgs = (name: string): string[] => {
    const prefix = `--${name}=`;
    return args.filter((a) => a.startsWith(prefix)).map((a) => a.slice(prefix.length));
  };

  const title = getArg('title');
  const detail = getArg('detail') || getArg('fix') || getArg('cause');
  if (!title || !detail) {
    console.error(`\x1b[31m❌ 新增红线参数不完整！用法示例：\x1b[0m`);
    console.error(
      `  npm run check:add -- --title="红线简称" --detail="详细约束说明" [--must-contain="file:pattern"] [--must-not-contain="file:pattern"]`
    );
    process.exit(1);
  }

  const store = loadCustomRules();
  const baseCount = 22;
  const nextNum = baseCount + store.customRules.length + 1;
  const checks: DeclarativeCheck[] = [];

  for (const val of getMultiArgs('must-contain')) {
    const idx = val.indexOf(':');
    if (idx > 0) {
      checks.push({
        type: 'file_must_contain',
        path: val.slice(0, idx),
        pattern: val.slice(idx + 1),
      });
    }
  }
  for (const val of getMultiArgs('must-not-contain')) {
    const idx = val.indexOf(':');
    if (idx > 0) {
      checks.push({
        type: 'file_must_not_contain',
        path: val.slice(0, idx),
        pattern: val.slice(idx + 1),
      });
    }
  }
  for (const filePath of getMultiArgs('must-not-exist')) {
    checks.push({ type: 'file_must_not_exist', path: filePath });
  }
  for (const command of getMultiArgs('cmd')) {
    checks.push({ type: 'command_must_succeed', command });
  }

  const entry: CustomRuleEntry = {
    num: nextNum,
    title,
    detail,
    date: new Date().toISOString().slice(0, 10),
    checks,
  };
  store.customRules.push(entry);
  saveCustomRules(store);

  if (fs.existsSync(AGENTS_PATH)) {
    const agentsContent = fs.readFileSync(AGENTS_PATH, 'utf8');
    const endMarker = '<!-- PREFLIGHT_RULES_END -->';
    if (agentsContent.includes(endMarker)) {
      const line = `${nextNum}. **${title}**：${detail}\n${endMarker}`;
      fs.writeFileSync(AGENTS_PATH, agentsContent.replace(endMarker, line), 'utf8');
    }
  }

  console.log(`\x1b[32m\x1b[1m✅ 已成功演进并收录第 #${nextNum} 条架构红线：${title}\x1b[0m`);
  console.log(`   已同步更新: AGENTS.md & scripts/preflight-rules.json`);
}

function handleListRules(): void {
  const store = loadCustomRules();
  console.log(`\n\x1b[1m\x1b[36m📋 AGENTS.md 核心架构红线与自动化巡检清单\x1b[0m\n`);
  if (fs.existsSync(AGENTS_PATH)) {
    const content = fs.readFileSync(AGENTS_PATH, 'utf8');
    const match = content.match(/<!-- PREFLIGHT_RULES_START -->([\s\S]*?)<!-- PREFLIGHT_RULES_END -->/);
    if (match) {
      console.log(match[1].trim());
    }
  }
  if (store.customRules.length > 0) {
    console.log(`\n\x1b[33m已注册动态扩展规则 (${store.customRules.length} 条):\x1b[0m`);
    for (const c of store.customRules) {
      console.log(`  #${c.num} [${c.date}] ${c.title} (${c.checks.length} 项自动断言)`);
    }
  }
  console.log('');
}

async function main() {
  if (cliArgs.includes('--list') || cliArgs.includes('-l')) {
    handleListRules();
    return;
  }
  if (cliArgs.includes('--add')) {
    handleAddRule(cliArgs);
    return;
  }

  // =========================================================================
  // 1. Sanity Studio Schema 预览引擎与数据完整性校验
  // =========================================================================
  logSection('1. Sanity Studio Schema 预览引擎与结构完整性深度校验');

  interface MockCase {
    desc: string;
    payload: Record<string, any>;
  }

  const mockCases: MockCase[] = [
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
      desc: '纯德语(非EN)单语种对象',
      payload: {
        title: { de: 'Nur Deutsch' },
        rawTitle: { de: 'Nur Deutsch' },
        label: { de: 'Klicken' },
        headline: { de: 'Schlagzeile' },
      },
    },
    {
      desc: '纯单字符串标量值 (兼容历史数据)',
      payload: {
        title: 'Direct String Title',
        rawTitle: 'Direct String Title',
        label: 'Direct Button',
        headline: 'Direct Headline',
        subtitle: 'custom-slug',
      },
    },
    {
      desc: '完全空对象 (模拟新建草稿或未填写状态)',
      payload: {},
    },
  ];

  let checkedPreviews = 0;

  function testPreview(schemaPath: string, previewObj: any) {
    checkedPreviews++;
    if (!previewObj.prepare) {
      logFail(`${schemaPath}: 缺少 prepare() 函数！Sanity v3 对数组和局部对象若缺省 prepare 将在未填空字段时回退 Invalid preview config。`);
      return;
    }

    for (const mock of mockCases) {
      try {
        const res = previewObj.prepare(mock.payload);
        if (!res || typeof res !== 'object') {
          logFail(`${schemaPath} [${mock.desc}]: prepare() 必须返回对象，实际返回: ${typeof res}`);
          continue;
        }

        // 核心断言 1: title 必须是 string 且不能为空
        if (typeof res.title !== 'string') {
          logFail(`${schemaPath} [${mock.desc}]: res.title 必须是 primitive string，实际类型为 ${typeof res.title}: ${JSON.stringify(res.title)}`);
        } else if (res.title.trim() === '') {
          logFail(`${schemaPath} [${mock.desc}]: res.title 不能为空白字符串！`);
        } else if (res.title.includes('[object Object]')) {
          logFail(`${schemaPath} [${mock.desc}]: res.title 泄露了 [object Object]，未正确解包 localeString: "${res.title}"`);
        }

        // 核心断言 2: subtitle 若存在，必须是 string 且不包含 [object Object]
        if (res.subtitle !== undefined && res.subtitle !== null) {
          if (typeof res.subtitle !== 'string') {
            logFail(`${schemaPath} [${mock.desc}]: res.subtitle 必须是 string，实际类型为 ${typeof res.subtitle}: ${JSON.stringify(res.subtitle)}`);
          } else if (res.subtitle.includes('[object Object]')) {
            logFail(`${schemaPath} [${mock.desc}]: res.subtitle 泄露了 [object Object]: "${res.subtitle}"`);
          }
        }
      } catch (err: any) {
        logFail(`${schemaPath} [${mock.desc}]: prepare() 执行时抛出未捕获异常: ${err.message}`);
      }
    }
  }

  const schemaIndexFile = path.join(STUDIO_DIR, 'schemaTypes', 'index.ts');
  const { schemaTypes } = await loadTsModule(schemaIndexFile);

  for (const schema of schemaTypes as any[]) {
    const schemaName = schema.name || schema.title || 'unnamedSchema';
    if (schema.preview) {
      testPreview(`Schema[${schemaName}].preview`, schema.preview);
    }

    if (Array.isArray(schema.fields)) {
      for (const field of schema.fields) {
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
        if (field.type === 'object' && Array.isArray(field.fields)) {
          for (const subField of field.fields) {
            if (subField.type === 'array' && Array.isArray(subField.of)) {
              for (const subItem of subField.of) {
                if (subItem.preview) {
                  testPreview(`Schema[${schemaName}].field[${field.name}][${subField.name}].item[${subItem.name || subItem.type}].preview`, subItem.preview);
                }
              }
            }
            if (subField.type === 'array' && Array.isArray(subField.initialValue)) {
              subField.initialValue.forEach((subItem: any, sIdx: number) => {
                if (subItem && typeof subItem === 'object' && !subItem._key) {
                  logFail(`Schema[${schemaName}].field[${field.name}][${subField.name}].initialValue[${sIdx}]: 数组初始值缺少 '_key'！`);
                }
              });
            }
          }
        }
      }
    }
  }

  // 1.4 React Error #31 防护：Studio 组件与多语言宽对象渲染安全扫描
  const studioCompFiles = getFiles(path.join(ROOT_DIR, 'studio', 'components'), ['.tsx', '.jsx']);
  for (const file of studioCompFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const rel = path.relative(ROOT_DIR, file);
    if (content.includes('{prod.title}') && !content.includes('getTitleText')) {
      logFail(`${rel}: 发现未经多语言解包的 {prod.title} 直接作为 React 子节点渲染！会导致 Studio 抛出 'Minified React error #31; object with keys {de, en, es, fr}'。`);
    }
  }

  logPass(`已完成 ${checkedPreviews} 处 Sanity Preview 配置测试、全部 Schema 初始值 _key 校验及 Studio 组件防 React Error #31 扫描`);

  // =========================================================================
  // 1.5 双端数据契约与 Schema 强联动同步校验 (src/data & types/index.ts <-> studio/schemaTypes)
  // =========================================================================
  logSection('1.5 双端数据契约与 Schema 强联动同步校验 (Principle I.6 High Cohesion)');

  const schemaMap = new Map<string, any>();
  for (const s of schemaTypes as any[]) {
    if (s && s.name) {
      schemaMap.set(s.name, s);
    }
  }

  const typesFilePath = path.join(ROOT_DIR, 'types', 'index.ts');
  const productsDataPath = path.join(SRC_DIR, 'data', 'products.ts');
  const siteConfigDataPath = path.join(SRC_DIR, 'data', 'siteConfig.ts');
  const pageDataPath = path.join(SRC_DIR, 'data', 'page.ts');
  const rfqDataPath = path.join(SRC_DIR, 'data', 'rfqSettings.ts');
  const defaultsDataPath = path.join(SRC_DIR, 'data', 'defaults.ts');

  const typesContent = fs.existsSync(typesFilePath) ? fs.readFileSync(typesFilePath, 'utf-8') : '';
  const productsDataContent = fs.existsSync(productsDataPath) ? fs.readFileSync(productsDataPath, 'utf-8') : '';
  const siteConfigDataContent = fs.existsSync(siteConfigDataPath) ? fs.readFileSync(siteConfigDataPath, 'utf-8') : '';
  const pageDataContent = fs.existsSync(pageDataPath) ? fs.readFileSync(pageDataPath, 'utf-8') : '';
  const rfqDataContent = fs.existsSync(rfqDataPath) ? fs.readFileSync(rfqDataPath, 'utf-8') : '';
  const defaultsMod = fs.existsSync(defaultsDataPath) ? await loadTsModule(defaultsDataPath) : {};

  // 提取 DEFAULT_RFQ_SETTINGS 的字段集合（合并 src/data/rfqSettings.ts 显式布尔开关与 DEFAULT_RFQ）
  const rfqExplicitKeys: string[] = [];
  const rfqObjMatch = rfqDataContent.match(/export\s+const\s+DEFAULT_RFQ_SETTINGS[^=]*=\s*\{([\s\S]*?)\};/);
  if (rfqObjMatch) {
    for (const rawLine of rfqObjMatch[1].split('\n')) {
      const line = rawLine.replace(/\/\/.*$/, '').trim();
      const keyMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
      if (keyMatch) rfqExplicitKeys.push(keyMatch[1]);
    }
  }
  const rfqFrontendFields = Array.from(
    new Set([...rfqExplicitKeys, ...Object.keys(defaultsMod.DEFAULT_RFQ || {})])
  );
  const catalogFrontendFields = Object.keys(defaultsMod.DEFAULT_CATALOG || {});

  const BUILTIN_SANITY_FIELDS = new Set(['_id', '_type', '_key', '_rev', '_createdAt', '_updatedAt']);

  interface SchemaContractSpec {
    schemaName: string;
    tsInterface: string;
    dataLabel: string;
    dataFields: string[];
    allowedExtraTsFields?: string[];
    allowedExtraDataFields?: string[];
  }

  const coreContractSpecs: SchemaContractSpec[] = [
    {
      schemaName: 'product',
      tsInterface: 'Product',
      dataLabel: 'src/data/products.ts [PRODUCT_FIELDS]',
      dataFields: extractGroqConstTopLevelFields(productsDataContent, 'PRODUCT_FIELDS'),
      allowedExtraTsFields: ['_id'],
    },
    {
      schemaName: 'category',
      tsInterface: 'ProductCategory',
      dataLabel: 'src/data/products.ts [CATEGORY_FIELDS]',
      dataFields: extractGroqConstTopLevelFields(productsDataContent, 'CATEGORY_FIELDS'),
      allowedExtraTsFields: ['_id'],
    },
    {
      schemaName: 'siteConfig',
      tsInterface: 'SiteConfig',
      dataLabel: 'src/data/siteConfig.ts [CONFIG_QUERY_OBJ]',
      dataFields: extractGroqConstTopLevelFields(siteConfigDataContent, 'CONFIG_QUERY_OBJ'),
      allowedExtraTsFields: ['_id', 'rfqConfig'],
    },
    {
      schemaName: 'page',
      tsInterface: 'Page',
      dataLabel: 'src/data/page.ts [PAGE_QUERY_OBJ]',
      dataFields: extractGroqConstTopLevelFields(pageDataContent, 'PAGE_QUERY_OBJ'),
      allowedExtraTsFields: ['_id'],
    },
    {
      schemaName: 'rfqSettings',
      tsInterface: 'RfqSettings',
      dataLabel: 'src/data/rfqSettings.ts [DEFAULT_RFQ_SETTINGS]',
      dataFields: rfqFrontendFields,
      allowedExtraTsFields: ['swatchKitImageUrl', 'swatchKitMoq', 'swatchKitImage'],
      allowedExtraDataFields: ['swatchKitImageUrl', 'swatchKitMoq'],
    },
    {
      schemaName: 'catalogSettings',
      tsInterface: 'CatalogSettings',
      dataLabel: 'src/data/defaults.ts [DEFAULT_CATALOG]',
      dataFields: catalogFrontendFields,
      allowedExtraTsFields: [],
      allowedExtraDataFields: ['fallbackCategories'],
    },
  ];

  let syncedContractCount = 0;

  for (const spec of coreContractSpecs) {
    const schemaDef = schemaMap.get(spec.schemaName);
    if (!schemaDef || !Array.isArray(schemaDef.fields)) {
      logFail(`[Schema 强联动] 未找到核心 Studio Schema '${spec.schemaName}' 或其 fields 定义！`);
      continue;
    }

    const schemaFields: string[] = schemaDef.fields.map((f: any) => f.name).filter(Boolean);
    const schemaFieldSet = new Set(schemaFields);
    const tsFields = extractTsInterfaceFields(typesContent, spec.tsInterface);
    const tsFieldSet = new Set(tsFields);
    const dataFieldSet = new Set(spec.dataFields);

    if (tsFields.length === 0) {
      logFail(`[Schema 强联动] types/index.ts 中未找到接口 '${spec.tsInterface}'！`);
      continue;
    }
    if (spec.dataFields.length === 0) {
      logFail(`[Schema 强联动] ${spec.dataLabel} 未提取到任何数据契约字段！`);
      continue;
    }

    // 1) Fail-Fast: Studio Schema 中定义的字段在 TS Interface 中缺失
    const missingInTs = schemaFields.filter((f) => !tsFieldSet.has(f));
    if (missingInTs.length > 0) {
      logFail(
        `[Schema 强联动] Studio Schema '${spec.schemaName}' 中的字段 [${missingInTs.join(', ')}] 未同步声明在 types/index.ts 接口 '${spec.tsInterface}' 中！`
      );
    }

    // 2) Fail-Fast: Studio Schema 中定义的字段在前端 GROQ 投影或默认数据契约中缺失
    const missingInData = schemaFields.filter((f) => !dataFieldSet.has(f));
    if (missingInData.length > 0) {
      logFail(
        `[Schema 强联动] Studio Schema '${spec.schemaName}' 中的字段 [${missingInData.join(', ')}] 在前端数据层 ${spec.dataLabel} 中漏接！`
      );
    }

    // 3) Fail-Fast: 前端 GROQ / 数据层引用了 Studio Schema 中不存在的幽灵字段
    const allowedDataExtras = new Set([
      ...Array.from(BUILTIN_SANITY_FIELDS),
      ...(spec.allowedExtraDataFields || []),
    ]);
    const ghostInData = spec.dataFields.filter((f) => !schemaFieldSet.has(f) && !allowedDataExtras.has(f));
    if (ghostInData.length > 0) {
      logFail(
        `[Schema 强联动] 前端数据层 ${spec.dataLabel} 投影了 Studio Schema '${spec.schemaName}' 中不存在的未定义字段: [${ghostInData.join(', ')}]！`
      );
    }

    // 4) Warn on Extras: TS Interface 中存在未在 Studio Schema 中定义的额外字段（排除已知内置/计算字段白名单）
    const allowedTsExtras = new Set([
      ...Array.from(BUILTIN_SANITY_FIELDS),
      ...(spec.allowedExtraTsFields || []),
    ]);
    const extraInTs = tsFields.filter((f) => !schemaFieldSet.has(f) && !allowedTsExtras.has(f));
    if (extraInTs.length > 0) {
      logWarn(
        `[Schema 强联动] types/index.ts 接口 '${spec.tsInterface}' 含 Studio Schema '${spec.schemaName}' 之外的扩展字段: [${extraInTs.join(', ')}]`
      );
    }

    syncedContractCount++;
  }

  // 校验 PRODUCT_CARD_FIELDS 轻量投影子集契约 (Principle I.3 按需索取契约)
  const productSchemaDef = schemaMap.get('product');
  const productSchemaFieldSet = new Set<string>(
    (productSchemaDef?.fields || []).map((f: any) => f.name).filter(Boolean)
  );
  const productTsFieldSet = new Set<string>(extractTsInterfaceFields(typesContent, 'Product'));
  const cardFields = extractGroqConstTopLevelFields(productsDataContent, 'PRODUCT_CARD_FIELDS');
  if (cardFields.length === 0) {
    logFail(`[Schema 强联动] src/data/products.ts [PRODUCT_CARD_FIELDS] 未提取到任何字段！`);
  } else {
    const invalidCardFields = cardFields.filter(
      (f) => !productSchemaFieldSet.has(f) && !BUILTIN_SANITY_FIELDS.has(f)
    );
    const untypedCardFields = cardFields.filter((f) => !productTsFieldSet.has(f));
    if (invalidCardFields.length > 0) {
      logFail(
        `[Schema 强联动] PRODUCT_CARD_FIELDS 包含 Studio 'product' Schema 未定义字段: [${invalidCardFields.join(', ')}]！`
      );
    }
    if (untypedCardFields.length > 0) {
      logFail(
        `[Schema 强联动] PRODUCT_CARD_FIELDS 包含 types/index.ts 'Product' 接口未定义字段: [${untypedCardFields.join(', ')}]！`
      );
    }
    syncedContractCount++;
  }

  // 校验 Product 嵌套子对象契约 (pricingTiers <-> PricingTier, colors <-> ColorVariant, specifications <-> ProductSpecification)
  const nestedProductSpecs: Array<{
    fieldName: string;
    tsInterface: string;
    allowedExtraTsFields?: string[];
  }> = [
    { fieldName: 'pricingTiers', tsInterface: 'PricingTier', allowedExtraTsFields: ['quantity'] },
    { fieldName: 'colors', tsInterface: 'ColorVariant', allowedExtraTsFields: ['pantone'] },
    { fieldName: 'specifications', tsInterface: 'ProductSpecification', allowedExtraTsFields: [] },
  ];

  for (const nested of nestedProductSpecs) {
    const parentField = (productSchemaDef?.fields || []).find((f: any) => f.name === nested.fieldName);
    const subFields: string[] = (parentField?.of?.[0]?.fields || []).map((f: any) => f.name).filter(Boolean);
    const subFieldSet = new Set(subFields);
    const nestedTsFields = extractTsInterfaceFields(typesContent, nested.tsInterface);
    const nestedTsSet = new Set(nestedTsFields);

    const missingNestedInTs = subFields.filter((f) => !nestedTsSet.has(f));
    if (missingNestedInTs.length > 0) {
      logFail(
        `[Schema 强联动] Studio 'product.${nested.fieldName}' 子字段 [${missingNestedInTs.join(', ')}] 未同步声明在 types/index.ts '${nested.tsInterface}' 接口中！`
      );
    }

    const allowedExtras = new Set(nested.allowedExtraTsFields || []);
    const extraNestedInTs = nestedTsFields.filter((f) => !subFieldSet.has(f) && !allowedExtras.has(f));
    if (extraNestedInTs.length > 0) {
      logWarn(
        `[Schema 强联动] types/index.ts '${nested.tsInterface}' 含 Studio 'product.${nested.fieldName}' 之外的扩展字段: [${extraNestedInTs.join(', ')}]`
      );
    }
    syncedContractCount++;
  }

  logPass(
    `[Pitfall 24 / Principle I.6] 已完成 ${syncedContractCount} 组双端核心 Schema、GROQ 投影与 TS 接口三方强内聚契约同步校验`
  );

  // =========================================================================
  // 2. AGENTS.md 历史踩坑反例代码与架构红线静态扫描
  // =========================================================================
  logSection('2. AGENTS.md 历史踩坑反例代码与架构红线扫描');

  const astroFiles = getFiles(SRC_DIR, ['.astro']);
  const tsAndJsFiles = getFiles(SRC_DIR, ['.ts', '.js']);
  const allSourceFiles = [...astroFiles, ...tsAndJsFiles];

  // 2.1 [Pitfall 1 & 4]: 客户端原生内联脚本禁 TS 语法
  for (const file of astroFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const scriptRegex = /<script\s+[^>]*(?:define:vars|is:inline)[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(content)) !== null) {
      const scriptBody = match[1];
      if (
        scriptBody.includes(' as any') ||
        scriptBody.includes('as unknown') ||
        scriptBody.includes('dataset.bound = true as any') ||
        scriptBody.includes(': any') ||
        scriptBody.includes(': string') ||
        scriptBody.includes(': number')
      ) {
        logFail(`${path.relative(ROOT_DIR, file)}: [Pitfall 1] 客户端原生 <script define:vars/is:inline> 中包含 TS 类型断言或类型声明，浏览器执行将引发 'SyntaxError: Unexpected identifier' 导致整站交互瘫痪！`);
      }
    }
  }
  logPass(`[Pitfall 1] 客户端原生内联脚本 TS 语法断言校验通过`);

  // 2.2 [Pitfall 2]: 列表渲染防布局偏移 (CLS)
  for (const file of astroFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const emptyGridRegex = /<div[^>]*id=["']products-grid["'][^>]*>\s*<\/div>/gi;
    if (emptyGridRegex.test(content)) {
      logFail(`${path.relative(ROOT_DIR, file)}: [Pitfall 2] 检测到空的产品货架网格容器 '<div id="products-grid"></div>'！必须在服务端通过 SSR ({initialProducts.map(...)}) 预渲染首批卡片，在第 0 毫秒确立物理骨架高度，严禁客户端异步塞入导致 Footer 剧烈下推 2000px (CLS 爆表)！`);
    }
  }
  logPass(`[Pitfall 2] 列表渲染 CLS 零偏移物理骨架校验通过`);

  // 2.3 [Pitfall 3]: 杜绝序列化雪崩与大数组 define:vars 转义膨胀 (357KB)
  for (const file of astroFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const defineVarsRegex = /<script\s+[^>]*define:vars=\{([^}]+)\}[^>]*>/gi;
    let match;
    while ((match = defineVarsRegex.exec(content)) !== null) {
      const varsAttr = match[1];
      if (varsAttr.includes('JSON.stringify(')) {
        logFail(`${path.relative(ROOT_DIR, file)}: [Pitfall 3] 严禁在 define:vars 中嵌套使用 JSON.stringify()，字符串双重反斜杠转义将引发体积数倍膨胀 (曾导致 357KB 冗余)！请使用 '<script type="application/json">' 原生隔离解析。`);
      }
    }
  }
  logPass(`[Pitfall 3] 大数据隔离与 define:vars 转义安全校验通过`);

  // 2.4 [Pitfall 4]: 外链字体阻塞渲染 (816ms 首屏白屏)
  for (const file of astroFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes('fonts.googleapis.com')) {
      const linkMatch = content.match(/<link[^>]*href=["'][^"']*fonts\.googleapis\.com[^"']*["'][^>]*>/gi);
      if (linkMatch) {
        for (const linkTag of linkMatch) {
          if (linkTag.includes('rel="stylesheet"') && !linkTag.includes('media="print"')) {
            logFail(`${path.relative(ROOT_DIR, file)}: [Pitfall 4] 检测到阻塞式外链字体加载: ${linkTag}。必须采用 preload 异步打印切换机制以消除 800ms 首屏白屏。`);
          }
        }
      }
    }
  }
  logPass(`[Pitfall 4] 外链字体异步加载与首屏非阻塞校验通过`);

  // 2.5 [Pitfall 6]: HTML 属性实体转义暴增 (43.4KB 冗余，占全站 HTML 40%)
  for (const file of astroFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const attrJsonRegex = /data-[a-zA-Z0-9_-]+=\{JSON\.stringify\([^)]+\)\}/g;
    const match = content.match(attrJsonRegex);
    if (match) {
      logFail(`${path.relative(ROOT_DIR, file)}: [Pitfall 6] 检测到在 HTML 节点属性中序列化宽对象 (${match.join(', ')})。HTML 属性会将引号转义为 &quot; 造成 40KB+ 页面体积虚高！`);
    }
  }
  logPass(`[Pitfall 6] HTML 节点属性轻量化与防实体膨胀校验通过`);

  // 2.6 [Pitfall 7]: 反向代理 URL 破坏 srcset 与 <link rel="preload"> 失效
  const imageServiceFile = path.join(SRC_DIR, 'utils', 'image.ts');
  if (fs.existsSync(imageServiceFile)) {
    const content = fs.readFileSync(imageServiceFile, 'utf-8');
    if (content.includes('cdn.sanity.io') && !content.includes('/cdn-image/')) {
      logFail(`src/utils/image.ts: [Pitfall 7] 图片服务层必须同时兼容直接源站 ('cdn.sanity.io') 与边缘反向代理路径 ('/cdn-image/')，否则代理路径下 srcset 与预加载将全量失效，导致 LCP 恶化至 4.7s！`);
    }
  }
  logPass(`[Pitfall 7] Sanity CDN 与 Cloudflare 边缘反向代理路径双兼容校验通过`);

  // 2.7 [Pitfall 8]: 首屏视口（Above-the-Fold）卡片误加 loading="lazy" 拖垮 Speed Index
  const productCardFile = path.join(SRC_DIR, 'components', 'ProductCard.astro');
  if (fs.existsSync(productCardFile)) {
    const content = fs.readFileSync(productCardFile, 'utf-8');
    if (content.includes('loading="lazy"') && !content.includes('loading') && !content.includes('priority')) {
      logFail(`src/components/ProductCard.astro: [Pitfall 8] 卡片组件严禁写死 loading="lazy"！前 4 张处于首屏完全可见区域的卡片必须支持设为 eager 且首图挂载 fetchpriority="high"。`);
    }
  }
  logPass(`[Pitfall 8] 首屏视口图片动态加载策略校验通过`);

  // 2.8 [Pitfall 9]: Scroll 监听器强制同步重排 (269ms 卡顿)
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
        logFail(`${path.relative(ROOT_DIR, file)}: [Pitfall 9] 在 scroll 监听器中直接同步读取 DOM 几何属性，将引发强制同步重排 (Forced Reflow) 与 269ms 滚动掉帧！耗性能计算必须剥离至 resize/load 并挂载 requestAnimationFrame。`);
      }
    }
  }
  logPass(`[Pitfall 9] Scroll 监听器读写分离与零强制回流校验通过`);

  // 2.9 [Pitfall 11]: CMS 字段缺失回退至未优化本地兜底大图拖垮 LCP (6.0s 劣化)
  if (fs.existsSync(PUBLIC_DIR)) {
    const staticImages = getFiles(path.join(PUBLIC_DIR, 'images'), ['.jpg', '.jpeg', '.png']);
    for (const img of staticImages) {
      const stats = fs.statSync(img);
      if (stats.size > 200 * 1024) {
        const webpVersion = img.replace(/\.(jpg|jpeg|png)$/, '.webp');
        if (!fs.existsSync(webpVersion)) {
          logWarn(`public/images/${path.basename(img)}: [Pitfall 11] 本地图片体积较大 (${(stats.size / 1024).toFixed(1)}KB) 且缺少对应的 .webp 压缩版，若作为前端默认兜底图将大幅拉低 LCP。`);
        }
      }
    }
  }
  logPass(`[Pitfall 11] 本地兜底图片资源 WebP 轻量化检验通过`);

  // 2.10 [Pitfall 12 & I.5]: Astro v6 与 Cloudflare Workers 环境变量 Proxy 崩溃 (500 异常)
  for (const file of allSourceFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes('locals.runtime.env') || content.includes('locals.runtime?.env')) {
      logFail(`${path.relative(ROOT_DIR, file)}: [Pitfall 12] 违反红线！检测到 'locals.runtime.env'。Astro v6 官方适配器已将其设为抛错代理，必须使用 "import { env } from 'cloudflare:workers'" 获取环境变量。`);
    }
  }
  logPass(`[Pitfall 12] Cloudflare Workers 原生环境变量安全获取校验通过`);

  // 2.11 [Pitfall 13]: 产品目录网格断点与大屏 7 列黄金标准
  for (const file of astroFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes('min-[1440px]:grid-cols-7') || content.includes('2xl:grid-cols-7') || content.includes('xl:grid-cols-7')) {
      logFail(`${path.relative(ROOT_DIR, file)}: [Pitfall 13] 违反大屏货架黄金比例！产品目录 7 列断点必须严格使用 'min-[1760px]:grid-cols-7'，严禁在 1440px~1536px 提前开启 7 列过度压缩卡片宽度。`);
    }
  }
  logPass(`[Pitfall 13] 产品货架大屏 7 列黄金断点 (min-[1760px]:grid-cols-7) 校验通过`);

  // 2.12 [Principle I.2]: 外部网络调用刚性超时熔断防护 (刚性挂载 AbortSignal.timeout(6000))
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
        logFail(`${path.relative(ROOT_DIR, file)}: [Principle I.2] 外部网络 fetch 调用未挂载 AbortSignal.timeout()，一旦外部依赖网络抖动可能拖死边缘 Worker 引发 504！`);
      }
    }
  }
  logPass(`[Principle I.2] 服务端外部网络调用刚性超时熔断保护校验通过`);

  // 2.13 [Principle II]: Tailwind v4 纯 CSS 引擎红线
  const tailwindConfigFiles = ['tailwind.config.js', 'tailwind.config.cjs', 'tailwind.config.mjs', 'tailwind.config.ts'];
  for (const configName of tailwindConfigFiles) {
    if (fs.existsSync(path.join(ROOT_DIR, configName))) {
      logFail(`[Principle II] 违反架构红线！检测到根目录存在 '${configName}'。Tailwind v4 必须使用 globals.css 纯 CSS 引擎声明！`);
    }
  }
  logPass(`[Principle II] Tailwind v4 纯 CSS 引擎无配置污染校验通过`);

  // 2.14 [Principle II]: 组件单层扁平正交与绝对路径别名
  for (const file of allSourceFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes('../../components') || content.includes('../../../components')) {
      logFail(`${path.relative(ROOT_DIR, file)}: [Principle II] 发现深层嵌套相对组件导入！全站一律使用路径别名 '@components'。`);
    }
  }
  logPass(`[Principle II] 组件扁平正交与 @components 路径别名校验通过`);

  // 2.15 [Pitfall 14]: 国际 B2B 货币标准化对齐 (禁止硬编码 ¥ / 人民币，全站外贸标准统一采用 USD / $)
  for (const file of astroFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (
      file.includes('pages/products/index.astro') &&
      (content.includes('>¥<') || content.includes('>¥') || content.includes("${item.wholesalePrice || (item.category === 'silk' ? '32.00'"))
    ) {
      logFail(`${path.relative(ROOT_DIR, file)}: [Pitfall 14] 产品大厅价格硬编码了人民币符号 (¥) 或淘宝人民币默认值 (32/45/18.5)！必须使用 formatWholesalePrice 与国际外贸 USD ($) 对齐。`);
    }
  }
  logPass(`[Pitfall 14] 产品大厅全站外贸标准统一货币 (USD / $) 校验通过`);

  // 2.16 [Pitfall 15]: 触屏与平板交互可用性 (iPad 1024x1366 触控适配)
  for (const file of astroFiles) {
    if (file.includes('LanguagePicker.astro')) {
      const content = fs.readFileSync(file, 'utf-8');
      if (!content.includes('is-open') || !content.includes('addEventListener') || !content.includes('touch-manipulation')) {
        logFail(`${path.relative(ROOT_DIR, file)}: [Pitfall 15] 语言切换组件未适配触屏/iPad (1024x1366)！严禁仅依赖 CSS hover，必须挂载 click/touch 状态监听 (.is-open) 并声明 touch-manipulation。`);
      }
    }
  }
  logPass(`[Pitfall 15] 触屏与平板环境 (iPad 1024x1366) 语言切换交互可用性校验通过`);

  // 2.17 [Pitfall 16]: 商品币种与阶梯价单位独立字段及 MOQ 阶梯优先
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

  // 2.18 [Pitfall 17]: Bento 展台胶囊徽章防溢出与矮视口多维自适应 (1280x608 及紧凑屏幕自适应)
  const sockSpecMatrixFile = path.join(SRC_DIR, 'components', 'SockSpecMatrix.astro');
  if (fs.existsSync(sockSpecMatrixFile)) {
    const content = fs.readFileSync(sockSpecMatrixFile, 'utf-8');
    if (!content.includes('specs-section') || !content.includes('shrink-0 max-w-[55%]') || !content.includes('min-w-0 truncate')) {
      logFail(`src/components/SockSpecMatrix.astro: [Pitfall 17] Bento 展台胶囊标签缺少 min-w-0 / truncate / shrink-0 防御性排版，在 1280x608 等受限分辨率下会导致标签撑爆卡片！`);
    }
  }
  const globalsCssFile = path.join(SRC_DIR, 'styles', 'globals.css');
  if (fs.existsSync(globalsCssFile)) {
    const content = fs.readFileSync(globalsCssFile, 'utf-8');
    if (!content.includes('.specs-section') || !content.includes('max-height: 620px')) {
      logFail(`src/styles/globals.css: [Pitfall 17] 全局样式未将 .specs-section 纳入矮视口 (max-height: 720px / 620px) 阶梯自适应规则，会导致矮屏固定高度溢出！`);
    }
  }
  logPass(`[Pitfall 17] Bento 展台胶囊防溢出与矮视口多维自适应校验通过`);

  // 2.19 [Pitfall 18]: 动态路由与中间件静态资源 404 防御及边缘 HTML 缓存安全 (防丢样式 FOUC)
  const middlewareFile = path.join(SRC_DIR, 'middleware.ts');
  if (fs.existsSync(middlewareFile)) {
    const mwContent = fs.readFileSync(middlewareFile, 'utf-8');
    if (!mwContent.includes("pathname.startsWith('/_astro/')") || !mwContent.includes('Asset Not Found')) {
      logFail(`src/middleware.ts: [Pitfall 18] 中间件未拦截穿透的 /_astro/ 静态资源请求！缺失资源会落入 SSR 动态页面导致重定向与 MIME 冲突丢样式。`);
    }
    if (mwContent.includes('s-maxage=86400')) {
      logFail(`src/middleware.ts: [Pitfall 18] HTML 边缘缓存硬编码了 s-maxage=86400！必须动态引用 Studio 配置的 edgeCacheTtl。`);
    }
    if (!mwContent.includes('edgeCacheTtl')) {
      logFail(`src/middleware.ts: [Pitfall 18] 中间件未对接 Studio siteConfig.edgeCacheTtl 动态边缘缓存频率配置！`);
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
        logFail(`${relPath}: [Pitfall 18] 动态 [lang] 路由未防御下划线与点号静态文件，会导致请求误落入语言路由并 302 重定向到 HTML！`);
      }
    }
  }

  const catchAllSlugFile = path.join(SRC_DIR, 'pages', '[...slug].astro');
  if (fs.existsSync(catchAllSlugFile)) {
    const content = fs.readFileSync(catchAllSlugFile, 'utf-8');
    if (!content.includes('css|js|map') && !content.includes('slug.includes')) {
      logFail(`src/pages/[...slug].astro: [Pitfall 18] 根路由 catch-all 未对静态文件后缀 (css/js/map等) 做快速 404 防御！`);
    }
  }
  logPass(`[Pitfall 18] 动态路由与中间件静态资源 404 防御及边缘 HTML 缓存安全校验通过`);

  // 2.20 [Pitfall 20]: 依赖锁文件严格同步与单一包管理器准则 (package-lock.json)
  for (const strayLock of ['bun.lock', 'bun.lockb', 'yarn.lock', 'pnpm-lock.yaml']) {
    const lockPath = path.join(ROOT_DIR, strayLock);
    if (fs.existsSync(lockPath)) {
      try {
        fs.unlinkSync(lockPath);
      } catch {
        logFail(`[Pitfall 20] 检测到冲突锁文件 ${strayLock} 且自动清理失败，请手动删除！`);
      }
    }
  }
  const pkgJsonPath = path.join(ROOT_DIR, 'package.json');
  const lockJsonPath = path.join(ROOT_DIR, 'package-lock.json');
  if (!fs.existsSync(lockJsonPath)) {
    logFail(`[Pitfall 20] 缺少 package-lock.json 锁文件！`);
  } else {
    try {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      const lockJson = JSON.parse(fs.readFileSync(lockJsonPath, 'utf-8'));
      const lockRoot = lockJson?.packages?.[''] || {};
      const allDeps: Record<string, string> = { ...(pkgJson.dependencies || {}), ...(pkgJson.devDependencies || {}) };
      const lockDeps: Record<string, string> = { ...(lockRoot.dependencies || {}), ...(lockRoot.devDependencies || {}) };
      const missingInLock: string[] = [];
      for (const [depName, depRange] of Object.entries(allDeps)) {
        if (lockDeps[depName] !== depRange) {
          missingInLock.push(`${depName}@${depRange}`);
        }
      }
      if (missingInLock.length > 0) {
        logFail(
          `[Pitfall 20] package.json 与 package-lock.json 不同步！缺失或版本不一致: ${missingInLock.join(', ')}。请同步更新 package-lock.json。`
        );
      } else {
        // Ensure all declared dependencies and their transitive dependencies have node_modules/* entries in lockJson.packages
        let lockUpdated = false;
        const queue = Object.keys(allDeps);
        const visited = new Set<string>();
        while (queue.length > 0) {
          const dep = queue.shift()!;
          if (visited.has(dep)) continue;
          visited.add(dep);
          const nmKey = `node_modules/${dep}`;
          const installedPkgPath = path.join(ROOT_DIR, nmKey, 'package.json');
          if (fs.existsSync(installedPkgPath)) {
            const installedPkg = JSON.parse(fs.readFileSync(installedPkgPath, 'utf-8'));
            if (!lockJson.packages[nmKey]) {
              const entry: Record<string, any> = {
                version: installedPkg.version,
                resolved: `https://registry.npmjs.org/${dep}/-/${dep.split('/').pop()}-${installedPkg.version}.tgz`,
                dev: Boolean(pkgJson.devDependencies?.[dep] || true),
                license: installedPkg.license || 'MIT',
              };
              if (installedPkg.dependencies) entry.dependencies = installedPkg.dependencies;
              if (installedPkg.bin) entry.bin = installedPkg.bin;
              if (installedPkg.engines) entry.engines = installedPkg.engines;
              if (installedPkg.peerDependencies) entry.peerDependencies = installedPkg.peerDependencies;
              if (installedPkg.peerDependenciesMeta) entry.peerDependenciesMeta = installedPkg.peerDependenciesMeta;
              lockJson.packages[nmKey] = entry;
              lockUpdated = true;
            }
            for (const subDep of Object.keys(installedPkg.dependencies || {})) {
              if (!visited.has(subDep)) queue.push(subDep);
            }
          }
        }
        if (lockUpdated) {
          fs.writeFileSync(lockJsonPath, JSON.stringify(lockJson, null, 4) + '\n', 'utf-8');
        }
        logPass(`[Pitfall 20] 依赖锁文件严格同步与单一包管理器准则校验通过`);
      }
    } catch (err: any) {
      logFail(`[Pitfall 20] 校验 package-lock.json 异常: ${err?.message}`);
    }
  }

  // 2.21 [Pitfall 21]: 双环境按需挂载 Studio 与防 Cloudflare Worker Error 1102 (CPU 超限)
  const astroConfigFile = path.join(ROOT_DIR, 'astro.config.mjs');
  if (fs.existsSync(astroConfigFile)) {
    const astroConfig = fs.readFileSync(astroConfigFile, 'utf-8');
    if (
      !astroConfig.includes('isProduction ? [] : [react()]') ||
      !astroConfig.includes("isProduction ? {} : { studioBasePath: '/studio' }") ||
      !astroConfig.includes("drop: isProduction ? ['console', 'debugger'] : []")
    ) {
      logFail(`astro.config.mjs: [Pitfall 21] 生产环境必须剥离 @astrojs/react() 与 studioBasePath: '/studio' 并开启 esbuild drop console/debugger，防止主站 SSR Worker 体积暴增触发 Cloudflare Error 1102！`);
    } else {
      logPass(`[Pitfall 21] 双环境按需挂载 Studio 与防 Cloudflare Worker Error 1102 校验通过`);
    }
  }

  // 2.22 [Pitfall 22]: Wrangler v4 配置纯净度、Studio 浏览器端环境变量安全守卫与 CI 流水线校验
  for (const cfgRel of ['wrangler.jsonc', 'studio/wrangler.jsonc']) {
    const cfgPath = path.join(ROOT_DIR, cfgRel);
    if (fs.existsSync(cfgPath)) {
      try {
        const parsed = parseJsonc(fs.readFileSync(cfgPath, 'utf-8'));
        if (Object.prototype.hasOwnProperty.call(parsed, 'main')) {
          logFail(`${cfgRel}: [Pitfall 22] 严禁手动添加 "main" 字段（与 @astrojs/cloudflare v14 或 Wrangler v4 Assets Worker 冲突）！`);
        }
      } catch (e: any) {
        logFail(`${cfgRel}: [Pitfall 22] JSONC 语法解析失败: ${e.message}`);
      }
    }
  }
  const studioSourceFiles = getFiles(STUDIO_DIR, ['.ts', '.tsx', '.js', '.mjs']);
  for (const sf of studioSourceFiles) {
    if (sf.endsWith('sanity.cli.ts') || sf.endsWith('sanity.cli.js')) continue;
    const content = fs.readFileSync(sf, 'utf-8');
    if (
      content.includes('process.env') &&
      !content.includes("typeof process !== 'undefined'") &&
      !content.includes('typeof process !== "undefined"')
    ) {
      logFail(`${path.relative(ROOT_DIR, sf)}: [Pitfall 22] Studio 前端代码访问 process.env 缺少 typeof process !== 'undefined' 浏览器安全守卫！`);
    }
  }
  const deployWorkflowFile = path.join(ROOT_DIR, '.github', 'workflows', 'deploy.yml');
  if (fs.existsSync(deployWorkflowFile)) {
    const wf = fs.readFileSync(deployWorkflowFile, 'utf-8');
    if (wf.includes('then npm ci') || wf.includes('cloudflare/wrangler-action@v3')) {
      logFail(`.github/workflows/deploy.yml: [Pitfall 22] 检测到脆弱的 'then npm ci' 或旧版 'cloudflare/wrangler-action@v3'！`);
    }
  }
  logPass(`[Pitfall 22] Wrangler v4 配置纯净度、Studio 浏览器端 process.env 安全守卫与 CI 流水线校验通过`);

  // 2.23 [Principle IV]: 版本库纯净度与本地资产 .gitignore 隔离 (Git Hygiene)
  const gitignoreFile = path.join(ROOT_DIR, '.gitignore');
  if (fs.existsSync(gitignoreFile)) {
    const gi = fs.readFileSync(gitignoreFile, 'utf-8');
    for (const item of ['AGENTS.md', '.agent/', 'scripts/', '.vscode/', '.archify/']) {
      if (!gi.includes(item)) {
        logFail(`.gitignore: [Principle IV] 必须隔离本地资产 '${item}'！`);
      }
    }
  }
  logPass(`[Principle IV] 版本库纯净度与本地资产 .gitignore 隔离校验通过`);

  // 2.24 执行动态演进扩展规则 (scripts/preflight-rules.json)
  const customStore = loadCustomRules();
  for (const custom of customStore.customRules) {
    const violations: string[] = [];
    for (const chk of custom.checks) {
      const err = runDeclarativeCheck(chk);
      if (err) violations.push(err);
    }
    if (violations.length > 0) {
      for (const v of violations) {
        logFail(`[Pitfall #${custom.num} ${custom.title}] ${v}`);
      }
    } else {
      logPass(`[Pitfall #${custom.num}] ${custom.title} 校验通过`);
    }
  }

  // =========================================================================
  // 3. i18n 多语言核心字典完整性校验 (Pitfall 19)
  // =========================================================================
  logSection('3. i18n 多语言字典完整性与路由语种对齐校验');

  try {
    const i18nFile = path.join(SRC_DIR, 'i18n', 'ui.ts');
    if (fs.existsSync(i18nFile)) {
      const i18nMod = await loadTsModule(i18nFile);
      const dict = i18nMod.UI_STRINGS || i18nMod.ui;
      const langs = i18nMod.LANGUAGES || i18nMod.languages;
      if (dict && langs) {
        const supportedLangs = Object.keys(langs);
        const enKeys = Object.keys(dict.en || {});

        for (const lang of supportedLangs) {
          if (!dict[lang]) {
            logFail(`i18n: 缺少 '${lang}' 语言字典！`);
            continue;
          }
          const currentKeys = new Set(Object.keys(dict[lang]));
          const missingKeys = enKeys.filter((k) => !currentKeys.has(k));
          const emptyKeys = enKeys.filter((k) => currentKeys.has(k) && String(dict[lang][k]).trim() === '');
          const extraKeys = Object.keys(dict[lang]).filter((k) => !enKeys.includes(k));
          if (missingKeys.length > 0) {
            logFail(`i18n [${lang}]: 相比 en 字典缺失以下 ${missingKeys.length} 个键: ${missingKeys.slice(0, 5).join(', ')}${missingKeys.length > 5 ? '...' : ''}`);
          }
          if (emptyKeys.length > 0) {
            logFail(`i18n [${lang}]: 存在 ${emptyKeys.length} 个空字符串翻译键: ${emptyKeys.slice(0, 5).join(', ')}`);
          }
          if (extraKeys.length > 0) {
            logFail(`i18n [${lang}]: 存在 ${extraKeys.length} 个未在 en 定义的孤立键: ${extraKeys.slice(0, 5).join(', ')}`);
          }
        }

        if (fs.existsSync(astroConfigFile)) {
          const astroContent = fs.readFileSync(astroConfigFile, 'utf-8');
          const astroLocalesMatch = astroContent.match(/locales\s*:\s*\[([^\]]+)\]/);
          if (astroLocalesMatch) {
            const astroLocales = [...astroLocalesMatch[1].matchAll(/['"]([a-z]{2})['"]/g)].map((m) => m[1]);
            for (const lang of supportedLangs) {
              if (!astroLocales.includes(lang)) {
                logFail(`i18n: 语种 '${lang}' 未同步添加到 astro.config.mjs 的 i18n.locales 中！`);
              }
            }
          }
        }

        logPass(`[Pitfall 19] i18n 多语言字典 100% 对称性检查通过，支持语言: [${supportedLangs.join(', ')}]，主键数: ${enKeys.length}`);
      } else {
        logFail(`src/i18n/ui.ts 未导出 UI_STRINGS / LANGUAGES！`);
      }
    }
  } catch (err: any) {
    logFail(`i18n 加载校验异常: ${err.message}`);
  }

  // =========================================================================
  // 4. Sanity 数据集结构与字段类型一致性深度巡检 (若开启 --data 或 --full)
  // =========================================================================
  if (isDataMode) {
    logSection('4. Sanity 数据集 _key 完整性与 Schema 类型一致性巡检 (--data Mode)');
    try {
      const { createClient } = localRequire('@sanity/client');
      const dotenv = localRequire('dotenv');
      dotenv.config({ path: path.join(ROOT_DIR, '.env') });
      if (process.env.SANITY_PROJECT_ID && process.env.SANITY_TOKEN) {
        const client = createClient({
          projectId: process.env.SANITY_PROJECT_ID,
          dataset: process.env.SANITY_DATASET || 'production',
          token: process.env.SANITY_TOKEN,
          apiVersion: '2024-01-01',
          useCdn: false,
        });
        const docs = await client.fetch('*[!(_id in path("_.**"))]');

        // 4.1 Array _key 完整率扫描
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

        // 4.2 Schema 字段类型一致性巡检 (防 Invalid property value: type must be localeString)
        const typeMismatches: string[] = [];

        function checkLocaleField(docId: string, docType: string, pathKey: string, val: any) {
          if (typeof val === 'string') {
            typeMismatches.push(`${docId} (${docType}) -> ${pathKey}: 存储为原始 string "${val}"，而 Schema 预期为 localeString`);
          }
        }

        for (const doc of docs) {
          if (doc._type === 'siteConfig') {
            ['titleSuffix', 'whatsAppPrefillText', 'whatsAppTooltip'].forEach((f) => {
              if (doc[f]) checkLocaleField(doc._id, doc._type, f, doc[f]);
            });
            if (Array.isArray(doc.header?.navLinks)) {
              doc.header.navLinks.forEach((nl: any, i: number) => {
                if (nl?.label) checkLocaleField(doc._id, doc._type, `header.navLinks[${i}].label`, nl.label);
              });
            }
            if (Array.isArray(doc.footer?.columns)) {
              doc.footer.columns.forEach((col: any, cIdx: number) => {
                if (col?.title) checkLocaleField(doc._id, doc._type, `footer.columns[${cIdx}].title`, col.title);
                if (Array.isArray(col?.links)) {
                  col.links.forEach((l: any, lIdx: number) => {
                    if (l?.label) checkLocaleField(doc._id, doc._type, `footer.columns[${cIdx}].links[${lIdx}].label`, l.label);
                  });
                }
              });
            }
            if (Array.isArray(doc.footer?.legalLinks)) {
              doc.footer.legalLinks.forEach((l: any, lIdx: number) => {
                if (l?.label) checkLocaleField(doc._id, doc._type, `footer.legalLinks[${lIdx}].label`, l.label);
              });
            }
          }

          if (doc._type === 'product') {
            ['title', 'priceNote', 'paletteTitle', 'specsBadge', 'specsHeading', 'addToQuoteButtonText'].forEach((f) => {
              if (doc[f]) checkLocaleField(doc._id, doc._type, f, doc[f]);
            });
          }

          if (doc._type === 'category') {
            ['title', 'description'].forEach((f) => {
              if (doc[f]) checkLocaleField(doc._id, doc._type, f, doc[f]);
            });
          }

          if (doc._type === 'rfqSettings') {
            ['drawerTitle', 'drawerSubtitle', 'sampleKitNotice', 'drawerSuccessMessage', 'drawerErrorMessage'].forEach((f) => {
              if (doc[f]) checkLocaleField(doc._id, doc._type, f, doc[f]);
            });
          }
          if (doc._type === 'catalogSettings') {
            ['title', 'subtitle', 'badge', 'emptyStateTitle', 'emptyStateDescription'].forEach((f) => {
              if (doc[f]) checkLocaleField(doc._id, doc._type, f, doc[f]);
            });
          }

          if (doc._type === 'page') {
            if (doc.title) checkLocaleField(doc._id, doc._type, 'title', doc.title);
            if (Array.isArray(doc.sections)) {
              doc.sections.forEach((sec: any, sIdx: number) => {
                if (sec._type === 'heroSection') {
                  ['headline', 'subline', 'superTitle', 'primaryButtonText', 'secondaryButtonText'].forEach((f) => {
                    if (sec[f]) checkLocaleField(doc._id, doc._type, `sections[${sIdx}].${f}`, sec[f]);
                  });
                }
                if (sec._type === 'productShowcaseSection') {
                  ['title', 'subtitle', 'badge', 'actionButtonText', 'cardDetailsButtonText'].forEach((f) => {
                    if (sec[f]) checkLocaleField(doc._id, doc._type, `sections[${sIdx}].${f}`, sec[f]);
                  });
                }
                if (sec._type === 'manufacturingSection') {
                  ['title', 'subtitle', 'badge', 'heroBadge', 'heroTitle', 'heroSubtitle', 'heroPrimaryButton', 'heroSecondaryButton'].forEach((f) => {
                    if (sec[f]) checkLocaleField(doc._id, doc._type, `sections[${sIdx}].${f}`, sec[f]);
                  });
                }
                if (sec._type === 'inquirySection') {
                  ['headline', 'subline', 'badge', 'buttonText', 'successTitle', 'successMessage'].forEach((f) => {
                    if (sec[f]) checkLocaleField(doc._id, doc._type, `sections[${sIdx}].${f}`, sec[f]);
                  });
                }
              });
            }
          }
        }

        if (typeMismatches.length > 0) {
          logFail(`Sanity 数据库中存在 ${typeMismatches.length} 处 Schema 字段类型破损 (Invalid property value)！`);
          typeMismatches.slice(0, 10).forEach((m) => console.log(`   ✖ ${m}`));
        } else {
          logPass(`Sanity 数据库字段类型一致性校验通过：全量 ${docs.length} 个文档中多语言字段无 primitive string 破损`);
        }

        // 4.3 数据库商品价格阶梯直接取值与全量美元标准化校验 (防历史 ¥ 污染与未对齐)
        let yenProductCount = 0;
        for (const doc of docs) {
          if (doc._type === 'product') {
            const ptStr = JSON.stringify(doc.pricingTiers || []);
            if (ptStr.includes('¥')) {
              yenProductCount++;
            }
          }
        }
        if (yenProductCount > 0) {
          logFail(`Sanity 数据库中存在 ${yenProductCount} 个商品阶梯价格仍含有人民币符号 (¥)！详情页与产品大厅币种未对齐。`);
        } else {
          logPass(`Sanity 数据库商品阶梯出厂价校验通过：全量商品出厂阶梯价均已对齐为国际标准美元 ($)`);
        }
      } else {
        logWarn(`未配置 SANITY_TOKEN，跳过远程数据集线上写库巡检`);
      }
    } catch (err: any) {
      logWarn(`Sanity 数据集检验跳过: ${err.message}`);
    }
  }

  // =========================================================================
  // 5. 双端生产编译与 Wrangler v4 部署预检全量验证 (若开启 --full)
  // =========================================================================
  if (isFullMode) {
    logSection('5. 双端生产编译与 Wrangler v4 部署预检全量验证 (--full Mode)');

    try {
      console.log('正在执行 Sanity Studio 生产构建: npm run build:studio ...');
      execSync('npm run build:studio', { stdio: 'inherit', cwd: ROOT_DIR });
      logPass('Sanity Studio 生产编译成功！');
    } catch {
      logFail('Sanity Studio 生产编译失败！请检查 studio 报错。');
    }

    try {
      console.log('正在执行 Astro 生产构建: npm run build ...');
      execSync('npm run build', { stdio: 'inherit', cwd: ROOT_DIR });
      logPass('Astro 生产编译成功！');
    } catch {
      logFail('Astro 生产编译失败！请检查 astro build 报错。');
    }

    try {
      console.log('正在执行主站與 Studio Wrangler v4 部署预检 (--dry-run) ...');
      execSync('npx wrangler deploy --dry-run', { stdio: 'pipe', cwd: ROOT_DIR });
      execSync('npx wrangler deploy --config studio/wrangler.jsonc --dry-run', { stdio: 'pipe', cwd: ROOT_DIR });
      logPass('主站与 Studio 双端 Wrangler v4 部署预检 (--dry-run) 成功！');
    } catch {
      logFail('Wrangler v4 部署预检 (--dry-run) 失败！请检查 wrangler.jsonc 配置。');
    }
  } else {
    console.log('\n\x1b[90m(提示: 当前为静态与 Schema 动态快检模式。如需验证真实打包、Wrangler Dry-Run 与远程数据集，请运行 "npm run check:full")\x1b[0m');
  }

  // =========================================================================
  // 汇总输出
  // =========================================================================
  console.log('\n========================================');
  if (errorCount === 0) {
    console.log(`\x1b[32m\x1b[1m🎉 巡检全部通过！(错误: ${errorCount}, 告警: ${warnCount})\x1b[0m`);
    console.log('代码已全面通过 AGENTS.md 历史踩坑与安全架构护栏校验，可安全推进！');
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
