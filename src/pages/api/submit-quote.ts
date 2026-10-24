import type { APIRoute } from 'astro';
import { createClient } from '@sanity/client';
import { SecurityService } from '@utils/security';
import { DEFAULT_BRAND_TITLE, DEFAULT_CONTACT_EMAIL } from '@data/defaults';
import { fetchData as fetchSiteConfig } from '@data/siteConfig';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false; // Run dynamically as Cloudflare Worker endpoint

// RFC 5322 compliant practical email pattern
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const ALLOWED_INQUIRY_TYPES = new Set(['quote_cart', 'quick_inquiry', 'sample_swatch', 'custom_inquiry']);

interface ValidatedBuyerInfo {
  company: string;
  email: string;
  name: string;
  whatsapp: string;
  destination: string;
  message: string;
}

interface ValidatedItem {
  id?: string;
  title: string;
  sku: string;
  variant: string;
  quantity: number;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  data?: {
    buyerInfo: ValidatedBuyerInfo;
    items: ValidatedItem[];
    inquiryType: string;
    turnstileToken: string;
  };
}

/**
 * Strict boundary validator for incoming RFQ payload
 */
function validateQuotePayload(body: any): ValidationResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Invalid request body format.' };
  }

  const { buyerInfo, items, turnstileToken, inquiryType = 'quote_cart' } = body;

  if (!buyerInfo || typeof buyerInfo !== 'object' || Array.isArray(buyerInfo)) {
    return { valid: false, error: 'Buyer information is required.' };
  }

  const company = typeof buyerInfo.company === 'string' ? buyerInfo.company.trim() : '';
  const email = typeof buyerInfo.email === 'string' ? buyerInfo.email.trim() : '';
  const name = typeof buyerInfo.name === 'string' ? buyerInfo.name.trim() : '';
  const whatsapp = typeof buyerInfo.whatsapp === 'string' ? buyerInfo.whatsapp.trim() : '';
  const destination = typeof buyerInfo.destination === 'string' ? buyerInfo.destination.trim() : '';
  const message = typeof buyerInfo.message === 'string' ? buyerInfo.message.trim() : '';

  if (!company) {
    return { valid: false, error: 'Company name is required.' };
  }
  if (company.length > 120) {
    return { valid: false, error: 'Company name cannot exceed 120 characters.' };
  }

  if (!email) {
    return { valid: false, error: 'Work email is required.' };
  }
  if (email.length > 100 || !EMAIL_REGEX.test(email)) {
    return { valid: false, error: 'Please provide a valid work email address.' };
  }

  if (name.length > 80) {
    return { valid: false, error: 'Contact name cannot exceed 80 characters.' };
  }
  if (whatsapp.length > 50) {
    return { valid: false, error: 'WhatsApp / Tel cannot exceed 50 characters.' };
  }
  if (destination.length > 100) {
    return { valid: false, error: 'Destination cannot exceed 100 characters.' };
  }
  if (message.length > 2000) {
    return { valid: false, error: 'Message / Notes cannot exceed 2000 characters.' };
  }

  // Items validation
  if (!Array.isArray(items) || items.length === 0) {
    return { valid: false, error: 'At least one product item is required in the quote basket.' };
  }
  if (items.length > 50) {
    return { valid: false, error: 'A maximum of 50 items can be submitted per quote request.' };
  }

  const validatedItems: ValidatedItem[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const title = typeof item.title === 'string' ? item.title.trim().slice(0, 150) : 'Item';
    const sku = typeof item.sku === 'string' ? item.sku.trim().slice(0, 80) : '';
    const variant = typeof item.variant === 'string' ? item.variant.trim().slice(0, 80) : '';
    const parsedQty = Math.max(1, Math.min(100_000, Number(item.quantity) || 1));

    validatedItems.push({
      id: typeof item.id === 'string' ? item.id.slice(0, 80) : undefined,
      title,
      sku,
      variant,
      quantity: parsedQty,
    });
  }

  if (validatedItems.length === 0) {
    return { valid: false, error: 'No valid product items found in quote request.' };
  }

  const sanitizedInquiryType = ALLOWED_INQUIRY_TYPES.has(inquiryType) ? inquiryType : 'quote_cart';
  const cleanTurnstileToken = typeof turnstileToken === 'string' ? turnstileToken.trim() : '';

  return {
    valid: true,
    data: {
      buyerInfo: { company, email, name, whatsapp, destination, message },
      items: validatedItems,
      inquiryType: sanitizedInquiryType,
      turnstileToken: cleanTurnstileToken,
    },
  };
}

