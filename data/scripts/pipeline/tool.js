#!/usr/bin/env node
/**
 * Blood on the Clocktower Script Tool Pipeline
 * Scrapes localized role text and canonical night order from the official Script Tool bundle.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SCRIPT_TOOL_URL = 'https://script.bloodontheclocktower.com/';
const DATA_DIR = path.join(__dirname, '..', '..');
const EXTRACTED_DIR = path.join(DATA_DIR, 'extracted');
const OUTPUT_NIGHTORDER_FILE = path.join(DATA_DIR, 'nightorder.tool.json');

const SPECIAL_ITEMS = new Set(['dusk', 'minioninfo', 'demoninfo', 'dawn']);

function normalizeId(name) {
  if (!name) return null;
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function decodeJsSingleQuoted(raw) {
  return vm.runInNewContext(`'${raw}'`);
}

function parseJsonParseLiterals(jsText) {
  const results = [];
  const needle = "JSON.parse('";
  let cursor = 0;

  while (cursor < jsText.length) {
    const start = jsText.indexOf(needle, cursor);
    if (start === -1) break;

    let i = start + needle.length;
    let escaped = false;
    const chars = [];

    while (i < jsText.length) {
      const ch = jsText[i];
      if (escaped) {
        chars.push(ch);
        escaped = false;
      } else if (ch === '\\') {
        chars.push(ch);
        escaped = true;
      } else if (ch === "'" && jsText[i + 1] === ')') {
        break;
      } else {
        chars.push(ch);
      }
      i++;
    }

    const raw = chars.join('');
    cursor = i + 2;

    try {
      const decoded = decodeJsSingleQuoted(raw);
      const parsed = JSON.parse(decoded);
      results.push({ start, parsed });
    } catch (error) {
      // Ignore literals that are not valid JSON payloads.
    }
  }

  return results;
}

function buildVarJsonMap(jsText, jsonLiterals) {
  const map = new Map();
  const byStart = new Map(jsonLiterals.map(item => [item.start, item.parsed]));
  
  // Look for varName={}; ... varName=JSON.parse('
  const regex = /([A-Za-z0-9_$]+)=\{\};(?:.*?)?\1=JSON\.parse\('/g;
  let match;

  while ((match = regex.exec(jsText)) !== null) {
    const varName = match[1];
    // Find where JSON.parse(' actually starts to map back to jsonLiterals
    const needle = `${varName}=JSON.parse('`;
    const parseStart = jsText.indexOf(needle, match.index) + needle.length - "JSON.parse('".length;
    const parsed = byStart.get(parseStart);
    if (parsed !== undefined) {
      map.set(varName, parsed);
    }
  }

  return map;
}

function extractBundlePath(indexHtml) {
  const match = indexHtml.match(/<script[^>]*type=module[^>]*src=(?:"([^"]+workspace\.[^"]+\.js)"|'([^']+workspace\.[^']+\.js)'|([^\s>]+workspace\.[^\s>]+\.js))/i);
  if (!match) {
    throw new Error('Failed to locate Script Tool module bundle path.');
  }

  const source = match[1] || match[2] || match[3];
  return source.startsWith('http') ? source : new URL(source, SCRIPT_TOOL_URL).toString();
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} when fetching ${url}`);
  }
  return response.text();
}

function extractGameLocaleMapping(jsText) {
  const mapping = new Map();
  const regex = /f\(rW,"(game_[^"]+|script_[^"]+)",\(\)=>([A-Za-z0-9_$]+)\)/g;
  let match;

  while ((match = regex.exec(jsText)) !== null) {
    mapping.set(match[1], match[2]);
  }

  return mapping;
}

function findRolesDataset(varJsonMap, gameLocaleMap, localeKey) {
  const varName = gameLocaleMap.get(localeKey);
  if (!varName) return null;
  const data = varJsonMap.get(varName);
  if (!data || typeof data !== 'object') return null;
  if (!data.roles || typeof data.roles !== 'object') return null;
  return data;
}

function findCharacterListDataset(jsonLiterals) {
  return jsonLiterals.find(item => {
    const value = item.parsed;
    return Array.isArray(value) && value.length > 100 && value[0] && value[0].id && value[0].team;
  })?.parsed;
}

function findNightOrderDataset(jsonLiterals) {
  return jsonLiterals.find(item => {
    const value = item.parsed;
    return (
      value &&
      typeof value === 'object' &&
      Array.isArray(value.firstNight) &&
      Array.isArray(value.otherNight) &&
      value.firstNight.includes('dusk')
    );
  })?.parsed;
}

function toTeam(team) {
  if (!team) return 'unknown';
  if (team === 'outsider') return 'outsider';
  if (team === 'minion') return 'minion';
  if (team === 'demon') return 'demon';
  if (team === 'townsfolk') return 'townsfolk';
  if (team === 'traveller') return 'traveller';
  if (team === 'fabled') return 'fabled';
  if (team === 'loric') return 'loric';
  return team;
}

function buildIdLookup(characters) {
  const byToolId = new Map();
  const byEnglishName = new Map();

  for (const char of characters) {
    const normalizedFromName = normalizeId(char.name);
    if (normalizedFromName) {
      byEnglishName.set(normalizedFromName, normalizedFromName);
    }

    if (char.id) {
      const toolIdNormalized = normalizeId(char.id.replace(/'/g, '_'));
      if (toolIdNormalized && normalizedFromName) {
        byToolId.set(char.id, normalizedFromName);
      }
    }
  }

  return { byToolId, byEnglishName };
}

function mapToolIdToRepoId(toolId, idLookup) {
  if (!toolId) return null;

  const direct = idLookup.byToolId.get(toolId);
  if (direct) return direct;

  const normalized = normalizeId(toolId);
  if (!normalized) return null;

  if (idLookup.byEnglishName.has(normalized)) {
    return normalized;
  }

  return normalized;
}

function compactObject(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out;
}

function buildTranslatedJsonl(characters, rolesTarget, rolesEn, lang) {
  const lines = [];

  for (const char of characters) {
    const id = normalizeId(char.name) || normalizeId(char.id);
    if (!id) continue;

    const roleTarget = rolesTarget[id] || rolesTarget[char.id] || null;
    const roleEn = rolesEn[id] || rolesEn[char.id] || null;
    const translatedName = roleTarget?.name || null;

    if (lang === 'en') {
      lines.push(compactObject({
        id,
        team: toTeam(char.team),
        name: translatedName || roleEn?.name || char.name || null,
        ability: roleTarget?.ability || null,
        flavor: roleTarget?.flavor || null,
        first_night: roleTarget?.first || null,
        other_nights: roleTarget?.other || null,
        source: 'script_tool',
        source_url: SCRIPT_TOOL_URL
      }));
      continue;
    }

    lines.push(compactObject({
      id,
      team: toTeam(char.team),
      en_name: roleEn?.name || char.name || null,
      name: translatedName,
      ability: roleTarget?.ability || null,
      flavor: roleTarget?.flavor || null,
      first_night: roleTarget?.first || null,
      other_nights: roleTarget?.other || null,
      source: 'script_tool',
      source_url: SCRIPT_TOOL_URL
    }));
  }

  return lines;
}

function buildNightOrder(nightOrder, characters, idLookup) {
  const charById = new Map(characters.map(c => [c.id, c]));

  function mapEntry(entryId, number) {
    if (SPECIAL_ITEMS.has(entryId)) {
      return {
        number,
        id: entryId,
        kind: 'special'
      };
    }

    const char = charById.get(entryId);
    const repoId = mapToolIdToRepoId(entryId, idLookup);

    return {
      number,
      id: repoId,
      kind: 'character',
      team: toTeam(char?.team || 'unknown')
    };
  }

  return {
    source: 'script_tool',
    source_url: SCRIPT_TOOL_URL,
    special_items: Array.from(SPECIAL_ITEMS),
    first_night: nightOrder.firstNight.map((id, idx) => mapEntry(id, idx + 1)),
    other_nights: nightOrder.otherNight.map((id, idx) => mapEntry(id, idx + 1))
  };
}

function enrichSpecialLocalization(nightOrderOutput, localesData) {
  const special = {};

  for (const id of SPECIAL_ITEMS) {
    special[id] = {
      name: {},
      first_night_reminder: {},
      other_night_reminder: {}
    };

    for (const [lang, data] of Object.entries(localesData)) {
      const role = data?.roles?.[id];
      if (!role) continue;
      if (role.name) special[id].name[lang] = role.name;
      if (role.first) special[id].first_night_reminder[lang] = role.first;
      if (role.other) special[id].other_night_reminder[lang] = role.other;
    }
  }

  nightOrderOutput.special = special;
  return nightOrderOutput;
}

async function main() {
  fs.mkdirSync(EXTRACTED_DIR, { recursive: true });

  console.log('🌐 Fetching Script Tool index...');
  const indexHtml = await fetchText(SCRIPT_TOOL_URL);
  const bundleUrl = extractBundlePath(indexHtml);

  console.log(`📦 Fetching Script Tool bundle: ${bundleUrl}`);
  const bundleJs = await fetchText(bundleUrl);

  const jsonLiterals = parseJsonParseLiterals(bundleJs);
  const varJsonMap = buildVarJsonMap(bundleJs, jsonLiterals);
  const gameLocaleMap = extractGameLocaleMapping(bundleJs);

  const characters = findCharacterListDataset(jsonLiterals);
  const nightOrder = findNightOrderDataset(jsonLiterals);
  if (!characters || !nightOrder) {
    throw new Error('Failed to parse character list or night order from Script Tool bundle.');
  }

  const idLookup = buildIdLookup(characters);

  // Identify all languages that have a 'game_X' definition with roles
  const availableRoleLocales = Array.from(gameLocaleMap.keys())
    .filter(key => key.startsWith('game_') && findRolesDataset(varJsonMap, gameLocaleMap, key))
    .map(key => key.replace(/^game_/, '').replace(/_/g, '-'));

  console.log(`ℹ️ Available Script Tool role locales in bundle: ${availableRoleLocales.join(', ')}`);

  const localeEn = findRolesDataset(varJsonMap, gameLocaleMap, 'game_en');
  const localesData = {};
  
  if (localeEn) localesData['en'] = localeEn;

  // Process all languages found
  for (const langKey of availableRoleLocales) {
    const rawLang = langKey.replace(/-/g, '_'); // restore to sv, zh_Hans, es_419
    const localeKey = `game_${rawLang}`;
    const localeData = findRolesDataset(varJsonMap, gameLocaleMap, localeKey);
    
    if (localeData) {
      localesData[langKey] = localeData;
      
      // Write JSONL for all valid languages including 'en'
      const jsonlRows = buildTranslatedJsonl(characters, localeData.roles || {}, localeEn?.roles || {}, langKey);
      const outPath = path.join(EXTRACTED_DIR, `characters.tool.${langKey.toLowerCase()}.jsonl`);
      fs.writeFileSync(outPath, jsonlRows.map(row => JSON.stringify(row)).join('\n'), 'utf8');
      console.log(`✅ Wrote ${jsonlRows.length} ${langKey} rows to ${outPath}`);
    }
  }

  let nightOrderOutput = buildNightOrder(nightOrder, characters, idLookup);
  nightOrderOutput = enrichSpecialLocalization(nightOrderOutput, localesData);

  fs.writeFileSync(OUTPUT_NIGHTORDER_FILE, JSON.stringify(nightOrderOutput, null, 2) + '\n', 'utf8');

  console.log(`✅ Wrote full night order to ${OUTPUT_NIGHTORDER_FILE}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
