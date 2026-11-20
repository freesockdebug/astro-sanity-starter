# Cloudflare Workers 边缘多级缓存架构设计方案（L0 / L1 / L2 / L3）

## 1. 架构目标与设计原则

本方案针对基于 **Astro SSR + Cloudflare Workers + Cloudflare KV + Cloudflare D1 + Sanity CMS** 的全球化 B2B 独立站，构建了一套高吞吐、低延迟、防穿透的多级边缘缓存体系：

1. **热路径零 I/O（Zero-I/O Hot Path）**：99% 以上的正常访问与恶意扫描拦截均在边缘节点内存（L1）或边缘 HTML 缓存（L0）中完成，0 次数据库/KV/CMS 请求。
2. **冷启动单次读取（Single-KV Cold Start）**：新边缘 Isolate 启动时，仅需读取 1 次聚合预热包（`edge:preload:v1`），即可一次性激活 6 大核心 L1 内存分区。
3. **L1 写入即预编译（Compile-on-Write）**：数据进入 L1 内存时一次性编译为 `RegExp`、IPv4/IPv6 CIDR 二进制位掩码、`Set` / `Map` 索引，请求期零反序列化、零重复编译。
4. **跨 Isolate 轻量同步（30s Heartbeat Sync）**：平时不穿透缓存；每 30 秒通过 ~300B 的 `cms:route_revs` 版本账本做一次无序键值比对，无变更则零重载顺延 L1 生命周期，有变更则按分区精准失效并同步。
5. **写穿透与版本化键（Write-Through & Versioned Keys）**：后台或 Webhook 发生数据变更时主动刷新 KV 与预热包，并通过 `?__rev=<timestamp>` 实现全球边缘 HTML 缓存的瞬时切换。

---

## 2. 四层缓存体系总览
[ 客户端请求 ]
│
▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 第一步：L1 边缘内存预加载 & WAF 防护 (V8 Isolate RAM, 耗时 0.01ms) │
│ - 30s 窗口内 100% 走 L1 内存；满 30s 读 300B cms:route_revs 比对版本 │
│ - 预编译正则 / IPv4 & IPv6 CIDR 掩码 / 速率限制 / Fast-404 内存直接拦截 │
└─────────────────────────────────────────────────────────────────────────┘
│ (放行公开 GET 请求)
▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 第二步：L0 边缘 HTML 页面缓存 (caches.default + CDN, 耗时 14ms) │
│ - Cache Key 绑定路由版本号: https://domain/path?__rev=<routeRev> │
│ - 命中 (HIT) -> 直接返回完整 HTML，0 SSR 渲染、0 数据查询 │
│ - 未命中 (MISS) -> Single-Flight 并发合并，防止缓存击穿风暴 │
└─────────────────────────────────────────────────────────────────────────┘
│ (L0 未命中，或动态 API / 私密路由进入 SSR)
▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 第三步：业务数据三级缓存读取 (EdgeTieredCache & KeyedCache) │
│ │
│ ┌──────────────────────┐ Miss ┌──────────────────────┐ Miss │
│ │ L1: Isolate 进程内存 │ ───────► │ L2: Cloudflare KV │ ───────┐ │
│ │ - 预编译 Set/Map/Obj │ │ - edge:preload:v1 │ │ │
│ │ - existsGuard 防穿透 │ ◄─────── │ - 固定业务 KV 键 │ ▼ │
│ │ - 耗时 < 0.01ms │ 回填 L1 │ - 耗时 5~25ms │ ┌────────┐ │
│ └──────────────────────┘ └──────────────────────┘ │ L3 源站│ │
│ ▲ ▲ │ - D1 │ │
│ └─────────────────────────────────┴──────────────│ -Sanity│ │
│ 回填 L1 & 异步写回 L2 KV └────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
Code
| 层级 | 存储介质 | 响应延迟 | 作用范围 | 核心职责 |
| :--- | :--- | :--- | :--- | :--- |
| **L0** | Cloudflare CDN + Worker `caches.default` | **1 ~ 4 ms** | 当前边缘机房 (PoP) | 缓存渲染后的完整 HTML（带 `__rev` 版本号 Key + Single-Flight 并发合并） |
| **L1** | V8 Isolate 内存 (`EdgeTieredCache` / `Map`) | **< 0.05 ms** | 当前 Worker Isolate | 零拷贝读取预编译对象（WAF 规则树、Slug `Set`、全局配置、30s D1 状态缓存） |
| **L2** | Cloudflare Workers KV (`CACHE_KV`) | **5 ~ 25 ms** | 全球边缘节点共享 | 持久化存储 `edge:preload:v1` 预热包、`cms:route_revs` 版本账本及各业务 JSON |
| **L3** | Cloudflare D1 (SQLite) + Sanity CMS | **40 ~ 350 ms** | 全球唯一真实数据源 | 存储系统配置、WAF 规则、RBAC、字典、订单、用户及 Sanity CMS 文档 |

