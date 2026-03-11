#!/usr/bin/env node
/**
 * Build pipeline
 * - Reads extracted tool/wiki/token JSONL files from data/extracted
 * - Generates config/characters.json with id -> { [lang]: name }
 * - Merges rows by id (wiki fields take priority)
 * - Writes final character JSON files to data/characters/<type>/<id>.json
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..');
const EXTRACTED_DIR = path.join(DATA_DIR, 'extracted');
const CONFIG_PATH = path.join(DATA_DIR, 'config', 'characters.json');
const OUTPUT_DIR = path.join(DATA_DIR, 'characters');

const TOOL_GLOB_PREFIX = 'characters.tool.';
const WIKI_GLOB_PREFIX = 'characters.wiki.';

function normalizeId(name) {
  if (!name) return null;
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
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

function parseJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  return text
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function teamToType(team) {
  if (team === 'townsfolk') return 'townsfolk';
  if (team === 'outsider') return 'outsider';
  if (team === 'minion') return 'minion';
  if (team === 'demon') return 'demon';
  if (team === 'traveller') return 'traveller';
  if (team === 'fabled') return 'fabled';
  if (team === 'loric') return 'loric';
  return null;
}

function detectTypeFromId(id) {
  const DEMONS = new Set([
    'al_hadikhia', 'fang_gu', 'imp', 'kazali', 'legion', 'leviathan', 'lil_monsta', 'lleech',
    'lord_of_typhon', 'no_dashii', 'ojo', 'po', 'pukka', 'riot', 'shabaloth', 'vigormortis',
    'vortox', 'yaggababble', 'zombuul', 'ocha', 'hun_dun', 'taotie', 'qiongqi', 'taowu'
  ]);
  const MINIONS = new Set([
    'assassin', 'baron', 'boffin', 'boomdandy', 'cerenovus', 'devil_s_advocate', 'evil_twin',
    'fearmonger', 'goblin', 'godfather', 'harpy', 'marionette', 'mastermind', 'mezepheles',
    'organ_grinder', 'pit_hag', 'poisoner', 'psychopath', 'scarlet_woman', 'spy', 'summoner',
    'vizier', 'widow', 'witch', 'wizard', 'wraith', 'xaan'
  ]);
  const OUTSIDERS = new Set([
    'barber', 'butler', 'damsel', 'drunk', 'golem', 'goon', 'hatter', 'heretic', 'hermit',
    'klutz', 'lunatic', 'moonchild', 'mutant', 'ogre', 'plague_doctor', 'politician',
    'puzzlemaster', 'recluse', 'saint', 'snitch', 'sweetheart', 'tinker', 'zealot'
  ]);
  const TRAVELLERS = new Set([
    'apprentice', 'barista', 'beggar', 'bishop', 'bone_collector', 'bureaucrat', 'butcher',
    'cacklejack', 'deviant', 'gangster', 'gnome', 'gunslinger', 'harlot', 'judge', 'matron',
    'scapegoat', 'thief', 'voudon'
  ]);
  const FABLED = new Set([
    'angel', 'buddhist', 'deus_ex_fiasco', 'djinn', 'doomsayer', 'duchess', 'ferryman',
    'fibbin', 'fiddler', 'hell_s_librarian', 'revolutionary', 'sentinel', 'spirit_of_ivory',
    'toymaker'
  ]);

  if (DEMONS.has(id)) return 'demon';
  if (MINIONS.has(id)) return 'minion';
  if (OUTSIDERS.has(id)) return 'outsider';
  if (TRAVELLERS.has(id)) return 'traveller';
  if (FABLED.has(id)) return 'fabled';
  return 'townsfolk';
}

function localeFromFile(filename) {
  const base = path.basename(filename, '.jsonl');
  const parts = base.split('.');
  return parts[2] || null;
}

function toLangKey(locale) {
  if (locale === 'zh-hans') return 'zh-Hans';
  return locale;
}

function toConfigLangKey(locale) {
  if (locale === 'es-419') return 'es';
  if (locale === 'zh-hans') return 'zh-Hans';
  return locale;
}

function buildConfigFromTool(toolFiles, wikiFiles) {
  const byType = {
    townsfolk: {},
    outsider: {},
    minion: {},
    demon: {},
    traveller: {},
    fabled: {},
    loric: {}
  };

  for (const file of toolFiles) {
    const locale = toConfigLangKey(localeFromFile(file));
    const rows = parseJsonl(file);
    for (const row of rows) {
      const id = row.id;
      if (!id) continue;
      const type = teamToType(row.team) || detectTypeFromId(id);
      if (!byType[type][id]) byType[type][id] = {};

      if (locale === 'en') {
        if (row.name) byType[type][id].en = row.name;
      } else if (row.name) {
        byType[type][id][locale] = row.name;
      }
    }
  }

  for (const file of wikiFiles) {
    if (localeFromFile(file) !== 'cn') continue;
    const rows = parseJsonl(file);
    for (const row of rows) {
      const id = row.id;
      if (!id) continue;

      let targetType = null;
      for (const [type, chars] of Object.entries(byType)) {
        if (chars[id]) {
          targetType = type;
          break;
        }
      }
      if (!targetType) continue;

      if (row.name) {
        byType[targetType][id].cn = row.name;
      }
    }
  }

  for (const chars of Object.values(byType)) {
    for (const item of Object.values(chars)) {
      const zhHans = item['zh-Hans'];
      const cn = item.cn || zhHans;

      if (cn) {
        item.cn = cn;
      }
      if (zhHans && cn && zhHans !== cn) {
        item.zh = zhHans;
      }

      delete item['zh-Hans'];
    }
  }

  return { characters: byType };
}

function mergeInto(base, patch) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) continue;

    if (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof merged[key] === 'object' &&
      merged[key] !== null &&
      !Array.isArray(merged[key])
    ) {
      merged[key] = { ...merged[key], ...value };
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function buildCombinedCharacters(toolFiles, wikiFiles, tokenFile) {
  const combined = new Map();

  // 1) Tool rows first (source of truth of ID)
  for (const file of toolFiles) {
    const locale = toLangKey(localeFromFile(file));
    const rows = parseJsonl(file);

    for (const row of rows) {
      const id = row.id;
      if (!id) continue;

      const existing = combined.get(id) || {
        id,
        type: teamToType(row.team) || detectTypeFromId(id)
      };
      const patch = { source_url: row.source_url };

      if (!existing.name) existing.name = {};
      if (row.team && !existing.type) {
        existing.type = teamToType(row.team) || existing.type;
      }

      if (locale === 'en' && row.name) {
        existing.name.en = row.name;
      } else if (row.name) {
        existing.name[locale] = row.name;
      }

      if (row.ability) {
        existing.ability = existing.ability || {};
        existing.ability[locale] = row.ability;
      }
      if (row.flavor) {
        existing.flavor_text = existing.flavor_text || {};
        existing.flavor_text[locale] = row.flavor;
      }
      if (row.first_night) {
        existing.first_night = existing.first_night || {};
        existing.first_night[locale] = row.first_night;
      }
      if (row.other_nights) {
        existing.other_nights = existing.other_nights || {};
        existing.other_nights[locale] = row.other_nights;
      }

      combined.set(id, mergeInto(existing, patch));
    }
  }

  // 2) Wiki rows second (wiki takes priority)
  for (const file of wikiFiles) {
    const locale = toLangKey(localeFromFile(file));
    const rows = parseJsonl(file);

    // Build reverse lookup by localized wiki row name for matching when id is missing.
    const idByName = new Map();
    for (const [id, character] of combined.entries()) {
      const localizedName = character?.name?.[locale];
      if (localizedName) idByName.set(localizedName, id);
      if (locale !== 'en' && character?.name?.en) {
        idByName.set(character.name.en, id);
      }
    }

    for (const row of rows) {
      const id = row.id || idByName.get(row.name) || normalizeId(row.en_name || row.name);
      if (!id || !combined.has(id)) continue;

      const existing = combined.get(id);
      const patch = {};

      if (!existing.name) existing.name = {};
      if (locale === 'en') {
        if (row.name) existing.name.en = row.name;
      } else {
        if (row.name) existing.name[locale] = row.name;
        if (row.en_name && !existing.name.en) existing.name.en = row.en_name;
      }

      if (row.ability) {
        existing.ability = existing.ability || {};
        existing.ability[locale] = row.ability;
      }
      if (row.flavor) {
        existing.flavor_text = existing.flavor_text || {};
        existing.flavor_text[locale] = row.flavor;
      }
      if (row.first_night) {
        existing.first_night = existing.first_night || {};
        existing.first_night[locale] = row.first_night;
      }
      if (row.other_nights) {
        existing.other_nights = existing.other_nights || {};
        existing.other_nights[locale] = row.other_nights;
      }

      if (row.how_to_run) {
        existing.how_to_run = existing.how_to_run || {};
        existing.how_to_run[locale] = row.how_to_run;
      }
      if (row.examples) {
        existing.examples = existing.examples || {};
        existing.examples[locale] = row.examples;
      }
      if (row.tips) {
        existing.tips = existing.tips || {};
        existing.tips[locale] = row.tips;
      }

      if (row.type) patch.type = row.type;
      if (row.editions) patch.editions = row.editions;
      if (row.artist) patch.artist = row.artist;
      if (row.jinxes) patch.jinxes = row.jinxes;
      if (row.source_url) patch.source_url = row.source_url;
      if (row.url_param) patch.url_param = row.url_param;

      combined.set(id, mergeInto(existing, patch));
    }
  }

  // 3) Token rows
  for (const row of parseJsonl(tokenFile)) {
    if (!row.id || !combined.has(row.id)) continue;
    const existing = combined.get(row.id);
    existing.token_url = row.token_url;
    combined.set(row.id, existing);
  }

  return combined;
}

function writeCharacters(combined) {
  let count = 0;
  for (const char of combined.values()) {
    const type = char.type || detectTypeFromId(char.id);
    // Remove stale file from old type directory if it exists
    for (const t of ['townsfolk','outsider','minion','demon','traveller','fabled','loric']) {
      if (t === type) continue;
      const stale = path.join(OUTPUT_DIR, t, `${char.id}.json`);
      if (fs.existsSync(stale)) fs.unlinkSync(stale);
    }
    const outPath = path.join(OUTPUT_DIR, type, `${char.id}.json`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(compactObject(char), null, 2) + '\n', 'utf8');
    count += 1;
  }
  return count;
}

function main() {
  if (!fs.existsSync(EXTRACTED_DIR)) {
    throw new Error(`Missing extracted dir: ${EXTRACTED_DIR}`);
  }

  const files = fs.readdirSync(EXTRACTED_DIR)
    .filter(name => name.endsWith('.jsonl'))
    .map(name => path.join(EXTRACTED_DIR, name));

  const toolFiles = files.filter(f => path.basename(f).startsWith(TOOL_GLOB_PREFIX));
  const wikiFiles = files.filter(f => path.basename(f).startsWith(WIKI_GLOB_PREFIX));
  const tokenFile = path.join(EXTRACTED_DIR, 'characters.token.jsonl');

  if (toolFiles.length === 0) {
    throw new Error('No extracted tool JSONL files found. Run scrape:tool first.');
  }

  // b) generate config/characters.json from tool ids/names first
  const config = buildConfigFromTool(toolFiles, wikiFiles);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log(`✅ Wrote config mapping to ${CONFIG_PATH}`);

  // c) merge all jsonl (wiki takes priority)
  const combined = buildCombinedCharacters(toolFiles, wikiFiles, tokenFile);
  const count = writeCharacters(combined);

  console.log(`✅ Built ${count} character JSON files in ${OUTPUT_DIR}`);
}

main();
