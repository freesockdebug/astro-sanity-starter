import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'inquiry',
  title: 'B2B RFQ Inquiries (采购询盘)',
  type: 'document',
  fields: [
    defineField({
      name: 'company',
      title: 'Company / Brand Name (公司/品牌)',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'buyerName',
      title: 'Buyer Name (联系人)',
      type: 'string',
    }),
    defineField({
      name: 'email',
      title: 'Work Email (业务邮箱)',
      type: 'string',
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: 'whatsapp',
      title: 'WhatsApp / Phone (电话)',
      type: 'string',
    }),
    defineField({
      name: 'destination',
      title: 'Shipping Destination (目的港/国家)',
      type: 'string',
    }),
    defineField({
      name: 'inquiryType',
      title: 'Inquiry Source Type (询盘来源类型)',
      type: 'string',
      options: {
        list: [
          { title: 'Quote Cart Drawer (多款合并询盘车)', value: 'quote_cart' },
          { title: 'Quick Modal (单品极速询价)', value: 'quick_inquiry' },
          { title: 'Sample Swatch Kit (寄样申请)', value: 'sample_swatch' },
        ],
      },
      initialValue: 'quote_cart',
    }),
    defineField({
      name: 'status',
      title: 'Follow-up Status (跟进状态)',
      type: 'string',
      options: {
        list: [
          { title: '🟢 New / Pending (新询盘待处理)', value: 'pending' },
          { title: '🟡 Contacted (已联系沟通)', value: 'contacted' },
          { title: '🔵 Quoted / Sent PI (已报价/寄样)', value: 'quoted' },
          { title: '⚪ Closed / Archived (已归档)', value: 'closed' },
        ],
      },
      initialValue: 'pending',
    }),
    defineField({
      name: 'itemsSummary',
      title: 'Requested Styles Summary (询价款式汇总)',
      type: 'text',
      rows: 4,
    }),
    defineField({
      name: 'notes',
      title: 'Customization Requirements & Notes (买家需求备注)',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'rawItems',
      title: 'Raw Items JSON Payload',
      type: 'text',
      readOnly: true,
      hidden: true,
    }),
    defineField({
      name: 'createdAt',
      title: 'Submitted At (提交时间)',
      type: 'datetime',
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      company: 'company',
      email: 'email',
      status: 'status',
      createdAt: 'createdAt',
    },
    prepare({ company, email, status, createdAt }) {
      const statusIcon = status === 'pending' ? '🟢 [NEW]' : status === 'contacted' ? '🟡' : '🔵';
      const dateStr = createdAt ? new Date(createdAt).toLocaleDateString() : '';
      return {
        title: `${statusIcon} ${company || 'Unnamed Company'}`,
        subtitle: `${email || ''} · ${dateStr}`,
      };
    },
  },
});
