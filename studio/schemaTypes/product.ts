import {defineField, defineType} from 'sanity'
import {TagIcon} from '@sanity/icons/Tag'
export default defineType({
  name: 'product',
  title: 'Products (女袜款式与订货)',
  type: 'document',
  icon: TagIcon,
  groups: [
    {name: 'basic', title: 'Basic Info', default: true},
    {name: 'gallery', title: 'Images & Carousel (多图画廊)'},
    {name: 'wholesale', title: 'Wholesale & B2B'},
    {name: 'story', title: 'Story & Craftsmanship (图文详情与工艺叙事)'},
    {name: 'specs', title: 'Technical Specifications'},
    {name: 'actions', title: 'Buttons & Inquiry (按钮与样卡申领)'},
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Product Title (产品名称 - 多语言)',
      type: 'localeString',
      group: 'basic',
    }),
    defineField({
      name: 'slug',
      title: 'Slug (URL 路径标识)',
      type: 'slug',
      options: {
        source: (doc: any) =>
          typeof doc?.title === 'object' && doc?.title ? doc.title.en : doc?.title,
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
      group: 'basic',
    }),
    defineField({
      name: 'sku',
      title: 'SKU / Style Code (款号)',
      type: 'string',
      group: 'basic',
    }),
    defineField({
      name: 'tagline',
      title: 'Tagline (一句话卖点/材质概述 - 多语言)',
      type: 'localeText',
      group: 'basic',
    }),
    defineField({
      name: 'shortTitle',
      title: 'Short Display Title (首页卡片短标题 - 多语言)',
      description: '例如：Double Ruffle Lace。若留空则自动根据主标题展示。',
      type: 'localeString',
      group: 'basic',
    }),
    defineField({
      name: 'category',
      title: 'Product Category (产品所属类别)',
      description: '从配置的分类中选择该款型所属类别（可在 Product Categories 栏目中自由增删改类别），用于产品陈列大厅即时筛选。',
      type: 'reference',
      to: [{type: 'category'}],
      group: 'basic',
    }),
    defineField({
      name: 'statusBadge',
      title: 'Status Badge (产品状态徽章 - 多语言)',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'basic',
    }),
    defineField({
      name: 'supportBadge',
      title: 'Support Badge (服务保障徽章 - 多语言)',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'basic',
    }),
    defineField({
      name: 'mainImage',
      title: 'Main Cover Image (封面主图)',
      type: 'image',
      options: {hotspot: true},
      fields: [
        {
          name: 'alt',
          type: 'string',
          title: 'Alt Text',
        },
      ],
      group: 'gallery',
    }),
    defineField({
      name: 'gallery',
      title: 'Carousel Gallery (多图轮播图集)',
      description: '上传并拖拽排序多张高清大片、微距缝头特写与细节图，前台详情页将自动轮番展示。',
      type: 'array',
      of: [
        {
          type: 'image',
          options: {hotspot: true},
          fields: [
            {
              name: 'alt',
              type: 'string',
              title: 'Alt Text',
            },
            {
              name: 'caption',
              type: 'string',
              title: 'Caption / 视角说明',
            },
          ],
        },
      ],
      group: 'gallery',
    }),
    defineField({
      name: 'galleryHint',
      title: 'Gallery Thumbnail Hint (画廊缩略图底部提示文案 - 多语言)',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'gallery',
    }),
    defineField({
      name: 'currency',
      title: 'Currency (结算币种)',
      description: '商品结算货币代码，如 USD ($), EUR (€), GBP (£), CNY (¥)。外贸标准默认 USD',
      type: 'string',
      initialValue: 'USD',
      options: {
        list: [
          {title: 'USD ($) - US Dollar (外贸标准)', value: 'USD'},
          {title: 'EUR (€) - Euro', value: 'EUR'},
          {title: 'GBP (£) - British Pound', value: 'GBP'},
          {title: 'CNY (¥) - Chinese Yuan', value: 'CNY'},
        ],
      },
      group: 'wholesale',
    }),
    defineField({
      name: 'moq',
      title: 'MOQ (最小起订量备用文案)',
      description: '前台优先读取阶梯价 (FOB Tiered Pricing) 里的最小订购量与单位。若无阶梯价则回退读取此字段',
      type: 'string',
      initialValue: '200 Units / Color',
      group: 'wholesale',
    }),
    defineField({
      name: 'leadTime',
      title: 'Lead Time (打样与大货交期)',
      type: 'string',
      initialValue: 'Sample: 48h | Bulk: 18-22 Days',
      group: 'wholesale',
    }),
    defineField({
      name: 'pricingTiers',
      title: 'FOB Tiered Pricing (阶梯出厂价)',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {
              name: 'range',
              title: 'Quantity Range (订购数量区间)',
              description: '仅填写数量范围数字（无需写单位），例如：200 - 499 或 2,000+。单位由下方 Unit 字段维护',
              type: 'string',
            },
            {name: 'price', title: 'Unit Price (单价)', type: 'string'},
            {
              name: 'unit',
              title: 'Unit (计量单位)',
              description: '如 Pairs (双), Pcs (件), Packs (包), Sets (套)。留空默认 Pairs',
              type: 'string',
              initialValue: 'Pairs',
              options: {
                list: [
                  {title: 'Pairs (双)', value: 'Pairs'},
                  {title: 'Pcs (件/个)', value: 'Pcs'},
                  {title: 'Packs (包)', value: 'Packs'},
                  {title: 'Sets (套)', value: 'Sets'},
                  {title: 'Dozens (打)', value: 'Dozens'},
                ],
              },
            },
          ],
          preview: {
            select: {title: 'range', subtitle: 'price', unit: 'unit'},
            prepare({title, subtitle, unit}: any) {
              const rawT = typeof title === 'object' && title ? (title.en || title.zh || Object.values(title)[0]) : title;
              const rawS = typeof subtitle === 'object' && subtitle ? (subtitle.en || subtitle.zh || Object.values(subtitle)[0]) : subtitle;
              const rangeStr = rawT ? String(rawT) : '未命名订购阶梯';
              const rangeWithUnit = unit && !rangeStr.toLowerCase().includes(String(unit).toLowerCase())
                ? `${rangeStr} ${unit}`
                : rangeStr;
              const priceUnitStr = unit ? ` / ${unit}` : '';
              return {
                title: rangeWithUnit,
                subtitle: rawS ? `单价: ${String(rawS)}${priceUnitStr}` : undefined,
              }
            },
          },
        },
      ],
      group: 'wholesale',
    }),
    defineField({
      name: 'colors',
      title: 'Colorways (现货/支持色卡)',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'name', title: 'Color Name (颜色名称)', type: 'string'},
            {name: 'hex', title: 'Hex Color (色值，如 #e7e3db)', type: 'string'},
          ],
          preview: {
            select: {title: 'name', subtitle: 'hex'},
            prepare({title, subtitle}: any) {
              const rawT = typeof title === 'object' && title ? (title.en || title.zh || Object.values(title)[0]) : title;
              const rawS = typeof subtitle === 'object' && subtitle ? (subtitle.en || subtitle.zh || Object.values(subtitle)[0]) : subtitle;
              return {
                title: rawT ? String(rawT) : '未命名颜色',
                subtitle: rawS ? `色值: ${String(rawS)}` : undefined,
              }
            },
          },
        },
      ],
      group: 'wholesale',
    }),
    defineField({
      name: 'priceNote',
      title: 'Price Table Note (阶梯价底部说明/报价备注 - 多语言)',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'wholesale',
    }),
    defineField({
      name: 'paletteTitle',
      title: 'Palette Section Title (色卡标题 - 多语言)',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'wholesale',
    }),
    defineField({
      name: 'story',
      title: 'Product Story & Markdown Detail (富文本图文与工艺叙事 - 多语言)',
      description: '使用 Markdown 编辑器编写专属图文故事。支持各级标题、引用块、工艺细节参数列表、高清大图与对比说明。',
      type: 'localeMarkdown',
      group: 'story',
    }),
    defineField({
      name: 'storyBadge',
      title: 'Custom Story Badge (当前单品专属工艺徽章 - 可选覆盖全局)',
      description: '留空将默认继承 Studio "Product Story Settings" 全局统一配置 (默认 CRAFTSMANSHIP & STORY)',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'story',
    }),
    defineField({
      name: 'storyHeading',
      title: 'Custom Story Heading (当前单品专属大标题 - 可选覆盖全局)',
      description: '留空将默认继承 Studio "Product Story Settings" 全局统一配置 (默认 The Story Behind the Silhouette)',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'story',
    }),
    defineField({
      name: 'addToQuoteButtonText',
      title: 'Add to Quote Button Text (加入询盘车按钮文案 - 多语言)',
      description: '留空将默认使用全站 RFQ 设置 (Add to Quote Basket)',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'actions',
    }),
    defineField({
      name: 'amazonAsin',
      title: 'Amazon ASIN (亚马逊商品 ASIN 码)',
      description: '例如: B0CWXYZ123。填写后买家点击按钮将直接跳转到亚马逊对应商品页面购买现货样品',
      type: 'string',
      group: 'actions',
    }),
    defineField({
      name: 'amazonUrl',
      title: 'Custom Amazon Listing URL (自定义亚马逊直达链接，可选)',
      description: '如果填写了完整链接将优先跳转此链接；若留空则自动根据 ASIN 生成链接 (https://www.amazon.com/dp/{ASIN})',
      type: 'url',
      group: 'actions',
    }),
    defineField({
      name: 'sampleButtonText',
      title: 'Sample Button Text (买样按钮文案 - 多语言)',
      description: '留空将默认显示全站 RFQ 设置 (Order Sample on Amazon)',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'actions',
    }),
    defineField({
      name: 'primaryButtonText',
      title: 'Primary Action Button (主行动按钮文案 - 多语言)',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'actions',
    }),
    defineField({
      name: 'secondaryButtonText',
      title: 'Secondary Action Button / Tech Pack (副操作/技术包按钮文案 - 多语言)',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'actions',
    }),
  ],
  preview: {
    select: {
      titleEn: 'title.en',
      rawTitle: 'title',
      subtitle: 'sku',
      media: 'mainImage',
    },
    prepare(selection: any) {
      const {titleEn, rawTitle, subtitle, media} = selection
      const resolvedTitle =
        titleEn ||
        (typeof rawTitle === 'object' && rawTitle !== null
          ? rawTitle.en || Object.values(rawTitle)[0]
          : rawTitle) ||
        'Untitled Product'
      return {
        title: String(resolvedTitle),
        subtitle: subtitle ? `SKU: ${subtitle}` : undefined,
        media,
      }
    },
  },
})
