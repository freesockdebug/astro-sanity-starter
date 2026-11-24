// scripts/audits/02-db-auth-rbac.audit.ts
import type { AuditViolation, DomainAuditSuite } from './types';
import { findLineMatches } from './types';

const DOC_PATH = 'docs/02-db-auth-rbac.md';
const DOMAIN = '02-db-auth-rbac' as const;

export const dbAuthRbacAuditSuite: DomainAuditSuite = {
  domain: DOMAIN,
  name: '双引擎数据库 (D1/Postgres)、零 I/O 鉴权与 RBAC 对抗审计',
  docPath: DOC_PATH,
  triggerPatterns: [
    /^src\/db\//,
    /^db\/schema/,
    /^src\/utils\/(auth|authGuards|rbac)\.ts$/,
    /^src\/pages\/api\/(auth|admin|orders|user)\//,
    /^docs\/02-db-auth-rbac\.md$/,
  ],
  unitTestFiles: ['test/waf.test.ts', 'test/security.test.ts'],
  rules: [
    {
      id: 'DB-ADV-01',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '严禁 SQL JOIN ON 跨列 OR 笛卡尔全表扫描',
      historicalContext:
        '历史慢查询故障：在 listAdminUsers 中写了 LEFT JOIN orders o ON (o.user_id = u.id OR o.buyer_email = u.email)，导致 PostgreSQL 与 SQLite 均无法走 B-Tree 索引，退化为 O(N*M) 笛卡尔积全表扫描，耗时超 1.5 秒。',
      remediation:
        '将跨列 OR 关联拆解为基于 UNION / UNION ALL 的独立索引子查询（分别命中 idx_orders_user_id 与 idx_orders_buyer_email）。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const repoFiles = ctx.listFiles('src/db', /\.repo\.ts$/);
        for (const file of repoFiles) {
          const content = ctx.readFile(file);
          const matches = findLineMatches(content, /JOIN\s+[a-zA-Z0-9_]+\s+[a-zA-Z0-9_]*\s*ON\s*\([^)]*\bOR\b[^)]*\)/i);
          for (const m of matches) {
            violations.push({
              ruleId: 'DB-ADV-01',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: '检测到 JOIN ON 子句中包含跨列 OR 条件（引发索引失效全表扫描）',
              historicalContext: 'SQLite 与 Postgres 面对 JOIN ON (a = x OR b = y) 会放弃索引执行嵌套循环全表扫描。',
              file,
              line: m.line,
              snippet: m.snippet,
              remediation: '改写为 UNION / UNION ALL 关联子查询，确保每个分支单独命中单列/复合索引。',
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'DB-ADV-02',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'SQLite / Postgres 双引擎 SQL 方言与 UTC 时间戳兼容性挑刺',
      historicalContext:
        '双引擎常见隐蔽炸弹：(1) SQLite 支持双参数 MAX(a, b) 标量函数，但 Postgres 会直接报 function max(text, text) does not exist（应改用 CASE WHEN 或 GREATEST）；(2) 直接用 toISOString() 带 T/Z 的字符串与 CURRENT_TIMESTAMP 空格分隔时间比较会导致字典序错位。',
      remediation:
        '在 src/db/*.repo.ts 中禁止使用双参数 MAX(a, b)，时间截止线统一使用 formatUtcCutoff / formatUtcSqlTimestamp 生成空格分隔的 UTC 字符串。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const repoFiles = ctx.listFiles('src/db', /\.repo\.ts$/);
        for (const file of repoFiles) {
          const content = ctx.readFile(file);
          // 检查 SQL 字符串中的双参数 MAX(col1, col2)（排除 JS Math.max）
          const twoArgMax = findLineMatches(content, /(?<!Math\.)\bMAX\s*\(\s*[a-zA-Z0-9_.]+\s*,\s*[a-zA-Z0-9_.]+\s*\)/);
          for (const m of twoArgMax) {
            violations.push({
              ruleId: 'DB-ADV-02',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: '检测到双参数 MAX(a, b) 调用（PostgreSQL 不兼容）',
              historicalContext: 'PostgreSQL 中 MAX() 仅能作为单参数聚合函数，多参数标量比较在 Postgres 下直接报语法错误。',
              file,
              line: m.line,
              snippet: m.snippet,
              remediation: '使用单参数聚合 MAX(col) 配合 UNION ALL，或使用 CASE WHEN a > b THEN a ELSE b END。',
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'DB-ADV-03',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '后台管理 API (/api/admin/*) 零信任鉴权守卫全覆盖挑刺',
      historicalContext:
        '任何 /src/pages/api/admin/** 下的接口如果忘记调用 requireAdminAuth / verifyAdminRequest / getAdminContext 鉴权守卫，将导致未授权外部请求直接读写后台敏感数据。',
      remediation:
        '所有 /src/pages/api/admin/**/*.ts 路由必须引入并调用 authGuards.ts 或 auth.ts 中的管理员鉴权函数。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const adminApis = ctx.listFiles('src/pages/api/admin', /\.ts$/);
        const authGuardPattern =
          /\b(defineAdminApi|verifyAdminAuth|requireAdminContext|requireAdminAuth|verifyAdminRequest|getSessionFromRequest)\b/;

        for (const file of adminApis) {
          const content = ctx.readFile(file);
          if (!authGuardPattern.test(content)) {
            violations.push({
              ruleId: 'DB-ADV-03',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: '发现未挂载管理员鉴权守卫的 /api/admin/* 端点',
              historicalContext: '网络入口即零信任校验边界，任何后台 API 严禁无鉴权裸奔。',
              file,
              remediation: '在 API 入口处调用 requireAdminAuth / requirePermission 完成会话与 RBAC 权限校验。',
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'DB-ADV-04',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: 'RBAC 静态角色权限严禁被冷启动/部署 DDL UPDATE 覆盖 & 保持动静分离',
      historicalContext:
        '早期 schema.ts / schema.sql 中曾包含 UPDATE admin_roles SET menus_json/permissions_json = ... WHERE code IN ("sales_manager", "auditor")，导致每次 Worker 冷启动或 CI 部署都会把管理员在后台自定义修改过的角色权限重置回默认值。',
      remediation:
        '在 src/db/schema.ts、db/schema.sql、db/schema.postgres.sql 中仅允许 INSERT OR IGNORE / ON CONFLICT DO NOTHING 初始化默认角色，严禁对 sales_manager / auditor 执行强制覆盖 UPDATE。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const schemaFiles = ['src/db/schema.ts', 'db/schema.sql', 'db/schema.postgres.sql', 'src/db/rbac.repo.ts'];

        for (const file of schemaFiles) {
          const content = ctx.readFile(file);
          if (!content) continue;
          if (/UPDATE\s+admin_roles\s+SET\s+[^\n;]*WHERE\s+code\s*=\s*['"](sales_manager|auditor)['"]/i.test(content)) {
            violations.push({
              ruleId: 'DB-ADV-04',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: '检测到在 Schema/RBAC 初始化中强制 UPDATE 覆盖内置角色 (sales_manager / auditor) 权限的反模式',
              historicalContext: '冷启动或 CI 部署执行 UPDATE admin_roles 会抹除管理员在后台界面保存的自定义角色权限。',
              file,
              remediation: '移除针对 sales_manager / auditor 的 UPDATE admin_roles 语句，仅保留 INSERT OR IGNORE / ON CONFLICT DO NOTHING。',
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'DB-ADV-05',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '三方数据库 Schema 漂移挑刺 (src/db/schema.ts <-> db/schema.sql <-> db/schema.postgres.sql)',
      historicalContext:
        '项目同时维护运行时 schema.ts、D1 部署用的 db/schema.sql 与 Supabase Postgres 用的 db/schema.postgres.sql。历史演进中曾出现 schema.ts 新增了 waf_rules / waf_ip_acl 表及 4 个复合索引，而 db/schema*.sql 漏同步导致生产库结构与索引漂移。',
      remediation:
        '任何 CREATE TABLE 或 CREATE INDEX 变更必须同步更新 src/db/schema.ts、db/schema.sql 与 db/schema.postgres.sql 三处，确保表集合与索引集合 100% 一致。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const extractNames = (sqlText: string, regex: RegExp): Set<string> => {
          const set = new Set<string>();
          let m: RegExpExecArray | null;
          const re = new RegExp(regex.source, 'gi');
          while ((m = re.exec(sqlText)) !== null) {
            set.add(m[1].toLowerCase());
          }
          return set;
        };

        const baseFile = 'src/db/schema.ts';
        const baseContent = ctx.readFile(baseFile);
        if (!baseContent) return violations;

        const baseTables = extractNames(baseContent, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-z0-9_]+)/i);
        const baseIndexes = extractNames(baseContent, /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+([a-z0-9_]+)/i);

        for (const targetFile of ['db/schema.sql', 'db/schema.postgres.sql']) {
          const targetContent = ctx.readFile(targetFile);
          if (!targetContent) continue;

          const targetTables = extractNames(targetContent, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-z0-9_]+)/i);
          const targetIndexes = extractNames(targetContent, /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+([a-z0-9_]+)/i);

          const missingTables = [...baseTables].filter((t) => !targetTables.has(t));
          const extraTables = [...targetTables].filter((t) => !baseTables.has(t));
          if (missingTables.length > 0 || extraTables.length > 0) {
            violations.push({
              ruleId: 'DB-ADV-05',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `${targetFile} 与 ${baseFile} 的表定义集合不一致 (缺失: [${missingTables.join(', ')}], 多余: [${extraTables.join(', ')}])`,
              historicalContext: '三方 Schema 漂移会导致 Cloudflare D1 与 PostgreSQL 生产环境缺表报错。',
              file: targetFile,
              remediation: `将 ${baseFile} 中的 CREATE TABLE 定义同步至 ${targetFile}。`,
            });
          }

          const missingIdx = [...baseIndexes].filter((idx) => !targetIndexes.has(idx));
          const extraIdx = [...targetIndexes].filter((idx) => !baseIndexes.has(idx));
          if (missingIdx.length > 0 || extraIdx.length > 0) {
            violations.push({
              ruleId: 'DB-ADV-05',
              domain: DOMAIN,
              docPath: DOC_PATH,
              title: `${targetFile} 与 ${baseFile} 的索引集合不一致 (缺失: [${missingIdx.join(', ')}], 未清理冗余: [${extraIdx.join(', ')}])`,
              historicalContext: '索引漂移会导致某一数据库引擎出现慢查询或残留已废弃的冗余索引。',
              file: targetFile,
              remediation: `将 ${baseFile} 中的 DROP INDEX 与 CREATE INDEX 列表完整同步至 ${targetFile}。`,
            });
          }
        }
        return violations;
      },
    },
    {
      id: 'DB-ADV-06',
      domain: DOMAIN,
      docPath: DOC_PATH,
      title: '边缘 Worker 请求级 Postgres 连接主动回收与禁止顶层静态引入 node:fs/node:path 挑刺',
      historicalContext:
        '1) Cloudflare Workers 下每次请求创建的 postgres.js 实例若未在请求结束时通过 profiler.cleanup() 调用 sqlClient.end({ timeout: 0 })，高并发下会导致 Supavisor / Hyperdrive 挂起连接池耗尽；2) src/db/client.ts 若在模块顶层静态 import node:fs 或 node:path，会把 Node.js 磁盘垫片打入边缘 Worker 包体。',
      remediation:
        '在 src/db/client.ts 中通过 getLocalNodeDb() 按需惰性加载 node:fs/node:path/node:sqlite，并在 activeProfiler.registerCleanup 中注册 Worker 级 Postgres 连接 close()，由 src/middleware.ts finally 块统一调用 profiler.cleanup() 回收。',
      check: (ctx) => {
        const violations: AuditViolation[] = [];
        const clientCode = ctx.readFile('src/db/client.ts');
        if (!clientCode) return violations;

        const topLevelNodeFs = findLineMatches(clientCode, /^import\s+.*from\s+['"]node:(fs|path|sqlite)['"]/);
        for (const m of topLevelNodeFs) {
          violations.push({
            ruleId: 'DB-ADV-06',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/db/client.ts 存在顶层静态 import node:fs / node:path / node:sqlite',
            historicalContext: '顶层静态引入 Node.js 磁盘模块会污染 Cloudflare Workers 边缘构建产物。',
            file: 'src/db/client.ts',
            line: m.line,
            snippet: m.snippet,
            remediation: '移入 getLocalNodeDb() 函数内部通过 process.getBuiltinModule / require 按需惰性加载。',
          });
        }

        if (!clientCode.includes('sqlClient.end') || !clientCode.includes('registerCleanup')) {
          violations.push({
            ruleId: 'DB-ADV-06',
            domain: DOMAIN,
            docPath: DOC_PATH,
            title: 'src/db/client.ts 缺失 Worker 请求级 Postgres 连接主动关闭钩子 (registerCleanup -> sqlClient.end)',
            historicalContext: 'Serverless 边缘请求结束后不主动释放 TCP 连接会导致上游连接池在高并发下被占满。',
            file: 'src/db/client.ts',
            remediation: '在 PostgresClientAdapter.close() 中调用 this.sqlClient.end({ timeout: 0 }) 并注册到 activeProfiler.registerCleanup。',
          });
        }
        return violations;
      },
    },
  ],
  verify: async () => {
    const violations: AuditViolation[] = [];
    const { RequestDeduplicatingDbClient } = await import('../../src/db/client.js');

    let physicalQueryCount = 0;
    let dbRowVersion = 1;

    const client = new RequestDeduplicatingDbClient({
      isD1: false,
      dialect: 'sqlite',
      raw: null,
      query: async <T>() => {
        physicalQueryCount += 1;
        await new Promise((r) => setTimeout(r, 4));
        return [{ id: 1, v: dbRowVersion }] as unknown as T[];
      },
      first: async <T>() => {
        physicalQueryCount += 1;
        await new Promise((r) => setTimeout(r, 4));
        return { id: 1, v: dbRowVersion } as unknown as T;
      },
      execute: async () => {
        dbRowVersion += 1;
        return { changes: 1 };
      },
      batch: async () => {
        dbRowVersion += 1;
      },
    });

    // 故障注入 1: 12 并发相同 SELECT + 返回数组原地篡改污染测试
    const [r1, r2] = await Promise.all([
      client.query<{ id: number; v: number }>('SELECT id, v FROM orders WHERE id = ?', [1]),
      client.query<{ id: number; v: number }>('SELECT id, v FROM orders WHERE id = ?', [1]),
    ]);
    r1.pop(); // 恶意篡改调用方 1 的返回数组

    if (physicalQueryCount !== 1 || r2.length !== 1) {
      violations.push({
        ruleId: 'DB-ADV-01',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: '运行时对抗故障注入失败: RequestDeduplicatingDbClient 并发 SELECT 未折叠或返回引用发生了跨调用方内存污染',
        historicalContext: '并发相同 SELECT 必须合并为 1 次底层查询，且必须浅拷贝结果数组防止原地 .pop()/.sort() 污染并发请求。',
        file: 'src/db/client.ts',
        remediation: '检查 RequestDeduplicatingDbClient.query() 的 in-flight Map 与结果数组克隆隔离。',
      });
    }

    // 故障注入 2: 读写交织并发 (In-flight Read 期间发生 Write) -> 写后读必须 100% 拿到新版本 (Read-Your-Writes)
    const inFlightRead = client.first<{ id: number; v: number }>('SELECT id, v FROM orders WHERE id = ?', [1]);
    await client.execute('UPDATE orders SET v = v + 1 WHERE id = ?', [1]);
    await inFlightRead;
    const afterWriteRead = await client.first<{ id: number; v: number }>('SELECT id, v FROM orders WHERE id = ?', [1]);

    if (afterWriteRead?.v !== 2) {
      violations.push({
        ruleId: 'DB-ADV-01',
        domain: DOMAIN,
        docPath: DOC_PATH,
        title: `运行时对抗故障注入失败: 数据库写操作后发生脏读 (预期 v=2, 实际 v=${afterWriteRead?.v})`,
        historicalContext: 'execute()/batch() 必须立即递增 mutationEpoch 清空飞行中读复用映射，否则会导致严重的写后脏读。',
        file: 'src/db/client.ts',
        remediation: '检查 RequestDeduplicatingDbClient.execute() / batch() 中的读写版本屏障。',
      });
    }

    return violations;
  },
};
