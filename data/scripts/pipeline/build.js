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
    characters.set(id, {
      ...en,
      id,
      name: { en: en.english_name } // Start name object
    });
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
        ability: { cn: cn.ability },
        source_url: `https://clocktower-wiki.gstonegames.com/index.php?title=${cn.urlParam}`
      };
      characters.set(id, char);
    } else {
      // Merge Chinese data
      char.name.cn = cn.chinese_name;
      if (!char.ability) char.ability = {};
      char.ability.cn = cn.ability;
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
