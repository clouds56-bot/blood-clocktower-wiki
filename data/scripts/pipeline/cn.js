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
const OUTPUT_FILE = path.join(__dirname, '..', '..', 'characters.wiki.cn.jsonl');

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

  // Extract Ability (Usually bold text followed by the ability or in summary)
  let ability = null;
  // Let's grab the text of the first paragraph after the image/intro or look for specific markers
  // On Chinese wiki, ability is often in a blockquote or directly in text
  // I will reuse the existing logic from scrape-chinese-wiki.js
  
  $('p').each(function() {
    const text = $(this).text().trim();
    // Look for ability text enclosed in quotes “ ”
    const match = text.match(/“([^”]+)”/);
    if (match && !ability && !text.includes('英文名')) {
      // Very naive, let's just grab the first quoted text that looks like an ability
      // We will refine if needed, or fallback
    }
  });

  // A more robust way to get ability from Chinese wiki:
  // Usually the ability is under "能力" heading or just quoted in the intro
  const abilityHeader = $('h2:contains("能力"), h3:contains("能力")').first();
  if (abilityHeader.length > 0) {
    let p = abilityHeader.nextAll('p').first();
    if (p.length > 0) {
      ability = p.text().replace(/^“|”$/g, '').trim();
    }
  } else {
    // try finding quotes in the first few paragraphs
    const paragraphs = $('p').slice(0, 5);
    paragraphs.each(function() {
      const text = $(this).text().trim();
      const match = text.match(/“([^”]+)”/);
      if (match) {
        ability = match[1].trim();
        return false; // break
      }
    });
  }

  return {
    chinese_name: cnName,
    english_name: englishName,
    ability: ability,
    urlParam: urlParam
  };
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
        
        if (data.english_name) {
          allData.push(data);
        } else {
          console.log(`    ⚠️ No English name found for ${char.name}`);
        }
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
