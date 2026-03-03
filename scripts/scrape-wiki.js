#!/usr/bin/env node
/**
 * Blood on the Clocktower Wiki Scraper
 * Scrapes character data from the official wiki using cheerio for proper HTML parsing
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// Character lists from wiki categories
const CHARACTERS = {
  townsfolk: [
    'Acrobat', 'Alchemist', 'Alsaahir', 'Amnesiac', 'Artist', 'Atheist',
    'Balloonist', 'Banshee', 'Bounty_Hunter', 'Cannibal', 'Chambermaid',
    'Chef', 'Choirboy', 'Clockmaker', 'Courtier', 'Cult_Leader', 'Dreamer',
    'Empath', 'Engineer', 'Exorcist', 'Farmer', 'Fisherman', 'Flowergirl',
    'Fool', 'Fortune_Teller', 'Gambler', 'General', 'Gossip', 'Grandmother',
    'High_Priestess', 'Huntsman', 'Innkeeper', 'Investigator', 'Juggler',
    'King', 'Knight', 'Librarian', 'Lycanthrope', 'Magician', 'Mathematician',
    'Mayor', 'Minstrel', 'Monk', 'Nightwatchman', 'Noble', 'Oracle',
    'Pacifist', 'Philosopher', 'Pixie', 'Poppy_Grower', 'Preacher', 'Princess',
    'Professor', 'Ravenkeeper', 'Sage', 'Sailor', 'Savant', 'Seamstress',
    'Shugenja', 'Slayer', 'Snake_Charmer', 'Soldier', 'Steward', 'Tea_Lady',
    'Town_Crier', 'Undertaker', 'Village_Idiot', 'Virgin', 'Washerwoman'
  ],
  outsiders: [
    'Barber', 'Butler', 'Damsel', 'Drunk', 'Golem', 'Goon', 'Hatter',
    'Heretic', 'Hermit', 'Klutz', 'Lunatic', 'Moonchild', 'Mutant', 'Ogre',
    'Plague_Doctor', 'Politician', 'Puzzlemaster', 'Recluse', 'Saint',
    'Snitch', 'Sweetheart', 'Tinker', 'Zealot'
  ],
  minions: [
    'Assassin', 'Baron', 'Boffin', 'Boomdandy', 'Cerenovus', 'Devil%27s_Advocate',
    'Evil_Twin', 'Fearmonger', 'Goblin', 'Godfather', 'Harpy', 'Marionette',
    'Mastermind', 'Mezepheles', 'Organ_Grinder', 'Pit-Hag', 'Poisoner',
    'Psychopath', 'Scarlet_Woman', 'Spy', 'Summoner', 'Vizier', 'Widow',
    'Witch', 'Wizard', 'Wraith', 'Xaan'
  ],
  demons: [
    'Al-Hadikhia', 'Fang_Gu', 'Imp', 'Kazali', 'Legion', 'Leviathan',
    'Lil%27_Monsta', 'Lleech', 'Lord_of_Typhon', 'No_Dashii', 'Ojo', 'Po',
    'Pukka', 'Riot', 'Shabaloth', 'Vigormortis', 'Vortox', 'Yaggababble', 'Zombuul'
  ]
};

const BASE_URL = 'https://wiki.bloodontheclocktower.com';
const OUTPUT_DIR = path.join(__dirname, '..', 'characters');

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
 * Parse wiki HTML to extract character data using cheerio
 */
function parseCharacterPage(html, characterId, type) {
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

  // Extract examples
  const examples = [];
  $('.example').each(function() {
    const exampleText = $(this).text().trim();
    if (exampleText) {
      examples.push(exampleText);
    }
  });

  // Extract tips from "Tips & Tricks" section
  const tips = { en: [] };
  const tipsSection = $('#Tips_\\&_Tricks, #Tips_&amp;_Tricks, #Tips_and_Tricks').next('ul');
  tipsSection.find('li').each(function() {
    const tipText = $(this).text().trim();
    if (tipText) {
      tips.en.push(tipText);
    }
  });

  // Extract how_to_run
  let howToRun = null;
  const howToRunPara = howToRunSection.find('p').first();
  if (howToRunPara.length > 0) {
    howToRun = howToRunPara.text().trim();
  }

  return {
    id: characterId.toLowerCase().replace(/%27/g, "'").replace(/_/g, '_'),
    type: TYPE_MAPPING[type] || type,
    name: { en: characterId.replace(/_/g, ' ').replace(/%27/g, "'") },
    ability: ability ? { en: ability } : null,
    flavor_text: flavorText ? { en: flavorText } : null,
    editions: editionsArray,
    first_night: firstNight,
    other_nights: otherNights,
    jinxes,
    examples: examples.length > 0 ? examples : undefined,
    tips: tips.en.length > 0 ? tips : undefined,
    how_to_run: howToRun ? { en: howToRun } : undefined,
    source_url: `${BASE_URL}/${characterId}`
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
    console.log(`\n📦 Scraping ${type} (${characters.length} characters)...`);

    for (const characterId of characters) {
      const url = `${BASE_URL}/${characterId}`;
      console.log(`  → ${characterId.replace(/_/g, ' ')}`);

      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();
        const data = parseCharacterPage(html, characterId, type);

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
  fs.writeFileSync(
    path.join(__dirname, '..', 'scrape-results.json'),
    JSON.stringify(results, null, 2)
  );

  return results;
}

// Run if called directly
if (require.main === module) {
  scrapeAllCharacters().catch(console.error);
}

module.exports = { scrapeAllCharacters, parseCharacterPage, validateCharacterData };
