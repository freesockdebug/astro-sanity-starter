// src/utils/rfqNotify.ts
// Decoupled RFQ notification service: Resend email template & instant Webhook dispatcher

import { SecurityService } from '@utils/security';
import { dispatchWebhookMessage } from '@utils/webhook';
import { DEFAULT_BRAND_TITLE, DEFAULT_CONTACT_EMAIL } from '@data/defaults';

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export interface RfqNotifyBuyer {
  company: string;
  email: string;
  name: string;
  whatsapp: string;
  destination: string;
  message: string;
}

export interface RfqNotifyItem {
  id?: string;
  title: string;
  sku: string;
  variant: string;
  quantity: number;
  imageUrl?: string;
}

export interface RfqNotifyContext {
  orderNo: string;
  effectiveBrand: string;
  buyerInfo: RfqNotifyBuyer;
  items: RfqNotifyItem[];
  resolvedDestination: string;
  visitorIp: string;
  detectedCountry: string;
  inquiryType: string;
  locale: string;
  reqHostname: string;
  systemSettings: any;
  siteConfig: any;
  getVal: (key: string) => string | undefined;
}

/**
 * Builds HTML template for B2B RFQ notification email
 */
export function buildRfqEmailHtml(params: {
  orderNo?: string;
  brandName?: string;
  safeCompany: string;
  safeName: string;
  safeEmail: string;
  safeWhatsapp: string;
  safeDestination: string;
  safeVisitorIp?: string;
  safeDetectedCountry?: string;
  safeInquiryType: string;
  safeLocale?: string;
  safeMessage: string;
  items: RfqNotifyItem[];
}): string {
  const {
    orderNo,
    brandName,
    safeCompany,
    safeName,
    safeEmail,
    safeWhatsapp,
    safeDestination,
    safeVisitorIp,
    safeDetectedCountry,
    safeInquiryType,
    safeLocale,
    safeMessage,
    items,
  } = params;
  const brand = SecurityService.escapeHtml(brandName || DEFAULT_BRAND_TITLE);

  const itemsRows = items
    .map(
      (i) => `
    <tr style="border-bottom: 1px solid #e5e5e5;">
      <td style="padding: 8px 12px;"><strong>${SecurityService.escapeHtml(i.title)}</strong><br><span style="font-size:12px;color:#737373;">${SecurityService.escapeHtml(i.sku || '')} | ${SecurityService.escapeHtml(i.variant || '')}</span></td>
      <td style="padding: 8px 12px; text-align: right;">${i.quantity} pcs</td>
    </tr>`
    )
    .join('');

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e5e5e5; border-radius: 12px;">
      <h2 style="margin-top: 0; color: #171717;">New Request for Quotation (RFQ)</h2>
      <p style="color: #525252; font-size: 14px;">A new B2B buyer has submitted a quotation request on ${brand}.</p>
      <div style="background-color: #f5f5f7; border-radius: 8px; padding: 16px; margin: 20px 0;">
        ${orderNo ? `<p style="margin: 4px 0;"><strong>Order / RFQ No:</strong> <span style="font-family: monospace; font-weight: bold; color: #171717;">${orderNo}</span></p>` : ''}
        <p style="margin: 4px 0;"><strong>Company:</strong> ${safeCompany}</p>
        <p style="margin: 4px 0;"><strong>Contact Name:</strong> ${safeName}</p>
        <p style="margin: 4px 0;"><strong>Work Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
        <p style="margin: 4px 0;"><strong>WhatsApp / Tel:</strong> ${safeWhatsapp}</p>
        <p style="margin: 4px 0;"><strong>Destination:</strong> ${safeDestination}</p>
        ${safeVisitorIp ? `<p style="margin: 4px 0;"><strong>Visitor IP:</strong> ${safeVisitorIp} ${safeDetectedCountry ? `(${safeDetectedCountry})` : ''}</p>` : ''}
        <p style="margin: 4px 0;"><strong>Type:</strong> ${safeInquiryType}${safeLocale ? ` | <strong>Locale:</strong> ${safeLocale.toUpperCase()}` : ''}</p>
      </div>
      ${
        safeMessage
          ? `<div style="margin: 20px 0;"><h4 style="margin: 0 0 8px;">Customization Notes:</h4><blockquote style="margin: 0; padding: 12px; background: #fafafa; border-left: 3px solid #171717; font-size: 13px;">${safeMessage}</blockquote></div>`
          : ''
      }
      <h4 style="margin: 24px 0 8px;">Requested Styles (${items.length}):</h4>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <thead>
          <tr style="background: #f5f5f7; text-align: left;">
            <th style="padding: 8px 12px;">Product / Variant</th>
            <th style="padding: 8px 12px; text-align: right;">Quantity</th>
          </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
      </table>
      <p style="font-size: 12px; color: #a3a3a3; margin-top: 32px; border-top: 1px solid #e5e5e5; padding-top: 16px;">
        Submitted at: ${new Date().toUTCString()} | ${brand} B2B Atelier
      </p>
    </div>`;
}

/**
 * Dispatches Resend notification email & instant Webhook alert concurrently (non-blocking)
 */
export async function dispatchRfqNotifications(ctx: RfqNotifyContext): Promise<void> {
  const {
    orderNo,
    effectiveBrand,
    buyerInfo,
    items,
    resolvedDestination,
    visitorIp,
    detectedCountry,
    inquiryType,
    locale,
    reqHostname,
    systemSettings,
    siteConfig,
    getVal,
  } = ctx;

  const resendApiKey = systemSettings?.resend_api_key || getVal('RESEND_API_KEY');
  const emailTask = (async () => {
    if (!resendApiKey || systemSettings?.enable_email_notify === false) return;
    try {
      const safeCompany = SecurityService.escapeHtml(buyerInfo.company);
      const safeName = SecurityService.escapeHtml(buyerInfo.name || 'N/A');
      const safeEmail = SecurityService.escapeHtml(buyerInfo.email);
      const safeWhatsapp = SecurityService.escapeHtml(buyerInfo.whatsapp || 'N/A');
      const safeDestination = SecurityService.escapeHtml(resolvedDestination);
      const safeVisitorIp = visitorIp ? SecurityService.escapeHtml(visitorIp) : '';
      const safeDetectedCountry = detectedCountry ? SecurityService.escapeHtml(detectedCountry) : '';
      const safeMessage = buyerInfo.message ? SecurityService.escapeHtml(buyerInfo.message) : '';
      const safeInquiryType = SecurityService.escapeHtml(inquiryType);
      const safeLocale = SecurityService.escapeHtml(locale);

      const emailHtml = buildRfqEmailHtml({
        orderNo,
        brandName: effectiveBrand,
        safeCompany,
        safeName,
        safeEmail,
        safeWhatsapp,
        safeDestination,
        safeVisitorIp,
        safeDetectedCountry,
        safeInquiryType,
        safeLocale,
        safeMessage,
        items,
      });

      const defaultDomain = DEFAULT_CONTACT_EMAIL ? (DEFAULT_CONTACT_EMAIL.split('@')[1] || '') : reqHostname;
      const fromEmail =
        systemSettings?.resend_from_email ||
        getVal('RESEND_FROM_EMAIL')?.trim() ||
        `${effectiveBrand} RFQ System <rfq@${defaultDomain}>`;
      const rawToEmail =
        systemSettings?.resend_to_emails ||
        siteConfig?.notificationRecipientEmail?.trim() ||
        getVal('RESEND_TO_EMAIL')?.trim() ||
        DEFAULT_CONTACT_EMAIL;
      const toEmails = rawToEmail
        .split(/[,;]/)
        .map((e: string) => e.trim())
        .filter((e: string) => Boolean(e) && EMAIL_REGEX.test(e));
      const resolvedTo = toEmails.length > 0 ? toEmails : [DEFAULT_CONTACT_EMAIL];
      const subjectPrefix =
        systemSettings?.resend_subject_prefix || getVal('RESEND_SUBJECT_PREFIX')?.trim() || '[New B2B RFQ]';

      const safeCompanyForSubject = (buyerInfo.company || buyerInfo.name || 'Anonymous Buyer')
        .replace(/[\r\n]+/g, ' ')
        .trim();
      const cleanSubject =
        `${subjectPrefix} [${orderNo}] [${locale.toUpperCase()}] ${safeCompanyForSubject} - ${items.length} Style(s)`.replace(
          /[\r\n]+/g,
          ' '
        );

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(8_000),
        body: JSON.stringify({
          from: fromEmail,
          to: resolvedTo,
          reply_to: buyerInfo.email,
          subject: cleanSubject,
          html: emailHtml,
        }),
      });
    } catch (mailErr) {
      console.warn('Resend mail sending failed or timed out (skipping):', mailErr);
    }
  })();

  const webhookUrl =
    systemSettings?.notification_webhook_url ||
    siteConfig?.notificationWebhookUrl?.trim() ||
    getVal('NOTIFICATION_WEBHOOK_URL')?.trim();
  const enableWebhook =
    systemSettings?.enable_webhook_notify !== false && siteConfig?.enableNotificationWebhook !== false;

  const webhookTask = (async () => {
    if (!enableWebhook || !webhookUrl) return;
    try {
      const itemLines = items
        .map((item, idx) => `  ${idx + 1}. [${item.sku}] ${item.title} (${item.variant}) × ${item.quantity} pcs`)
        .join('\n');

      const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      const ipNotice = visitorIp ? `\n🌐 访客 IP：${visitorIp} ${detectedCountry ? `(${detectedCountry})` : ''}` : '';
      const plainText = `🔔 【${effectiveBrand} 收到新询价单 / 索样请求】\n━━━━━━━━━━━━━━━━━━━━━\n📦 订单号：${orderNo}\n🏢 采购商：${buyerInfo.company || '独立采购商/买手'}\n👤 联系人：${buyerInfo.name || '未提供'}\n📧 邮箱：${buyerInfo.email}\n📱 WhatsApp/电话：${buyerInfo.whatsapp || '未提供'}\n🌍 目的国：${resolvedDestination}${ipNotice}\n🗣️ 界面语种：${locale.toUpperCase()}\n🏷️ 询盘类型：${inquiryType}\n📦 意向款式清单 (${items.length} 款)：\n${itemLines}\n💬 客户留言：${buyerInfo.message || '无'}\n⏰ 提交时间：${timestamp}`;
      const markdownText = `### 🔔 ${effectiveBrand} 收到新询价单\n\n- **订单号**：${orderNo}\n- **采购商**：${buyerInfo.company || '独立买手'}\n- **联系人**：${buyerInfo.name || '未提供'}\n- **邮箱**：${buyerInfo.email}\n- **电话/WA**：${buyerInfo.whatsapp || '未提供'}\n- **目的国**：${resolvedDestination}\n- **界面语种**：${locale.toUpperCase()}\n- **访客 IP**：${visitorIp || '未获取'} ${detectedCountry ? `(${detectedCountry})` : ''}\n- **意向款式**：${items.length} 款\n\n> 留言：${buyerInfo.message || '无'}`;

      await dispatchWebhookMessage(webhookUrl, {
        title: `【新询盘】${buyerInfo.company || buyerInfo.name || '买手咨询'} [${orderNo}]`,
        markdownText,
        plainText,
      });
    } catch (webhookErr) {
      console.warn('Webhook notification failed or timed out (skipping):', webhookErr);
    }
  })();

  await Promise.allSettled([emailTask, webhookTask]);
}
