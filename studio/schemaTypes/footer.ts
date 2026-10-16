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
      title: 'Copyright Text (版权所有文案)',
      type: 'string',
      group: 'content',
      initialValue: '© 2026 Gwenvenni Luxury Atelier Co., Ltd. All rights reserved.',
    }),
    defineField({
      name: 'description',
      title: 'Brand Bio / Footer Description (品牌定位说明)',
      type: 'text',
      rows: 2,
      group: 'content',
      initialValue:
        "Specialized manufacturer of luxury knitwear, fine silks, and precision seamless essentials for global fashion labels.",
    }),
    defineField({
      name: 'statusBadge',
      title: 'Status Badge (打样工坊实时状态)',
      type: 'string',
      group: 'content',
      initialValue: 'Sample Room: 48h Global Dispatch Active',
    }),
    defineField({
      name: 'columns',
      title: 'Footer Columns (页脚分类导航列)',
      description: 'Apple 规范：请使用 100% 纯英文单语种排版（如 Product Lines），请勿添加中文括号注脚',
      type: 'array',
      group: 'content',
      of: [
        {
          type: 'object',
          fields: [
            {
              name: 'title',
              title: 'Column Title (分类标题，如 Product Lines)',
              type: 'string',
            },
            {
              name: 'links',
              title: 'Links (链接列表 - 纯英文)',
              type: 'array',
              of: [
                {
                  type: 'object',
                  fields: [
                    {name: 'label', title: 'Label (链接文本，如 Double Ruffle Lace)', type: 'string'},
                    {name: 'url', title: 'URL (跳转地址)', type: 'string'},
                  ],
                  preview: {
                    select: {title: 'label', subtitle: 'url'},
                  },
                },
              ],
            },
          ],
          preview: {
            select: {title: 'title'},
          },
        },
      ],
      initialValue: [
        {
          _key: 'col1',
          title: 'GWENVENNI',
          links: [
            {_key: 'l11', label: 'Overview', url: '/'},
            {_key: 'l12', label: 'Hero Weave', url: '#hero'},
            {_key: 'l13', label: 'Technical Architecture', url: '#specs'},
            {_key: 'l14', label: 'Ready-to-Order', url: '#collections'},
          ],
        },
        {
          _key: 'col2',
          title: 'Hosiery Lines',
          links: [
            {_key: 'l21', label: 'Double Ruffle Lace', url: '/products/gwenvenni-double-ruffle-lace-socks'},
            {_key: 'l22', label: 'Mulberry Silk Loafers', url: '#collections'},
            {_key: 'l23', label: 'Ribbed Cashmere Crews', url: '#collections'},
            {_key: 'l24', label: '15D Seamless Tights', url: '#collections'},
          ],
        },
        {
          _key: 'col3',
          title: 'B2B Services',
          links: [
            {_key: 'l31', label: 'Request Swatch Kit', url: '#inquiry'},
            {_key: 'l32', label: 'Custom Pantone Dyeing', url: '#manufacturing'},
            {_key: 'l33', label: 'Private Label Packaging', url: '#manufacturing'},
            {_key: 'l34', label: 'Rapid 72h Prototyping', url: '#manufacturing'},
          ],
        },
        {
          _key: 'col4',
          title: 'Certifications',
          links: [
            {_key: 'l41', label: 'OEKO-TEX Standard 100', url: '#specs'},
            {_key: 'l42', label: 'CPSIA Certified Safe', url: '#specs'},
            {_key: 'l43', label: 'GOTS Organic Cotton', url: '#specs'},
            {_key: 'l44', label: 'ISO 9001:2015', url: '#specs'},
          ],
        },
        {
          _key: 'col5',
          title: 'Direct Inquiries',
          links: [
            {_key: 'l51', label: 'Order Swatch Kit', url: '#inquiry'},
            {_key: 'l52', label: 'Request OEM Quote', url: '#inquiry'},
            {_key: 'l53', label: 'Factory Audit Tour', url: '#manufacturing'},
            {_key: 'l54', label: 'contact@gwenvenni.com', url: 'mailto:contact@gwenvenni.com'},
          ],
        },
      ],
    }),
    defineField({
      name: 'legalLinks',
      title: 'Legal / Bottom Links (底栏法律与合规链接)',
      type: 'array',
      group: 'content',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'label', title: 'Label (链接文本)', type: 'string'},
            {name: 'url', title: 'URL (跳转地址)', type: 'string'},
          ],
          preview: {
            select: {title: 'label', subtitle: 'url'},
          },
        },
      ],
    }),
  ],
  preview: {
    select: {
      text: 'text',
    },
    prepare(selection) {
      return {
        title: selection.text,
      }
    },
  },
})
