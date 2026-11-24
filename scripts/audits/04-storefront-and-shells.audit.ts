// scripts/audits/04-storefront-and-shells.audit.ts
import type { AuditViolation, DomainAuditSuite } from './types';

const DOC_PATH = 'docs/04-storefront-and-shells.md';
const DOMAIN = '04-storefront-and-shells' as const;

export const storefrontAndShellsAuditSuite: DomainAuditSuite = {
  domain: DOMAIN,
  name: '前台多主题几何、视口懒加载与双端 AppShell (PJAX) 对抗审计',
  docPath: DOC_PATH,
  triggerPatterns: [
    /^src\/components\//,
    /^src\/layouts\//,
    /^src\/pages\/(index|products|orders|account|\[lang\]|\[...slug\]|admin)/,
    /^src\/styles\//,
    /^src\/config\/storefrontThemes\.ts$/,
    /^src\/utils\/(useIntersectionShimmer|appShellRouter|adminWorkbench|clientCache|device)\.ts$/,
    /^src\/hooks\/useTableSettings\.ts$/,
    /^src\/stores\//,
    /^docs\/04-storefront-and-shells\.md$/,
  ],
  unitTestFiles: ['test/adminWorkbench.test.ts', 'test/waf.test.ts'],
  rules: [
    {
      id: 'UI-ADV-01',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'HTMLImageElement.complete 空 src 懒加载误判陷阱挑刺 (#collections 历史故障)',
      historicalContext:
        'HTML 标准规定：当 <img> 同时省略 src 和 srcset（仅挂载 data-src 懒加载属性）时，img.complete 恒等于 true（此时 naturalWidth 为 0）。若同步脚本只判断 if (img.complete) 而不校验 naturalWidth > 0，会在初始化瞬间将未注入 src 的图片容器误标为 apple-img-loaded 并解除 IntersectionObserver，导致商品图永远空白。',
      remediation:
        '任何检查图片加载完成的条件判断，必须在同一条件块中同时校验 img.complete && img.naturalWidth > 0（若涉及 data-src 还应校验 !img.dataset.src）。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const files = [
          ...ctx.listFiles('src/components', /\.(astro|ts)$/),
          ...ctx.listFiles('src/pages', /\.(astro|ts)$/),
          ...ctx.listFiles('src/utils', /\.ts$/),
        ];

        for (const file of files) {
          const content = ctx.readFile(file);
          if (!content.includes('.complete')) continue;
          const lines = content.split(/\r?\n/);

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

            if (/\b(img|htmlImg|childImg|image|el)\??\.complete\b/.test(line)) {
              // 检查上下 4 行窗口内是否同时包含 naturalWidth
              const windowStart = Math.max(0, i - 2);
              const windowEnd = Math.min(lines.length - 1, i + 4);
              const windowText = lines.slice(windowStart, windowEnd + 1).join(' ');
              if (!windowText.includes('naturalWidth')) {
                violations.push({
                  ruleId: 'UI-ADV-01',
                  domain: DOMAIN,
                  docPath: DOC_PATH,
                  title: '检测到单独判断 img.complete 而未校验 naturalWidth > 0 的懒加载图片陷阱',
                  historicalContext: '无 src 的 <img data-src="..."> 在浏览器中 img.complete 恒为 true，单独判断会导致懒加载失效。',
                  file,
                  line: i + 1,
                  snippet: trimmed,
                  remediation: '将判断条件补全为: img.complete && img.naturalWidth > 0 && !img.dataset.src && !img.dataset.srcset',
                });
              }
            }
          }
        }

        const shimmerCode = ctx.readFile('src/utils/useIntersectionShimmer.ts');
        if (shimmerCode && (!shimmerCode.includes('dataset.src') || !shimmerCode.includes('dataset.srcset'))) {
          violations.push({
            ruleId: 'UI-ADV-01',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'useIntersectionShimmer.ts 缺少对 dataset.src / dataset.srcset 待水合状态的双重防误判保护',
            historicalContext: '若容器预置或被误加 apple-img-loaded，必须通过 hasPendingLazySrc (校验 dataset.src || dataset.srcset) 剥离误标类名并继续观察。',
            file: 'src/utils/useIntersectionShimmer.ts',
            remediation: '在 useIntersectionShimmer.ts 中保留 hasPendingLazySrc(img) 对 dataset.src || dataset.srcset 的双重检查。',
          });
        }

        return violations;
      },
    },
    {
      id: 'UI-ADV-02',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'AppShell (PJAX) 子页面脚本严禁仅依赖 DOMContentLoaded 一次性绑定',
      historicalContext:
        '管理后台 (/admin/*) 与买手中心 (/orders, /account) 采用 appShellRouter.ts 进行 #shell-main-canvas 局部 DOM 替换。在菜单切换时浏览器不会再次触发 DOMContentLoaded；若子页面脚本只监听 DOMContentLoaded 而未监听 shell:page-load，切页后所有按钮将彻底失灵。',
      remediation:
        '在 AppShell 子页面脚本中统一使用 document.addEventListener("shell:page-load", init) 或挂载在 document 上的事件委托。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const shellPages = [
          ...ctx.listFiles('src/pages/admin', /\.astro$/),
          ...ctx.listFiles('src/pages/orders', /\.astro$/),
          'src/pages/account.astro',
        ];

        for (const file of shellPages) {
          const content = ctx.readFile(file);
          if (!content) continue;
          if (content.includes('DOMContentLoaded') && !content.includes('shell:page-load')) {
            const lines = content.split(/\r?\n/);
            const lineIdx = lines.findIndex((l) => l.includes('DOMContentLoaded'));
            violations.push({
              ruleId: 'UI-ADV-02',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: 'AppShell 子页面使用了 DOMContentLoaded 但未监听 shell:page-load 事件',
              historicalContext: 'PJAX 局部导航不会重新触发 DOMContentLoaded，会导致切页后按钮无响应。',
              file,
              line: lineIdx >= 0 ? lineIdx + 1 : undefined,
              remediation: '将 DOMContentLoaded 替换为 shell:page-load（或同时绑定两者并加 dataset.bound 防重）。',
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'UI-ADV-03',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'View Transitions 顶部导航零闪烁固定与 --apple-dock-bottom 动态底部避让契约挑刺',
      historicalContext:
        '跨商品切换时若丢失 ::view-transition-group(site-header) 的 animation: none，会导致顶部导航栏闪烁；移动端商品详情页若丢失 --apple-dock-bottom CSS 变量基准线，会导致右下角 WhatsApp 悬浮球与底部粘性询盘栏重叠。',
      remediation:
        '在 src/styles/globals.css 中完整保留 site-header / site-breadcrumbs View Transition 锁定规则以及 --apple-dock-bottom 响应式基准线。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const css = ctx.readFile('src/styles/globals.css');
        if (!css) return violations;

        if (!css.includes('site-header') || !css.includes('--apple-dock-bottom')) {
          violations.push({
            ruleId: 'UI-ADV-03',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/styles/globals.css 缺失 site-header View Transition 锁定或 --apple-dock-bottom 几何基准线',
            historicalContext: '会导致跨页导航闪烁或移动端右下角悬浮组件与底部询盘栏物理重叠。',
            file: 'src/styles/globals.css',
            remediation: '恢复 globals.css 中的 ::view-transition-group(site-header) 与 --apple-dock-bottom 定义。',
          });
        }
        return violations;
      },
    },
    {
      id: 'UI-ADV-04',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'AppShell (PJAX) 写操作自动清空快照缓存 (Read-Your-Writes) 与大数据 <script type="application/json"> 隔离挑刺',
      historicalContext:
        'appShellRouter.ts 缓存了 5 分钟 DOM 快照 (snapshotCache) 与 20 秒预取缓存 (prefetchCache)。若管理员发起 POST/PUT/DELETE 修改后未自动清空快照，切回列表页会看到修改前的陈旧 DOM；且目录页注入大商品数组必须使用 type="application/json" 防止 JS 字符串转义体积暴涨。',
      remediation:
        '在 src/utils/appShellRouter.ts 中保持写操作拦截后 prefetchCache.clear() 与 snapshotCache.clear()，并在目录页保持 <script type="application/json"> 数据隔离。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const routerCode = ctx.readFile('src/utils/appShellRouter.ts');
        if (routerCode && (!routerCode.includes('prefetchCache.clear()') || !routerCode.includes('snapshotCache.clear()'))) {
          violations.push({
            ruleId: 'UI-ADV-04',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/utils/appShellRouter.ts 缺失写操作成功后清空 prefetchCache / snapshotCache 的 Read-Your-Writes 屏障',
            historicalContext: '会导致后台执行保存或删除操作后，通过 PJAX 切回上一页时仍渲染旧的 DOM 快照。',
            file: 'src/utils/appShellRouter.ts',
            remediation: '在非 GET 请求成功后调用 prefetchCache.clear() 与 snapshotCache.clear()。',
          });
        }
        return violations;
      },
    },
    {
      id: 'UI-ADV-05',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '多主题注册表 (STOREFRONT_THEMES) 与 src/styles/themes/*.css 覆写样式表对齐挑刺',
      historicalContext:
        '前台采用「1 套默认基准主题 (apple-minimal 定义于 globals.css :root) + N 套增量覆写主题 (src/styles/themes/<id>.css)」架构。若在 storefrontThemes.ts 新增了非默认主题却漏建 src/styles/themes/<id>.css 或漏在 globals.css 中 @import，会导致后台设置界面可选但前台切换后无样式生效。',
      remediation:
        '确保 STOREFRONT_THEMES 中除默认基准主题 apple-minimal 外的每个主题都在 src/styles/themes/<id>.css 存在对应覆写文件，并在 src/styles/globals.css 顶部 @import。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const themesTs = ctx.readFile('src/config/storefrontThemes.ts');
        const globalsCss = ctx.readFile('src/styles/globals.css');
        if (!themesTs || !globalsCss) return violations;

        const matches = [...themesTs.matchAll(/value:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);
        const uniqueThemes = Array.from(new Set(matches));

        for (const themeId of uniqueThemes) {
          if (themeId === 'apple-minimal') continue; // baseline in globals.css :root
          const cssPath = `src/styles/themes/${themeId}.css`;
          if (!ctx.fileExists(cssPath)) {
            violations.push({
              ruleId: 'UI-ADV-05',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `主题 "${themeId}" 已在 storefrontThemes.ts 注册，但缺失覆写样式文件 ${cssPath}`,
              historicalContext: '会导致后台主题设置界面可选该主题，但前台切换后缺失 CSS 变量覆写。',
              file: 'src/config/storefrontThemes.ts',
              remediation: `创建 ${cssPath} 并在 src/styles/globals.css 中添加 @import "./themes/${themeId}.css";`,
            });
          } else if (!globalsCss.includes(`./themes/${themeId}.css`)) {
            violations.push({
              ruleId: 'UI-ADV-05',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `主题样式文件 ${cssPath} 未在 src/styles/globals.css 中 @import`,
              historicalContext: '未在 globals.css 引入的主题覆写文件不会被打包到主样式表中。',
              file: 'src/styles/globals.css',
              remediation: `在 src/styles/globals.css 顶部添加 @import "./themes/${themeId}.css";`,
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'UI-ADV-06',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'Admin 移动端单一滚动视口 (严禁 min-h-[420px] 双滚动冲突) 与上滑自动折叠顶部工具栏挑刺',
      historicalContext:
        '历史移动端体验缺陷：1) AdminLayout.astro 的 #shell-main-canvas 与 AdminWorkbenchTableShell.astro 若设置 min-h-[420px] lg:min-h-0，在小屏手机上会撑破 100dvh 导致“表内 + 表外浏览器”两个滑动区互相抢手势；2) 顶部工具栏若在表格向下滚动时不自动折叠退让，会吃掉近 40% 的垂直可视面积。',
      remediation:
        '在 AdminLayout.astro 与 AdminWorkbenchTableShell.astro 中保持 strict min-h-0 + overscroll-contain 单一滚动源，并保持 is-table-scrolled-down 驱动 [data-admin-toolbar="true"] 平滑收起。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const adminLayout = ctx.readFile('src/layouts/AdminLayout.astro');
        const tableShell = ctx.readFile('src/components/admin/AdminWorkbenchTableShell.astro');
        const globalsCss = ctx.readFile('src/styles/globals.css');

        if (adminLayout && (adminLayout.includes('min-h-[420px]') || !adminLayout.includes('is-table-scrolled-down'))) {
          violations.push({
            ruleId: 'UI-ADV-06',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'AdminLayout.astro 存在 min-h-[420px] 双滚动区溢出或缺失 is-table-scrolled-down 顶部折叠控制器',
            historicalContext: '会导致移动端出现表内表外双滚动条，且数据表滚动时顶部筛选区无法自动退让。',
            file: 'src/layouts/AdminLayout.astro',
            remediation: '将 #shell-main-canvas 保持为 min-h-0，并保留捕获阶段 scroll 监听器驱动 is-table-scrolled-down。',
          });
        }

        if (tableShell && (tableShell.includes('min-h-[420px]') || !tableShell.includes('overscroll-contain'))) {
          violations.push({
            ruleId: 'UI-ADV-06',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'AdminWorkbenchTableShell.astro 存在 min-h-[420px] 或滚动区缺失 overscroll-contain 边界锁定',
            historicalContext: '缺失 overscroll-contain 会导致表内滑动触顶/触底时触发外层浏览器滚动回弹。',
            file: 'src/components/admin/AdminWorkbenchTableShell.astro',
            remediation: '将外壳保持为 flex-1 min-h-0，并在滚动区挂载 data-admin-table-scroll="true" 与 overscroll-contain。',
          });
        }

        if (globalsCss && !globalsCss.includes('#shell-root.is-table-scrolled-down [data-admin-toolbar="true"]')) {
          violations.push({
            ruleId: 'UI-ADV-06',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/styles/globals.css 缺失 #shell-root.is-table-scrolled-down 顶部工具栏折叠样式',
            historicalContext: '缺失该规则会导致移动端上滑浏览数据表时顶部工具栏无法自动收起让出可视空间。',
            file: 'src/styles/globals.css',
            remediation: '在 globals.css 中保留 @media (max-width: 1023px) 下 [data-admin-toolbar="true"] 的 max-height 折叠过渡。',
          });
        }
        return violations;
      },
    },
  ],
  verify: async () => {
    const violations: AuditViolation[] = [];
    const { useIntersectionShimmer } = await import('../../src/utils/useIntersectionShimmer.js');

    const prevWindow = (globalThis as any).window;
    const prevDoc = (globalThis as any).document;
    const prevElement = (globalThis as any).Element;

    let observedCount = 0;
    class ProbeElement {
      tagName = 'DIV';
      private cls = new Set<string>(['apple-img-loaded']);
      classList = {
        add: (c: string) => this.cls.add(c),
        remove: (c: string) => this.cls.delete(c),
        contains: (c: string) => this.cls.has(c),
      };
      img = {
        tagName: 'IMG',
        complete: true, // HTML 标准陷阱：空 src 时 complete === true
        naturalWidth: 0,
        dataset: { src: '/cdn-image/images/xvhhd8u0/production/probe.webp' },
      };
      querySelector(sel: string) {
        return sel.includes('img') ? this.img : null;
      }
      querySelectorAll() {
        return [];
      }
    }

    try {
      const box = new ProbeElement();
      (globalThis as any).Element = ProbeElement;
      (globalThis as any).document = { readyState: 'complete' };
      (globalThis as any).window = {
        IntersectionObserver: class {
          observe() {
            observedCount += 1;
          }
          unobserve() {}
        },
      };

      useIntersectionShimmer([box as unknown as Element], { deferUntilIdle: false, rootMargin: '111px' });

      if (box.classList.contains('apple-img-loaded') || observedCount !== 1) {
        violations.push({
          ruleId: 'UI-ADV-01',
          domain: DOMAIN,
          docPath: DOC_PATH,
          title: '运行时对抗故障注入失败: useIntersectionShimmer 未能自愈空 src (complete===true, naturalWidth===0) 的懒加载图片容器',
          historicalContext: '会导致 #collections 等懒加载货架在首屏同步初始化时被误判为已加载并永久跳过水合。',
          file: 'src/utils/useIntersectionShimmer.ts',
          remediation: '检查 registerElements 中的 hasPendingLazySrc 与 naturalWidth > 0 自愈剥离逻辑。',
        });
      }
    } finally {
      if (prevWindow === undefined) delete (globalThis as any).window;
      else (globalThis as any).window = prevWindow;
      if (prevDoc === undefined) delete (globalThis as any).document;
      else (globalThis as any).document = prevDoc;
      if (prevElement === undefined) delete (globalThis as any).Element;
      else (globalThis as any).Element = prevElement;
    }

    return violations;
  },
};
