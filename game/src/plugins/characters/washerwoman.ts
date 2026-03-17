import type { CharacterPlugin } from '../contracts.js';
import { build_first_night_pair_info_hooks } from './tb-info-utils.js';

const WASHERWOMAN_TOWNSFOLK = [
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
];

const washerwoman_pair_info_hooks = build_first_night_pair_info_hooks({
  role_id: 'washerwoman',
  target_type: 'townsfolk',
  note_prefix: 'washerwoman_info',
  misinformation_character_ids: WASHERWOMAN_TOWNSFOLK,
  marker_kinds: {
    shown: 'washerwoman:townsfolk',
    wrong: 'washerwoman:wrong'
  }
});

export const washerwoman_plugin: CharacterPlugin = {
  metadata: {
    id: 'washerwoman',
    name: 'Washerwoman',
    type: 'townsfolk',
    alignment_at_start: 'good',
    timing_category: 'first_night',
    is_once_per_game: false,
    target_constraints: {
      min_targets: 0,
      max_targets: 0,
      allow_self: false,
      require_alive: true,
      allow_travellers: false
    },
    flags: {
      can_function_while_dead: false,
      can_trigger_on_death: false,
      may_cause_drunkenness: false,
      may_cause_poisoning: false,
      may_change_alignment: false,
      may_change_character: false,
      may_register_as_other: false
    }
  },
  hooks: {
    on_night_wake: washerwoman_pair_info_hooks.on_night_wake,
    on_prompt_resolved: washerwoman_pair_info_hooks.on_prompt_resolved
  }
};
