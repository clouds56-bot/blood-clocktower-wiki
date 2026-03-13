import assert from 'node:assert/strict';
import test from 'node:test';

import { create_initial_state } from '../../src/domain/state.js';
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
