import {defineField, defineType} from 'sanity'
import {StarIcon} from '@sanity/icons/Star'
export default defineType({
  name: 'heroSection',
  title: '🌟 主视觉首屏 (Hero Showcase)',
  type: 'object',
  icon: StarIcon,
  fieldsets: [
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
      description: '【推荐后台备注】在页面版块列表中直观显示此名字（如：首页首屏、春季品牌主图等）',
      type: 'string',
    }),
    defineField({
      name: 'superTitle',
      title: 'Super Title (顶部眉标/类别胶囊文字 - 多语言)',
      type: 'localeString',
      initialValue: {
        en: 'B2B Manufacturing & Private Label Atelier',
        de: 'B2B-Herstellung & Private-Label-Atelier',
        fr: 'Fabrication B2B & Atelier Marque Blanche',
        es: 'Fabricación B2B y Taller de Marca Blanca'
      },
    }),
    defineField({
      name: 'headline',
      title: 'Main Headline (主标题 - 支持句号分隔两段灰度对比 - 多语言)',
      type: 'localeString',
      description: '示例：Engineered Elegance. 200-Needle Micro Weave.（第二句将自动渲染为 Apple 标志性浅灰色）',
      initialValue: {
        en: 'Engineered Elegance. 200-Needle Micro Weave.',
        de: 'Raffinierte Eleganz. 200-Nadel-Mikrostrick.',
        fr: 'Élégance de Pointe. Maille 200 Aiguilles.',
        es: 'Elegancia Técnica. Tejido Micro de 200 Agujas.'
      },
    }),
    defineField({
      name: 'subline',
      title: 'Subline / Tagline (核心叙事副标题 - 多语言)',
      type: 'localeText',
      initialValue: {
        en: 'Knitted on Italian Lonati machinery with 100% artisan hand-linked seamless toes. Built for modern private-label brands and luxury retail.',
        de: 'Gestrickt auf italienischen Lonati-Maschinen mit 100% handgekettelter, nahtloser Spitze. Entwickelt für moderne Modemarken und den anspruchsvollen Einzelhandel.',
        fr: 'Tricoté sur des métiers circulaires italiens Lonati avec pointes remaillées main sans couture. Conçu pour les marques haut de gamme et le retail de luxe.',
        es: 'Tejido en maquinaria italiana Lonati con punteras remalladas a mano 100% sin costuras. Diseñado para marcas de moda contemporáneas y comercio minorista de lujo.'
      },
    }),
    defineField({
      name: 'heroImage',
      title: 'Hero Cover Image (居中超大高精微距大图)',
      type: 'image',
      options: {hotspot: true},
    }),
    defineField({
      name: 'showPrimaryButton',
      title: 'Show Primary Button (是否显示主按钮)',
      description: '控制黑色主按钮（如 Request Swatch Kit）是否显示',
      type: 'boolean',
      initialValue: false,
      fieldset: 'buttons',
    }),
    defineField({
      name: 'primaryButtonText',
      title: 'Primary Button Text (主按钮文字 - 多语言)',
      type: 'localeString',
      initialValue: {
        en: 'Request Swatch Kit',
        de: 'Musterdossier anfordern',
        fr: 'Demander le dossier d’échantillons',
        es: 'Solicitar dossier de muestras'
      },
      fieldset: 'buttons',
    }),
    defineField({
      name: 'primaryButtonUrl',
      title: 'Primary Button Link (主按钮链接)',
      type: 'string',
      initialValue: '#inquiry',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'swatchSku',
      title: 'Custom Swatch Kit SKU (本区块专属样卡编号)',
      description: '指定本版块主按钮申领时装载的样卡 SKU（留空则默认继承 RFQ Settings 中的官方通用 SKU）',
      type: 'string',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'showSecondaryButton',
      title: 'Show Secondary Button (是否显示次按钮)',
      description: '控制浅灰色次按钮（如 Explore Capsule Lines）是否显示',
      type: 'boolean',
      initialValue: true,
      fieldset: 'buttons',
    }),
    defineField({
      name: 'secondaryButtonText',
      title: 'Secondary Button Text (次按钮文字 - 多语言)',
      type: 'localeString',
      initialValue: {
        en: 'Explore Capsule Lines',
        de: 'Kollektionen erkunden',
        fr: 'Explorer les collections',
        es: 'Explorar colecciones'
      },
      fieldset: 'buttons',
    }),
    defineField({
      name: 'secondaryButtonUrl',
      title: 'Secondary Button Link (次按钮链接)',
      type: 'string',
      initialValue: '#collections',
      fieldset: 'buttons',
    }),
  ],
  preview: {
    select: {
      headline: 'headline',
      adminLabel: 'adminLabel',
      btn: 'primaryButtonText',
      showBtn: 'showPrimaryButton',
      media: 'heroImage',
    },
    prepare({headline, adminLabel, btn, showBtn, media}) {
      const rawH = typeof headline === 'object' && headline ? (headline.en || Object.values(headline)[0]) : headline;
      const rawBtn = typeof btn === 'object' && btn ? (btn.en || Object.values(btn)[0]) : btn;
      const name = adminLabel ? adminLabel : (rawH ? String(rawH).split('.')[0] : '未命名首屏');
      return {
        title: `🌟 [主视觉首屏] ${name}`,
        subtitle: `类型: heroSection · 主按钮: ${showBtn ? (rawBtn || '开启') : '隐藏'} · ${rawH || ''}`,
        media,
      }
    },
  },
})
