#!/usr/bin/env node
/**
 * Copy data/assets into wiki/public so Astro will include token images
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const SRC_ASSETS = path.join(REPO_ROOT, 'assets');
const DEST_PUBLIC = path.join(REPO_ROOT, '..', 'wiki', 'public', 'data', 'assets');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

try {
  console.log('→ Copying data/assets → wiki/public/data/assets');
  if (!fs.existsSync(SRC_ASSETS)) {
    console.warn(`Source assets not found: ${SRC_ASSETS}`);
    process.exit(0);
  }
  copyDir(SRC_ASSETS, DEST_PUBLIC);
  console.log('✅ Assets copied to', DEST_PUBLIC);
} catch (err) {
  console.error('❌ Failed to copy assets:', err.message);
  process.exit(1);
}
