#!/usr/bin/env node
/**
 * Blood on the Clocktower Wiki Glossary Scraper (English)
 * Scrapes glossary terms from the official wiki and outputs to a JSONL file.
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const BASE_URL = 'https://wiki.bloodontheclocktower.com';
const CACHE_DIR = path.join(__dirname, '..', '.cache', 'html');
const OUTPUT_DIR = path.join(__dirname, '..', 'extracted');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'glossary.wiki.en.jsonl');

const GLOSSARY_URL = `${BASE_URL}/Glossary`;

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
  content.find('p').each(function() {
    const $p = $(this);
    const text = $p.text().trim();
    
    if (!text) return;
    
    const boldMatch = text.match(/^\*\*([^:]+):\*\*\s*(.*)$/);
    if (boldMatch) {
      const name = boldMatch[1].trim();
      const description = boldMatch[2].trim();
      
      if (name && description) {
        glossaryTerms.push({
          name: name,
          description: description,
          detail_url: null
        });
      }
    } else {
      const boldTag = $p.find('b').first();
      if (boldTag.length > 0) {
        const name = boldTag.text().trim().replace(/:$/, '');
        const fullText = $p.text().trim();
        const descStart = fullText.indexOf(name) + name.length;
        let description = fullText.substring(descStart).trim();
        description = description.replace(/^:\s*/, '');
        
        if (name && description) {
          glossaryTerms.push({
            name: name,
            description: description,
            detail_url: null
          });
        }
      }
    }
  });
  
  return glossaryTerms;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  console.log(`\n📦 Scraping English Glossary: ${GLOSSARY_URL}`);
  
  try {
    const html = await fetchWithCache(GLOSSARY_URL, 'Glossary');
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
