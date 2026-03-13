import assert from 'node:assert/strict';
import test from 'node:test';

import { create_initial_state } from '../../src/domain/state.js';
import { undertaker_plugin } from '../../src/plugins/characters/undertaker.js';
import { make_player } from './tb-test-utils.js';

test('undertaker records no execution when nobody executed', () => {
  const state = create_initial_state('g1');
  state.players_by_id.p1 = make_player('p1', 'Undertaker', 'undertaker', 'good');
  state.day_state.executed_player_id = null;

  const result = undertaker_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p1',
    wake_step_id: 'wake:2:0:p1:undertaker'
  });

  assert.ok(result);
  assert.equal(result?.emitted_events.length, 1);
  assert.equal(result?.emitted_events[0]?.payload.note, 'undertaker_info:p1:no_execution_today');
});

test('undertaker records executed player character', () => {
  const state = create_initial_state('g1');
  state.players_by_id.p1 = make_player('p1', 'Undertaker', 'undertaker', 'good');
  state.players_by_id.p2 = make_player('p2', 'ImpPlayer', 'imp', 'evil', { is_demon: true });
  state.day_state.executed_player_id = 'p2';

  const result = undertaker_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p1',
    wake_step_id: 'wake:2:0:p1:undertaker'
  });

  assert.ok(result);
  assert.equal(result?.emitted_events.length, 1);
  assert.equal(result?.emitted_events[0]?.payload.note, 'undertaker_info:p1:executed_player=p2;character=imp');
});
