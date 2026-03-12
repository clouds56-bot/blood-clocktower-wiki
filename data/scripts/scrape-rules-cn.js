#!/usr/bin/env node
/**
 * Scrape Chinese rules pages as raw wiki content.
 * Output JSONL rows in the format: { id, title, content }
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://clocktower-wiki.gstonegames.com/index.php';
const CACHE_DIR = path.join(__dirname, '..', '.cache', 'raw-rules-cn');
const OUTPUT_DIR = path.join(__dirname, '..', 'extracted');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'rules.wiki.cn.jsonl');

const PAGES = [
  { id: 'setup', title: '规则概要' },
  { id: 'rules_explanation', title: '规则解释' },
  { id: 'storyteller_advice', title: '给说书人的建议' },
  { id: 'important_details', title: '重要细节' },
  { id: 'jinx_rules', title: '相克规则' }
];

function buildRawUrl(title) {
  const params = new URLSearchParams({ title, action: 'raw' });
  return `${BASE_URL}?${params.toString()}`;
}

async function fetchWithCache(title) {
  const cacheFile = path.join(CACHE_DIR, `${encodeURIComponent(title)}.txt`);

  if (fs.existsSync(cacheFile)) {
    return fs.readFileSync(cacheFile, 'utf8');
  }

  const url = buildRawUrl(title);
  console.log(`  download ${title}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${title}: ${response.status}`);
  }

  const text = await response.text();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, text, 'utf8');
  return text;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const rows = [];
  for (const page of PAGES) {
    console.log(`→ ${page.title}`);
    const content = await fetchWithCache(page.title);
    rows.push({
      id: page.id,
      title: page.title,
      content
    });
  }

  fs.writeFileSync(OUTPUT_FILE, rows.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  console.log(`\n✅ Wrote ${rows.length} rows to ${OUTPUT_FILE}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  });
}
