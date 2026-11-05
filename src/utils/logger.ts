// src/utils/logger.ts
// Cloudflare Observability Native Structured JSON Logger with D1 Integration & Data Sanitization

import { waitUntil as cfWaitUntil, env as cfWorkerEnv } from 'cloudflare:workers';
import type { APIRoute, APIContext } from 'astro';
import { recordErrorLog, type RecordErrorLogInput } from '../db/logs.repo';
import { getActiveProfiler } from './profiler';
import { SecurityService } from './security';

export { LOG_LEVEL_WEIGHT } from '../db/logs.repo';

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
  clientIp?: string;
  country?: string;
  city?: string;
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
      if (typeof value !== 'number' && typeof value !== 'boolean' && SENSITIVE_KEY_REGEX.test(key)) {
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
      clientIp: context.clientIp || null,
      country: context.country || null,
      city: context.city || null,
    },
    options.cfEnv,
    options.ctx
  );
}

export interface MeasureOptions {
  module: string;
  event?: string;
  path?: string;
  rayId?: string;
  userId?: string;
  userEmail?: string;
  clientIp?: string;
  country?: string;
  city?: string;
  /** Automatically upgrade to warn if latency exceeds this threshold (default: 500ms) */
  warnThresholdMs?: number;
  /** Associated request-level span timings dictionary */
  spans?: Record<string, number>;
  cfEnv?: any;
  ctx?: any;
}

/**
 * Measures execution time of an operation with performance.now() and logs results.
 */
export async function measure<T>(
  label: string,
  fn: () => Promise<T> | T,
  options: MeasureOptions
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const latencyMs = Math.round((performance.now() - start) * 100) / 100;

    if (options.spans) {
      options.spans[label] = latencyMs;
    }
    const profiler = getActiveProfiler();
    if (profiler) {
      profiler.addSpan(label, latencyMs);
    }

    const warnThreshold = options.warnThresholdMs ?? 500;
    const level: LogLevel = latencyMs >= warnThreshold ? 'warn' : 'debug';

    emit(
      level,
      {
        module: options.module,
        event: options.event || (level === 'warn' ? 'SLOW_OPERATION' : 'OPERATION_TIMING'),
        message: `${label} completed in ${latencyMs}ms`,
        latencyMs,
        path: options.path,
        rayId: options.rayId,
        userId: options.userId,
        userEmail: options.userEmail,
        clientIp: options.clientIp,
        country: options.country,
        city: options.city,
        context: { operation: label, latencyMs },
      },
      { cfEnv: options.cfEnv, ctx: options.ctx }
    );
    return result;
  } catch (err: any) {
    const latencyMs = Math.round((performance.now() - start) * 100) / 100;
    if (options.spans) {
      options.spans[`${label}_err`] = latencyMs;
    }
    const profiler = getActiveProfiler();
    if (profiler) {
      profiler.addSpan(`${label}_err`, latencyMs);
    }
    emit(
      'error',
      {
        module: options.module,
        event: options.event || 'OPERATION_FAILED',
        message: `${label} failed after ${latencyMs}ms: ${err?.message || 'Unknown error'}`,
        latencyMs,
        path: options.path,
        rayId: options.rayId,
        userId: options.userId,
        userEmail: options.userEmail,
        clientIp: options.clientIp,
        country: options.country,
        city: options.city,
        error: err,
        context: { operation: label, latencyMs },
      },
      { cfEnv: options.cfEnv, ctx: options.ctx }
    );
    throw err;
  }
}

/**
 * Injects X-Response-Time and Server-Timing headers into the Response for DevTools waterfall profiling.
 */
