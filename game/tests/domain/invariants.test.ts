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

test('validate_invariants detects duplicate/non-pending prompt queue entries', () => {
  const state = create_initial_state('g1');
  state.prompts_by_id.pr1 = {
    prompt_key: 'pr1',
    kind: 'choice',
    reason: 'pick one',
    visibility: 'storyteller',
    options: [],
    status: 'resolved',
    created_at_event_id: 1,
    resolved_at_event_id: 2,
    resolution_payload: {
      selected_option_id: null,
      freeform: null
    },
    notes: null
  };
  state.pending_prompts = ['pr1', 'pr1'];

  const issues = validate_invariants(state);
  const duplicate = issues.find((issue) => issue.code === 'duplicate_pending_prompt_id');
  const nonPending = issues.find((issue) => issue.code === 'pending_prompt_not_pending');

  assert.ok(duplicate);
  assert.ok(nonPending);
});

test('validate_invariants checks wake and interrupt queue integrity', () => {
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
  state.wake_queue = [
    {
      wake_key: 'w1',
      character_id: 'imp',
      player_id: 'missing'
    },
    {
      wake_key: 'w1',
      character_id: 'poisoner',
      player_id: 'p1'
    }
  ];
  state.interrupt_queue = [
    {
      interrupt_id: 'i1',
      kind: 'k1',
      source_plugin_id: 'imp',
      payload: {}
    },
    {
      interrupt_id: 'i1',
      kind: 'k2',
      source_plugin_id: 'poisoner',
      payload: {}
    }
  ];

  const issues = validate_invariants(state);
  const wakeMissing = issues.find((issue) => issue.code === 'wake_queue_player_missing');
  const wakeDuplicate = issues.find((issue) => issue.code === 'duplicate_wake_queue_id');
  const interruptDuplicate = issues.find((issue) => issue.code === 'duplicate_interrupt_queue_id');

  assert.ok(wakeMissing);
  assert.ok(wakeDuplicate);
  assert.ok(interruptDuplicate);
});

test('validate_invariants allows system wake entries with null player_id', () => {
  const state = create_initial_state('g1');
  state.wake_queue = [
    {
      wake_key: 'w-system',
      character_id: 'demoninfo',
      player_id: null
    }
  ];

  const issues = validate_invariants(state);
  assert.equal(issues.some((issue) => issue.code === 'wake_queue_player_missing'), false);
});

test('validate_invariants rejects invalid wake and interrupt queue fields', () => {
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
  state.wake_queue = [
    {
      wake_key: ' ',
      character_id: '',
      player_id: 'p1'
    }
  ];
  state.interrupt_queue = [
    {
      interrupt_id: ' ',
      kind: '',
      source_plugin_id: ' ',
      payload: {}
    }
  ];

  const issues = validate_invariants(state);
  const invalidWake = issues.find((issue) => issue.code === 'wake_queue_invalid_entry');
  const invalidInterrupt = issues.find((issue) => issue.code === 'interrupt_queue_invalid_entry');

  assert.ok(invalidWake);
  assert.ok(invalidInterrupt);
});

test('validate_invariants handles malformed queue entry types without throwing', () => {
  const state = create_initial_state('g1');
  state.wake_queue = [
    {
      wake_key: 123 as unknown as string,
      character_id: null as unknown as string,
      player_id: 999 as unknown as string
    }
  ];
  state.interrupt_queue = [
    {
      interrupt_id: {} as unknown as string,
      kind: [] as unknown as string,
      source_plugin_id: 42 as unknown as string,
      payload: {}
    }
  ];

  assert.doesNotThrow(() => validate_invariants(state));
  const issues = validate_invariants(state);
  const issueCodes = new Set(issues.map((issue) => issue.code));
  assert.equal(issueCodes.has('wake_queue_invalid_entry'), true);
  assert.equal(issueCodes.has('wake_queue_player_missing'), true);
  assert.equal(issueCodes.has('interrupt_queue_invalid_entry'), true);
});

test('validate_invariants checks active reminder marker integrity and derived status', () => {
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
    poisoned: true,
    is_traveller: false,
    is_demon: false
  };
  state.active_reminder_marker_ids = ['missing', 'missing'];
  state.reminder_markers_by_id.mk1 = {
    marker_id: 'mk1',
    kind: 'poisoner:poisoned',
    effect: 'poisoned',
    note: 'poisoned',
    status: 'active',
    source_player_id: 'p2',
    source_character_id: 'poisoner',
    target_player_id: 'p1',
    target_scope: 'player',
    authoritative: true,
    expires_policy: 'manual',
    expires_at_day_number: null,
    expires_at_night_number: null,
    created_at_event_id: 3,
    cleared_at_event_id: null,
    source_event_id: null,
    metadata: {}
  };

  const issues = validate_invariants(state);
  const issue_codes = new Set(issues.map((issue) => issue.code));
  assert.equal(issue_codes.has('active_reminder_marker_missing'), true);
  assert.equal(issue_codes.has('duplicate_active_reminder_marker_id'), true);
  assert.equal(issue_codes.has('player_poisoned_status_mismatch'), true);
});
