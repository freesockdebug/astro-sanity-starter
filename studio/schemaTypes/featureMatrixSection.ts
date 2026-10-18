import {defineField, defineType} from 'sanity'
import {ThListIcon} from '@sanity/icons/ThList'
export default defineType({
  name: 'featureMatrixSection',
  title: '📐 核心特性与规格矩阵 (Feature & Spec Matrix)',
  type: 'object',
  icon: ThListIcon,
  fieldsets: [
    {
      name: 'bento1',
      title: '🍱 Bento 1: 纱线材质与微距大图 (占2列)',
      options: {collapsible: true, collapsed: false},
    },
    {
      name: 'bento2',
      title: '🍱 Bento 2: 0mm 无缝缝头工艺与认证',
      options: {collapsible: true, collapsed: false},
    },
    {
      name: 'bento3',
      title: '🍱 Bento 3: 200N 针数密度与 Lonati 织机',
      options: {collapsible: true, collapsed: false},
    },
    {
      name: 'bento4',
      title: '🍱 Bento 4: ZeroMark 莱卡罗口弹性',
      options: {collapsible: true, collapsed: false},
    },
    {
      name: 'bento5',
      title: '🍱 Bento 5: 48h 极速全球打样交期',
      options: {collapsible: true, collapsed: false},
    },
    {
      name: 'buttons',
      title: '🔘 Action Buttons (按钮元素配置)',
      options: {collapsible: true, collapsed: false},
    },
  ],
  fields: [
    defineField({
      name: 'adminLabel',
      title: 'Admin Label (版块管理别名 / 备注)',
      description: '【可选后台备注】方便在页面版块列表中快速识别（如：200针工艺矩阵、桑蚕丝参数等）',
      type: 'string',
    }),
    defineField({
      name: 'badge',
      title: 'Badge Label (上标分类)',
      type: 'string',
      initialValue: 'Engineered Construction',
    }),
    defineField({
      name: 'title',
      title: 'Title (Apple 风格主标题)',
      type: 'string',
      initialValue: 'Specification Matrix',
    }),
    defineField({
      name: 'description',
      title: 'Subtitle / Description (浅灰叙事副标题)',
      type: 'text',
      rows: 2,
      initialValue:
        'We treat the architectural construction of luxury knitwear with the exactitude of horology. Every seam, tension zone, and yarn twist is calibrated for zero friction.',
    }),
    // Bento 1
    defineField({
      name: 'bento1Tag',
      title: 'Bento 1 Tag (上标，如 Yarn Architecture)',
      type: 'string',
      fieldset: 'bento1',
      initialValue: 'Yarn Architecture',
    }),
    defineField({
      name: 'bento1Title',
      title: 'Bento 1 Title (标题，如 60s/2 Double-Ply Combed Cotton.)',
      type: 'string',
      fieldset: 'bento1',
      initialValue: '60s/2 Double-Ply Combed Cotton.',
    }),
    defineField({
      name: 'bento1Description',
      title: 'Bento 1 Description (说明文案)',
      type: 'text',
      rows: 2,
      fieldset: 'bento1',
      initialValue:
        'Ultra-long staple combed fibers spun for anti-pilling longevity (Grade 4.5) and a breathable, second-skin handfeel across 50+ wash cycles.',
    }),
    defineField({
      name: 'macroImage',
      title: 'Bento 1 Macro Photo (微距织法高清大图)',
      type: 'image',
      fieldset: 'bento1',
      options: {hotspot: true},
    }),

    // Bento 2
    defineField({
      name: 'bento2Tag',
      title: 'Bento 2 Tag (上标，如 Toe Closure)',
      type: 'string',
      fieldset: 'bento2',
      initialValue: 'Toe Closure',
    }),
    defineField({
      name: 'bento2Stat',
      title: 'Bento 2 Stat (大数值，如 0)',
      type: 'string',
      fieldset: 'bento2',
      initialValue: '0',
    }),
    defineField({
      name: 'bento2Unit',
      title: 'Bento 2 Unit (单位，如 mm)',
      type: 'string',
      fieldset: 'bento2',
      initialValue: 'mm',
    }),
    defineField({
      name: 'bento2Title',
      title: 'Bento 2 Title (主标题，如 Hand-Linked Seamless)',
      type: 'string',
      fieldset: 'bento2',
      initialValue: 'Hand-Linked Seamless',
    }),
    defineField({
      name: 'bento2Description',
      title: 'Bento 2 Description (说明文案)',
      type: 'text',
      rows: 2,
      fieldset: 'bento2',
      initialValue:
        'Individual loop-by-loop manual interlocking eliminates interior ridges for zero pressure on toes.',
    }),
    defineField({
      name: 'bento2BadgeText',
      title: 'Bento 2 Badge Text (左下认证，如 OEKO-TEX® 100 Class I)',
      type: 'string',
      fieldset: 'bento2',
      initialValue: 'OEKO-TEX® 100 Class I',
    }),
    defineField({
      name: 'bento2BadgeStatus',
      title: 'Bento 2 Badge Status (右下绿字，如 Certified Safe)',
      type: 'string',
      fieldset: 'bento2',
      initialValue: 'Certified Safe',
    }),

    // Bento 3
    defineField({
      name: 'bento3Tag',
      title: 'Bento 3 Tag (上标，如 Machine Gauge)',
      type: 'string',
      fieldset: 'bento3',
      initialValue: 'Machine Gauge',
    }),
    defineField({
      name: 'bento3Stat',
      title: 'Bento 3 Stat (大数值，如 200)',
      type: 'string',
      fieldset: 'bento3',
      initialValue: '200',
    }),
    defineField({
      name: 'bento3Unit',
      title: 'Bento 3 Unit (单位，如 N)',
      type: 'string',
      fieldset: 'bento3',
      initialValue: 'N',
    }),
    defineField({
      name: 'bento3Title',
      title: 'Bento 3 Title (主标题，如 Lonati Cylinders)',
      type: 'string',
      fieldset: 'bento3',
      initialValue: 'Lonati Cylinders',
    }),
    defineField({
      name: 'bento3Description',
      title: 'Bento 3 Description (说明文案)',
      type: 'text',
      rows: 2,
      fieldset: 'bento3',
      initialValue:
        'Italian high-density circular knit delivering refined micro-rib clarity with zero distortion.',
    }),
    defineField({
      name: 'bento3FooterNote',
      title: 'Bento 3 Footer Note (底部参数说明，如 Tolerance: ±0.5% Needle Pitch)',
      type: 'string',
      fieldset: 'bento3',
      initialValue: 'Tolerance: ±0.5% Needle Pitch',
    }),

    // Bento 4
    defineField({
      name: 'bento4Tag',
      title: 'Bento 4 Tag (上标，如 Color Fastness)',
      type: 'string',
      fieldset: 'bento4',
      initialValue: 'Color Fastness',
    }),
    defineField({
      name: 'bento4Stat',
      title: 'Bento 4 Stat (大数值，如 Grade 4+)',
      type: 'string',
      fieldset: 'bento4',
      initialValue: 'Grade 4+',
    }),
    defineField({
      name: 'bento4Unit',
      title: 'Bento 4 Unit (单位，如 Wash)',
      type: 'string',
      fieldset: 'bento4',
      initialValue: 'Wash',
    }),
    defineField({
      name: 'bento4Title',
      title: 'Bento 4 Title (主标题，如 Low-Impact Eco Dyes.)',
      type: 'string',
      fieldset: 'bento4',
      initialValue: 'Low-Impact Eco Dyes.',
    }),
    defineField({
      name: 'bento4Description',
      title: 'Bento 4 Description (说明文案)',
      type: 'text',
      rows: 2,
      fieldset: 'bento4',
      initialValue:
        'Custom pantone formulation with non-toxic reactive dyes ensuring Grade 4+ wash fastness without bleeding.',
    }),
    defineField({
      name: 'bento4FooterNote',
      title: 'Bento 4 Footer Note (底部参数说明，如 OEKO-TEX & REACH Compliant)',
      type: 'string',
      fieldset: 'bento4',
      initialValue: 'OEKO-TEX & REACH Compliant',
    }),

    // Bento 5
    defineField({
      name: 'bento5Tag',
      title: 'Bento 5 Tag (上标，如 Sampling Speed)',
      type: 'string',
      fieldset: 'bento5',
      initialValue: 'Sampling Speed',
    }),
    defineField({
      name: 'bento5Stat',
      title: 'Bento 5 Stat (大数值，如 48)',
      type: 'string',
      fieldset: 'bento5',
      initialValue: '48',
    }),
    defineField({
      name: 'bento5Unit',
      title: 'Bento 5 Unit (单位，如 h)',
      type: 'string',
      fieldset: 'bento5',
      initialValue: 'h',
    }),
    defineField({
      name: 'bento5Title',
      title: 'Bento 5 Title (主标题，如 Global Courier Dispatch)',
      type: 'string',
      fieldset: 'bento5',
      initialValue: 'Global Courier Dispatch',
    }),
    defineField({
      name: 'bento5Description',
      title: 'Bento 5 Description (说明文案)',
      type: 'text',
      rows: 2,
      fieldset: 'bento5',
      initialValue:
        'Curated fabric swatch books and custom lab dip samples dispatched via DHL Express in 48 hours.',
    }),
    defineField({
      name: 'bento5FooterNote',
      title: 'Bento 5 Footer Note (底部参数说明，如 Bulk Lead: 14 – 18 Working Days)',
      type: 'string',
      fieldset: 'bento5',
      initialValue: 'Bulk Lead: 14 – 18 Working Days',
    }),
    defineField({
      name: 'showPrimaryButton',
      title: 'Show Primary Button (是否显示主按钮)',
      description: '控制 Bento 规格矩阵底部的黑色主按钮是否显示',
      type: 'boolean',
      initialValue: false,
      fieldset: 'buttons',
    }),
    defineField({
      name: 'primaryButtonText',
      title: 'Primary Button Text (主按钮文字)',
      type: 'string',
      initialValue: 'Request Swatch Kit',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'primaryButtonUrl',
      title: 'Primary Button URL (主按钮跳转链接)',
      type: 'string',
      initialValue: '#inquiry',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'swatchSku',
      title: 'Custom Swatch Kit SKU (本区块专属样卡编号)',
      description: '指定本规格版块主按钮申领时装载的样卡 SKU（留空则默认继承 RFQ Settings 中的官方通用 SKU）',
      type: 'string',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'showSecondaryButton',
      title: 'Show Secondary Button (是否显示副按钮)',
      description: '控制 Bento 规格矩阵底部的副按钮（如 Download PDF）是否显示',
      type: 'boolean',
      initialValue: true,
      fieldset: 'buttons',
    }),
    defineField({
      name: 'secondaryButtonText',
      title: 'Secondary Button Text (副按钮文字)',
      type: 'string',
      initialValue: 'Download B2B Line Sheet (PDF)',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'secondaryButtonUrl',
      title: 'Secondary Button URL (副按钮跳转链接)',
      type: 'string',
      initialValue: '#inquiry',
      fieldset: 'buttons',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      adminLabel: 'adminLabel',
      badge: 'badge',
      media: 'macroImage',
    },
    prepare({title, adminLabel, badge, media}) {
      const name = adminLabel ? adminLabel : (title || '核心工艺与规格');
      return {
        title: `📐 [特性规格矩阵] ${name}`,
        subtitle: `类型: featureMatrixSection · 标签: ${badge || 'Technical Specs'}`,
        media,
      }
    },
  },
})
