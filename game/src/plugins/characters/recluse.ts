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
  hooks: {}
};
