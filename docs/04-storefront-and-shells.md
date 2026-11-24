# 04. 前台多主题几何系统、视口懒加载与双端 AppShell (PJAX) 工作台架构 (`docs/04-storefront-and-shells.md`)

> **适用场景**：修改前台页面与组件 (`src/components/*.astro`, `src/pages/products/*`)、多主题样式 (`src/config/storefrontThemes.ts`, `src/styles/*`)、视口懒加载 (`src/utils/useIntersectionShimmer.ts`)、询盘车 (`src/stores/quoteCart.ts`) 或管理后台/买手中心 PJAX 壳 (`src/utils/appShellRouter.ts`, `src/utils/adminWorkbench.ts`, `src/hooks/useTableSettings.ts`) 时必读。

---

## 1. 第一性原理推导 (First-Principles Derivation)

1. **第 0 毫秒物理几何确立 (Zero-CLS Physical Skeleton)**：
   - 浏览器布局偏移 (CLS) 与视觉跳动的根源是“服务端未输出确定尺寸容器，客户端异步塞入内容撑开文档流”。
   - 因此，SSR 首字节必须输出与最终态 **1:1 几何等高** 的骨架（移动端 `aspect-square`、桌面端 `lg:h-[calc(100svh-var(--apple-header-offset))]` 自适应视口货架），客户端 JS 仅负责属性激活与事件绑定。
2. **离屏 GPU 图层与网络带宽节流 (Viewport-Driven Hydration)**：
   - 同时为几十张商品卡片运行 CSS Shimmer 流光动画并并发拉取大图，会造成严重的主线程解码卡顿并抢占首屏 LCP 带宽。
   - 必须通过共享 `IntersectionObserver` 单例池：仅当元素进入视口外扩 `160px` 缓冲区时才激活流光并水合 `data-src` / `data-srcset`；一旦加载完成或滑出视口立即卸载动画类名。
3. **持久化 AppShell 替代整页刷新 (Persistent Shell & DOM Snapshot)**：
   - 管理后台 (`/admin/*`) 与买手中心 (`/orders`, `/account`) 的左侧导航栏、顶部工具栏和命令面板在跨页切换时完全不变。采用轻量级 PJAX (`appShellRouter.ts`) 仅请求并替换 `#shell-main-canvas` 画布，配合 65ms Hover 预取与 5 分钟 DOM 快照缓存，可在无 React/Vue 运行时负担下实现 0ms 桌面级秒切体验。

---

## 2. 前台多主题引擎与物理几何系统

### 2.1 四套动态视觉主题 (`src/config/storefrontThemes.ts` & `ThemeProvider.astro`)
- **支持主题**：
  1. `apple-minimal`（默认：苹果极简纯白高对比工业风）
  2. `luxury-editorial`（高定画报风：衬线标题、自动隐藏卡片上的工业针数 `gauge` 标签以保持视觉留白）
  3. `atelier-warm`（暖调工坊风：羊绒米白暖色基底）
  4. `industrial-tech`（精密制造风：高密度技术参数展示）
- **SSR 零闪烁解析 (`resolveThemeContext` & `useStorefrontTheme`)**：
  - 在 SSR 阶段读取 `SiteConfig` 或 URL 预览参数，将解析结果缓存在 `Astro.locals.__themeContext` 中，直接在 `<html>` / `<body>` 根节点注入 `data-storefront-theme` 属性与按需主题 CSS，彻底杜绝客户端主题切换闪烁 (FOUC)。

### 2.2 View Transitions 导航栏零闪烁固定 (`src/styles/globals.css`)
- 顶部导航栏 `header.apple-nav` (`view-transition-name: site-header`) 与面包屑 `nav.breadcrumbs-bar` (`view-transition-name: site-breadcrumbs`) 拥有独立合成层：
  - 强制声明 `::view-transition-group(site-header)` / `::view-transition-old` / `::view-transition-new` 的 `z-index: 100; animation: none; mix-blend-mode: normal`。
  - 跨商品详情页切换时，顶部导航栏与面包屑如原生桌面应用般固定不动，无任何交叉淡入淡出残影。

### 2.3 动态底部几何基准线 (`--apple-dock-bottom`) 与流体右侧避让 (`src/utils/device.ts`)
- **统一底部数学基准线**：
  - `globals.css` 定义 `--apple-dock-bottom: max(1.25rem, env(safe-area-inset-bottom, 0px))`。
  - 当移动端商品详情页底部粘性询盘栏 (`#pdp-mobile-sticky-bar.translate-y-0`) 滑出时，通过 CSS `:has()` 选择器自动将 `--apple-dock-bottom` 抬升 `+ 4rem`。
  - 右下角 WhatsApp 悬浮球 (`bottom: var(--apple-dock-bottom)`) 与返回顶部按钮 (`bottom: calc(var(--apple-dock-bottom) + 3.75rem)`) 共享该变量，实现零 JS 介入的自动联动避让。
