import type { CharacterPlugin } from '../contracts.js';
import { build_first_night_pair_info_hooks } from './tb-info-utils.js';

const LIBRARIAN_OUTSIDERS = ['butler', 'drunk', 'recluse', 'saint'];

const librarian_pair_info_hooks = build_first_night_pair_info_hooks({
  role_id: 'librarian',
  target_type: 'outsider',
  note_prefix: 'librarian_info',
  misinformation_character_ids: LIBRARIAN_OUTSIDERS,
  marker_kinds: {
    shown: 'librarian:outsider',
    wrong: 'librarian:wrong'
  }
});

export const librarian_plugin: CharacterPlugin = {
  metadata: {
    id: 'librarian',
    name: 'Librarian',
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
    on_night_wake: librarian_pair_info_hooks.on_night_wake,
    on_prompt_resolved: librarian_pair_info_hooks.on_prompt_resolved
  }
};
