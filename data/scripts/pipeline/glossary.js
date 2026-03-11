#!/usr/bin/env node
/**
 * Build glossary.json from extracted EN/CN glossary rows.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..');
const EXTRACTED_DIR = path.join(DATA_DIR, 'extracted');
const OUTPUT_FILE = path.join(DATA_DIR, 'rules', 'glossary.json');

const EN_FILE = path.join(EXTRACTED_DIR, 'glossary.wiki.en.jsonl');
const CN_FILE = path.join(EXTRACTED_DIR, 'glossary.wiki.cn.jsonl');

function parseJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function normalizeName(name) {
  if (!name) return '';
  return name.trim().toLowerCase();
}

function parseTranslationFile(filePath) {
  if (!fs.existsSync(filePath)) return [];

  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const pairs = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const left = line.slice(0, eqIndex).trim();
    const right = line.slice(eqIndex + 1).trim();

    const enTerms = [...left.matchAll(/"([^"]+)"/g)].map(match => match[1].trim());
    const cnTerms = [...right.matchAll(/"([^"]+)"/g)].map(match => match[1].trim());

    if (enTerms.length === 0 || cnTerms.length === 0) continue;
    pairs.push({ enTerms, cnTerms });
  }

  return pairs;
}

function compactObject(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

function buildGlossary() {
  const enRows = parseJsonl(EN_FILE);
  const cnRows = parseJsonl(CN_FILE);
  const translationPath = path.join(DATA_DIR, 'glossary', 'glossary.translation.cn.txt');
  const translationPairs = parseTranslationFile(translationPath);

  const cnByName = new Map();
  for (const row of cnRows) {
    cnByName.set(normalizeName(row.name), row);
  }

  const cnByEnName = new Map();
  for (const pair of translationPairs) {
    let targetCn = null;

    for (const cnTerm of pair.cnTerms) {
      const exact = cnByName.get(normalizeName(cnTerm));
      if (exact) {
        targetCn = exact.name;
        break;
      }
    }

    if (!targetCn) {
      for (const row of cnRows) {
        if (pair.cnTerms.some(cnTerm => row.name.startsWith(cnTerm))) {
          targetCn = row.name;
          break;
        }
      }
    }

    if (!targetCn) continue;

    for (const enName of pair.enTerms) {
      cnByEnName.set(normalizeName(enName), targetCn);
    }
  }

  const combined = enRows.map(en => {
    const normalizedEnName = normalizeName(en.name);
    let mappedCnName = cnByEnName.get(normalizedEnName);

    if (!mappedCnName) {
      for (const [enKey, cnName] of cnByEnName.entries()) {
        if (normalizedEnName.includes(enKey)) {
          mappedCnName = cnName;
          break;
        }
      }
    }

    const cn = mappedCnName ? cnByName.get(normalizeName(mappedCnName)) : null;

    return compactObject({
      id: normalizeName(en.name).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      name: {
        en: en.name,
        ...(cn?.name ? { cn: cn.name } : {})
      },
      description: {
        en: en.description,
        ...(cn?.description ? { cn: cn.description } : {})
      },
      source_url: {
        en: 'https://wiki.bloodontheclocktower.com/Glossary',
        cn: 'https://clocktower-wiki.gstonegames.com/index.php?title=%E6%9C%AF%E8%AF%AD%E6%B1%87%E6%80%BB'
      },
      detail_url: {
        en: en.detail_url || null,
        cn: cn?.detail_url || null
      }
    });
  });

  return {
    title: {
      en: 'Glossary',
      cn: '术语汇总'
    },
    source: 'wiki',
    generated_at: new Date().toISOString(),
    terms: combined
  };
}

function main() {
  const glossary = buildGlossary();
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(glossary, null, 2) + '\n', 'utf8');
  console.log(`✅ Wrote ${glossary.terms.length} glossary terms to ${OUTPUT_FILE}`);
}

if (require.main === module) {
  main();
}
