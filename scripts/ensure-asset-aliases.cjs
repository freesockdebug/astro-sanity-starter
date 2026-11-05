const fs = require('fs');
const path = require('path');

const clientAstroDir = path.join(process.cwd(), 'dist/client/_astro');
if (!fs.existsSync(clientAstroDir)) {
  console.log('[ensure-asset-aliases] dist/client/_astro not found, skipping.');
  process.exit(0);
}

// 1. Determine active Layout CSS from server entrypoint (ground truth)
let activeLayoutCss = null;
const entryPath = path.join(process.cwd(), 'dist/server/entry.mjs');
if (fs.existsSync(entryPath)) {
  const entrySrc = fs.readFileSync(entryPath, 'utf-8');
  const match = entrySrc.match(/["'](\/_astro\/(Layout\.[^"']+\.css))["']/);
  if (match) {
    activeLayoutCss = match[2];
  }
}

// Fallback: search client directory for non-alias Layout.*.css
if (!activeLayoutCss) {
  const files = fs.readdirSync(clientAstroDir);
  const cssFiles = files.filter(f => f.startsWith('Layout.') && f.endsWith('.css') && f !== 'Layout.css');
  cssFiles.sort((a, b) => fs.statSync(path.join(clientAstroDir, b)).mtimeMs - fs.statSync(path.join(clientAstroDir, a)).mtimeMs);
  activeLayoutCss = cssFiles[0];
}

if (activeLayoutCss && fs.existsSync(path.join(clientAstroDir, activeLayoutCss))) {
  const activePath = path.join(clientAstroDir, activeLayoutCss);
  
  // Canonical evergreen fixed point: all arbitrary historical hashes converge to Layout.css via edge middleware in O(1)
  const legacyAliases = [
    'Layout.css' // Canonical evergreen fixed point
  ];

  for (const alias of legacyAliases) {
    if (alias !== activeLayoutCss) {
      const aliasPath = path.join(clientAstroDir, alias);
      try {
        fs.copyFileSync(activePath, aliasPath);
        console.log(`[ensure-asset-aliases] Created compatibility alias: ${alias} -> ${activeLayoutCss}`);
      } catch (err) {
        console.warn(`[ensure-asset-aliases] Failed to alias ${alias}:`, err.message);
      }
    }
  }
} else {
  console.warn('[ensure-asset-aliases] No active Layout.*.css found in dist/client/_astro');
}

// 2. Ensure comprehensive Cloudflare CDN caching policies for all static assets
const headersFile = path.join(process.cwd(), 'dist/client/_headers');
let headersContent = fs.existsSync(headersFile) ? fs.readFileSync(headersFile, 'utf-8') : '';
const requiredRules = [
  { prefix: '/_astro/*', rule: '/_astro/*\n  Cache-Control: public, max-age=31536000, immutable' },
  { prefix: '/images/*', rule: '/images/*\n  Cache-Control: public, max-age=2592000, s-maxage=31536000, immutable' },
  { prefix: '/favicon.ico', rule: '/favicon.ico\n  Cache-Control: public, max-age=604800, s-maxage=2592000' },
  { prefix: '/favicon.svg', rule: '/favicon.svg\n  Cache-Control: public, max-age=604800, s-maxage=2592000' },
];

for (const { prefix, rule } of requiredRules) {
  if (!headersContent.includes(prefix)) {
    headersContent = (headersContent.trim() ? headersContent.trim() + '\n\n' : '') + rule;
  }
}
fs.writeFileSync(headersFile, headersContent.trim() + '\n');
console.log('[ensure-asset-aliases] Injected static asset caching rules into dist/client/_headers');

