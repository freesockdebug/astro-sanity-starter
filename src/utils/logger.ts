// src/utils/logger.ts
// Cloudflare Observability Native Structured JSON Logger with D1 Integration & Data Sanitization

import { waitUntil as cfWaitUntil, env as cfWorkerEnv } from 'cloudflare:workers';
import { recordErrorLog, type RecordErrorLogInput } from '../db/logs.repo';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export interface LogContext {
  module: string;
  event?: string;
  message: string;
  rayId?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  userId?: string;
  userEmail?: string;
  latencyMs?: number;
  error?: any;
  stack?: string;
  context?: Record<string, any>;
  [key: string]: any;
}

const SENSITIVE_KEY_REGEX = /(password|token|secret|authorization|cookie|apikey|api_key|creditcard|cardnumber)/i;

/**
 * Deeply sanitizes sensitive credentials before logging.
 */
function sanitizeData(data: any, depth = 0): any {
  if (depth > 5) return '[DEPTH_LIMIT]';
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    // Basic protection against token-like long strings in values
    if (data.length > 500) {
      return data.slice(0, 500) + '...[TRUNCATED]';
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item, depth + 1));
  }

  if (typeof data === 'object') {
    if (data instanceof Error) {
      return {
        name: data.name,
        message: data.message,
        stack: data.stack?.slice(0, 1500),
      };
    }

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeData(value, depth + 1);
      }
    }
    return sanitized;
  }

  return data;
}

/**
 * Dispatches async persistence to D1 via Cloudflare Workers native waitUntil.
 */
function persistToD1Async(input: RecordErrorLogInput, customEnv?: any, ctx?: any) {
  const env = customEnv || cfWorkerEnv || (typeof globalThis !== 'undefined' ? (globalThis as any).__CF_ENV__ : undefined);
  const writePromise = recordErrorLog(input, env).catch(() => false);

  // 1. Prioritize Cloudflare Workers native waitUntil (automatically bound to current request context)
  if (typeof cfWaitUntil === 'function') {
    try {
      cfWaitUntil(writePromise);
      return;
    } catch {
      // Fallback if called outside active request context
    }
  }

  // 2. Fallback to passed ExecutionContext if present
  if (ctx && typeof ctx.waitUntil === 'function') {
    try {
      ctx.waitUntil(writePromise);
      return;
    } catch {
      // Non-blocking
    }
  }
}

function emit(level: LogLevel, context: LogContext, options: { cfEnv?: any; ctx?: any } = {}) {
  const timestamp = new Date().toISOString();

  let formattedError: any = undefined;
  let formattedStack: string | undefined = undefined;

  if (context.error) {
    if (context.error instanceof Error) {
      formattedError = context.error.message;
      formattedStack = context.error.stack;
    } else {
      formattedError = String(context.error);
    }
  }

  const payload: Record<string, any> = {
    timestamp,
    level,
    module: context.module || 'system',
    message: context.message || '',
    ...sanitizeData(context),
  };

  // Preserve sanitized error object if already generated; fallback to formattedError
  if (!payload.error && formattedError) payload.error = formattedError;
  if (!payload.stack && formattedStack) payload.stack = formattedStack.slice(0, 1500);

  // Cloudflare Workers Observability natively parses JSON stdout
  const jsonStr = JSON.stringify(payload);

  if (level === 'error' || level === 'critical') {
    console.error(jsonStr);
  } else if (level === 'warn') {
    console.warn(jsonStr);
  } else if (level === 'info') {
    console.log(jsonStr);
  } else {
    console.debug ? console.debug(jsonStr) : console.log(jsonStr);
  }

  // Persist asynchronously (filtering by level weight and slow threshold is handled in recordErrorLog)
  persistToD1Async(
    {
      level,
      source: context.module || 'system',
      errorCode: context.event || null,
      message: context.message || '',
      context: payload,
      userId: context.userId || null,
      userEmail: context.userEmail || null,
      rayId: context.rayId || null,
      path: context.path || null,
      latencyMs: context.latencyMs ?? null,
      method: context.method || null,
      statusCode: context.statusCode ?? null,
    },
    options.cfEnv,
    options.ctx
  );
}

export const logger = {
  debug(context: LogContext, options?: { cfEnv?: any; ctx?: any }) {
    emit('debug', context, options);
  },
  info(context: LogContext, options?: { cfEnv?: any; ctx?: any }) {
    emit('info', context, options);
  },
  warn(context: LogContext, options?: { cfEnv?: any; ctx?: any }) {
    emit('warn', context, options);
  },
  error(context: LogContext, options?: { cfEnv?: any; ctx?: any }) {
    emit('error', context, options);
  },
  critical(context: LogContext, options?: { cfEnv?: any; ctx?: any }) {
    emit('critical', context, options);
  },
};

