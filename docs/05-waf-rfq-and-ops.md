# 05. 边缘预编译 WAF、B2B 询盘交易链路、测试体系与线上运维手册 (`docs/05-waf-rfq-and-ops.md`)

> **适用场景**：修改边缘 WAF (`src/utils/waf.ts`, `src/db/waf.repo.ts`, `/admin/waf`)、B2B 询盘提交与通知 (`src/pages/api/submit-quote.ts`, `src/utils/rfqNotify.ts`, `src/utils/webhook.ts`)、客户等级与国际物流 (`src/utils/tier.ts`, `src/utils/shipping.ts`)、诊断日志 (`src/db/logs.repo.ts`, `src/utils/profiler.ts`) 或编写单元测试 (`test/*.test.ts`) 时必读。

---

## 1. 第一性原理推导 (First-Principles Derivation)

1. **安全防线不能成为性能瓶颈或拒绝服务放大器**：
   - WAF 位于每个请求的必经之路上。如果每次请求都在运行时 `new RegExp()`、解析 CIDR 字符串或同步写数据库日志，恶意扫描流量反而会把 Worker CPU 与数据库连接池打满。
   - 因此，WAF 规则必须在进入 L1 缓存时**一次性预编译为二进制位掩码与经 ReDoS 校验的 `RegExp`**（单次评估 `< 0.05 ms`），且同一攻击 IP 的连续拦截必须在内存中静默累加 `hitCount`，通过 `waitUntil` 异步微批合并落库。
2. **交易主链路与外部通知严格解耦**：
   - 买手点击“提交询盘”只关心订单是否落库成功。外部邮件服务（Resend）与企业 IM Webhook（企微/飞书/钉钉/Slack/Discord）属于不可靠外部网络，必须挂载 `AbortSignal.timeout(6000)` 并放入 `ctx.waitUntil` 后台并行派发，主请求落库后立即响应客户端。

---

## 2. 内存预编译边缘 WAF 引擎 (`src/utils/waf.ts` & `src/db/waf.repo.ts`)

### 2.1 L1 预编译规则树 (`CompiledWafRuntime`)
当 `wafRuntimeCache` 加载 `waf_rules` 与 `waf_ip_acl` 进入 L1 内存时，立即执行一次性预编译：
1. **ReDoS 安全正则防线 (`validateRegexSafety`)**：
   - 自动检测并拒绝包含嵌套量词（如 `(a+)+`）或超长表达式的危险正则，不安全正则自动降级为安全的子串字面量匹配，彻底杜绝正则表达式回溯卡死 Worker V8 线程。
2. **IPv4 / IPv6 高速二进制 CIDR 匹配**：
   - IPv4 规则预编译为 32 位无符号整型 (`ipInt` + `maskInt`)，单次匹配仅需 1 次位与运算 (`(clientInt & maskInt) === netInt`)。
   - IPv6 规则预编译为 128 位 `BigInt` (`ipBig` + `maskBig`)，完整支持 IPv6 精确匹配与 CIDR 网段封禁。
3. **防自锁保护 (Anti-Lockout) 与白名单优先**：
   - 管理员当前 IP、本地环回 (`127.0.0.1` / `::1`)、系统静态资源与 `/.well-known/*` 拥有最高豁免权，防止管理员在后台误配规则锁死自己。

### 2.2 分级防御策略与历史旧站 Fast-404
- **历史旧站路径快速消解 (`sys_legacy_cms_paths`)**：
  - 对 `/product-tag/*`、`/product-category/*`、`/wp-content/*` 等历史旧站遗留 URL 直接返回 `404 Not Found`（带 `X-Edge-WAF: FAST-404` 及 `Cache-Control: public, max-age=3600, s-maxage=3600`，交由外层 Cloudflare CDN 直接缓存 1 小时）。
  - **关键设计**：`FAST-404` **不计入恶意攻击 Strike 计数，也不触发自动封禁**，防止正常抓取旧外链的 Googlebot / Bingbot 被误封。
- **OWASP 注入拦截、Bot UA 轮换识别与自动封禁**：
  - 支持双层 URL 解码 (`decodeURIComponent`) 防绕过，扫描 Path、Query 与高危请求头中的 SQLi / XSS / Path Traversal 载荷。
  - 同一 IP 累计违规达到 `auto_ban_threshold`（默认 3 次 Strike）或高频轮换伪造 Bot UA / 持续触发 429 洪泛时，自动写入 24 小时临时黑名单 (`expires_at`)。

### 2.3 防刷屏日志内存折叠与 Advisory Lock 去重 (`src/db/logs.repo.ts`)
- **第一层（L1 内存去重）**：同一已被封禁 IP 在冷却窗口内的重复请求在 Isolate 内存中直接抑制重复落库；影子模式 (`log_only`) 同样具备内存防抖。
- **第二层（数据库原子合并）**：写入 `system_error_logs` 时，在 PostgreSQL 下通过 `pg_advisory_xact_lock` + 复合索引 `idx_error_logs_waf_dedupe_v2 (source, client_ip, error_code, id DESC)` 将连续相同拦截合并至最新一条记录并递增 `hitCount`。
- **WAF 控制台极速加载 (`/admin/waf`)**：
  - 页面与 API 直接从已热 L1 `wafRuntimeCache` 读取规则列表与未过期 IP ACL（无需重查 `waf_rules` / `waf_ip_acl` 表），并通过 `includeOverview: false` 跳过 7 天全表日志聚合，打开耗时从 `1200ms` 降至 `< 180ms`。

