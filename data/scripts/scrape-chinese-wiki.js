#!/usr/bin/env node
/**
 * Blood on the Clocktower Chinese Wiki Scraper
 * Scrapes Chinese character data from the official Chinese wiki and merges into existing JSON files
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const BASE_URL = 'https://clocktower-wiki.gstonegames.com/index.php?title';
const CACHE_DIR = path.join(__dirname, '..', '.cache', 'html-cn');
// Mapping moved to `data/characters.json`
const MAPPING_PATH = path.join(__dirname, '..', 'config', 'characters.json');
const CHARACTERS_DIR = path.join(__dirname, '..', 'characters');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function loadMapping() {
  return JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));
}

async function fetchWithCache(url, urlParam) {
  const cacheFile = path.join(CACHE_DIR, `${urlParam}.html`);
  
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
  
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, html, 'utf8');
  
  return html;
}

function extractSection($, heading) {
  const header = $(`h2:contains("${heading}")`).first();
  if (header.length === 0) return null;
  
  const section = header.nextUntil('h2');
  if (section.length === 0) return null;
  
  return section.text().trim() || null;
}

function extractExamples($) {
  const header = $('h2:contains("范例")').first();
  if (header.length === 0) return [];
  
  const examples = [];
  header.nextUntil('h2').each(function() {
    const $el = $(this);
    if ($el[0].tagName === 'pre') {
      const text = $el.text().trim();
      if (text) examples.push(text);
    }
  });
  
  return examples.length > 0 ? examples : null;
}

function extractTips($) {
  const header = $('h2:contains("提示与技巧")').first();
  if (header.length === 0) return [];
  
  const tips = [];
  header.nextUntil('h2:contains("伪装成"), h2:contains("角色信息")').filter(function() {
    return $(this)[0].tagName === 'ul';
  }).each(function() {
    $(this).find('li').each(function() {
      const text = $(this).text().trim();
      if (text) tips.push(text);
    });
  });
  
  return tips.length > 0 ? tips : null;
}

function parseChinesePage(html, urlParam) {
  const $ = cheerio.load(html);
  
  const chineseName = $('h1').first().text().trim() || null;
  
  const abilityCn = extractSection($, '角色能力');
  const flavorTextCn = extractSection($, '背景故事');
  const examplesCn = extractExamples($);
  const howToRunCn = extractSection($, '运作方式');
  const tipsCn = extractTips($);
  
  const result = {};
  
  if (chineseName) result.name = { cn: chineseName };
  if (abilityCn) result.ability = { cn: abilityCn };
  if (flavorTextCn) result.flavor_text = { cn: flavorTextCn };
  if (examplesCn && examplesCn.length > 0) result.examples = examplesCn;
  if (howToRunCn) result.how_to_run = { cn: howToRunCn };
  if (tipsCn && tipsCn.length > 0) result.tips = { cn: tipsCn };
  
  return result;
}

function extractChineseImageName(html) {
  const $ = cheerio.load(html);
  // Try multiple selectors: infobox, character-details, main content thumbnails
  let img = $('.infobox img, #character-details img').first();
  if (!img.length) img = $('#mw-content-text img').first();
  if (!img.length) img = $('.mw-parser-output img').first();
  if (!img.length) return null;
  const src = img.attr('src') || img.attr('data-src') || '';
  if (!src) return null;
  // get last path segment
  const parts = src.split('/').filter(Boolean);
  const last = parts.length > 0 ? parts[parts.length - 1] : null;
  return last ? decodeURIComponent(last) : null;
}

function mergeChineseData(englishId, type, chineseData) {
  const jsonPath = path.join(CHARACTERS_DIR, type, `${englishId}.json`);
  
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Character file not found: ${jsonPath}`);
  }
  
  const existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  
  if (chineseData.name && chineseData.name.cn) {
    if (!existing.name) existing.name = {};
    existing.name.cn = chineseData.name.cn;
  }
  
  if (chineseData.ability && chineseData.ability.cn) {
    if (!existing.ability) existing.ability = {};
    existing.ability.cn = chineseData.ability.cn;
  }
  
  if (chineseData.flavor_text && chineseData.flavor_text.cn) {
    if (!existing.flavor_text) existing.flavor_text = {};
    existing.flavor_text.cn = chineseData.flavor_text.cn;
  }
  
  if (chineseData.examples && chineseData.examples.length > 0) {
    // Preserve existing examples if present. Convert legacy array to i18n object.
    if (Array.isArray(existing.examples)) {
      existing.examples = { en: existing.examples };
    } else if (!existing.examples) {
      existing.examples = {};
    }

    // Set Chinese examples under the cn key
    existing.examples.cn = chineseData.examples;
  }
  
  if (chineseData.how_to_run && chineseData.how_to_run.cn) {
    if (!existing.how_to_run) existing.how_to_run = {};
    existing.how_to_run.cn = chineseData.how_to_run.cn;
  }
  
  if (chineseData.tips && chineseData.tips.cn && chineseData.tips.cn.length > 0) {
    if (!existing.tips) existing.tips = {};
    existing.tips.cn = chineseData.tips.cn;
  }
  
  fs.writeFileSync(jsonPath, JSON.stringify(existing, null, 2) + '\n');
  
  return existing;
}

async function scrapeCharacter(type, englishId, mapping) {
  const urlParam = mapping.cn_url_param || mapping.cn;
  const url = `${BASE_URL}=${encodeURIComponent(urlParam)}`;
  const html = await fetchWithCache(url, urlParam);
  const chineseData = parseChinesePage(html, urlParam);
  const imageName = extractChineseImageName(html);
  const merged = mergeChineseData(englishId, type, chineseData);
  
  return {
    englishId,
    chineseName: mapping.cn,
    fieldsExtracted: Object.keys(chineseData),
    imageName: imageName,
    success: true
  };
}

async function scrapeTestCharacters() {
  console.log('🏰 Blood on the Clocktower Chinese Wiki Scraper - Test Mode\n');
  
  const testCharacters = [
    { type: 'townsfolk', id: 'chef' },
    { type: 'townsfolk', id: 'washerwoman' },
    { type: 'demons', id: 'imp' }
  ];
  
  const mapping = loadMapping().characters;
  const results = {
    success: [],
    failed: [],
    skipped: []
  };
  
  for (const { type, id } of testCharacters) {
    console.log(`\n📦 Processing ${type}/${id}...`);
    
    if (!mapping[type] || !mapping[type][id]) {
      console.log(`    ⚠️  No mapping found, skipping`);
      results.skipped.push({ type, id, reason: 'No mapping' });
      continue;
    }
    
    const charMapping = mapping[type][id];
    
    if (charMapping.note) {
      console.log(`    ⚠️  Skipped: ${charMapping.note}`);
      results.skipped.push({ type, id, reason: charMapping.note });
      continue;
    }
    
    try {
      const result = await scrapeCharacter(type, id, charMapping);
      // Normalize id and image name for confidence check
      const normalizedId = id.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const normalizedImage = (result.imageName || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (result.imageName && normalizedImage.includes(normalizedId)) {
        console.log(`    ✅ Success - image: ${result.imageName} - extracted: ${result.fieldsExtracted.join(', ')}`);
      } else if (result.imageName) {
        console.log(`    ⚠️ Suspicious image: ${result.imageName} - extracted: ${result.fieldsExtracted.join(', ')}`);
      } else {
        console.log(`    ✅ Success - extracted: ${result.fieldsExtracted.join(', ')}`);
      }
      results.success.push(result);
    } catch (error) {
      console.error(`    ❌ Failed: ${error.message}`);
      results.failed.push({ type, id, error: error.message });
    }
    
    await delay(500);
  }
  
  return results;
}

async function scrapeAllCharacters() {
  console.log('🏰 Blood on the Clocktower Chinese Wiki Scraper\n');
  
  const mapping = loadMapping().characters;
  const results = {
    success: [],
    failed: [],
    skipped: []
  };
  
  for (const [type, characters] of Object.entries(mapping)) {
    console.log(`\n📦 Processing ${type} (${Object.keys(characters).length} characters)...`);
    
    for (const [englishId, charMapping] of Object.entries(characters)) {
      console.log(`  → ${englishId} (${charMapping.cn})`);
      
      if (charMapping.note) {
        console.log(`    ⚠️  Skipped: ${charMapping.note}`);
        results.skipped.push({ type, id: englishId, reason: charMapping.note });
        continue;
      }
      
      try {
        const result = await scrapeCharacter(type, englishId, charMapping);
        if (result.imageName) {
          console.log(`    ✅ Success - image: ${result.imageName}`);
        } else {
          console.log(`    ✅ Success`);
        }
        results.success.push(result);
      } catch (error) {
        console.error(`    ❌ Failed: ${error.message}`);
        results.failed.push({ type, id: englishId, error: error.message });
      }
      
      await delay(500);
    }
  }
  
  return results;
}

function printSummary(results) {
  console.log('\n' + '='.repeat(50));
  console.log('📊 Scraping Summary:');
  console.log(`  ✅ Success: ${results.success.length}`);
  console.log(`  ❌ Failed: ${results.failed.length}`);
  console.log(`  ⚠️  Skipped: ${results.skipped.length}`);
  
  if (results.failed.length > 0) {
    console.log('\nFailed characters:');
    results.failed.forEach(f => console.log(`  - ${f.type}/${f.id}: ${f.error}`));
  }
  
  if (results.skipped.length > 0) {
    console.log('\nSkipped characters:');
    results.skipped.forEach(s => console.log(`  - ${s.type}/${s.id}: ${s.reason}`));
  }
  
  fs.mkdirSync(path.join(__dirname, '..', 'results'), { recursive: true });
  const summaryPath = path.join(__dirname, '..', 'results', 'scrape-results-cn.json');
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Summary saved to: ${summaryPath}`);
}

const args = process.argv.slice(2);
const testMode = args.includes('--test') || args.includes('-t');

if (testMode) {
  scrapeTestCharacters()
    .then(results => {
      printSummary(results);
    })
    .catch(console.error);
} else {
  scrapeAllCharacters()
    .then(results => {
      printSummary(results);
    })
    .catch(console.error);
}

module.exports = { scrapeAllCharacters, scrapeTestCharacters, parseChinesePage, mergeChineseData };
