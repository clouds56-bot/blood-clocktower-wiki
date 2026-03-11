const fs = require('fs');
const path = require('path');

const EN_TOKENS_PATH = path.join(__dirname, '../extracted/characters.github.en.jsonl');
const CN_TOKENS_PATH = path.join(__dirname, '../extracted/reminders.wiki.cn.jsonl');
const TRANSLATION_PATH = path.join(__dirname, '../config/reminders.translation.cn.txt');
const OUTPUT_REMINDERS_PATH = path.join(__dirname, '../config/reminders.json');

const CN_ALIAS_MAP = new Map([
  ['重获能力', '具有能力'],
  ['保留能力', '具有能力'],
  ['庇护', '保护'],
  ['保护', '不会死亡'],
  ['获得能力', '具有能力'],
  ['已猜测', '已被猜测']
]);

function normalizeTokenId(token) {
  return token
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function parseJsonl(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
}

function parseTranslationFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const map = new Map();
  
  content
    .split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .forEach(line => {
      const match = line.match(/^"([^"]+)"="([^"]+)"/);
      if (match) {
        map.set(match[1].toUpperCase(), match[2]);
      }
    });
  
  return map;
}

function splitChineseTokens(name) {
  return name
    .split('&')
    .map(token => token.trim())
    .filter(token => token.length > 0);
}

function applyCharacterCnOverrides(reminders, cnTokens) {
  const reminderByCharacterAndCanonicalCn = new Map();

  for (const reminder of reminders) {
    const canonicalCn = CN_ALIAS_MAP.get(reminder.name.cn) || reminder.name.cn;
    if (!canonicalCn) {
      continue;
    }
    const key = `${reminder.character_id}\t${canonicalCn}`;
    if (!reminderByCharacterAndCanonicalCn.has(key)) {
      reminderByCharacterAndCanonicalCn.set(key, reminder);
    }
  }

  let replaced = 0;
  for (const tokenEntry of cnTokens) {
    const characterId = tokenEntry.character_id;
    const rawName = tokenEntry.name || '';
    const cnParts = splitChineseTokens(rawName);

    for (const part of cnParts) {
      const canonicalPart = CN_ALIAS_MAP.get(part) || part;
      const key = `${characterId}\t${canonicalPart}`;
      const reminder = reminderByCharacterAndCanonicalCn.get(key);
      if (!reminder) {
        continue;
      }

      if (reminder.name.cn !== part) {
        reminder.name.cn = part;
        replaced += 1;
      }
    }
  }

  return replaced;
}

function buildEnglishTokenMap(enCharacters) {
  const map = new Map();
  
  for (const char of enCharacters) {
    const charId = char.id;
    const tokens = char.tokens || [];
    
    if (tokens.length > 0) {
      map.set(charId, tokens);
    }
  }
  
  return map;
}

function buildReminders(enTokenMap, translationMap) {
  const reminders = [];
  const seenIds = new Set();
  
  for (const [charId, enTokens] of enTokenMap) {
    for (let i = 0; i < enTokens.length; i++) {
      const enToken = enTokens[i];
      const cnToken = translationMap.get(enToken.toUpperCase()) || '';
      
      const tokenId = normalizeTokenId(enToken);
      const reminderId = `${charId}:${tokenId}`;
      
      if (seenIds.has(reminderId)) {
        continue;
      }
      seenIds.add(reminderId);
      
      reminders.push({
        id: reminderId,
        character_id: charId,
        name: {
          en: enToken,
          cn: cnToken
        }
      });
    }
  }
  
  reminders.sort((a, b) => {
    if (a.character_id !== b.character_id) {
      return a.character_id.localeCompare(b.character_id);
    }
    return a.id.localeCompare(b.id);
  });
  
  return reminders;
}

