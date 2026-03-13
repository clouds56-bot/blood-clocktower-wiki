import assert from 'node:assert/strict';
import test from 'node:test';

import type { DomainEvent } from '../../src/domain/events.js';
import { apply_events } from '../../src/domain/reducer.js';
import { replay_events } from '../../src/domain/replay.js';
import { create_initial_state } from '../../src/domain/state.js';
import { project_for_player } from '../../src/projections/player.js';
import { project_for_public } from '../../src/projections/public.js';
import { project_for_storyteller } from '../../src/projections/storyteller.js';

function make_state() {
  const state = create_initial_state('g1');
  state.status = 'in_progress';
  state.phase = 'day';
  state.subphase = 'nomination_window';
  state.day_number = 1;
  state.night_number = 1;

  state.players_by_id = {
    p1: {
      player_id: 'p1',
      display_name: 'Alice',
      alive: true,
      dead_vote_available: true,
      true_character_id: 'washerwoman',
      perceived_character_id: 'washerwoman',
      true_alignment: 'good',
      registered_character_id: null,
      registered_alignment: null,
      drunk: false,
      poisoned: false,
      is_traveller: false,
      is_demon: false
    },
    p2: {
      player_id: 'p2',
      display_name: 'Bob',
      alive: true,
      dead_vote_available: true,
      true_character_id: 'imp',
      perceived_character_id: 'soldier',
      true_alignment: 'evil',
      registered_character_id: null,
      registered_alignment: null,
      drunk: false,
      poisoned: true,
      is_traveller: false,
      is_demon: true
    }
  };
  state.seat_order = ['p1', 'p2'];
  state.day_state.nominations_today.push({
    nomination_id: 'n1',
    day_number: 1,
    nominator_player_id: 'p1',
    nominee_player_id: 'p2',
    vote_total: 2,
    threshold: 1
  });
  state.prompts_by_id.pr1 = {
    prompt_id: 'pr1',
    kind: 'false_info',
    reason: 'choose false info',
    visibility: 'storyteller',
    options: [{ option_id: 'a', label: 'A' }],
    status: 'pending',
    created_at_event_id: 'e1',
    resolved_at_event_id: null,
    resolution_payload: null,
    notes: null
  };
  state.pending_prompts = ['pr1'];
  state.storyteller_notes.push({
    note_id: 'note1',
    prompt_id: 'pr1',
    text: 'secret adjudication',
    created_at_event_id: 'e2'
  });
  state.reminder_markers_by_id.mk1 = {
    marker_id: 'mk1',
    kind: 'poisoner:poisoned',
    effect: 'poisoned',
    note: 'secret marker',
    status: 'active',
    source_player_id: 'p2',
    source_character_id: 'poisoner',
    target_player_id: 'p1',
    target_scope: 'player',
    authoritative: true,
    expires_policy: 'manual',
    expires_at_day_number: null,
    expires_at_night_number: null,
    created_at_event_id: 'e3',
    cleared_at_event_id: null,
    source_event_id: null,
    metadata: {}
  };
  state.active_reminder_marker_ids = ['mk1'];

  return state;
}

test('storyteller projection includes hidden truth and adjudication data', () => {
  const projection = project_for_storyteller(make_state());
  assert.equal(projection.players.p2?.true_character_id, 'imp');
  assert.equal(projection.players.p2?.poisoned, true);
  assert.equal(projection.prompts.length, 1);
  assert.equal(projection.storyteller_notes.length, 1);
  assert.equal(projection.reminder_markers.length, 1);
});

test('player projection excludes other hidden truth and storyteller-only data', () => {
  const result = project_for_player(make_state(), 'p1');
  if (!result.ok) {
    assert.fail(`unexpected projection error ${result.error.code}: ${result.error.message}`);
  }

  assert.equal(result.value.self.player_id, 'p1');
  const serialized = JSON.stringify(result.value);
  assert.equal(serialized.includes('"true_character_id"'), false);
  assert.equal(serialized.includes('"poisoned"'), false);
  assert.equal(serialized.includes('"registered_character_id"'), false);
  assert.equal(serialized.includes('"registered_alignment"'), false);
  assert.equal(serialized.includes('"storyteller_notes"'), false);
  assert.equal(serialized.includes('"pending_prompts"'), false);
  assert.equal(serialized.includes('"reminder_markers"'), false);
});

test('public projection includes public flow and excludes hidden fields', () => {
  const projection = project_for_public(make_state());
  assert.equal(projection.players.length, 2);
  assert.equal(projection.day_state.nominations_today.length, 1);

  const serialized = JSON.stringify(projection);
  assert.equal(serialized.includes('"true_character_id"'), false);
  assert.equal(serialized.includes('"storyteller_notes"'), false);
  assert.equal(serialized.includes('"poisoned"'), false);
  assert.equal(serialized.includes('"pending_prompts"'), false);
  assert.equal(serialized.includes('"reminder_markers"'), false);
});

test('projection output is deterministic for identical input state', () => {
  const state = make_state();
  const first = project_for_public(state);
  const second = project_for_public(state);
  assert.deepEqual(first, second);
});

test('projection of replayed state matches directly applied state', () => {
  const events: DomainEvent[] = [
    {
      event_id: 'e1',
      event_type: 'GameCreated',
      created_at: '2026-03-13T00:00:00.000Z',
      payload: {
        game_id: 'g1',
        created_at: '2026-03-13T00:00:00.000Z'
      }
    },
    {
      event_id: 'e2',
      event_type: 'PlayerAdded',
      created_at: '2026-03-13T00:00:01.000Z',
      payload: {
        player_id: 'p1',
        display_name: 'Alice'
      }
    },
    {
      event_id: 'e3',
      event_type: 'PlayerAdded',
      created_at: '2026-03-13T00:00:02.000Z',
      payload: {
        player_id: 'p2',
        display_name: 'Bob'
      }
    },
    {
      event_id: 'e4',
      event_type: 'SeatOrderSet',
      created_at: '2026-03-13T00:00:03.000Z',
      payload: {
        seat_order: ['p1', 'p2']
      }
    },
    {
      event_id: 'e5',
      event_type: 'PromptQueued',
      created_at: '2026-03-13T00:00:04.000Z',
      payload: {
        prompt_id: 'pr1',
        kind: 'false_info',
        reason: 'choose false info',
        visibility: 'storyteller',
        options: [{ option_id: 'a', label: 'A' }]
      }
    }
  ];

  const replayed = replay_events(events, create_initial_state('seed'));
  const direct = apply_events(create_initial_state('seed'), events);

  assert.deepEqual(project_for_storyteller(replayed), project_for_storyteller(direct));
});

test('project_for_player rejects unknown player id', () => {
  const result = project_for_player(make_state(), 'missing');
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'player_not_found');
  }
});
