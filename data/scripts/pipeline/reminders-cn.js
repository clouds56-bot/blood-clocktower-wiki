#!/usr/bin/env node
/**
 * Blood on the Clocktower Wiki Scraper (Chinese Reminder Tokens Pipeline)
 * Extracts reminder token metadata from cached Chinese character pages.
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const CACHE_DIR = path.join(__dirname, '..', '..', '.cache', 'html-cn');
const CONFIG_FILE = path.join(__dirname, '..', '..', 'config', 'characters.json');
const CN_CHARACTER_FILE = path.join(__dirname, '..', '..', 'extracted', 'characters.wiki.cn.jsonl');
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'extracted');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'reminders.wiki.cn.jsonl');

function cleanText(text) {
  return (text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function compactObject(obj) {
  const compact = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === 'string' && value.trim() === '') {
      continue;
    }
    compact[key] = value;
  }
  return compact;
}

function appendFieldValue(currentValue, nextValue) {
  const value = cleanText(nextValue);
  if (!value) {
    return currentValue;
  }
  if (!currentValue) {
    return value;
  }
  return `${currentValue}\n${value}`;
}

function parseTokenName(rawText) {
  const text = cleanText(rawText);
  const match = text.match(/^(.*?)[（(]([^）)]+)[）)]$/);
  if (!match) {
    return { name: text, comment: null };
  }

  return {
    name: cleanText(match[1]),
    comment: cleanText(match[2]) || null
  };
}

function looksLikeTokenName(text) {
  const value = cleanText(text);
  if (!value || value === '无') {
    return false;
  }

  if (value.includes('：')) {
    return false;
  }

  if (/^[（(].*[）)]$/.test(value)) {
    return false;
  }

  if (/[。！？]/.test(value) || value.includes('，')) {
    return false;
  }

  if (value.length > 40) {
    return false;
  }

  return true;
}

function isPreludeLine(text, meta) {
  const value = cleanText(text);
  const characterName = cleanText(meta.characterName);
  if (!value || !characterName) {
    return false;
  }
  return value === characterName;
}

function loadCharacterMap() {
  const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  const nameToId = new Map();

  for (const [type, chars] of Object.entries(raw.characters || {})) {
    for (const [id, item] of Object.entries(chars || {})) {
      const zhHans = cleanText(item['zh-Hans']);
      const cn = cleanText(item.cn);

      if (zhHans) {
        nameToId.set(zhHans, { id, type });
      }
      if (cn) {
        nameToId.set(cn, { id, type });
      }
    }
  }

  if (fs.existsSync(CN_CHARACTER_FILE)) {
    const rows = fs.readFileSync(CN_CHARACTER_FILE, 'utf8').split('\n').filter(Boolean);
    for (const row of rows) {
      try {
        const item = JSON.parse(row);
        const name = cleanText(item.name);
        const id = cleanText(item.id);
        if (name && id && !nameToId.has(name)) {
          nameToId.set(name, { id, type: null });
        }
      } catch (error) {
        // Ignore malformed lines.
      }
    }
  }

  return nameToId;
}

function parseTokenSection($, section, meta) {
  const tokens = [];
  let current = null;
  let currentField = null;

  const finalizeCurrent = () => {
    if (!current || !current.name) {
      return;
    }
    tokens.push(compactObject(current));
    current = null;
    currentField = null;
  };

  const startToken = tokenName => {
    finalizeCurrent();
    const parsed = parseTokenName(tokenName);
    if (!parsed.name) {
      return;
    }

    current = {
      character_id: meta.characterId,
      character_type: meta.characterType,
      character_name_cn: meta.characterName,
      name: parsed.name,
      comment: parsed.comment,
      placement_timing: null,
      placement_conditions: null,
      removal_timing: null
    };
    currentField = null;
  };

  const parseParagraph = text => {
    if (!current) {
      return;
    }

    const timingPrefix = '放置时机：';
    const conditionPrefix = '放置条件：';
    const removalPrefix = '移除时机：';
    const removalConditionPrefix = '移除条件：';

    if (text.startsWith(timingPrefix)) {
      current.placement_timing = appendFieldValue(
        current.placement_timing,
        text.slice(timingPrefix.length)
      );
      currentField = 'placement_timing';
      return;
    }
    if (text.startsWith(conditionPrefix)) {
      current.placement_conditions = appendFieldValue(
        current.placement_conditions,
        text.slice(conditionPrefix.length)
      );
      currentField = 'placement_conditions';
      return;
    }
    if (text.startsWith(removalPrefix)) {
      current.removal_timing = appendFieldValue(
        current.removal_timing,
        text.slice(removalPrefix.length)
      );
      currentField = 'removal_timing';
      return;
    }

    if (text.startsWith(removalConditionPrefix)) {
      current.removal_timing = appendFieldValue(
        current.removal_timing,
        text.slice(removalConditionPrefix.length)
      );
      currentField = 'removal_timing';
      return;
    }

    if (currentField === 'placement_timing') {
      current.placement_timing = appendFieldValue(current.placement_timing, text);
      return;
    }

    if (currentField === 'placement_conditions') {
      current.placement_conditions = appendFieldValue(current.placement_conditions, text);
      return;
    }

    if (currentField === 'removal_timing') {
      current.removal_timing = appendFieldValue(current.removal_timing, text);
      return;
    }

    current.placement_conditions = appendFieldValue(current.placement_conditions, text);
    currentField = 'placement_conditions';
  };

  section.each(function handleElement() {
    const el = $(this);
    const tagName = (el[0] && el[0].tagName) || '';

    if (tagName === 'ul') {
      const names = el
        .find('li')
        .map((_, li) => cleanText($(li).text()))
        .get()
        .filter(Boolean);

      for (const name of names) {
        startToken(name);
      }
      return;
    }

    if (tagName !== 'p') {
      return;
    }

    const text = cleanText(el.text());
    if (!text || text === '无') {
      return;
    }

    if (isPreludeLine(text, meta)) {
      return;
    }

    const isFieldText =
      text.startsWith('放置时机：') ||
      text.startsWith('放置条件：') ||
      text.startsWith('移除时机：') ||
      text.startsWith('移除条件：');

    if (isFieldText) {
      parseParagraph(text);
      return;
    }

    if (looksLikeTokenName(text)) {
      startToken(text);
      return;
    }

    parseParagraph(text);
    if (!current) {
      currentField = null;
    }
  });

  finalizeCurrent();
  return tokens;
}

function extractTokensFromFile(filePath, nameToIdMap) {
  const html = fs.readFileSync(filePath, 'utf8');
  const $ = cheerio.load(html);

  const h1Name = cleanText($('h1').first().text());
  const fileBaseName = path.basename(filePath, '.html');
  const decodedFileName = cleanText(decodeURIComponent(fileBaseName));
  const characterName = h1Name || decodedFileName;

  const characterInfo =
    nameToIdMap.get(characterName) ||
    nameToIdMap.get(characterName.replace(/\s+/g, '')) ||
    null;

  const reminderHeader = $('h2:contains("提示标记")').first();
  if (!reminderHeader.length) {
    return [];
  }

  const section = reminderHeader.nextUntil('h2');
  if (!section.length) {
    return [];
  }

  const sectionText = cleanText(section.text());
  if (!sectionText || sectionText === '无') {
    return [];
  }

  return parseTokenSection($, section, {
    characterId: characterInfo ? characterInfo.id : null,
    characterType: characterInfo ? characterInfo.type : null,
    characterName
  });
}

function main() {
  const nameToIdMap = loadCharacterMap();

  const files = fs
    .readdirSync(CACHE_DIR)
    .filter(name => name.endsWith('.html'))
    .map(name => path.join(CACHE_DIR, name));

  const allTokens = [];
  for (const filePath of files) {
    const tokens = extractTokensFromFile(filePath, nameToIdMap);
    allTokens.push(...tokens);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const payload = allTokens.map(row => JSON.stringify(row)).join('\n');
  fs.writeFileSync(OUTPUT_FILE, payload, 'utf8');

  console.log(`✅ Wrote ${allTokens.length} reminders to ${OUTPUT_FILE}`);
}

if (require.main === module) {
  main();
}
