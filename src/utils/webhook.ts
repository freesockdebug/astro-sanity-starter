// src/utils/webhook.ts
// Unified outbound webhook dispatcher with SSRF protection and multi-platform payload formatting

import { SecurityService } from './security';

export interface WebhookMessagePayload {
  title: string;
  markdownText?: string;
  plainText: string;
}

export async function dispatchWebhookMessage(
  targetUrl: string,
  payload: WebhookMessagePayload,
  timeoutMs = 6000
): Promise<{ success: boolean; status?: number; error?: string }> {
  if (!SecurityService.isSafeWebhookUrl(targetUrl)) {
    return { success: false, error: 'Target URL failed SSRF validation.' };
  }

  let body: any;
  if (targetUrl.includes('qyapi.weixin.qq.com')) {
    body = {
      msgtype: 'markdown',
      markdown: { content: payload.markdownText || payload.plainText },
    };
  } else if (targetUrl.includes('dingtalk.com')) {
    body = {
      msgtype: 'markdown',
      markdown: {
        title: payload.title,
        text: payload.markdownText || payload.plainText,
      },
    };
  } else if (targetUrl.includes('feishu.cn') || targetUrl.includes('larksuite.com')) {
    body = {
      msg_type: 'text',
      content: { text: payload.plainText },
    };
  } else {
    body = {
      msgtype: 'text',
      title: payload.title,
      text: payload.plainText,
      content: payload.plainText,
      markdown: payload.markdownText,
    };
  }

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { success: res.ok, status: res.status, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Webhook dispatch failed' };
  }
}
