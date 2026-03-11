#!/usr/bin/env node
/**
 * Blood on the Clocktower Wiki Scraper (English Reminder Tokens Pipeline)
 * Extracts reminder token metadata from cached English character pages.
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const EXTRACTED_DIR = path.join(__dirname, '..', '..', 'extracted');
const INPUT_FILE = path.join(EXTRACTED_DIR, 'characters.wiki.en.jsonl');
const OUTPUT_FILE = path.join(EXTRACTED_DIR, 'tokens.wiki.en.jsonl');
const CACHE_DIR = path.join(__dirname, '..', '..', '.cache', 'html');

const EXCLUDED_INFO_TOKENS = new Set([
  'YOU ARE',
  'THIS PLAYER IS',
  'THIS CHARACTER SELECTED YOU',
  "THIS CHARACTER SELECTED YOU'",
  'THESE ARE YOUR MINIONS',
  'THESE CHARACTERS ARE NOT IN PLAY',
  'MINION INFO',
  'DEMON INFO'
]);

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

function normalizeCacheFile(urlParam) {
  return `${urlParam.replace(/%27/g, "'").replace(/\//g, '_')}.html`;
}

function looksLikeTokenName(name) {
  const normalized = cleanText(name);
  if (!normalized || normalized.length > 50) {
    return false;
  }
  if (EXCLUDED_INFO_TOKENS.has(normalized.toUpperCase())) {
    return false;
  }
  if (normalized === '?') {
    return true;
  }
  if (/^\d+(\s*&\s*\d+)+$/.test(normalized)) {
    return true;
  }

  const upper = normalized.toUpperCase();
  const allowedChars = /^[A-Z0-9 ?&'’+\-/().,:]+$/;
  if (!allowedChars.test(upper)) {
    return false;
  }

  const alphaOnly = upper.replace(/[^A-Z]/g, '');
  if (alphaOnly.length === 0) {
    return false;
  }

  return upper === normalized || normalized === upper;
}

function extractSentenceWithToken(text, tokenName) {
  const normalizedText = cleanText(text);
  if (!normalizedText) {
    return null;
  }
  const tokenUpper = tokenName.toUpperCase();
  const parts = normalizedText.split(/(?<=[.!?])\s+/);
  for (const part of parts) {
    if (part.toUpperCase().includes(tokenUpper)) {
      return cleanText(part);
    }
  }
  if (normalizedText.toUpperCase().includes(tokenUpper)) {
    return normalizedText;
  }
  return null;
}

function inferTimingFromSentence(sentence) {
  const text = cleanText(sentence);
  if (!text) {
    return null;
  }

  const timingPatterns = [
    /^(Each night(?: except the first)?)/i,
    /^(Each day)/i,
    /^(Each dawn)/i,
    /^(Each dusk)/i,
    /^(During the first night)/i,
    /^(While preparing the first night)/i,
    /^(On the first night)/i,
    /^(At dawn)/i,
    /^(At dusk)/i,
    /^(At any time)/i,
    /^(The next day)/i,
    /^(The next dusk)/i,
    /^(Tonight)/i,
    /^(Tomorrow)/i,
    /^(If [^,.!?:]+[,.:]?)/i,
    /^(When [^,.!?:]+[,.:]?)/i
  ];

  for (const pattern of timingPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return cleanText(match[1]);
    }
  }

  return null;
}

function getHowToRunSection($) {
  const header = $('h2:contains("How to Run"), h3:contains("How to Run")').first();
  if (header.length) {
    return header.nextUntil('h2');
  }
  return $('#mw-content-text');
}

function parseCharacterTokens(html, character) {
  const $ = cheerio.load(html);
  const section = getHowToRunSection($);

  const tokenMap = new Map();

  section.each(function handleNode() {
    const el = $(this);
    const tagName = (el[0] && el[0].tagName) || '';

    if (tagName !== 'p' && tagName !== 'li' && tagName !== 'ul') {
      return;
    }

    const nodes = [];
    if (tagName === 'ul') {
      el.find('li').each(function collectLi() {
        nodes.push($(this));
      });
    } else {
      nodes.push(el);
    }

    for (const node of nodes) {
      const nodeText = cleanText(node.text());
      if (!nodeText) {
        continue;
      }

      const hasTokenAction = /\b(mark|put|place|add|replace|remove|removed)\b/i.test(nodeText);
      const hasReminderWord = /reminder/i.test(nodeText);
      if (!hasTokenAction && !hasReminderWord) {
        continue;
      }

      node.find('b').each(function handleBold() {
        const tokenName = cleanText($(this).text());
        if (!looksLikeTokenName(tokenName)) {
          return;
        }

        const tokenKey = tokenName.toUpperCase();
        const sentence = extractSentenceWithToken(nodeText, tokenName);
        const lowerSentence = (sentence || '').toLowerCase();

        if (!tokenMap.has(tokenKey)) {
          tokenMap.set(tokenKey, {
            character_id: character.id,
            character_type: character.type,
            character_name_en: character.name,
            name: tokenName,
            placement_timing: null,
            placement_conditions: null,
            removal_timing: null
          });
        }

      const row = tokenMap.get(tokenKey);

      const hasPlaceWords = /\b(mark|put|place|add|replace)\b/i.test(lowerSentence);
      const hasRemoveWords = /\b(remove|removed|discard)\b/i.test(lowerSentence);

      if (sentence && hasPlaceWords) {
        if (!row.placement_conditions) {
          row.placement_conditions = sentence;
        }
        if (!row.placement_timing) {
          row.placement_timing = inferTimingFromSentence(sentence);
        }
      }

      if (sentence && hasRemoveWords) {
        if (!row.removal_timing) {
          row.removal_timing = sentence;
        }
      }
    });
  }
  });

  return Array.from(tokenMap.values()).map(compactObject);
}

function readCharacters() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Missing input file: ${INPUT_FILE}`);
  }

  return fs
    .readFileSync(INPUT_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function main() {
  const characters = readCharacters();
  const allTokens = [];

  for (const character of characters) {
    const cacheFileName = normalizeCacheFile(character.url_param || '');
    const cachePath = path.join(CACHE_DIR, cacheFileName);
    if (!character.url_param || !fs.existsSync(cachePath)) {
      continue;
    }

    const html = fs.readFileSync(cachePath, 'utf8');
    const tokens = parseCharacterTokens(html, character);
    allTokens.push(...tokens);
  }

  fs.mkdirSync(EXTRACTED_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, allTokens.map(row => JSON.stringify(row)).join('\n'), 'utf8');
  console.log(`✅ Wrote ${allTokens.length} reminder tokens to ${OUTPUT_FILE}`);
}

if (require.main === module) {
  main();
}
