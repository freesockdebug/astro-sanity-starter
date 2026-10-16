import type { APIRoute } from 'astro';
import { createClient } from '@sanity/client';
// @ts-ignore
import { env as cfEnv } from 'cloudflare:workers';

export const prerender = false; // Run dynamically as Cloudflare Worker endpoint

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json();
    const { buyerInfo, items = [], turnstileToken, inquiryType = 'quote_cart' } = body;

    // 1. Basic validation
    if (!buyerInfo || !buyerInfo.email || !buyerInfo.company) {
      return new Response(
        JSON.stringify({ error: 'Company name and work email are required.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Cloudflare Turnstile Verification (Canonical Siteverify implementation)
    const runtimeEnv = cfEnv || null;

    const getVal = (key: string): string | undefined => {
      return (
        runtimeEnv?.[key] ||
        (typeof process !== 'undefined' && process.env && (process.env as any)[key]) ||
        (import.meta.env && (import.meta.env as any)[key]) ||
        (globalThis as any)?.[key]
      );
    };

    const turnstileSecret =
      getVal('TURNSTILE_SECRET_KEY') ||
      getVal('TURNSTILE_SECRET') ||
      getVal('turnstile_secret_key');

    const isDev = Boolean(import.meta.env?.DEV);
    if (turnstileSecret && !(isDev && (!turnstileToken || turnstileToken === 'dev-bypass'))) {
      if (typeof turnstileToken !== 'string' || turnstileToken.length === 0 || turnstileToken.length > 2048) {
        return new Response(
          JSON.stringify({ error: 'Missing or invalid bot verification token. Please complete the verification.' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
      const expectedActions = new Set(['quote_cart', 'quick_inquiry', 'sample_swatch']);
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
          signal: AbortSignal.timeout(10_000),
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

      // Action validation (if provided)
      if (verifyResult.action && !expectedActions.has(verifyResult.action)) {
        return new Response(
          JSON.stringify({ error: 'Turnstile action mismatch.' }),
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

    // 3. Option A: Write Inquiry to Sanity (with dedicated authenticated client)
    let sanityRecordId: string | null = null;
    let sanityWriteError: string | null = null;
    const sanityToken =
      getVal('SANITY_TOKEN') ||
      getVal('SANITY_WRITE_TOKEN') ||
      getVal('sanity_token');
    const sanityProjectId = getVal('SANITY_PROJECT_ID') || 'xvhhd8u0';
    const sanityDataset = getVal('SANITY_DATASET') || 'production';

    if (sanityToken) {
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
          buyerName: buyerInfo.name || '',
          email: buyerInfo.email,
          whatsapp: buyerInfo.whatsapp || '',
          destination: buyerInfo.destination || '',
          notes: buyerInfo.message || '',
          inquiryType: inquiryType,
          status: 'pending',
          createdAt: new Date().toISOString(),
          itemsSummary: items
            .map((i: any) => `[${i.sku || 'SKU'}] ${i.title} (${i.variant || 'Default'}) x ${i.quantity}pcs`)
            .join('\n'),
          rawItems: JSON.stringify(items),
        };
        const created = await writeClient.create(doc);
        sanityRecordId = created._id;
        console.log('Successfully recorded inquiry in Sanity:', sanityRecordId);
      } catch (e: any) {
        console.error('Could not write inquiry to Sanity:', e);
        sanityWriteError = e?.message || 'Sanity API create failed';
      }
    } else {
      sanityWriteError = 'SANITY_TOKEN is missing on Cloudflare Worker runtime';
    }

    // 4. Option B: Send Email notification via Resend (if key configured)
    const resendApiKey = getVal('RESEND_API_KEY');

    if (resendApiKey) {
      try {
        const itemsHtml = items
          .map(
            (i: any) => `
          <tr style="border-bottom: 1px solid #e5e5e5;">
            <td style="padding: 8px 12px;"><strong>${i.title}</strong><br><span style="font-size:12px;color:#737373;">${i.sku || ''} | ${i.variant || ''}</span></td>
            <td style="padding: 8px 12px; text-align: right;">${i.quantity} pcs</td>
          </tr>`
          )
          .join('');

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Gwenvenni RFQ System <rfq@gwenvenni.com>',
            to: ['contact@gwenvenni.com'],
            subject: `[New B2B RFQ] ${buyerInfo.company} - ${items.length} Style(s)`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e5e5e5; border-radius: 12px;">
                <h2 style="margin-top: 0; color: #171717;">New Request for Quotation (RFQ)</h2>
                <p style="color: #525252; font-size: 14px;">A new B2B buyer has submitted a quotation request on Gwenvenni.com.</p>
                <div style="background-color: #f5f5f7; border-radius: 8px; padding: 16px; margin: 20px 0;">
                  <p style="margin: 4px 0;"><strong>Company:</strong> ${buyerInfo.company}</p>
                  <p style="margin: 4px 0;"><strong>Contact Name:</strong> ${buyerInfo.name || 'N/A'}</p>
                  <p style="margin: 4px 0;"><strong>Work Email:</strong> <a href="mailto:${buyerInfo.email}">${buyerInfo.email}</a></p>
                  <p style="margin: 4px 0;"><strong>WhatsApp / Tel:</strong> ${buyerInfo.whatsapp || 'N/A'}</p>
                  <p style="margin: 4px 0;"><strong>Destination:</strong> ${buyerInfo.destination || 'N/A'}</p>
                  <p style="margin: 4px 0;"><strong>Type:</strong> ${inquiryType}</p>
                </div>
                ${
                  buyerInfo.message
                    ? `<div style="margin: 20px 0;"><h4 style="margin: 0 0 8px;">Customization Notes:</h4><blockquote style="margin: 0; padding: 12px; background: #fafafa; border-left: 3px solid #171717; font-size: 13px;">${buyerInfo.message}</blockquote></div>`
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
                  <tbody>${itemsHtml}</tbody>
                </table>
                <p style="font-size: 12px; color: #a3a3a3; margin-top: 32px; border-top: 1px solid #e5e5e5; padding-top: 16px;">
                  Submitted at: ${new Date().toUTCString()} | Gwenvenni B2B Atelier
                </p>
              </div>`,
          }),
        });
      } catch (mailErr) {
        console.warn('Resend mail sending failed (skipping):', mailErr);
      }
    }

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
