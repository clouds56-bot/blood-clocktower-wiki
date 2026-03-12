import assert from 'node:assert/strict';
import test from 'node:test';

import { validate_invariants } from '../../src/domain/invariants.js';
import { create_initial_state } from '../../src/domain/state.js';

test('validate_invariants returns no issues for valid baseline state', () => {
  const state = create_initial_state('g1');
  state.players_by_id.p1 = {
    player_id: 'p1',
    display_name: 'Alice',
    alive: true,
    dead_vote_available: true,
    true_character_id: null,
    perceived_character_id: null,
    true_alignment: null,
    registered_character_id: null,
    registered_alignment: null,
    drunk: false,
    poisoned: false,
    is_traveller: false,
    is_demon: false
  };
  state.seat_order = ['p1'];

  const issues = validate_invariants(state);
  assert.equal(issues.length, 0);
});

test('validate_invariants detects invalid numeric and seat issues', () => {
  const state = create_initial_state('g1');
  state.day_number = -1;
  state.night_number = -2;
  state.seat_order = ['missing', 'missing'];

  const issues = validate_invariants(state);
  const codes = new Set(issues.map((issue) => issue.code));

  assert.equal(codes.has('invalid_day_number'), true);
  assert.equal(codes.has('invalid_night_number'), true);
  assert.equal(codes.has('seat_order_player_missing'), true);
  assert.equal(codes.has('seat_order_duplicate_player'), true);
});

test('validate_invariants warns on alive player with spent dead vote', () => {
  const state = create_initial_state('g1');
  state.players_by_id.p1 = {
    player_id: 'p1',
    display_name: 'Alice',
    alive: true,
    dead_vote_available: false,
    true_character_id: null,
    perceived_character_id: null,
    true_alignment: null,
    registered_character_id: null,
    registered_alignment: null,
    drunk: false,
    poisoned: false,
    is_traveller: false,
    is_demon: false
  };

  const issues = validate_invariants(state);
  const warning = issues.find((issue) => issue.code === 'alive_player_spent_dead_vote');

  assert.ok(warning);
  assert.equal(warning?.severity, 'warning');
});

test('validate_invariants checks ended game outcome fields', () => {
  const state = create_initial_state('g1');
  state.status = 'ended';
  state.phase = 'ended';
  state.subphase = 'complete';

  const issues = validate_invariants(state);
  const missingOutcome = issues.find((issue) => issue.code === 'ended_game_missing_outcome');
  assert.ok(missingOutcome);
});

test('validate_invariants detects dangling pending prompt ids', () => {
  const state = create_initial_state('g1');
  state.pending_prompts = ['pr_missing'];

  const issues = validate_invariants(state);
  const dangling = issues.find((issue) => issue.code === 'pending_prompt_missing');
  assert.ok(dangling);
});
