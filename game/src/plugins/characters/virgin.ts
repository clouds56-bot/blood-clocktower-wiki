import type { CharacterPlugin } from '../contracts.js';

export const virgin_plugin: CharacterPlugin = {
  metadata: {
    id: 'virgin',
    name: 'Virgin',
    type: 'townsfolk',
    alignment_at_start: 'good',
    timing_category: 'day',
    is_once_per_game: true,
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
  hooks: {}
};