---

## 3. 核心缓存分区清单与参数矩阵

### 3.1 全局聚合冷启动包（`edge:preload:v1`）
* **KV Key**：`edge:preload:v1`
* **聚合字段**：`updatedAt`、`routeRevs`、`systemSettings`、`wafRuntime`、`siteConfig`、`rfqSettings`、`pageSlugs`、`productSlugs`
* **核心价值**：将冷启动原本需要发起的 6~7 次独立 KV/DB 查询收敛为 **1 次 KV 读取**，并在一次调用中完成所有核心 L1 缓存的编译与预热。

### 3.2 各缓存分区详细配置表

| 分区名称 (`name`) | 作用域 (`scope`) | 结构类型 | L1 TTL | L2 KV Key | Epoch 广播键 | L3 数据源 | 预编译与防穿透特性 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `settings:system` | `settings` | Singleton | `Infinity` | `sys:settings:v1` | `__settings` | D1 `system_settings` | 自动归一化 `waf_rule_config` |
| `waf:runtime` | `waf` | Singleton | `Infinity` | `waf:runtime:v1` | `__waf` | D1 `waf_rules` + `waf_ip_acl` | **L1 预编译**：编译安全 RegExp、IPv4/IPv6 CIDR 位掩码、优先级规则表 |
| `cms:siteConfig` | `config` | Singleton | `Infinity` | `cms:siteConfig` | `__cms:cms:siteConfig` | Sanity `siteConfig` | 顶层 `Layout.astro` 读取一次并通过 Props 透传给导航/页脚/抽屉 |
| `cms:rfqSettings` | `config` | Singleton | `Infinity` | `cms:rfqSettings` | `__cms:cms:rfqSettings` | Sanity `rfqSettings` | 询盘配置、按钮开关与 Amazon 链接配置 |
| `prod:slugs` | `products` | Singleton | `Infinity` | `cms:product_slugs:v1` | `__cms:cms:product_slugs:v1` | Sanity 商品 slug 数组 | **L1 预编译为 `Set<string>`**，作为详情页路由与 `prod:details` 的前置守卫 |
| `page:slugs` | `pages` | Singleton | `Infinity` | `cms:page_slugs:v1` | `__cms:cms:page_slugs:v1` | Sanity 页面 slug 数组 | **L1 预编译为 `Set<string>`**，作为动态页面 `page:doc` 的前置守卫 |
| `cms:products:all` | `products` | Singleton | `Infinity` | `cms:products:all` | `__cms:cms:products:all` | Sanity 商品列表 (轻量投影) | 裁减大图库与深层字段（体积降 80%）；`onUpdate` 静默 `.seed()` 更新 `prod:slugs` |
| `cms:categories:all` | `products` | Singleton | `Infinity` | `cms:categories:all` | `__cms:cms:categories:all` | Sanity 商品分类列表 | 分类聚合与数量统计 |
| `cms:catalogSettings` | `products` | Singleton | `Infinity` | `cms:catalogSettings` | `__cms:cms:catalogSettings` | Sanity 目录页配置 | 商品目录页头部与筛选配置 |
| `cms:productStorySettings`| `products` | Singleton | `Infinity` | `cms:productStorySettings`| `__cms:cms:productStorySettings`| Sanity 工艺认证设置 | 详情页工艺故事与 OEKO-TEX / Lonati 认证卡片 |
| `prod:details` | `products` | Keyed Map | `Infinity` | `cms:product:<slug>` | 随路由版本刷新 | Sanity 单个商品完整文档 | 绑定 `existsGuard` + 30s 负缓存，未知 slug **0 KV / 0 Sanity 查询** |
| `page:doc` | `pages` | Keyed Map | `Infinity` | `cms:page:<slug>` | 随路由版本刷新 | Sanity 单个页面完整文档 | 绑定 `existsGuard` + 30s 负缓存，未知页面 **0 KV / 0 Sanity 查询** |
| `dicts:bundle` | `dicts` | Singleton | `Infinity` | `sys:dicts:v2` | `__dicts` | D1 4 张数据字典表 | **L1 预编译**：构建 `tierMap` 与 `carrierMap` O(1) 查找表 |
| `rbac:matrix` | `rbac` | Singleton | `Infinity` | `sys:rbac:v1` | `__rbac` | D1 角色与管理员表 | **L1 预编译**：构建 `roleMap` (`Set` 权限集合) 与 `userMap` |
| `users:status` | `users` | Keyed Map | **`30_000` (30s)**| **无 (纯 L1)** | 无 | D1 `users` 表 | 登录回调主动 `seed`；同时建立 `id:` 与 `email:` 双键索引；封禁跨节点最多 30s 生效 |
| `orders:pending_count` | `orders` | Singleton | **`30_000` (30s)**| **无 (纯 L1)** | 无 | D1 `orders` 索引计数 | 后台待审批订单角标；本节点写操作立即失效，跨节点最多 30s 同步 |
| `orders:dashboard_stats` | `orders` | Singleton | **`30_000` (30s)**| **无 (纯 L1)** | 无 | D1 `orders` 聚合统计 | 后台仪表盘统计数据；本节点写操作立即失效，跨节点最多 30s 同步 |

