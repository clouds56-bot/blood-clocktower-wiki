#!/usr/bin/env node
/**
 * Scrape English rules pages as raw wiki content.
 * Output JSONL rows in the format: { id, title, content }
 */

const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://wiki.bloodontheclocktower.com/index.php';
const CACHE_DIR = path.join(__dirname, '..', '.cache', 'raw-rules-en');
const OUTPUT_DIR = path.join(__dirname, '..', 'extracted');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'rules.wiki.en.jsonl');

const PAGES = [
  { id: 'setup', title: 'Setup' },
  { id: 'rules_explanation', title: 'Rules_Explanation' },
  { id: 'storyteller_advice', title: 'Storyteller_Advice' },
  { id: 'abilities', title: 'Abilities' },
  { id: 'states', title: 'States' },
  { id: 'teensyville', title: 'Teensyville' },
  { id: 'script_tool', title: 'Script_Tool' },
  { id: 'player_strategy', title: 'Player_Strategy' }
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
