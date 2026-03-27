import type { CharacterPlugin } from '../contracts.js';

export const soldier_plugin: CharacterPlugin = {
  metadata: {
    id: 'soldier',
    name: 'Soldier',
    type: 'townsfolk',
    alignment_at_start: 'good',
    abilities: [
      {
        ability_id: 'soldier.demon_kill_immunity',
        character_id: 'soldier',
        summary: 'While functional, Soldier is safe from Demon attacks.',
        category: 'passive',
        activation: ['passive']
      }
    ],
    timing_category: 'passive',
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
  hooks: {}
};