- **桌面端右侧悬浮区流体对齐 (`src/utils/device.ts`)**：
  - 仅当视口右侧剩余留白 `>= 28px` 时才对称收拢悬浮控件边距，防止窄桌面窗口下右下角悬浮按钮遮挡商品卡片操作按钮。

---

## 3. 视口懒加载与渐进式流光骨架 (`src/utils/useIntersectionShimmer.ts`)

### 3.1 共享观察器池与按需水合 (`hydrateLazyImage`)
- **配置复用池 (`observerPool`)**：按 `rootMargin|threshold|activeClass|loadedClass` 复用全局 `IntersectionObserver` 实例，避免每张商品卡片重复创建观察器。
- **首屏直出 vs 首屏外懒加载契约**：
  - 首屏关键图片（如 Hero 主图、`/products` 目录页前 8 张 `idx < 8`）直接渲染 `src` 与 `srcset`，并设置 `loading="eager"`。
  - 首屏外或横向轮播架卡片（`/products` 中 `idx >= 8`、首页 `#collections` 商品卡片）仅渲染 `data-src` 与 `data-srcset`，进入视口前 `160px` 时由 `hydrateLazyImage(el)` 将 `dataset.src` / `dataset.srcset` 赋给 `img.src` / `img.srcset` 并删除 `data-*` 属性。

### 3.2 血泪红线：`HTMLImageElement.complete` 空 `src` 陷阱
- **HTML 标准规范行为**：当 `<img>` 标签同时省略 `src` 和 `srcset` 属性（仅挂载 `data-src` / `data-srcset`）时，浏览器中 **`img.complete` 恒等于 `true`**（此时 `img.naturalWidth === 0`）。
- **硬性编码规范**：
  - 任何检查图片是否已从缓存加载完成的同步脚本（如 `syncShelfLoadedImages`、`hydrateCompletedImages`），**严禁只写 `if (img.complete)`**！
  - **必须同时校验**：`if (img.complete && img.naturalWidth > 0 && !img.dataset.src && !img.dataset.srcset && img.parentElement)`；且 `useIntersectionShimmer.ts` 在注册和 `IntersectionObserver` 回调中均通过 `hasPendingLazySrc(img)`（校验 `dataset.src || dataset.srcset`）自动剥离提前误标的 `apple-img-loaded` 类名，杜绝懒加载容器被跳过观察。

---

## 4. 前台询盘车与客户端状态机 (`src/stores/quoteCart.ts` & `src/stores/uiStore.ts`)

- **状态单一真理 (Nanostores)**：
  - 买手询盘篮状态统一收敛在 `quoteCart.ts`（持久化至 `localStorage`，支持跨标签页 `storage` 事件实时同步）。
  - `QuoteDrawer.astro` 与导航栏角标仅作为 Nanostores 状态的响应式视图映射，严禁在 DOM 节点中私存非受控购物车计数。
- **大数据注入隔离**：
  - `/products` 目录页用于客户端即时筛选/排序的完整商品卡片数据集，统一通过 `<script id="catalog-products-data" type="application/json">` 注入并由 `JSON.parse` 读取，严禁拼接进内联 JS 字符串。

---

## 5. 双端 AppShell (PJAX) 与企业级表格工作台 (`appShellRouter.ts` & `adminWorkbench.ts`)

### 5.1 持久化 AppShell 路由引擎 (`src/utils/appShellRouter.ts`)
同时服务于 **管理后台 (`scope: 'admin'`, `AdminLayout.astro`)** 与 **买手中心 (`scope: 'buyer'`, `BuyerLayout.astro`)**：
1. **局部画布协议 (`X-Shell-Request: 1`)**：
   - 客户端点击菜单或发起 `window.__shellNavigate(url)` 时，请求头携带 `X-Shell-Request: 1`。
   - 服务端 `AdminLayout.astro` / `BuyerLayout.astro` 检测到 `isShellReq` 时，跳过侧边栏与外框渲染，仅返回 `#shell-main-canvas` 与 `#shell-overlays` 内部 HTML，传输体积缩减 75%。
