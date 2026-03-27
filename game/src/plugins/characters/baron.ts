import type { CharacterPlugin } from '../contracts.js';

export const baron_plugin: CharacterPlugin = {
  metadata: {
    id: 'baron',
    name: 'Baron',
    type: 'minion',
    alignment_at_start: 'evil',
    abilities: [
      {
        ability_id: 'baron.setup_outsider_shift',
        character_id: 'baron',
        summary: 'At setup, add 2 Outsiders and remove 2 Townsfolk.',
        category: 'passive',
        activation: ['game_setup']
      }
    ],
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
