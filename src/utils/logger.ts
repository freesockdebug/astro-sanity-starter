// src/utils/logger.ts
// Cloudflare Observability Native Structured JSON Logger with D1 Integration & Data Sanitization

import { recordErrorLog, type RecordErrorLogInput } from '../db/logs.repo';

export type LogLevel = 'info' | 'warn' | 'error' | 'critical';

export interface LogContext {
  module: string;
  event?: string;
  message: string;
  rayId?: string;
  path?: string;
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
 * Dispatches async persistence to D1 via ExecutionContext.waitUntil if available.
 */
function persistToD1Async(input: RecordErrorLogInput, customEnv?: any, ctx?: any) {
  const env = customEnv || (typeof globalThis !== 'undefined' ? (globalThis as any).__CF_ENV__ : undefined);
  const executionCtx = ctx || (typeof globalThis !== 'undefined' ? (globalThis as any).__CF_CTX__ : undefined);

  const writePromise = recordErrorLog(input, env).catch(() => false);

  if (executionCtx && typeof executionCtx.waitUntil === 'function') {
    executionCtx.waitUntil(writePromise);
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

  if (formattedError) payload.error = formattedError;
  if (formattedStack && !payload.stack) payload.stack = formattedStack.slice(0, 1500);

  // Cloudflare Workers Observability natively parses JSON stdout
  const jsonStr = JSON.stringify(payload);

  if (level === 'error' || level === 'critical') {
    console.error(jsonStr);
  } else if (level === 'warn') {
    console.warn(jsonStr);
  } else {
    console.log(jsonStr);
  }

  // Persist warn / error / critical to D1 system_error_logs
  if (level === 'warn' || level === 'error' || level === 'critical') {
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
      },
      options.cfEnv,
      options.ctx
    );
  }
}

export const logger = {
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