2. **65ms Hover 预取 + 5 分钟 DOM 快照缓存**：
   - 鼠标悬停菜单项满 `65ms` 自动触发后台预取（`PREFETCH_TTL_MS = 20s`，弱网/省流模式自动跳过）。
   - 切换页面前将当前画布 HTML、弹窗容器与滚动条位置存入 `snapshotCache`（上限 10 页，TTL 5 分钟）；后退或再次切回时 0ms 先渲染快照，同时后台静默校验更新。
   - **写操作自动失效**：全局拦截 `window.fetch`，只要检测到任何非 GET 的写操作（`POST` / `PUT` / `PATCH` / `DELETE`）成功返回，**立即清空 `prefetchCache` 与 `snapshotCache`**，100% 保障 Read-Your-Writes。
3. **页面脚本生命周期红线 (`shell:page-load`)**：
   - 在 PJAX 局部替换模式下，`DOMContentLoaded` 仅在首次整页加载时触发一次。
   - 所有 `/admin/*.astro`、`/orders/*`、`/account.astro` 中的客户端脚本，**必须将初始化逻辑绑定到 `document.addEventListener('shell:page-load', initPage)`**，或使用挂载在 `document` 上的事件委托 (`e.target.closest(...)`)，并在绑定前通过 `dataset.bound = '1'` 防止重复挂载监听器。

### 5.2 统一表格工作台与列配置持久化 (`adminWorkbench.ts` & `useTableSettings.ts`)
- **工作台标准组件簇**：`AdminPageToolbar.astro` + `AdminWorkbenchTableShell.astro` + `TableColumnController.astro` + `TableFilter.astro`。
- **列显隐/顺序/列宽持久化 (`useTableSettings.ts` & `/api/admin/table-settings`)**：
  - 每个管理员在各业务表（`orders`、`users`、`members`、`waf`、`logs`、`logins`）的列偏好保存在 `system_settings` 表的 `table_pref:<userKey>:<tableId>` 键下（SSR 首屏直出零抖动，客户端拖拽列宽或勾选列后防抖异步保存）。
  - `system_settings` 全局 L1/L2 缓存在读取时通过 `WHERE key NOT LIKE 'table_pref:%'` 显式隔离个人表格偏好，防止个人 UI 设置污染全局系统配置缓存。


---

## 6. 历史故障与对抗挑刺规则索引 (`scripts/audits/04-storefront-and-shells.audit.ts`)

> 每次在本领域发现新的懒加载失效、PJAX 事件断联或布局偏移故障，必须在 `scripts/audits/04-storefront-and-shells.audit.ts` 新增 `UI-ADV-*` 探针，并在此表中同步登记。

| 规则 / 测试 ID | 挑刺检查目标 | 历史故障根因与防重契约 |
| :--- | :--- | :--- |
| **`UI-ADV-01`** | `HTMLImageElement.complete` 空 `src` 懒加载误判陷阱 (`#collections` 商品图空白故障) | 无 `src` 的 `<img data-src="...">` 在浏览器中 `img.complete` 恒为 `true`（`naturalWidth === 0`）。所有 `.complete` 判断必须同时校验 `naturalWidth > 0`，且 `useIntersectionShimmer.ts` 必须通过 `hasPendingLazySrc` 校验 `dataset.src \|\| dataset.srcset`。 |
| **`UI-ADV-02`** | AppShell (PJAX) 子页面脚本严禁仅依赖 `DOMContentLoaded` | `/admin/*`、`/orders/*`、`/account` 采用 PJAX 局部替换画布，切页不触发 `DOMContentLoaded`，必须监听 `shell:page-load` 或使用 `document` 事件委托。 |
| **`UI-ADV-03`** | View Transitions 顶部导航锁定与 `--apple-dock-bottom` 几何基准线 | `globals.css` 必须保留 `site-header` 的 View Transition 零闪烁锁定与 `--apple-dock-bottom` 底部动态避让变量。 |
| **`UI-ADV-04`** | AppShell (PJAX) 写操作自动清空快照缓存 (`prefetchCache` / `snapshotCache`) | `appShellRouter.ts` 拦截到非 GET 写请求成功后必须立即调用 `prefetchCache.clear()` 与 `snapshotCache.clear()`，保障后台写后即读一致性。 |
| **`04-storefront-and-shells:runtime-consistency-verify`** | 内存级 `PreflightTest.verify()`（空 `src` 懒加载容器自愈故障注入） | 在内存中构造 `complete: true, naturalWidth: 0, dataset.src: '...'` 且被预置 `apple-img-loaded` 的虚拟 DOM 容器注入 `useIntersectionShimmer`，断言自动剥离误标类名并挂载 `IntersectionObserver`。 |
