import assert from 'node:assert/strict';
import test from 'node:test';

import { create_initial_state } from '../../src/domain/state.js';
import { is_monk_prompt_id, monk_plugin } from '../../src/plugins/characters/monk.js';
import { make_player } from './tb-test-utils.js';

test('monk wake hook returns player-visible protection prompt', () => {
  const state = create_initial_state('g1');
  state.players_by_id.p1 = make_player('p1', 'MonkPlayer', 'monk', 'good');
  state.players_by_id.p2 = make_player('p2', 'TargetA', 'washerwoman', 'good');

  const result = monk_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p1',
    wake_step_id: 'wake:2:0:p1:monk'
  });

  assert.ok(result);
  assert.equal(result?.queued_prompts.length, 1);
  const prompt = result?.queued_prompts[0];
  assert.ok(prompt);
  assert.equal(prompt?.visibility, 'player');
  assert.equal(prompt?.kind, 'choice');
  assert.equal(is_monk_prompt_id(prompt?.prompt_id ?? ''), true);
  assert.deepEqual(prompt?.options.map((item) => item.option_id), ['p2']);
});

test('monk prompt resolution clears prior target and applies fresh protection marker', () => {
  const state = create_initial_state('g1');
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'MonkPlayer', 'monk', 'good');
  state.players_by_id.p2 = make_player('p2', 'OldTarget', 'washerwoman', 'good');
  state.players_by_id.p3 = make_player('p3', 'NewTarget', 'chef', 'good');
  state.reminder_markers_by_id.m1 = {
    marker_id: 'm1',
    kind: 'monk:safe',
    effect: 'demon_safe',
    note: 'existing',
    status: 'active',
    source_player_id: 'p1',
    source_character_id: 'monk',
    target_player_id: 'p2',
    target_scope: 'player',
    authoritative: true,
    expires_policy: 'end_of_night',
    expires_at_day_number: null,
    expires_at_night_number: null,
    created_at_event_id: 1,
    cleared_at_event_id: null,
    source_event_id: null,
    metadata: {}
  };
  state.active_reminder_marker_ids = ['m1'];

  const result = monk_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_key: 'plugin:monk:night_protect:n2:p1',
    prompt_id: 'plugin:monk:night_protect:n2:p1',
    selected_option_id: 'p3',
    freeform: null
  });

  assert.ok(result);
  assert.deepEqual(
    result?.emitted_events.map((event) => event.event_type),
    ['ReminderMarkerCleared', 'ReminderMarkerApplied']
  );
});
