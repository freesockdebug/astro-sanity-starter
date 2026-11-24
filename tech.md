# B2B E-Commerce & Enterprise Admin Portal — 架构文档总索引 (`tech.md`)

> **架构设计哲学**：以第一性原理指导设计，采用 **渐进式按需披露 (Progressive Disclosure)** 文档体系。为节省 AI Agent 上下文 Token 并保持高信噪比，全站技术架构已按正交业务边界拆分为 `docs/` 目录下的 **5 篇核心领域专篇**。
>
> 全局硬性编码红线与任务路由规则详见根目录《[`agents.md`](./agents.md)》。

---

## 一、 模块化架构专篇导航 (`docs/00 ~ 05`)

| 编号 | 架构专篇路径 | 覆盖核心领域 | 关键源码文件映射 |
| :---: | :--- | :--- | :--- |
| **00** | **[`docs/00-module-template.md`](./docs/00-module-template.md)** | **架构专篇与对抗巡检模块标准模板**<br>新增架构领域或扩展模块时的「第一性原理推导 + L1/L0/KV 拓扑流转 + 代码契约 + 历史故障对抗探针 (`*-ADV-*`) 与 `PreflightTest.verify()`」四步协同演进规范 | `scripts/check-preflight.ts`<br>`scripts/audits/*.audit.ts`<br>`docs/*.md` |
| **01** | **[`docs/01-edge-cache.md`](./docs/01-edge-cache.md)** | **五层边缘缓存与 L1/L0/KV 状态同步架构**<br>Outer CDN / L0 `caches.default` / L1 Isolate 内存 / L2 KV / L3 源站、`preloadEdgeIsolate` 四级预热、二代 `RouteRevisionsLedger`、L0 HTML 双键缓存与后台自预热 (`prewarmEdgeRoutes`) | `src/middleware.ts`<br>`src/utils/cache.ts`<br>`src/utils/cmsSync.ts`<br>`src/pages/api/revalidate.ts` |
| **02** | **[`docs/02-db-auth-rbac.md`](./docs/02-db-auth-rbac.md)** | **双引擎数据库、零 I/O 鉴权与动静分离 RBAC (L1/L0/KV Flow)**<br>D1 (SQLite) 与 Supabase (Postgres) 方言透明转换、请求级并发 SQL 折叠 (`RequestDeduplicatingDbClient`)、复合索引与 `UNION` 子查询优化、Logto OIDC + `HMAC-SHA256` 零 I/O 会话验签、RBAC 动静分离与 DataScope 隔离 | `src/db/client.ts`<br>`src/db/schema.ts`<br>`src/db/*.repo.ts`<br>`src/utils/auth.ts`<br>`src/utils/rbac.ts` |
| **03** | **[`docs/03-cms-i18n-seo.md`](./docs/03-cms-i18n-seo.md)** | **双端无头 CMS、多语言 i18n、SEO 与第一方图片代理**<br>Sanity 读写分离双客户端 (`cdnClient` vs `liveClient`)、`PRODUCT_CARD_FIELDS` 最小字段契约、自建后台 CMS 与 `studio/` 强联动清单、4 语种 (`en/de/fr/es`) 三级翻译回退链、`SEO.astro`、动态多语言 Sitemap、`/cdn-image/*` 零拷贝流式图片代理 | `src/data/*.ts`<br>`studio/schemaTypes/*.ts`<br>`src/utils/adminPageSchemas.ts`<br>`src/i18n/*`<br>`src/components/SEO.astro`<br>`src/pages/cdn-image/[...path].ts` |
| **04** | **[`docs/04-storefront-and-shells.md`](./docs/04-storefront-and-shells.md)** | **前台多主题几何系统、视口懒加载与双端 AppShell 工作台**<br>4 套动态视觉主题 SSR 零闪烁注入、View Transitions 导航栏零闪烁固定、`--apple-dock-bottom` 动态底部几何避让、`useIntersectionShimmer` 视口懒加载与 `complete` 判空红线、Nanostores 询盘篮、`appShellRouter.ts` (PJAX) 与表格列偏好持久化 | `src/config/storefrontThemes.ts`<br>`src/styles/globals.css`<br>`src/utils/useIntersectionShimmer.ts`<br>`src/utils/appShellRouter.ts`<br>`src/utils/adminWorkbench.ts` |
| **05** | **[`docs/05-waf-rfq-and-ops.md`](./docs/05-waf-rfq-and-ops.md)** | **边缘预编译 WAF、B2B 询盘交易链路、测试与运维手册**<br>`EdgeWafService` 内存预编译规则树 (ReDoS 防护、IPv4/IPv6 CIDR、旧站 `FAST-404` 免 Strike、Advisory Lock 日志去重)、RFQ 询盘原子提交与 `waitUntil` 多平台通知、客户等级 (`tier.ts`)、国际物流 (`shipping.ts`)、46 项单测门禁与线上故障 Runbook | `src/utils/waf.ts`<br>`src/pages/api/submit-quote.ts`<br>`src/utils/rfqNotify.ts`<br>`src/shims/cloudflare-workers.ts`<br>`test/*.test.ts` |

---

## 二、 核心技术栈全景表

