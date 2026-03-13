import assert from 'node:assert/strict';
import test from 'node:test';

import { create_initial_state } from '../../src/domain/state.js';
import { imp_plugin, is_imp_prompt_id } from '../../src/plugins/characters/imp.js';

test('imp wake hook returns storyteller target prompt', () => {
  const state = create_initial_state('g1');
  state.players_by_id.p1 = {
    player_id: 'p1',
    display_name: 'ImpPlayer',
    alive: true,
    dead_vote_available: true,
    true_character_id: 'imp',
    perceived_character_id: null,
    true_alignment: 'evil',
    registered_character_id: null,
    registered_alignment: null,
    drunk: false,
    poisoned: false,
    is_traveller: false,
    is_demon: true
  };
  state.players_by_id.p2 = {
    player_id: 'p2',
    display_name: 'TargetA',
    alive: true,
    dead_vote_available: true,
    true_character_id: 'washerwoman',
    perceived_character_id: null,
    true_alignment: 'good',
    registered_character_id: null,
    registered_alignment: null,
    drunk: false,
    poisoned: false,
    is_traveller: false,
    is_demon: false
  };

  const result = imp_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p1',
    wake_step_id: 'wake:1:0:p1:imp'
  });

  assert.ok(result);
  assert.equal(result?.queued_prompts.length, 1);
  const prompt = result?.queued_prompts[0];
  assert.ok(prompt);
  assert.equal(prompt?.visibility, 'storyteller');
  assert.equal(prompt?.kind, 'choice');
  assert.equal(is_imp_prompt_id(prompt?.prompt_id ?? ''), true);
  assert.deepEqual(prompt?.options.map((item) => item.option_id), ['p2']);
});

test('imp prompt resolution emits PlayerDied consequence', () => {
  const state = create_initial_state('g1');
  state.day_number = 0;
  state.night_number = 1;

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
