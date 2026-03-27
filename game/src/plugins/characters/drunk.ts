import type { CharacterPlugin } from '../contracts.js';

export const drunk_plugin: CharacterPlugin = {
  metadata: {
    id: 'drunk',
    name: 'Drunk',
    type: 'outsider',
    alignment_at_start: 'good',
    abilities: [
      {
        ability_id: 'drunk.perceived_role_substitution',
        character_id: 'drunk',
        summary: 'At setup, Drunk receives a perceived Townsfolk role identity.',
        category: 'registration',
        activation: ['game_setup'],
        reminders: ['drunk:is_the_drunk']
      },
      {
        ability_id: 'drunk.persistent_registration_mask',
        character_id: 'drunk',
        summary: 'Drunk remains an Outsider while role-facing info uses perceived identity.',
        category: 'registration',
        activation: ['passive']
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
      may_register_as_other: true
    }
  },
  hooks: {}
};