---

## 4. 数据读取与防穿透逻辑（Read Path）

### 4.1 中间件入口预加载与 30 秒心跳（`preloadEdgeIsolate`）
每次非静态资源请求进入 `src/middleware.ts` 时调用 `preloadEdgeIsolate(cfEnv, false)`：

1. **30 秒窗口内（纯 L1 命中）**：
   - 条件：`!force && isL1Populated && (now - localPreloadLoadedAt < 30_000)`
   - 动作：直接通过 `settingsCache.peek(true)` 和 `wafRuntimeCache.peek(true)` 从内存返回，计入 `l1Hits`，返回 `preloadStatus = 'L1_HIT'`（**0 次网络 I/O**）。
2. **满 30 秒轻量心跳检查（跨 Isolate 变更探测）**：
   - 动作：仅从 KV 读取约 300 字节的 `cms:route_revs`。
   - 比对：执行无序逐键比对（`revsEqual`）：
     - **若完全一致**：说明全球没有任何其他 Isolate 修改过配置或发布过内容。直接将 `localPreloadLoadedAt = now` 顺延 30 秒，**不读取 `edge:preload:v1`，不调用 `.seed()`，不增加 `l2Hits`**，继续返回 `'L1_HIT'`。
     - **若有键值差异**：说明其他 Isolate 发生了更新。立即读取 `edge:preload:v1`，将 `{ ...bundle.routeRevs, ...heartbeatKvRevs }` 合并后传入 `applyRouteRevisionsUpdate(mergedRevs, now)`，精准失效对应作用域并重新 `.seed(..., true)` 最新数据，返回 `'L2_KV_HIT'`。
3. **全新冷启动（Cold Start）**：
   - 动作：读取 1 次 `edge:preload:v1`，一次性调用 `.seed(..., true)` 填充 6 大核心 L1 缓存并计入 `l2Hits`，返回 `'L2_KV_HIT'`。
   - 兜底：若 KV 尚未初始化，并发查询 L3 源站并在后台异步执行 `rebuildEdgePreloadBundle(cfEnv)`，返回 `'L3_MISS'`。

### 4.2 动态路由与键值缓存的防穿透守卫（`existsGuard` + 负缓存）
针对 `/products/[slug]` 和 `/[...slug]` 等动态路由，防止爬虫或攻击者构造随机 URL 击穿 KV 和 Sanity：

1. **路由层 L1 守卫**：
   - `src/pages/products/[slug].astro` 首先调用 `ProductService.getCachedSlugs(true)`（直接读取预热在 L1 内存中的 `prod:slugs`并计入 `l1Hits`）。若请求的 `slug` 不在列表中，立即 302 重定向回 `/products`。
2. **缓存层 `existsGuard` 守卫**：
   - `productBySlugCache` (`prod:details`) 和 `pageBySlugCache` (`page:doc`) 配置了 `existsGuard`：在查询 L2 KV (`cms:product:<slug>`) 之前，先检查 L1 的 `productSlugsCache` / `pageSlugsCache` (`Set<string>`)。
   - 若 `Set.has(slug)` 为 `false`，立即记录 `l1Hits += 1`、`negativeHits += 1` 并返回 `null`，**0 次 KV 读取、0 次 Sanity 请求**。
