import assert from 'node:assert/strict';
import test from 'node:test';

import { create_initial_state } from '../../src/domain/state.js';
import {
  build_registration_query_id,
  resolve_registered_alignment,
  resolve_registered_character_type,
  resolves_as_demon
} from '../../src/plugins/characters/tb-info-utils.js';
import { make_player } from './tb-test-utils.js';

test('recluse registration provider does not auto-randomize unresolved query', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 1;
  state.players_by_id.p1 = make_player('p1', 'Recluse', 'recluse', 'good');

  const outcomes = new Set<string>();
  for (let i = 0; i < 30; i += 1) {
    const query_id = build_registration_query_id({
      consumer_role_id: 'empath',
      query_kind: 'alignment_check',
      day_number: 1,
      night_number: 1,
      subject_player_id: 'p1',
      query_slot: `slot_${i}`
    });

    const alignment = resolve_registered_alignment(state, {
      query_id,
      consumer_role_id: 'empath',
      query_kind: 'alignment_check',
      subject_player_id: 'p1'
    });
    outcomes.add(alignment ?? 'null');
  }

  assert.deepEqual([...outcomes], ['good']);
});

test('recluse uses storyteller-decided registration query outcome', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 1;
  state.players_by_id.p1 = make_player('p1', 'Recluse', 'recluse', 'good');

  const query_id = build_registration_query_id({
    consumer_role_id: 'fortune_teller',
    query_kind: 'demon_check',
    day_number: 1,
    night_number: 1,
    subject_player_id: 'p1',
    query_slot: 'slot_0'
  });

  state.registration_queries_by_id[query_id] = {
    query_id,
    consumer_role_id: 'fortune_teller',
    query_kind: 'demon_check',
    subject_player_id: 'p1',
    subject_context_player_ids: [],
    phase: 'night',
    day_number: 1,
    night_number: 1,
    status: 'resolved',
    resolved_character_id: 'imp',
    resolved_character_type: 'demon',
    resolved_alignment: 'evil',
    decision_source: 'storyteller_prompt',
    created_at_event_id: 'q1',
    resolved_at_event_id: 'q2',
    note: 'recluse registers as demon for this query'
  };

  const as_demon = resolves_as_demon(state, {
    query_id,
    consumer_role_id: 'fortune_teller',
    query_kind: 'demon_check',
    subject_player_id: 'p1'
  });
  assert.equal(as_demon, true);

  const type = resolve_registered_character_type(state, {
    query_id,
    consumer_role_id: 'fortune_teller',
    query_kind: 'demon_check',
    subject_player_id: 'p1'
  });
  assert.equal(type, 'demon');
});
