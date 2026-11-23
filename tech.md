# GwenVenni B2B E-Commerce & Enterprise Admin Portal — 技术架构设计与运维全景手册 (`tech.md`)

> **文档定位**：本文档为 GwenVenni B2B 全球批发门户与自建企业级管理后台的**权威技术架构蓝图、全模块设计规范、性能基准与线上故障排查手册**。所有架构演进与线上运维均以本文档及 `cache.md` 为基准。

---

## 目录
1. [系统总体架构与技术栈全景](#1-系统总体架构与技术栈全景)
2. [五层边缘缓存架构与 Sanity/CDN 精细化按需失效体系](#2-五层边缘缓存架构与-sanitycdn-精细化按需失效体系)
3. [双引擎数据库架构 (Cloudflare D1 / PostgreSQL) 与查询性能优化](#3-双引擎数据库架构-cloudflare-d1--postgresql-与查询性能优化)
4. [身份认证 (Logto OIDC)、会话安全与动静分离 RBAC 权限体系](#4-身份认证-logto-oidc会话安全与动静分离-rbac-权限体系)
5. [B2B 询盘 (RFQ) 与订单全生命周期状态机](#5-b2b-询盘-rfq-与订单全生命周期状态机)
6. [自建无头 CMS 工作台与 Sanity 强内聚联动契约](#6-自建无头-cms-工作台与-sanity-强内聚联动契约)
7. [前端交互体验：View Transitions、AppShell 路由与物理几何对齐](#7-前端交互体验view-transitionsappshell-路由与物理几何对齐)
8. [边缘 WAF 安全护盾、反爬限流与全链路可观测性](#8-边缘-waf-安全护盾反爬限流与全链路可观测性)
9. [已落地核心架构升级里程碑清单](#9-已落地核心架构升级里程碑清单)
10. [常见线上故障诊断速查手册 (Troubleshooting Runbook)](#10-常见线上故障诊断速查手册-troubleshooting-runbook)

---

## 1. 系统总体架构与技术栈全景

### 1.1 核心技术栈
| 领域 | 技术选型 | 运行时位置 / 绑定 | 核心职责 |
| :--- | :--- | :--- | :--- |
| **全栈框架** | **Astro SSR (`output: 'server'`)** | Cloudflare Workers | 服务端流式 HTML 渲染、API Routes、4 语种 (`en/de/fr/es`) 动态路由 |
| **边缘计算与网络** | **Cloudflare Workers + Cache API (`caches.default`) + Zone CDN** | 全球 300+ 边缘 PoP 节点 | 同机房跨 Isolate L0 预热信封共享、L0 HTML 双键缓存、Single-Flight 并发合并、`/cdn-image` 图片代理 |
| **分布式键值缓存** | **Cloudflare KV (`CACHE_KV` binding)** | 边缘全局持久化存储 | `edge:preload:v1` 单次聚合冷启动包、二代 `cms:route_revs` 版本账本、CMS/WAF/RBAC/Dicts 写穿缓存 |
| **关系型业务库** | **Cloudflare Hyperdrive / Supabase PostgreSQL & Cloudflare D1 (`DB`)** | 双方言自适应关系库 | B2B 询盘订单、订单明细、采购商 CRM、RBAC、数据字典、WAF 规则与 ACL、审计与系统诊断日志 |
| **内容管理系统** | **Sanity CMS (`@sanity/client`) + 自建后台 CMS** | 云端 Headless CMS + `/admin/*` | 商品目录、分类、模块化动态页面（6 大 Section 积木）、全局配置、云端媒体库 |
| **身份与单点登录** | **Logto OIDC + Web Crypto HMAC-SHA256** | OIDC 云端 + 边缘无状态 Cookie | 买手注册/登录、社交登录、M2M 管理接口密码重置、`b2b_session` 零 I/O 签名校验 |
| **事务通知系统** | **Resend Email API + 多平台 IM Webhook** | `waitUntil` 异步并行调度 | 询盘提交、订单审批、发货单号通知（企微/钉钉/飞书/Slack/Discord，6s 刚性超时熔断） |
| **前端状态与样式** | **Tailwind CSS v4 + DaisyUI + Nanostores** | 零 CLS 服务端骨架 + 客户端水合 | 4 套动态主题 (`apple-minimal` / `luxury-editorial` / `atelier-warm` / `industrial-tech`)、响应式几何对齐 |

### 1.2 请求全链路数据流向图
```text
[客户端浏览器 / 买手 / 管理员]
       │
       ▼
[第零层：Outer Cloudflare Global CDN + Edge Redirect Rules]
  ├─ 历史旧站链接 (/product-tag/*, /product/*) ──► 边缘 301/410 直接响应 (0 Worker 唤醒)
  └─ 静态资源 (/_astro/*) 与公网 s-maxage 缓存命中 ──► cf-cache-status: HIT
       │ (CDN Miss 或动态请求进入 Worker)
       ▼
[Cloudflare Worker: src/middleware.ts]
  ├─ 1. RequestProfiler (AsyncLocalStorage) 启动请求级计时、requestMemo 与 SQL 去重上下文
  ├─ 2. 四级极速预热 (preloadEdgeIsolate)：
  │     ├─ L1 已热 (<30s) ──► L1_HIT (0ms)
  │     ├─ L1 满 30s ───────► L1_HIT_SWR (0ms 立即返回，后台 waitUntil 异步核对 cms:route_revs)
  │     ├─ 冷 Isolate ──────► L0_PRELOAD_HIT (读取同机房 caches.default 共享信封，~1ms, 0 KV)
  │     ├─ 全冷公开 GET ────► OPTIMISTIC_SWR (静态默认 WAF + 无版本 L0 HTML 别名，0ms KV 等待)
  │     └─ 全冷动态/管理端 ─► Single-Flight 读取 1 次 L2 KV `edge:preload:v1` 并回填机房 L0
  ├─ 3. EdgeWafService.evaluate 内存预编译规则拦截 (IPv4/IPv6 CIDR、OWASP SQLi/XSS、Bot 轮换、速率限制)
  └─ 4. 路由分流：
        ├─ 私有路径 (/admin/*, /orders/*, /account/*, /api/*) ──► 强制 private, no-store (BYPASS)
        ├─ PJAX 局部请求 (X-Shell-Request: 1) ──► Vary 隔离 + no-store
        └─ 公开页面 (/, /products, /products/[slug], /[...slug])
              ├─ 查询 caches.default (L0 HTML Cache) ──► HIT / HIT_OPTIMISTIC 则 1~4ms 返回
              └─ MISS ──► 若为 OPTIMISTIC_SWR 先汇合等待 KV 预热，再 Single-Flight 合并渲染并双键写回 L0
       │
       ▼
[数据服务层与存储层]
  ├─ CMS 内容读取 (src/data/*.ts -> EdgeTieredCache & KeyedCache)
  │     ├─ L1 Isolate 内存 (预编译 Set/Map + profiler.requestMemo + existsGuard 防穿透)
  │     ├─ L2 Cloudflare KV 精简固定键 (无 @epoch 冗余键)
  │     └─ L3 Sanity API (日常读 apicdn，后台写穿透 refresh 强制走 liveClient useCdn: false)
  │
  └─ 业务与权限读取 (src/db/*.repo.ts -> RequestDeduplicatingDbClient)
        ├─ L1/L2 缓存 (settings, waf_runtime, rbac_roles, rbac_members, dict_groups, dicts_all)
        ├─ 纯 L1 30s 动态统计缓存 (rbac_member_stats, orders:pending_count, users:status, logs_overview)
        └─ PostgreSQL (Hyperdrive) / Cloudflare D1 (单请求内并发相同 SELECT 自动折叠去重)
```

---

## 2. 五层边缘缓存架构与 Sanity/CDN 精细化按需失效体系

> 完整缓存参数矩阵与分区明细请参阅《[cache.md](./cache.md)》。

### 2.1 核心架构机制
1. **同机房跨 Isolate L0 预热信封 (`https://edge-preload.internal/edge-preload-v1`)**：
   - 解决 Cloudflare 同一机房（Colo）在高并发下拉起多个新 V8 Isolate 时每个冷实例都要跨区读 ~200ms KV 的痛点。
   - 机房内第 1 个 Isolate 读完 `edge:preload:v1` 后写入本机房 `caches.default`（TTL 30s）；同机房后续所有新 Isolate 通过 `readPreloadBundleFromL0()` 在 ~1ms 内完成全部 L1 初始化（`L0_PRELOAD_HIT`）。
2. **SWR 非阻塞后台心跳 (`runHeartbeatSync`)**：
   - 热 Isolate 满 30 秒心跳周期时，不再在主请求上 `await kvGet('cms:route_revs')`，而是立即返回 `L1_HIT_SWR`（主请求 `kv=0ms`），通过 `runInBackground` 在后台比对 `heartbeatLedger.v === localRouteRevs.v`。
3. **二代结构化版本账本 (`RouteRevisionsLedger`)**：
   - 结构：`{ v: number, scopes: Partial<Record<CacheLedgerScope, number>>, routes: Record<string, number> }`。
   - 支持 7 大业务域（`settings | waf | dicts | rbac | config | products | pages`）独立时间戳。后台修改某一模块时，其他 Isolate 心跳仅定向失效该 Scope 的 L1 缓存，不误伤其余分区。
4. **L0 HTML 双键缓存 + Optimistic Miss 自动汇合**：
   - SSR 渲染写入 L0 时，同时写入版本化主键 `?__rev=<pathRev>` 与无版本别名键 `new URL(pathname, url.origin)`。
   - 全冷机房触发 `OPTIMISTIC_SWR` 时可 0ms 命中无版本别名（`HIT_OPTIMISTIC`）；若发生 L0 HTML Miss，则在进入 Astro `next()` 前自动 `await preloadEdgeIsolate(cfEnv, false, false)` 汇合等待后台 KV 预热完成。
5. **写入后自动边缘预热 (`prewarmEdgeRoutes`)**：
   - 在 CMS 内容同步、后台保存系统设置或手动清理缓存后，通过 `runInBackground` 自动并发预热核心路由（`/`、`/products`、变更路径及 `/about`、`/private-label`、`/contact`），先填充 L1/L2 数据再发起内部 `fetch` 填满 L0 HTML 缓存。

---

## 3. 双引擎数据库架构 (Cloudflare D1 / PostgreSQL) 与查询性能优化

### 3.1 SQLite (D1) 与 PostgreSQL (Supabase / Hyperdrive) 跨方言透明适配 (`src/db/client.ts`)
- **自动方言重写 (`toPostgresSql`)**：
  - 将 SQLite 的 `?` 占位符自动转换为 PostgreSQL 的 `$1, $2, ...`；
  - 将 `datetime('now')`、整型布尔与 `INSERT OR IGNORE / ON CONFLICT` 统一转换为跨方言兼容语法；
  - 统一 UTC 时间戳格式为 `YYYY-MM-DD HH:MM:SS`（`formatUtcCutoff` / `formatUtcSqlTimestamp`），确保字符串字典序比较在双引擎下 100% 一致。
- **请求级并发 SQL 折叠 (`RequestDeduplicatingDbClient`)**：
  - 绑定在 `RequestProfiler` 上下文中：同一 HTTP 请求内并发发起的相同 `SELECT`（`query` / `first`）共享同一个 Promise 并对结果数组做浅拷贝隔离；
  - 任何 `execute()` 或 `batch()` 写操作立即清空 `inFlightReads`，严格保障 Read-Your-Writes。

### 3.2 索引矩阵瘦身与高危慢查询根治 (`src/db/schema.ts` & `src/db/users.repo.ts`)
1. **清理 11 个冗余/前缀重复索引，新增 4 个高频复合索引**：
   - `idx_orders_created_at (created_at DESC)`：加速订单列表默认时间倒序分页；
   - `idx_orders_assigned_status_created (assigned_to, status, created_at DESC)`：覆盖 RBAC 跟单员视角下的订单过滤与排序；
   - `idx_users_login_created (last_login_at DESC, created_at DESC)`：覆盖后台客户列表默认排序；
   - `idx_error_logs_waf_dedupe_v2 (source, client_ip, error_code, id DESC)`：将 WAF 日志去重合并查询 (`ORDER BY id DESC LIMIT 1`) 从索引扫描后的回表排序优化为一次 B-Tree 定位。
2. **根治 `listAdminUsers` 中的 `LEFT JOIN ... ON (o.user_id = u.id OR o.buyer_email = u.email)` 笛卡尔全表扫描**：
   - 将导致 PostgreSQL/SQLite 无法走索引的 `OR` 连接拆解为基于 `UNION` / `UNION ALL` 的关联索引子查询（分别命中 `idx_orders_user_id` 与 `idx_orders_buyer_email`），并附带显式表别名（`AS o_all`、`AS o_pending`、`AS o_shipped`、`AS o_dates`）与单参数 `MAX(created_at)`，使 `/admin/customers` 查询提速 10 倍以上。

---

## 4. 身份认证 (Logto OIDC)、会话安全与动静分离 RBAC 权限体系

### 4.1 零 I/O 边缘会话验签 (`src/utils/auth.ts`)
- 采用 Web Crypto API `HMAC-SHA256` 校验 `b2b_session` Cookie，在 Isolate 内存中缓存 `CryptoKey`，单次验签 `< 0.1ms`。
- 用户封禁状态检查通过 `users:status` L1 缓存（30s TTL，支持 `id:` 与 `email:` 双键索引）拦截，正常浏览 0 数据库查询。

### 4.2 RBAC 动静分离架构 (`src/db/rbac.repo.ts`)
- **静态权限层 (`rbac_roles` + `rbac_members`，L1 + L2 KV 永久缓存)**：
  - `rbac:roles:v1` 与 `rbac:members:v1` 仅存储纯静态的角色权限矩阵与成员角色绑定，写操作时通过 `__rbac` Epoch 跨机房同步。
  - 移除了冷启动 `DDL_STATEMENTS` 中硬编码覆盖 `sales_manager` / `auditor` 权限的 `UPDATE` 语句，确保后台自定义角色权限持久化不丢失。
  - `listActiveTeamMembersLite()` 直接从内存 `listAdminMembers()` 过滤派生，0 额外查询。
- **动态统计层 (`rbac_member_stats`，纯 L1 30s 缓存)**：
  - 将高频变化的 `assigned_orders`、`assigned_customers`、`last_login_at`、`last_ip` 剥离到纯 L1 `memberStatsCache`（仅在访问 `/admin/members` 调用 `listAdminMembersWithStats()` 时按需装配），彻底杜绝因买手下单或登录而频繁失效 RBAC 静态 KV 缓存。

---

## 5. B2B 询盘 (RFQ) 与订单全生命周期状态机

### 5.1 询盘提交流水线 (`src/pages/api/submit-quote.ts`)
1. **零信任入参校验 (`validateQuotePayload`)**：严格校验字段长度、邮箱格式、款式数量上限。
2. **Cloudflare Turnstile 验证 & 60s 边缘幂等锁 (`idemp:rfq:{sha256}`)**：防止自动化脚本刷单与弱网重复提交。
3. **主库原子批处理 (`db.batch`)**：自动继承客户专属跟单员（`users.assigned_to`），原子写入 `orders` 与 `order_items`，并回填买手 CRM 档案。
4. **通知与超时熔断保护**：所有出站邮件（Resend）与多平台 IM Webhook 均挂载 `AbortSignal.timeout(6000)` 刚性超时防护，防止外部网络抖动拖死 Worker。

---

## 6. 自建无头 CMS 工作台与 Sanity 强内聚联动契约

### 6.1 架构设计亮点
1. **Sanity 读写分离 (`liveClient` vs `cdnClient`)**：
   - 日常被动读取走 `apicdn.sanity.io`；后台保存或 Webhook 触发 `forceRefresh = true` 时强制走 `useCdn: false` 的 `liveClient` (`api.sanity.io`)，彻底根治 CDN 同步延迟导致的旧数据写穿 KV 问题。
2. **按需索取契约 (`PRODUCT_CARD_FIELDS`)**：
   - 商品列表与聚合缓存 (`cms:products:all`) 严格只拉取卡片展示所需的最小字段子集，剔除完整 `gallery[]` 与长文详情，单次序列化体积缩减 80%。
   - `productSlugsCache` 直接从 `productsCache` 内存派生，消除独立的 `cms:product_slugs:v1` 与 `cms:pages:all` 冗余 KV 键。
3. **写入前递归清洗 (`sanitizeSanityDocument`) & 字段级影响面分析 (`hasProductCardFieldsChanged`)**：
   - 保存前自动剥离预览辅助属性；仅当卡片摘要字段变化或增删改 Slug 时才刷新列表页与相邻上下款商品页。

---

## 7. 前端交互体验：View Transitions、AppShell 路由与物理几何对齐

### 7.1 View Transitions 导航栏零闪烁固定 (`src/styles/globals.css` & `src/pages/products/[slug].astro`)
- 为顶部导航栏 `header.apple-nav` (`view-transition-name: site-header`) 与面包屑 `nav.breadcrumbs-bar` (`view-transition-name: site-breadcrumbs`) 赋予独立 View Transition 层级，并在 `::view-transition-group(site-header)` / `::view-transition-old` / `::view-transition-new` 上强制 `z-index: 100; animation: none; mix-blend-mode: normal`。
- 移除了商品详情页切换时的 `.pdp-is-transitioning` 透明度闪烁动画，实现 Chrome 跨商品切换时顶部导航栏如原生 App 般纹丝不动。

### 7.2 视口懒加载与异步解码 (`useIntersectionShimmer.ts`)
- **首屏外图片真实懒加载 (`hydrateLazyImage`)**：商品目录页 (`idx >= 8`) 与首页商品矩阵卡片采用 `data-src` / `data-srcset`，在滚动进入视口前 160px 时由 `IntersectionObserver` 动态激活并平滑移除骨架屏波纹，大幅降低首屏带宽竞争与 LCP 耗时。
- **异步图像解码 (`decoding="async"`)**：避免大图解码阻塞主线程，保证快速切换页面时的帧率稳定。

### 7.3 数学几何对齐与动态底部避让 (`--apple-dock-bottom`)
- **全局动态底部基准线**：在 `globals.css` 定义 `--apple-dock-bottom: max(1.25rem, env(safe-area-inset-bottom, 0px))`；当移动端商品详情页底部粘性询盘栏 (`#pdp-mobile-sticky-bar.translate-y-0`) 滑出时，通过 CSS `:has()` 自动将 `--apple-dock-bottom` 抬升 `+ 4rem`。
- **零重叠物理舒适布局**：右下角 WhatsApp 悬浮组件 (`bottom: var(--apple-dock-bottom)`) 与返回顶部按钮 (`bottom: calc(var(--apple-dock-bottom) + 3.75rem)`) 基于同一数学基准线自动联动升降；桌面端右侧流体间距 (`src/utils/device.ts`) 仅在剩余右侧留白 `>= 28px` 时才做对称收拢，彻底消除大屏下内容区与右下角悬浮按钮的视觉压迫与重叠。

---

## 8. 边缘 WAF 安全护盾、反爬限流与全链路可观测性

### 8.1 内存预编译 WAF 引擎 (`src/utils/waf.ts` & `src/db/waf.repo.ts`)
1. **L1 预编译规则树 (`CompiledWafRuntime`)**：
   - 将数据库 `waf_rules` 与 `waf_ip_acl` 一次性编译为安全正则表达式（带 `validateRegexSafety` ReDoS 检测与字面量降级）、IPv4 32 位无符号整型掩码、IPv6 128 位 `BigInt` CIDR 掩码。
2. **历史旧站路径 Fast-404 (`sys_legacy_cms_paths`)**：
   - 对 `/product-tag/*`、`/product-category/*`、`/wp-content/*` 等历史旧站爬虫请求直接返回带 `Cache-Control: public, max-age=3600, s-maxage=3600` 的 `404 Not Found`（`X-Edge-WAF: FAST-404`），不计入恶意攻击 Strike，不误封 Googlebot / Bingbot。
3. **防刷屏日志去重与微批落库 (`logs.repo.ts`)**：
   - 同一攻击 IP 的连续拦截在 Isolate 内存中静默累加 `hitCount`；落库时通过 PostgreSQL `pg_advisory_xact_lock` + `idx_error_logs_waf_dedupe_v2` 合并到最新一条记录。
   - `/admin/waf` 页面加载与刷新时直接复用 L1 `wafRuntimeCache` 中的规则与未过期 IP ACL，并通过 `includeOverview: false` 跳过 7 天全表慢日志聚合，使 WAF 控制台打开速度提升 6 倍以上。

### 8.2 边缘节点可观测性 (`X-Edge-Node` & `Server-Timing`)
- 延迟初始化 `getIsolateId()`（严格遵循 Cloudflare Workers 全局作用域禁止调用 `crypto.randomUUID()` 规范），在响应头输出 `X-Edge-Node: <colo>:<isolateId>`、`X-Preload-Status`、`X-Edge-Cache`、`X-Perf-Spans` 与 `Server-Timing`。

---

## 9. 已落地核心架构升级里程碑清单

| 编号 | 领域 | 架构升级项 | 当前状态 |
| :---: | :--- | :--- | :---: |
| **M-1** | **边缘缓存** | 二代 `RouteRevisionsLedger` (`v` + 7 `scopes` + `routes` 自动修剪) & 移除全部冗余 KV Key / `@epoch` 键 | ✅ **已上线 (39/39 单测通过)** |
| **M-2** | **冷启动优化** | 同机房 `caches.default` 共享 `edge-preload-v1` 信封 (`L0_PRELOAD_HIT`) + 公开页 `OPTIMISTIC_SWR` 无版本 L0 别名 + L0 Miss 自动汇合 | ✅ **已上线** |
| **M-3** | **心跳与预热** | 30s 心跳改为 0ms 阻塞 `L1_HIT_SWR` 后台异步同步 + 数据变更/Purge 后 `prewarmEdgeRoutes` 自动后台预热 | ✅ **已上线** |
| **M-4** | **数据库与 SQL** | 移除 11 个冗余索引、新增 4 个核心复合索引、`listAdminUsers` `OR` 关联改写为 `UNION` 索引子查询、`RequestDeduplicatingDbClient` 请求内 SQL 去重 | ✅ **已上线** |
| **M-5** | **后台管理端提速** | RBAC 动静分离 (`memberStatsCache`)、`/admin/waf` 复用 L1 ACL + 跳过全表 Overview、`/admin/dicts` 分组接入 L2 KV | ✅ **已上线** |
| **M-6** | **前端 UX 与几何** | View Transition 导航栏固定零闪烁、`useIntersectionObserver` 视口懒加载、`--apple-dock-bottom` 数学对齐避让 | ✅ **已上线** |

---

## 10. 常见线上故障诊断速查手册 (Troubleshooting Runbook)

### 场景 1：如何区分请求是命中了“外层 Cloudflare CDN”还是“Worker 内部 L0 缓存”？
1. **外层 Cloudflare CDN 命中**：
   - 响应头 `cf-cache-status: HIT`。
   - 请求由 Cloudflare 边缘节点直接返回，**根本不会唤醒 Worker**，因此 Worker 日志表 (`system_error_logs`) 中不会产生任何记录，耗时 1~5ms。
2. **Worker 内部 L0 (`caches.default`) 命中**：
   - 响应头 `cf-cache-status: DYNAMIC`（或 `MISS`），且 `X-Edge-Cache: HIT`（或 `HIT_OPTIMISTIC`）。
   - 请求进入了 `src/middleware.ts`，但未触发 Astro SSR 渲染，直接从机房共享 `caches.default` 返回 HTML（`d1=0, sanity=0`）。仅当后台 `log_min_level` 设为 `info` 或 `debug` 时才会在日志表看到 `REQUEST_COMPLETED`。

### 场景 2：为什么同机房 (`SIN` / `AMS`) 日志里 `isolateId` 变了，但 `kv` 耗时仍然是 `0ms`？
- 这是 **同机房 L0 Preload 信封 (`L0_PRELOAD_HIT`)** 或 **乐观快路 (`OPTIMISTIC_SWR`)** 正在工作：
  - 查看响应头或日志 `context.preload`：
  - 若为 `L0_PRELOAD_HIT`：说明新拉起的冷 Isolate 直接从本机房 `caches.default` 读取了前一个 Isolate 缓存的 `edge-preload-v1` 信封（耗时 ~1ms，0 次 KV 读取）；
  - 若为 `OPTIMISTIC_SWR`：说明新 Isolate 直接命中了无版本 L0 HTML 别名（`X-Edge-Cache: HIT_OPTIMISTIC`），并在后台异步回填了 KV。

### 场景 3：日志里出现 `clientIp: "127.0.0.1"` 或 `2a06:98c0:3600::103` 访问 `/`、`/products`、`/about`
- **原因**：这是后台执行缓存清理 (`/admin/cache`)、保存设置 (`/admin/settings`) 或 CMS Webhook 同步后，`prewarmEdgeRoutes()` 在后台发起的 Worker 自调用预热请求（`User-Agent: Cloudflare-Edge-Warmup/1.0`），用于提前把最新 HTML 填满 L0 缓存，属于正常系统预热行为。

### 场景 4：管理后台点击左侧菜单切换页面后，新页面按钮无反应
- **原因**：后台采用 `appShellRouter.ts` 进行 PJAX 局部替换（仅替换 `#shell-main-canvas`）。
- **规范**：所有 `/admin/*.astro` 页面脚本必须通过 `document.addEventListener('shell:page-load', initPage)` 重新绑定当前活跃 DOM，或使用挂载在 `document` 上的事件委托（`e.target.closest(...)`）。