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
      title: 'Badge Label (上标分类 - 多语言)',
      type: 'localeString',
      initialValue: {
        en: 'Engineered Construction',
        de: 'Technische Architektur',
        fr: 'Architecture Technique',
        es: 'Arquitectura Técnica'
      },
    }),
    defineField({
      name: 'title',
      title: 'Title (Apple 风格主标题 - 多语言)',
      type: 'localeString',
      initialValue: {
        en: 'Specification Matrix',
        de: 'Präzision bis auf den Mikrometer.',
        fr: 'Façonné au micron près.',
        es: 'Diseñado al milímetro.'
      },
    }),
    defineField({
      name: 'description',
      title: 'Subtitle / Description (浅灰叙事副标题 - 多语言)',
      type: 'localeText',
      initialValue: {
        en: 'We treat the architectural construction of luxury knitwear with the exactitude of horology. Every seam, tension zone, and yarn twist is calibrated for zero friction.',
        de: 'Jeder Faden ist auf maximale Langlebigkeit im Einzelhandel und reibungsfreien Tragekomfort ausgelegt.',
        fr: 'Chaque fil est conçu pour une longévité commerciale irréprochable et un confort sans friction.',
        es: 'Cada fibra está optimizada para ofrecer máxima durabilidad comercial y un tacto sin fricción.'
      },
    }),
    // Bento 1
    defineField({
      name: 'bento1Tag',
      title: 'Bento 1 Tag (上标 - 多语言)',
      type: 'localeString',
      fieldset: 'bento1',
      initialValue: {
        en: 'Yarn Architecture',
        de: 'Garn-Architektur',
        fr: 'Architecture du Fil',
        es: 'Estructura del Hilo'
      },
    }),
    defineField({
      name: 'bento1Title',
      title: 'Bento 1 Title (标题 - 多语言)',
      type: 'localeString',
      fieldset: 'bento1',
      initialValue: {
        en: '60s/2 Double-Ply Combed Cotton.',
        de: '60s/2 Zweifach gekämmte Baumwolle.',
        fr: 'Coton Peigné Double Retors 60s/2.',
        es: 'Algodón Peinado de Doble Cabo 60s/2.'
      },
    }),
    defineField({
      name: 'bento1Description',
      title: 'Bento 1 Description (说明文案 - 多语言)',
      type: 'localeText',
      fieldset: 'bento1',
      initialValue: {
        en: 'Ultra-long staple combed fibers spun for anti-pilling longevity (Grade 4.5) and a breathable, second-skin handfeel across 50+ wash cycles.',
        de: 'Extralangstapelige gekämmte Fasern für langanhaltenden Anti-Pilling-Schutz (Stufe 4.5) und ein seidiges Zweite-Haut-Gefühl über 50+ Waschzyklen.',
        fr: 'Fibres peignées extra-longues pour une tenue anti-boulochage durable (Grade 4.5) et un toucher seconde peau sur plus de 50 lavages.',
        es: 'Fibras peinadas de fibra extralarga para evitar la formación de bolitas (Grado 4.5) y un tacto de segunda piel tras más de 50 lavados.'
      },
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
      title: 'Bento 2 Tag (上标 - 多语言)',
      type: 'localeString',
      fieldset: 'bento2',
      initialValue: {
        en: 'Toe Closure',
        de: 'Spitzenverarbeitung',
        fr: 'Finition Pointeur',
        es: 'Cierre de Puntera'
      },
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
      title: 'Bento 2 Title (主标题 - 多语言)',
      type: 'localeString',
      fieldset: 'bento2',
      initialValue: {
        en: 'Hand-Linked Seamless',
        de: 'Handgekettelt Nahtlos',
        fr: 'Rémaillage Main Sans Couture',
        es: 'Remallado a Mano Sin Costuras'
      },
    }),
    defineField({
      name: 'bento2Description',
      title: 'Bento 2 Description (说明文案 - 多语言)',
      type: 'localeText',
      fieldset: 'bento2',
      initialValue: {
        en: 'Individual loop-by-loop manual interlocking eliminates interior ridges for zero pressure on toes.',
        de: 'Masche-für-Masche manuell verknüpft – verhindert störende Innennähte für druckfreien Tragekomfort an den Zehen.',
        fr: 'Fermeture maille par maille éliminant tout bourrelet intérieur pour une pression nulle sur les orteils.',
        es: 'Enlazado bucle a bucle que suprime los rebordes interiores para eliminar cualquier presión en los dedos.'
      },
    }),
    defineField({
      name: 'bento2BadgeText',
      title: 'Bento 2 Badge Text (左下认证 - 多语言)',
      type: 'localeString',
      fieldset: 'bento2',
      initialValue: {
        en: 'OEKO-TEX® 100 Class I',
        de: 'OEKO-TEX® 100 Klasse I',
        fr: 'OEKO-TEX® 100 Classe I',
        es: 'OEKO-TEX® 100 Clase I'
      },
    }),
    defineField({
      name: 'bento2BadgeStatus',
      title: 'Bento 2 Badge Status (右下绿字 - 多语言)',
      type: 'localeString',
      fieldset: 'bento2',
      initialValue: {
        en: 'Certified Safe',
        de: 'Zertifiziert sicher',
        fr: 'Certifié sans risque',
        es: 'Seguridad certificada'
      },
    }),

    // Bento 3
    defineField({
      name: 'bento3Tag',
      title: 'Bento 3 Tag (上标 - 多语言)',
      type: 'localeString',
      fieldset: 'bento3',
      initialValue: {
        en: 'Machine Gauge',
        de: 'Maschinenteilung',
        fr: 'Jauge Machine',
        es: 'Galga de Maquinaria'
      },
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
      title: 'Bento 3 Title (主标题 - 多语言)',
      type: 'localeString',
      fieldset: 'bento3',
      initialValue: {
        en: 'Lonati Cylinders',
        de: 'Lonati-Zylinder',
        fr: 'Cylindres Lonati',
        es: 'Cilindros Lonati'
      },
    }),
    defineField({
      name: 'bento3Description',
      title: 'Bento 3 Description (说明文案 - 多语言)',
      type: 'localeText',
      fieldset: 'bento3',
      initialValue: {
        en: 'Italian high-density circular knit delivering refined micro-rib clarity with zero distortion.',
        de: 'Italienischer hochdichter Rundstrick für gestochen scharfe Feinripp-Strukturen ohne Verzug.',
        fr: 'Tricotage circulaire italien haute densité offrant une netteté absolue des micro-côtes sans déformation.',
        es: 'Tejido circular italiano de alta densidad que ofrece canales micro-rib de máxima nitidez sin deformación.'
      },
    }),
    defineField({
      name: 'bento3FooterNote',
      title: 'Bento 3 Footer Note (底部参数说明 - 多语言)',
      type: 'localeString',
      fieldset: 'bento3',
      initialValue: {
        en: 'Tolerance: ±0.5% Needle Pitch',
        de: 'Toleranz: ±0,5% Nadelteilung',
        fr: 'Tolérance: ±0,5% d’écartement d’aiguilles',
        es: 'Tolerancia: ±0,5% en paso de aguja'
      },
    }),

    // Bento 4
    defineField({
      name: 'bento4Tag',
      title: 'Bento 4 Tag (上标 - 多语言)',
      type: 'localeString',
      fieldset: 'bento4',
      initialValue: {
        en: 'Elasticity & Recovery',
        de: 'Elastizität',
        fr: 'Élasticité',
        es: 'Elasticidad'
      },
    }),
    defineField({
      name: 'bento4Stat',
      title: 'Bento 4 Stat (大数值，如 ZeroMark)',
      type: 'string',
      fieldset: 'bento4',
      initialValue: 'ZeroMark',
    }),
    defineField({
      name: 'bento4Unit',
      title: 'Bento 4 Unit (单位，如 Band)',
      type: 'string',
      fieldset: 'bento4',
      initialValue: 'Band',
    }),
    defineField({
      name: 'bento4Title',
      title: 'Bento 4 Title (主标题 - 多语言)',
      type: 'localeString',
      fieldset: 'bento4',
      initialValue: {
        en: 'Lycra Soft-Stretch Welt',
        de: 'Lycra Soft-Stretch',
        fr: 'Lycra Soft-Stretch',
        es: 'Lycra Soft-Stretch'
      },
    }),
    defineField({
      name: 'bento4Description',
      title: 'Bento 4 Description (说明文案 - 多语言)',
      type: 'localeText',
      fieldset: 'bento4',
      initialValue: {
        en: 'Graduated tension cuff holds securely without calf indents or vascular restriction.',
        de: 'Abgestufte Schaftspannung für sicheren Halt ohne Wadenabdrücke oder Einschnürungen.',
        fr: 'Bord-côte à tension progressive assurant une tenue parfaite sans marquer ni comprimer le mollet.',
        es: 'Puño con tensión progresiva que sujeta firmemente sin marcar ni oprimir la pantorrilla.'
      },
    }),
    defineField({
      name: 'bento4FooterNote',
      title: 'Bento 4 Footer Note (底部参数说明 - 多语言)',
      type: 'localeString',
      fieldset: 'bento4',
      initialValue: {
        en: 'Anti-Slip Silicone Compatible',
        de: 'Kompatibel mit rutschfestem Silikon',
        fr: 'Compatible avec bande silicone antiglisse',
        es: 'Compatible con inserciones de silicona antideslizante'
      },
    }),

    // Bento 5
    defineField({
      name: 'bento5Tag',
      title: 'Bento 5 Tag (上标 - 多语言)',
      type: 'localeString',
      fieldset: 'bento5',
      initialValue: {
        en: 'Sampling Speed',
        de: 'Mustergeschwindigkeit',
        fr: 'Vitesse d’Échantillonnage',
        es: 'Velocidad de Muestreo'
      },
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
      title: 'Bento 5 Title (主标题 - 多语言)',
      type: 'localeString',
      fieldset: 'bento5',
      initialValue: {
        en: 'Global Courier Dispatch',
        de: 'Globaler Kurierversand',
        fr: 'Expédition Express Mondiale',
        es: 'Envío Courier Global'
      },
    }),
    defineField({
      name: 'bento5Description',
      title: 'Bento 5 Description (说明文案 - 多语言)',
      type: 'localeText',
      fieldset: 'bento5',
      initialValue: {
        en: 'Curated fabric swatch books and custom lab dip samples dispatched via DHL Express in 48 hours.',
        de: 'Kuratierte Stoffmusterbücher und individuelle Farbmusterabzüge innerhalb von 48 Stunden per DHL Express versandt.',
        fr: 'Nuanciers de tissus et échantillons de teinture sur mesure expédiés en 48 heures via DHL Express.',
        es: 'Muestrarios de tejidos seleccionados y pruebas de laboratorio enviadas en 48 horas mediante DHL Express.'
      },
    }),
    defineField({
      name: 'bento5FooterNote',
      title: 'Bento 5 Footer Note (底部参数说明 - 多语言)',
      type: 'localeString',
      fieldset: 'bento5',
      initialValue: {
        en: 'Bulk Lead: 14 – 18 Working Days',
        de: 'Großauftrag-Lieferzeit: 14 – 18 Werktage',
        fr: 'Délai de production de gros: 14 – 18 jours ouvrés',
        es: 'Plazo de pedidos mayoristas: 14 – 18 días laborables'
      },
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
      title: 'Secondary Button Text (副按钮文字 - 多语言)',
      type: 'localeString',
      initialValue: {
        en: 'Download B2B Line Sheet (PDF)',
        de: 'Kollektionen erkunden',
        fr: 'Explorer les collections',
        es: 'Explorar colecciones'
      },
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
      const rawTitle = typeof title === 'object' && title ? (title.en || Object.values(title)[0]) : title;
      const rawBadge = typeof badge === 'object' && badge ? (badge.en || Object.values(badge)[0]) : badge;
      const name = adminLabel ? adminLabel : (rawTitle || '核心工艺与规格');
      return {
        title: `📐 [特性规格矩阵] ${name}`,
        subtitle: `类型: featureMatrixSection · 标签: ${rawBadge || 'Technical Specs'}`,
        media,
      }
    },
  },
})
