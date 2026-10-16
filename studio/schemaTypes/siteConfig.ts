import {defineField, defineType} from 'sanity'
import {CogIcon} from '@sanity/icons/Cog'
export default defineType({
  name: 'siteConfig',
  title: 'Site Configuration',
  description: 'Site general settings, header and footer configuration.',
  type: 'document',
  icon: CogIcon,
  groups: [
    {
      name: 'content',
      title: 'Content',
      default: true,
    },
    {
      name: 'rfq',
      title: 'B2B RFQ (询盘车与极速询价设置)',
    },
    {
      name: 'seo',
      title: 'SEO',
    },
  ],
  fields: [
    defineField({
      name: 'favicon',
      title: 'Favicon',
      type: 'image',
      group: 'content',
    }),
    defineField({
      name: 'header',
      title: 'Header',
      type: 'header',
      group: 'content',
    }),
    defineField({
      name: 'footer',
      title: 'Footer',
      type: 'footer',
      group: 'content',
    }),
    defineField({
      name: 'rfqConfig',
      title: 'B2B RFQ & Quote Basket Settings (询盘车与极速询价文案与配置)',
      type: 'object',
      group: 'rfq',
      fields: [
        defineField({
          name: 'showSwatchKitButton',
          title: '全站 Swatch Kit 样卡申领按钮 (Master Toggle)',
          description: '【总控】若关闭此开关，全站各处默认的“Request Swatch Kit”按钮将全部隐藏',
          type: 'boolean',
          initialValue: false,
        }),
        defineField({
          name: 'showNavActionButton',
          title: '顶部导航栏：右侧主按钮 (Nav Action Button)',
          type: 'boolean',
          initialValue: false,
        }),
        defineField({
          name: 'showHeroPrimaryButton',
          title: '首页 Hero：主操作按钮 (Hero Primary Button)',
          type: 'boolean',
          initialValue: false,
        }),
        defineField({
          name: 'showHeroSecondaryButton',
          title: '首页 Hero：次操作按钮 (Hero Secondary Button)',
          type: 'boolean',
          initialValue: true,
        }),
        defineField({
          name: 'showSpecsPrimaryButton',
          title: '规格矩阵 Specs：主操作按钮 (Specs Primary Button)',
          type: 'boolean',
          initialValue: false,
        }),
        defineField({
          name: 'showSpecsSecondaryButton',
          title: '规格矩阵 Specs：次操作按钮 (Specs Secondary Button)',
          type: 'boolean',
          initialValue: true,
        }),
        defineField({
          name: 'showCollectionsHeaderButton',
          title: '胶囊系列 Collections：顶部操作按钮',
          type: 'boolean',
          initialValue: false,
        }),
        defineField({
          name: 'showCardQuoteButton',
          title: '产品卡片：Quote 加车询价按钮',
          type: 'boolean',
          initialValue: true,
        }),
        defineField({
          name: 'showManufacturingActionButton',
          title: '制造实力 Manufacturing：底部操作按钮',
          type: 'boolean',
          initialValue: false,
        }),
        defineField({
          name: 'showInquirySection',
          title: '首页底部：样卡申领与询盘版块整体显示',
          type: 'boolean',
          initialValue: true,
        }),
        defineField({
          name: 'showInquirySectionButton',
          title: '首页底部：样卡询盘区内提交按钮',
          type: 'boolean',
          initialValue: false,
        }),
        defineField({
          name: 'showProductBuySampleButton',
          title: '单品详情页：Amazon 购买样品按钮',
          type: 'boolean',
          initialValue: true,
        }),
        defineField({
          name: 'showProductAddToQuoteButton',
          title: '单品详情页：加入询盘车按钮',
          type: 'boolean',
          initialValue: true,
        }),
        defineField({
          name: 'showProductSpecSheetButton',
          title: '单品详情页：下载规格表按钮',
          type: 'boolean',
          initialValue: true,
        }),
        defineField({
          name: 'drawerTitle',
          title: 'Quote Basket Drawer Title (询盘车抽屉大标题)',
          type: 'string',
          initialValue: 'Quote Basket',
        }),
        defineField({
          name: 'drawerSubtitle',
          title: 'Drawer Subtitle / Status (抽屉副标/时效标签)',
          type: 'string',
          initialValue: 'Wholesale RFQ Submission · 48h Express Dispatch',
        }),
        defineField({
          name: 'drawerEmptyTitle',
          title: 'Empty State Title (空车提示大标题)',
          type: 'string',
          initialValue: 'Your Quote Basket is empty',
        }),
        defineField({
          name: 'drawerEmptyDesc',
          title: 'Empty State Description (空车说明引导文案)',
          type: 'text',
          rows: 2,
          initialValue: 'Browse our ready-to-order capsule lines and add styles to request formal wholesale quotes and samples.',
        }),
        defineField({
          name: 'drawerSubmitButtonText',
          title: 'Drawer Submit Button Text (抽屉提交按钮文字)',
          type: 'string',
          initialValue: 'Submit Request for Quote',
        }),
        defineField({
          name: 'drawerSuccessMessage',
          title: 'Drawer Success Feedback (抽屉提交成功提示语)',
          type: 'string',
          initialValue: '✓ Quote request received! Our B2B specialist will reply within 24 hours.',
        }),
        defineField({
          name: 'btnAddToQuoteText',
          title: 'Global Add to Quote Button Text (全局加入询盘车按钮文案)',
          type: 'string',
          initialValue: 'Add to Quote Basket',
        }),
        defineField({
          name: 'cardQuoteBtnText',
          title: 'Homepage Card Quote Button Text (首页卡片加车按钮文案)',
          type: 'string',
          initialValue: '+ Quote',
        }),
      ],
    }),
    defineField({
      name: 'titleSuffix',
      title: 'Suffix for page titles',
      description:
        'Suffix to append to the title tag of all pages, except in pages where the this behavior is disabled.',
      type: 'string',
      group: 'seo',
    }),
  ],
  preview: {
    select: {
      title: 'header.title',
    },
    prepare(selection) {
      return {
        title: selection.title,
      }
    },
  },
})
