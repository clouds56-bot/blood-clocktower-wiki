#!/usr/bin/env node
/**
 * Download character token images from the wiki
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const WIKI_BASE = 'https://wiki.bloodontheclocktower.com';
const CHARACTERS_DIR = path.join(__dirname, '..', 'characters');
const TOKENS_DIR = path.join(__dirname, '..', 'assets', 'tokens');
const CACHE_DIR = path.join(__dirname, '..', '.cache', 'html');

// Rate limiting
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch HTML with caching
 */
async function fetchWithCache(url, characterId) {
  const cacheFile = path.join(CACHE_DIR, `${characterId}.html`);
  
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

/**
 * Get all character JSON files
 */
function getCharacterFiles() {
  const types = ['townsfolk', 'outsiders', 'minions', 'demons'];
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
function extractImageUrl(html) {
  const $ = cheerio.load(html);
  const img = $('.infobox img, #character-details img').first();

  if (!img.length) return null;

  const src = img.attr('src');
  if (!src) return null;

  // Convert relative URL to absolute
  if (src.startsWith('/')) {
    return `${WIKI_BASE}${src}`;
  }

  return src;
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
function updateCharacterJson(jsonPath, imagePath) {
  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    data.image = path.relative(path.join(__dirname, '..'), imagePath).replace(/\\/g, '/');
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
    const wikiUrl = data.source_url;

    console.log(`  → ${characterId}`);

    // Skip if already has image
    if (data.image) {
      console.log(`    ⏭️  Skipped (already has image)`);
      results.skipped.push(characterId);
      await delay(100);
      continue;
    }

    // Fetch wiki page to find image URL
    try {
      const html = await fetchWithCache(wikiUrl, characterId);
      const imageUrl = extractImageUrl(html);

      if (!imageUrl) {
        console.log(`    ⚠️  No image found`);
        results.failed.push({ characterId, error: 'No image found' });
        await delay(300);
        continue;
      }

      // Download image
      const outputPath = path.join(TOKENS_DIR, `${characterId}.png`);
      console.log(`    📥 Downloading: ${imageUrl}`);
      const success = await downloadImage(imageUrl, outputPath);

      if (success) {
        // Update JSON with image path
        const jsonUpdated = updateCharacterJson(jsonPath, outputPath);
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

  return results;
}

// Run if called directly
if (require.main === module) {
  downloadAllImages().catch(console.error);
}

module.exports = { downloadAllImages, extractImageUrl };
