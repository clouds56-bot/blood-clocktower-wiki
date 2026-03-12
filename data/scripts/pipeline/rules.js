#!/usr/bin/env node
/**
 * Build per-page markdown files from extracted rules JSONL.
 * Each row becomes one markdown file, e.g. data/rules/en/setup.md
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..');
const EXTRACTED_DIR = path.join(DATA_DIR, 'extracted');
const RULES_DIR = path.join(DATA_DIR, 'rules');

const INPUTS = [
  { lang: 'en', file: path.join(EXTRACTED_DIR, 'rules.wiki.en.jsonl') },
  { lang: 'cn', file: path.join(EXTRACTED_DIR, 'rules.wiki.cn.jsonl') }
];

function parseJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function sanitizeFileName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function ensureTrailingNewline(text) {
  return text.endsWith('\n') ? text : `${text}\n`;
}

function main() {
  let written = 0;

  for (const input of INPUTS) {
    const rows = parseJsonl(input.file);
    const outDir = path.join(RULES_DIR, input.lang);
    fs.mkdirSync(outDir, { recursive: true });

    for (const row of rows) {
      if (!row || !row.id || typeof row.content !== 'string') {
        continue;
      }

      const fileName = sanitizeFileName(row.id || row.title || 'untitled');
      const outPath = path.join(outDir, `${fileName}.md`);
      fs.writeFileSync(outPath, ensureTrailingNewline(row.content), 'utf8');
      written += 1;
    }
  }

  console.log(`✅ Wrote ${written} markdown files to ${RULES_DIR}`);
}

if (require.main === module) {
  main();
}
