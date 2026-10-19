# 项目架构护栏与防踩坑自检规范 (AGENTS.md)

> **适用范围**：Gwenvenni 官方外贸独立站 (`gwenvenniWeb`)  
> **核心栈体系**：Astro (SSR Server Mode) + Sanity CMS v3 + Cloudflare Pages/Workers + Cloudflare D1 + Tailwind CSS v4 + DaisyUI + Nanostores  
> **适用对象**：所有参与本项目代码迭代的 AI 编码助手与研发工程师。本规范为最高工程准则，修改代码前必须强制自检。

---

## 1. 【绝对架构与版本红线 (Tech Stack & Constraints)】

本项目是一套运行在 **Cloudflare Workers 边缘 Serverless 运行时** 上的高性能国际外贸网站。严禁凭记忆套用传统 Node.js 或老旧框架的语法。

### 1.1 依赖版本与特性锁定
- **Astro 5.x / 7.x 核心模式**：
  - 项目配置 `output: 'server'`，全部页面与 API 默认由 Cloudflare Worker 在边缘实时渲染，**禁止使用 `Astro.glob` 等静态构建期专属 API**。
  - 会话管理已集成 Cloudflare KV（绑定名 `"SESSION"`）。
- **Tailwind CSS v4 绝对红线**：
  - **严禁创建 `tailwind.config.js` 或 `tailwind.config.mjs`**！本项目采用 Tailwind CSS v4 纯 CSS 引擎（`@tailwindcss/vite`）。
  - 所有全局主题、字体变量和 DaisyUI 插件均在 [src/styles/globals.css](file:///home/haisome/antigravityWork/gwenvenniWeb/src/styles/globals.css) 中声明（`@import 'tailwindcss'; @plugin "daisyui";`）。
- **Cloudflare Workers 运行时隔离**：
  - 没有 Node.js 常驻事件循环，**严禁引入 `fs`, `path`, `child_process`, `net` 等 Node 原生模块**。
  - 所有网络请求必须使用标准 Web Fetch API。
- **组件目录必须保持单层扁平化**：
  - 所有前台展示组件直接平铺在 [src/components/](file:///home/haisome/antigravityWork/gwenvenniWeb/src/components/) 根目录下，由 `src/components/index.ts` 集中管理导出。
  - **严禁再套娃创建 `src/components/site/`、`src/components/widgets/` 等空头目录**。

### 1.2 AI 极易产生的“旧版本幻觉”清单
| 幻觉特征 (❌ 严禁出现) | 本项目标准规范 (✅ 必须遵守) | 产生原因说明 |
| :--- | :--- | :--- |
| 生成 `tailwind.config.js` | 仅在 `globals.css` 中用 `@theme` 声明 | Tailwind v4 已彻底废弃 JS 配置文件 |
| 在 Astro `<script>` 标签内写 `as any` | 纯原生 JS 语法，或抽离为独立 `.ts` 模块 | `<script define:vars>` 输出给浏览器解析，TS 语法会导致语法崩溃 |
| 在 Worker 中调用 `process.cwd()` 或 `fs.readFileSync` | 动态数据走 Sanity/D1，静态资源走标准 import | Cloudflare Worker 边缘沙箱没有物理文件系统 |
| 以为加了 `s-maxage` 头 Worker HTML 就会自动缓存 | 必须通过 `caches.default` (Cloudflare Cache API) 显式接管 | Cloudflare 默认不对 Worker SSR 输出的动态 HTML 进行边缘 CDN 缓存 |
| 从 `@sanity/client` 每次独立建立连接 | 必须复用 `@utils/sanity-client.ts` 导出的单例 client | 避免多次初始化与鉴权开销 |

---

## 2. 【历史踩坑与修复档案 (Pitfalls & Post-Mortem)】

### 坑 1：Astro `<script define:vars>` 注入 TypeScript 语法导致全站交互瘫痪
- **现象**：浏览器控制台报 `Uncaught SyntaxError: Unexpected identifier 'any'`，导致商品大厅触底无限滚动失效、分类筛选失效、加入询盘抽屉无响应。
- **原因**：`<script define:vars={{...}}>` 是直接把内容原样作为原生 JS 注入到 HTML 的，浏览器内核不识别 TypeScript 类型断言 `as any`。
- ❌ **DON'T**：
  ```astro
  <script define:vars={{ cardQuoteText }}>
    (quoteBtn as any).dataset.bound = 'true';
    (window as any).openQuoteDrawer();
    (matchBtn as any).click();
  </script>
  ```
- ✅ **DO**：
  ```astro
  <script define:vars={{ cardQuoteText }}>
    quoteBtn.dataset.bound = 'true';
    if (typeof window !== 'undefined' && window.openQuoteDrawer) {
      window.openQuoteDrawer();
    }
    if (matchBtn) matchBtn.click();
  </script>
  ```

---

### 坑 2：列表容器客户端渲染把 Footer 暴力下推，触发 CLS = 0.321 爆表
- **现象**：Google Core Web Vitals 诊断中，`/products` 页面的 CLS 高达 0.321（严重超标），发生位移的 DOM 是 `footer`。
- **原因**：服务端 SSR 输出时 `<div id="products-grid"></div>` 内部完全是空的（高度为 0），Footer 贴在最上方。客户端 JS 加载后一瞬间塞入 21 个卡片，把 Footer 瞬间下推 2000px。
- ❌ **DON'T**：
  ```astro
  <!-- 服务端输出空壳，完全等客户端 JS 异步 innerHTML 插入 -->
  <div id="products-grid"></div>
  ```
- ✅ **DO**：
  ```astro
  <!-- 服务端 SSR 直接预渲染首批 21 个卡片，网格在第 0 毫秒即撑开真实物理高度 -->
  <div id="products-grid" class="min-h-[50vh] ...">
    {initialProducts.map((item) => (
      <div class="product-card">...</div>
    ))}
  </div>
  ```
  客户端 `initFromUrl()` 首次加载时**严禁执行 `grid.innerHTML = ''`**，而是直接复用已有 SSR DOM 仅绑定事件，零重排零位移。

---

### 坑 3：Cloudflare Worker 动态 SSR 跨洋回源，导致海外 TTFB 高达 2.5 秒
- **现象**：LCP 诊断中 TTFB 占了总耗时的 73%（2,523 ms）。Worker 每次请求都要连接 Sanity 数据库，无边缘缓存。
- **原因**：Cloudflare 默认不对 Worker 动态响应的 HTML 进行边缘缓存。
- ❌ **DON'T**：
  单纯以为在页面头部写这行代码就能解决缓存：
  ```astro
  Astro.response.headers.set('Cache-Control', 's-maxage=86400');
  ```
- ✅ **DO**：
  在 [src/middleware.ts](file:///home/haisome/antigravityWork/gwenvenniWeb/src/middleware.ts) 中通过 `caches.default` 原生 Cache API 显式拦截并缓存成功的 GET HTML 响应：
  ```ts
  const cache = typeof caches !== 'undefined' ? (caches as any).default : null;
  if (cache) {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      cachedResponse.headers.set('X-Edge-Cache', 'HIT');
      return cachedResponse;
    }
  }
  // 未命中时渲染，并通过 ctx.waitUntil 异步写缓存，TTFB 降至 20ms
  ```

---

### 坑 4：新建中间件后 Vite 未更新虚拟模块依赖导致开发服务器卡死
- **现象**：`Error: The file does not exist at ...astro_virtual-modules_middleware__js.js`，本地 `http://192.168.33.28:4321/` 完全拒绝连接。
- **原因**：Vite 依赖预构建机制在热重载新建的 `middleware.ts` 时找不到对应的预编译缓存文件。
- ❌ **DON'T**：盲目多次修改代码或仅刷新浏览器。
- ✅ **DO**：
  ```bash
  # 必须清除 Vite 缓存并重启开发服务器
  rm -rf node_modules/.vite
  npm run dev
  ```

---

### 坑 5：组件深层套娃导致相对引用路径脆弱断裂
- **现象**：在移动或拆分组件时，`import ... from '../../stores/quoteCart'` 频繁抛出 `Module not found`。
- **原因**：使用了脆弱的多层相对路径，且目录结构存在不必要的 `site/` 嵌套。
- ❌ **DON'T**：
  ```ts
  import { addToQuote } from '../../stores/quoteCart';
  import { AppleNav } from '@components/site';
  ```
- ✅ **DO**：
  在 `tsconfig.json` 配置根路径别名，全站一律使用别名：
  ```ts
  import { addToQuote } from '@stores/quoteCart';
  import { AppleNav } from '@components';
  ```

---

### 坑 6：Astro `define:vars` 序列化大数组引发双重反斜杠转义膨胀 (357 KB)
- **现象**：查看 HTML 源码发现 `<script define:vars={{ serializedProducts }}>` 块体积超过 350KB，充斥着无数的 `\"` 和 `\\`。
- **原因**：Astro 对 `define:vars` 传入的 JSON 字符串做了一次 JS 字符串字面量转义，导致字符体积成倍膨胀。
- ❌ **DON'T**：
  ```astro
  <script define:vars={{ serializedProducts: JSON.stringify(largeArray) }}>
    const data = JSON.parse(serializedProducts);
  </script>
  ```
- ✅ **DO**：
  使用标准 `<script type="application/json">` 存放原生 JSON，体积直降 80%：
  ```astro
  <script type="application/json" id="catalog-data" set:html={catalogJson}></script>
  <script>
    const el = document.getElementById('catalog-data');
    const data = el ? JSON.parse(el.textContent || '[]') : [];
  </script>
  ```

---

### 坑 7：外链 Google 字体阻塞关键渲染路径（816ms 渲染延迟）
- **现象**：图片 20ms 已下载完成，但浏览器首屏空白等待了 816ms 才绘制。
- **原因**：常规 `<link rel="stylesheet">` 是阻塞渲染的外部资源。
- ❌ **DON'T**：
  ```html
  <link href="https://fonts.googleapis.com/css2?family=Inter..." rel="stylesheet" />
  ```
- ✅ **DO**：
  使用异步媒体查询注入模式，配合本地原生系统字体栈优先：
  ```html
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter..." />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter..." media="print" onload="this.media='all'" />
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter..." /></noscript>
  ```

---

## 3. 【数据边界与安全铁律 (Security & Data Boundaries)】

### 3.1 三大数据源的法定职责分工
```text
┌──────────────────────────────────────────────────────────────┐
│                    Gwenvenni 数据架构职责边界                   │
├───────────────────┬───────────────────┬──────────────────────┤
│ 1. Sanity CMS     │ 2. Cloudflare D1  │ 3. Nanostores / Local│
│ (只读内容 / 表现层)│ (高可靠写 / 交易层)│ (客户端交互状态)      │
├───────────────────┼───────────────────┼──────────────────────┤
│ • 产品图文、标题   │ • 买手提交的询价单 │ • 询价购物车商品列表 │
│ • 首页板块配置     │ • 索样订单流水     │ • 抽屉开关状态       │
│ • 全局导航/页脚设置│ • 客户线索归档     │ • 用户本地筛选记忆   │
│ • WhatsApp与通知配置│ • 邮件发送状态存证 │                      │
└───────────────────┴───────────────────┴──────────────────────┘
```
- **铁律 1**：**严禁将动态交易数据（如询价单提交）反向写入 Sanity**。Sanity 仅作为只读 CMS，所有的动态写操作必须全部存入 Cloudflare D1。
- **铁律 2**：Sanity 查询必须走聚合单次查询（`CONFIG_QUERY_OBJ`），查询结果通过全局 Service（如 `SiteConfigService.seed()`）进行内存缓存，**杜绝单页面发起 5 次独立 API 请求的低效行为**。

### 3.2 环境变量与运行时密钥的严格边界
- **构建时 / 静态环境**：
  - 仅限于 `import.meta.env.PUBLIC_*` 命名的公开变量（如 `PUBLIC_SANITY_STUDIO_PROJECT_ID`、`PUBLIC_TURNSTILE_SITE_KEY`）。
- **Cloudflare Worker 运行时私密变量**：
  - 在 API 路由与中间件中，私密密钥（如 `RESEND_API_KEY`、`TURNSTILE_SECRET_KEY`）**必须严格通过 `context.locals.runtime.env` 获取**，严禁依赖 Node.js 的 `process.env`（在 Cloudflare 生产边缘环境可能为 undefined）。
- **`wrangler.toml` 防覆盖铁律**：
  - 严禁在 `wrangler.toml` 文件中明文填写真实的私密 Key！
  - 线上密钥必须通过 Cloudflare Dashboard 控制台环境变量或 `wrangler secret put <KEY>` 注入，防止代码推送至公开仓库造成泄密。

---

## 4. 【专家级工程编码规范 (Expert Engineering Patterns)】

### 4.1 标准 API 路由范式 (以 `src/pages/api/submit-quote.ts` 为标准)
所有 API 路由必须严格符合以下要求：
1. **显式声明 SSR 模式**：`export const prerender = false;`
2. **人机验证防刷 (Turnstile)**：在处理核心业务前，必须强制校验 Turnstile Token。
3. **外部请求超时控制 (Timeout Guard)**：调用第三方接口（Resend、企业微信/飞书 Webhook）必须配置 `AbortSignal.timeout(6000)`，杜绝因外部网络抖动导致买手端挂起超时。
4. **统一错误降级与响应头**：必须包裹 `try-catch`，返回标准 JSON 结构。

```ts
// 标准 API 模版示例
import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  const env = (locals as any)?.runtime?.env || process.env;

  try {
    const body = await request.json();

    // 1. 严格输入校验
    if (!body?.email || !body?.items?.length) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. 带超时保护的外部调用 (例如 Webhook 推送)
    if (env.NOTIFICATION_WEBHOOK_URL) {
      await fetch(env.NOTIFICATION_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `新询盘: ${body.email}` }),
        signal: AbortSignal.timeout(5000), // 5秒超时熔断
      }).catch((err) => console.warn('[Webhook Warning]', err));
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[API Error]', error);
    return new Response(JSON.stringify({ success: false, error: 'Server internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

### 4.2 GROQ 查询字段裁剪规范
- 任何列表页、卡片流、首页轮播，**绝对禁止拉取详情页专用字段**（如 `gallery[]` 完整图片数组、`pricingTiers`、全部 `specifications`）。
- 列表专用轻量字段统一引入 [src/data/products.ts](file:///home/haisome/antigravityWork/gwenvenniWeb/src/data/products.ts) 导出的 `PRODUCT_CARD_FIELDS`。

---

## 5. 【AI 改代码前的强制自检清单 (Pre-Flight Protocol)】

> **⚠️ 致后续所有 AI 助手**：  
> 在你生成任何代码变更或执行任何工具调用前，你**必须在思考过程（Thinking Process）中逐项核对以下 7 个检查点**。在向用户汇报时，必须附带简明自检结果：

```text
[ ] 1. 依赖与配置检查：是否擅自创建了 tailwind.config.js？(本项目绝对禁止)
[ ] 2. 脚本语法检查：是否在 Astro 的 <script define:vars> 标签中写入了 TS 语法 (如 as any)？(绝对禁止)
[ ] 3. CLS 布局偏移检查：新增的列表或数据流是否有 SSR 初始撑开高度或骨架？是否会导致底部 Footer 产生下推？
[ ] 4. 运行时兼容检查：是否在 API 或 SSR 中调用了 Node.js 独有的模块 (fs, path)？
[ ] 5. 超时保护检查：所有对外的 fetch 调用是否都挂载了 AbortSignal.timeout(x) 防护？
[ ] 6. 路径规范检查：导入组件是否使用了规范别名 (@components, @stores, @data)？是否存在深层 ../../ 相对路径？
[ ] 7. 字段瘦身检查：新增的数据查询是否遵循了最小必要原则？是否把 gallery 等沉重大字段误带入了列表？
```

---
*本文档由 Gwenvenni 研发团队首席架构师制定，实时生效。*
