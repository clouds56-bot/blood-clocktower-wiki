import assert from 'node:assert/strict';
import test from 'node:test';

import { create_initial_state } from '../../src/domain/state.js';
import {
  build_ravenkeeper_reveal_prompt,
  ravenkeeper_plugin
} from '../../src/plugins/characters/ravenkeeper.js';
import { make_player } from './tb-test-utils.js';

test('ravenkeeper prompt builder lists selectable players', () => {
  const state = create_initial_state('g1');
  state.night_number = 2;
  state.players_by_id.p2 = make_player('p2', 'Chef', 'chef', 'good');
  state.players_by_id.p1 = make_player('p1', 'Ravenkeeper', 'ravenkeeper', 'good');

  const prompt = build_ravenkeeper_reveal_prompt(state, 'p1');
  assert.equal(prompt.prompt_key, 'plugin:ravenkeeper:night_reveal:n2:p1');
  assert.deepEqual(prompt.options.map((option) => option.option_id), ['p1', 'p2']);
});

test('ravenkeeper prompt resolution records revealed character note', () => {
  const state = create_initial_state('g1');
  state.players_by_id.p1 = make_player('p1', 'Ravenkeeper', 'ravenkeeper', 'good', { alive: false });
  state.players_by_id.p2 = make_player('p2', 'Imp', 'imp', 'evil', { is_demon: true });

  const result = ravenkeeper_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_key: 'plugin:ravenkeeper:night_reveal:n2:p1',
    selected_option_id: 'p2',
    freeform: null
  });

  assert.ok(result);
  assert.equal(result?.emitted_events.length, 1);
  assert.equal(result?.emitted_events[0]?.event_type, 'StorytellerRulingRecorded');
  assert.equal(result?.emitted_events[0]?.payload.note, 'ravenkeeper_info:p1:target=p2;character=imp');
});
