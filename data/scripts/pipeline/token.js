#!/usr/bin/env node
/**
 * Blood on the Clocktower Wiki Scraper (Token Pipeline)
 * Extracts image token URLs from English character pages.
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const BASE_URL = 'https://wiki.bloodontheclocktower.com';
const INPUT_FILE = path.join(__dirname, '..', '..', 'characters.wiki.en.jsonl');
const OUTPUT_FILE = path.join(__dirname, '..', '..', 'characters.token.jsonl');
const CACHE_DIR = path.join(__dirname, '..', '..', '.cache', 'html');

function extractTokenUrl(html) {
  const $ = cheerio.load(html);
  
  let tokenUrl = null;
  // Try to find the image that's most likely the token
  // Usually it's in a link with class="image" and alt starting with Icon or containing the name
  $('a.image img').each(function() {
    const src = $(this).attr('src');
    if (src && (src.includes('Icon_') || src.includes('Icon ') || src.toLowerCase().includes('icon'))) {
      tokenUrl = src;
      return false; // break
    }
  });

  if (!tokenUrl) {
    // Fallback: get the first image in the content area that has decent size
    $('#mw-content-text img').each(function() {
      const src = $(this).attr('src');
      const width = parseInt($(this).attr('width') || '0', 10);
      if (src && width >= 100 && src.includes('/images/')) {
        tokenUrl = src;
        return false;
      }
    });
  }

  if (tokenUrl && tokenUrl.startsWith('/')) {
    tokenUrl = `${BASE_URL}${tokenUrl}`;
  }

  return tokenUrl;
}

function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error('Error: English JSONL not found. Run pipeline/en.js first.');
    process.exit(1);
  }

  const enData = fs.readFileSync(INPUT_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));

  const allTokens = [];

  for (const char of enData) {
    const urlParam = char.source_url.split('/').pop();
    // Reconstruct cache path safely
    const cacheFile = path.join(CACHE_DIR, `${urlParam.replace(/%27/g, "'").replace(/\//g, '_')}.html`);
    
    if (fs.existsSync(cacheFile)) {
      const html = fs.readFileSync(cacheFile, 'utf8');
      const tokenUrl = extractTokenUrl(html);
      
      allTokens.push({
        id: char.id,
        english_name: char.english_name,
        token_url: tokenUrl
      });
      console.log(`  Tokens: ${char.english_name} -> ${tokenUrl || 'NOT FOUND'}`);
    } else {
      console.error(`  Warning: Cache missing for ${char.english_name} (${urlParam})`);
    }
  }

  fs.writeFileSync(OUTPUT_FILE, allTokens.map(d => JSON.stringify(d)).join('\n'), 'utf8');
  console.log(`\n✅ Wrote ${allTokens.length} token urls to ${OUTPUT_FILE}`);
}

main();
