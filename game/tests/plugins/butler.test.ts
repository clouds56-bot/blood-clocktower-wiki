import assert from 'node:assert/strict';
import test from 'node:test';

import { create_initial_state } from '../../src/domain/state.js';
import { butler_plugin, is_butler_prompt_id } from '../../src/plugins/characters/butler.js';
import { make_player } from './tb-test-utils.js';

test('butler wake hook returns master selection prompt', () => {
  const state = create_initial_state('g1');
  state.players_by_id.p1 = make_player('p1', 'Butler', 'butler', 'good');
  state.players_by_id.p2 = make_player('p2', 'A', 'chef', 'good');
  state.players_by_id.p3 = make_player('p3', 'B', 'imp', 'evil', { is_demon: true });

  const result = butler_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p1',
    wake_step_id: 'wake:1:0:p1:butler'
  });

  assert.ok(result);
  assert.equal(result?.queued_prompts.length, 1);
  const prompt = result?.queued_prompts[0];
  assert.ok(prompt);
  assert.equal(is_butler_prompt_id(prompt?.prompt_id ?? ''), true);
  assert.deepEqual(prompt?.options.map((option) => option.option_id), ['p2', 'p3']);
});

test('butler prompt resolution emits master marker and clears previous marker', () => {
  const state = create_initial_state('g1');
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'Butler', 'butler', 'good');
  state.players_by_id.p2 = make_player('p2', 'OldMaster', 'chef', 'good');
  state.players_by_id.p3 = make_player('p3', 'NewMaster', 'empath', 'good');
  state.reminder_markers_by_id.m1 = {
    marker_id: 'm1',
    kind: 'butler:master',
    effect: 'butler_master',
    note: 'existing',
    status: 'active',
    source_player_id: 'p1',
    source_character_id: 'butler',
    target_player_id: 'p2',
    target_scope: 'player',
    authoritative: true,
    expires_policy: 'end_of_day',
    expires_at_day_number: null,
    expires_at_night_number: null,
    created_at_event_id: 'e1',
    cleared_at_event_id: null,
    source_event_id: null,
    metadata: {}
  };
  state.active_reminder_marker_ids = ['m1'];

  const result = butler_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:butler:night_master:2:p1',
    selected_option_id: 'p3',
    freeform: null
  });

  assert.ok(result);
  assert.deepEqual(
    result?.emitted_events.map((event) => event.event_type),
    ['ReminderMarkerCleared', 'ReminderMarkerApplied']
  );
});
