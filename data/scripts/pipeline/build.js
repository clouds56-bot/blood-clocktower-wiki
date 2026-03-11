#!/usr/bin/env node
/**
 * Blood on the Clocktower Wiki Scraper (Build Pipeline)
 * Joins English, Chinese, and Token data and outputs standard JSON files.
 */

const fs = require('fs');
const path = require('path');

const EN_FILE = path.join(__dirname, '..', '..', 'characters.wiki.en.jsonl');
const CN_FILE = path.join(__dirname, '..', '..', 'characters.wiki.cn.jsonl');
const TOKEN_FILE = path.join(__dirname, '..', '..', 'characters.token.jsonl');
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'characters');

function normalizeId(name) {
  if (!name) return null;
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function parseJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function main() {
  const enData = parseJsonl(EN_FILE);
  const cnData = parseJsonl(CN_FILE);
  const tokenData = parseJsonl(TOKEN_FILE);

  const characters = new Map();

  // 1. Process English data
  for (const en of enData) {
    const id = normalizeId(en.english_name) || en.id;
    
    const char = {
      id,
      name: { en: en.english_name },
      type: en.type,
      editions: en.editions,
      first_night: en.first_night,
      other_nights: en.other_nights,
      artist: en.artist,
      jinxes: en.jinxes,
      source_url: en.source_url
    };

    if (en.ability) char.ability = { en: en.ability };
    if (en.flavor_text) char.flavor_text = { en: en.flavor_text };
    if (en.examples) char.examples = { en: en.examples };
    if (en.tips) char.tips = { en: en.tips };
    if (en.how_to_run) char.how_to_run = { en: en.how_to_run };

    characters.set(id, char);
  }

  // 2. Process Chinese data
  for (const cn of cnData) {
    const cnEngName = cn.english_name || 'UNKNOWN';
    // special handling: trim spaces or quotes in english_name from Chinese wiki
    const id = normalizeId(cnEngName.replace(/^"|"$/g, '').trim());
    
    if (!id) continue;

    let char = characters.get(id);
    
    if (!char) {
      // It's a Chinese-exclusive character or name mismatch
      char = {
        id,
        name: { en: cnEngName, cn: cn.chinese_name },
        type: 'experimental', // fallback
        editions: ['experimental'],
        source_url: `https://clocktower-wiki.gstonegames.com/index.php?title=${cn.urlParam}`
      };
      characters.set(id, char);
    } else {
      // Merge Chinese data
      char.name.cn = cn.chinese_name;
    }
    
    if (cn.ability) {
      if (!char.ability) char.ability = {};
      char.ability.cn = cn.ability;
    }
    if (cn.flavor_text) {
      if (!char.flavor_text) char.flavor_text = {};
      char.flavor_text.cn = cn.flavor_text;
    }
    if (cn.examples) {
      if (!char.examples) char.examples = {};
      char.examples.cn = cn.examples;
    }
    if (cn.tips) {
      if (!char.tips) char.tips = {};
      char.tips.cn = cn.tips;
    }
    if (cn.how_to_run) {
      if (!char.how_to_run) char.how_to_run = {};
      char.how_to_run.cn = cn.how_to_run;
    }
  }

  // 3. Process Tokens
  for (const t of tokenData) {
    const id = normalizeId(t.english_name) || t.id;
    if (id && characters.has(id)) {
      characters.get(id).token_url = t.token_url;
    }
  }

  // 4. Output the files
  let count = 0;
  for (const char of characters.values()) {
    const typeDir = char.type || 'unknown';
    const outPath = path.join(OUTPUT_DIR, typeDir, `${char.id}.json`);
    
    // Clean up temporary internal fields if needed
    delete char.english_name; // We use name.en instead

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(char, null, 2), 'utf8');
    count++;
  }

  console.log(`\n✅ Built ${count} character JSON files in ${OUTPUT_DIR}`);
}

main();
