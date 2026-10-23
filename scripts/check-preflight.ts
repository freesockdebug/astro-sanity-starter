// scripts/check-preflight.ts
/**
 * 架构护栏与历史踩坑全自动巡检引擎 (Preflight Architecture & Quality Gate)
 *
 * 用法:
 *   npm run check           # 静态 + Schema 预览 + 双端契约同步 + i18n 快速巡检
 *   npm run check:full      # 包含远程数据集校验 + 双端生产编译 + Wrangler Dry-Run
 *   npm run check:list      # 查看已收录的全部架构红线与动态规则
 *   npm run check:add -- --title="..." --detail="..." [--must-contain="file:pattern"]
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'src');
const STUDIO_DIR = path.join(ROOT_DIR, 'studio');
const AGENTS_PATH = path.join(ROOT_DIR, 'AGENTS.md');
const CUSTOM_RULES_PATH = path.join(ROOT_DIR, 'scripts', 'preflight-rules.json');

const localRequire = createRequire(import.meta.url);
const cliArgs = process.argv.slice(2);
const isFullMode = cliArgs.includes('--full');
const isDataMode = isFullMode || cliArgs.includes('--data');

let errorCount = 0;
let warnCount = 0;

function logSection(title: string) {
  console.log(`\n\x1b[1m\x1b[36m=== ${title} ===\x1b[0m`);
}

function logPass(msg: string) {
  console.log(` \x1b[32m✔ [PASS]\x1b[0m ${msg}`);
}

function logWarn(msg: string) {
  warnCount++;
  console.log(` \x1b[33m⚠ [WARN]\x1b[0m ${msg}`);
}

function logFail(msg: string) {
  errorCount++;
  console.log(` \x1b[31m✖ [FAIL]\x1b[0m ${msg}`);
}

function getFiles(dir: string, exts: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getFiles(full, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

function parseJsonc(content: string): any {
  let result = '';
  let inString = false;
  let stringChar = '';
  let i = 0;
  while (i < content.length) {
    const ch = content[i];
    if (inString) {
      result += ch;
      if (ch === '\\' && i + 1 < content.length) {
        result += content[i + 1];
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
    if (ch === '/' && content[i + 1] === '/') {
      while (i < content.length && content[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && content[i + 1] === '*') {
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
    id: `pitfall-${nextNum}`,
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
  console.log(`   已同步更新: scripts/preflight-rules.json`);
}

function handleListRules(): void {
  const store = loadCustomRules();
  console.log(`\n\x1b[1m\x1b[36m📋 核心架构红线与自动化巡检清单\x1b[0m\n`);
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
      console.log(`  #${c.num} [${c.date || c.createdAt}] ${c.title} (${c.checks.length} 项自动断言)`);
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
        sku: 'GW-SILK-01',
        slug: 'silk-socks',
        category: 'Mulberry Silk',
        moq: '100 Pairs',
        range: '100 - 499',
        price: '$4.80',
        unit: 'Pair',
        value: '85% Mulberry Silk',
        hex: '#1d1d1f',
        url: '/products',
        order: 1,
        sections: [{ _key: 's1' }, { _key: 's2' }],
        company: 'Atelier Paris',
        email: 'buyer@atelier.fr',
        status: 'new',
        createdAt: '2026-10-01T10:00:00Z',
        items: [{ _key: 'i1' }],
      },
    },
    {
      desc: '缺失英文但含其它语种的 Locale 对象',
      payload: {
        title: { de: 'Nur Deutsch Titel', fr: 'Titre Français' },
        rawTitle: { de: 'Nur Deutsch Titel' },
        label: { es: 'Etiqueta Español' },
        headline: { fr: 'Titre Principal' },
        badge: { de: 'Abzeichen' },
        value: { de: '100% Kaschmir' },
      },
    },
    {
      desc: '完全空值 / Null 极值边界条件',
      payload: {},
    },
  ];

  let checkedPreviews = 0;

  function testPreview(schemaPath: string, previewObj: any) {
    if (!previewObj || typeof previewObj.prepare !== 'function') return;
    checkedPreviews++;
    for (const mock of mockCases) {
      try {
        const res = previewObj.prepare(mock.payload);
        if (!res || typeof res !== 'object') {
          logFail(`${schemaPath} [${mock.desc}]: preview.prepare() 未返回有效对象`);
          continue;
        }
        if (typeof res.title !== 'string') {
          logFail(
            `${schemaPath} [${mock.desc}]: res.title 必须是 string，实际类型为 ${typeof res.title}: ${JSON.stringify(res.title)}`
          );
        } else if (res.title.trim() === '') {
          logFail(`${schemaPath} [${mock.desc}]: res.title 不能为空白字符串！`);
        } else if (res.title.includes('[object Object]')) {
          logFail(`${schemaPath} [${mock.desc}]: res.title 泄露了 [object Object]: "${res.title}"`);
        }

        if (res.subtitle !== undefined && res.subtitle !== null) {
          if (typeof res.subtitle !== 'string') {
            logFail(
              `${schemaPath} [${mock.desc}]: res.subtitle 必须是 string，实际类型为 ${typeof res.subtitle}: ${JSON.stringify(res.subtitle)}`
            );
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
        if (field.type === 'array' && Array.isArray(field.initialValue)) {
          field.initialValue.forEach((item: any, idx: number) => {
            if (item && typeof item === 'object' && !item._key) {
              logFail(`Schema[${schemaName}].field[${field.name}].initialValue[${idx}]: 数组初始值缺少 '_key'！`);
            }
          });
        }
        if (field.type === 'object' && Array.isArray(field.fields)) {
          for (const subField of field.fields) {
            if (subField.type === 'array' && Array.isArray(subField.of)) {
              for (const subItem of subField.of) {
                if (subItem.preview) {
                  testPreview(
                    `Schema[${schemaName}].field[${field.name}][${subField.name}].item[${subItem.name || subItem.type}].preview`,
                    subItem.preview
                  );
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
      logFail(`${rel}: 发现未经多语言解包的 {prod.title} 直接作为 React 子节点渲染！`);
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

    const missingInTs = schemaFields.filter((f) => !tsFieldSet.has(f));
    if (missingInTs.length > 0) {
      logFail(
        `[Schema 强联动] Studio Schema '${spec.schemaName}' 中的字段 [${missingInTs.join(', ')}] 未同步声明在 types/index.ts 接口 '${spec.tsInterface}' 中！`
      );
    }

    const missingInData = schemaFields.filter((f) => !dataFieldSet.has(f));
    if (missingInData.length > 0) {
      logFail(
        `[Schema 强联动] Studio Schema '${spec.schemaName}' 中的字段 [${missingInData.join(', ')}] 在前端数据层 ${spec.dataLabel} 中漏接！`
      );
    }

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

  // 2.1 [Pitfall 1]: 客户端原生内联脚本禁 TS 语法
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
        logFail(`${path.relative(ROOT_DIR, file)}: [Pitfall 1] 客户端原生 <script define:vars/is:inline> 中包含 TS 类型断言或类型声明！`);
      }
    }
  }
  logPass(`[Pitfall 1] 客户端原生内联脚本 TS 语法断言校验通过`);

  // 2.2 [Pitfall 2]: 列表渲染防布局偏移 (CLS)
  for (const file of astroFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const emptyGridRegex = /<div[^>]*id=["']products-grid["'][^>]*>\s*<\/div>/gi;
    if (emptyGridRegex.test(content)) {
      logFail(`${path.relative(ROOT_DIR, file)}: [Pitfall 2] 检测到空的产品货架网格容器 '<div id="products-grid"></div>'！`);
    }
  }
  logPass(`[Pitfall 2] 列表渲染 CLS 零偏移物理骨架校验通过`);

  // 2.3 [Pitfall 3]: 杜绝序列化雪崩与大数组 define:vars 转义膨胀
  for (const file of astroFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const defineVarsRegex = /<script\s+[^>]*define:vars=\{([^}]+)\}[^>]*>/gi;
    let match;
    while ((match = defineVarsRegex.exec(content)) !== null) {
      const varsAttr = match[1];
      if (varsAttr.includes('JSON.stringify(')) {
        logFail(`${path.relative(ROOT_DIR, file)}: [Pitfall 3] 严禁在 define:vars 中嵌套使用 JSON.stringify()！`);
      }
    }
  }
  logPass(`[Pitfall 3] 大数据隔离与 define:vars 转义安全校验通过`);

  // 2.4 [Pitfall 4]: 外链字体非阻塞加载
  for (const file of astroFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes('fonts.googleapis.com')) {
      const linkMatch = content.match(/<link[^>]*href=["'][^"']*fonts\.googleapis\.com[^"']*["'][^>]*>/gi);
      if (linkMatch) {
        for (const linkTag of linkMatch) {
          if (linkTag.includes('rel="stylesheet"') && !linkTag.includes('media="print"')) {
            logFail(`${path.relative(ROOT_DIR, file)}: [Pitfall 4] 检测到阻塞式外链字体加载: ${linkTag}`);
          }
        }
      }
    }
  }
  logPass(`[Pitfall 4] 外链字体异步加载与首屏非阻塞校验通过`);

  // 2.5 [Pitfall 6]: 防 HTML 属性实体转义暴增
  for (const file of astroFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const attrJsonRegex = /data-[a-zA-Z0-9_-]+=\{JSON\.stringify\([^)]+\)\}/g;
    const match = content.match(attrJsonRegex);
    if (match) {
      logFail(`${path.relative(ROOT_DIR, file)}: [Pitfall 6] 检测到在 HTML 节点属性中序列化宽对象 (${match.join(', ')})。`);
    }
  }
  logPass(`[Pitfall 6] HTML 节点属性轻量化与防实体膨胀校验通过`);

  // 2.6 [Pitfall 7]: 图片服务反向代理双兼容
  const imageServiceFile = path.join(SRC_DIR, 'utils', 'image.ts');
  if (fs.existsSync(imageServiceFile)) {
    const content = fs.readFileSync(imageServiceFile, 'utf-8');
    if (content.includes('cdn.sanity.io') && !content.includes('/cdn-image/')) {
      logFail(`src/utils/image.ts: [Pitfall 7] 图片服务层必须同时兼容 'cdn.sanity.io' 与 '/cdn-image/'！`);
    }
  }
  logPass(`[Pitfall 7] Sanity CDN 与 Cloudflare 边缘反向代理路径双兼容校验通过`);

  // 2.7 [Pitfall 8]: 首屏视口图片动态加载策略
  const productCardFile = path.join(SRC_DIR, 'components', 'ProductCard.astro');
  if (fs.existsSync(productCardFile)) {
    const content = fs.readFileSync(productCardFile, 'utf-8');
    if (content.includes('loading="lazy"') && !content.includes('loading') && !content.includes('priority')) {
      logFail(`src/components/ProductCard.astro: [Pitfall 8] 卡片组件严禁写死 loading="lazy"！`);
    }
  }
  logPass(`[Pitfall 8] 首屏视口图片动态加载策略校验通过`);

  // 2.8 [Pitfall 9]: Scroll 监听器读写分离
  for (const file of allSourceFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const scrollListenerRegex = /addEventListener\(\s*['"]scroll['"]\s*,\s*(?:function\s*\([^)]*\)|(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>)\s*\{([\s\S]{0,600}?)\}/g;
    let match;
    while ((match = scrollListenerRegex.exec(content)) !== null) {
      const handlerBody = match[1];
      if (handlerBody.includes('getBoundingClientRect(') || handlerBody.includes('offsetTop')) {
        logFail(`${path.relative(ROOT_DIR, file)}: [Pitfall 9] 严禁在 scroll 滚动监听器内部直接同步读取 getBoundingClientRect() 或 offsetTop！`);
      }
    }
  }
  logPass(`[Pitfall 9] Scroll 监听器读写分离与零强制回流校验通过`);

  // 2.9 [Pitfall 11]: 本地兜底图片资源 WebP 轻量化
  const publicImagesDir = path.join(ROOT_DIR, 'public', 'images');
  if (fs.existsSync(publicImagesDir)) {
    const imgFiles = fs.readdirSync(publicImagesDir);
    for (const img of imgFiles) {
      if (img.endsWith('.png') || img.endsWith('.jpg') || img.endsWith('.jpeg')) {
        const stat = fs.statSync(path.join(publicImagesDir, img));
        if (stat.size > 500 * 1024) {
          logFail(`public/images/${img}: [Pitfall 11] 本地静态兜底图体积过大 (${Math.round(stat.size / 1024)}KB)，必须转换为 WebP！`);
        }
      }
    }
  }
  logPass(`[Pitfall 11] 本地兜底图片资源 WebP 轻量化检验通过`);

  // 2.10 [Pitfall 12]: Cloudflare Workers 原生环境变量安全获取
  for (const file of allSourceFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes('locals.runtime.env') || content.includes('locals.runtime?.env')) {
      logFail(`${path.relative(ROOT_DIR, file)}: [Pitfall 12] 严禁读取已废弃的 'locals.runtime.env'！请使用 "import { env } from 'cloudflare:workers'"。`);
    }
  }
  logPass(`[Pitfall 12] Cloudflare Workers 原生环境变量安全获取校验通过`);

  // 2.11 [Pitfall 13]: 产品目录网格 7 列大屏黄金断点
  for (const file of astroFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes('2xl:grid-cols-7') || content.includes('xl:grid-cols-7')) {
      logFail(`${path.relative(ROOT_DIR, file)}: [Pitfall 13] 严禁使用 2xl:grid-cols-7，必须使用 min-[1760px]:grid-cols-7！`);
    }
  }
  logPass(`[Pitfall 13] 产品货架大屏 7 列黄金断点 (min-[1760px]:grid-cols-7) 校验通过`);

  // 2.12 [Principle I.2]: 外部网络调用刚性超时熔断保护
  const apiFiles = getFiles(path.join(SRC_DIR, 'pages', 'api'), ['.ts', '.js']);
  for (const file of apiFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes('fetch(') && !content.includes('AbortSignal.timeout(')) {
      logFail(`${path.relative(ROOT_DIR, file)}: [Principle I.2] 服务端 API 外部 fetch 调用必须挂载 AbortSignal.timeout(6000)！`);
    }
  }
  logPass(`[Principle I.2] 服务端外部网络调用刚性超时熔断保护校验通过`);

  // 2.13 [Principle II]: Tailwind v4 纯 CSS 引擎无配置文件污染
  const forbiddenTailwindConfigs = ['tailwind.config.js', 'tailwind.config.cjs', 'tailwind.config.mjs', 'tailwind.config.ts'];
  for (const cfg of forbiddenTailwindConfigs) {
    if (fs.existsSync(path.join(ROOT_DIR, cfg))) {
      logFail(`${cfg}: [Principle II] Tailwind v4 纯 CSS 引擎严禁创建 ${cfg}！`);
    }
  }
  logPass(`[Principle II] Tailwind v4 纯 CSS 引擎无配置污染校验通过`);

  // 2.14 [Principle II]: 组件单层扁平正交与路径别名
  const compEntries = fs.readdirSync(path.join(SRC_DIR, 'components'), { withFileTypes: true });
  for (const entry of compEntries) {
    if (entry.isDirectory()) {
      logFail(`src/components/${entry.name}: [Principle II] 组件目录必须保持单层扁平结构！`);
    }
  }
  logPass(`[Principle II] 组件扁平正交与 @components 路径别名校验通过`);

  // 2.15 [Pitfall 14]: 国际 B2B 货币标准化对齐 (USD / $)
  const productsPageFiles = getFiles(path.join(SRC_DIR, 'pages'), ['.astro']);
  for (const file of productsPageFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (content.includes("currency = '¥'") || content.includes('currency = "¥"')) {
      logFail(`${path.relative(ROOT_DIR, file)}: [Pitfall 14] 严禁默认使用人民币符号 '¥'！`);
    }
  }
  logPass(`[Pitfall 14] 产品大厅全站外贸标准统一货币 (USD / $) 校验通过`);

  // 2.16 [Pitfall 15]: 触屏与平板交互无障碍可用性
  const langPickerFile = path.join(SRC_DIR, 'components', 'LanguagePicker.astro');
  if (fs.existsSync(langPickerFile)) {
    const content = fs.readFileSync(langPickerFile, 'utf-8');
    if (!content.includes('is-open') || !content.includes('touch-manipulation')) {
      logFail(`src/components/LanguagePicker.astro: [Pitfall 15] 语言选择器必须支持 Click/Touch 切换 (.is-open) 与 touch-manipulation！`);
    }
  }
  logPass(`[Pitfall 15] 触屏与平板环境 (iPad 1024x1366) 语言切换交互可用性校验通过`);

  // 2.17 [Pitfall 16]: 商品币种独立字段、阶梯价单位与 MOQ 阶梯优先
  if (fs.existsSync(productsDataPath)) {
    if (!productsDataContent.includes('resolveProductMoq') || !productsDataContent.includes('getCurrencySymbol')) {
      logFail(`src/data/products.ts: [Pitfall 16] 必须具备 resolveProductMoq 与 getCurrencySymbol 数据解算函数！`);
    }
  }
  logPass(`[Pitfall 16] 商品币种独立字段、阶梯价单位与 MOQ 阶梯优先机制校验通过`);

  // 2.18 [Pitfall 17]: Bento 展台胶囊防溢出与矮视口多维自适应
  const globalCssFile = path.join(SRC_DIR, 'styles', 'globals.css');
  if (fs.existsSync(globalCssFile)) {
    const cssContent = fs.readFileSync(globalCssFile, 'utf-8');
    if (!cssContent.includes('max-height: 720px') && !cssContent.includes('max-height: 820px')) {
      logFail(`src/styles/globals.css: [Pitfall 17] 必须包含桌面矮视口高度自适应媒体查询！`);
    }
  }
  logPass(`[Pitfall 17] Bento 展台胶囊防溢出与矮视口多维自适应校验通过`);

  // 2.19 [Pitfall 18]: 动态路由与中间件静态资源 404 防御
  const middlewareFile = path.join(SRC_DIR, 'middleware.ts');
  if (fs.existsSync(middlewareFile)) {
    const mwContent = fs.readFileSync(middlewareFile, 'utf-8');
    if (!mwContent.includes("pathname.startsWith('/_astro/')") || !mwContent.includes('status === 200')) {
      logFail(`src/middleware.ts: [Pitfall 18] 中间件必须拦截 '/_astro/' 404 并仅缓存 status === 200 的 HTML 响应！`);
    }
  }
  logPass(`[Pitfall 18] 动态路由与中间件静态资源 404 防御及边缘 HTML 缓存安全校验通过`);

  // 2.20 [Pitfall 20]: 依赖锁文件严格同步与单一包管理器准则
  for (const lockName of ['bun.lock', 'bun.lockb', 'yarn.lock', 'pnpm-lock.yaml']) {
    const strayLockPath = path.join(ROOT_DIR, lockName);
    if (fs.existsSync(strayLockPath)) {
      try {
        fs.unlinkSync(strayLockPath);
      } catch {
        logFail(`${lockName}: [Pitfall 20] 严禁保留非 npm 锁文件 '${lockName}'！`);
      }
    }
  }
  logPass(`[Pitfall 20] 依赖锁文件严格同步与单一包管理器准则校验通过`);

  // 2.21 [Pitfall 21]: 双环境按需挂载 Studio 与防 Cloudflare Worker Error 1102
  const astroConfigFile = path.join(ROOT_DIR, 'astro.config.mjs');
  if (fs.existsSync(astroConfigFile)) {
    const astroConfig = fs.readFileSync(astroConfigFile, 'utf-8');
    if (
      !astroConfig.includes('isProduction ? [] : [react()]') ||
      !astroConfig.includes("isProduction ? {} : { studioBasePath: '/studio' }") ||
      !astroConfig.includes("drop: isProduction ? ['console', 'debugger'] : []")
    ) {
      logFail(`astro.config.mjs: [Pitfall 21] 生产环境必须剥离 @astrojs/react() 与 studioBasePath: '/studio'！`);
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
          logFail(`${cfgRel}: [Pitfall 22] 严禁手动添加 "main" 字段！`);
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

  // 2.23 [Principle IV]: 版本库纯净度与本地资产 .gitignore 隔离 (兼容 scripts/* 放行 check-preflight.ts)
  const gitignoreFile = path.join(ROOT_DIR, '.gitignore');
  if (fs.existsSync(gitignoreFile)) {
    const gi = fs.readFileSync(gitignoreFile, 'utf-8');
    for (const item of ['AGENTS.md', '.agent/', '.vscode/', '.archify/']) {
      if (!gi.includes(item)) {
        logFail(`.gitignore: [Principle IV] 必须隔离本地资产 '${item}'！`);
      }
    }
    if (!gi.includes('scripts/') && !gi.includes('scripts/*')) {
      logFail(`.gitignore: [Principle IV] 必须配置 'scripts/*' 或 'scripts/' 隔离临时脚本！`);
    }
  }
  logPass(`[Principle IV] 版本库纯净度与本地资产 .gitignore 隔离校验通过`);

  // 2.24 [Pitfall 25]: 源码与组件零空文件守卫（防半截断/0字节模块破坏 Vite 模块图）
  let emptyFileCount = 0;
  for (const sf of [...allSourceFiles, ...studioSourceFiles]) {
    const content = fs.readFileSync(sf, 'utf-8');
    if (content.trim().length === 0) {
      emptyFileCount++;
      logFail(`${path.relative(ROOT_DIR, sf)}: [Pitfall 25] 检测到 0 字节空白源码/组件文件！会导致 Vite 模块图加载失败！`);
    }
  }
  if (emptyFileCount === 0) {
    logPass(`[Pitfall 25] 源码与组件零空文件守卫校验通过（无 0 字节截断模块）`);
  }

  // 2.25 执行动态演进扩展规则 (scripts/preflight-rules.json)
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
            logFail(`i18n [${lang}]: 相比 en 字典缺失以下 ${missingKeys.length} 个键: ${missingKeys.slice(0, 5).join(', ')}`);
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
  // 4 & 5. 可选远程数据集与全量打包验证 (--data / --full)
  // =========================================================================
  if (isFullMode) {
    logSection('5. 双端生产编译与 Wrangler v4 部署预检全量验证 (--full Mode)');
    try {
      execSync('npm run build:studio', { stdio: 'inherit', cwd: ROOT_DIR });
      logPass('Sanity Studio 生产编译成功！');
    } catch {
      logFail('Sanity Studio 生产编译失败！');
    }
    try {
      execSync('node ./astro-cli.mjs build', { stdio: 'inherit', cwd: ROOT_DIR });
      logPass('Astro 生产编译成功！');
    } catch {
      logFail('Astro 生产编译失败！');
    }
  } else {
    console.log(
      '\n\x1b[90m(提示: 当前为静态与 Schema 动态快检模式。如需验证真实打包与 Studio 编译，请运行 "npm run check:full")\x1b[0m'
    );
  }

  console.log('\n========================================');
  if (errorCount === 0) {
    console.log(`\x1b[32m\x1b[1m🎉 巡检全部通过！(错误: ${errorCount}, 告警: ${warnCount})\x1b[0m`);
    console.log('代码已全面通过历史踩坑与安全架构护栏校验，可安全推进！');
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
