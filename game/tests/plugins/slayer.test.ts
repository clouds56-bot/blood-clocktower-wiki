import assert from 'node:assert/strict';
import test from 'node:test';

import { create_initial_state } from '../../src/domain/state.js';
import { slayer_plugin } from '../../src/plugins/characters/slayer.js';
import { build_registration_query_id } from '../../src/plugins/characters/tb-info-utils.js';
import { make_player } from './tb-test-utils.js';

test('slayer requests registration ruling when target is Recluse', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 1;
  state.players_by_id.p1 = make_player('p1', 'Slayer', 'slayer', 'good');
  state.players_by_id.p2 = make_player('p2', 'Recluse', 'recluse', 'good');

  const result = slayer_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_key: 'plugin:slayer:claimed_ability:d1:p1',
    selected_option_id: 'p2',
    freeform: null
  });

  assert.ok(result);
  assert.equal(result?.queued_prompts.length, 1);
  assert.equal(result?.queued_prompts[0]?.prompt_key.startsWith('plugin:recluse:registration:slayer:'), true);
});

test('slayer kills Recluse when registration resolves as demon', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 1;
  state.players_by_id.p1 = make_player('p1', 'Slayer', 'slayer', 'good');
  state.players_by_id.p2 = make_player('p2', 'Recluse', 'recluse', 'good');

  const query_id = build_registration_query_id({
    consumer_role_id: 'slayer',
    query_kind: 'demon_check',
    day_number: 1,
    night_number: 1,
    subject_player_id: 'p2',
    query_slot: 'claimed_shot:p1',
    context_player_ids: ['p1']
  });
  state.registration_queries_by_id[query_id] = {
    query_id,
    consumer_role_id: 'slayer',
    query_kind: 'demon_check',
    subject_player_id: 'p2',
    subject_context_player_ids: ['p1'],
    phase: 'day',
    day_number: 1,
    night_number: 1,
    status: 'resolved',
    resolved_character_id: null,
    resolved_character_type: 'demon',
    resolved_alignment: null,
    decision_source: 'storyteller_prompt',
    created_at_event_id: 1,
    resolved_at_event_id: 2,
    note: 'recluse registers as demon'
  };

  const result = slayer_plugin.hooks.on_registration_resolved?.({
    state,
    prompt_key: `plugin:recluse:registration:slayer:p1:p2:${query_id}`,
    provider_role_id: 'recluse',
    consumer_role_id: 'slayer',
    owner_player_id: 'p1',
    context_tag: 'p2',
    query_id,
    selected_option_id: 'character_type:demon',
    freeform: null,
    decision: {
      query_id,
      resolved_character_id: null,
      resolved_character_type: 'demon',
      resolved_alignment: null,
      decision_source: 'storyteller_prompt',
      note: 'recluse registers as demon'
    }
  });

  assert.ok(result);
  assert.equal(result?.emitted_events.length, 1);
  assert.equal(result?.emitted_events[0]?.event_type, 'PlayerDied');
  assert.equal(result?.emitted_events[0]?.payload.player_id, 'p2');
});
