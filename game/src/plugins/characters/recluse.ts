import type { CharacterPlugin } from '../contracts.js';

export const recluse_plugin: CharacterPlugin = {
  metadata: {
    id: 'recluse',
    name: 'Recluse',
    type: 'outsider',
    alignment_at_start: 'good',
    timing_category: 'passive',
    is_once_per_game: false,
    target_constraints: {
      min_targets: 0,
      max_targets: 0,
      allow_self: false,
      require_alive: false,
      allow_travellers: false
    },
    flags: {
      can_function_while_dead: true,
      can_trigger_on_death: false,
      may_cause_drunkenness: false,
      may_cause_poisoning: false,
      may_change_alignment: false,
      may_change_character: false,
      may_register_as_other: true
    }
  },
  hooks: {
    on_registration_query: (context) => {
      const subject = context.state.players_by_id[context.subject_player_id];
      if (!subject || subject.true_character_id !== 'recluse') {
        return null;
      }

      if (!can_apply_registration_provider(subject)) {
        return null;
      }

      if (!should_use_alternate_registration(context.query_id)) {
        return null;
      }

      const index = stable_hash(`${context.query_id}:recluse`) % RECLUSE_REGISTER_CHARACTER_IDS.length;
      const resolved_character_id = RECLUSE_REGISTER_CHARACTER_IDS[index] ?? null;
      const resolved_character_type = stable_hash(`${context.query_id}:type`) % 2 === 0
        ? 'minion'
        : 'demon';

      return {
        resolved_alignment: 'evil',
        resolved_character_id,
        resolved_character_type
      };
    }
  }
};

function can_apply_registration_provider(subject: {
  true_character_id: string | null;
  alive: boolean;
  drunk: boolean;
  poisoned: boolean;
}): boolean {
  if (subject.true_character_id !== 'recluse') {
    return false;
  }
  if (!subject.alive) {
    return true;
  }
  return !subject.drunk && !subject.poisoned;
}

function should_use_alternate_registration(query_id: string): boolean {
  return stable_hash(query_id) % 2 === 0;
}

function stable_hash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i) ?? 0;
    hash = (hash * 31 + code) >>> 0;
  }
  return hash;
}

const RECLUSE_REGISTER_CHARACTER_IDS: ReadonlyArray<string> = [
  'baron',
  'poisoner',
  'scarlet_woman',
  'spy',
  'imp'
];
