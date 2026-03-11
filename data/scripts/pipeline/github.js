#!/usr/bin/env node
/**
 * Blood on the Clocktower GitHub Roles Pipeline
 * Fetches canonical role data from botc-release and writes English JSONL.
 */

const fs = require('fs');
const path = require('path');

const SOURCE_URL =
  'https://raw.githubusercontent.com/ThePandemoniumInstitute/botc-release/main/resources/data/roles.json';
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'extracted');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'characters.github.en.jsonl');

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

async function fetchRoles() {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} when fetching ${SOURCE_URL}`);
  }
  return response.json();
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const roles = await fetchRoles();
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
}

if (require.main === module) {
  main().catch(error => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