3. **L1 负缓存（Negative Caching）**：
   - 即使某个 key 通过了前置守卫但 L3 源站返回 `null`，`createKeyedCache` 也会在 L1 `l1Map` 中写入 `{ data: null, timestamp: now }` 保持 30 秒（`negativeTtlMs: 30_000`），30 秒内的重复请求直接在 L1 短路。

### 4.3 L0 边缘 HTML 缓存与 Single-Flight 并发合并
1. **版本化缓存 Key**：
   - `resolvePathRevision(pathname, revs)` 取 `Math.max(revs[basePath] || 0, revs['__layout'] || 0)`。
   - 拼接为 `canonicalUrl`（例如 `https://gwenvenni.com/de/products?__rev=1795120000000`），作为 `caches.default` 的 Request Key。
2. **权限前置校验的 Purge 保护**：
   - 外部请求携带 `?purge=1` 时，在前置 WAF 阶段一律传 `force = false`，绝不允许匿名请求绕过 L1 刷 KV。
   - 只有通过 `SecurityService.timingSafeEqual(providedKey, purgeSecret)` 密钥验证（或本地开发环境）确认 `isAuthorizedPurge === true` 后，才调用 `preloadEdgeIsolate(cfEnv, true)` 刷新当前 Isolate L1 并删除 `caches.default` 中的对应条目。
3. **Single-Flight 请求合并（`inFlightEdgeRenders`）**：
   - 当 L0 缓存未命中时，以 `canonicalUrl.toString()` 为键记录正在渲染的 Promise。同一 Isolate 上的并发相同请求直接 `await existingRender` 并 `.clone()` 响应，避免缓存过期瞬间的并发渲染风暴。

---

## 5. 数据更新与失效逻辑（Write-Through & Invalidation Path）

### 5.1 读写分离的 Epoch 广播准则（严禁被动读触发写）
* **被动回填不升版本号**：当请求在 L1/L2 未命中而回源 L3 拉取数据并回填 KV 时，`persistToKv` 的 `shouldBumpEpoch` 固定为 `false`，且只写基础键（如 `cms:products:all`），**绝不修改 `cms:route_revs`，也绝不生成 `@时间戳` 冗余键**。
* **联动填充只走内存**：`productsCache` 与 `allPagesCache` 的 `onUpdate` 回调仅调用 `productSlugsCache.seed(slugs)` / `pageSlugsCache.seed(slugs)` 更新 L1 内存，不触发 KV 写入。
* **主动变更才升版本号**：只有调用 `.set()`、`.refresh()`（`forceRefresh = true`）、`bumpCacheEpoch()` 或 `bumpRouteRevisions()` 时，才更新 `cms:route_revs` 并触发 `rebuildEdgePreloadBundle(cfEnv)`。

### 5.2 后台 D1 配置变更（设置 / WAF / 字典 / RBAC）
1. 管理员在后台修改配置并写入 D1。
2. 调用对应缓存的 `.set()` 或 `.refresh()`（如 `refreshWafRuntime()`、`invalidateDictsCache()`）：
   - 立即更新当前 Isolate 的 L1 内存（并完成预编译）；
   - 覆写 L2 KV 中的固定键（如 `waf:runtime:v1`、`sys:dicts:v2`）；
   - 调用 `bumpCacheEpoch('__waf' | '__settings' | '__dicts' | '__rbac')` 更新 `cms:route_revs`；
   - `registerEpochBumpListener` 监听到任何 Epoch 变更后，在后台自动执行 `rebuildEdgePreloadBundle(cfEnv)` 更新 `edge:preload:v1`（自带 `isRebuildingPreload` 互斥锁与 `preloadRebuildPending` 尾部合并队列，防止并发重建冲突）。
3. 其他边缘 Isolate 在最多 30 秒后的下一次心跳中检测到 `cms:route_revs` 中的 `__waf` 或 `__dicts` 时间戳变化，自动通过 `applyRouteRevisionsUpdate` 精准失效对应 L1 分区并同步最新数据。

### 5.3 Sanity CMS 内容变更（`syncCmsMutation`）
当 Sanity Webhook (`/api/revalidate`) 或后台内容发布触发 `syncCmsMutation()` 时：
1. **智能影响面分析**：
   - **商品变更 (`product`)**：通过 `hasProductCardFieldsChanged()` 比对修改前后是否涉及列表卡片字段（标题、价格、MOQ、主图、颜色等）。若未涉及，仅调用 `ProductService.refreshSlug(slug)` 刷新单品 KV；若涉及或为新增/删除，则同时调用 `ProductService.refreshAll()` 刷新列表并收集相邻商品路径（因详情页底部有上一款/下一款导航）。
   - **删除操作 (`delete` / `disappear`)**：严格调用 `evictSlug()` 从 L1 和 L2 KV 中物理删除对应键，绝不反向查询 Sanity。
   - **全局配置变更 (`siteConfig` / `header` / `footer`)**：刷新 `SiteConfigService.getConfig(true)`，并将 `isGlobalLayout` 设为 `true`。
