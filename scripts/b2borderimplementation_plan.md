# B2B 询单与正式订单一体化系统方案（方式 B：游客邮箱下单 + 登录自动认领）

将现有的「询价/索样抽屉 (RFQ)」与「B2B 正式采购订单」完全打通为单一提交通道：访客无需提前注册即可凭工作邮箱直接提交订单（进入 Cloudflare D1 `PENDING_APPROVAL` 待审批状态）；查看订单进度与物流则必须通过 Logto Cloud 登录，且用户登录时系统将根据一致的邮箱自动认领并绑定其未登录时期提交的所有历史订单。

### User Review & Critical Decisions

> [!IMPORTANT]
> **已确认的核心产品决策（基于第一阶段澄清结果）**
> - **单一提交通道合并（询单即待审批订单）**：右侧抽屉不再拆分两套表单，所有提交统一作为「待审批订单 (`PENDING_APPROVAL`)」写入 Cloudflare D1 数据库，同时保留原有的 Sanity 备份、Resend 邮件通知与企微/钉钉/飞书 Webhook 实时推送。
> - **无感邮箱自动认领（免验证状态强拦截）**：用户通过 Logto 注册或登录成功后，服务端只要检测到登录邮箱与 D1 中未绑定账号（`user_id IS NULL`）的历史订单 `buyer_email` 一致（忽略大小写），立即自动执行 `UPDATE` 归属绑定，无需强制校验 `email_verified` 标志。
> - **Logto M2M 自动配置 + 管理员邮箱白名单双保险**：支持通过您提供的 Logto M2M 密钥自动调用 Management API 创建 Web 应用、回调地址与 `admin` 角色；同时内置 `ADMIN_EMAILS` 环境变量白名单（默认包含 `forhaisome@gmail.com`），确保管理员权限开箱即用。

---

### 1. Overview & Core Concept

- **核心业务闭环**：
  1. **零门槛获客（下单免登录）**：海外 B2B 买手在浏览袜品或索取色卡时，像原先一样在右侧抽屉填写公司、邮箱、采购款式与数量即可一键提交。系统立即生成正式订单号（如 `ORD-20261031-8F2A`）并存入 D1，状态设为「待审批 (`PENDING_APPROVAL`)」，不因强制注册流失任何询盘转化率。
  2. **强制登录查单与历史自动归集**：未登录买家提交成功后，界面展示订单号并引导“使用该邮箱登录/注册以追踪审批与发货进度”。一旦用户使用相同邮箱完成 Logto 登录，系统在回调握手阶段自动将该邮箱名下所有 `user_id IS NULL` 的历史订单挂载到该用户的唯一 `user_id` 下。
  3. **严格行级数据隔离与管理员履约**：普通买家登录后仅能查询 `user_id = 当前登录用户ID` 的订单；管理员（匹配 Logto `admin` 角色或管理员邮箱白名单）可进入统一管理后台查看全站订单、执行审批通过/驳回、录入承运商（DHL / FedEx / UPS / 海运专线）与运单号完成发货。

---

### 2. User Experience & Visual Design

- **核心交互流程**：
  1. **统一采购/询单抽屉（支持未登录与已登录双态）**：
     - **已登录状态**：打开抽屉时自动回填当前登录用户的邮箱与姓名（邮箱锁定或标记为已关联当前账号），提交后订单直接绑定 `user_id`，并提供直达「我的订单」入口。
     - **未登录状态**：买手直接输入工作邮箱提交，D1 记录 `user_id = NULL` 与标准化小写 `buyer_email`。提交成功卡片除展示成功提示与订单编号外，提供醒目的「使用此邮箱登录以追踪订单状态」按钮。
  2. **弹窗式 OAuth 登录体验（兼容预览环境与生产域名）**：
     - 点击顶部导航栏或抽屉内的「登录 / 我的订单」时，直接拉起 Logto 授权弹窗（兼容 AI Studio 跨域 iframe 预览环境与 `gwenvenni.com` 生产环境），认证完成后通过 `postMessage` 自动刷新导航栏身份状态并完成历史订单认领。
  3. **买手订单中心（客户端视角）**：
     - 展示当前账号名下的所有订单列表（含刚自动认领的历史未登录订单，如刚认领成功可展示轻量提示“已为您自动关联 X 笔历史同邮箱订单”）。
     - 每笔订单清晰呈现：订单号、提交时间、当前状态文本（`待审批` · `已审批待发货` · `已发货` · `已驳回`）、采购明细表格（SKU、款式、规格、双数），以及已发货状态下的承运商名称、物流单号一键复制与管理员备注。
  4. **管理员订单工作台（管理端视角）**：
     - 顶部提供按订单状态（全部 / 待审批 / 已审批 / 已发货 / 已驳回）与客户邮箱/订单号的即时筛选控制栏。
     - 针对 `PENDING_APPROVAL` 订单提供「批准订单」与「驳回」操作；针对待发货订单提供内联发货抽屉/模态框，输入承运商、追踪单号与备注后一键更新为 `SHIPPED` 状态。