| 架构层次 | 核心技术选型 | 运行时 / 部署载体 | 核心职责与设计定位 |
| :--- | :--- | :--- | :--- |
| **展示与路由层** | **Astro SSR (`output: 'server'`)** | Cloudflare Workers | 服务端流式 HTML 渲染、API Routes、4 语种 (`en/de/fr/es`) 动态路由 |
| **边缘计算与网络** | **Cloudflare Workers + Cache API (`caches.default`) + Zone CDN** | 全球 300+ 边缘 PoP 节点 | 同机房跨 Isolate L0 预热信封共享、L0 HTML 双键缓存、Single-Flight 并发合并、`/cdn-image` 图片代理 |
| **分布式键值缓存** | **Cloudflare KV (`CACHE_KV` binding)** | 边缘全局持久化存储 | `edge:preload:v1` 单次聚合冷启动包、二代 `cms:route_revs` 版本账本、CMS/WAF/RBAC/Dicts 写穿缓存 |
| **关系型业务库** | **Cloudflare Hyperdrive / Supabase PostgreSQL & Cloudflare D1 (`DB`)** | 双方言自适应关系库 | B2B 询盘订单、订单明细、采购商 CRM、RBAC、数据字典、WAF 规则与 ACL、审计与系统诊断日志 |
| **内容管理系统** | **Sanity CMS (`@sanity/client`) + 自建后台 CMS** | 云端 Headless CMS + `/admin/*` | 商品目录、分类、模块化动态页面（6 大 Section 积木）、全局配置、云端媒体库 |
| **身份与单点登录** | **Logto OIDC + Web Crypto HMAC-SHA256** | OIDC 云端 + 边缘无状态 Cookie | 买手注册/登录、社交登录、M2M 管理接口密码重置、`b2b_session` 零 I/O 签名校验 |
| **事务通知系统** | **Resend Email API + 多平台 IM Webhook** | `waitUntil` 异步并行调度 | 询盘提交、订单审批、发货单号通知（企微/钉钉/飞书/Slack/Discord，6s 刚性超时熔断） |
| **前端状态与样式** | **Tailwind CSS v4 + DaisyUI + Nanostores** | 零 CLS 服务端骨架 + 客户端水合 | 4 套动态主题 (`apple-minimal` / `luxury-editorial` / `atelier-warm` / `industrial-tech`)、响应式几何对齐 |

---

## 三、 全栈系统简明拓扑图

```text
[Buyer / Crawler / Admin Browser]
       │
       ▼
[Tier 0: Outer Cloudflare Global CDN & Redirect Rules] (1~5ms, 0 Worker CPU)
       │
       ▼
[Cloudflare Worker: src/middleware.ts]
  ├─ 1. RequestProfiler (AsyncLocalStorage) + RequestDeduplicatingDbClient
  ├─ 2. preloadEdgeIsolate (L1_HIT 0ms | L1_HIT_SWR 0ms | L0_PRELOAD_HIT ~1ms | OPTIMISTIC_SWR 0ms)
  ├─ 3. EdgeWafService.evaluate (L1 Pre-compiled RegExp & IPv4/IPv6 CIDR, <0.05ms)
  └─ 4. Route Dispatch:
        ├─ Public Pages ──► L0 HTML Cache (Versioned Key + Optimistic Alias) ──► Astro SSR
        ├─ PJAX Shell (X-Shell-Request: 1) ──► Partial #shell-main-canvas Render
        └─ Private/API (/admin/*, /api/*, /orders, /account) ──► Auth & RBAC DataScope Guard
```

---

## 四、 已落地核心架构升级里程碑清单

| 编号 | 领域 | 架构升级项 | 当前状态 |
| :---: | :--- | :--- | :---: |
| **M-1** | **边缘缓存** | 二代 `RouteRevisionsLedger` (`v` + 7 `scopes` + `routes` 自动修剪) & 移除全部冗余 KV Key / `@epoch` 键 | ✅ **已上线** |
| **M-2** | **冷启动优化** | 同机房 `caches.default` 共享 `edge-preload-v1` 信封 (`L0_PRELOAD_HIT`) + 公开页 `OPTIMISTIC_SWR` 无版本 L0 别名 + L0 Miss 自动汇合 | ✅ **已上线** |
| **M-3** | **心跳与预热** | 30s 心跳改为 0ms 阻塞 `L1_HIT_SWR` 后台异步同步 + 数据变更/Purge 后 `prewarmEdgeRoutes` 自动后台预热 | ✅ **已上线** |
| **M-4** | **数据库与 SQL** | 移除 11 个冗余索引、新增 4 个核心复合索引、`listAdminUsers` `OR` 关联改写为 `UNION` 索引子查询、`RequestDeduplicatingDbClient` 请求内 SQL 去重、三端 Schema 零漂移 (`DB-ADV-05`) | ✅ **已上线** |
| **M-5** | **后台管理端提速** | RBAC 动静分离 (`memberStatsCache`)、`/admin/waf` 复用 L1 ACL + 跳过全表 Overview、`/admin/dicts` 分组接入 L2 KV | ✅ **已上线** |
| **M-6** | **前端 UX 与几何** | View Transition 导航栏固定零闪烁、`useIntersectionShimmer` 视口懒加载与空 `src` `complete` 陷阱防卫 (`UI-ADV-01`)、`--apple-dock-bottom` 数学对齐避让 | ✅ **已上线** |
| **M-7** | **公理化与领域对抗自循环** | 原版 `00-core-invariants` (24 项 Pitfalls + 4 大 AST 探针 + Studio 36 项 Preview 模糊测试) + `01~05` 领域对抗探针 + 内存 `verify()` 故障注入 + `DOC-SYNC-GUARD` 文档双向同步 + 46 项单测 | ✅ **已上线** |