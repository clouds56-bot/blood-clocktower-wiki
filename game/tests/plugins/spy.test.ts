import assert from 'node:assert/strict';
import test from 'node:test';

import { create_initial_state } from '../../src/domain/state.js';
import {
  build_registration_query_id,
  resolve_registered_alignment,
  resolve_registered_character_type
} from '../../src/plugins/characters/tb-info-utils.js';
import { spy_plugin } from '../../src/plugins/characters/spy.js';
import { make_player } from './tb-test-utils.js';

test('spy wake hook records grimoire snapshot note', () => {
  const state = create_initial_state('g1');
  state.seat_order = ['p1', 'p2', 'p3'];
  state.players_by_id.p1 = make_player('p1', 'Spy', 'spy', 'evil');
  state.players_by_id.p2 = make_player('p2', 'Imp', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p3 = make_player('p3', 'Chef', 'chef', 'good');

  const result = spy_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p1',
    wake_step_id: 'wake:1:0:p1:spy'
  });

  assert.ok(result);
  assert.equal(result?.emitted_events.length, 1);
  assert.equal(result?.emitted_events[0]?.event_type, 'StorytellerRulingRecorded');
  assert.equal(result?.emitted_events[0]?.payload.note, 'spy_grimoire:p1:p1:spy,p2:imp,p3:chef');
});

test('spy registration provider can resolve differently across query ids', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 1;
  state.players_by_id.p1 = make_player('p1', 'Spy', 'spy', 'evil');

  const outcomes = new Set<string>();
  for (let i = 0; i < 30; i += 1) {
    const query_id = build_registration_query_id({
      consumer_role_id: 'chef',
      query_kind: 'alignment_check',
      day_number: 1,
      night_number: 1,
      subject_player_id: 'p1',
      query_slot: `slot_${i}`
    });
    const alignment = resolve_registered_alignment(state, {
      query_id,
      consumer_role_id: 'chef',
      query_kind: 'alignment_check',
      subject_player_id: 'p1'
    });
    outcomes.add(alignment ?? 'null');
  }

  assert.ok(outcomes.has('evil'));
  assert.ok(outcomes.has('good'));
});

test('dead spy still provides registration type outcomes', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 1;
  state.players_by_id.p1 = make_player('p1', 'Spy', 'spy', 'evil', { alive: false });

  const query_id = build_registration_query_id({
    consumer_role_id: 'fortune_teller',
    query_kind: 'character_type_check',
    day_number: 1,
    night_number: 1,
    subject_player_id: 'p1',
    query_slot: 'dead_spy'
  });

  const type = resolve_registered_character_type(state, {
    query_id,
    consumer_role_id: 'fortune_teller',
    query_kind: 'character_type_check',
    subject_player_id: 'p1'
  });

  assert.ok(type === 'townsfolk' || type === 'outsider' || type === 'minion');
});