- **视觉风格与设计规范**：
  - **延续 Apple Atelier 极简工业美学**：保持现有的 `#f5f5f7` 浅灰画布、`#ffffff` 纯白单层面板、`#1d1d1f` 高对比深灰文字以及 `1px solid rgba(0,0,0,0.06)` 极细分割线。
  - **数字与单号等宽对齐**：所有订单编号、SKU、商品双数（Quantity）、时间戳与物流运单号均采用等宽数字排版（`font-mono tabular-nums`），确保密集表格纵向严格对齐。
  - **语义化无胶囊元数据**：遵循克制的 B2B 视觉层级，订单元数据采用干净的文本分隔符（`·`）呈现，交互式筛选栏采用清晰的Segmented分段按钮。

---

### 3. Key Product Decisions & Trade-Offs

- **决策 1：单一提交通道（完全合并询单与订单） vs. 双通道分流**
  - *选择方案*：将原有的询价提交通道直接升级为「D1 待审批订单入库 + 原有通知链路并行」。
  - *原因*：B2B 定制与批发业务中，客户的“询单”本质就是“意向采购单”。合并为单一通道既避免了买手纠结“该点询价还是点下单”，又让销售团队在后台统一管理所有线索与订单生命周期，同时完整保留 Sanity、Resend 邮件和企微/钉钉通知。
- **决策 2：基于邮箱一致性的登录自动认领（免 `email_verified` 强制拦截）**
  - *选择方案*：在用户完成 Logto 登录以及访问「我的订单」接口时，自动执行 `UPDATE orders SET user_id = ? WHERE user_id IS NULL AND LOWER(buyer_email) = LOWER(?)`。
  - *原因*：最大化降低 B2B 客户首次注册登录后的使用摩擦，无论是先下单后注册，还是未登录多次补单后再登录，都能在进入订单中心的第一时间看到完整订单记录；且一旦某笔订单被认领（`user_id IS NOT NULL`），后续不再重复变更归属。
- **决策 3：Logto M2M 自动初始化 + 环境变量管理员白名单兜底**
  - *选择方案*：提供一键式 Logto M2M 自动配置能力（自动创建 Traditional Web App、配置多环境 Redirect URIs、创建 `admin` 角色），同时在服务端鉴权逻辑中支持 `ADMIN_EMAILS`（默认含 `forhaisome@gmail.com`）与 Logto Role 双重判定。
  - *原因*：即使 Logto 控制台尚未手动给某个账号分配 `admin` 角色，只要匹配管理员白名单邮箱即可直接进入管理员发货工作台，避免繁琐的后台手动授权步骤。

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

#### 系统架构与数据流图

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                        前端交互层 (Astro SSR + Islands)                        │
├──────────────────────────┬──────────────────────────┬──────────────────────────┤
│   统一采购抽屉 (Drawer)   │    买手订单中心 (User)    │   管理员工作台 (Admin)    │
│ • 支持未登录/已登录直接提交│ • 强制要求登录态访问      │ • 校验 Admin 角色/白名单  │
│ • 未登录引导同邮箱登录查单 │ • 展示个人归属订单与物流  │ • 审批订单 + 录入物流发货 │
└────────────┬─────────────┴────────────┬─────────────┴────────────┬─────────────┘
             │                          │                          │
             ▼                          ▼                          ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                    Cloudflare Worker 边缘服务端与鉴权中间件                     │
├──────────────────────────┬──────────────────────────┬──────────────────────────┤
│  统一提交网关 (Submit)    │   Logto OIDC & 认领引擎  │   订单管理与履约网关      │
│ • Turnstile 人机校验      │ • 弹窗授权与令牌交换      │ • 客户查询强制绑定 user_id│
│ • 写入 D1 (待审批状态)    │ • 登录瞬间按邮箱自动执行  │ • 管理员支持跨用户筛选    │
│ • 并行触发邮件/企微/Sanity │   未认领订单归属 UPDATE   │ • 状态流转与运单号持久化  │
└────────────┬─────────────┴────────────┬─────────────┴────────────┬─────────────┘
             │                          │                          │
             └──────────────────────────┼──────────────────────────┘
                                        ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                       Cloudflare D1 关系型数据库 (SQLite)                       │
