import {defineField, defineType} from 'sanity'
import {CogIcon} from '@sanity/icons/Cog'
export default defineType({
  name: 'manufacturingSection',
  title: '🏭 制造实力与工坊能力 (Manufacturing & Capabilities)',
  type: 'object',
  icon: CogIcon,
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
      description: '【推荐后台备注】在页面版块列表中直观显示此名字（如：工厂产能介绍、BSCI验厂等）',
      type: 'string',
    }),
    defineField({
      name: 'badge',
      title: 'Badge (上标标签 - 多语言)',
      type: 'localeString',
      initialValue: {
        en: 'OEM / ODM & Private Label',
        de: 'OEM / ODM & Private Label',
        fr: 'OEM / ODM & Marque Blanche',
        es: 'OEM / ODM y Marca Blanca'
      },
    }),
    defineField({
      name: 'headline',
      title: 'Headline (标题 - 多语言)',
      type: 'localeString',
      initialValue: {
        en: 'Vertical Knitting Infrastructure',
        de: 'Vertikale Strick-Infrastruktur',
        fr: 'Infrastructure de Tricotage Intégrée',
        es: 'Infraestructura de Tejido Vertical'
      },
    }),
    defineField({
      name: 'subline',
      title: 'Subline (说明文案 - 多语言)',
      type: 'localeText',
      initialValue: {
        en: 'From spinning fiber selection to finished packaging, our smart manufacturing line delivers bespoke apparel solutions with rapid prototyping and global export compliance.',
        de: 'Von der Faserselektion bis zur verkaufsfertigen Verpackung bietet unsere intelligente Fertigungslinie maßgeschneiderte Lösungen mit schnellem Prototyping und globaler Exportkonformität.',
        fr: 'De la sélection des fibres au conditionnement final, notre ligne de production intelligente délivre des solutions sur mesure avec prototypage express et conformité mondiale.',
        es: 'Desde la selección de la fibra hasta el empaque final, nuestra línea de fabricación inteligente ofrece soluciones a medida con muestreo rápido y homologación exportadora.'
      },
    }),
    defineField({
      name: 'capabilities',
      title: 'Capabilities List (制造实力项目卡片 - 多语言)',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'title', title: 'Title (项目标题 - 多语言)', type: 'localeString'},
            {name: 'description', title: 'Description (说明 - 多语言)', type: 'localeText'},
          ],
          preview: {
            select: {title: 'title', subtitle: 'description'},
            prepare({title, subtitle}) {
              const rawT = typeof title === 'object' && title ? (title.en || Object.values(title)[0]) : title;
              const rawS = typeof subtitle === 'object' && subtitle ? (subtitle.en || Object.values(subtitle)[0]) : subtitle;
              return {
                title: rawT || '制造能力项',
                subtitle: rawS || '',
              };
            },
          },
        },
      ],
      initialValue: [
        {
          _key: 'c1',
          title: {
            en: '350+ Lonati Cylinders',
            de: '350+ Lonati-Zylinder',
            fr: 'Plus de 350 Métiers Lonati',
            es: 'Más de 350 Cilindros Lonati'
          },
          description: {
            en: 'State-of-the-art Italian single and double cylinder electronic machines capable of 96N to 200N gauge high-density knitting.',
            de: 'Modernste italienische Ein- und Doppelzylindermaschinen für hochdichtes Stricken von 96N bis 200N Feinheit.',
            fr: 'Machines électroniques italiennes mono et double cylindre de 96 à 200 aiguilles pour un maillage de haute densité.',
            es: 'Maquinaria electrónica italiana de uno y dos cilindros capaz de tejer densidades desde 96 hasta 200 agujas.'
          },
        },
        {
          _key: 'c2',
          title: {
            en: '72h Sample Prototyping',
            de: '72h Prototypenfertigung',
            fr: 'Prototypage Express 72h',
            es: 'Prototipado en 72 Horas'
          },
          description: {
            en: 'CAD digital patterning to custom physical sample dispatched within 72 hours with yarn lab dip verification.',
            de: 'Vom digitalen CAD-Schnittmuster zum physischen Funktionsmuster innerhalb von 72 Stunden mit Laborfarbabgleich.',
            fr: 'Du patronage numérique CAO au prototype physique expédié sous 72 heures avec contrôle spectrophotométrique.',
            es: 'Del patrón digital CAD al prototipo físico despachado en 72 horas con control de tintura en laboratorio.'
          },
        },
        {
          _key: 'c3',
          title: {
            en: 'Full Private Labeling',
            de: 'Vollständiges Private-Labeling',
            fr: 'Personnalisation Intégrale',
            es: 'Marca Blanca Integral'
          },
          description: {
            en: 'Jacquard logos, micro embroidery, silicone sole grippers, custom Pantone dyeing, and FSC certified retail packaging.',
            de: 'Jacquard-Logos, Mikro-Stickerei, rutschfeste Silikonbeschichtungen, individuelle Pantone-Färbung und FSC-zertifizierte Verpackungen.',
            fr: 'Logos jacquard, micro-broderie, semelles en silicone antidérapant, teinture Pantone dédiée et emballages certifiés FSC.',
            es: 'Logotipos jacquard, micro-bordados, inserciones de silicona antideslizante, tintes Pantone y cajas con certificado FSC.'
          },
        },
        {
          _key: 'c4',
          title: {
            en: 'Zero-Defect Audit',
            de: 'Null-Fehler-Qualitätsprüfung',
            fr: 'Contrôle Zéro Défaut',
            es: 'Auditoría Cero Defectos'
          },
          description: {
            en: '100% optical camera inspection and manual hand stretch testing. Fully Sedex, BSCI, and ISO9001 compliant.',
            de: '100% optische Kamerakontrolle und manuelle Dehnungsprüfungen. Vollständig Sedex-, BSCI- und ISO9001-zertifiziert.',
            fr: 'Inspection vidéo optique à 100% et tests d’élasticité manuels. Ateliers certifiés Sedex, BSCI et ISO9001.',
            es: 'Inspección por cámara óptica al 100% y ensayos manuales de elasticidad. Cumplimiento de normativas Sedex, BSCI e ISO9001.'
          },
        },
      ],
    }),
    defineField({
      name: 'showActionButton',
      title: 'Show Action Button (是否显示操作按钮)',
      description: '控制制造基础设施版块底部的操作按钮是否显示',
      type: 'boolean',
      initialValue: false,
      fieldset: 'buttons',
    }),
    defineField({
      name: 'actionButtonText',
      title: 'Action Button Text (操作按钮文字 - 多语言)',
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
      name: 'actionButtonUrl',
      title: 'Action Button URL (操作按钮跳转链接)',
      type: 'string',
      initialValue: '#inquiry',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'swatchSku',
      title: 'Custom Swatch Kit SKU (本区块专属样卡编号)',
      description: '指定本制造基础设施版块按钮申领时装载的样卡 SKU（留空则默认继承 RFQ Settings 中的官方通用 SKU）',
      type: 'string',
      fieldset: 'buttons',
    }),
  ],
  preview: {
    select: {
      headline: 'headline',
      adminLabel: 'adminLabel',
      badge: 'badge',
      btn: 'actionButtonText',
    },
    prepare({headline, adminLabel, badge, btn}) {
      const rawH = typeof headline === 'object' && headline ? (headline.en || Object.values(headline)[0]) : headline;
      const rawB = typeof badge === 'object' && badge ? (badge.en || Object.values(badge)[0]) : badge;
      const name = adminLabel ? adminLabel : (rawH || '制造实力基础设施');
      return {
        title: `🏭 [制造实力] ${name}`,
        subtitle: `类型: manufacturingSection · 标签: ${rawB || 'OEM/ODM Capabilities'}`,
      }
    },
  },
})
