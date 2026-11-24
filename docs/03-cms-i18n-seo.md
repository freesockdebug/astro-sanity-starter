# 03. 双端无头 CMS、多语言 i18n、SEO 与第一方图片边缘代理 (`docs/03-cms-i18n-seo.md`)

> **适用场景**：修改 `src/data/*`、`studio/schemaTypes/*`、`src/pages/admin/pages|products|cms-config.astro`、`src/utils/adminPageSchemas.ts`、`src/i18n/*`、`src/components/SEO.astro`、`src/pages/sitemap*.xml.ts` 或 `src/pages/cdn-image/[...path].ts` 时必读。

---

## 1. 第一性原理推导 (First-Principles Derivation)

1. **全栈契约单一真理 (Co-Evolution of Data & Presentation)**：
   - 内容模型跨越 **Sanity Studio (`studio/`)**、**自建后台 CMS 工作台 (`src/pages/admin/*`)**、**GROQ 数据投影 (`src/data/*`)** 与 **前台展示组件 (`src/components/*`)** 四个切面。任何单边修改都会导致字段丢弃或渲染崩溃，因此这四个切面必须作为**单一高内聚单元**同步演进。
2. **最小特权数据传输 (Minimal Data Fetching Contract)**：
   - 商品详情文档包含完整的 `gallery[]` 大图数组、长篇 `description` 与全部 `specifications[]`；而商品卡片（首页轮播、目录列表）仅需首图、标题、MOQ、最多 4 个颜色圆点与前 2 项核心规格。列表查询必须严格使用裁剪投影 (`PRODUCT_CARD_FIELDS`)，将单次传输与 KV 序列化体积压缩 80%。
3. **第一方图片主权与防缓存投毒 (First-Party Image Proxy)**：
   - 直接暴露 `cdn.sanity.io` 会引发第三方域名 DNS/TLS 额外握手及部分地区网络抖动；而简单的反向代理若直接透传 `auto=format`，会导致 Cloudflare 边缘子请求缓存被首个客户端的 `Accept` 头污染（例如把 WebP 缓存后返给不支持 WebP 的旧客户端）。必须通过格式感知缓存键 (`cf_fmt=webp` -> 上游显式锁死 `fm=webp`) 彻底隔离。

---

## 2. 双端无头 CMS 架构 (`src/data/*` + `studio/*` + `/admin/cms-*`)

### 2.1 Sanity 读写分离双客户端 (`src/utils/sanity-client.ts`)
- **`cdnClient` (`useCdn: true`, `apicdn.sanity.io`)**：用于日常 L1/L2 被动缓存未命中时的只读回源。
- **`liveClient` (`useCdn: false`, `api.sanity.io`)**：当后台保存内容或 `/api/revalidate` Webhook 触发 `forceRefresh = true` 时，**强制通过 `getSanityClient(true)` 走 `liveClient` 直连源站**，彻底杜绝 Sanity CDN 节点同步延迟导致把旧文档重新写穿到 Cloudflare KV。
- **`writeClient`（服务端持有 `SANITY_API_WRITE_TOKEN`）**：仅供 `/api/admin/cms/*` 后台管理接口调用，严禁暴露给前端浏览器。

### 2.2 最小字段投影与精细化影响面分析 (`src/utils/cmsSync.ts`)
- **卡片投影契约 (`PRODUCT_CARD_FIELDS` in `src/data/products.ts`)**：
  - 仅投影 `_id, title, shortTitle, "slug": slug.current, sku, "category": category->slug.current, tagline, moq, leadTime, "mainImage": mainImage.asset->url, colors, pricingTiers, "specifications": specifications[0..1]`。
  - `prod:slugs` (`Set<string>`) 直接由 `cms:products:all` 的 `onUpdate` 钩子在内存中零成本派生，无需独立 KV 键。
- **写入前递归清洗 (`sanitizeSanityDocument`)**：
  - 自建后台提交保存前，自动递归剥离预览辅助字段与非法空引用，保护 Sanity 文档结构纯净。
- **字段级最小影响面刷新 (`hasProductCardFieldsChanged`)**：
  - 修改单个商品时，对比修改前后的卡片摘要字段：若仅修改了详情页长文或附图 (`gallery`)，**仅刷新该单品 KV (`cms:product:<slug>`) 与详情页 HTML**，不触发全量商品列表 (`cms:products:all`) 或相邻商品页的缓存重建。

