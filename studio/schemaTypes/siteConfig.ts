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
      name: 'performance',
      title: '性能与边缘缓存 (Performance & Cache)',
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
      title: '启用 Cloudflare 图片边缘代理与长效缓存',
      description:
        '开启后，Sanity 图片统一经由 Cloudflare 边缘代理 (/cdn-image) 提供服务并享有 1 年强缓存，极大降低 Sanity 流量与转换配额消耗。',
      type: 'boolean',
      initialValue: true,
      group: 'performance',
    }),
    defineField({
      name: 'edgeCacheTtl',
      title: 'HTML 页面边缘缓存有效期 (Edge Cache TTL - 秒)',
      description:
        'Cloudflare 全球边缘 CDN 对 HTML 页面的缓存时长。推荐 300 秒（5 分钟），既能保证极致首屏速度（TTFB ~20ms），又能有效防止部署新版本时因旧缓存导致静态资源错乱。设置为 0 表示实时穿透（不缓存）。',
      type: 'number',
      initialValue: 300,
      options: {
        list: [
          { title: '0 秒 (实时穿透 - 不缓存)', value: 0 },
          { title: '60 秒 (1 分钟 - 频繁调试更新)', value: 60 },
          { title: '300 秒 (5 分钟 - 推荐黄金标准)', value: 300 },
          { title: '900 秒 (15 分钟 - 低频变动)', value: 900 },
          { title: '1800 秒 (30 分钟)', value: 1800 },
          { title: '3600 秒 (1 小时)', value: 3600 },
          { title: '86400 秒 (24 小时 - 长效锁定，需配合自动 Purge)', value: 86400 },
        ],
      },
      group: 'performance',
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
