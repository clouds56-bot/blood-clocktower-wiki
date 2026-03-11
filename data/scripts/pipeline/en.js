#!/usr/bin/env node
/**
 * Blood on the Clocktower Wiki Scraper (English Pipeline)
 * Scrapes character data from the official wiki categories and outputs to a JSONL file.
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const BASE_URL = 'https://wiki.bloodontheclocktower.com';
const CACHE_DIR = path.join(__dirname, '..', '..', '.cache', 'html');
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'extracted');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'characters.wiki.en.jsonl');

const CATEGORIES = [
  { name: 'Townsfolk', type: 'townsfolk' },
  { name: 'Outsiders', type: 'outsider' },
  { name: 'Minions', type: 'minion' },
  { name: 'Demons', type: 'demon' },
  { name: 'Travellers', type: 'traveller' },
  { name: 'Fabled', type: 'fabled' }
];

const EDITION_MAPPING = {
  'trouble brewing': 'trouble_brewing',
  'bad moon rising': 'bad_moon_rising',
  'sects & violets': 'sects_violets',
  'experimental characters': 'experimental'
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithCache(url, urlParam) {
  const cacheFile = path.join(CACHE_DIR, `${urlParam.replace(/%27/g, "'").replace(/\//g, '_')}.html`);
  
  if (fs.existsSync(cacheFile)) {
    return fs.readFileSync(cacheFile, 'utf8');
  }
  
  console.log(`  download ${url}`);
  const response = await fetch(url);
  const html = await response.text();
  
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, html, 'utf8');
  
  return html;
}

function extractExamplesEnglish($) {
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
        el.find('li').each(function() {
          const t = $(this).text().trim();
          if (t) arr.push(t);
        });
      }
    });
  }

  if (arr.length === 0) {
    $('.example').each(function() {
      arr.push($(this).text().trim());
    });
  }

  return arr;
}

function parseCharacterPage(html, englishName, type, urlParam) {
  const $ = cheerio.load(html);
  
  const flavorText = $('.flavour').first().text().trim() || null;
  
  const summaryHeader = $('#Summary').closest('h2');
  const summarySection = summaryHeader.nextAll().not('h2').first();
  let ability = null;
  if (summarySection.length > 0 && summarySection[0].tagName === 'p') {
    ability = summarySection.text().trim().replace(/^"|"$/g, '');
  }

  const editions = new Set();
  $('.catlinks a').each(function() {
    const categoryText = $(this).text().toLowerCase().trim();
    if (EDITION_MAPPING[categoryText]) {
      editions.add(EDITION_MAPPING[categoryText]);
    }
  });

  const content = $('#content');
  content.find('a').each(function() {
    const text = $(this).text().toLowerCase().trim();
    for (const [key, value] of Object.entries(EDITION_MAPPING)) {
      if (text.includes(key)) {
        editions.add(value);
      }
    }
  });

  const editionsArray = Array.from(editions);
  if (editionsArray.length === 0) {
    editionsArray.push('experimental');
  }

  const howToRunHeader = $('#How_to_Run').closest('h2');
  const howToRunSection = howToRunHeader.nextAll().not('h2').first();

  const jinxes = [];
  $('#jinxes table tr').each(function() {
    const $this = $(this);
    const charLink = $this.find('td').eq(1).find('a').first();
    let effect = $this.find('td').eq(1).find('p').eq(1).text().trim();
    if (!effect) {
      effect = $this.find('td').eq(1).text().replace(charLink.text(), '').trim();
    }
    if (charLink.length > 0) {
      const charName = charLink.attr('href').split('/').pop().toLowerCase();
      jinxes.push({
        id: charName.replace(/%27/g, "").replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''),
        reason: effect
      });
    }
  });

  if (jinxes.length === 0) {
    const jinxSection = $('h2:contains("Jinx")').next('ul').find('li');
    jinxSection.each(function() {
      const $this = $(this);
      const charLink = $this.find('a').first();
      if (charLink.length > 0) {
        const charName = charLink.attr('href').split('/').pop().toLowerCase();
        jinxes.push({
          id: charName.replace(/%27/g, "").replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''),
          reason: $this.text().replace(charLink.text(), '').trim()
        });
      }
    });
  }

  const examplesArr = extractExamplesEnglish($);

  const tips = [];
  const tipsHeader = $('h2:contains("Tips & Tricks")').first();
  if (tipsHeader.length > 0) {
    const tipsLists = tipsHeader.nextAll().not('h2').filter(function() {
      return $(this)[0].tagName === 'ul';
    });
    tipsLists.each(function() {
      const tipText = $(this).find('li').text().trim();
      if (tipText) {
        tips.push(tipText);
      }
    });
  }

  // Extract 'How to Run' text
  let howToRun = null;
  if (howToRunHeader.length > 0) {
    let current = howToRunHeader.next();
    let textParts = [];
    while (current.length > 0 && current[0].tagName !== 'h2') {
      textParts.push(current.text().trim());
      current = current.next();
    }
    const fullText = textParts.join('\n').trim();
    if (fullText) howToRun = fullText;
  }

  // Also artist
  let artist = null;
  $('th:contains("Artist"), td:contains("Artist")').each(function() {
    const el = $(this).next('td');
    if (el.length > 0) {
      artist = el.text().trim();
    }
  });
  if (!artist) {
    $('a[title^="User:"]').each(function() {
      const title = $(this).attr('title');
      if (title && title.includes('User:')) {
        artist = $(this).text().trim();
      }
    });
  }

  const row = {
    id: englishName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''),
    name: englishName,
    type: type,
    ability: ability || null,
    flavor: flavorText || null,
    editions: editionsArray,
    artist: artist,
    jinxes: jinxes,
    examples: examplesArr.length > 0 ? examplesArr : null,
    tips: tips.length > 0 ? tips : null,
    how_to_run: howToRun || null,
    url_param: urlParam,
    source_url: `${BASE_URL}/${urlParam}`
  };

  const compact = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    compact[key] = value;
  }

  return compact;
}

async function scrapeCategory(categoryUrl, type) {
  console.log(`\n📦 Scraping Category: ${categoryUrl}`);
  const html = await fetchWithCache(categoryUrl, `Category_${type}`);
  const $ = cheerio.load(html);
  
  const characters = [];
  $('.mw-category-group ul li a').each(function() {
    const name = $(this).text().trim();
    const urlParam = $(this).attr('href').replace(/^\//, ''); // remove leading slash
    characters.push({ name, urlParam });
  });

  console.log(`  Found ${characters.length} characters.`);
  return characters;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const allData = [];
  
  // Scrape each category
  for (const cat of CATEGORIES) {
    const categoryUrl = `${BASE_URL}/Category:${cat.name}`;
    const chars = await scrapeCategory(categoryUrl, cat.type);
    
    for (const char of chars) {
      console.log(`  → Fetching: ${char.name} (${char.urlParam})`);
      const url = `${BASE_URL}/${char.urlParam}`;
      try {
        const html = await fetchWithCache(url, char.urlParam);
        const data = parseCharacterPage(html, char.name, cat.type, char.urlParam);
        allData.push(data);
      } catch (err) {
        console.error(`    ❌ Error fetching ${char.name}: ${err.message}`);
      }
      await delay(200);
    }
  }

  // Write out JSONL
  fs.writeFileSync(OUTPUT_FILE, allData.map(d => JSON.stringify(d)).join('\n'), 'utf8');
  console.log(`\n✅ Wrote ${allData.length} characters to ${OUTPUT_FILE}`);
}

if (require.main === module) {
  main().catch(console.error);
}
