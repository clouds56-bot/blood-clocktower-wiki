import type { PlayerCharacterType } from './types.js';

const TOWNSFOLK_IDS: ReadonlySet<string> = new Set([
  'chef',
  'empath',
  'fortune_teller',
  'investigator',
  'librarian',
  'mayor',
  'monk',
  'ravenkeeper',
  'slayer',
  'soldier',
  'undertaker',
  'virgin',
  'washerwoman'
]);

const OUTSIDER_IDS: ReadonlySet<string> = new Set(['butler', 'drunk', 'recluse', 'saint']);

const MINION_IDS: ReadonlySet<string> = new Set(['baron', 'poisoner', 'scarlet_woman', 'spy']);

const DEMON_IDS: ReadonlySet<string> = new Set(['imp']);

export function infer_character_type_from_id(character_id: string): PlayerCharacterType | null {
  if (TOWNSFOLK_IDS.has(character_id)) {
    return 'townsfolk';
  }
  if (OUTSIDER_IDS.has(character_id)) {
    return 'outsider';
  }
  if (MINION_IDS.has(character_id)) {
    return 'minion';
  }
  if (DEMON_IDS.has(character_id)) {
    return 'demon';
  }
  return null;
}
