#!/usr/bin/env node
/**
 * Blood on the Clocktower GitHub Roles Pipeline
 * Fetches canonical role data and night order from botc-release.
 */

const fs = require('fs');
const path = require('path');

const SOURCE_URL =
  'https://raw.githubusercontent.com/ThePandemoniumInstitute/botc-release/main/resources/data/roles.json';
const NIGHT_SHEET_URL =
  'https://raw.githubusercontent.com/ThePandemoniumInstitute/botc-release/main/resources/data/nightsheet.json';
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'extracted');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'characters.github.en.jsonl');
const NIGHT_ORDER_OUTPUT_FILE = path.join(__dirname, '..', '..', 'nightorder.tool.json');

const SPECIAL_ITEMS = new Set(['dusk', 'minioninfo', 'demoninfo', 'dawn']);

function normalizeId(value) {
  if (!value) return null;
  return value
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
    out[key] = value;
  }
  return out;
}

function toRepoId(role) {
  const fromName = normalizeId(role.name);
  if (fromName) return fromName;
  return normalizeId(role.id);
}

function compactId(value) {
  if (!value) return '';
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
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

function buildRoleLookups(roles) {
  const repoIdByCompact = new Map();
  const teamByRepoId = new Map();

  for (const role of roles) {
    const repoId = toRepoId(role);
    if (!repoId) continue;

    teamByRepoId.set(repoId, toTeam(role.team));

    const roleIdCompact = compactId(role.id);
    const roleNameCompact = compactId(role.name);
    const repoIdCompact = compactId(repoId);

    if (roleIdCompact && !repoIdByCompact.has(roleIdCompact)) {
      repoIdByCompact.set(roleIdCompact, repoId);
    }
    if (roleNameCompact && !repoIdByCompact.has(roleNameCompact)) {
      repoIdByCompact.set(roleNameCompact, repoId);
    }
    if (repoIdCompact && !repoIdByCompact.has(repoIdCompact)) {
      repoIdByCompact.set(repoIdCompact, repoId);
    }
  }

  return { repoIdByCompact, teamByRepoId };
}

async function fetchRoles() {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} when fetching ${SOURCE_URL}`);
  }
  return response.json();
}

async function fetchNightSheet() {
  const response = await fetch(NIGHT_SHEET_URL);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} when fetching ${NIGHT_SHEET_URL}`);
  }
  return response.json();
}

function toNightOrderEntry(entryId, number, lookups) {
  if (SPECIAL_ITEMS.has(entryId)) {
    return {
      number,
      id: entryId,
      kind: 'special'
    };
  }

  const repoId = lookups.repoIdByCompact.get(compactId(entryId)) || normalizeId(entryId);

  return {
    number,
    id: repoId,
    kind: 'character',
    team: lookups.teamByRepoId.get(repoId) || 'unknown'
  };
}

function buildNightOrder(nightSheet, lookups) {
  if (!nightSheet || !Array.isArray(nightSheet.firstNight) || !Array.isArray(nightSheet.otherNight)) {
    throw new Error('nightsheet.json payload is not in expected format.');
  }

  return {
    source: 'github_botc_release',
    source_url: {
      roles: SOURCE_URL,
      nightsheet: NIGHT_SHEET_URL
    },
    special_items: Array.from(SPECIAL_ITEMS),
    first_night: nightSheet.firstNight.map((id, idx) => toNightOrderEntry(id, idx + 1, lookups)),
    other_nights: nightSheet.otherNight.map((id, idx) => toNightOrderEntry(id, idx + 1, lookups))
  };
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const [roles, nightSheet] = await Promise.all([fetchRoles(), fetchNightSheet()]);
  if (!Array.isArray(roles)) {
    throw new Error('roles.json payload is not an array.');
  }

  const rows = [];
  for (const role of roles) {
    const id = toRepoId(role);
    if (!id) continue;

    rows.push(
      compactObject({
        id,
        team: role.team || null,
        name: role.name || null,
        ability: role.ability || null,
        flavor: role.flavor || null,
        first_night: role.firstNightReminder || null,
        other_nights: role.otherNightReminder || null,
        tokens: Array.isArray(role.reminders) ? role.reminders : null,
        source: 'github_botc_release',
        source_url: SOURCE_URL
      })
    );
  }

  fs.writeFileSync(OUTPUT_FILE, rows.map(row => JSON.stringify(row)).join('\n'), 'utf8');
  console.log(`✅ Wrote ${rows.length} rows to ${OUTPUT_FILE}`);

  const lookups = buildRoleLookups(roles);
  const nightOrder = buildNightOrder(nightSheet, lookups);
  fs.writeFileSync(NIGHT_ORDER_OUTPUT_FILE, JSON.stringify(nightOrder, null, 2) + '\n', 'utf8');
  console.log(`✅ Wrote night order to ${NIGHT_ORDER_OUTPUT_FILE}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
