import {defineField, defineType} from 'sanity'
import {EnvelopeIcon} from '@sanity/icons/Envelope'
export default defineType({
  name: 'inquirySection',
  title: '📩 商务咨询与行动转化 (Inquiry & Conversion)',
  type: 'object',
  icon: EnvelopeIcon,
  fieldsets: [
    {
      name: 'buttons',
      title: '🔘 Submit Button (提交按钮配置)',
      options: {collapsible: true, collapsed: false},
    },
  ],
  fields: [
    defineField({
      name: 'adminLabel',
      title: 'Admin Label (版块管理别名 / 备注)',
      description: '【推荐后台备注】在页面版块列表中直观显示此名字（如：首页底部样卡申领、打样合作等）',
      type: 'string',
    }),
    defineField({
      name: 'badge',
      title: 'Badge (上标标签 - 多语言)',
      type: 'localeString',
      initialValue: {
        en: 'B2B Sample Room',
        de: 'B2B-Musterraum',
        fr: 'Showroom Échantillons B2B',
        es: 'Sala de Muestras B2B'
      },
    }),
    defineField({
      name: 'headline',
      title: 'Headline (标题 - 多语言)',
      type: 'localeString',
      initialValue: {
        en: 'Request Your Curated Swatch Kit',
        de: 'Fordern Sie Ihr kuratiertes Muster-Set an',
        fr: 'Commandez Votre Kit d’Échantillons Dédié',
        es: 'Solicite su Kit de Muestras Personalizado'
      },
    }),
    defineField({
      name: 'subline',
      title: 'Subline (说明文案 - 多语言)',
      type: 'localeText',
      initialValue: {
        en: 'Feel the micron-level hand feel in person. Verified fashion labels, buying offices, and independent designers receive curated swatch books dispatched within 48 hours.',
        de: 'Erleben Sie die mikroskopische Haptik selbst. Verifizierte Modemarken, Einkaufsbüros und Designer erhalten kostenlose Musterbücher innerhalb von 48 Stunden.',
        fr: 'Touchez du doigt la précision microscopique de nos mailles. Les marques de mode et bureaux d’achat vérifiés reçoivent un dossier d’échantillons offert en 48h.',
        es: 'Compruebe en persona la suavidad microscópica de nuestros tejidos. Las marcas verificadas y oficinas de compras reciben muestrarios sin coste en 48 horas.'
      },
    }),
    defineField({
      name: 'showSection',
      title: 'Show This Section (是否显示此样卡询盘整个版块)',
      type: 'boolean',
      initialValue: true,
      fieldset: 'buttons',
    }),
    defineField({
      name: 'showButton',
      title: 'Show Submit Button (是否显示申领样卡按钮)',
      description: '控制区块内部的“Request Swatch Kit”提交按钮是否显示',
      type: 'boolean',
      initialValue: false,
      fieldset: 'buttons',
    }),
    defineField({
      name: 'buttonText',
      title: 'Submit Button Text (提交按钮文字 - 多语言)',
      type: 'localeString',
      initialValue: {
        en: 'Request Swatch Kit',
        de: 'Musteranfrage senden',
        fr: 'Envoyer la demande',
        es: 'Enviar solicitud de muestra'
      },
      fieldset: 'buttons',
    }),
    defineField({
      name: 'swatchSku',
      title: 'Custom Swatch Kit SKU (本区块专属样卡编号)',
      description: '指定本版块申领时装载的样卡 SKU（留空则默认继承 RFQ Settings 中的官方通用 SKU）',
      type: 'string',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'categories',
      title: 'Sample Category Checkboxes (样卡可选品类勾选项 - 纯英文)',
      description: 'Apple 规范：请使用纯英文命名（如 Mulberry Silk、Cashmere-Silk），不要添加中文括号注释',
      type: 'array',
      of: [{type: 'string'}],
      initialValue: [
        'Double Ruffle Lace',
        'Mulberry Silk',
        'Cashmere-Silk',
        '15D Sheer Tights',
      ],
    }),
    defineField({
      name: 'successTitle',
      title: 'Success Notice Title (提交成功提示主标题 - 多语言)',
      type: 'localeString',
      initialValue: {
        en: 'Swatch Request Confirmed!',
        de: 'Musteranfrage bestätigt!',
        fr: 'Demande d’échantillon confirmée !',
        es: '¡Solicitud de muestra confirmada!'
      },
    }),
    defineField({
      name: 'successMessage',
      title: 'Success Notice Message (提交成功提示说明文案 - 多语言)',
      type: 'localeText',
      initialValue: {
        en: 'Our international account manager has received your inquiry and will dispatch the swatch dossier via DHL Express within 48 hours.',
        de: 'Unser internationaler Kundenbetreuer hat Ihre Anfrage erhalten und wird das Musterdossier innerhalb von 48 Stunden per DHL Express versenden.',
        fr: 'Notre responsable grands comptes a bien reçu votre demande et vous expédiera le dossier sous 48h via DHL Express.',
        es: 'Nuestro equipo de cuentas internacionales ha recibido su petición y le enviará el dossier por DHL Express en un plazo de 48 horas.'
      },
    }),
  ],
  preview: {
    select: {
      headline: 'headline',
      adminLabel: 'adminLabel',
      badge: 'badge',
      btn: 'buttonText',
    },
    prepare({headline, adminLabel, badge, btn}: any) {
      const rawH = typeof headline === 'string' ? headline : typeof headline === 'object' && headline ? (headline.en || headline.zh || Object.values(headline)[0]) : headline;
      const rawB = typeof badge === 'string' ? badge : typeof badge === 'object' && badge ? (badge.en || badge.zh || Object.values(badge)[0]) : badge;
      const rawBtn = typeof btn === 'string' ? btn : typeof btn === 'object' && btn ? (btn.en || btn.zh || Object.values(btn)[0]) : btn;
      const name = adminLabel || rawH || '商务咨询与样卡';
      return {
        title: `📩 [商务咨询转化] ${String(name)}`,
        subtitle: `类型: inquirySection · 标签: ${rawB ? String(rawB) : 'Sample Room'} · 按钮: ${rawBtn ? String(rawBtn) : 'Request Swatch Kit'}`,
      }
    },
  },
})
