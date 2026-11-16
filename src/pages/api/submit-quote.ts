import type { APIRoute } from 'astro';
import { SecurityService } from '@utils/security';
import { dispatchRfqNotifications } from '@utils/rfqNotify';
import { DEFAULT_BRAND_TITLE } from '@data/defaults';
import { fetchData as fetchSiteConfig } from '@data/siteConfig';
import {
  getSessionFromRequest,
  getRuntimeEnv,
  getCookieValue,
  TURNSTILE_PASS_COOKIE_NAME,
  TURNSTILE_PASS_TTL_SECONDS,
  createTurnstilePassToken,
  verifyTurnstilePassToken,
  formatTurnstilePassCookie,
} from '@utils/auth';
import { createOrder, generateOrderNo, getUserByIdOrEmail, updateUserProfile, getSystemSettings } from '@utils/db';
import { getDictItems } from '@utils/dicts';
import { kvGet, kvPut, kvDelete } from '@utils/cache';
import { logger } from '@utils/logger';
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false; // Run dynamically as Cloudflare Worker endpoint

// RFC 5322 compliant practical email pattern
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const DEFAULT_INQUIRY_TYPES = ['quote_cart', 'swatch_request', 'custom_oem', 'quick_inquiry', 'sample_swatch', 'custom_inquiry'];

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
    locale: string;
    turnstileToken: string;
  };
}

/**
 * Strict boundary validator for incoming RFQ payload
 */
function validateQuotePayload(body: any, allowedInquiryTypes: Set<string>): ValidationResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Invalid request body format.' };
  }

  const { buyerInfo, items, turnstileToken, inquiryType = 'quote_cart', locale } = body;
  const ALLOWED_LOCALES = new Set(['en', 'de', 'fr', 'es']);
  const rawLocale = typeof locale === 'string' ? locale.trim().toLowerCase().slice(0, 2) : 'en';
  const sanitizedLocale = ALLOWED_LOCALES.has(rawLocale) ? rawLocale : 'en';

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

  const sanitizedInquiryType = allowedInquiryTypes.has(inquiryType) ? inquiryType : 'quote_cart';
  const cleanTurnstileToken = typeof turnstileToken === 'string' ? turnstileToken.trim() : '';

  return {
    valid: true,
    data: {
      buyerInfo: buyer,
      items: validatedItems,
      inquiryType: sanitizedInquiryType,
      locale: sanitizedLocale,
      turnstileToken: cleanTurnstileToken,
    },
  };
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

    // 1. Strict Boundary Input Validation (backed by inquiry_types dictionary)
    const inquiryDictItems = await getDictItems(cfEnv, 'inquiry_types', true).catch(() => []);
    const allowedInquiryTypes = new Set<string>([
      ...DEFAULT_INQUIRY_TYPES,
      ...inquiryDictItems.map((i: any) => String(i.item_key || '').trim()).filter(Boolean),
    ]);
    const validation = validateQuotePayload(rawBody, allowedInquiryTypes);
    if (!validation.valid || !validation.data) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { buyerInfo, items, inquiryType, locale, turnstileToken } = validation.data;

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

    // Load Studio site configuration (cached), D1 system settings, and current buyer session
    const [siteConfig, systemSettings, sessionUser] = await Promise.all([
      fetchSiteConfig(),
      getSystemSettings(cfEnv).catch(() => null),
      getSessionFromRequest(request, cfEnv),
    ]);
    const effectiveBrand = systemSettings?.brand_name || DEFAULT_BRAND_TITLE;

    // 2. Cloudflare Turnstile Bot Verification
    // Scheme B: Signed-in buyers bypass Turnstile; Scheme A: 30-min HMAC pass cookie bypasses repeat Turnstile
    const reqUrl = new URL(request.url);
    const isDev = Boolean(import.meta.env?.DEV);
    const isDummyTestToken = isDev && turnstileToken.includes('DUMMY.TOKEN');
    const isAuthenticatedBuyer = Boolean(sessionUser?.id);
    const passCookie = getCookieValue(request.headers.get('cookie'), TURNSTILE_PASS_COOKIE_NAME);
    const hasValidTurnstilePass = !isAuthenticatedBuyer && passCookie
      ? await verifyTurnstilePassToken(passCookie, visitorIp, cfEnv)
      : false;
    let shouldIssueTurnstilePass = false;

    const turnstileSecret = isDummyTestToken
      ? '1x0000000000000000000000000000000AA'
      : systemSettings?.turnstile_secret_key ||
        getVal('TURNSTILE_SECRET_KEY') ||
        getVal('TURNSTILE_SECRET') ||
        getVal('turnstile_secret_key');

    if (turnstileSecret && !isDummyTestToken && !isAuthenticatedBuyer && !hasValidTurnstilePass) {
      if (!turnstileToken || turnstileToken.length > 2048) {
        return new Response(
          JSON.stringify({ code: 'TURNSTILE_REQUIRED', error: 'Missing or invalid bot verification token. Please complete the verification.' }),
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
          JSON.stringify({ code: 'TURNSTILE_REQUIRED', error: 'Bot verification failed. Please refresh and try again.' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Hostname validation
      if (verifyResult.hostname && expectedHostnames.size > 0 && !expectedHostnames.has(verifyResult.hostname)) {
        return new Response(
          JSON.stringify({ code: 'TURNSTILE_REQUIRED', error: 'Turnstile hostname mismatch.' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }

      shouldIssueTurnstilePass = true;
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
    // Reuse sessionUser resolved above
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

    // 4. Execute Resend email and Webhook notification concurrently with D1 write
    const notifyTask = dispatchRfqNotifications({
      orderNo,
      effectiveBrand,
      buyerInfo,
      items,
      resolvedDestination,
      visitorIp,
      detectedCountry,
      inquiryType,
      locale,
      reqHostname: reqUrl.hostname,
      systemSettings,
      siteConfig,
      getVal,
    });

    await Promise.allSettled([d1WriteTask, notifyTask]);

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
        context: { d1WriteError, orderNo },
      }, { cfEnv });
      return new Response(
        JSON.stringify({
          error: `Order could not be saved to primary database: ${d1WriteError || 'Database write failed'}.`,
          success: false,
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (idempKey) {
      await kvPut(idempKey, { orderNo, email: normalizedEmail }, { expirationTtl: 60 }, cfEnv).catch(() => {});
    }

    const resHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    let turnstilePassUntil: number | undefined;
    if (shouldIssueTurnstilePass) {
      const passToken = await createTurnstilePassToken(visitorIp, TURNSTILE_PASS_TTL_SECONDS, cfEnv);
      if (passToken) {
        resHeaders['Set-Cookie'] = formatTurnstilePassCookie(passToken, TURNSTILE_PASS_TTL_SECONDS, reqUrl.protocol === 'https:');
        turnstilePassUntil = Date.now() + TURNSTILE_PASS_TTL_SECONDS * 1000;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        orderNo: orderNo || undefined,
        orderId: orderId || undefined,
        turnstilePassUntil,
        message: 'Your RFQ and Official Order have been received. Our account manager will contact you within 24 hours.',
      }),
      { status: 200, headers: resHeaders }
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
