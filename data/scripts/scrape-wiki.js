#!/usr/bin/env node
/**
 * Blood on the Clocktower Wiki Scraper
 * Scrapes character data from the official wiki using cheerio for proper HTML parsing
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// Load character config
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'characters.json');
const CHARACTERS = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).characters;

const BASE_URL = 'https://wiki.bloodontheclocktower.com';
const OUTPUT_DIR = path.join(__dirname, '..', 'characters');
const CACHE_DIR = path.join(__dirname, '..', '.cache', 'html');

// Type mapping from category names (plural) to schema type (singular)
const TYPE_MAPPING = {
  townsfolk: 'townsfolk',
  outsiders: 'outsider',
  minions: 'minion',
  demons: 'demon'
};

// Edition mapping from wiki text
const EDITION_MAPPING = {
  'trouble brewing': 'trouble_brewing',
  'trouble_brewing': 'trouble_brewing',
  'bad moon rising': 'bad_moon_rising',
  'bad_moon_rising': 'bad_moon_rising',
  'sects & violets': 'sects_violets',
  'sects_%26_violets': 'sects_violets',
  'sects_&_violets': 'sects_violets',
  'experimental characters': 'experimental',
  'experimental': 'experimental'
};

// Rate limiting
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch HTML with caching
 */
async function fetchWithCache(url, urlParam) {
  const cacheFile = path.join(CACHE_DIR, `${urlParam.replace(/%27/g, "'")}.html`);
  
  // Try to read from cache
  if (fs.existsSync(cacheFile)) {
    const cached = fs.readFileSync(cacheFile, 'utf8');
    return cached;
  }
  
  // Fetch from remote
  console.log(`  download ${url}`);
  const response = await fetch(url);
  const html = await response.text();
  
  // Save to cache
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, html, 'utf8');
  
  return html;
}

/**
 * Parse wiki HTML to extract character data using cheerio
 */
function extractExamplesEnglish($) {
  // Find Examples/Example header and collect content until next H2
  const header = $('h2:contains("Examples"), h2:contains("Example")').first();
  const arr = [];

  if (header.length > 0) {
    header.nextUntil('h2').each(function() {
      const el = $(this);
      if (el.is('ul') || el.is('ol')) {
        el.find('li').each(function() {
          const t = $(this).text().trim();
          if (t) arr.push(t);
        });
      } else if (el.is('p') || el.is('pre')) {
        const t = el.text().trim();
        if (t) arr.push(t);
      } else if (el.find('li').length > 0) {
        // catch nested lists
        el.find('li').each(function() {
          const t = $(this).text().trim();
          if (t) arr.push(t);
        });
      }
    });
  }

  // Fallback: older pages / scraped markup might use .example class
  if (arr.length === 0) {
    $('.example').each(function() {
      const t = $(this).text().trim();
      if (t) arr.push(t);
    });
  }

  return arr;
}

function parseCharacterPage(html, characterId, charData, type) {
  const $ = cheerio.load(html);

  // Extract flavor text from the .flavour paragraph
  const flavorText = $('.flavour').first().text().trim() || null;

  // Extract ability from Summary section
  const summaryHeader = $('#Summary').closest('h2');
  const summarySection = summaryHeader.nextAll().not('h2').first();
  let ability = null;

  // The summary content is directly in a <p> tag after the h2
  if (summarySection.length > 0 && summarySection[0].tagName === 'p') {
    ability = summarySection.text().trim().replace(/^"|"$/g, '');
  }

  // Extract editions from categories and "Appears in" section
  const editions = new Set();

  // Check categories first (more reliable)
  $('.catlinks a').each(function() {
    const categoryText = $(this).text().toLowerCase().trim();
    const categoryHref = $(this).attr('href') || '';

    // Map category text to edition
    if (EDITION_MAPPING[categoryText]) {
      editions.add(EDITION_MAPPING[categoryText]);
    }
    // Also check href
    for (const [key, value] of Object.entries(EDITION_MAPPING)) {
      if (categoryHref.toLowerCase().includes(key.replace(/_/g, '_').replace(/%26/g, '%26'))) {
        editions.add(value);
      }
    }
  });

  // Also check for edition links in the content
  const content = $('#content');
  content.find('a').each(function() {
    const href = $(this).attr('href') || '';
    const text = $(this).text().toLowerCase().trim();

    for (const [key, value] of Object.entries(EDITION_MAPPING)) {
      if (href.toLowerCase().includes(key) || text.includes(key.replace(/_/g, ' '))) {
        editions.add(value);
      }
    }
  });

  // Convert Set to Array
  const editionsArray = Array.from(editions);

  // If no editions found, check if it's in Experimental by looking at character list
  if (editionsArray.length === 0) {
    // Characters not in main editions are often experimental
    // We'll mark as experimental as fallback
    editionsArray.push('experimental');
  }

  // Determine first_night / other_nights
  const howToRunHeader = $('#How_to_Run').closest('h2');
  const howToRunSection = howToRunHeader.nextAll().not('h2').first();
  const howToRunText = howToRunSection.length > 0 ? howToRunSection.text().toLowerCase() : '';
  const firstNight = howToRunText.includes('first night');
  const otherNights = howToRunText.includes('each night') || howToRunText.includes('every night');

  // Extract jinxes
  const jinxes = [];
  const jinxSection = $('h2:contains("Jinx")').next('ul').find('li');
  jinxSection.each(function() {
    const $this = $(this);
    const charLink = $this.find('a').first();
    if (charLink.length > 0) {
      jinxes.push({
        character: charLink.attr('href').split('/').pop().toLowerCase().replace(/%27/g, "'").replace(/_/g, '_'),
        effect: $this.text().replace(charLink.text(), '').trim()
      });
    }
  });

  // Extract examples (English). Return as a language-keyed object (en).
  const examplesArr = extractExamplesEnglish($);
  const examples = examplesArr && examplesArr.length > 0 ? { en: examplesArr } : undefined;

  // Extract tips from "Tips & Tricks" section
  const tips = { en: [] };
  const tipsHeader = $('h2:contains("Tips & Tricks")').first();
  if (tipsHeader.length > 0) {
    // Get all ul elements after the Tips header (before the next h2)
    const tipsLists = tipsHeader.nextAll().not('h2').filter(function() {
      return $(this)[0].tagName === 'ul';
    });
    
    tipsLists.each(function() {
      const tipText = $(this).find('li').text().trim();
      if (tipText) {
        tips.en.push(tipText);
      }
    });
  }

  // Extract how_to_run
  let howToRun = null;
  if (howToRunSection.length > 0 && howToRunSection[0].tagName === 'p') {
    howToRun = howToRunSection.text().trim();
  }

  // Extract artist and author from infobox
  let artist = null;
  const infobox = $('#character-details, .infobox').first();
  if (infobox.length > 0) {
    const artistRow = infobox.find('tr:contains("Artist"), tr:contains("artist")').first();
    if (artistRow.length > 0) {
      const artistCell = artistRow.find('td').eq(1);
      if (artistCell.length > 0) {
        artist = artistCell.text().trim();
      }
    }
  }

  return {
    id: characterId,
    type: TYPE_MAPPING[type] || type,
    name: { en: charData.en, ...(charData.cn ? { cn: charData.cn } : {}) },
    ability: ability ? { en: ability } : null,
    flavor_text: flavorText ? { en: flavorText } : null,
    editions: editionsArray,
    first_night: firstNight,
    other_nights: otherNights,
    artist: artist,
    jinxes,
    examples: examples,
    tips: tips.en.length > 0 ? tips : undefined,
    how_to_run: howToRun ? { en: howToRun } : undefined,
    source_url: `${BASE_URL}/${charData.en_url_param || charData.en.replace(/ /g, '_')}`
  };
}

