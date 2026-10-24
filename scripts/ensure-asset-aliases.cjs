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
  
  // Historical hashes to keep physically alive for stale browser tabs
  const legacyAliases = [
    'Layout.wz5V2tVq.css',
    'Layout.2XgfxuuA.css',
    'Layout.MXg1_XRl.css',
    'Layout.BLn9bAsC.css',
    'Layout.css' // Canonical evergreen alias
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

  // Update manifest for reference
  const activeAssetJsonPath = path.join(process.cwd(), 'src/utils/active-asset.json');
  try {
    fs.writeFileSync(activeAssetJsonPath, JSON.stringify({
      activeLayoutCss: `/_astro/${activeLayoutCss}`,
      canonicalLayoutCss: '/_astro/Layout.css',
      generatedAt: new Date().toISOString()
    }, null, 2));
    console.log(`[ensure-asset-aliases] Updated src/utils/active-asset.json -> /_astro/${activeLayoutCss}`);
  } catch (err) {
    console.warn(`[ensure-asset-aliases] Failed to write active-asset.json:`, err.message);
  }
} else {
  console.warn('[ensure-asset-aliases] No active Layout.*.css found in dist/client/_astro');
}
