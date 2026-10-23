import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const rootDir = process.cwd();
const serverDir = path.join(rootDir, 'dist', 'server');
const clientDir = path.join(rootDir, 'dist', 'client');
const generatedWranglerPath = path.join(serverDir, 'wrangler.json');
const entryPath = path.join(serverDir, 'entry.mjs');

function fail(message) {
    console.error(`\n❌ [Cloudflare Deploy Check Failed] ${message}\n`);
    process.exit(1);
}

console.log('🔍 Running Cloudflare Workers deployment compliance checks...');

// 1. Check build artifacts exist
if (!fs.existsSync(serverDir) || !fs.existsSync(entryPath)) {
    fail('Missing SSR worker entry at dist/server/entry.mjs');
}
if (!fs.existsSync(clientDir)) {
    fail('Missing static assets directory at dist/client');
}
if (!fs.existsSync(generatedWranglerPath)) {
    fail('Missing generated Wrangler config at dist/server/wrangler.json');
}

// 2. Validate generated Wrangler configuration
const wranglerConfig = JSON.parse(fs.readFileSync(generatedWranglerPath, 'utf8'));
if (wranglerConfig.main !== 'entry.mjs') {
    fail(`Expected wrangler.json "main" to be "entry.mjs", got "${wranglerConfig.main}"`);
}
if (!Array.isArray(wranglerConfig.compatibility_flags) || !wranglerConfig.compatibility_flags.includes('nodejs_compat')) {
    fail('Missing "nodejs_compat" in compatibility_flags');
}
if (!wranglerConfig.assets || wranglerConfig.assets.binding !== 'ASSETS') {
    fail('Missing ASSETS binding in wrangler.json');
}

// 3. Check SSR Worker bundle size & forbidden modules (prevent Error 1102 / Sanity Studio leak)
let totalWorkerBytes = 0;
const forbiddenPatterns = [
    { pattern: /["']fs-extra["']/, name: 'fs-extra (Node filesystem module)' },
    { pattern: /["']sanity\/structure["']/, name: 'sanity/structure (Sanity Studio leaked into SSR Worker)' },
    { pattern: /["']styled-components["']/, name: 'styled-components (Sanity Studio UI dependency leaked into SSR Worker)' },
];

function scanServerFiles(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            scanServerFiles(fullPath);
        } else if (entry.name.endsWith('.mjs') || entry.name.endsWith('.js')) {
            const stat = fs.statSync(fullPath);
            totalWorkerBytes += stat.size;
            const content = fs.readFileSync(fullPath, 'utf8');
            for (const { pattern, name } of forbiddenPatterns) {
                if (pattern.test(content)) {
                    fail(`Forbidden module detected in Worker bundle (${path.relative(rootDir, fullPath)}): ${name}`);
                }
            }
        }
    }
}

scanServerFiles(serverDir);

const totalWorkerKiB = (totalWorkerBytes / 1024).toFixed(1);
const maxAllowedBytes = 2 * 1024 * 1024; // 2 MiB uncompressed ceiling to guarantee fast cold start (<10ms CPU)
if (totalWorkerBytes > maxAllowedBytes) {
    fail(`SSR Worker bundle size (${totalWorkerKiB} KiB) exceeds safe threshold (2048 KiB) for Cloudflare Workers startup CPU limit.`);
}

// 4. Optional Wrangler dry-run validation when --dry-run is explicitly requested
if (process.argv.includes('--dry-run')) {
    try {
        execSync('npx wrangler deploy --dry-run --outdir .wrangler/dry-run', {
            cwd: rootDir,
            stdio: 'pipe',
        });
        fs.rmSync(path.join(rootDir, '.wrangler', 'dry-run'), { recursive: true, force: true });
    } catch (err) {
        const stderr = err.stderr ? err.stderr.toString() : err.message;
        fail(`Wrangler dry-run validation failed:\n${stderr}`);
    }
}

console.log(`✅ [Cloudflare Deploy Check Passed] Worker bundle: ${totalWorkerKiB} KiB | nodejs_compat: enabled | ASSETS binding: OK`);
