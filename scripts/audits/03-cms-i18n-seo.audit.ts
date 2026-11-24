// scripts/audits/03-cms-i18n-seo.audit.ts
import type { AuditViolation, DomainAuditSuite } from './types';
import { findLineMatches } from './types';

const DOC_PATH = 'docs/03-cms-i18n-seo.md';
const DOMAIN = '03-cms-i18n-seo' as const;

export const cmsI18nSeoAuditSuite: DomainAuditSuite = {
  domain: DOMAIN,
  name: '双端无头 CMS、多语言 i18n、SEO 与图片代理对抗审计',
  docPath: DOC_PATH,
  triggerPatterns: [
    /^src\/data\//,
    /^studio\//,
    /^src\/utils\/(adminPageSchemas|sanity-client|image)\.ts$/,
    /^src\/i18n\//,
    /^src\/components\/SEO\.astro$/,
    /^src\/pages\/(cdn-image|sitemap)/,
    /^types\/index\.ts$/,
    /^docs\/03-cms-i18n-seo\.md$/,
  ],
  unitTestFiles: ['test/cms-i18n-seo.test.ts', 'test/security.test.ts'],
  rules: [
    {
      id: 'CMS-ADV-01',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '前端 GROQ/组件 (src/) 与 Sanity Studio (studio/) 及自建后台 Schema 强联动契约挑刺',
      historicalContext:
        '架构红线第 6 条：如果 studio/schemaTypes/page.ts 注册的 Section 积木类型未在 src/data/blocks.ts 或 src/utils/adminPageSchemas.ts 中同步对齐，会导致 Studio 新增区块在前台渲染为空白或自建后台编辑器无法识别。',
      remediation:
        '保持 studio/schemaTypes/page.ts、src/data/blocks.ts (normalizeSections) 与 src/utils/adminPageSchemas.ts 中的 6 大 Section _type 完全对齐。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const studioPage = ctx.readFile('studio/schemaTypes/page.ts');
        const blocksTs = ctx.readFile('src/data/blocks.ts');
        const adminSchemas = ctx.readFile('src/utils/adminPageSchemas.ts');
        if (!studioPage || !blocksTs || !adminSchemas) return violations;

        const requiredSections = [
          'heroSection',
          'featureMatrixSection',
          'productShowcaseSection',
          'manufacturingSection',
          'inquirySection',
          'customSection',
        ];

        for (const secType of requiredSections) {
          if (!studioPage.includes(secType)) {
            violations.push({
              ruleId: 'CMS-ADV-01',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `studio/schemaTypes/page.ts 缺失核心 Section 类型注册: ${secType}`,
              historicalContext: '前端与 Studio 必须高内聚强联动，严禁单边缺失 Section 定义。',
              file: 'studio/schemaTypes/page.ts',
              remediation: `在 studio/schemaTypes/page.ts 的 sections of 数组中同步注册 ${secType}。`,
            });
          }
          if (!adminSchemas.includes(secType)) {
            violations.push({
              ruleId: 'CMS-ADV-01',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `src/utils/adminPageSchemas.ts 缺失核心 Section 可视化表单定义: ${secType}`,
              historicalContext: '自建后台页面编辑器与 Sanity Studio 必须支持相同的 Section 积木集。',
              file: 'src/utils/adminPageSchemas.ts',
              remediation: `在 src/utils/adminPageSchemas.ts 中补齐 ${secType} 的 Schema 表单定义。`,
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'CMS-ADV-02',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '最小特权数据契约：商品卡片列表严禁无脑拉取全量 gallery[] 或全量 specifications',
      historicalContext:
        '历史性能事故：PRODUCT_CARD_FIELDS 与首页 productShowcaseSection 曾拉取完整的 gallery[] 大图流与全部 specifications，导致 cms:products:all 序列化 JSON 膨胀 5 倍，拖慢 KV 读取与客户端水合。',
      remediation:
        '在 src/data/products.ts (PRODUCT_CARD_FIELDS) 与 src/data/blocks.ts (productShowcaseSection) 中仅投影 mainImage 与 specifications[0..1]，严禁投影完整 gallery[]。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const productsTs = ctx.readFile('src/data/products.ts');
        if (productsTs) {
          const cardMatch = productsTs.match(/PRODUCT_CARD_FIELDS\s*=\s*`([\s\S]*?)`/);
          if (cardMatch) {
            const body = cardMatch[1];
            if (/\bgallery\b/.test(body)) {
              violations.push({
                ruleId: 'CMS-ADV-02',
                domain: DOMAIN,
                docPath: DOC_PATH,
                title: 'PRODUCT_CARD_FIELDS 违规投影了重量级 gallery 字段',
                historicalContext: '商品列表卡片仅需首图 mainImage，拉取 gallery[] 会引发 KV 与 HTML 序列化雪崩。',
                file: 'src/data/products.ts',
                remediation: '从 PRODUCT_CARD_FIELDS 中移除 gallery 投影，仅保留 "mainImage": mainImage.asset->url。',
              });
            }
            if (body.includes('specifications') && !body.includes('specifications[0..1]')) {
              violations.push({
                ruleId: 'CMS-ADV-02',
                domain: DOMAIN,
                docPath: DOC_PATH,
                title: 'PRODUCT_CARD_FIELDS 中的 specifications 未做 [0..1] 最小切片',
                historicalContext: '卡片仅展示材质 (composition) 与针数 (gauge) 前两项规格。',
                file: 'src/data/products.ts',
                remediation: '将 specifications 限制为 "specifications": specifications[0..1]。',
              });
            }
          }
        }
        return violations;
      },
    },
    {
      id: 'CMS-ADV-03',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'Sanity 写后主动刷新必须走 liveClient (useCdn: false) 防旧数据写穿 KV',
      historicalContext:
        '当后台修改商品或页面触发 refresh() 时，如果使用了默认走 apicdn.sanity.io 的 client，Sanity CDN 的几秒缓存延迟会导致把修改前的旧数据重新读出来并永久写穿到 Cloudflare KV。',
      remediation:
        '在 src/utils/sanity-client.ts 中确保 getSanityClient(forceRefresh = true) 返回 useCdn: false 的 liveClient。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const sanityClientTs = ctx.readFile('src/utils/sanity-client.ts');
        if (!sanityClientTs) return violations;

        if (!sanityClientTs.includes('useCdn: false') || !sanityClientTs.includes('getSanityClient')) {
          violations.push({
            ruleId: 'CMS-ADV-03',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/utils/sanity-client.ts 缺失 useCdn: false 的 liveClient 读写分离机制',
            historicalContext: '主动刷新缓存必须绕过 Sanity API CDN 直连源站。',
            file: 'src/utils/sanity-client.ts',
            remediation: '保留 liveClient (useCdn: false) 并在 forceRefresh = true 时切换到 liveClient。',
          });
        }
        return violations;
      },
    },
    {
      id: 'CMS-ADV-04',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '第一方图片边缘代理 (/cdn-image/*) 路径穿越防护与 cf_fmt=webp 防缓存投毒挑刺',
      historicalContext:
        '/cdn-image/[...path].ts 若直接向 Sanity 透传 auto=format 而不按 Accept 头分离缓存键并锁定 fm=webp，会导致 Cloudflare 子请求缓存被首个访问者的图片格式污染；且必须严格限制 /^images\\// 路径防 SSRF。',
      remediation:
        '在 src/pages/cdn-image/[...path].ts 中保持 /^images\\/[a-z0-9_-]+\\/[a-z0-9_-]+\\//i 路径白名单、cf_fmt=webp 缓存键隔离以及 AbortSignal.timeout(6000)。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const proxyCode = ctx.readFile('src/pages/cdn-image/[...path].ts');
        if (!proxyCode) return violations;

        if (!proxyCode.includes('cf_fmt') || !proxyCode.includes("targetParams.set('fm', 'webp')")) {
          violations.push({
            ruleId: 'CMS-ADV-04',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: '/cdn-image/[...path].ts 缺失 cf_fmt=webp 格式感知缓存键隔离',
            historicalContext: '直接透传 auto=format 会引发 Cloudflare 子请求跨客户端格式缓存投毒。',
            file: 'src/pages/cdn-image/[...path].ts',
            remediation: '根据 Accept 头设置 cf_fmt=webp，并向上游显式传递 fm=webp。',
          });
        }
        if (!proxyCode.includes('AbortSignal.timeout')) {
          const matches = findLineMatches(proxyCode, /\bfetch\s*\(/);
          violations.push({
            ruleId: 'CMS-ADV-04',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: '/cdn-image/[...path].ts 上游 fetch 缺失 AbortSignal.timeout 熔断保护',
            historicalContext: '上游图片源抖动时会拖死边缘 Worker。',
            file: 'src/pages/cdn-image/[...path].ts',
            line: matches[0]?.line,
            remediation: '在 fetch 配置中挂载 signal: AbortSignal.timeout(6000)。',
          });
        }
        return violations;
      },
    },
  ],
  verify: async () => {
    const violations: AuditViolation[] = [];
    const { sanitizeSanityDocument, hasProductCardFieldsChanged } = await import('../../src/utils/cmsSync.js');
    const { normalizeSections } = await import('../../src/data/blocks.js');

    // 故障注入 1: 注入携带非法 url/mainImageUrl 属性的 Sanity 引用对象，验证写前净化
    const dirtyDoc = {
      _id: 'prod-probe',
      mainImageUrl: 'https://transient-preview.example/a.jpg',
      category: { _type: 'reference', _ref: 'cat-1', url: 'https://illegal-prop.example' },
    };
    const cleaned = sanitizeSanityDocument(dirtyDoc) as any;
    if ('mainImageUrl' in cleaned || 'url' in (cleaned.category || {})) {
      violations.push({
        ruleId: 'CMS-ADV-01',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '运行时对抗故障注入失败: sanitizeSanityDocument 未能彻底剥离 Sanity 引用对象上的非法属性',
        historicalContext: 'Sanity mutation 写入包含额外属性的 reference 对象会直接触发 Schema 报错中断保存。',
        file: 'src/utils/cmsSync.ts',
        remediation: '检查 sanitizeSanityDocument 对 _type === "reference" 和临时预览字段的净化逻辑。',
      });
    }

    // 故障注入 2: 验证三级多语言回退链 (CMS 缺失德语字段时必须回退至专业纺织词典而非暴露原始 object)
    const normalized = normalizeSections(
      [{ _type: 'heroSection', superTitle: { en: 'B2B Manufacturing' } }],
      'de'
    );
    if (typeof normalized?.[0]?.superTitle !== 'string' || normalized[0].superTitle.length === 0) {
      violations.push({
        ruleId: 'CMS-ADV-01',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '运行时对抗故障注入失败: normalizeSections 三级多语言回退未能将多语言对象解包为字符串',
        historicalContext: '若未解包多语言叶子节点，前台 Astro 模板会直接渲染出 [object Object]。',
        file: 'src/data/blocks.ts',
        remediation: '检查 normalizeSections 与 deepLocalize 的三级回退解包逻辑。',
      });
    }

    // 故障注入 3: 仅修改详情页第 3 项规格 (specifications[2]) 时，严禁误判为卡片级变更触发列表全量刷新
    const baseProd = {
      title: { en: 'A' },
      moq: '100',
      specifications: [{ label: '1', value: 'A' }, { label: '2', value: 'B' }, { label: '3', value: 'C' }],
    };
    const detailOnlyProd = {
      ...baseProd,
      specifications: [baseProd.specifications[0], baseProd.specifications[1], { label: '3', value: 'CHANGED' }],
    };
    if (hasProductCardFieldsChanged(baseProd, detailOnlyProd) !== false) {
      violations.push({
        ruleId: 'CMS-ADV-02',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '运行时对抗故障注入失败: hasProductCardFieldsChanged 将详情页专属修改误判为卡片列表变更',
        historicalContext: '误判会导致每次修改商品详情描述都引发全站商品列表缓存与 L0 HTML 伴随失效风暴。',
        file: 'src/utils/cmsSync.ts',
        remediation: '确保 hasProductCardFieldsChanged 仅比对 CARD_IMPACT_KEYS 与 specifications.slice(0, 2)。',
      });
    }

    return violations;
  },
};