### 2.3 全栈强联动修改清单 (Checklist for Schema Changes)
每当新增或修改任何 CMS 字段 / Section 积木时，必须同步检查并更新以下 5 处：
1. **Sanity Studio Schema**：`studio/schemaTypes/*.ts`（含字段定义与 `preview.prepare`）。
2. **TypeScript 类型契约**：`types/index.ts`。
3. **GROQ 投影与归一化**：`src/data/blocks.ts` (`SECTIONS` 投影 + `normalizeSections` 多语言与图片 URL 归一化) 或 `src/data/products.ts` / `src/data/siteConfig.ts`。
4. **自建后台可视化编辑器 Schema**：`src/utils/adminPageSchemas.ts`（确保 `/admin/pages`、`/admin/products`、`/admin/cms-config` 表单同步支持该字段读写）。
5. **前台 Astro 组件**：`src/components/*.astro`。

---

## 3. 四语种国际化体系 (`src/i18n/*` & `src/data/blocks.ts`)

### 3.1 路由拓扑与 URL 规范
- **支持语种 (`LANGUAGES`)**：`en`（默认语言，**无路径前缀**，如 `/products`）、`de`（`/de/products`）、`fr`（`/fr/products`）、`es`（`/es/products`）。
- **路径辅助函数 (`src/i18n/utils.ts`)**：
  - `getLangFromUrl(url)`：从 URL 首段提取当前语种，未匹配时回退 `en`。
  - `getLocalizedPath(path, lang)`：生成当前语种对应的规范路径（`en` 自动剥离前缀，非 `en` 自动挂载前缀，保留 `#anchor` 锚点）。

### 3.2 三级翻译回退链 (3-Tier Localization Fallback)
在 `normalizeSections()` (`src/data/blocks.ts`) 与 `getLocalizedValue()` 中，任何多语言字段遵循严格的三级优先级：
1. **第一优先级：Sanity CMS 当前语种显式填写值**（如 `field.de` 非空字符串）。
2. **第二优先级：内置专业 B2B 纺织行业词典 (`SECTION_TRANSLATIONS[lang][sectionType]`)**（当 CMS 中仅填写了英文默认值而未填小语种时，自动补齐德/法/西语专业针织术语，如 `200-Nadel-Mikrostrick`、`Lonati-Zylinder`）。
3. **第三优先级：CMS 英文默认值 (`field.en`) 或全局静态字典 (`src/i18n/ui.ts` & `src/data/defaults.ts`)**。

---

## 4. 全站 SEO、结构化数据与动态多语言 Sitemap

### 4.1 统一 SEO 组件 (`src/components/SEO.astro`)
- **Canonical URL 归一化 (`normalizeCanonicalUrl`)**：自动剥离所有查询参数（如 `?preview=1`、`?utm_*`）与非根路径末尾斜杠，防止搜索引擎收录重复页面。
- **社交卡片与多语言 OpenGraph**：
  - 自动输出 `og:title`、`og:description`、`og:image`（通过 `SanityImageService.hero(src, 1200)` 转换为第一方 1200x630 高清卡片图）、`og:locale`（`en_US` / `de_DE` / `fr_FR` / `es_ES`）及 `og:locale:alternate`。
  - `Layout.astro` 自动为所有公开页面注入 4 语种 `<link rel="alternate" hreflang="..." />` 及 `hreflang="x-default"`。
- **Schema.org JSON-LD 结构化数据**：
  - 首页/全局注入 `Organization` / `WebSite`；商品详情页 (`src/pages/products/[slug].astro`) 自动注入包含 SKU、MOQ、阶梯价格区间 (`AggregateOffer`) 与材质规格的 `Product` + `BreadcrumbList` JSON-LD。

### 4.2 动态多语言 Sitemap (`sitemap-index.xml.ts` & `sitemap.xml.ts`)
- 直接从已预热的 `PageService.getSlugs()` 与 `ProductService.getSlugs()` 内存 `Set` 派生全站 4 语种 URL 矩阵与 `<xhtml:link rel="alternate" hreflang="..." />` 交叉引用，**0 数据库查询、0 Sanity 额外查询**。