2. **原子化版本提升与 Bundle 重建（`bumpRouteRevisions`）**：
   - 直接读取 KV 中的 `cms:route_revs` 与本地 `localRouteRevs` 无副作用合并（**不调用 `applyRouteRevisionsUpdate`，防止误清刚刷新的 L1 内存**）。
   - 更新受影响路径的时间戳（若 `bumpGlobalLayout = true` 则更新 `__layout` 时间戳）。
   - 写回 `cms:route_revs` 并调用 `rebuildEdgePreloadBundle(cfEnv)` 同步更新 `edge:preload:v1`。
3. **L0 边缘 HTML 清理与自动预热**：
   - 调用 `purgeEdgeHtmlCache` 清理当前 Worker `caches.default`（含旧 `__rev` URL 与多语言扩展路径）及 Cloudflare Global CDN Zone Cache。
   - 通过 `runInBackground` 异步并发请求前 5 个核心受影响路径（`User-Agent: Cloudflare-Edge-Warmup/1.0`），提前将新版本 HTML 渲染进 L0 边缘缓存。

---

## 6. 性能指标与可观测性（Observability）

### 6.1 响应头与后台实时 HUD 监控
每个经过 `middleware.ts` 的请求都会注入精确的诊断响应头，并由后台左下角的 **Live Edge Diagnostics HUD (`#admin-diag-hud`)** 实时拦截展示：
* `X-Preload-Status`: `L1_HIT` | `L2_KV_HIT` | `L3_MISS` | `BYPASS`
* `X-Edge-Cache`: `HIT` | `MISS` | `BYPASS`
* `X-Perf-Spans`: `kv=<ms>,d1=<ms>,sanity=<ms>,total=<ms>`
* `Server-Timing`: 标准浏览器 DevTools Network 瀑布流耗时指标

### 6.2 全局缓存监控大盘（`/admin/cache`）
通过 `getGlobalCacheStatsSnapshot()` 实时输出当前 Isolate 的全量缓存健康度：
* **全局汇总**：总请求数、总命中数、综合命中率 (`overallHitRatePct`)、L1 命中数、L2 KV 命中数、L3 回源数、L0 HTML 命中率与 Top 10 热门路径、累计节省数据库/CMS 查询次数 (`estimatedQueriesSaved`)。
* **分区明细 (`partitions`)**：每个缓存分区的 `WARM` / `COLD` 状态、L1 条目数、最后加载时间、`l1Hits`、`l2Hits`、`l3Misses`、`negativeHits`（防穿透拦截数）、`writes`、`evictions` 及单分区命中率。
* **一键治理**：支持按单分区刷新、按业务域清理、重置统计计数器 (`reset_stats`)，以及在全量清理 (`all`) 时自动执行 `purgeLegacyEpochKvKeys` 清理历史遗留的 `@epoch` 键。

### 6.3 各场景基准性能汇总

| 典型业务场景 | L0 状态 | L1 状态 | KV 读写次数 | D1 / Sanity 查询次数 | 边缘响应耗时 |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **访客访问首页 / 商品目录 / 详情页（稳态）** | `HIT` | `L1_HIT` | **0** | **0** | **1 ~ 4 ms** |
| **访客首次访问某多语言页面（L0 未命中，L1 已热）** | `MISS` | `L1_HIT` | **0** | **0** | **8 ~ 20 ms** |
| **恶意扫描器探测 `/wp-login.php` 或随机商品 URL** | `BYPASS` | `L1_HIT` | **0** | **0** | **< 1 ms** |
| **热节点每 30 秒触发一次的轻量版本心跳（无后台变更）** | `HIT` | `L1_HIT` | **1 次 (300B)** | **0** | **10 ~ 20 ms** |
| **全新边缘节点冷启动第 1 个请求** | `MISS` | `L2_KV_HIT` | **1 次 (`edge:preload:v1`)** | **0** | **15 ~ 35 ms** |
| **老用户 OAuth 登录回调 (`/api/auth/callback`)** | `BYPASS` | `L1_HIT` | **0** | **1 次 D1 读** (后台异步写) | **300 ~ 500 ms** |