/**
 * Builds HTML template for B2B RFQ notification email
 */
function buildRfqEmailHtml(params: {
  safeCompany: string;
  safeName: string;
  safeEmail: string;
  safeWhatsapp: string;
  safeDestination: string;
  safeVisitorIp?: string;
  safeDetectedCountry?: string;
  safeInquiryType: string;
  safeMessage: string;
  items: ValidatedItem[];
}): string {
  const { safeCompany, safeName, safeEmail, safeWhatsapp, safeDestination, safeVisitorIp, safeDetectedCountry, safeInquiryType, safeMessage, items } = params;

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
      <p style="color: #525252; font-size: 14px;">A new B2B buyer has submitted a quotation request on ${DEFAULT_BRAND_TITLE}.</p>
      <div style="background-color: #f5f5f7; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Company:</strong> ${safeCompany}</p>
        <p style="margin: 4px 0;"><strong>Contact Name:</strong> ${safeName}</p>
        <p style="margin: 4px 0;"><strong>Work Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
        <p style="margin: 4px 0;"><strong>WhatsApp / Tel:</strong> ${safeWhatsapp}</p>
        <p style="margin: 4px 0;"><strong>Destination:</strong> ${safeDestination}</p>
        ${safeVisitorIp ? `<p style="margin: 4px 0;"><strong>Visitor IP:</strong> ${safeVisitorIp} ${safeDetectedCountry ? `(${safeDetectedCountry})` : ''}</p>` : ''}
        <p style="margin: 4px 0;"><strong>Type:</strong> ${safeInquiryType}</p>
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
        Submitted at: ${new Date().toUTCString()} | ${DEFAULT_BRAND_TITLE} B2B Atelier
      </p>
    </div>`;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    let rawBody: any;
    try {
      rawBody = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Malformed JSON payload.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Strict Boundary Input Validation
    const validation = validateQuotePayload(rawBody);
    if (!validation.valid || !validation.data) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { buyerInfo, items, inquiryType, turnstileToken } = validation.data;

    // Extract real visitor IP & Cloudflare Geo details
    const visitorIp =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-real-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      clientAddress ||
      '';

    const cfCountryCode = (request.headers.get('cf-ipcountry') || (request as any).cf?.country || '').trim().toUpperCase();
    let detectedCountry = '';
    if (cfCountryCode && cfCountryCode !== 'XX' && cfCountryCode !== 'T1') {
      try {
        detectedCountry = new Intl.DisplayNames(['en'], { type: 'region' }).of(cfCountryCode) || cfCountryCode;
      } catch {
        detectedCountry = cfCountryCode;
      }
    }

    const resolvedDestination = buyerInfo.destination || detectedCountry || cfCountryCode || 'Unspecified';

    // Environment resolution helper
    const runtimeEnv = (cfEnv as Record<string, any> | undefined) || null;
    const getVal = (key: string): string | undefined => {
      return (
        runtimeEnv?.[key] ||
        (typeof process !== 'undefined' && process.env && (process.env as any)[key]) ||
        (import.meta.env && (import.meta.env as any)[key]) ||
        (globalThis as any)?.[key]
      );
    };

    // Load Studio site configuration (cached) for custom notification emails and webhook URLs
    const siteConfig = await fetchSiteConfig();

    // 2. Cloudflare Turnstile Bot Verification
    const reqUrl = new URL(request.url);
    const isProdHostname = reqUrl.hostname.endsWith('gwenvenni.com');
    const isDummyTestToken = !isProdHostname && turnstileToken.includes('DUMMY.TOKEN');
    const turnstileSecret = isDummyTestToken
      ? '1x0000000000000000000000000000000AA'
      : getVal('TURNSTILE_SECRET_KEY') ||
        getVal('TURNSTILE_SECRET') ||
        getVal('turnstile_secret_key');

    if (turnstileSecret && !isDummyTestToken) {
      if (!turnstileToken || turnstileToken.length > 2048) {
        return new Response(
          JSON.stringify({ error: 'Missing or invalid bot verification token. Please complete the verification.' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
      const rawHostnames = getVal('TURNSTILE_HOSTNAMES') || 'localhost,127.0.0.1,gwenvenni.com';
      const expectedHostnames = new Set(
        rawHostnames
          .split(',')
          .map((h: string) => h.trim())
          .filter(Boolean)
      );

      let verifyResult: any;
      try {
        const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: AbortSignal.timeout(10_000), // 10s strict timeout
          body: new URLSearchParams({
            secret: turnstileSecret,
            response: turnstileToken,
            remoteip: clientIp,
          }),
        });

        if (!verifyRes.ok) {
          throw new Error(`Turnstile siteverify HTTP ${verifyRes.status}`);
        }
        verifyResult = await verifyRes.json();
      } catch (err: any) {
        console.error('Turnstile verification network error:', err);
        return new Response(
          JSON.stringify({ error: 'Verification service error. Please try again.' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (!verifyResult.success) {
        console.warn('Turnstile rejection error codes:', verifyResult['error-codes']);
        return new Response(
          JSON.stringify({ error: 'Bot verification failed. Please refresh and try again.' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Hostname validation
      if (verifyResult.hostname && expectedHostnames.size > 0 && !expectedHostnames.has(verifyResult.hostname)) {
        return new Response(
          JSON.stringify({ error: 'Turnstile hostname mismatch.' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // 3. Execute Sanity write, Resend email, and Webhook notification concurrently
    let sanityRecordId: string | null = null;
    let sanityWriteError: string | null = null;
    const sanityToken =
      getVal('SANITY_TOKEN') ||
      getVal('SANITY_WRITE_TOKEN') ||
      getVal('sanity_token');
    const sanityProjectId = getVal('SANITY_PROJECT_ID') || 'xvhhd8u0';
    const sanityDataset = getVal('SANITY_DATASET') || 'production';

    const sanityWriteTask = (async () => {
      if (!sanityToken) {
        sanityWriteError = 'SANITY_TOKEN is missing on Cloudflare Worker runtime';
        return;
      }
      try {
        const writeClient = createClient({
          projectId: sanityProjectId,
          dataset: sanityDataset,
          apiVersion: '2024-01-31',
          useCdn: false,
          token: sanityToken,
        });

        const doc = {
          _type: 'inquiry',
          company: buyerInfo.company,
          buyerName: buyerInfo.name,
          email: buyerInfo.email,
          whatsapp: buyerInfo.whatsapp,
          destination: resolvedDestination,
          visitorIp: visitorIp || undefined,
          detectedCountry: detectedCountry || cfCountryCode || undefined,
          notes: buyerInfo.message,
          inquiryType: inquiryType,
          status: 'pending',
          createdAt: new Date().toISOString(),
          itemsSummary: items
            .map((i) => `[${i.sku || 'SKU'}] ${i.title} (${i.variant || 'Default'}) x ${i.quantity}pcs`)
            .join('\n'),
          rawItems: JSON.stringify(items),
        };
        const created = await writeClient.create(doc);
        sanityRecordId = created?._id || null;
        if (import.meta.env.DEV) {
          console.log('Successfully recorded inquiry in Sanity:', sanityRecordId);
        }
      } catch (e: any) {
        console.error('Could not write inquiry to Sanity:', e);
        sanityWriteError = e?.message || 'Sanity API create failed';
      }
    })();

    // 4. Send Email notification via Resend with timeout protection
    const resendApiKey = getVal('RESEND_API_KEY');
    const emailTask = (async () => {
      if (!resendApiKey) return;
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

        const emailHtml = buildRfqEmailHtml({
          safeCompany,
          safeName,
          safeEmail,
          safeWhatsapp,
          safeDestination,
          safeVisitorIp,
          safeDetectedCountry,
          safeInquiryType,
          safeMessage,
          items,
        });

        // Configurable Resend sender, recipients, and subject prefix
        const defaultDomain = DEFAULT_CONTACT_EMAIL.split('@')[1] || 'gwenvenni.com';
        const fromEmail = getVal('RESEND_FROM_EMAIL')?.trim() || `${DEFAULT_BRAND_TITLE} RFQ System <rfq@${defaultDomain}>`;
        const rawToEmail = siteConfig?.notificationRecipientEmail?.trim() || getVal('RESEND_TO_EMAIL')?.trim() || DEFAULT_CONTACT_EMAIL;
        const toEmails = rawToEmail
          .split(/[,;]/)
          .map((e: string) => e.trim())
          .filter((e: string) => Boolean(e) && EMAIL_REGEX.test(e));
        const resolvedTo = toEmails.length > 0 ? toEmails : [DEFAULT_CONTACT_EMAIL];
        const subjectPrefix = getVal('RESEND_SUBJECT_PREFIX')?.trim() || '[New B2B RFQ]';

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(8_000), // 8s strict timeout protection
          body: JSON.stringify({
            from: fromEmail,
            to: resolvedTo,
            reply_to: buyerInfo.email,
            subject: `${subjectPrefix} ${safeCompany} - ${items.length} Style(s)`,
            html: emailHtml,
          }),
        });
      } catch (mailErr) {
        console.warn('Resend mail sending failed or timed out (skipping):', mailErr);
      }
    })();

    // 5. Instant Notification Webhook (WeChat Work, DingTalk, Feishu, Slack, Discord, Generic Webhook)
    const webhookUrl = siteConfig?.notificationWebhookUrl?.trim() || getVal('NOTIFICATION_WEBHOOK_URL')?.trim();
    const enableWebhook = siteConfig?.enableNotificationWebhook !== false;

    const webhookTask = (async () => {
      if (!enableWebhook || !webhookUrl || !SecurityService.isSafeWebhookUrl(webhookUrl)) return;
      try {
        const itemLines = items
          .map((item, idx) => `  ${idx + 1}. [${item.sku}] ${item.title} (${item.variant}) × ${item.quantity}双`)
          .join('\n');
        
        const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        const ipNotice = visitorIp ? `\n🌐 访客 IP：${visitorIp} ${detectedCountry ? `(${detectedCountry})` : ''}` : '';
        const plainText = `🔔 【Gwenvenni 官网收到新询价单 / 索样请求】\n━━━━━━━━━━━━━━━━━━━━━\n🏢 采购商：${buyerInfo.company || '独立采购商/买手'}\n👤 联系人：${buyerInfo.name || '未提供'}\n📧 邮箱：${buyerInfo.email}\n📱 WhatsApp/电话：${buyerInfo.whatsapp || '未提供'}\n🌍 目的国：${resolvedDestination}${ipNotice}\n🏷️ 询盘类型：${inquiryType}\n📦 意向款式清单 (${items.length} 款)：\n${itemLines}\n💬 客户留言：${buyerInfo.message || '无'}\n⏰ 提交时间：${timestamp}`;

        let webhookBody: any;
        if (webhookUrl.includes('qyapi.weixin.qq.com')) {
          webhookBody = {
            msgtype: 'markdown',
            markdown: { content: plainText }
          };
        } else if (webhookUrl.includes('dingtalk.com')) {
          webhookBody = {
            msgtype: 'markdown',
            markdown: {
              title: `【新询盘】${buyerInfo.company || buyerInfo.name || '买手咨询'}`,
              text: `### 🔔 Gwenvenni 官网收到新询价单\n\n- **采购商**：${buyerInfo.company || '独立买手'}\n- **联系人**：${buyerInfo.name || '未提供'}\n- **邮箱**：${buyerInfo.email}\n- **电话/WA**：${buyerInfo.whatsapp || '未提供'}\n- **目的国**：${resolvedDestination}\n- **访客 IP**：${visitorIp || '未获取'} ${detectedCountry ? `(${detectedCountry})` : ''}\n- **意向款式**：${items.length} 款\n\n> 留言：${buyerInfo.message || '无'}`
            }
          };
        } else if (webhookUrl.includes('feishu.cn') || webhookUrl.includes('larksuite.com')) {
          webhookBody = {
            msg_type: 'text',
            content: { text: plainText }
          };
        } else {
          webhookBody = {
            text: plainText,
            content: plainText
          };
        }

        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(webhookBody),
          signal: AbortSignal.timeout(6_000),
        });
      } catch (webhookErr) {
        console.warn('Webhook notification failed or timed out (skipping):', webhookErr);
      }
    })();

    await Promise.allSettled([sanityWriteTask, emailTask, webhookTask]);

    if (!sanityRecordId) {
      console.error('Inquiry not saved to Sanity:', sanityWriteError);
      return new Response(
        JSON.stringify({
          error: `Inquiry could not be saved to Sanity: ${sanityWriteError}.`,
          success: false,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Your RFQ has been received. Our account manager will contact you within 24 hours.',
        sanityRecordId,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error handling submit-quote:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal Server Error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