/**
 * Validate data against schema requirements
 */
function validateCharacterData(data) {
  const errors = [];

  // Required fields
  if (!data.id || typeof data.id !== 'string') {
    errors.push('Missing or invalid id');
  }
  if (!data.type || !['townsfolk', 'outsider', 'minion', 'demon', 'traveller', 'fabled'].includes(data.type)) {
    errors.push('Missing or invalid type');
  }
  if (!data.editions || !Array.isArray(data.editions) || data.editions.length === 0) {
    errors.push('Missing or empty editions array');
  }
  if (!data.ability) {
    errors.push('Missing ability field');
  }

  // Check for HTML garbage in flavor_text
  if (data.flavor_text && data.flavor_text.en) {
    const flavor = data.flavor_text.en;
    if (flavor.includes('<title>') || flavor.includes('<script>') || flavor.includes('<!DOCTYPE')) {
      errors.push('flavor_text contains HTML garbage');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Main scraper function
 */
async function scrapeAllCharacters() {
  console.log('🏰 Blood on the Clocktower Wiki Scraper\n');

  const results = {
    success: [],
    failed: []
  };

  for (const [type, characters] of Object.entries(CHARACTERS)) {
    console.log(`\n📦 Scraping ${type} (${Object.keys(characters).length} characters)...`);

    for (const [characterId, charData] of Object.entries(characters)) {
      const urlParam = charData.en_url_param || charData.en.replace(/ /g, '_');
      const url = `${BASE_URL}/${urlParam}`;
      console.log(`  → ${characterId} (${charData.en})`);

      try {
        const html = await fetchWithCache(url, urlParam);
        const data = parseCharacterPage(html, characterId, charData, type);

        // Validate before writing
        const validation = validateCharacterData(data);
        if (!validation.valid) {
          throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
        }

        // Save to file
        const outputPath = path.join(OUTPUT_DIR, type, `${data.id}.json`);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

        results.success.push(characterId);
      } catch (error) {
        console.error(`    ❌ Failed: ${error.message}`);
        results.failed.push({ characterId, error: error.message });
      }

      // Rate limiting - 500ms between requests
      await delay(500);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Scraping Summary:');
  console.log(`  ✅ Success: ${results.success.length}`);
  console.log(`  ❌ Failed: ${results.failed.length}`);

  if (results.failed.length > 0) {
    console.log('\nFailed characters:');
    results.failed.forEach(f => console.log(`  - ${f.characterId}: ${f.error}`));
  }

  // Save summary
  // Save summary to data/results for workspace consistency
  fs.mkdirSync(path.join(__dirname, '..', 'results'), { recursive: true });
  fs.writeFileSync(
    path.join(__dirname, '..', 'results', 'scrape-results.json'),
    JSON.stringify(results, null, 2)
  );

  return results;
}

// Run if called directly
if (require.main === module) {
  scrapeAllCharacters().catch(console.error);
}

module.exports = { scrapeAllCharacters, parseCharacterPage, validateCharacterData };
