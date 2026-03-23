import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type CharacterPluginMetadata,
  validate_plugin_metadata
} from '../../src/plugins/contracts.js';

test('validate_plugin_metadata is defensive for malformed nested fields', () => {
  const malformed = {
    id: 'imp',
    name: 'Imp',
    type: 'demon',
    alignment_at_start: 'evil',
    timing_category: 'each_night',
    is_once_per_game: false,
    target_constraints: null,
    flags: null
  } as unknown as CharacterPluginMetadata;

  assert.doesNotThrow(() => validate_plugin_metadata(malformed));
  const issues = validate_plugin_metadata(malformed);
  const issueCodes = new Set(issues.map((issue) => issue.code));
  assert.equal(issueCodes.has('invalid_target_constraints'), true);
});

test('validate_plugin_metadata validates flag field types', () => {
  const malformed = {
    id: 'imp',
    name: 'Imp',
    type: 'demon',
    alignment_at_start: 'evil',
    timing_category: 'each_night',
    is_once_per_game: false,
    target_constraints: {
      min_targets: 1,
      max_targets: 1,
      allow_self: false,
      require_alive: true,
      allow_travellers: false
    },
    flags: {
      can_function_while_dead: false,
      can_trigger_on_death: 'no',
      may_cause_drunkenness: false,
      may_cause_poisoning: false,
      may_change_alignment: false,
      may_change_character: false,
      may_register_as_other: false
    }
  } as unknown as CharacterPluginMetadata;

  const issues = validate_plugin_metadata(malformed);
  const issueCodes = new Set(issues.map((issue) => issue.code));
  assert.equal(issueCodes.has('invalid_plugin_flag_type'), true);
});

test('validate_plugin_metadata validates ability metadata fields', () => {
  const malformed = {
    id: 'imp',
    name: 'Imp',
    type: 'demon',
    alignment_at_start: 'evil',
    timing_category: 'each_night',
    is_once_per_game: false,
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
    },
    abilities: [
      {
        ability_id: ' imp.night_kill ',
        character_id: 'poisoner',
        summary: ' ',
        category: 'invalid',
        activation: ['night_wake', 'night_wake'],
        reminders: [' valid:marker ', '']
      }
    ]
  } as unknown as CharacterPluginMetadata;

  const issues = validate_plugin_metadata(malformed);
  const issueCodes = new Set(issues.map((issue) => issue.code));

  assert.equal(issueCodes.has('ability_id_canonical'), true);
  assert.equal(issueCodes.has('ability_character_id_mismatch'), true);
  assert.equal(issueCodes.has('ability_summary_required'), true);
  assert.equal(issueCodes.has('invalid_ability_category'), true);
  assert.equal(issueCodes.has('duplicate_ability_activation'), true);
  assert.equal(issueCodes.has('invalid_ability_reminder_item'), true);
});