├───────────────────────────────────────┬────────────────────────────────────────┤
│            orders 主表                │            order_items 明细表           │
│ • id / order_no (唯一业务单号)         │ • id / order_id (外键关联 orders.id)   │
│ • user_id (未登录为 NULL，登录后回填)  │ • product_id / sku / title             │
│ • buyer_email (小写索引，用于自动认领) │ • variant / quantity / moq_note        │
│ • status (PENDING_APPROVAL/APPROVED/  │                                        │
│   SHIPPED/REJECTED)                   │                                        │
│ • carrier / tracking_number / 备注时间 │                                        │
└───────────────────────────────────────┴────────────────────────────────────────┘
```

#### 核心数据模型与状态流转设计

1. **Cloudflare D1 数据库表结构**：
   - **`orders` 表**：
     - `id` (TEXT PRIMARY KEY)
     - `order_no` (TEXT UNIQUE NOT NULL)：可读业务单号，如 `ORD-20261031-XXXX`
     - `user_id` (TEXT NULLABLE)：Logto 用户唯一标识（`sub`）。未登录提交时为 `NULL`，登录后自动回填
     - `buyer_email` (TEXT NOT NULL)：始终以 `LOWER(TRIM(email))` 归一化存储，建立索引 `idx_orders_unclaimed_email(buyer_email, user_id)` 供毫秒级认领查询
     - `company_name`, `contact_name`, `whatsapp`, `destination_country`, `customer_notes`, `inquiry_type`
     - `total_Styles` (INTEGER), `total_quantity` (INTEGER)
     - `status` (TEXT NOT NULL DEFAULT `'PENDING_APPROVAL'`)：枚举值 `PENDING_APPROVAL`（待审批）、`APPROVED`（已审批待发货）、`SHIPPED`（已发货）、`REJECTED`（已驳回）
     - `carrier` (TEXT), `tracking_number` (TEXT), `admin_remark` (TEXT)
     - `claimed_at`, `approved_at`, `shipped_at`, `shipped_by`, `created_at`, `updated_at`
   - **`order_items` 表**：
     - `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
     - `order_id` (TEXT NOT NULL, FOREIGN KEY)
     - `product_id`, `sku`, `title`, `variant`, `quantity`, `image_url`

2. **历史未登录订单自动认领机制（Idempotent Claiming）**：
   - **触发时机**：在 Logto 登录回调成功（建立加密会话 Cookie 时）以及已登录用户请求个人订单列表时执行：
     ```sql
     UPDATE orders
     SET user_id = ?1,
         claimed_at = datetime('now'),
         updated_at = datetime('now')
     WHERE user_id IS NULL
       AND LOWER(buyer_email) = LOWER(?2);
     ```
   - **防篡改保护**：条件严格限定 `WHERE user_id IS NULL`，确保只有未绑定账号的游客订单会被认领；已被认领的订单永久归属于对应 `user_id`。

3. **安全隔离与权限边界**：
   - **买手端隔离**：未登录访问订单中心或订单接口直接返回 `401 Unauthorized` 并引导登录；已登录买手的所有查询均在服务端硬编码拼接 `WHERE user_id = context.locals.user.id`，前端无法通过传入邮箱或他人单号越权读取。
   - **管理端鉴权**：管理员接口严格校验 `context.locals.user.isAdmin === true`（由 Logto ID/Access Token 中的 `roles` 包含 `admin`，或用户邮箱存在于服务端 `ADMIN_EMAILS` 白名单共同决定）。

4. **Logto M2M 自动初始化流程**：
   - 当提供 `LOGTO_ENDPOINT`、`LOGTO_M2M_APP_ID`、`LOGTO_M2M_APP_SECRET` 时，通过专用自动化配置器向 `${LOGTO_ENDPOINT}/oidc/token` 获取 Management API 令牌，自动完成：
     1. 检查或创建 GwenVenni B2B Web 应用，自动注册开发预览环境（`.run.app`）、本地调试与生产域名（`https://gwenvenni.com`）的回调地址 `/api/auth/callback`。
     2. 检查或创建 `admin` 角色，并将管理员邮箱账号自动关联至该角色。
     3. 输出或直接注入运行所需的 `LOGTO_APP_ID` 与 `LOGTO_APP_SECRET`。
