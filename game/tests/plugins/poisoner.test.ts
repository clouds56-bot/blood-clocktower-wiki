import assert from 'node:assert/strict';
import test from 'node:test';

import { create_initial_state } from '../../src/domain/state.js';
import { poisoner_plugin, is_poisoner_prompt_id } from '../../src/plugins/characters/poisoner.js';

test('poisoner wake hook returns player-visible poison target prompt', () => {
  const state = create_initial_state('g1');
  state.players_by_id.p1 = {
    player_id: 'p1',
    display_name: 'PoisonerPlayer',
    alive: true,
    dead_vote_available: true,
    true_character_id: 'poisoner',
    perceived_character_id: null,
    true_alignment: 'evil',
    registered_character_id: null,
    registered_alignment: null,
    drunk: false,
    poisoned: false,
    is_traveller: false,
    is_demon: false
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

  const result = poisoner_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p1',
    wake_step_id: 'wake:1:0:p1:poisoner'
  });

  assert.ok(result);
  assert.equal(result?.queued_prompts.length, 1);
  const prompt = result?.queued_prompts[0];
  assert.ok(prompt);
  assert.equal(prompt?.visibility, 'player');
  assert.equal(prompt?.kind, 'choice');
  assert.equal(is_poisoner_prompt_id(prompt?.prompt_id ?? ''), true);
  assert.deepEqual(prompt?.options.map((item) => item.option_id), ['p1', 'p2']);
});

test('poisoner prompt resolution emits poison apply and restore lifecycle events', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 2;
  state.players_by_id.p2 = {
    player_id: 'p2',
    display_name: 'OldTarget',
    alive: true,
    dead_vote_available: true,
    true_character_id: 'washerwoman',
    perceived_character_id: null,
    true_alignment: 'good',
    registered_character_id: null,
    registered_alignment: null,
    drunk: false,
    poisoned: true,
    is_traveller: false,
    is_demon: false
  };
  state.players_by_id.p3 = {
    player_id: 'p3',
    display_name: 'NewTarget',
    alive: true,
    dead_vote_available: true,
    true_character_id: 'chef',
    perceived_character_id: null,
    true_alignment: 'good',
    registered_character_id: null,
    registered_alignment: null,
    drunk: false,
    poisoned: false,
    is_traveller: false,
    is_demon: false
  };

  const result = poisoner_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:poisoner:night_poison:2:p1',
    selected_option_id: 'p3',
    freeform: null
  });

  assert.ok(result);
  assert.deepEqual(
    result?.emitted_events.map((event) => event.event_type),
    ['PoisonCleared', 'PoisonApplied']
  );
});
