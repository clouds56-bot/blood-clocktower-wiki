#!/usr/bin/env node
/**
 * Blood on the Clocktower Special Character Generator
 * Generates virtual characters for special night-order entries.
 */

const fs = require('fs');
const path = require('path');

const NIGHT_ORDER_FILE = path.join(__dirname, '..', '..', 'nightorder.tool.json');
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'characters', 'special');
const SPECIAL_IDS = ['dusk', 'minioninfo', 'demoninfo', 'dawn'];

function titleCase(text) {
  return text
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function buildSpecialCharacter(id, specialData) {
  const names = specialData?.name || {};
  const firstNightReminder = specialData?.first_night_reminder || {};
  const otherNightReminder = specialData?.other_night_reminder || {};

  const fallbackName = titleCase(id);
  if (!names.en) {
    names.en = fallbackName;
  }

  const output = {
    id,
    type: 'special',
    editions: ['special'],
    virtual: true,
    name: names,
    source: 'script_tool',
    source_url: 'https://script.bloodontheclocktower.com/'
  };

  if (Object.keys(firstNightReminder).length > 0 || Object.keys(otherNightReminder).length > 0) {
    output.night_reminder = {
      first_night: firstNightReminder,
      other_nights: otherNightReminder
    };
  }

  return output;
}

function main() {
  if (!fs.existsSync(NIGHT_ORDER_FILE)) {
    console.error('Error: nightorder.tool.json not found. Run pipeline/tool.js first.');
    process.exit(1);
  }

  const nightOrder = JSON.parse(fs.readFileSync(NIGHT_ORDER_FILE, 'utf8'));
  const specialMap = nightOrder.special || {};

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let count = 0;
  for (const id of SPECIAL_IDS) {
    const specialData = specialMap[id] || {};
    const character = buildSpecialCharacter(id, specialData);
    const outputFile = path.join(OUTPUT_DIR, `${id}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(character, null, 2) + '\n', 'utf8');
    count++;
  }

  console.log(`✅ Wrote ${count} special characters to ${OUTPUT_DIR}`);
}

if (require.main === module) {
  main();
}
