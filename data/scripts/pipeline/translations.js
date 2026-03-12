#!/usr/bin/env node
/**
 * Blood on the Clocktower Translations Pipeline
 * Fetches localized role strings from botc-translations with fallback.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..');
const EXTRACTED_DIR = path.join(DATA_DIR, 'extracted');
const RESULTS_DIR = path.join(DATA_DIR, 'results');
const NIGHT_ORDER_FILE = path.join(DATA_DIR, 'nightorder.tool.json');

const BOTC_TRANSLATIONS_BASE =
  'https://raw.githubusercontent.com/ThePandemoniumInstitute/botc-translations/main/game';
const BOTC_RELEASE_ROLES_URL =
  'https://raw.githubusercontent.com/ThePandemoniumInstitute/botc-release/main/resources/data/roles.json';

const SPECIAL_ITEMS = ['dusk', 'minioninfo', 'demoninfo', 'dawn'];

const LOCALES = [
  { source: 'en', outFileLocale: 'en', langKey: 'en' },
  { source: 'zh_Hans', outFileLocale: 'zh-hans', langKey: 'cn' },
  { source: 'es_419', outFileLocale: 'es-419', langKey: 'es' },
  { source: 'sv', outFileLocale: 'sv', langKey: 'sv' }
];

function normalizeId(value) {
  if (!value) return null;
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function compactId(value) {
  if (!value) return '';
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
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

function parseJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} when fetching ${url}`);
  }
  return response.json();
}

function buildCanonicalRoleMap(roles) {
  const byRepoId = new Map();
  const byCompact = new Map();

  for (const role of roles) {
    const repoId = normalizeId(role.name) || normalizeId(role.id);
    if (!repoId) continue;

    const entry = {
      id: repoId,
      team: toTeam(role.team),
      englishName: role.name || null
    };

    byRepoId.set(repoId, entry);

    const variants = [role.id, role.name, repoId];
    for (const variant of variants) {
      const key = compactId(variant);
      if (key && !byCompact.has(key)) {
        byCompact.set(key, entry);
      }
    }
  }

  return { byRepoId, byCompact };
}

function buildTranslationRoleMap(localeData, canonical) {
  const out = new Map();
  const roleEntries = Object.entries(localeData?.roles || {});

  for (const [roleId, payload] of roleEntries) {
    const entry = canonical.byCompact.get(compactId(roleId));
    if (!entry) continue;
    out.set(entry.id, payload || {});
  }

  return out;
}

function buildFallbackById(rows) {
  const out = new Map();
  for (const row of rows) {
    if (!row.id) continue;
    out.set(row.id, row);
  }
  return out;
}

function toRow(canonicalRole, localeRole, fallbackRow, locale, localeUrl) {
  if (locale.outFileLocale === 'en') {
    return compactObject({
      id: canonicalRole.id,
      team: canonicalRole.team,
      name: localeRole.name || fallbackRow?.name || canonicalRole.englishName || null,
      ability: localeRole.ability || fallbackRow?.ability || null,
      flavor: localeRole.flavor || fallbackRow?.flavor || null,
      first_night: localeRole.first || fallbackRow?.first_night || null,
      other_nights: localeRole.other || fallbackRow?.other_nights || null,
      source: 'botc_translations',
      source_url: localeUrl
    });
  }

  return compactObject({
    id: canonicalRole.id,
    team: canonicalRole.team,
    en_name: canonicalRole.englishName || fallbackRow?.en_name || null,
    name: localeRole.name || fallbackRow?.name || null,
    ability: localeRole.ability || fallbackRow?.ability || null,
    flavor: localeRole.flavor || fallbackRow?.flavor || null,
    first_night: localeRole.first || fallbackRow?.first_night || null,
    other_nights: localeRole.other || fallbackRow?.other_nights || null,
    source: 'botc_translations',
    source_url: localeUrl
  });
}

function buildCoverageReport(canonical, localeReports, localCharacterIds) {
  const canonicalIds = Array.from(canonical.byRepoId.keys());
  const canonicalCompact = new Set(canonicalIds.map(id => compactId(id)));

  const localOnly = localCharacterIds.filter(id => !canonicalCompact.has(compactId(id))).sort();

  return {
    generated_at: new Date().toISOString(),
    canonical_role_count: canonicalIds.length,
    local_character_count: localCharacterIds.length,
    local_only_character_count: localOnly.length,
    local_only_characters: localOnly,
    locale_reports: localeReports
  };
}

function readLocalCharacterIds() {
  const base = path.join(DATA_DIR, 'characters');
  if (!fs.existsSync(base)) return [];

  const ids = [];
  const dirs = fs.readdirSync(base, { withFileTypes: true }).filter(dirent => dirent.isDirectory());
  for (const dirent of dirs) {
    const dirPath = path.join(base, dirent.name);
    for (const file of fs.readdirSync(dirPath)) {
      if (!file.endsWith('.json')) continue;
      ids.push(file.replace(/\.json$/, ''));
    }
  }
  return ids;
}

function writeSpecialLocalization(localePayloadsByLang) {
  if (!fs.existsSync(NIGHT_ORDER_FILE)) {
    return;
  }

  const nightOrder = JSON.parse(fs.readFileSync(NIGHT_ORDER_FILE, 'utf8'));
  const special = {};

  for (const id of SPECIAL_ITEMS) {
    special[id] = {
      name: {},
      first_night_reminder: {},
      other_night_reminder: {}
    };

    for (const locale of LOCALES) {
      const payload = localePayloadsByLang[locale.source];
      const role = payload?.roles?.[id];
      if (!role) continue;
      if (role.name) special[id].name[locale.langKey] = role.name;
      if (role.first) special[id].first_night_reminder[locale.langKey] = role.first;
      if (role.other) special[id].other_night_reminder[locale.langKey] = role.other;
    }
  }

  nightOrder.special = special;
  fs.writeFileSync(NIGHT_ORDER_FILE, JSON.stringify(nightOrder, null, 2) + '\n', 'utf8');
}

async function main() {
  fs.mkdirSync(EXTRACTED_DIR, { recursive: true });
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const [canonicalRoles, ...localePayloads] = await Promise.all([
    fetchJson(BOTC_RELEASE_ROLES_URL),
    ...LOCALES.map(locale => fetchJson(`${BOTC_TRANSLATIONS_BASE}/${locale.source}.json`))
  ]);

  if (!Array.isArray(canonicalRoles)) {
    throw new Error('roles.json payload is not an array.');
  }

  const canonical = buildCanonicalRoleMap(canonicalRoles);
  const canonicalIds = Array.from(canonical.byRepoId.keys()).sort();

  const localePayloadsByLang = {};
  LOCALES.forEach((locale, idx) => {
    localePayloadsByLang[locale.source] = localePayloads[idx];
  });

  const localeReports = [];

  for (const locale of LOCALES) {
    const localeUrl = `${BOTC_TRANSLATIONS_BASE}/${locale.source}.json`;
    const outputFile = path.join(EXTRACTED_DIR, `characters.tool.${locale.outFileLocale}.jsonl`);
    const fallbackRows = buildFallbackById(parseJsonl(outputFile));

    const localePayload = localePayloadsByLang[locale.source] || {};
    const roleMap = buildTranslationRoleMap(localePayload, canonical);

    const rows = [];
    const missingName = [];
    const missingAbility = [];
    const missingFlavor = [];

    for (const id of canonicalIds) {
      const canonicalRole = canonical.byRepoId.get(id);
      const localeRole = roleMap.get(id) || {};
      const fallbackRow = fallbackRows.get(id) || null;

      if (!localeRole.name) missingName.push(id);
      if (!localeRole.ability) missingAbility.push(id);
      if (!localeRole.flavor) missingFlavor.push(id);

      rows.push(toRow(canonicalRole, localeRole, fallbackRow, locale, localeUrl));
    }

    fs.writeFileSync(outputFile, rows.map(row => JSON.stringify(row)).join('\n'), 'utf8');
    console.log(`✅ Wrote ${rows.length} ${locale.outFileLocale} rows to ${outputFile}`);

    localeReports.push({
      locale: locale.outFileLocale,
      source_locale: locale.source,
      role_count: rows.length,
      missing_name_count: missingName.length,
      missing_ability_count: missingAbility.length,
      missing_flavor_count: missingFlavor.length,
      missing_name_sample: missingName.slice(0, 25),
      missing_ability_sample: missingAbility.slice(0, 25),
      missing_flavor_sample: missingFlavor.slice(0, 25)
    });
  }

  writeSpecialLocalization(localePayloadsByLang);

  const coverage = buildCoverageReport(canonical, localeReports, readLocalCharacterIds());
  const coverageFile = path.join(RESULTS_DIR, 'translations-coverage.json');
  fs.writeFileSync(coverageFile, JSON.stringify(coverage, null, 2) + '\n', 'utf8');
  console.log(`✅ Wrote translation coverage report to ${coverageFile}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
