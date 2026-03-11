#!/usr/bin/env node
/**
 * Blood on the Clocktower Wiki Scraper (Chinese Pipeline)
 * Scrapes character translations from the official Chinese wiki and outputs to a JSONL file.
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const BASE_URL = 'https://clocktower-wiki.gstonegames.com/index.php?title=';
const CACHE_DIR = path.join(__dirname, '..', '..', '.cache', 'html-cn');
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'extracted');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'characters.wiki.cn.jsonl');

const SCRIPTS = [
  '%E6%9A%97%E6%B5%81%E6%B6%8C%E5%8A%A8', // Trouble Brewing
  '%E9%BB%AF%E6%9C%88%E5%88%9D%E5%8D%87', // Bad Moon Rising
  '%E6%A2%A6%E6%AE%92%E6%98%A5%E5%AE%B5', // Sects & Violets
  '%E6%97%85%E8%A1%8C%E8%80%85', // Travellers
  '%E4%BC%A0%E5%A5%87%E8%A7%92%E8%89%B2', // Fabled
  '%E5%AE%9E%E9%AA%8C%E6%80%A7%E8%A7%92%E8%89%B2', // Experimental
  '%E5%A5%87%E9%81%87%E8%A7%92%E8%89%B2', // Adventures
  '%E5%8D%8E%E7%81%AF%E5%88%9D%E4%B8%8A' // Chinese exclusive
];

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithCache(url, urlParam) {
  const cacheFile = path.join(CACHE_DIR, `${urlParam}.html`);
  
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

function extractSection($, heading) {
  const header = $(`h2:contains("${heading}")`).first();
  if (header.length === 0) return null;
  
  const section = header.nextUntil('h2');
  if (section.length === 0) return null;
  
  return section.text().trim() || null;
}

function extractExamples($) {
  const header = $('h2:contains("范例")').first();
  if (header.length === 0) return null;
  
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
  if (header.length === 0) return null;
  
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

function extractCharacterData(html, cnName, urlParam) {
  const $ = cheerio.load(html);
  
  // Extract English Name
  let englishName = null;
  $('li').each(function() {
    const text = $(this).text();
    if (text.includes('英文名：') || text.includes('英文名:')) {
      englishName = text.replace(/英文名[：:]\s*/, '').trim();
    }
  });

  let ability = extractSection($, '角色能力');
  
  if (!ability) {
    const abilityHeader = $('h2:contains("能力"), h3:contains("能力")').first();
    if (abilityHeader.length > 0) {
      let p = abilityHeader.nextAll('p').first();
      if (p.length > 0) {
        ability = p.text().replace(/^“|”$/g, '').trim();
      }
    } else {
      const paragraphs = $('p').slice(0, 5);
      paragraphs.each(function() {
        const text = $(this).text().trim();
        const match = text.match(/“([^”]+)”/);
        if (match) {
          ability = match[1].trim();
          return false;
        }
      });
    }
  }

  const flavorText = extractSection($, '背景故事');
  const examples = extractExamples($);
  const howToRun = extractSection($, '运作方式');
  const tips = extractTips($);

  const id = englishName
    ? englishName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
    : null;

  const row = {
    id,
    en_name: englishName,
    name: cnName,
    ability: ability || null,
    flavor: flavorText || null,
    how_to_run: howToRun || null,
    examples: examples || null,
    tips: tips || null,
    url_param: urlParam
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

async function scrapeScriptPage(scriptUrlParam) {
  const url = `${BASE_URL}${scriptUrlParam}`;
  console.log(`\n📦 Scraping Script: ${decodeURIComponent(scriptUrlParam)}`);
  const html = await fetchWithCache(url, scriptUrlParam);
  const $ = cheerio.load(html);
  
  const characters = [];
  
  // They are usually in gallery boxes or lists with titles
  // We'll search for all links that might be characters
  // The structure often uses .gallerybox or similar.
  $('.gallerybox a, .mw-parser-output > ul > li > a, .mw-parser-output > p > a').each(function() {
    const title = $(this).attr('title');
    const href = $(this).attr('href');
    if (title && href && href.startsWith('/index.php?title=') && !title.includes('规则') && !title.includes('页面')) {
      const urlParam = href.split('title=')[1].split('&')[0];
      // filter out non-character pages roughly
      if (!['首页', '剧本', '暗流涌动', '黯月初升', '梦殒春宵', '旅行者', '传奇角色', '实验性角色', '分类'].includes(title)) {
        characters.push({ name: title, urlParam });
      }
    }
  });

  // Deduplicate
  const unique = [];
  const seen = new Set();
  for (const c of characters) {
    if (!seen.has(c.urlParam)) {
      seen.add(c.urlParam);
      unique.push(c);
    }
  }

  console.log(`  Found ${unique.length} potential characters.`);
  return unique;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const allData = [];
  const seenUrls = new Set();

  for (const script of SCRIPTS) {
    const chars = await scrapeScriptPage(script);
    
    for (const char of chars) {
      if (seenUrls.has(char.urlParam)) continue;
      seenUrls.add(char.urlParam);

      console.log(`  → Fetching: ${char.name} (${decodeURIComponent(char.urlParam)})`);
      const url = `${BASE_URL}${char.urlParam}`;
      try {
        const html = await fetchWithCache(url, char.urlParam);
        const data = extractCharacterData(html, char.name, char.urlParam);
        
        if (!data.en_name) {
          console.log(`    ⚠️ No English name found for ${char.name}`);
        }
        allData.push(data);
      } catch (err) {
        console.error(`    ❌ Error fetching ${char.name}: ${err.message}`);
      }
      await delay(200);
    }
  }

  fs.writeFileSync(OUTPUT_FILE, allData.map(d => JSON.stringify(d)).join('\n'), 'utf8');
  console.log(`\n✅ Wrote ${allData.length} Chinese characters to ${OUTPUT_FILE}`);
}

if (require.main === module) {
  main().catch(console.error);
}
