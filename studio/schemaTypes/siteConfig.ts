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
      name: 'seo',
      title: 'SEO',
    },
    {
      name: 'integrations',
      title: '小部件与通知 (Widgets & Alerts)',
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
      name: 'enableImageProxy',
      title: 'Enable Cloudflare Image Proxy & Cache',
      description:
        'When enabled, Sanity images route through Cloudflare Edge Cache (/cdn-image) with 1-year immutable caching. This saves Sanity bandwidth and transformation quotas.',
      type: 'boolean',
      initialValue: true,
      group: 'content',
    }),
    defineField({
      name: 'titleSuffix',
      title: 'Suffix for page titles (网页标题全局后缀 - 多语言)',
      description:
        'Suffix to append to the title tag of all pages, except in pages where this behavior is disabled.',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'seo',
    }),
    // --- Widget 1: WhatsApp Click-to-Chat ---
    defineField({
      name: 'enableWhatsApp',
      title: '启用 WhatsApp 商务即时沟通气泡',
      description: '在全站右下角浮动展示极简现代 WhatsApp 气泡，方便海外采购商一键直连业务员。',
      type: 'boolean',
      initialValue: true,
      group: 'integrations',
    }),
    defineField({
      name: 'whatsAppNumber',
      title: 'WhatsApp 接收号码',
      description: '国际格式号码（必须包含国家区号，如 +8613800000000 或 +12125551234）。',
      type: 'string',
      group: 'integrations',
      hidden: ({document}) => !document?.enableWhatsApp,
    }),
    defineField({
      name: 'whatsAppPrefillText',
      title: 'WhatsApp 预设咨询文案 (多语言)',
      description: '客户点击后对话框默认带出的问候语。',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'integrations',
      hidden: ({document}) => !document?.enableWhatsApp,
    }),
    defineField({
      name: 'whatsAppTooltip',
      title: '气泡悬浮提示词 (多语言)',
      description: '鼠标停留在气泡上时浮现的胶囊标签文案。',
      type: 'localeString',
      options: { collapsible: true, collapsed: true },
      group: 'integrations',
      hidden: ({document}) => !document?.enableWhatsApp,
    }),
    // --- Widget 4: Instant Notification Webhook ---
    defineField({
      name: 'enableNotificationWebhook',
      title: '启用询价即时通知推送',
      description: '当买手提交 Quote Basket 询盘或索样时，即时将买手信息和意向款式推送到群机器人。',
      type: 'boolean',
      initialValue: true,
      group: 'integrations',
    }),
    defineField({
      name: 'notificationWebhookUrl',
      title: '机器人 Webhook 地址 (URL)',
      description: '支持飞书、钉钉、企业微信机器人，或 Slack / Discord / 通用接收 Webhook。',
      type: 'url',
      group: 'integrations',
      hidden: ({document}) => !document?.enableNotificationWebhook,
    }),
    defineField({
      name: 'notificationRecipientEmail',
      title: '询盘告警接收邮箱',
      description: '接收询盘通知的业务员邮箱地址（留空则默认发送至 contact 邮箱）。',
      type: 'string',
      group: 'integrations',
    }),
  ],
  preview: {
    select: {
      title: 'header.title',
    },
    prepare(selection: any) {
      const title = typeof selection?.title === 'object' && selection?.title
        ? selection.title.en || selection.title.zh || Object.values(selection.title)[0]
        : selection?.title;
      return {
        title: title ? String(title) : 'Site Configuration',
      }
    },
  },
})
