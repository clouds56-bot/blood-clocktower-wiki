import type { CharacterPlugin } from '../contracts.js';

export const slayer_plugin: CharacterPlugin = {
  metadata: {
    id: 'slayer',
    name: 'Slayer',
    type: 'townsfolk',
    alignment_at_start: 'good',
    timing_category: 'day',
    is_once_per_game: true,
    target_constraints: {
      min_targets: 1,
      max_targets: 1,
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
