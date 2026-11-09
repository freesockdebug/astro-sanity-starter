import type { APIRoute } from 'astro';
import { createClient } from '@sanity/client';
import { SecurityService } from '@utils/security';
import { dispatchWebhookMessage } from '@utils/webhook';
import { DEFAULT_BRAND_TITLE, DEFAULT_CONTACT_EMAIL } from '@data/defaults';
import { fetchData as fetchSiteConfig } from '@data/siteConfig';
import { getSessionFromRequest, getRuntimeEnv } from '@utils/auth';
import { createOrder, generateOrderNo, getUserByIdOrEmail, updateUserProfile, getSystemSettings } from '@utils/db';
import { kvGet, kvPut, kvDelete } from '@utils/kv';
import { logger } from '@utils/logger';
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
  imageUrl?: string;
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

  const clean = (val: unknown) => (typeof val === 'string' ? val.trim() : '');
  const buyer = {
    company: clean(buyerInfo.company),
    email: clean(buyerInfo.email),
    name: clean(buyerInfo.name),
    whatsapp: clean(buyerInfo.whatsapp),
    destination: clean(buyerInfo.destination),
    message: clean(buyerInfo.message),
  };

  const FIELD_RULES: Array<[boolean, string]> = [
    [!buyer.company, 'Company name is required.'],
    [buyer.company.length > 120, 'Company name cannot exceed 120 characters.'],
    [!buyer.email, 'Work email is required.'],
    [buyer.email.length > 100 || !EMAIL_REGEX.test(buyer.email), 'Please provide a valid work email address.'],
    [buyer.name.length > 80, 'Contact name cannot exceed 80 characters.'],
    [buyer.whatsapp.length > 50, 'WhatsApp / Tel cannot exceed 50 characters.'],
    [buyer.destination.length > 100, 'Destination cannot exceed 100 characters.'],
    [buyer.message.length > 2000, 'Message / Notes cannot exceed 2000 characters.'],
  ];

  for (const [failed, error] of FIELD_RULES) {
    if (failed) return { valid: false, error };
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
    const imageUrl =
      typeof item.imageUrl === 'string' && item.imageUrl.trim().length > 0
        ? item.imageUrl.trim()
        : typeof item.image === 'string' && item.image.trim().length > 0
          ? item.image.trim()
          : undefined;

    validatedItems.push({
      id: typeof item.id === 'string' ? item.id.slice(0, 80) : undefined,
      title,
      sku,
      variant,
      quantity: parsedQty,
      imageUrl,
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
      buyerInfo: buyer,
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
  safeMessage: string;
  items: ValidatedItem[];
}): string {
  const { orderNo, brandName, safeCompany, safeName, safeEmail, safeWhatsapp, safeDestination, safeVisitorIp, safeDetectedCountry, safeInquiryType, safeMessage, items } = params;
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
        Submitted at: ${new Date().toUTCString()} | ${brand} B2B Atelier
      </p>
    </div>`;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let idempKey = '';
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
    const clientMeta = SecurityService.resolveClientMeta(request);
    const visitorIp = clientMeta.ip || clientAddress || '';
    const cfCountryCode = clientMeta.country;
    let detectedCountry = '';
    if (cfCountryCode) {
      try {
        detectedCountry = new Intl.DisplayNames(['en'], { type: 'region' }).of(cfCountryCode) || cfCountryCode;
      } catch {
        detectedCountry = cfCountryCode;
      }
    }

    const resolvedDestination = buyerInfo.destination || detectedCountry || cfCountryCode || 'Unspecified';

    // Environment resolution helper backed by unified getRuntimeEnv
    const getVal = (key: string): string | undefined => getRuntimeEnv(key, cfEnv);

    // Load Studio site configuration (cached) and D1 system settings
    const [siteConfig, systemSettings] = await Promise.all([
      fetchSiteConfig(),
      getSystemSettings(cfEnv).catch(() => null),
    ]);
    const effectiveBrand = systemSettings?.brand_name || DEFAULT_BRAND_TITLE;

    // 2. Cloudflare Turnstile Bot Verification
    const reqUrl = new URL(request.url);
    const isDev = Boolean(import.meta.env?.DEV);
    const isDummyTestToken = isDev && turnstileToken.includes('DUMMY.TOKEN');
    const turnstileSecret = isDummyTestToken
      ? '1x0000000000000000000000000000000AA'
      : systemSettings?.turnstile_secret_key ||
        getVal('TURNSTILE_SECRET_KEY') ||
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
      const rawHostnames = systemSettings?.turnstile_hostnames || getVal('TURNSTILE_HOSTNAMES') || (isDev ? 'localhost,127.0.0.1' : reqUrl.hostname);
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
        logger.error({
          module: 'submit-quote',
          event: 'TURNSTILE_NETWORK_ERROR',
          message: 'Turnstile verification network error',
          path: '/api/submit-quote',
          rayId: request.headers.get('cf-ray') || undefined,
          error: err,
        }, { cfEnv });
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

    // 2.5 Edge Idempotency Guard (Anti-Replay via Cloudflare KV, 60s TTL)
    const normalizedEmail = buyerInfo.email.trim().toLowerCase();
    const itemSig = items
      .map((i: any) => `${i.sku || ''}:${i.variant || ''}:${i.quantity}`)
      .sort()
      .join('|');
    const idempRaw = `${normalizedEmail}:${itemSig}:${buyerInfo.message || ''}`;
    idempKey = '';
    try {
      const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(idempRaw));
      const hashHex = Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 32);
      idempKey = `idemp:rfq:${hashHex}`;
      const cachedRfq = await kvGet<{ orderNo: string }>(idempKey, cfEnv);
      if (cachedRfq?.orderNo) {
        return new Response(
          JSON.stringify({
            success: true,
            orderNo: cachedRfq.orderNo,
            duplicate: true,
            message: 'Your inquiry has already been received and is currently being processed by our concierge team.',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } catch {
      // Non-blocking fail-safe
    }

    // 3. Create Official B2B Order in Cloudflare D1
    const sessionUser = await getSessionFromRequest(request, cfEnv);
    const userId = sessionUser ? sessionUser.id : null;

    let existingBuyer: any = null;
    // Security check: reject if buyer or user is BLOCKED in D1
    try {
      existingBuyer = await getUserByIdOrEmail(userId, buyerInfo.email);
      if (existingBuyer && existingBuyer.status === 'BLOCKED') {
        return new Response(
          JSON.stringify({ error: 'Your account is suspended from submitting quotation requests. Please contact our B2B support team.', success: false }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } catch {
      // non-blocking
    }

    const orderNo = generateOrderNo(systemSettings?.order_no_prefix || 'ORD');
    let orderId = '';
    let d1WriteError: string | null = null;

    const d1WriteTask = (async () => {
      try {
        const result = await createOrder({
          orderNo,
          userId,
          buyerEmail: buyerInfo.email,
          companyName: buyerInfo.company,
          contactName: buyerInfo.name,
          whatsapp: buyerInfo.whatsapp,
          destinationCountry: resolvedDestination,
          customerNotes: buyerInfo.message,
          inquiryType,
          items: items.map((i) => ({
            productId: i.id,
            sku: i.sku,
            title: i.title,
            variant: i.variant,
            quantity: i.quantity,
            imageUrl: i.imageUrl,
          })),
        });
        orderId = result.orderId;

        // Backfill empty profile fields for registered buyers
        if (existingBuyer && existingBuyer.id) {
          const profileUpdates: { company?: string; country?: string; phone?: string; name?: string } = {};
          if (!existingBuyer.company && buyerInfo.company) profileUpdates.company = buyerInfo.company;
          if (!existingBuyer.country && resolvedDestination) profileUpdates.country = resolvedDestination;
          if (!existingBuyer.phone && buyerInfo.whatsapp) profileUpdates.phone = buyerInfo.whatsapp;
          if (!existingBuyer.name && buyerInfo.name) profileUpdates.name = buyerInfo.name;
          if (Object.keys(profileUpdates).length > 0) {
            updateUserProfile(existingBuyer.id, profileUpdates).catch(() => {});
          }
        }
      } catch (err: any) {
        logger.error({
          module: 'submit-quote',
          event: 'D1_WRITE_FAILED',
          message: `Failed to write order ${orderNo} to D1`,
          path: '/api/submit-quote',
          rayId: request.headers.get('cf-ray') || undefined,
          userId: sessionUser?.id,
          userEmail: normalizedEmail,
          error: err,
        }, { cfEnv });
        d1WriteError = err?.message || 'D1 create failed';
      }
    })();

    // 4. Execute Sanity write, Resend email, and Webhook notification concurrently
    let sanityRecordId: string | null = null;
    let sanityWriteError: string | null = null;
    const sanityToken =
      getVal('SANITY_TOKEN') ||
      getVal('SANITY_WRITE_TOKEN') ||
      getVal('sanity_token');
    const sanityProjectId = getVal('SANITY_PROJECT_ID');
    const sanityDataset = getVal('SANITY_DATASET') || 'production';

    const sanityWriteTask = (async () => {
      if (!sanityToken || !sanityProjectId) {
        sanityWriteError = 'SANITY_TOKEN or SANITY_PROJECT_ID is missing on Cloudflare Worker runtime';
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
          orderNo,
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
          safeMessage,
          items,
        });

        // Configurable Resend sender, recipients, and subject prefix
        const defaultDomain = DEFAULT_CONTACT_EMAIL ? (DEFAULT_CONTACT_EMAIL.split('@')[1] || '') : reqUrl.hostname;
        const fromEmail = systemSettings?.resend_from_email || getVal('RESEND_FROM_EMAIL')?.trim() || `${effectiveBrand} RFQ System <rfq@${defaultDomain}>`;
        const rawToEmail = systemSettings?.resend_to_emails || siteConfig?.notificationRecipientEmail?.trim() || getVal('RESEND_TO_EMAIL')?.trim() || DEFAULT_CONTACT_EMAIL;
        const toEmails = rawToEmail
          .split(/[,;]/)
          .map((e: string) => e.trim())
          .filter((e: string) => Boolean(e) && EMAIL_REGEX.test(e));
        const resolvedTo = toEmails.length > 0 ? toEmails : [DEFAULT_CONTACT_EMAIL];
        const subjectPrefix = systemSettings?.resend_subject_prefix || getVal('RESEND_SUBJECT_PREFIX')?.trim() || '[New B2B RFQ]';

        const safeCompanyForSubject = (buyerInfo.company || buyerInfo.name || 'Anonymous Buyer')
          .replace(/[\r\n]+/g, ' ')
          .trim();
        const cleanSubject = `${subjectPrefix} [${orderNo}] ${safeCompanyForSubject} - ${items.length} Style(s)`.replace(/[\r\n]+/g, ' ');

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
            subject: cleanSubject,
            html: emailHtml,
          }),
        });
      } catch (mailErr) {
        console.warn('Resend mail sending failed or timed out (skipping):', mailErr);
      }
    })();

    // 5. Instant Notification Webhook (WeChat Work, DingTalk, Feishu, Slack, Discord, Generic Webhook)
    const webhookUrl = systemSettings?.notification_webhook_url || siteConfig?.notificationWebhookUrl?.trim() || getVal('NOTIFICATION_WEBHOOK_URL')?.trim();
    const enableWebhook = (systemSettings?.enable_webhook_notify !== false) && (siteConfig?.enableNotificationWebhook !== false);

    const webhookTask = (async () => {
      if (!enableWebhook || !webhookUrl) return;
      try {
        const itemLines = items
          .map((item, idx) => `  ${idx + 1}. [${item.sku}] ${item.title} (${item.variant}) × ${item.quantity} pcs`)
          .join('\n');
        
        const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        const ipNotice = visitorIp ? `\n🌐 访客 IP：${visitorIp} ${detectedCountry ? `(${detectedCountry})` : ''}` : '';
        const plainText = `🔔 【${effectiveBrand} 收到新询价单 / 索样请求】\n━━━━━━━━━━━━━━━━━━━━━\n📦 订单号：${orderNo}\n🏢 采购商：${buyerInfo.company || '独立采购商/买手'}\n👤 联系人：${buyerInfo.name || '未提供'}\n📧 邮箱：${buyerInfo.email}\n📱 WhatsApp/电话：${buyerInfo.whatsapp || '未提供'}\n🌍 目的国：${resolvedDestination}${ipNotice}\n🏷️ 询盘类型：${inquiryType}\n📦 意向款式清单 (${items.length} 款)：\n${itemLines}\n💬 客户留言：${buyerInfo.message || '无'}\n⏰ 提交时间：${timestamp}`;
        const markdownText = `### 🔔 ${effectiveBrand} 收到新询价单\n\n- **订单号**：${orderNo}\n- **采购商**：${buyerInfo.company || '独立买手'}\n- **联系人**：${buyerInfo.name || '未提供'}\n- **邮箱**：${buyerInfo.email}\n- **电话/WA**：${buyerInfo.whatsapp || '未提供'}\n- **目的国**：${resolvedDestination}\n- **访客 IP**：${visitorIp || '未获取'} ${detectedCountry ? `(${detectedCountry})` : ''}\n- **意向款式**：${items.length} 款\n\n> 留言：${buyerInfo.message || '无'}`;

        await dispatchWebhookMessage(webhookUrl, {
          title: `【新询盘】${buyerInfo.company || buyerInfo.name || '买手咨询'} [${orderNo}]`,
          markdownText,
          plainText,
        });
      } catch (webhookErr) {
        console.warn('Webhook notification failed or timed out (skipping):', webhookErr);
      }
    })();

    await Promise.allSettled([d1WriteTask, sanityWriteTask, emailTask, webhookTask]);

    if (!orderId) {
      if (idempKey) {
        await kvDelete(idempKey, cfEnv).catch(() => {});
      }
      logger.critical({
        module: 'submit-quote',
        event: 'ORDER_PERSISTENCE_FAILED',
        message: `Order ${orderNo} could not be saved to primary database (D1)`,
        path: '/api/submit-quote',
        rayId: request.headers.get('cf-ray') || undefined,
        userId: sessionUser?.id,
        userEmail: normalizedEmail,
        context: { d1WriteError, sanityWriteError, orderNo },
      }, { cfEnv });
      return new Response(
        JSON.stringify({
          error: `Order could not be saved to primary database: ${d1WriteError || sanityWriteError || 'Database write failed'}.`,
          success: false,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (idempKey) {
      await kvPut(idempKey, { orderNo, email: normalizedEmail }, { expirationTtl: 60 }, cfEnv).catch(() => {});
    }

    return new Response(
      JSON.stringify({
        success: true,
        orderNo: orderNo || undefined,
        orderId: orderId || undefined,
        message: 'Your RFQ and Official Order have been received. Our account manager will contact you within 24 hours.',
        sanityRecordId,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    if (idempKey) {
      await kvDelete(idempKey, cfEnv).catch(() => {});
    }
    logger.error({
      module: 'submit-quote',
      event: 'UNHANDLED_SUBMIT_QUOTE_ERROR',
      message: error?.message || 'Error handling submit-quote',
      path: '/api/submit-quote',
      rayId: request.headers.get('cf-ray') || undefined,
      error,
    }, { cfEnv });
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal Server Error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