---

## 3. B2B 询盘 (RFQ) 交易流水线、买手 CRM 等级与物流追踪

### 3.1 询盘提交原子流水线 (`src/pages/api/submit-quote.ts`)
1. **零信任入参校验 (`validateQuotePayload`)**：严格校验企业邮箱、采购数量、SKU 列表上限与文本长度，非法载荷直接 `400` 阻断。
2. **人机验证与 60s 边缘幂等锁**：
   - 校验 Cloudflare Turnstile 令牌（配置启用时）；
   - 基于 `buyerEmail + items` 计算 SHA-256 指纹写入 `idemp:rfq:<hash>`（60s TTL），防止买手弱网连点产生重复询盘单。
3. **主库原子批处理与 CRM 自动归属 (`db.batch`)**：
   - 自动查询该买手邮箱在 `users` 表中是否已绑定专属跟单员 (`assigned_to`)，若有则新询盘单自动继承该跟单员；
   - 使用 `db.batch([...])` 在单次数据库往返中原子写入 `orders` 主表、`order_items` 明细表并更新 `users` 采购商档案，同时立即失效 `orders:pending_count` 与 `rbac_member_stats` L1 缓存。
4. **异步多通道通知 (`src/utils/rfqNotify.ts` & `src/utils/webhook.ts`)**：
   - 通过 `ctx.waitUntil` 在后台并行发送：
     - **Resend 双路邮件**：向买手发送带专属查询链接的询盘确认函，向跟单员/销售团队发送新询盘提醒；
     - **多平台 IM Webhook**：支持企业微信、钉钉、飞书、Slack、Discord 卡片推送，所有 Webhook URL 均经过 `SecurityService.isSafeWebhookUrl` SSRF 校验（禁止内网 IP / 非 HTTPS），并强制挂载 `AbortSignal.timeout(6000)`。

### 3.2 订单全生命周期状态机、买手等级与国际物流
- **订单状态流转 (`OrderStepper.astro` & `/api/admin/orders/[id]/status`)**：
  - 标准状态机：`pending`（待处理）-> `reviewing`（评估中）-> `quoted`（已报价）-> `sample_sent`（已寄样）-> `production`（大货生产）-> `shipped`（已发货，触发物流通知邮件）-> `completed`（已完成）/ `cancelled`（已取消）。
  - 每次状态变更或指派跟单员均异步写入 `admin_audit_logs` (`audit.repo.ts`)。
- **买手 CRM 自动等级引擎 (`src/utils/tier.ts`)**：
  - 根据买手历史累计有效询盘单数与已发货单数，自动计算并渲染客户等级徽章（`Standard` / `Silver` / `Gold` / `VIP Enterprise`，对应 `TierBadge.astro`）。
- **国际快递单号智能识别与追踪 (`src/utils/shipping.ts`)**：
  - 支持识别 DHL Express、FedEx、UPS、SF Express（顺丰国际）等承运商并自动生成官方物流追踪直达链接。

---

## 4. 本地开发、自动化测试体系与线上排障 Runbook

### 4.1 本地开发与单元测试环境 (`src/shims/cloudflare-workers.ts`)
- **Cloudflare Workers 全局作用域铁律**：
  - **严禁**在模块顶层全局作用域调用 `crypto.randomUUID()`、`Date.now()` 或发起 `fetch()`（Cloudflare Workers 部署启动阶段会直接抛出 `Disallowed operation called within global scope`）。如 `getIsolateId()` 必须在请求处理函数内部惰性初始化。
- **双环境 KV 与运行时机制**：
  - **`npm run dev` (Astro + Wrangler Platform Proxy)**：自动连接本地 `.wrangler/state/v3/kv` 中的 Miniflare SQLite 持久化模拟存储，支持跨热重载保留本地 KV 数据。
  - **`npm test` (Node.js 原生测试运行器 + `tsx`)**：通过 `tsconfig.json` 路径映射加载 `src/shims/cloudflare-workers.ts`，在内存中提供零外部依赖的 `CACHE_KV` (`MemoryKVNamespace`) 与 `waitUntil` 模拟，涵盖 **46 项核心架构与安全回归单测**（`test/waf.test.ts`, `test/security.test.ts`, `test/adminWorkbench.test.ts`, `test/cms-i18n-seo.test.ts`）。
- **代码提交前必跑门禁**：
  ```bash
  npm run check:cf && npm test
  ```

### 4.2 线上常见故障诊断速查表 (Troubleshooting Runbook)

