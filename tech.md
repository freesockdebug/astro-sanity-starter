# GwenVenni B2B E-Commerce & Enterprise Admin Portal — 技术架构设计与问题诊断全景手册 (`tech.md`)

> **文档定位**：本文档为 GwenVenni B2B 全球批发门户与自建企业级管理后台的**权威技术架构蓝图、全模块设计评估、潜在风险诊断清单与演进指南**。供后续功能迭代、性能调优、线上故障排查与架构升级作为统一基准参考。

---

## 目录
1. [系统总体架构与技术栈全景](#1-系统总体架构与技术栈全景)
2. [多级缓存架构与 Sanity/CDN 精细化按需失效方案](#2-多级缓存架构与-sanitycdn-精细化按需失效方案)
3. [数据库架构 (Cloudflare D1 / SQLite) 与查询性能评估](#3-数据库架构-cloudflare-d1--sqlite-与查询性能评估)
4. [身份认证 (Logto OIDC)、会话安全与 RBAC 权限体系评估](#4-身份认证-logto-oidc会话安全与-rbac-权限体系评估)
5. [B2B 询盘 (RFQ) 与订单全生命周期状态机评估](#5-b2b-询盘-rfq-与订单全生命周期状态机评估)
6. [自建无头 CMS 工作台与 Sanity 数据契约评估](#6-自建无头-cms-工作台与-sanity-数据契约评估)
7. [前端 AppShell SPA 路由、多语言 i18n 与边缘图片代理评估](#7-前端-appshell-spa-路由多语言-i18n-与边缘图片代理评估)
8. [安全防护、反爬限流与可观测性 (Observability) 评估](#8-安全防护反爬限流与可观测性-observability-评估)
9. [全栈架构隐患汇总表与演进优先级路线图](#9-全栈架构隐患汇总表与演进优先级路线图)
10. [常见线上故障诊断速查手册 (Troubleshooting Runbook)](#10-常见线上故障诊断速查手册-troubleshooting-runbook)

---

## 1. 系统总体架构与技术栈全景

### 1.1 核心技术栈
| 领域 | 技术选型 | 运行时位置 / 绑定 | 核心职责 |
| :--- | :--- | :--- | :--- |
| **全栈框架** | **Astro 5 SSR (`output: 'server'`)** | Cloudflare Workers | 服务端流式 HTML 渲染、API Routes、多语言动态路由 |
| **边缘计算与网络** | **Cloudflare Workers + Cache API (`caches.default`) + Zone CDN** | 全球 300+ 边缘 PoP 节点 | 0ms 扫描器拦截、HTML 边缘缓存、Single-Flight 并发合并、`/cdn-image` 图片代理 |
| **分布式键值缓存** | **Cloudflare KV (`KV` binding)** | 边缘全局最终一致存储 | Sanity CMS 永久写穿缓存、Logto M2M Token 缓存、RFQ 防重放幂等锁、Cloudflare Zone ID 缓存 |
| **关系型业务库** | **Cloudflare D1 (`DB` binding) / 本地 SQLite** | Serverless SQLite | B2B 询盘订单、订单明细、采购商 CRM、RBAC 角色/成员、数据字典、操作审计、系统异常日志 |
| **内容管理系统** | **Sanity CMS (`@sanity/client`) + 自建后台 CMS** | 云端 Headless CMS + `/admin/*` | 商品目录、分类、模块化动态页面（6 大 Section 积木）、全局配置、云端媒体库 |
| **身份与单点登录** | **Logto OIDC + Web Crypto HMAC-SHA256** | OIDC 云端 + 边缘无状态 Cookie | 买手注册/登录、社交登录、M2M 管理接口密码重置、`b2b_session` 签名校验 |
| **事务通知系统** | **Resend Email API + 多平台 IM Webhook** | 异步并行调度 | 询盘提交、订单审批、发货单号通知（支持企微/钉钉/飞书/Slack/Discord） |
| **人机验证** | **Cloudflare Turnstile** | 前端沙箱 + 服务端校验 | `/api/submit-quote` 询盘提交防刷与 Hostname 绑定校验 |

### 1.2 请求全链路数据流向图
```
[客户端浏览器 / 买手 / 管理员]
       │
       ▼
[Cloudflare Global CDN (L0 全球静态与页面边缘节点)]
       │ (MISS 或动态请求)
       ▼
[Cloudflare Worker: src/middleware.ts]
  ├─ 1. 扫描器与恶意探针拦截 (isBlockedProbe -> 0ms 返回 404，不触发 D1/Sanity)
  ├─ 2. RequestProfiler (AsyncLocalStorage) 启动全链路耗时打点
  ├─ 3. 路由分流：
  │     ├─ 私有路径 (/admin/*, /orders/*, /account/*, /api/*) -> 强制 no-store 绕过缓存
  │     ├─ PJAX 局部请求 (X-Shell-Request: 1) -> Vary 隔离 + no-store
  │     └─ 公开页面 (/, /products, /products/[slug], /[...slug])
  │           ├─ 查询 caches.default (L1 Edge HTML Cache) -> HIT 则 2ms 返回
  │           └─ MISS 则进入 Single-Flight (inFlightEdgeRenders) 防击穿合并渲染
       │
       ▼
[数据服务层与存储层]
  ├─ CMS 内容读取 (src/data/*.ts -> src/utils/cache.ts)
  │     ├─ L1 Worker Isolate 内存缓存 (TTL 5m, 0ms)
  │     ├─ L2 Cloudflare KV 永久写穿缓存 (1~3ms)
  │     └─ L3 Sanity API (仅在 KV 冷启动未命中或后台保存 Write-Through 时触发)
  │
  └─ 业务与权限读取 (src/db/*.repo.ts)
        ├─ L1/L2 短效缓存 (system_settings, rbac, dashboard_stats)
        └─ D1 SQLite 数据库 (含 executeWithAutoSchema 懒加载自愈建表与索引)
```

---

## 2. 多级缓存架构与 Sanity/CDN 精细化按需失效方案

### 2.1 现有缓存矩阵盘点
1. **CMS 数据层 (`src/utils/cache.ts`)**：
   - `createCmsCache<T>`：用于集合与单例（`cms:products:all`、`cms:categories:all`、`cms:siteConfig`、`cms:catalogSettings`、`cms:productStorySettings`、`cms:rfqSettings`）。
   - `createCmsKeyedCache<T>`：用于按 `slug` 索引的实体（`cms:product:{slug}`、`cms:page:{slug}`），内置 Single-Flight 并发合并、LRU 容量上限（500 条）与 30 秒 404 负缓存（防止恶意扫描不存在的 `slug` 穿透到 Sanity）。
2. **边缘 HTML 层 (`src/middleware.ts` & `src/utils/cmsSync.ts`)**：
   - 公开 GET 页面写入 `caches.default`，响应头设置 `Cache-Control: public, max-age=0, s-maxage=${edgeCacheTtl}, stale-while-revalidate=${swr}`。
3. **图片代理层 (`src/pages/cdn-image/[...path].ts`)**：
   - 根据 `Accept` 头识别 WebP 支持度，将缓存键拆分为 `?cf_fmt=webp` 与原图，消除 `auto=format` 引发的格式串染；使用 `ReadableStream.tee()` 零拷贝流式边发边存，缓存 1 年（`31536000s, immutable`）。

### 2.2 现有缓存机制存在的 4 大核心问题（诊断结论）
1. **🔴 [高危] Sanity `useCdn: true` 导致写穿（Write-Through）把旧数据永久锁入 KV**：
   - `src/utils/sanity-client.ts` 默认 `useCdn: true`（走 `apicdn.sanity.io`）。
   - 当后台保存修改（走 `api.sanity.io`）后，`syncCmsMutation()` 在 1 毫秒后立即调用 `refreshSlug()` / `refreshAll()`，此时请求的是存在 1~10 秒同步延迟的 `apicdn.sanity.io`，导致极大概率把**修改前的旧数据**拉取回来并永久写入 KV。
2. **🟡 [中危] `caches.default` 是单机房（PoP-Local）缓存，无法跨全球机房删除**：
   - `cmsSync.ts` 中的 `workerCache.delete()` 仅能删除执行本次 API 请求所在的单一 Cloudflare 机房缓存；全球其余 300+ 机房的 `caches.default` 仍保留旧 HTML 直到 TTL 到期。
   - 同时，其他存活的 Worker 实例（Isolate）内存中的 L1 缓存（5 分钟 TTL）无法感知当前实例的修改，可能会用旧 L1 数据重新渲染出旧 HTML。
3. **🟡 [中危] 失效粒度过粗 & 遗漏隐式依赖路由**：
   - 修改商品的任意详情字段（如长文 `story`）也会触发全量 `refreshAll()` 并清空首页 `/` 和目录页 `/products`。
   - 新增/删除商品或改名时，未清理相邻商品详情页（`/products/[prevSlug]` 和 `/products/[nextSlug]` 底部的上下款切换导航）。
   - 修改 `productStorySettings` 时，错误地只清理了 `/` 和 `/products`，漏掉了真正展示它的所有 `/products/[slug]` 页面。
4. **🟡 [低危] `PageService.getAll()` 与 `PageService.getById()` 未接入缓存**：
   - `src/data/page.ts` 中这两个方法直接裸调 `client.fetch`，未经过 `createCmsCache`。

### 2.3 精细化按需失效架构设计（推荐升级方案）

#### (1) Sanity 读写分离客户端 (`forceRefresh` 强制走 `useCdn: false`)
- 在 `src/utils/sanity-client.ts` 中新增 `liveClient = client.withConfig({ useCdn: false })`。
- 当 `createCmsCache` / `createCmsKeyedCache` 处于日常被动读取（`forceRefresh = false`）时走免费 `apicdn`；当处于后台保存或 Webhook 触发的 `refresh()`（`forceRefresh = true`）时，**强制走 `liveClient` (`api.sanity.io`)**，确保 0 延迟读取强一致最新数据写入 KV。

#### (2) 引入「KV 路由级版本清单 (`cms:route_revs`)」实现全球机房按路径精准失效
- 在 KV 中维护一个极小的字典 `cms:route_revs`（每个 Worker 实例每 5 秒轻量同步一次）：
  ```json
  {
    "/": 1731301100,
    "/products": 1731301250,
    "/products/cashmere-crew": 1731301599,
    "/about": 1731200000,
    "__layout": 1731100000
  }
  ```
- `src/middleware.ts` 在构造 `caches.default` 的 `cacheKey` 时，将路径规范化（剥离 `/de`、`/fr`、`/es` 语言前缀）后取 `rev = Math.max(revs[basePath] || 0, revs['__layout'] || 0)`，拼接为 `https://domain.com/de/products/cashmere-crew?__rev=${rev}`。
- **优势**：后台修改单个商品或单个页面时，只需更新 `cms:route_revs` 中对应的那 1 个路由时间戳，**全球 300+ 机房的 `caches.default` 在下一秒仅针对该路由自动穿透更新**，其余所有页面保持 100% 缓存命中，完全无需全局清理！

#### (3) 字段级差异感知（Field-Aware Dependency Graph）
- 在 `POST /api/admin/cms/products` 中比对 `existingDoc` 与 `newDoc`：
  - **仅详情字段变化**（`story`、非主图 `gallery`、`amazonUrl`、`specifications[2..n]`）：仅刷新 `cms:product:{slug}`，仅递增 `/products/{slug}` 的路由版本号并清理其 CDN URL（不触碰 `/` 和 `/products`）。
  - **卡片摘要字段变化**（`title`、`shortTitle`、`mainImage`、`pricingTiers`、`moq`、`colors`、`category`）：刷新 `cms:product:{slug}` + `cms:products:all`，递增 `/products/{slug}`、`/products`、`/` 的版本号。
  - **新增/删除/改 Slug**：额外定位修改前后的相邻商品 `prevSlug` 与 `nextSlug`，将其纳入按需失效列表，确保详情页上下款导航链接实时准确。

---

## 3. 数据库架构 (Cloudflare D1 / SQLite) 与查询性能评估

### 3.1 核心表结构与职责 (`src/db/schema.ts`)
系统共包含 **10 张核心表**：
1. `orders`：B2B 询盘与样品单主表（含 `order_no`、`buyer_email`、`user_id`、`status`、`assigned_to`、`inquiry_type` 等）。
2. `order_items`：订单款式明细表（外键 `order_id ON DELETE CASCADE`）。
3. `users`：采购商 CRM 档案表（含 `tier` 客户等级、`status` 封禁状态、`assigned_to` 专属业务员）。
4. `user_logins`：买手与管理员登录轨迹表（记录 IP、国家、城市、User-Agent）。
5. `admin_roles`：RBAC 角色定义表（含 `data_scope`、`menus_json`、`permissions_json`）。
6. `admin_members`：后台团队成员表（关联 `role_code`）。
7. `admin_audit_logs`：后台敏感操作差分审计表（记录 `before_json`、`after_json`、`diff_json`）。
8. `sys_dict_groups` & `sys_dict_items`：动态配置字典表（物流承运商、快捷回复模板、客户等级、SLA 阈值等）。
9. `system_settings`：系统级动态配置 KV 表（Turnstile 密钥、Resend 密钥、Webhook 地址、慢查询阈值等）。
10. `system_error_logs`：全栈结构化异常与慢请求日志表。

### 3.2 架构亮点
- **懒加载自愈 Schema 引擎 (`executeWithAutoSchema`)**：日常查询 0 额外 RTT 开销；仅当 D1 抛出 `no such table` 或 `no such column` 时才自动触发幂等 `ensureSchema()`，兼顾冷启动极致速度与无缝平滑升级。
- **消除 N+1 查询 (`hydrateOrdersItems`)**：在 `src/db/orders.repo.ts` 中，列表查询使用 `WHERE order_id IN (?, ?, ...)`（按 50 条分块防止超出 SQLite 参数上限）一次性批量装配所有订单明细，将 20 次子查询压缩为 1 次。
- **单 RTT 并发聚合**：`listAdminOrders()` 与 `getDashboardStats()` 均使用 `Promise.all` 在单次异步周期内并发执行列表、总数与状态分布聚合。

### 3.3 发现的数据库层潜在问题与优化建议
1. **🟡 [中危] `LIKE '%term%'` 前导通配符导致索引失效**：
   - **定位**：`src/db/orders.repo.ts`（第 318 行）、`src/db/users.repo.ts`、`src/db/logs.repo.ts` 中的搜索使用 `(order_no LIKE ? OR buyer_email LIKE ? OR company_name LIKE ?)` 且参数为 `%term%`。
   - **影响**：当 `orders` 或 `system_error_logs` 增长到数万行时，前导 `%` 无法命中 B-Tree 索引，会触发全表扫描（Full Table Scan），增加 D1 行读取计费（Rows Read）与延迟。
   - **改进方案**：
     - 对订单号（如 `ORD-...`）或前缀匹配场景，优先使用后缀通配符 `term%` 或精确匹配；
     - 对日志表 `system_error_logs` 搜索，强制附带时间范围下界（如默认最近 7 天 `created_at >= datetime('now', '-7 days')`），利用 `idx_error_logs_created_at` 将扫描范围限制在近期热数据内。
2. **🟡 [中危] `system_error_logs` 与 `user_logins` 缺乏自动定期归档/TTL 清理机制**：
   - **定位**：`src/utils/logger.ts` 会将所有达到阈值的异常与慢请求异步批量写入 `system_error_logs`。
   - **影响**：随运行时间推移，日志表会无限膨胀。
   - **改进方案**：在写入批量日志（如每 100 次 Flush 或概率采样 1%）或后台访问日志页时，通过 `waitUntil` 异步执行一次清理：`DELETE FROM system_error_logs WHERE created_at < datetime('now', '-30 days')`，保持 D1 数据库体积恒定轻量。
3. **🟢 [低危] `orders.status` 初始默认值与字典键名存在历史命名差异**：
   - **定位**：`orders` 表 DDL 默认状态为 `'PENDING_APPROVAL'`（`orders.repo.ts` 查询也使用 `'PENDING_APPROVAL'`），但 `schema.ts` 第 201 行初始化 `sys_dict_items` 的 `order_statuses` 字典项写的 `item_key` 是 `'PENDING_REVIEW'`。
   - **改进方案**：在 `sys_dict_items` 中补充或统一为 `'PENDING_APPROVAL'`，避免前端字典渲染状态徽章时回退到默认样式。

---

## 4. 身份认证 (Logto OIDC)、会话安全与 RBAC 权限体系评估

### 4.1 认证与会话架构 (`src/utils/auth.ts` & `src/utils/authGuards.ts`)
- **无状态边缘签名 Cookie (`b2b_session`)**：
  - 采用 Web Crypto API 原生 `HMAC-SHA256` 对 `{ user, exp }` 进行签名，并在 Worker 内存中通过 `hmacKeyCache` 缓存 `CryptoKey` 对象，单次验签耗时 `< 0.1ms`。
  - 支持密钥平滑轮转（`getCandidateSecrets` 同时校验 `SESSION_SECRET` 与 `LOGTO_APP_SECRET`）。
- **Logto M2M 令牌边缘缓存**：
  - 调用 Logto Management API 修改密码时，将获取到的 M2M `access_token` 缓存在 Cloudflare KV（`auth:logto_m2m_token`，TTL 为 `expires_in - 120s`），并在遇到 401 时自动单次重试刷新。

### 4.2 RBAC 与数据权限隔离 (`src/db/rbac.repo.ts` & `src/utils/rbac.ts`)
- **三层权限模型**：
  1. **菜单级 (`menus`)**：控制左侧导航栏展示与页面路由准入。
  2. **功能动作级 (`permissions`)**：如 `cms:read`、`cms:write`、`cms:delete`、`orders:approve`、`orders:assign`、`users:edit_tier`。
  3. **行级数据范围 (`data_scope`)**：
     - `ALL`（超管/销售主管）：可查看并操作全量订单与客户。
     - `SELF_AND_POOL`（跟单业务员 `sales_rep`）：仅可查看分配给自己（`assigned_to = self`）及公海未分配（`assigned_to IS NULL`）的询盘与客户。
     - `SELF_ONLY`：仅可查看分配给自己的记录。

### 4.3 发现的认证与权限隐患及加固建议
1. **🟡 [中危] 无状态 Cookie 在角色变更或账号禁用时的“窗口期延迟”**：
   - **分析**：`b2b_session` 的有效期为 7 天（`DEFAULT_TTL_SECONDS = 7 * 24 * 3600`），其中内嵌了登录时刻的 `isAdmin` 布尔值。
   - **现状亮点**：后台接口 `verifyAdminAuth` 并没有单纯信任 Cookie 里的 `isAdmin`，而是每次通过 `resolveAdminContext(email)` 查询了 D1 `admin_members` 表（带 60s 内存缓存），因此后台撤销管理员权限后最多 60 秒即生效，设计非常扎实。
   - **潜在盲区**：如果某个后台成员在 `admin_members` 中被设为 `DISABLED`（禁用），但其邮箱同时配置在环境变量 `ADMIN_EMAILS` 或 `system_settings.co_admin_emails` 中，需要确保 `resolveAdminContext` 优先检查 `member.status === 'DISABLED'` 的显式封禁状态。

---

## 5. B2B 询盘 (RFQ) 与订单全生命周期状态机评估

### 5.1 询盘提交流水线 (`src/pages/api/submit-quote.ts`)
1. **边界校验 (`validateQuotePayload`)**：严格限制字段长度、RFC 5322 邮箱格式、商品数量上限（最多 50 款，单款数量 `1~100,000`）。
2. **Cloudflare Turnstile 验证**：服务端校验人机 Token 及 `hostname` 匹配，防止跨站盗用 Token。
3. **边缘幂等防重放锁 (`idemp:rfq:{sha256}`)**：基于 `email + items + message` 计算 SHA-256 摘要并在 KV 中写入 60 秒幂等锁，防止买手弱网下连点提交产生重复询盘单。
4. **D1 主库事务批处理 (`db.batch`)**：
   - 自动查询该采购商是否已绑定专属业务员（`users.assigned_to`），若有则新订单自动指派给该业务员；
   - 使用 `db.batch()` 原子写入 `orders` 主表与多行 `order_items` 明细；
   - 自动将买手填写的 `company`、`country`、`whatsapp` 回填（Backfill）至 `users` 表空字段。
5. **多通道并行通知 (`Promise.allSettled`)**：并发执行 D1 落库、Sanity `inquiry` 归档、Resend 邮件发送（8s 超时保护）与企微/钉钉/飞书/Slack Webhook 推送。

### 5.2 游客询盘自动认领机制 (`claimOrdersByEmail`)
- 买手未登录时以 `buyer_email` 提交的询盘单（`user_id IS NULL`），在其后续使用同一邮箱注册/登录进入 `/orders` 页面时，系统自动执行 `claimOrdersByEmail(email, userId)` 将历史游客询盘无缝绑定到其账户下，并设有 5 分钟内存防抖（`claimedUsersDebounce`），避免每次刷新页面重复执行 `UPDATE`。

### 5.3 潜在优化点
- **通知异步化提速 (`waitUntil`)**：
  - 目前 `submit-quote.ts` 第 577 行使用 `await Promise.allSettled([d1WriteTask, sanityWriteTask, emailTask, webhookTask])`，意味着前端买手点击提交后，必须等待 Resend 邮件 API 和企业微信 Webhook 全部响应完毕（可能耗时 1~3 秒）才能看到成功提示。
  - **更优方案**：只需 `await d1WriteTask`（耗时 `< 15ms`）确认主库落盘成功后，立即将 `sanityWriteTask`、`emailTask`、`webhookTask` 放入 `runInBackground(Promise.allSettled([...]))`（即 Cloudflare `waitUntil`），使买手端提交响应时间从 `1500ms` 降至 **`50ms` 以内**！

---

## 6. 自建无头 CMS 工作台与 Sanity 数据契约评估

### 6.1 架构设计亮点
1. **1:1 复刻 Sanity Studio 数据模型**：
   - `/admin/pages` 完整支持 4 语言切换（`EN / DE / FR / ES`）、6 大动态版块（`heroSection`、`productShowcaseSection`、`featureMatrixSection`、`manufacturingSection`、`inquirySection`、`customSection` 7 种自由积木）的拖拽排序、折叠卡片、独立表单编辑与云端媒体库选图。
   - `/admin/products` 支持主图与图集（Gallery）拖拽排序、一键无损切换主图（`★ Main`）及多语言规格矩阵。
2. **写入前递归清洗安全网 (`sanitizeSanityDocument`)**：
   - 在 `src/utils/cmsSync.ts` 中，所有发往 Sanity 的文档都会经过 `sanitizeSanityDocument()` 递归清洗：自动剥离前端用于即时预览的临时字段（如 `mainImageUrl`、`galleryUrls` 以及 `reference` 对象内非法的 `url` 属性），彻底杜绝 Sanity 报 `attribute url is not defined in schema` 错误。
3. **差分审计日志 (`computeJsonDiff`)**：
   - 每次修改商品、页面或全局配置，都会自动对比修改前后的 JSON 树，提取精确的字段级 `diff_json` 存入 D1 `admin_audit_logs`。

### 6.2 潜在风险与改进点
1. **并发编辑覆盖问题（Optimistic Concurrency Control）**：
   - 目前后台保存使用 `client.createOrReplace(doc)`，如果两个管理员同时打开同一个页面进行编辑，后保存的人会无条件覆盖先保存的人的修改。
   - **改进建议**：在表单加载时记录文档的 `_rev`，保存时比对 `existingDoc._rev === clientSubmittedRev`（或使用 Sanity `ifRevisionId`），若发现已被他人修改则弹窗提示冲突。
2. **媒体库弹窗大数据量分页与虚拟化**：
   - 建议按前文提供的方案，为 `/api/admin/cms/upload` 增加 `offset/limit` 分页，并在 `MediaLibraryModal.astro` 中启用 `content-visibility: auto` 与局部选中 DOM 更新（`updateGridSelectionDom`）。

---

## 7. 前端 AppShell SPA 路由、多语言 i18n 与边缘图片代理评估

### 7.1 自研轻量级 AppShell 路由器 (`src/utils/appShellRouter.ts`)
- **核心机制**：
  - 专为 `/admin/*` 与买手中心（`/orders`、`/account`）打造的零依赖 PJAX 路由器。
  - **65ms Hover 预取 + Touchstart 瞬时预取**：鼠标悬停导航链接 65ms 即提前拉取目标 HTML（自动识别 `Save-Data` 与 `2G` 弱网并降级）。
  - **Hot DOM Snapshot（5 分钟内存快照）**：切换回已访问过的 Tab 时，`0ms` 先行恢复上次的 DOM 快照与滚动条位置，同时后台静默拉取最新 HTML 无感替换。
  - **GET API 客户端短缓存 (`API_CACHE_TTL_MS = 25_000`)**：拦截 `window.fetch`，对 `/api/admin/*` 与 `/api/orders` 的 GET 请求缓存 25 秒；一旦发生任何非 GET 写操作（POST/PUT/DELETE），立即自动清空 `prefetchCache`、`apiResponseCache` 和 `snapshotCache`。
  - **发版漂移自愈保护 (`detectDeploymentDrift`)**：每次 PJAX 切换时比对新旧文档中 `<script type="module" src="...">` 的构建 Hash，若检测到服务端刚刚发布了新版本，自动放弃局部替换并触发原生整页刷新，彻底消除 SPA 跨版本 JS 报错。

### 7.2 边缘图片代理统一控制 (`src/utils/image.ts`)
- **三端统一开关**：
  - SSR 服务端、前台浏览器客户端、以及后台 Admin 工作台（通过 `AdminLayout.astro` 注入 `window.__ENABLE_IMAGE_PROXY__`）均统一由 `siteConfig.enableImageProxy` 控制。
  - 开启时自动将 `https://cdn.sanity.io/images/...` 转换为同源边缘路由 `/cdn-image/images/...`；关闭时直连 Sanity 官方 CDN。

---

## 8. 安全防护、反爬限流与可观测性 (Observability) 评估

### 8.1 纵深安全防御体系 (`src/utils/security.ts` & `src/middleware.ts`)
1. **0ms 边缘扫描器护盾 (`isBlockedProbe`)**：在 `middleware.ts` 最顶层拦截 `.php`、`.env`、`.git`、`wp-admin`、`phpmyadmin` 等恶意扫描，直接返回带 300s 缓存的 404，零 D1 查询、零日志噪音。
2. **严密的反 SSRF 校验 (`SecurityService.isSafeWebhookUrl`)**：
   - 校验后台配置的出站 Webhook URL：强制 `https:` 协议与 443 端口，封锁 `localhost`、十进制/十六进制变形 IP、IPv4 私有网段（`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、`169.254.0.0/16` 云元数据地址）以及 IPv6 环回/链路本地地址（`::1`、`fe80::/10`、`fc00::/7`、`::ffff:`）。
3. **防时序攻击恒定时间比对 (`timingSafeEqual`)**：所有 Webhook 密钥、Revalidate 密钥均采用字节级异或恒定时间比对。
4. **SVG 与 HTML 注入清洗 (`sanitizeSvg` / `escapeHtml`)**：对 CMS 自定义 SVG 图标剥离 `<script>`、`<iframe>`、`on*` 事件属性与 `javascript:` 伪协议。

### 8.2 全链路可观测性与性能剖析 (`src/utils/profiler.ts` & `src/utils/logger.ts`)
- **原生 `Server-Timing` 瀑布流注入**：
  - 基于 `AsyncLocalStorage` 追踪每个请求内部的 `d1`、`sanity`、`kv`、`auth` 耗时，并自动注入 HTTP 响应头 `Server-Timing: total;dur=..., d1;dur=..., sanity;dur=...`，可直接在 Chrome DevTools Network 面板查看各子系统耗时占比。
- **敏感字段自动脱敏 (`sanitizeData`)**：
  - 日志落库前自动递归扫描并脱敏所有匹配 `/password|token|secret|authorization|cookie|apikey/i` 的字段。
- **Isolate 微批写入 (`isolateLogBuffer`)**：
  - 累积满 10 条或达到 200ms 窗口时，通过 `db.batch()` 配合 `waitUntil` 一次性写入 D1，将日志 I/O 开销降至最低。

---

## 9. 全栈架构隐患汇总表与演进优先级路线图

| 编号 | 所属模块 | 问题描述 | 严重程度 | 建议修复方案 |
| :---: | :--- | :--- | :---: | :--- |
| **P0-1** | **Sanity 缓存写穿** | `syncCmsMutation` 刷新 KV 时使用了 `useCdn: true` 的客户端，因 Sanity CDN 1~10s 延迟会把旧数据永久写入 KV | 🔴 **P0 (最高)** | 在 `sanity-client.ts` 提供 `liveClient` (`useCdn: false`)，当 `forceRefresh === true` 时强制走 Live API |
| **P0-2** | **跨机房边缘缓存失效** | `caches.default.delete()` 仅在当前单个 Cloudflare PoP 生效，且其他实例 L1 内存存在 5 分钟滞后 | 🔴 **P0 (最高)** | 引入 KV 路由版本字典 `cms:route_revs`，将路由版本号拼入 `caches.default` 的 `cacheKey`，实现全球机房按需秒级失效 |
| **P1-1** | **依赖图谱精准度** | 修改 `productStorySettings` 漏清 `/products/[slug]`；修改商品详情非卡片字段连带清空了首页与目录页；改名/增删商品未清相邻上下款详情页 | 🟡 **P1 (中)** | 在 `cmsSync.ts` 引入 `hasProductCardFieldsChanged` 字段级比对、相邻商品 `prev/next` 推导，并修正 `productStorySettings` 的目标路由 |
| **P1-2** | **媒体库大数据量性能** | `MediaLibraryModal.astro` 每次点击卡片全量重建 `#media-grid.innerHTML`，且后端 `/api/admin/cms/upload` 缺少 `offset` 分页 | 🟡 **P1 (中)** | 后端增加 `offset/limit` 与 `count()`；前端增加翻页器、`content-visibility: auto` 虚拟化与 `updateGridSelectionDom()` 局部更新 |
| **P1-3** | **RFQ 提交响应速度** | `/api/submit-quote` 同步等待 Resend 邮件和 Webhook 完成后才返回响应，耗时受外部 API 拖累 | 🟡 **P1 (中)** | `await d1WriteTask` 成功后立即返回 200，将 Sanity 归档、邮件与 Webhook 放入 `runInBackground` (`waitUntil`) 异步执行 |
| **P2-1** | **D1 日志表无限增长** | `system_error_logs` 与 `user_logins` 无过期自动清理机制，长期运行会导致表体积膨胀 | 🟢 **P2 (常规)** | 在日志批量 Flush 时按 1% 概率通过 `waitUntil` 异步清理 30 天前的旧日志 (`created_at < datetime('now', '-30 days')`) |
| **P2-2** | **订单状态字典键对齐** | `orders` 表默认状态为 `PENDING_APPROVAL`，而 `sys_dict_items` 初始化为 `PENDING_REVIEW` | 🟢 **P2 (常规)** | 在 `schema.ts` 的 `sys_dict_items` 种子数据中对齐 `PENDING_APPROVAL` |

---

## 10. 常见线上故障诊断速查手册 (Troubleshooting Runbook)

### 场景 1：后台修改了商品或页面，但前台刷新还是旧内容
1. **排查步骤 1（看响应头）**：打开浏览器 DevTools -> Network，查看页面文档请求的响应头：
   - 查看 `X-Edge-Cache` 是 `HIT` 还是 `MISS`？
   - 若带 `?purge=1&key=你的REVALIDATE_SECRET` 访问该页面后变成最新内容，说明是 `caches.default` 或 Cloudflare Zone CDN 未失效；
   - 若绕过 HTML 缓存（例如在本地开发环境或带 `?preview=1`）看到的仍然是旧内容，说明是 **KV 里的缓存数据本身是旧的**（即触发了 **P0-1：Sanity `useCdn: true` 写穿脏读**）。
2. **应急恢复**：进入后台 `/admin/cache` 页面，等待 10 秒（待 Sanity CDN 同步完毕后）点击手动刷新缓存。
3. **根治方法**：实施本文档第 2.3 节的 `liveClient` (`useCdn: false`) + `cms:route_revs` 方案。

### 场景 2：后台保存页面或商品时报 `Sanity Mutation Error`
1. **常见原因**：前端组装的 JSON 中，在 Sanity `reference` 对象（`{ _type: 'reference', _ref: '...' }`）里混入了预览用的 `url` 字段，或在根文档混入了非 Schema 定义的临时字段。
2. **核查点**：确认对应 API（`products.ts` / `pages.ts` / `config.ts`）在调用 `client.createOrReplace()` 之前已调用 `sanitizeSanityDocument(rawDoc)`。

### 场景 3：某个 API 或页面突然变慢（响应时间 > 1000ms）
1. **排查步骤 1（看 `Server-Timing` 头）**：
   - 在浏览器 Network 面板选中该慢请求 -> 切换到 **Timing** 标签页底部的 **Server Timing**：
   - `d1` 高：说明 SQL 触发了全表扫描或冷启动建表；
   - `sanity` 高：说明 KV 未命中且穿透到了 Sanity 远端 API；
   - `auth` 高：说明触发了远端 OIDC / M2M 请求。
2. **排查步骤 2（看后台诊断台）**：
   - 进入 `/admin/logs`，筛选 `SLOW_REQUEST` 或按请求头中的 `X-Request-Id` (`cf-ray`) 精确检索，查看 `context_json.spans` 中的详细耗时分解。

### 场景 4：管理后台点击左侧菜单切换页面后，按钮点击无反应
1. **常见原因**：因为后台采用 `appShellRouter.ts` 进行 PJAX 局部替换（只替换 `#shell-main-canvas`），如果页面脚本使用了顶层一次性绑定且未监听 `document.addEventListener('shell:page-load', initFn)`，或者模块级 `let isBound = true` 锁死了旧的已销毁 DOM 引用，二次切回该页面时事件就会失效。
2. **修复规范**：所有 `/admin/*.astro` 页面的 `<script>` 模块必须遵循以下两种模式之一：
   - 在 `initPage()` 内部重新获取当前活跃的 DOM 节点并绑定事件，同时注册 `document.addEventListener('shell:page-load', initPage)`；
   - 或统一将事件委托（Event Delegation）绑定在 `document` 上（判断 `e.target.closest(...)`）。
