#!/usr/bin/env node
/**
 * Blood on the Clocktower Wiki Scraper
 * Scrapes character data from the official wiki
 */

const fs = require('fs');
const path = require('path');

// Character lists from wiki categories
const CHARACTERS = {
  townsfolk: [
    'Acrobat', 'Alchemist', 'Alsaahir', 'Amnesiac', 'Artist', 'Atheist',
    'Balloonist', 'Banshee', 'Bounty Hunter', 'Cannibal', 'Chambermaid',
    'Chef', 'Choirboy', 'Clockmaker', 'Courtier', 'Cult Leader', 'Dreamer',
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

// Rate limiting
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Parse wiki HTML to extract character data
 * This is a simplified parser - in production, use cheerio or similar
 */
function parseCharacterPage(html, characterId, type) {
  // Extract ability (in "Summary" section)
  const abilityMatch = html.match(/## Summary\s*\n\s*"([^"]+)"/);
  const ability = abilityMatch ? abilityMatch[1] : null;
  
  // Extract flavor text
  const flavorMatch = html.match(/"([^"]{50,})"/);
  const flavorText = flavorMatch ? flavorMatch[1] : null;
  
  // Extract editions
  const editions = [];
  if (html.includes('Trouble_Brewing')) editions.push('trouble_brewing');
  if (html.includes('Bad_Moon_Rising')) editions.push('bad_moon_rising');
  if (html.includes('Sects_&_Violets') || html.includes('Sects_%26_Violets')) editions.push('sects_violets');
  
  // Determine first_night / other_nights
  const firstNight = html.includes('first night') || html.includes('During the first night');
  const otherNights = html.includes('Each night') || html.includes('Each night*');
  
  // Extract jinxes
  const jinxes = [];
  const jinxSection = html.match(/## .*Jinxes[\s\S]*?(?=##|$)/);
  if (jinxSection) {
    const jinxMatches = jinxSection[0].matchAll(/\[([^\]]+)\]\([^)]*\)\s*\n\s*([^\n[]+)/g);
    for (const match of jinxMatches) {
      jinxes.push({
        character: match[1].replace(/\s+/g, '_').toLowerCase(),
        effect: match[2].trim()
      });
    }
  }
  
  return {
    id: characterId.toLowerCase().replace(/%27/g, "'").replace(/_/g, '_'),
    type,
    name: { en: characterId.replace(/_/g, ' ').replace(/%27/g, "'") },
    ability: ability ? { en: ability } : null,
    flavor_text: flavorText ? { en: flavorText } : null,
    editions,
    first_night: firstNight,
    other_nights: otherNights,
    jinxes,
    source_url: `${BASE_URL}/${characterId}`
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
      console.log(`  → ${characterId}`);
      
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const html = await response.text();
        const data = parseCharacterPage(html, characterId, type);
        
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

module.exports = { scrapeAllCharacters, parseCharacterPage };
