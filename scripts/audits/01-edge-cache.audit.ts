// scripts/audits/01-edge-cache.audit.ts
import type { AuditViolation, DomainAuditSuite } from './types';
import { findLineMatches } from './types';

const DOC_PATH = 'docs/01-edge-cache.md';
const DOMAIN = '01-edge-cache' as const;

export const edgeCacheAuditSuite: DomainAuditSuite = {
  domain: DOMAIN,
  name: '五层边缘缓存与状态同步对抗审计 (Outer CDN / L0 / L1 / L2 / L3)',
  docPath: DOC_PATH,
  triggerPatterns: [
    /^src\/middleware\.ts$/,
    /^src\/utils\/(cache|cmsSync|profiler)\.ts$/,
    /^src\/pages\/api\/(revalidate|admin\/cache)/,
    /^docs\/01-edge-cache\.md$/,
  ],
  unitTestFiles: ['test/waf.test.ts'],
  rules: [
    {
      id: 'CACHE-ADV-01',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'L0 HTML 双键缓存流锁死与 Optimistic Miss 汇合守卫',
      historicalContext:
        '向 caches.default.put() 写入 Response 会消费其 ReadableStream；若双键写入未先 .clone() 会抛出 TypeError: Body has already been used；且 OPTIMISTIC_SWR 在 L0 HTML Miss 进入 SSR 前若未汇合等待 KV 预热，会导致 SSR 组件散落穿透 KV。',
      remediation:
        '在 src/middleware.ts 中保持双键写入前 cacheResponse.clone()，并在 L0 Miss 且 preloadStatus === "OPTIMISTIC_SWR" 时调用 await preloadEdgeIsolate(cfEnv, false, false) 汇合。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const mw = ctx.readFile('src/middleware.ts');
        if (!mw) return violations;

        if (!mw.includes("preloadStatus === 'OPTIMISTIC_SWR'") || !mw.includes('preloadEdgeIsolate(cfEnv, false, false)')) {
          violations.push({
            ruleId: 'CACHE-ADV-01',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: '缺失 Optimistic Miss 进入 SSR 前的 KV 预热汇合 (Join-before-SSR)',
            historicalContext: '全冷机房 OPTIMISTIC_SWR 遭遇 L0 HTML Miss 时，必须先汇合后台 inFlightHydratePromise 才能进入 Astro next() 渲染。',
            file: 'src/middleware.ts',
            remediation: '在 L0 HTML Miss 分支恢复 if (preloadStatus === "OPTIMISTIC_SWR") await preloadEdgeIsolate(cfEnv, false, false)。',
          });
        }

        if (!mw.includes('responseToCache.clone()')) {
          violations.push({
            ruleId: 'CACHE-ADV-01',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'L0 HTML 双键写入缺失 responseToCache.clone() 流克隆保护',
            historicalContext: 'caches.default.put() 会直接锁定 Response body stream，双键写入必须先 .clone()。',
            file: 'src/middleware.ts',
            remediation: '在首次 cache.put 之前调用 responseToCache.clone() 生成乐观别名响应副本。',
          });
        }
        return violations;
      },
    },
    {
      id: 'CACHE-ADV-02',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '被动读回源严禁递增 Epoch 版本号 & 严禁生成 @epoch 冗余 KV 键',
      historicalContext:
        '历史故障中，L1/L2 被动 Miss 回源时误触发了 bumpCacheEpoch 或拼接了 `${kvKey}@${epoch}`，导致 KV 写入风暴与成百上千个过期孤儿键堆积。',
      remediation:
        'src/utils/cache.ts 的被动 get() 回填路径必须固定传 persistToKv(..., false)，且 KV 键名严禁拼接 @${epoch}。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const cacheCode = ctx.readFile('src/utils/cache.ts');
        if (!cacheCode) return violations;

        // 检查是否存在拼接 @${epoch} 到 KV 键的反模式
        const badEpochKeyMatches = findLineMatches(cacheCode, /\$\{this\.kvKey\}@\$\{/);
        for (const m of badEpochKeyMatches) {
          violations.push({
            ruleId: 'CACHE-ADV-02',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: '检测到拼接 @epoch 的冗余 KV 键生成逻辑',
            historicalContext: '二代缓存架构已废除 @epoch 动态 KV 键，所有失效均通过 cms:route_revs 结构化账本驱动。',
            file: 'src/utils/cache.ts',
            line: m.line,
            snippet: m.snippet,
            remediation: '使用固定业务 KV 键名，通过 cms:route_revs 的 scopes 时间戳控制 L1 失效。',
          });
        }
        return violations;
      },
    },
    {
      id: 'CACHE-ADV-03',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '私有路由 (/admin, /api, /orders, /account) 与 PJAX 壳请求严禁混入公共 L0 缓存',
      historicalContext:
        '后台管理页、买手订单页与 API 依赖登录 Cookie 与 RBAC DataScope；而 X-Shell-Request: 1 仅返回 #shell-main-canvas 局部片段。一旦混入公共 L0 HTML 缓存，会导致跨租户越权串数据或整页刷出半截无壳 HTML。',
      remediation:
        '确保 src/middleware.ts 的 isPublicCacheablePageGet 显式排除 /admin、/api/、orders、account，且对 x-shell-request 强制 private, no-store。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const mw = ctx.readFile('src/middleware.ts');
        if (!mw) return violations;

        const requiredGuards = [
          { label: '/admin', token: 'isAdminPath' },
          { label: '/api/', token: "'/api/'" },
          { label: '/orders', token: 'isOrdersPath' },
          { label: '/account', token: 'isAccountPath' },
          { label: 'X-Shell-Request', token: 'x-shell-request' },
        ];
        for (const guard of requiredGuards) {
          if (!mw.includes(guard.token)) {
            violations.push({
              ruleId: 'CACHE-ADV-03',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `src/middleware.ts 缺失对私有/局部请求 ${guard.label} 的公共缓存排除守卫`,
              historicalContext: '私有路径或 PJAX 局部请求一旦进入公共 L0 缓存，会导致跨用户串数据或刷出半截 HTML。',
              file: 'src/middleware.ts',
              remediation: `在 src/middleware.ts 中显式排除 ${guard.label} (${guard.token}) 并设置 private, no-store。`,
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'CACHE-ADV-04',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '所有持久化 L1+L2 缓存分区必须声明有效的 CacheLedgerScope',
      historicalContext:
        '若 createTieredCache 配置了 kvKey (持久化至 L2 KV) 却漏配了 scope，当 cms:route_revs 发生作用域版本号递增时，其他 Isolate 永远无法收到该分区的 L1 失效通知，形成“幽灵脏缓存”。',
      remediation:
        '为所有带 kvKey 的 createTieredCache / createCmsKeyedCache 显式指定 scope (settings | waf | dicts | rbac | config | products | pages)。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const files = [...ctx.listFiles('src/data', /\.ts$/), ...ctx.listFiles('src/db', /\.ts$/), 'src/utils/dicts.ts'];
        for (const file of files) {
          const content = ctx.readFile(file);
          if (!content.includes('createTieredCache')) continue;
          const blocks = content.split('createTieredCache');
          for (let i = 1; i < blocks.length; i++) {
            const head = blocks[i].slice(0, 420);
            if (head.includes('kvKey:') && !head.includes('scope:')) {
              violations.push({
                ruleId: 'CACHE-ADV-04',
                domain: DOMAIN,
                docPath: DOC_PATH,
                title: '发现带 kvKey 的 EdgeTieredCache 未配置 scope 账本作用域',
                historicalContext: '缺少 scope 会导致跨 Isolate 心跳同步 (runHeartbeatSync) 无法定向清理该 L1 分区。',
                file,
                snippet: head.split('\n').slice(0, 6).join(' ').trim(),
                remediation: '在 createTieredCache 配置对象中补充 scope 属性。',
              });
            }
          }
        }
        return violations;
      },
    },
  ],
  verify: async () => {
    const violations: AuditViolation[] = [];
    const { createTieredCache, invalidateRegisteredCachesByScope } = await import('../../src/utils/cache.js');
    const { RequestProfiler, requestProfilerStorage } = await import('../../src/utils/profiler.js');

    // 故障注入 1: 单请求内 15 并发冷读惊群 -> 必须通过 RequestProfiler (AsyncLocalStorage) Single-Flight 折叠为 1 次 L3 回源（且不跨请求共享全局 Promise）
    let l3Calls = 0;
    const prodProbeCache = createTieredCache<{ count: number }>({
      name: '__preflight_probe_products',
      scope: 'products',
      ttlMs: 60_000,
      fallbackRaw: { count: -1 },
      fetchRaw: async () => {
        l3Calls += 1;
        await new Promise((r) => setTimeout(r, 4));
        return { data: { count: 42 }, persistToKv: false };
      },
    });
    const settingsProbeCache = createTieredCache<{ ok: boolean }>({
      name: '__preflight_probe_settings',
      scope: 'settings',
      ttlMs: 60_000,
      fallbackRaw: { ok: false },
      fetchRaw: async () => ({ data: { ok: true }, persistToKv: false }),
    });

    prodProbeCache.invalidate();
    settingsProbeCache.invalidate();

    const profiler = new RequestProfiler();
    const results = await requestProfilerStorage.run(profiler, () =>
      Promise.all(Array.from({ length: 15 }, () => prodProbeCache.get()))
    );
    await settingsProbeCache.get();

    if (l3Calls !== 1 || results.some((r) => r.count !== 42)) {
      violations.push({
        ruleId: 'CACHE-ADV-01',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: `运行时对抗故障注入失败: 单请求 15 并发冷读触发了 ${l3Calls} 次 L3 回源 (预期 Request-Scoped Single-Flight 严格折叠为 1 次)`,
        historicalContext: 'SSR 组件并发冷读同一缓存分区时，必须通过 AsyncLocalStorage 请求级 requestMemo 折叠为 1 次回源，同时避免模块全局 Promise 跨请求 I/O 报错。',
        file: 'src/utils/cache.ts',
        remediation: '检查 EdgeTieredCache.get() 中的 profiler.requestMemo 请求级并发合并逻辑。',
      });
    }

    // 故障注入 2: 定向失效 products 作用域 -> 必须精准清理 products L1，且严禁误伤 settings L1
    invalidateRegisteredCachesByScope('products');
    if (prodProbeCache.peek() !== null || settingsProbeCache.peek()?.ok !== true) {
      violations.push({
        ruleId: 'CACHE-ADV-04',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '运行时对抗故障注入失败: Scope 定向失效出现跨作用域误伤或未能清空目标 L1 缓存',
        historicalContext: 'cms:route_revs 心跳定向失效必须严格按 CacheLedgerScope 隔离，防止全站 L1 缓存雪崩。',
        file: 'src/utils/cache.ts',
        remediation: '检查 invalidateRegisteredCachesByScope(scope) 的作用域过滤逻辑。',
      });
    }

    // 故障注入 3: L0 (caches.default 机房共享信封) <-> L1 (Isolate 内存) 跨冷启动与写操作状态一致性对抗校验
    const { preloadEdgeIsolate, EDGE_PRELOAD_KV_KEY } = await import('../../src/utils/cmsSync.js');
    const { settingsCache, wafRuntimeCache, DEFAULT_SYSTEM_SETTINGS } = await import('../../src/db/index.js');
    const { SiteConfigService } = await import('../../src/data/siteConfig.js');
    const { RfqSettingsService } = await import('../../src/data/rfqSettings.js');
    const { PageService } = await import('../../src/data/page.js');
    const { ProductService } = await import('../../src/data/products.js');

    const prevCaches = (globalThis as any).caches;
    const l0Store = new Map<string, Response>();
    let kvReadCount = 0;
    const kvMap = new Map<string, string>();
    const initialBundle = {
      updatedAt: Date.now(),
      routeRevs: { v: 100, scopes: { settings: 100 }, routes: { '/': 100 } },
      systemSettings: { ...DEFAULT_SYSTEM_SETTINGS, brand_name: 'L0_L1_CONSISTENCY_V1' },
      wafRuntime: {
        rules: [{ id: 'sys_legacy_cms_paths', isEnabled: true, mode: 'block' }],
        ipAcl: [],
      },
      siteConfig: { edgeCacheTtl: 600 } as any,
      rfqSettings: { showSwatchKitButton: false } as any,
      pageSlugs: ['home'],
      productSlugs: ['sock-1'],
    };
    kvMap.set(EDGE_PRELOAD_KV_KEY, JSON.stringify(initialBundle));
    kvMap.set('cms:route_revs', JSON.stringify(initialBundle.routeRevs));

    const mockEnv = {
      CACHE_KV: {
        get: async (k: string) => {
          if (k === EDGE_PRELOAD_KV_KEY) kvReadCount += 1;
          return kvMap.get(k) ?? null;
        },
        put: async (k: string, v: string) => {
          kvMap.set(k, v);
        },
      },
    };

    try {
      (globalThis as any).caches = {
        default: {
          match: async (req: Request) => {
            const hit = l0Store.get(req.url);
            return hit ? hit.clone() : undefined;
          },
          put: async (req: Request, res: Response) => {
            l0Store.set(req.url, res.clone());
          },
          delete: async (req: Request) => l0Store.delete(req.url),
        },
      };

      // Step A: 第 1 个 Isolate 强制从 L2 KV 预热 -> 必须同时填充 L1 并将聚合包写入机房共享 L0 (caches.default)
      const firstHydrate = await preloadEdgeIsolate(mockEnv, true);
      if (firstHydrate.wafSettings?.brand_name !== 'L0_L1_CONSISTENCY_V1' || l0Store.size === 0) {
        violations.push({
          ruleId: 'CACHE-ADV-01',
          domain: DOMAIN,
          docPath: DOC_PATH,
          title: '运行时对抗故障注入失败: L0 共享信封与 L1 内存状态未能在预热后保持同步写入',
          historicalContext: '若 preloadEdgeIsolate 从 KV 预热后未同步写入 L0 caches.default，同机房后续冷 Isolate 将全部穿透 KV。',
          file: 'src/utils/cmsSync.ts',
          remediation: '检查 hydratePreloadFromKv 中的 writePreloadBundleToL0 同步写回逻辑。',
        });
      }

      // Step B: 模拟同一机房拉起第 2 个冷 Isolate (清空 L1 核心内存，但保留机房 L0 caches.default) -> 必须走 L0_PRELOAD_HIT (0 edge:preload:v1 KV 读取) 且 L1 状态与 L0 100% 一致
      await new Promise((r) => setTimeout(r, 15));
      settingsCache.invalidate();
      wafRuntimeCache.invalidate();

      const kvReadsBeforeSecondIsolate = kvReadCount;
      const secondHydrate = await preloadEdgeIsolate(mockEnv, false);

      if (
        secondHydrate.preloadStatus !== 'L0_PRELOAD_HIT' ||
        kvReadCount !== kvReadsBeforeSecondIsolate ||
        secondHydrate.wafSettings?.brand_name !== 'L0_L1_CONSISTENCY_V1'
      ) {
        violations.push({
          ruleId: 'CACHE-ADV-01',
          domain: DOMAIN,
          docPath: DOC_PATH,
          title: `运行时对抗故障注入失败: 冷 Isolate 未能从 L0 零 KV 恢复一致的 L1 状态 (status=${secondHydrate.preloadStatus}, extraKvReads=${kvReadCount - kvReadsBeforeSecondIsolate})`,
          historicalContext: '同机房冷 Isolate 必须从 L0 caches.default 1ms 克隆状态到 L1，保证 L0/L1 状态强一致且 0 KV 消耗。',
          file: 'src/utils/cmsSync.ts',
          remediation: '检查 preloadEdgeIsolate 中的 readPreloadBundleFromL0 -> hydrateFromPreloadBundle 恢复链路。',
        });
      }
    } finally {
      if (prevCaches === undefined) delete (globalThis as any).caches;
      else (globalThis as any).caches = prevCaches;
    }

    return violations;
  },
};