| 现象 / 疑问 | 诊断方法（响应头 / 日志字段） | 根因与架构解释 |
| :--- | :--- | :--- |
| **如何区分“外层 Cloudflare CDN 命中”与“Worker 内部 L0 命中”？** | 看响应头 `cf-cache-status` 与 `X-Edge-Cache` | 1. `cf-cache-status: HIT`：外层 CDN 直接返回，**不唤醒 Worker，不写日志**，耗时 1~5ms。<br>2. `cf-cache-status: DYNAMIC` 且 `X-Edge-Cache: HIT` / `HIT_OPTIMISTIC`：进入 Worker `middleware.ts` 后命中机房共享 `caches.default`，**0 SSR 渲染、0 DB/Sanity 查询**。 |
| **同机房 (`SIN` / `AMS`) 日志里 `isolateId` 变了，为何 `kv: 0ms`？** | 看日志 `context.preload` 或响应头 `X-Preload-Status` | 1. `L0_PRELOAD_HIT`：新冷 Isolate 从本机房 `caches.default` 1ms 读取了前一个 Isolate 写入的 `edge-preload-v1` 信封（0 KV 读取）。<br>2. `OPTIMISTIC_SWR`：公开页面 GET 走乐观快路直接命中无版本 L0 HTML 别名 (`HIT_OPTIMISTIC`)。 |
| **日志表出现 `127.0.0.1` 或 `2a06:98c0:3600::103` 访问 `/`、`/products`？** | 看日志 `UA: Cloudflare-Edge-Warmup/1.0` | 后台执行缓存清理、保存配置或 CMS 同步后，`prewarmEdgeRoutes()` 在后台发起的 Worker 自预热请求，用于提前把最新 HTML 填满 L0 缓存，属正常机制。 |
| **商品卡片图片只显示浅灰底色骨架，不加载图片？** | 检查 `<img>` 是否使用 `data-src` 且同步脚本是否误判 `img.complete` | 无 `src` 属性的 `<img data-src="...">` 在浏览器中 `img.complete` 恒为 `true`（`naturalWidth === 0`）。同步检查脚本必须判断 `img.complete && img.naturalWidth > 0 && !img.dataset.src`。 |
| **管理后台切换左侧菜单后，页面内按钮点击无反应？** | 检查页面 `<script>` 事件绑定方式 | 后台使用 `appShellRouter.ts` 进行 PJAX 局部替换（不重新触发 `DOMContentLoaded`）。页面脚本必须监听 `document.addEventListener('shell:page-load', init)` 或使用 `document` 事件委托。 |


---

## 5. 历史故障与对抗挑刺规则索引 (`scripts/audits/05-waf-rfq-and-ops.audit.ts`)

> 每次在本领域发现新的 Workers 运行时报错、WAF 误封或外部调用超时故障，必须在 `scripts/audits/05-waf-rfq-and-ops.audit.ts` 新增 `OPS-ADV-*` 探针，并在此表中同步登记。

| 规则 / 测试 ID | 挑刺检查目标 | 历史故障根因与防重契约 |
| :--- | :--- | :--- |
| **`OPS-ADV-01`** | 严禁使用 Astro v6 已废弃的 `locals.runtime.env` | 访问 `locals.runtime.env` 在 Astro v6 下直接抛错，必须统一通过 `import { env } from 'cloudflare:workers'` 获取。 |
| **`OPS-ADV-02`** | Workers 模块顶层全局作用域严禁调用 `crypto.randomUUID()` | 模块顶层（`braceDepth === 0`）调用 `crypto.randomUUID()` 会导致 Cloudflare Workers 启动崩溃，必须放入请求期惰性函数内。 |
| **`OPS-ADV-03`** | 外部网络 `fetch` 刚性 6000ms 超时熔断守卫 | 出站通信模块（`rfqNotify.ts`、`webhook.ts`、`sanity-client.ts`、`/cdn-image/*`、`submit-quote.ts`）必须挂载 `AbortSignal.timeout(6000)`。 |
| **`OPS-ADV-04`** | `EdgeWafService` ReDoS 安全正则防线与旧站 `FAST-404` 免 Strike | 自定义正则必须经 `validateRegexSafety` 校验，旧站路径 `/product-tag/*` 必须走 `FAST-404` 免计 Strike 防误封搜索引擎。 |
| **`OPS-ADV-05`** | `package.json` 与 `package-lock.json` 依赖树同步锁挑刺 (防 GitHub Actions `npm ci` `EUSAGE` 崩溃) | 校验 `package.json` 中声明的所有 `dependencies` 与 `devDependencies`（含 `postgres`、`rollup-plugin-visualizer`、`web-vitals`、`tsx`）在 `package-lock.json` 根节点及 `node_modules/*` 中 100% 同步锁定，杜绝推送 GitHub 后 `npm ci` 报错 `Missing from lock file`。 |
| **`05-waf-rfq-and-ops:runtime-consistency-verify`** | 内存级 `PreflightTest.verify()`（ReDoS 灾难回溯正则拦截 + SSRF 内网地址阻断） | 向 `validateRegexSafety` 注入嵌套量词 `(a+)+$` 断言预编译阶段拒绝；向 `SecurityService.isSafeWebhookUrl` 注入云主机元数据内网地址 `169.254.169.254` 断言拦截。 |
