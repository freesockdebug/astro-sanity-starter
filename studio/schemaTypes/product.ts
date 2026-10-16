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
    {name: 'specs', title: 'Technical Specifications'},
    {name: 'actions', title: 'Buttons & Inquiry (按钮与样卡申领)'},
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Product Title (产品名称)',
      type: 'string',
      validation: (Rule) => Rule.required(),
      group: 'basic',
    }),
    defineField({
      name: 'slug',
      title: 'Slug (URL 路径标识)',
      type: 'slug',
      options: {
        source: 'title',
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
      title: 'Tagline (一句话卖点/材质概述)',
      type: 'text',
      rows: 2,
      group: 'basic',
    }),
    defineField({
      name: 'shortTitle',
      title: 'Short Display Title (首页卡片短标题)',
      description: '例如：Double Ruffle Lace。若留空则自动根据主标题展示。',
      type: 'string',
      group: 'basic',
    }),
    defineField({
      name: 'statusBadge',
      title: 'Status Badge (产品状态徽章)',
      type: 'string',
      initialValue: 'Active Production Ready',
      group: 'basic',
    }),
    defineField({
      name: 'supportBadge',
      title: 'Support Badge (服务保障徽章)',
      type: 'string',
      initialValue: 'Full Private Label Support',
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
      title: 'Gallery Thumbnail Hint (画廊缩略图底部提示文案)',
      type: 'string',
      initialValue: 'Click thumbnails or use arrows to view weave, heel pocket, seamless toe & elastic welt.',
      group: 'gallery',
    }),
    defineField({
      name: 'moq',
      title: 'MOQ (最小起订量)',
      type: 'string',
      initialValue: '200 Pairs / Color',
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
            {name: 'range', title: 'Quantity Range (订购数量区间)', type: 'string'},
            {name: 'price', title: 'Unit Price (单价)', type: 'string'},
          ],
          preview: {
            select: {title: 'range', subtitle: 'price'},
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
          },
        },
      ],
      group: 'wholesale',
    }),
    defineField({
      name: 'priceNote',
      title: 'Price Table Note (阶梯价底部说明/报价备注)',
      type: 'string',
      initialValue: '* Customs, freight, and custom branded packaging quoted upon destination.',
      group: 'wholesale',
    }),
    defineField({
      name: 'paletteTitle',
      title: 'Palette Section Title (色卡标题)',
      type: 'string',
      initialValue: 'Available In-Stock Yarn Palette:',
      group: 'wholesale',
    }),
    defineField({
      name: 'specsBadge',
      title: 'Specs Section Badge (工艺参数分类上标)',
      type: 'string',
      initialValue: 'Quality Standard',
      group: 'specs',
    }),
    defineField({
      name: 'specsHeading',
      title: 'Specs Section Heading (工艺参数区块大标题)',
      type: 'string',
      initialValue: 'Complete Technical Specifications',
      group: 'specs',
    }),
    defineField({
      name: 'specifications',
      title: 'Technical Specs (工业级工艺指标)',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {name: 'label', title: 'Spec Label (参数项目)', type: 'string'},
            {name: 'value', title: 'Spec Value (参数指标内容)', type: 'string'},
          ],
          preview: {
            select: {title: 'label', subtitle: 'value'},
          },
        },
      ],
      group: 'specs',
    }),
    defineField({
      name: 'addToQuoteButtonText',
      title: 'Add to Quote Button Text (加入询盘车按钮文案)',
      description: '留空将默认使用全站设置 (Add to Quote Basket)',
      type: 'string',
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
      title: 'Sample Button Text (买样按钮文案)',
      description: '留空将默认显示为: Order Sample on Amazon',
      type: 'string',
      initialValue: 'Order Sample on Amazon',
      group: 'actions',
    }),
    defineField({
      name: 'primaryButtonText',
      title: 'Primary Action Button (主行动按钮文案)',
      type: 'string',
      initialValue: 'Request Swatch Kit',
      group: 'actions',
    }),
    defineField({
      name: 'secondaryButtonText',
      title: 'Secondary Action Button (副操作按钮文案)',
      type: 'string',
      initialValue: 'Download Tech Pack & Line Sheet (PDF)',
      group: 'actions',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      subtitle: 'sku',
      media: 'mainImage',
    },
  },
})
