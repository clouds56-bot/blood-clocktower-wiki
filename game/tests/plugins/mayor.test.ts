import assert from 'node:assert/strict';
import test from 'node:test';

import { create_initial_state } from '../../src/domain/state.js';
import { mayor_plugin } from '../../src/plugins/characters/mayor.js';
import { make_player } from './tb-test-utils.js';

test('mayor pre-death hook prompts redirect on imp night kill', () => {
  const state = create_initial_state('g1');
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'Imp', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'Mayor', 'mayor', 'good');
  state.players_by_id.p3 = make_player('p3', 'Chef', 'chef', 'good');

  const result = mayor_plugin.hooks.on_pre_player_died?.({
    state,
    target_player_id: 'p2',
    source_player_id: 'p1',
    source_character_id: 'imp',
    day_number: 1,
    night_number: 2,
    reason: 'night_death'
  });

  assert.ok(result);
  assert.equal(result?.outcome, 'prompt');
  if (result?.outcome === 'prompt') {
    assert.equal(result.prompt.prompt_key, 'plugin:mayor:redirect_death:n2:p1');
    assert.deepEqual(
      result.prompt.options.map((option) => option.option_id),
      ['p1', 'p3']
    );
  }
});

test('mayor redirect prompt resolution kills selected alternate target', () => {
  const state = create_initial_state('g1');
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'Imp', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'Mayor', 'mayor', 'good');
  state.players_by_id.p3 = make_player('p3', 'Chef', 'chef', 'good');

  const result = mayor_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_key: 'plugin:mayor:redirect_death:n2:p1',
    selected_option_id: 'p3',
    freeform: null
  });

  assert.ok(result);
  assert.equal(result?.emitted_events.length, 1);
  assert.equal(result?.emitted_events[0]?.event_type, 'PlayerDied');
  assert.equal(result?.emitted_events[0]?.payload.player_id, 'p3');
});