---

## 5. 第一方图片边缘代理 (`/cdn-image/[...path].ts` & `SanityImageService`)

### 5.1 URL 重写与响应式 `srcSet` (`src/utils/image.ts`)
- `SanityImageService` 自动将 `https://cdn.sanity.io/images/<projectId>/<dataset>/<file>` 重写为第一方路径 `/cdn-image/images/<projectId>/<dataset>/<file>?w=...&q=...&auto=format`。
- `SanityImageService.resolveHeroPreload(src)` 为包含 `heroSection` 的页面在 `<head>` 中生成响应式 `<link rel="preload" as="image" imagesrcset="..." imagesizes="100vw" fetchpriority="high" />`，将首屏 LCP 压缩至极致。

### 5.2 `/cdn-image/[...path].ts` 安全与零拷贝流式缓存
1. **SSRF 与路径穿越防护**：严格校验正则 `/^images\/[a-z0-9_-]+\/[a-z0-9_-]+\//i`，拒绝任何包含 `..`、`\` 或 `http(s)://` 的非法路径（返回 `403 Forbidden`）。
2. **格式感知缓存键防投毒**：
   - 当请求带 `auto=format` 且客户端 `Accept` 支持 `image/webp`（或 `image/avif`，注：Sanity CDN 原生支持转码 `webp`）时：
   - L0 缓存键追加 `?cf_fmt=webp`；
   - 向 Sanity 上游发起请求时删掉模糊的 `auto=format`，显式锁定 `fm=webp`，彻底防止 Cloudflare 子请求缓存跨格式串数据。
3. **`ReadableStream.tee()` 零拷贝双路分发**：
   - 上游响应流通过 `.tee()` 一分为二：一路立即流式返回给客户端浏览器，另一路通过 `cfWaitUntil(cache.put(cacheKey, cacheResponse))` 异步写入 `caches.default`，并设置 1 年强缓存 (`Cache-Control: public, max-age=31536000, s-maxage=31536000, immutable`)。


---

## 6. 历史故障与对抗挑刺规则索引 (`scripts/audits/03-cms-i18n-seo.audit.ts`)

> 每次在本领域发现新的 CMS 字段失步、序列化膨胀或图片代理漏洞，必须在 `scripts/audits/03-cms-i18n-seo.audit.ts` 新增 `CMS-ADV-*` 探针，并在此表中同步登记。

| 规则 / 测试 ID | 挑刺检查目标 | 历史故障根因与防重契约 |
| :--- | :--- | :--- |
| **`CMS-ADV-01`** | `src/`、`studio/` 与 `adminPageSchemas.ts` Section 强联动 | 6 大核心 Section 积木必须在 `studio/schemaTypes/page.ts`、`src/data/blocks.ts` 与 `src/utils/adminPageSchemas.ts` 中三方同步对齐。 |
| **`CMS-ADV-02`** | `PRODUCT_CARD_FIELDS` 最小特权投影守卫 | 商品列表卡片投影严禁包含全量 `gallery[]`，且 `specifications` 必须切片为 `specifications[0..1]`。 |
| **`CMS-ADV-03`** | Sanity 写后主动刷新强制走 `liveClient` (`useCdn: false`) | 防止 `apicdn.sanity.io` 缓存延迟导致主动刷新时读回旧数据覆写 Cloudflare KV。 |
| **`CMS-ADV-04`** | `/cdn-image/*` 路径白名单、`cf_fmt=webp` 防缓存投毒与 6s 超时 | 必须锁定上游 `fm=webp` 并按 `cf_fmt=webp` 隔离缓存键，同时挂载 `AbortSignal.timeout(6000)`。 |
| **`03-cms-i18n-seo:runtime-consistency-verify`** | 内存级 `PreflightTest.verify()`（写前引用净化 + 三级多语言回退 + 最小影响面判定） | 注入携带非法 `url`/`mainImageUrl` 的 Sanity 引用对象检验 `sanitizeSanityDocument`；检验 `normalizeSections` 缺失小语种时的纺织词典回退解包；检验 `hasProductCardFieldsChanged` 修改 `specifications[2]` 时不误判为卡片级变更。 |
