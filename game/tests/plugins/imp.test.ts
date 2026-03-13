import assert from 'node:assert/strict';
import test from 'node:test';

import { create_initial_state } from '../../src/domain/state.js';
import { imp_plugin, is_imp_prompt_id } from '../../src/plugins/characters/imp.js';
import { make_player } from './tb-test-utils.js';

test('imp wake hook returns player-visible target prompt', () => {
  const state = create_initial_state('g1');
  state.players_by_id.p1 = make_player('p1', 'ImpPlayer', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'TargetA', 'washerwoman', 'good');

  const result = imp_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p1',
    wake_step_id: 'wake:1:0:p1:imp'
  });

  assert.ok(result);
  assert.equal(result?.queued_prompts.length, 1);
  const prompt = result?.queued_prompts[0];
  assert.ok(prompt);
  assert.equal(prompt?.visibility, 'player');
  assert.equal(prompt?.kind, 'choice');
  assert.equal(is_imp_prompt_id(prompt?.prompt_id ?? ''), true);
  assert.deepEqual(prompt?.options.map((item) => item.option_id), ['p2']);
});

test('imp prompt resolution emits PlayerDied consequence', () => {
  const state = create_initial_state('g1');
  state.day_number = 0;
  state.night_number = 1;
  state.players_by_id.p1 = make_player('p1', 'ImpPlayer', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'TargetA', 'washerwoman', 'good');

  const result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:1:p1',
    selected_option_id: 'p2',
    freeform: null
  });

  assert.ok(result);
  assert.equal(result?.emitted_events.length, 1);
  const event = result?.emitted_events[0];
  assert.ok(event);
  assert.equal(event?.event_type, 'PlayerDied');
  assert.deepEqual(event?.payload, {
    player_id: 'p2',
    day_number: 0,
    night_number: 1,
    reason: 'night_death'
  });
});

test('imp does not kill dead target', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'ImpPlayer', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'DeadTarget', 'washerwoman', 'good', { alive: false });

  const result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:2:p1',
    selected_option_id: 'p2',
    freeform: null
  });

  assert.ok(result);
  assert.equal(result?.emitted_events.length, 0);
});

test('imp does not kill sober Soldier target', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'ImpPlayer', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'Soldier', 'soldier', 'good');

  const result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:2:p1',
    selected_option_id: 'p2',
    freeform: null
  });

  assert.ok(result);
  assert.equal(result?.emitted_events.length, 0);
});

test('imp kills poisoned Soldier target', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'ImpPlayer', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'Soldier', 'soldier', 'good', { poisoned: true });

  const result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:2:p1',
    selected_option_id: 'p2',
    freeform: null
  });

  assert.ok(result);
  assert.equal(result?.emitted_events.length, 1);
  assert.equal(result?.emitted_events[0]?.event_type, 'PlayerDied');
});

test('imp does not kill monk protected target', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'ImpPlayer', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'Target', 'washerwoman', 'good');
  state.reminder_markers_by_id.m1 = {
    marker_id: 'm1',
    kind: 'monk:safe',
    effect: 'demon_safe',
    note: 'safe',
    status: 'active',
    source_player_id: 'p3',
    source_character_id: 'monk',
    target_player_id: 'p2',
    target_scope: 'player',
    authoritative: true,
    expires_policy: 'end_of_night',
    expires_at_day_number: null,
    expires_at_night_number: null,
    created_at_event_id: 'e1',
    cleared_at_event_id: null,
    source_event_id: null,
    metadata: {}
  };
  state.active_reminder_marker_ids = ['m1'];

  const result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:2:p1',
    selected_option_id: 'p2',
    freeform: null
  });

  assert.ok(result);
  assert.equal(result?.emitted_events.length, 0);
});