function buildCnTokenValidationRows(cnTokens, enTokenMap, reminders) {
  const reminderIdByCharacterAndCn = new Map();
  const remindersByCharacter = new Map();
  for (const reminder of reminders) {
      const canonicalCn = CN_ALIAS_MAP.get(reminder.name.cn) || reminder.name.cn;
      const key = `${reminder.character_id}\t${canonicalCn}`;
    if (!reminderIdByCharacterAndCn.has(key)) {
      reminderIdByCharacterAndCn.set(key, reminder.id);
    }

    if (!remindersByCharacter.has(reminder.character_id)) {
      remindersByCharacter.set(reminder.character_id, []);
    }
    remindersByCharacter.get(reminder.character_id).push(reminder);
  }

  const rows = [];

  for (const tokenEntry of cnTokens) {
    const characterId = tokenEntry.character_id;
    const rawName = tokenEntry.name || '';

    if (!enTokenMap.has(characterId)) {
      continue;
    }

    const cnTokenParts = splitChineseTokens(rawName);
    for (const name of cnTokenParts) {
      const canonicalName = CN_ALIAS_MAP.get(name) || name;
      const key = `${characterId}\t${canonicalName}`;
      const reminderId = reminderIdByCharacterAndCn.get(key) || '';
      const characterReminders = remindersByCharacter.get(characterId) || [];

      let reason = '';
      if (!reminderId) {
        const cnOptions = characterReminders.map(r => r.name.cn).filter(Boolean);
        const normalizedName = canonicalName.replace(/（[^）]*）/g, '').trim();

        if (normalizedName !== name) {
          reason = 'CN token contains annotation suffix; not exact match.';
        } else if (cnOptions.length === 0) {
          reason = 'Character has no generated reminders.';
        } else {
          reason = `No exact CN match on character. Available CN: ${cnOptions.join(', ')}`;
        }
      }

      rows.push({
        character_id: characterId,
        name,
        reminder_id: reminderId,
        reason
      });
    }
  }

  return rows;
}

function main() {
  console.log('Reading English tokens...');
  const enCharacters = parseJsonl(EN_TOKENS_PATH);
  console.log(`  Found ${enCharacters.length} characters`);

  console.log('Reading Chinese tokens...');
  const cnTokens = parseJsonl(CN_TOKENS_PATH);
  console.log(`  Found ${cnTokens.length} token entries`);
  
  console.log('Reading translation file...');
  const translationMap = parseTranslationFile(TRANSLATION_PATH);
  console.log(`  Found ${translationMap.size} translations`);
  
  console.log('Building token maps...');
  const enTokenMap = buildEnglishTokenMap(enCharacters);
  console.log(`  English: ${enTokenMap.size} characters with tokens`);
  
  console.log('Building reminders...');
  const reminders = buildReminders(enTokenMap, translationMap);
  const characterOverrideCount = applyCharacterCnOverrides(reminders, cnTokens);
  console.log(`  Generated ${reminders.length} reminder entries`);
  console.log(`  Character CN overrides: ${characterOverrideCount}`);
  
  const withCn = reminders.filter(r => r.name.cn).length;
  const withoutCn = reminders.filter(r => !r.name.cn).length;
  console.log(`  With Chinese: ${withCn}`);
  console.log(`  Without Chinese: ${withoutCn}`);
  
  if (withoutCn > 0) {
    console.log('\n  Tokens without Chinese translation:');
    reminders
      .filter(r => !r.name.cn)
      .forEach(r => console.log(`    "${r.name.en.toUpperCase()}"=""`));
  }

  console.log('\nCN token unmatched rows (non-CN-only characters):');
  const validationRows = buildCnTokenValidationRows(cnTokens, enTokenMap, reminders);
  const unmatchedRows = validationRows.filter(row => !row.reminder_id);
  for (const row of unmatchedRows) {
    console.log(`${row.character_id}\t${row.name}\t${row.reminder_id}\t${row.reason}`);
  }

  console.log(`\n  Validation rows: ${validationRows.length}`);
  console.log(`  Unmatched rows: ${unmatchedRows.length}`);

  console.log('\nWriting reminders.json...');
  const remindersOutput = {
    source: {
      en: 'github_botc_release',
      cn: 'manual_translation'
    },
    reminders: reminders
  };
  fs.writeFileSync(OUTPUT_REMINDERS_PATH, JSON.stringify(remindersOutput, null, 2));
  
  console.log('Done!');
  console.log(`  ${OUTPUT_REMINDERS_PATH}`);
}

main();
