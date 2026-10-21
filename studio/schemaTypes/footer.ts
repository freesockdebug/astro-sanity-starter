import {defineField, defineType} from 'sanity'
import {SquareIcon} from '@sanity/icons/Square'

export default defineType({
  name: 'footer',
  title: 'Footer',
  type: 'object',
  icon: SquareIcon,
  groups: [
    {
      name: 'content',
      title: 'Content',
      default: true,
    },
  ],
  fields: [
    defineField({
      name: 'text',
      title: 'Copyright Text (版权所有文案 - 多语言)',
      type: 'localeString',
      group: 'content',
      options: {collapsible: true, collapsed: true},
    }),
    defineField({
      name: 'description',
      title: 'Brand Bio / Footer Description (品牌定位说明 - 多语言)',
      type: 'localeText',
      group: 'content',
      options: {collapsible: true, collapsed: true},
    }),
    defineField({
      name: 'statusBadge',
      title: 'Status Badge (打样工坊实时状态 - 多语言)',
      type: 'localeString',
      group: 'content',
      options: {collapsible: true, collapsed: true},
    }),
    defineField({
      name: 'columns',
      title: 'Footer Columns (页脚分类导航列 - 多语言)',
      description: '支持配置分类标题及链接的多语言翻译（英语/德语/法语/西班牙语）',
      type: 'array',
      group: 'content',
      of: [
        {
          type: 'object',
          fields: [
            {
              name: 'title',
              title: 'Column Title (分类标题 - 多语言)',
              type: 'localeString',
              options: {collapsible: true, collapsed: true},
            },
            {
              name: 'links',
              title: 'Links (链接列表 - 多语言)',
              type: 'array',
              of: [
                {
                  type: 'object',
                  fields: [
                    {
                      name: 'label',
                      title: 'Label (链接文本 - 多语言)',
                      type: 'localeString',
                      options: {collapsible: true, collapsed: true},
                    },
                    {name: 'url', title: 'URL (跳转地址)', type: 'string'},
                  ],
                  preview: {
                    select: {titleEn: 'label.en', rawTitle: 'label', subtitle: 'url'},
                    prepare({titleEn, rawTitle, subtitle}) {
                      const resolvedTitle = typeof rawTitle === 'string' ? rawTitle : titleEn;
                      return {
                        title: resolvedTitle || subtitle || 'Link',
                        subtitle,
                      }
                    },
                  },
                },
              ],
            },
          ],
          preview: {
            select: {titleEn: 'title.en', rawTitle: 'title'},
            prepare({titleEn, rawTitle}) {
              const resolvedTitle = typeof rawTitle === 'string' ? rawTitle : titleEn;
              return {
                title: resolvedTitle || 'Column',
              }
            },
          },
        },
      ],
      initialValue: [
        {
          _key: 'col1',
          title: {
            en: 'GWENVENNI',
            de: 'GWENVENNI',
            fr: 'GWENVENNI',
            es: 'GWENVENNI',
          },
          links: [
            {_key: 'l11', label: {en: 'Overview', de: 'Überblick', fr: 'Aperçu', es: 'Visión General'}, url: '/'},
            {_key: 'l12', label: {en: 'Hero Weave', de: 'Charakteristische Bindung', fr: 'Tricot Signature', es: 'Tejido Exclusivo'}, url: '#hero'},
            {_key: 'l13', label: {en: 'Technical Architecture', de: 'Technische Architektur', fr: 'Architecture Technique', es: 'Arquitectura Técnica'}, url: '#specs'},
            {_key: 'l14', label: {en: 'Ready-to-Order', de: 'Bestellbares Archiv', fr: 'Catalogue Prêt-à-Commander', es: 'Catálogo Listo para Pedido'}, url: '#collections'},
          ],
        },
        {
          _key: 'col2',
          title: {
            en: 'Product Lines',
            de: 'Produktlinien',
            fr: 'Lignes de Produits',
            es: 'Líneas de Producto',
          },
          links: [
            {_key: 'l21', label: {en: 'All Silhouettes Archive', de: 'Alle Modelle', fr: 'Toutes les Silhouettes', es: 'Todas las Siluetas'}, url: '/products'},
            {_key: 'l22', label: {en: 'Mulberry Silk Loafers', de: 'Maulbeerseide-Modelle', fr: 'Mocassins Soie de Mûrier', es: 'Pikis Seda de Morera'}, url: '/products'},
            {_key: 'l23', label: {en: 'Ribbed Cashmere Crews', de: 'Gerippte Kaschmirstrümpfe', fr: 'Chaussettes Côtelées Cachemire', es: 'Calcetines Canalé Cachemira'}, url: '/products'},
            {_key: 'l24', label: {en: 'Seamless Essentials', de: 'Nahtlose Basics', fr: 'Essentiels Sans Couture', es: 'Básicos Sin Costuras'}, url: '/products'},
          ],
        },
        {
          _key: 'col3',
          title: {
            en: 'B2B Services',
            de: 'B2B-Dienstleistungen',
            fr: 'Services B2B',
            es: 'Servicios B2B',
          },
          links: [
            {_key: 'l31', label: {en: 'Request Swatch Kit', de: 'Musterkollektion anfordern', fr: 'Demander un Nuancier', es: 'Solicitar Kit de Muestras'}, url: '#inquiry'},
            {_key: 'l32', label: {en: 'Custom Pantone Dyeing', de: 'Individuelle Pantone-Färbung', fr: 'Teinture Pantone Dédiée', es: 'Tintado Pantone Personalizado'}, url: '#manufacturing'},
            {_key: 'l33', label: {en: 'Private Label Packaging', de: 'Private-Label-Verpackung', fr: 'Conditionnement Marque Blanche', es: 'Empaque de Marca Blanca'}, url: '#manufacturing'},
            {_key: 'l34', label: {en: 'Rapid 72h Prototyping', de: 'Express-Prototyping 72h', fr: 'Prototypage Express 72h', es: 'Prototipado Rápido 72h'}, url: '#manufacturing'},
          ],
        },
        {
          _key: 'col4',
          title: {
            en: 'Certifications',
            de: 'Zertifizierungen',
            fr: 'Certifications',
            es: 'Certificaciones',
          },
          links: [
            {_key: 'l41', label: {en: 'OEKO-TEX Standard 100', de: 'OEKO-TEX Standard 100', fr: 'OEKO-TEX Standard 100', es: 'OEKO-TEX Standard 100'}, url: '#specs'},
            {_key: 'l42', label: {en: 'CPSIA Certified Safe', de: 'CPSIA Zertifiziert', fr: 'Certifié CPSIA', es: 'Certificado CPSIA'}, url: '#specs'},
            {_key: 'l43', label: {en: 'GOTS Organic Cotton', de: 'GOTS Bio-Baumwolle', fr: 'Coton Biologique GOTS', es: 'Algodón Orgánico GOTS'}, url: '#specs'},
            {_key: 'l44', label: {en: 'ISO 9001:2015', de: 'ISO 9001:2015', fr: 'ISO 9001:2015', es: 'ISO 9001:2015'}, url: '#specs'},
          ],
        },
        {
          _key: 'col5',
          title: {
            en: 'Direct Inquiries',
            de: 'Direktanfragen',
            fr: 'Demandes Directes',
            es: 'Consultas Directas',
          },
          links: [
            {_key: 'l51', label: {en: 'Order Swatch Kit', de: 'Musterbuch bestellen', fr: 'Commander un Nuancier', es: 'Pedir Muestrario'}, url: '#inquiry'},
            {_key: 'l52', label: {en: 'Request OEM Quote', de: 'OEM-Angebot anfordern', fr: 'Demande de Devis OEM', es: 'Solicitar Presupuesto OEM'}, url: '#inquiry'},
            {_key: 'l53', label: {en: 'Factory Audit Tour', de: 'Werksbesichtigung', fr: 'Visite d\'Audit Usine', es: 'Visita de Auditoría a Fábrica'}, url: '#manufacturing'},
            {_key: 'l54', label: {en: 'contact@gwenvenni.com', de: 'contact@gwenvenni.com', fr: 'contact@gwenvenni.com', es: 'contact@gwenvenni.com'}, url: 'mailto:contact@gwenvenni.com'},
          ],
        },
      ],
    }),
    defineField({
      name: 'legalLinks',
      title: 'Legal / Bottom Links (底栏法律与合规链接 - 多语言)',
      type: 'array',
      group: 'content',
      of: [
        {
          type: 'object',
          fields: [
            {
              name: 'label',
              title: 'Label (链接文本 - 多语言)',
              type: 'localeString',
              options: {collapsible: true, collapsed: true},
            },
            {name: 'url', title: 'URL (跳转地址)', type: 'string'},
          ],
          preview: {
            select: {titleEn: 'label.en', rawTitle: 'label', subtitle: 'url'},
            prepare({titleEn, rawTitle, subtitle}) {
              const resolvedTitle = typeof rawTitle === 'string' ? rawTitle : titleEn;
              return {
                title: resolvedTitle || subtitle || 'Legal Link',
                subtitle,
              }
            },
          },
        },
      ],
      initialValue: [
        {
          _key: 'leg1',
          label: {en: 'Privacy Policy', de: 'Datenschutzrichtlinie', fr: 'Politique de Confidentialité', es: 'Política de Privacidad'},
          url: '#',
        },
        {
          _key: 'leg2',
          label: {en: 'Supply Agreement', de: 'Liefervereinbarung', fr: 'Contrat d\'Approvisionnement', es: 'Acuerdo de Suministro'},
          url: '#',
        },
        {
          _key: 'leg3',
          label: {en: 'Export Compliance', de: 'Export-Compliance', fr: 'Conformité Export', es: 'Cumplimiento de Exportación'},
          url: '#',
        },
      ],
    }),
  ],
  preview: {
    select: {
      textEn: 'text.en',
      rawText: 'text',
    },
    prepare({textEn, rawText}) {
      const resolved = typeof rawText === 'string' ? rawText : textEn;
      return {
        title: resolved || 'Footer Configuration',
      }
    },
  },
})
