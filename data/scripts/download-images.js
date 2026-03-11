#!/usr/bin/env node
/**
 * Download character token images from the wiki
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const WIKI_BASE = 'https://wiki.bloodontheclocktower.com';
const CN_WIKI_BASE = 'https://clocktower-wiki.gstonegames.com/index.php?title=';
const CHARACTERS_DIR = path.join(__dirname, '..', 'characters');
const TOKENS_DIR = path.join(__dirname, '..', 'assets', 'tokens');
const CACHE_DIR = path.join(__dirname, '..', '.cache', 'html');

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
  const response = await fetch(url);
  const html = await response.text();
  
  // Save to cache
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, html, 'utf8');
  
  return html;
}

function pageSlugFromName(name) {
  if (!name || typeof name !== 'string') return null;
  return name.trim().replace(/\s+/g, '_').replace(/'/g, '%27');
}

function getCandidateWikiUrls(data) {
  const urls = [];
  if (typeof data.source_url === 'string' && data.source_url.startsWith(WIKI_BASE)) {
    urls.push(data.source_url);
  }

  const enName = data && data.name && typeof data.name === 'object' ? data.name.en : null;
  const slugFromName = pageSlugFromName(enName);
  if (slugFromName) {
    urls.push(`${WIKI_BASE}/${slugFromName}`);
  }

  // For CN-only characters, use url_param to construct Chinese wiki URL
  if (data.url_param) {
    urls.push(`${WIKI_BASE}/${data.url_param}`);
    urls.push(`${CN_WIKI_BASE}${data.url_param}`);
  }

  const deduped = [];
  const seen = new Set();
  for (const url of urls) {
    if (!seen.has(url)) {
      seen.add(url);
      deduped.push(url);
    }
  }
  return deduped;
}

/**
 * Get all character JSON files
 */
function getCharacterFiles() {
  const types = ['townsfolk', 'outsider', 'minion', 'demon', 'traveller', 'fabled', 'loric'];
  const files = [];

  for (const type of types) {
    const typeDir = path.join(CHARACTERS_DIR, type);
    if (!fs.existsSync(typeDir)) continue;

    const typeFiles = fs.readdirSync(typeDir)
      .filter(f => f.endsWith('.json'))
      .map(f => path.join(typeDir, f));

    files.push(...typeFiles);
  }

  return files;
}

/**
 * Extract image URL from character wiki page
 */
function extractImageUrl(html, pageUrl) {
  const $ = cheerio.load(html);
  const img = $('.infobox img, #character-details img, #mw-content-text img, .mw-parser-output img').first();

  if (!img.length) return null;

  const srcset = img.attr('srcset');
  const dataSrc = img.attr('data-src');
  const src = img.attr('src');
  const rawUrl = (srcset ? srcset.split(',').pop().trim().split(' ')[0] : null) || dataSrc || src;
  if (!rawUrl) return null;

  let imageUrl = rawUrl;
  if (rawUrl.startsWith('/')) {
    const origin = new URL(pageUrl).origin;
    imageUrl = `${origin}${rawUrl}`;
  }

  // Convert thumbnail URL to original full-size image URL.
  // e.g. /images/thumb/b/b7/Banxian.png/200px-Banxian.png -> /images/b/b7/Banxian.png
  imageUrl = imageUrl.replace(/\/images\/thumb\/(.+?)\/\d+px-[^/]+$/i, '/images/$1');

  return imageUrl;
}

/**
 * Download and save image
 */
async function downloadImage(url, outputPath) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const imgBuffer = Buffer.from(arrayBuffer);

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, imgBuffer);

    return true;
  } catch (error) {
    console.error(`    ❌ Download failed: ${error.message}`);
    return false;
  }
}

/**
 * Update character JSON with image path
 */
function updateCharacterJson(jsonPath, imagePath, imageUrl) {
  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    data.image = path.relative(path.join(__dirname, '..'), imagePath).replace(/\\/g, '/');
    if (imageUrl) {
      data.image_url = imageUrl;
    }
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`    ❌ JSON update failed: ${error.message}`);
    return false;
  }
}

/**
 * Main function
 */
async function downloadAllImages() {
  console.log('🖼️  Blood on the Clocktower - Token Image Downloader\n');

  const characterFiles = getCharacterFiles();
  console.log(`Found ${characterFiles.length} character files\n`);

  const results = {
    downloaded: [],
    skipped: [],
    failed: []
  };

  for (const jsonPath of characterFiles) {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const characterId = data.id;
    const candidateWikiUrls = getCandidateWikiUrls(data);

    console.log(`  → ${characterId}`);

    // Skip if already has image
    if (data.image) {
      console.log(`    ⏭️  Skipped (already has image)`);
      results.skipped.push(characterId);
      await delay(100);
      continue;
    }

    // If token file already exists on disk, skip downloading it
    const outputPath = path.join(TOKENS_DIR, `${characterId}.png`);
    if (fs.existsSync(outputPath)) {
      console.log(`    ⏭️  Skipped (file exists)`);
      // If JSON missing an image path, set it to the existing file
      if (!data.image) {
        const jsonUpdated = updateCharacterJson(jsonPath, outputPath, null);
        if (jsonUpdated) {
          console.log(`    ✅ JSON updated with existing image path`);
        } else {
          console.log(`    ⚠️  Failed to update JSON with existing image`);
          results.failed.push({ characterId, error: 'JSON update failed' });
        }
      }
      results.skipped.push(characterId);
      await delay(100);
      continue;
    }

    // Fetch wiki page to find image URL
    try {
      let imageUrl = null;
      for (const wikiUrl of candidateWikiUrls) {
        const urlParam = wikiUrl.split('/').pop();
        const html = await fetchWithCache(wikiUrl, urlParam);
        imageUrl = extractImageUrl(html, wikiUrl);
        if (imageUrl) break;
      }

      if (!imageUrl) {
        console.log(`    ⚠️  No image found`);
        results.failed.push({ characterId, error: 'No image found' });
        await delay(300);
        continue;
      }

      console.log(`    📥 Downloading: ${imageUrl}`);
      const success = await downloadImage(imageUrl, outputPath);

      if (success) {
        // Update JSON with image path
        const jsonUpdated = updateCharacterJson(jsonPath, outputPath, imageUrl);
        if (jsonUpdated) {
          console.log(`    ✅ Updated: ${data.image}`);
          results.downloaded.push(characterId);
        } else {
          results.failed.push({ characterId, error: 'JSON update failed' });
        }
      } else {
        results.failed.push({ characterId, error: 'Download failed' });
      }
    } catch (error) {
      console.error(`    ❌ Failed: ${error.message}`);
      results.failed.push({ characterId, error: error.message });
    }

    // Rate limiting - 300ms between requests
    await delay(300);
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Download Summary:');
  console.log(`  ✅ Downloaded: ${results.downloaded.length}`);
  console.log(`  ⏭️  Skipped: ${results.skipped.length}`);
  console.log(`  ❌ Failed: ${results.failed.length}`);

  if (results.failed.length > 0) {
    console.log('\nFailed characters:');
    results.failed.forEach(f => console.log(`  - ${f.characterId}: ${f.error}`));
  }

  // Save summary to data/results
  fs.mkdirSync(path.join(__dirname, '..', 'results'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'results', 'download-images-results.json'), JSON.stringify(results, null, 2));

  return results;
}

// Run if called directly
if (require.main === module) {
  downloadAllImages().catch(console.error);
}

module.exports = { downloadAllImages, extractImageUrl };
