// src/utils/profiler.ts
// Request-Scoped Sub-step Span Profiler & Server-Timing Header Generator

import { AsyncLocalStorage } from 'node:async_hooks';

export interface SpanBreakdown {
  [spanName: string]: number;
}

export class RequestProfiler {
  private spans = new Map<string, number>();
  private activeSpans = new Map<string, number>();
  private cacheTiers = { l1: 0, l2: 0, l3: 0 };
  public readonly startTotal: number = typeof performance !== 'undefined' ? performance.now() : Date.now();

  recordCacheTier(tier: 'l1' | 'l2' | 'l3'): void {
    this.cacheTiers[tier] += 1;
  }

  getCacheTiers(): { l1: number; l2: number; l3: number } {
    return { ...this.cacheTiers };
  }

  startSpan(name: string): void {
    this.activeSpans.set(name, typeof performance !== 'undefined' ? performance.now() : Date.now());
  }

  endSpan(name: string): number {
    const start = this.activeSpans.get(name);
    if (start === undefined) return 0;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dur = Math.max(0, Math.round(now - start));
    this.addSpan(name, dur);
    this.activeSpans.delete(name);
    return dur;
  }

  addSpan(name: string, durationMs: number): void {
    const prev = this.spans.get(name) || 0;
    this.spans.set(name, prev + Math.max(0, Math.round(durationMs)));
  }

  async time<T>(name: string, fn: () => Promise<T>): Promise<T> {
    this.startSpan(name);
    try {
      return await fn();
    } finally {
      this.endSpan(name);
    }
  }

  getSpans(): SpanBreakdown {
    const out: SpanBreakdown = {};
    for (const [k, v] of this.spans.entries()) {
      out[k] = v;
    }
    return out;
  }

  toServerTimingHeader(totalMs: number): string {
    const rounded = Math.round(totalMs * 10) / 10;
    const parts = [`total;dur=${rounded}`];
    for (const [name, dur] of this.spans.entries()) {
      parts.push(`${name};dur=${Math.round(dur * 10) / 10}`);
    }
    return parts.join(', ');
  }
}

export const requestProfilerStorage = new AsyncLocalStorage<RequestProfiler>();

export function getActiveProfiler(): RequestProfiler | undefined {
  return requestProfilerStorage.getStore();
}

