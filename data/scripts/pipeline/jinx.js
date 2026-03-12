#!/usr/bin/env node
/**
 * Blood on the Clocktower Jinx Translations Pipeline
 * Fetches jinx translations from botc-translations across multiple locales.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..');
const EXTRACTED_DIR = path.join(DATA_DIR, 'extracted');
const CACHE_DIR = path.join(DATA_DIR, '.cache', 'json');
const OUTPUT_FILE = path.join(EXTRACTED_DIR, 'jinxes.tool.json');

const BOTC_TRANSLATIONS_BASE =
  'https://raw.githubusercontent.com/ThePandemoniumInstitute/botc-translations/main/game';

const LOCALES = [
  { source: 'en', langKey: 'en' },
  { source: 'zh_Hans', langKey: 'cn' },
  { source: 'es_419', langKey: 'es' },
  { source: 'sv', langKey: 'sv' }
];

function normalizeId(value) {
  if (!value) return null;
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function compactObject(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) continue;
    out[key] = value;
  }
  return out;
}

async function fetchLocaleJson(locale) {
  const cacheFile = path.join(CACHE_DIR, `jinx.${locale.source}.json`);
  if (fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  }

  const url = `${BOTC_TRANSLATIONS_BASE}/${locale.source}.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} when fetching ${url}`);
  }

  const payload = await response.json();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return payload;
}

function normalizeJinxKey(rawKey) {
  const [leftRaw, rightRaw] = String(rawKey).split('-');
  if (!leftRaw || !rightRaw) return null;
  const left = normalizeId(leftRaw);
  const right = normalizeId(rightRaw);
  if (!left || !right) return null;
  return `${left}-${right}`;
}

async function main() {
  fs.mkdirSync(EXTRACTED_DIR, { recursive: true });

  const payloads = await Promise.all(LOCALES.map(fetchLocaleJson));

  const byPair = {};
  for (let i = 0; i < LOCALES.length; i += 1) {
    const locale = LOCALES[i];
    const payload = payloads[i] || {};
    const jinxes = payload.jinxes || {};

    for (const [rawPair, reason] of Object.entries(jinxes)) {
      const pair = normalizeJinxKey(rawPair);
      if (!pair || !reason) continue;

      if (!byPair[pair]) byPair[pair] = {};
      byPair[pair][locale.langKey] = reason;
    }
  }

  const compactPairs = {};
  for (const [pair, localized] of Object.entries(byPair)) {
    compactPairs[pair] = compactObject(localized);
  }

  const output = {
    source: 'botc_translations',
    source_base_url: BOTC_TRANSLATIONS_BASE,
    generated_at: new Date().toISOString(),
    locales: LOCALES.map(locale => locale.langKey),
    jinxes: compactPairs
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(`✅ Wrote ${Object.keys(compactPairs).length} jinx translations to ${OUTPUT_FILE}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
