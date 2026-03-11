#!/usr/bin/env node
/**
 * Blood on the Clocktower Wiki Scraper (Token Pipeline)
 * Extracts image token URLs from English character pages.
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const BASE_URL = 'https://wiki.bloodontheclocktower.com';
const CN_BASE_URL = 'https://clocktower-wiki.gstonegames.com/index.php?title=';
const EXTRACTED_DIR = path.join(__dirname, '..', '..', 'extracted');
const INPUT_FILE = path.join(EXTRACTED_DIR, 'characters.wiki.en.jsonl');
const OUTPUT_FILE = path.join(EXTRACTED_DIR, 'characters.token.jsonl');
const CACHE_DIR = path.join(__dirname, '..', '..', '.cache', 'html');
const TOKEN_ASSETS_DIR = path.join(__dirname, '..', '..', 'assets', 'tokens');

const SPECIAL_TOKEN_PATTERNS = {
  dusk: ['dusk.png'],
  minioninfo: ['mi.png', 'minioninfo.png'],
  demoninfo: ['di.png', 'demoninfo.png'],
  dawn: ['dawn.png']
};

function toAbsoluteUrl(url, pageUrl) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) {
    return `${new URL(pageUrl).origin}${url}`;
  }
  return new URL(url, pageUrl).toString();
}

function toOriginalMediaWikiImageUrl(url) {
  if (!url) return null;
  return url.replace(/\/images\/thumb\/(.+?)\/\d+px-[^/]+$/i, '/images/$1');
}

async function downloadImage(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} downloading ${url}`);
  }

  const data = Buffer.from(await response.arrayBuffer());
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, data);
}

async function fetchSpecialTokenImageUrls() {
  const pageUrl = `${CN_BASE_URL}${encodeURIComponent('暗流涌动')}`;
  const response = await fetch(pageUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} when fetching ${pageUrl}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const urlsById = {};

  $('#mw-content-text img').each(function() {
    const src = $(this).attr('src') || '';
    const dataSrc = $(this).attr('data-src') || '';
    const srcset = $(this).attr('srcset') || '';
    const candidates = [src, dataSrc]
      .concat(srcset ? srcset.split(',').map(part => part.trim().split(' ')[0]) : [])
      .filter(Boolean);

    for (const candidate of candidates) {
      const abs = toAbsoluteUrl(candidate, pageUrl);
      const original = toOriginalMediaWikiImageUrl(abs);
      const lower = (original || '').toLowerCase();

      for (const [id, patterns] of Object.entries(SPECIAL_TOKEN_PATTERNS)) {
        if (urlsById[id]) continue;
        if (patterns.some(pattern => lower.includes(`/${pattern}`))) {
          urlsById[id] = original;
        }
      }
    }
  });

  return urlsById;
}

async function downloadSpecialTokenImages() {
  console.log('\n📦 Downloading special token images...');
  const urlsById = await fetchSpecialTokenImageUrls();

  let downloaded = 0;
  for (const id of Object.keys(SPECIAL_TOKEN_PATTERNS)) {
    const outputPath = path.join(TOKEN_ASSETS_DIR, `${id}.png`);
    if (fs.existsSync(outputPath)) {
      console.log(`  ✓ ${id}.png already exists`);
      continue;
    }

    const url = urlsById[id];
    if (!url) {
      console.warn(`  ⚠️ Could not locate image URL for ${id}`);
      continue;
    }

    await downloadImage(url, outputPath);
    downloaded += 1;
    console.log(`  ↓ ${id}.png`);
  }

  console.log(`✅ Downloaded ${downloaded} special token images`);
}

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

async function main() {
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
        en_name: char.name,
        name: char.name,
        token_url: tokenUrl
      });
      console.log(`  Token: ${char.name} -> ${tokenUrl || 'NOT FOUND'}`);
    } else {
      console.error(`  Warning: Cache missing for ${char.name} (${urlParam})`);
    }
  }

  const payload = allTokens.map(d => JSON.stringify(d)).join('\n');
  fs.writeFileSync(OUTPUT_FILE, payload, 'utf8');
  console.log(`\n✅ Wrote ${allTokens.length} token urls to ${OUTPUT_FILE}`);

  try {
    await downloadSpecialTokenImages();
  } catch (error) {
    console.warn(`⚠️ Failed to download special token images: ${error.message}`);
  }
}

main().catch(error => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
