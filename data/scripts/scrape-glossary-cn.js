#!/usr/bin/env node
/**
 * Blood on the Clocktower Wiki Glossary Scraper (Chinese)
 * Scrapes glossary terms from the Chinese wiki and outputs to a JSONL file.
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const BASE_URL = 'https://clocktower-wiki.gstonegames.com';
const CACHE_DIR = path.join(__dirname, '..', '.cache', 'html');
const OUTPUT_DIR = path.join(__dirname, '..', 'extracted');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'glossary.wiki.cn.jsonl');

const GLOSSARY_URL = `${BASE_URL}/index.php?title=%E6%9C%AF%E8%AF%AD%E6%B1%87%E6%80%BB`;

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

function parseGlossaryPage(html) {
  const $ = cheerio.load(html);
  const glossaryTerms = [];
  
  const content = $('.mw-parser-output');
  content.find('ul > li').each(function() {
    const $li = $(this);
    const text = $li.text().trim();
    
    if (!text) return;
    
    const boldTag = $li.find('b').first();
    if (boldTag.length > 0) {
      const name = boldTag.text().trim().replace(/[：:]\s*$/, '');
      const fullText = $li.text().trim();
      const descStart = fullText.indexOf(name) + name.length;
      let description = fullText.substring(descStart).trim();
      description = description.replace(/^：\s*/, '');
      
      const linkTag = boldTag.find('a').first();
      let detailUrl = null;
      if (linkTag.length > 0) {
        const href = linkTag.attr('href');
        if (href && !href.startsWith('javascript:')) {
          detailUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
        }
      }
      
      if (name && description) {
        glossaryTerms.push({
          name: name,
          description: description,
          detail_url: detailUrl
        });
      }
    }
  });
  
  return glossaryTerms;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  console.log(`\n📦 Scraping Chinese Glossary: ${GLOSSARY_URL}`);
  
  try {
    const html = await fetchWithCache(GLOSSARY_URL, 'glossary_cn');
    const glossaryTerms = parseGlossaryPage(html);
    
    fs.writeFileSync(OUTPUT_FILE, glossaryTerms.map(d => JSON.stringify(d)).join('\n'), 'utf8');
    console.log(`\n✅ Wrote ${glossaryTerms.length} glossary terms to ${OUTPUT_FILE}`);
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
