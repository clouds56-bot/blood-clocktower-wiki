#!/usr/bin/env node
/**
 * Blood on the Clocktower Edition Scraper
 * Scrapes edition data from official wikis and builds character lists
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'editions.json');
const CHARACTERS_CONFIG_PATH = path.join(__dirname, '..', 'config', 'characters.json');
const CHARACTERS_DIR = path.join(__dirname, '..', 'characters');
const OUTPUT_DIR = path.join(__dirname, '..', 'editions');
const CACHE_DIR_EN = path.join(__dirname, '..', '.cache', 'html');
const CACHE_DIR_CN = path.join(__dirname, '..', '.cache', 'html-cn');

const EN_BASE_URL = 'https://wiki.bloodontheclocktower.com';
const CN_BASE_URL = 'https://clocktower-wiki.gstonegames.com/index.php?title';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function loadEditionConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).editions;
}

function loadCharactersMapping() {
  return JSON.parse(fs.readFileSync(CHARACTERS_CONFIG_PATH, 'utf8')).characters;
}

function buildCharacterNameToIdMapping(charactersMapping) {
  const mapping = {};

  for (const [type, chars] of Object.entries(charactersMapping)) {
    for (const [id, data] of Object.entries(chars)) {
      if (data.cn) {
        mapping[data.cn] = { id, type };
      }
    }
  }

  return mapping;
}

async function fetchWithCache(url, urlParam, cacheDir) {
  const cacheFile = path.join(cacheDir, `${urlParam.replace(/%27/g, "'")}.html`);

  if (fs.existsSync(cacheFile)) {
    console.log(`    📦 Using cached: ${urlParam}`);
    return fs.readFileSync(cacheFile, 'utf8');
  }

  console.log(`    🌐 Fetching: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const html = await response.text();

  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cacheFile, html, 'utf8');

  return html;
}

function parseEnglishEdition(html, editionId) {
  const $ = cheerio.load(html);

  // Find the first paragraph with actual text content (skip links, images)
  let description = null;
  $('#mw-content-text p').each(function() {
    const $p = $(this);
    const text = $p.text().trim();
    // Skip if empty or just links
    if (text.length > 20 && !$p.is(':has(a)') && !$p.is(':has(img)')) {
      description = text;
      return false; // break
    }
  });

  const minPlayers = null;
  const maxPlayers = null;

  const nightOrder = {
    first_night: [],
    other_nights: []
  };

  return {
    description: description ? { en: description } : null,
    min_players: minPlayers,
    max_players: maxPlayers,
    night_order: nightOrder
  };
}

function parseChineseCharacters($, cnToId) {
  const characters = {
    townsfolk: [],
    outsiders: [],
    minions: [],
    demons: []
  };

  const typeMappings = {
    '镇民': 'townsfolk',
    '外来者': 'outsiders',
    '爪牙': 'minions',
    '恶魔': 'demons'
  };

  for (const [cnType, enType] of Object.entries(typeMappings)) {
    const header = $(`h2:contains("${cnType}"), h3:contains("${cnType}")`).first();
    if (header.length === 0) continue;

    const section = header.nextUntil('h2, h3');

    section.find('a').each(function() {
      const link = $(this);
      const cnName = link.attr('title');
      if (cnName && cnToId[cnName]) {
        const { id, type } = cnToId[cnName];
        if (type === enType && !characters[enType].includes(id)) {
          characters[enType].push(id);
        }
      }
    });
  }

  for (const type of Object.keys(characters)) {
    characters[type].sort();
  }

  return characters;
}

function parseChineseNightOrder($, cnToId) {
  const nightOrder = {
    first_night: [],
    other_nights: []
  };

  const header = $('h2:contains("夜晚顺序表"), h3:contains("夜晚顺序表")').first();
  if (header.length === 0) return nightOrder;

  const section = header.nextUntil('h2, h3');

  let currentSection = null;
  let firstNightOrder = 1;
  let otherNightsOrder = 1;
  const seen = new Set();

  section.each(function() {
    const $elem = $(this);
    const tagName = $elem.prop('tagName');

    if (tagName === 'UL' || tagName === 'OL') {
      const text = $elem.text().trim();
      if (text.includes('首个夜晚')) {
        currentSection = 'first_night';
      } else if (text.includes('其他夜晚')) {
        currentSection = 'other_nights';
      }
    } else if (tagName === 'P' && currentSection) {
      const link = $elem.find('a').first();
      if (link.length === 0) return;

      const cnName = link.attr('title');
      if (!cnName) return;

      const charInfo = cnToId[cnName];
      if (charInfo && !seen.has(charInfo.id)) {
        const entry = {
          number: currentSection === 'first_night' ? firstNightOrder++ : otherNightsOrder++,
          character: charInfo.id,
          type: charInfo.type
        };

        nightOrder[currentSection].push(entry);
        seen.add(charInfo.id);
      }
    }
  });

  return nightOrder;
}

function parseChineseEdition(html, editionId, cnToId) {
  const $ = cheerio.load(html);

  // Get description from first paragraph
  let description = null;
  $('#mw-content-text p').first().each(function() {
    const text = $(this).text().trim();
    if (text.length > 20) {
      description = text;
      return false;
    }
  });

  const characters = parseChineseCharacters($, cnToId);
  const nightOrder = parseChineseNightOrder($, cnToId);

  return {
    description: description ? { cn: description } : null,
    characters,
    night_order: nightOrder
  };
}

function validateCharacters(characterLists, charactersMapping) {
  const errors = [];
  const validIds = new Set();

  for (const chars of Object.values(charactersMapping)) {
    for (const id of Object.keys(chars)) {
      validIds.add(id);
    }
  }

  for (const [type, ids] of Object.entries(characterLists)) {
    for (const id of ids) {
      if (!validIds.has(id)) {
        errors.push(`Invalid ${type} character: ${id}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

async function scrapeEdition(editionId, editionConfig, charactersMapping) {
  console.log(`\n📦 Scraping edition: ${editionId} (${editionConfig.en})`);

  const cnToId = buildCharacterNameToIdMapping(charactersMapping);

  const result = {
    id: editionId,
    name: {
      en: editionConfig.en,
      cn: editionConfig.cn
    },
    description: {},
    characters: {
      townsfolk: [],
      outsiders: [],
      minions: [],
      demons: []
    },
    min_players: null,
    max_players: null,
    night_order: {
      first_night: [],
      other_nights: []
    },
    source_url: {}
  };

  if (editionConfig.en_url_param) {
    try {
      const url = `${EN_BASE_URL}/${editionConfig.en_url_param}`;
      const html = await fetchWithCache(url, editionConfig.en_url_param, CACHE_DIR_EN);
      const enData = parseEnglishEdition(html, editionId);

      if (enData.description && enData.description.en) {
        result.description.en = enData.description.en;
      }
      if (enData.min_players !== null) result.min_players = enData.min_players;
      if (enData.max_players !== null) result.max_players = enData.max_players;
      if (enData.night_order && (enData.night_order.first_night.length > 0 || enData.night_order.other_nights.length > 0)) {
        result.night_order = enData.night_order;
      }

      result.source_url.en = url;
    } catch (error) {
      console.error(`    ❌ Failed to fetch EN wiki: ${error.message}`);
    }

    await delay(500);
  }

  if (editionConfig.cn_url_param) {
    try {
      const url = `${CN_BASE_URL}=${encodeURIComponent(editionConfig.cn_url_param)}`;
      const html = await fetchWithCache(url, editionConfig.cn_url_param, CACHE_DIR_CN);
      const cnData = parseChineseEdition(html, editionId, cnToId);

      if (cnData.description && cnData.description.cn) {
        result.description.cn = cnData.description.cn;
      }

      if (cnData.characters) {
        result.characters = cnData.characters;
      }

      if (cnData.night_order && (cnData.night_order.first_night.length > 0 || cnData.night_order.other_nights.length > 0)) {
        result.night_order = cnData.night_order;
      }

      result.source_url.cn = url;
    } catch (error) {
      console.error(`    ❌ Failed to fetch CN wiki: ${error.message}`);
    }

    await delay(500);
  }

  // Clean up empty description
  if (Object.keys(result.description).length === 0) {
    result.description = null;
  }

  const validation = validateCharacters(result.characters, charactersMapping);
  if (!validation.valid) {
    console.error(`    ⚠️  Validation errors: ${validation.errors.join(', ')}`);
  }

  const charCount = Object.values(result.characters).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`    ✅ Found ${charCount} characters`);
  console.log(`    📝 Night order: ${result.night_order.first_night.length} first night, ${result.night_order.other_nights.length} other nights`);

  return result;
}

async function scrapeAllEditions() {
  console.log('🏰 Blood on the Clocktower Edition Scraper\n');

  const editionConfig = loadEditionConfig();
  const charactersMapping = loadCharactersMapping();

  const results = {
    success: [],
    failed: []
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const [editionId, config] of Object.entries(editionConfig)) {
    try {
      const editionData = await scrapeEdition(editionId, config, charactersMapping);

      const outputPath = path.join(OUTPUT_DIR, `${editionId}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(editionData, null, 2) + '\n');

      console.log(`    💾 Saved to: ${outputPath}`);
      results.success.push(editionId);
    } catch (error) {
      console.error(`    ❌ Failed: ${error.message}`);
      results.failed.push({ editionId, error: error.message });
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 Scraping Summary:');
  console.log(`  ✅ Success: ${results.success.length}`);
  console.log(`  ❌ Failed: ${results.failed.length}`);

  if (results.failed.length > 0) {
    console.log('\nFailed editions:');
    results.failed.forEach(f => console.log(`  - ${f.editionId}: ${f.error}`));
  }

  const summaryPath = path.join(__dirname, '..', 'results', 'scrape-results-editions.json');
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Summary saved to: ${summaryPath}`);

  return results;
}

if (require.main === module) {
  scrapeAllEditions().catch(console.error);
}

module.exports = { scrapeAllEditions, scrapeEdition, loadCharactersMapping, parseChineseCharacters, parseChineseNightOrder };