export function appendTimingHeaders(
  response: Response,
  latencyMs: number,
  spans?: Record<string, number>
): Response {
  const roundedLatency = Math.round(latencyMs * 100) / 100;
  const timingParts = [`total;dur=${roundedLatency}`];
  if (spans) {
    for (const [name, dur] of Object.entries(spans)) {
      timingParts.push(`${name};dur=${Math.round(dur * 100) / 100}`);
    }
  }

  const headersToSet: Record<string, string> = {
    'X-Response-Time': `${roundedLatency}ms`,
    'Server-Timing': timingParts.join(', '),
  };

  try {
    for (const [k, v] of Object.entries(headersToSet)) {
      response.headers.set(k, v);
    }
    return response;
  } catch {
    const newHeaders = new Headers(response.headers);
    for (const [k, v] of Object.entries(headersToSet)) {
      newHeaders.set(k, v);
    }
    const body = [204, 205, 304].includes(response.status) ? null : response.body;
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  }
}

export interface ApiPerfOptions {
  slowThresholdMs?: number;
  cfEnv?: any;
}

/**
 * Decorator for Astro API routes that measures latency and injects timing headers & diagnostics.
 */
export function withApiPerf(
  moduleName: string,
  handler: APIRoute,
  options: ApiPerfOptions = {}
): APIRoute {
  return async (context: APIContext) => {
    const start = performance.now();
    const spans: Record<string, number> = {};
    (context.locals as any).perfSpans = spans;

    const rayId =
      (context.locals as any)?.rayId ||
      context.request.headers.get('cf-ray') ||
      crypto.randomUUID();
    const pathname = context.url.pathname;
    const method = context.request.method;
    const { ip: clientIp, country, city } = SecurityService.resolveClientMeta(context.request);
    const cfEnv = options.cfEnv || (context.locals as any)?.runtime?.env || (globalThis as any).__CF_ENV__;
    const runtimeCtx = (context.locals as any)?.cfContext;

    try {
      const response = await handler(context);
      const latencyMs = Math.round((performance.now() - start) * 100) / 100;
      const slowThreshold = options.slowThresholdMs ?? 800;

      // Avoid infinite self-logging when querying /api/admin/logs
      if (!pathname.startsWith('/api/admin/logs')) {
        const level: LogLevel =
          response.status >= 500
            ? 'error'
            : latencyMs >= slowThreshold
            ? 'warn'
            : 'info';

        const activeProfiler = getActiveProfiler();
        const activeSpans = activeProfiler ? activeProfiler.getSpans() : {};
        const combinedSpans = { ...activeSpans, ...spans };

        emit(
          level,
          {
            module: moduleName,
            event:
              level === 'warn'
                ? 'SLOW_API_CALL'
                : level === 'error'
                ? 'API_ERROR_RESPONSE'
                : 'API_CALL_COMPLETED',
            message: `${method} ${pathname} -> ${response.status} (${latencyMs}ms)`,
            path: pathname,
            method,
            statusCode: response.status,
            rayId,
            latencyMs,
            clientIp,
            country,
            city,
            context: {
              method,
              statusCode: response.status,
              latencyMs,
              spans: Object.keys(combinedSpans).length > 0 ? combinedSpans : undefined,
            },
          },
          { cfEnv, ctx: runtimeCtx }
        );
      }

      const activeProfiler = getActiveProfiler();
      const activeSpans = activeProfiler ? activeProfiler.getSpans() : {};
      const combinedSpans = { ...activeSpans, ...spans };
      return appendTimingHeaders(response, latencyMs, combinedSpans);
    } catch (err: any) {
      const latencyMs = Math.round((performance.now() - start) * 100) / 100;
      emit(
        'error',
        {
          module: moduleName,
          event: 'API_UNHANDLED_EXCEPTION',
          message: `${method} ${pathname} crashed after ${latencyMs}ms: ${err?.message || 'Error'}`,
          path: pathname,
          method,
          rayId,
          latencyMs,
          clientIp,
          country,
          city,
          error: err,
          context: { method, latencyMs, spans },
        },
        { cfEnv, ctx: runtimeCtx }
      );
      throw err;
    }
  };
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
  measure,
};

