import { defineField, defineType } from 'sanity';
import { EnvelopeIcon } from '@sanity/icons/Envelope';

export default defineType({
  name: 'rfqSettings',
  title: 'B2B RFQ Settings (询盘车与全站按钮配置)',
  type: 'document',
  icon: EnvelopeIcon,
  fieldsets: [
    {
      name: 'visibility',
      title: '🔘 全站各按钮显隐开关 (Global Button Visibility Toggles)',
      options: { collapsible: true, collapsed: false },
    },
    {
      name: 'buttons',
      title: '✏️ 全站按钮文案与默认链接 (Button Labels & Store URLs)',
      options: { collapsible: true, collapsed: false },
    },
    {
      name: 'drawer',
      title: '🛒 Quote Basket Drawer (右侧询盘抽屉全局文案)',
      options: { collapsible: true, collapsed: true },
    },
    {
      name: 'swatch',
      title: '📦 Swatch Kit Defaults (样卡申领默认项配置)',
      options: { collapsible: true, collapsed: true },
    },
    {
      name: 'feedback',
      title: '✉️ Feedback & Notices (表单提交提示语)',
      options: { collapsible: true, collapsed: true },
    },
  ],
  fields: [
    // -------------------------------------------------------------
    // 1. 全局按钮显隐开关 (Global Button Visibility Toggles)
    // -------------------------------------------------------------
    defineField({
      name: 'showSwatchKitButton',
      title: '全站 Swatch Kit 样卡申领按钮 (Master Toggle)',
      description: '【总控】若关闭此开关，全站各处默认的“Request Swatch Kit (申领样卡)”按钮将全部隐藏',
      type: 'boolean',
      initialValue: false,
      fieldset: 'visibility',
    }),
    defineField({
      name: 'showNavActionButton',
      title: '顶部导航栏：右侧主按钮 (Nav Action Button)',
      description: '控制页面顶部导航栏右侧的操作按钮（如 Request Quote / Swatch Kit）是否显示',
      type: 'boolean',
      initialValue: false,
      fieldset: 'visibility',
    }),
    defineField({
      name: 'showHeroPrimaryButton',
      title: '首页 Hero 巨幕：主操作按钮 (Hero Primary Button)',
      description: '控制首页第一屏 Hero 居中黑色主按钮（如 Request Swatch Kit）是否显示',
      type: 'boolean',
      initialValue: false,
      fieldset: 'visibility',
    }),
    defineField({
      name: 'showHeroSecondaryButton',
      title: '首页 Hero 巨幕：次操作按钮 (Hero Secondary Button)',
      description: '控制首页第一屏 Hero 次级按钮（如 Explore Line Sheets ›）是否显示',
      type: 'boolean',
      initialValue: true,
      fieldset: 'visibility',
    }),
    defineField({
      name: 'showSpecsPrimaryButton',
      title: '规格矩阵 Specs：主操作按钮 (Specs Primary Button)',
      description: '控制工艺规格 Bento 网格底部的主按钮是否显示',
      type: 'boolean',
      initialValue: false,
      fieldset: 'visibility',
    }),
    defineField({
      name: 'showSpecsSecondaryButton',
      title: '规格矩阵 Specs：次操作按钮 (Specs Secondary Button: Download PDF)',
      description: '控制工艺规格 Bento 网格底部的次级按钮（如 Download B2B Line Sheet）是否显示',
      type: 'boolean',
      initialValue: true,
      fieldset: 'visibility',
    }),
    defineField({
      name: 'showCollectionsHeaderButton',
      title: '胶囊系列 Collections：顶部操作按钮 (Collections Header Button)',
      description: '控制胶囊系列产品展示区顶部的快速申领按钮是否显示',
      type: 'boolean',
      initialValue: false,
      fieldset: 'visibility',
    }),
    defineField({
      name: 'showCardQuoteButton',
      title: '产品卡片：Quote 加车询价按钮 (Product Card Quote Button)',
      description: '控制胶囊系列及列表产品卡片右下角的黑色“Quote (加车询盘)”按钮是否显示',
      type: 'boolean',
      initialValue: true,
      fieldset: 'visibility',
    }),
    defineField({
      name: 'showManufacturingActionButton',
      title: '制造实力 Manufacturing：底部操作按钮 (Manufacturing Action Button)',
      description: '控制工厂制造基础设施版块底部的操作按钮是否显示',
      type: 'boolean',
      initialValue: false,
      fieldset: 'visibility',
    }),
    defineField({
      name: 'showInquirySection',
      title: '首页底部：样卡申领与询盘版块整体显示 (Inquiry Section Visibility)',
      description: '控制首页底部的“Request Your Curated Swatch Kit”整个询盘区域是否展示',
      type: 'boolean',
      initialValue: true,
      fieldset: 'visibility',
    }),
    defineField({
      name: 'showInquirySectionButton',
      title: '首页底部：样卡询盘区内提交按钮 (Inquiry Section Button)',
      description: '控制样卡询盘区块内部的“Request Swatch Kit”触发按钮是否显示',
      type: 'boolean',
      initialValue: false,
      fieldset: 'visibility',
    }),
    defineField({
      name: 'showProductBuySampleButton',
      title: '单品详情页：Amazon 购买样品按钮 (Buy Sample Button)',
      description: '控制产品详情页“Order Sample on Amazon”黑色主购买按钮是否显示',
      type: 'boolean',
      initialValue: true,
      fieldset: 'visibility',
    }),
    defineField({
      name: 'showProductAddToQuoteButton',
      title: '单品详情页：加入询盘车按钮 (Add to Quote Basket Button)',
      description: '控制产品详情页“Add to Quote Basket”加车按钮是否显示',
      type: 'boolean',
      initialValue: true,
      fieldset: 'visibility',
    }),
    defineField({
      name: 'showProductSpecSheetButton',
      title: '单品详情页：下载规格表按钮 (Download Spec Sheet PDF)',
      description: '控制产品详情页“Download Spec Sheet (PDF)”链接按钮是否显示',
      type: 'boolean',
      initialValue: true,
      fieldset: 'visibility',
    }),

    // -------------------------------------------------------------
    // 2. 按钮文案与默认链接 (Button Labels & Store URLs)
    // -------------------------------------------------------------
    defineField({
      name: 'btnSampleAmazonText',
      title: 'Product Page: Buy Sample Text (单品买样按钮文案)',
      type: 'string',
      initialValue: 'Order Sample on Amazon',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'defaultAmazonStoreUrl',
      title: 'Default Amazon Store URL (默认亚马逊店铺链接)',
      description: '当单个产品未填写具体 ASIN 时，点击买样按钮将默认跳转到此店铺页面',
      type: 'url',
      initialValue: 'https://www.amazon.com',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'btnAddToQuoteText',
      title: 'Product Page: Add to Quote (单品页加车按钮文案)',
      type: 'string',
      initialValue: 'Add to Quote Basket',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'cardQuoteBtnText',
      title: 'Catalog Card: Quote Button (列表卡片加车按钮文案)',
      type: 'string',
      initialValue: 'Quote',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'heroSwatchBtnText',
      title: 'Hero / Swatch Button Text (样卡申领按钮默认文案)',
      type: 'string',
      initialValue: 'Request Swatch Kit',
      fieldset: 'buttons',
    }),
    defineField({
      name: 'drawerSubmitButtonText',
      title: 'Drawer Submit Button (抽屉提交按钮文案)',
      type: 'string',
      initialValue: 'Submit Request for Quote',
      fieldset: 'buttons',
    }),

    // -------------------------------------------------------------
    // 3. 抽屉全局文案 (Quote Basket Drawer Basics)
    // -------------------------------------------------------------
    defineField({
      name: 'drawerTitle',
      title: 'Drawer Header Title (抽屉标题)',
      type: 'string',
      initialValue: 'Quote Basket',
      fieldset: 'drawer',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'drawerSubtitle',
      title: 'Drawer Subtitle (抽屉眉题/说明)',
      type: 'string',
      initialValue: 'Wholesale RFQ & Sample Dispatch',
      fieldset: 'drawer',
    }),
    defineField({
      name: 'drawerStatus',
      title: 'Status Badge (右上角时效标签)',
      type: 'string',
      initialValue: '48h Express Dispatch',
      fieldset: 'drawer',
    }),
    defineField({
      name: 'drawerEmptyTitle',
      title: 'Empty State Title (空车提示主标题)',
      type: 'string',
      initialValue: 'Your Quote Basket is empty',
      fieldset: 'drawer',
    }),
    defineField({
      name: 'drawerEmptyDesc',
      title: 'Empty State Description (空车引导文案)',
      type: 'text',
      rows: 2,
      initialValue:
        'Browse our ready-to-order capsule lines and add styles to request formal wholesale quotes, custom branding, and physical samples.',
      fieldset: 'drawer',
    }),

    // -------------------------------------------------------------
    // 4. 样卡申领默认项 (Swatch Kit Defaults)
    // -------------------------------------------------------------
    defineField({
      name: 'swatchKitSku',
      title: 'Default Swatch Kit SKU (官方色卡默认料号/编号)',
      type: 'string',
      initialValue: 'SWATCH-KIT',
      fieldset: 'swatch',
      description: '当买家点击“申领色卡/样卡”时，自动加入询盘车的商品 SKU 编号（如：SWATCH-KIT、GV-SWATCH-01 等）',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'swatchKitTitle',
      title: 'Swatch Kit Title (样卡默认项标题)',
      type: 'string',
      initialValue: 'Curated Hosiery Swatch Kit & Color Book',
      fieldset: 'swatch',
      description: '当买家点击“申领色卡/样卡”时，自动加入询盘车的样卡名称',
    }),
    defineField({
      name: 'swatchKitDesc',
      title: 'Swatch Kit Subtitle (样卡默认项说明)',
      type: 'string',
      initialValue: 'Physical fabric swatches & yarn color dossier via DHL Express',
      fieldset: 'swatch',
    }),
    defineField({
      name: 'swatchKitOptions',
      title: 'Swatch Kit Presets / Options (多色卡系列 SKU 预设库)',
      type: 'array',
      fieldset: 'swatch',
      description: '若工厂针对不同系列拥有专属色卡册，可在此登记多个 SKU，例如：SW-RUFFLE（婴童蕾丝册）、SW-CASHMERE（羊绒丝绸高奢册）等',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'sku', title: 'SKU 料号', type: 'string', validation: (Rule) => Rule.required() }),
            defineField({ name: 'title', title: '样卡名称', type: 'string', validation: (Rule) => Rule.required() }),
            defineField({ name: 'desc', title: '说明内容 (Description)', type: 'string' }),
            defineField({ name: 'moq', title: '起订量说明 (MOQ)', type: 'string', initialValue: '1 Set (Priority Dispatch)' }),
          ],
          preview: {
            select: {
              title: 'title',
              subtitle: 'sku',
            },
          },
        },
      ],
    }),

    // -------------------------------------------------------------
    // 5. 提示语 (Feedback & Notices)
    // -------------------------------------------------------------
    defineField({
      name: 'drawerSuccessMessage',
      title: 'Success Feedback Message (提交成功提示语)',
      type: 'text',
      rows: 2,
      initialValue:
        '✓ Quote request received! Our B2B specialist will reply with official wholesale quotation and PI within 24 hours.',
      fieldset: 'feedback',
    }),
    defineField({
      name: 'drawerErrorMessage',
      title: 'Error Message (网络或提交失败提示语)',
      type: 'string',
      initialValue: 'Submission failed. Please check your connection and try again.',
      fieldset: 'feedback',
    }),
  ],
  preview: {
    select: {
      title: 'drawerTitle',
      subtitle: 'drawerSubtitle',
    },
    prepare({ title, subtitle }) {
      return {
        title: title || 'B2B RFQ Settings',
        subtitle: subtitle || '全站按钮显隐与询盘车文案配置',
      };
    },
  },
});
