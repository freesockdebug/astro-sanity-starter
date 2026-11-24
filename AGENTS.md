# 全局第一性原理架构红线与对抗自演进路由 (`AGENTS.md`)

> **核心技术栈**：Astro v6 SSR (Cloudflare Workers) + Sanity v3 (Read-Only CMS) + D1 / Supabase Postgres (Transactional DB) + Cloudflare KV (`CACHE_KV`) + Tailwind v4 + Nanostores

---

## 一、 架构文档与对抗挑刺脚本按需路由 (On-Demand Context & Audit Routing)

**重要指令**：修改代码或排查问题前，**仅根据当前任务命中的业务域**，调用 `view_file` 读取下方对应的 **1 个** 架构专篇；修改完成后，运行对应领域的对抗挑刺脚本（或 `npm run check` 自动按 `git diff` 路由）：

| 领域编号与涉及模块 | 必读架构专篇 (`docs/`) | 对应对抗挑刺脚本 (`scripts/audits/`) | 关联运行时对抗单测 |
| :--- | :--- | :--- | :--- |
| **01. 边缘缓存、中间件预热、KV 失效、TTFB** | `/docs/01-edge-cache.md` | `01-edge-cache.audit.ts` (`CACHE-ADV-*`) | `test/waf.test.ts` |
| **02. 数据库 SQL、双引擎、登录鉴权、RBAC** | `/docs/02-db-auth-rbac.md` | `02-db-auth-rbac.audit.ts` (`DB-ADV-*`) | `test/waf.test.ts`, `test/security.test.ts` |
| **03. Sanity CMS、后台编辑器、i18n、SEO、图片代理** | `/docs/03-cms-i18n-seo.md` | `03-cms-i18n-seo.audit.ts` (`CMS-ADV-*`) | `test/cms-i18n-seo.test.ts`, `test/security.test.ts` |
| **04. 前台 UI/主题、懒加载、View Transitions、PJAX 壳** | `/docs/04-storefront-and-shells.md` | `04-storefront-and-shells.audit.ts` (`UI-ADV-*`) | `test/adminWorkbench.test.ts` |
| **05. 边缘 WAF、询盘 (RFQ)、物流/等级、Workers 运行时** | `/docs/05-waf-rfq-and-ops.md` | `05-waf-rfq-and-ops.audit.ts` (`OPS-ADV-*`) | `test/waf.test.ts`, `test/security.test.ts` |

---

## 二、 全局第一性原理硬性红线 (Global Invariants)

1. **读写分离与缓存收敛 (CQRS)**：
   - **只读内容层 (Sanity)**：严禁向 CMS 反向写入动态业务状态；读取必须走 `EdgeTieredCache` / `createKeyedCache`（L1 内存 -> L0 `caches.default` -> L2 KV -> L3 Sanity）；日常读 `cdnClient`，主动刷新 (`forceRefresh`) 强制走 `liveClient` (`useCdn: false`)。
   - **事务交易层 (D1 / Postgres)**：询盘、用户、RBAC、WAF、字典统一走 `src/db/*.repo.ts`（严禁 `JOIN ON` 跨列 `OR` 与双参数 `MAX(a,b)`，时间过滤统一用 `formatUtcCutoff`），写操作必须联动 `.refresh()` / `.invalidate()` 对应缓存分区。
2. **边缘 Serverless 运行时约束**：
   - 严禁依赖 Node.js 磁盘 (`fs`/`path`)，严禁在模块顶层全局作用域（`braceDepth === 0`）调用 `crypto.randomUUID()`、`Date.now()` 或发起网络 I/O。
   - 环境变量统一通过 `import { env } from 'cloudflare:workers'` 获取，**严禁**使用已废弃的 `context.locals.runtime.env`。
3. **外部不可靠假定与异步解耦**：
   - 所有跨网络 `fetch`（Resend 邮件、IM Webhook、Logto、Sanity、Cloudflare API）必须挂载 `AbortSignal.timeout(6000)` 并优雅降级，严禁拖死 Worker 导致 504。
   - 非阻塞通知、审计/错误日志落库、缓存异步回填与路由预热统一通过 `ctx.waitUntil` / `runInBackground` 派发。
4. **最小特权数据契约与防序列化雪崩**：
   - 列表与聚合卡片只允许拉取最小字段投影（`PRODUCT_CARD_FIELDS`，仅 `mainImage` 与 `specifications[0..1]`），严禁拉取全量 `gallery[]`。
   - 服务端向客户端注入大数据集必须使用 `<script type="application/json">` 原生隔离，严禁 JS 字符串拼接转义。
5. **零 CLS 物理骨架与状态单一真理**：
   - SSR 首字节必须输出真实物理尺寸骨架；任何懒加载图片 `.complete` 判断必须在同条件块内校验 `img.complete && img.naturalWidth > 0 && !img.dataset.src`。
   - 客户端易变业务状态存放在 Nanostores；后台与买手中心采用 `appShellRouter.ts` (PJAX)，子页面脚本必须监听 `shell:page-load` 或使用 `document` 事件委托。
6. **前端与 Sanity Studio 全栈强联动**：
   - 任何 CMS 字段、Section 积木或 GROQ 投影变更，**必须同步修改 `src/`（TypeScript 类型、GROQ 查询、归一化逻辑、`adminPageSchemas.ts`、前端组件）与 `studio/`（Schema 定义、`preview.prepare`）**，严禁单边修改。
7. **对抗性历史挑刺与架构文档自演进闭环 (Adversarial Self-Evolving Gate)**：
   - **禁止口头空谈，强制工具门禁**：无需在回复开头输出口头自检套话；每次修改完成后必须执行 `npm run check`（`scripts/check-preflight.ts` 会自动根据 `git diff` 路由至对应领域的挑刺脚本 + `check:cf` + 领域单测）。
   - **故障沉淀与文档双向同步**：每当修复新类型的线上/测试 Bug 或完成架构调整：
     1. 若属**静态边界/架构反模式**，必须在对应的 `scripts/audits/0X-*.audit.ts` 中新增对抗性挑刺规则（拒绝泛泛检查，专抓边界必炸点）；若属**运行时状态/并发边界**，必须在 `test/*.test.ts` 中新增对抗性单测；
     2. **强制更新架构文档**：新增或修改任何 `*-ADV-*` 挑刺规则后，必须同步将该规则 ID、历史故障根因与定位方案登记至对应的 `/docs/0X-*.md`「历史故障与对抗挑刺规则索引」章节（`check-preflight.ts` 内置 `DOC-SYNC-GUARD`，漏更文档将直接阻断通过）。
8. **只增不擅删与无损迁移确认红线 (Zero Unauthorized Deletion & Lossless Migration Invariant)**：
   - 修改、拆分或重构任何架构文档 (`AGENTS.md`, `tech.md`, `docs/*.md`)、历史巡检脚本 (`scripts/check-preflight.ts`, `scripts/audits/*.ts`) 或测试用例 (`test/*.test.ts`) 时，**必须严格遵循“只增不擅删、可无损迁移但严禁直接丢弃内容”原则，严禁擅自删除任何既有文档章节、表格、历史 Pitfall 巡检项或单测断言**。
   - 若需将旧文档或脚本拆分迁移至新目录，必须先将 100% 原文细节无损迁移至目标文档，并向用户列出「拟迁移/清理项、原有作用、原因及新承载位置」获得明确确认后，方可清理旧入口文件。
