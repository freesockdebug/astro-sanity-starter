// src/db/client.ts
// Unified Database Client: abstracts Cloudflare D1 and Node.js SQLite (DatabaseSync)
// Allows all repositories to write SQL once using standard ? positional placeholders.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getRuntimeEnv, getMergedAdminEmails } from '../utils/auth';
import { getActiveProfiler } from '../utils/profiler';

export function getAdminEmailList(): string[] {
  return getMergedAdminEmails();
}

export function generateOrderNo(prefix: string = 'ORD'): string {
  const cleanPrefix = (prefix || 'ORD').trim().replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .toUpperCase()
    .padStart(4, '0');
  return `${cleanPrefix}-${yyyy}${mm}${dd}-${rand}`;
}

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface DbClient {
  isD1: boolean;
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  first<T = any>(sql: string, params?: any[]): Promise<T | null>;
  execute(sql: string, params?: any[]): Promise<{ changes: number; lastInsertId?: number | string }>;
  batch(operations: { sql: string; params?: any[] }[]): Promise<void>;
  raw: any;
}

async function getRuntimeD1(): Promise<any> {
  try {
    // @ts-ignore
    const cf: any = await import('cloudflare:workers');
    return cf?.env?.DB || null;
  } catch {
    return null;
  }
}

let localNodeDbInstance: any = null;

function getLocalNodeDb(): any {
  if (localNodeDbInstance) return localNodeDbInstance;
  try {
    // @ts-ignore
    const { DatabaseSync } = require('node:sqlite');
    const dbDir = path.resolve(process.cwd(), '.wrangler', 'state', 'v3', 'd1');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path.join(dbDir, 'local-dev.sqlite');
    localNodeDbInstance = new DatabaseSync(dbPath);
    try {
      localNodeDbInstance.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA busy_timeout = 5000;
        PRAGMA foreign_keys = ON;
      `);
    } catch {}
    return localNodeDbInstance;
  } catch (err) {
    console.warn('[DB] node:sqlite initialization failed:', err);
    return null;
  }
}

class D1ClientAdapter implements DbClient {
  readonly isD1 = true;
  private readonly target: any;

  constructor(public readonly raw: any, sessionConstraint: string = 'first-unconstrained') {
    // If Cloudflare D1 Read Replication Sessions API is available, route reads to nearest replica while maintaining read-your-writes
    this.target = typeof raw?.withSession === 'function'
      ? raw.withSession(sessionConstraint)
      : raw;
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const t0 = Date.now();
    try {
      const stmt = this.target.prepare(sql);
      const bound = params.length > 0 ? stmt.bind(...params) : stmt;
      const res = await bound.all();
      return (res?.results || []) as T[];
    } finally {
      const dur = Date.now() - t0;
      if (!sql.includes('system_error_logs')) {
        getActiveProfiler()?.addSpan('d1', dur);
        if (dur > 200) {
          console.warn(`[DB Slow SQL] query (${dur}ms): ${sql.slice(0, 160)}`);
        }
      }
    }
  }

  async first<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const t0 = Date.now();
    try {
      const stmt = this.target.prepare(sql);
      const bound = params.length > 0 ? stmt.bind(...params) : stmt;
      const res = await bound.first();
      return (res || null) as T | null;
    } finally {
      const dur = Date.now() - t0;
      if (!sql.includes('system_error_logs')) {
        getActiveProfiler()?.addSpan('d1', dur);
        if (dur > 200) {
          console.warn(`[DB Slow SQL] first (${dur}ms): ${sql.slice(0, 160)}`);
        }
      }
    }
  }

  async execute(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertId?: number | string }> {
    const t0 = Date.now();
    try {
      const stmt = this.target.prepare(sql);
      const bound = params.length > 0 ? stmt.bind(...params) : stmt;
      const res = await bound.run();
      return {
        changes: res?.meta?.changes ?? 0,
        lastInsertId: res?.meta?.last_row_id,
      };
    } finally {
      const dur = Date.now() - t0;
      if (!sql.includes('system_error_logs')) {
        getActiveProfiler()?.addSpan('d1', dur);
        if (dur > 200) {
          console.warn(`[DB Slow SQL] execute (${dur}ms): ${sql.slice(0, 160)}`);
        }
      }
    }
  }

  async batch(operations: { sql: string; params?: any[] }[]): Promise<void> {
    if (!this.target || !operations || operations.length === 0) return;
    const t0 = Date.now();
    try {
      const d1Stmts = operations.map((op) => {
        const stmt = this.target.prepare(op.sql);
        return op.params && op.params.length > 0 ? stmt.bind(...op.params) : stmt;
      });
      await this.target.batch(d1Stmts);
    } finally {
      const dur = Date.now() - t0;
      if (!operations.some((op) => op.sql.includes('system_error_logs'))) {
        getActiveProfiler()?.addSpan('d1', dur);
      }
    }
  }
}

class SQLiteClientAdapter implements DbClient {
  readonly isD1 = false;
  constructor(public readonly raw: any) {}

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.raw) return [];
    const t0 = Date.now();
    try {
      const stmt = this.raw.prepare(sql);
      const rows = stmt.all(...params);
      return (rows || []) as T[];
    } finally {
      if (!sql.includes('system_error_logs')) {
        getActiveProfiler()?.addSpan('d1', Date.now() - t0);
      }
    }
  }

  async first<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    if (!this.raw) return null;
    const t0 = Date.now();
    try {
      const stmt = this.raw.prepare(sql);
      const row = stmt.get(...params);
      return (row || null) as T | null;
    } finally {
      if (!sql.includes('system_error_logs')) {
        getActiveProfiler()?.addSpan('d1', Date.now() - t0);
      }
    }
  }

  async execute(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertId?: number | string }> {
    if (!this.raw) return { changes: 0 };
    const t0 = Date.now();
    try {
      const stmt = this.raw.prepare(sql);
      const info = stmt.run(...params);
      return {
        changes: Number(info?.changes ?? 0),
        lastInsertId: info?.lastInsertRowid ? String(info.lastInsertRowid) : undefined,
      };
    } finally {
      if (!sql.includes('system_error_logs')) {
        getActiveProfiler()?.addSpan('d1', Date.now() - t0);
      }
    }
  }

  async batch(operations: { sql: string; params?: any[] }[]): Promise<void> {
    if (!this.raw || !operations || operations.length === 0) return;
    this.raw.exec('BEGIN');
    try {
      for (const op of operations) {
        const stmt = this.raw.prepare(op.sql);
        stmt.run(...(op.params || []));
      }
      this.raw.exec('COMMIT');
    } catch (err) {
      try {
        this.raw.exec('ROLLBACK');
      } catch {
        // ignore rollback error on disconnected db
      }
      throw err;
    }
  }
}

export async function getDb(): Promise<DbClient> {
  const runtimeD1 = await getRuntimeD1();
  if (runtimeD1) {
    return new D1ClientAdapter(runtimeD1);
  }
  const localDb = getLocalNodeDb();
  return new SQLiteClientAdapter(localDb);
}

// Backward-compatible handle resolver for existing callers
export async function getDbHandle(): Promise<{ isD1: boolean; db: any }> {
  const client = await getDb();
  return { isD1: client.isD1, db: client.raw };
}

