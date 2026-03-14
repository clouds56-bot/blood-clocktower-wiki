import assert from 'node:assert/strict';
import test from 'node:test';

import { create_initial_state } from '../../src/domain/state.js';
import { scarlet_woman_plugin } from '../../src/plugins/characters/scarlet-woman.js';
import { make_player } from './tb-test-utils.js';

test('scarlet woman on_player_died takes over dead demon character', () => {
  const state = create_initial_state('g1');
  state.seat_order = ['p1', 'p2', 'p3', 'p4', 'p5'];
  state.players_by_id.p1 = make_player('p1', 'DeadImp', 'imp', 'evil', {
    alive: false,
    is_demon: true
  });
  state.players_by_id.p2 = make_player('p2', 'Scarlet', 'scarlet_woman', 'evil');
  state.players_by_id.p3 = make_player('p3', 'Chef', 'chef', 'good');
  state.players_by_id.p4 = make_player('p4', 'Empath', 'empath', 'good');
  state.players_by_id.p5 = make_player('p5', 'Butler', 'butler', 'good');

  const result = scarlet_woman_plugin.hooks.on_player_died?.({
    state,
    player_id: 'p1',
    day_number: 1,
    night_number: 1,
    reason: 'execution'
  });

  assert.ok(result);
  assert.deepEqual(
    result?.emitted_events.map((event) => event.event_type),
    ['CharacterAssigned', 'CharacterAssigned', 'StorytellerRulingRecorded']
  );
  assert.equal(result?.emitted_events[0]?.payload.player_id, 'p1');
  assert.equal(result?.emitted_events[0]?.payload.is_demon, false);
  assert.equal(result?.emitted_events[1]?.payload.player_id, 'p2');
  assert.equal(result?.emitted_events[1]?.payload.true_character_id, 'imp');
  assert.equal(result?.emitted_events[1]?.payload.is_demon, true);
});

test('scarlet woman does not takeover with fewer than five alive before death', () => {
  const state = create_initial_state('g1');
  state.seat_order = ['p1', 'p2', 'p3', 'p4'];
  state.players_by_id.p1 = make_player('p1', 'DeadImp', 'imp', 'evil', {
    alive: false,
    is_demon: true
  });
  state.players_by_id.p2 = make_player('p2', 'Scarlet', 'scarlet_woman', 'evil');
  state.players_by_id.p3 = make_player('p3', 'Chef', 'chef', 'good');
  state.players_by_id.p4 = make_player('p4', 'Empath', 'empath', 'good');

  const result = scarlet_woman_plugin.hooks.on_player_died?.({
    state,
    player_id: 'p1',
    day_number: 1,
    night_number: 1,
    reason: 'execution'
  });

  assert.ok(result);
  assert.equal(result?.emitted_events.length, 0);
});
