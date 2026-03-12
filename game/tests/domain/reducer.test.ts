import assert from 'node:assert/strict';
import test from 'node:test';

import type { DomainEvent } from '../../src/domain/events.js';
import { apply_event } from '../../src/domain/reducer.js';
import { replay_events } from '../../src/domain/replay.js';
import { create_initial_state } from '../../src/domain/state.js';

function make_base_events(): DomainEvent[] {
  return [
    {
      event_id: 'e1',
      event_type: 'GameCreated',
      created_at: '2026-03-12T00:00:00.000Z',
      payload: {
        game_id: 'g1',
        created_at: '2026-03-12T00:00:00.000Z'
      }
    },
    {
      event_id: 'e2',
      event_type: 'PlayerAdded',
      created_at: '2026-03-12T00:00:01.000Z',
      payload: {
        player_id: 'p1',
        display_name: 'Alice'
      }
    },
    {
      event_id: 'e3',
      event_type: 'PlayerAdded',
      created_at: '2026-03-12T00:00:02.000Z',
      payload: {
        player_id: 'p2',
        display_name: 'Bob'
      }
    },
    {
      event_id: 'e4',
      event_type: 'SeatOrderSet',
      created_at: '2026-03-12T00:00:03.000Z',
      payload: {
        seat_order: ['p1', 'p2']
      }
    },
    {
      event_id: 'e5',
      event_type: 'PhaseAdvanced',
      created_at: '2026-03-12T00:00:04.000Z',
      payload: {
        phase: 'first_night',
        subphase: 'night_wake_sequence',
        day_number: 0,
        night_number: 1
      }
    }
  ];
}

test('replay_events is deterministic', () => {
  const events = make_base_events();
  const first = replay_events(events, create_initial_state('seed_game'));
  const second = replay_events(events, create_initial_state('seed_game'));

  assert.deepEqual(first, second);
});

test('apply_event ignores duplicate event_id', () => {
  const state = replay_events(make_base_events(), create_initial_state('seed_game'));
  const duplicate = {
    event_id: 'e5',
    event_type: 'PhaseAdvanced',
    created_at: '2026-03-12T00:00:04.000Z',
    payload: {
      phase: 'day',
      subphase: 'open_discussion',
      day_number: 1,
      night_number: 1
    }
  } satisfies DomainEvent;

  const next = apply_event(state, duplicate);
  assert.equal(next.phase, 'first_night');
  assert.equal(next.subphase, 'night_wake_sequence');
  assert.equal(next.domain_events.length, state.domain_events.length);
});

test('reducer applies assignments to existing player', () => {
  const state = replay_events(
    [
      ...make_base_events(),
      {
        event_id: 'e6',
        event_type: 'CharacterAssigned',
        created_at: '2026-03-12T00:00:05.000Z',
        payload: {
          player_id: 'p1',
          true_character_id: 'imp'
        }
      },
      {
        event_id: 'e7',
        event_type: 'PerceivedCharacterAssigned',
        created_at: '2026-03-12T00:00:06.000Z',
        payload: {
          player_id: 'p1',
          perceived_character_id: 'imp'
        }
      },
      {
        event_id: 'e8',
        event_type: 'AlignmentAssigned',
        created_at: '2026-03-12T00:00:07.000Z',
        payload: {
          player_id: 'p1',
          true_alignment: 'evil'
        }
      }
    ],
    create_initial_state('seed_game')
  );

  const player = state.players_by_id.p1;
  assert.ok(player);
  assert.equal(player.true_character_id, 'imp');
  assert.equal(player.perceived_character_id, 'imp');
  assert.equal(player.true_alignment, 'evil');
});

test('reducer tracks prompt lifecycle and storyteller notes', () => {
  const state = replay_events(
    [
      {
        event_id: 'p1',
        event_type: 'PromptQueued',
        created_at: '2026-03-13T00:00:00.000Z',
        payload: {
          prompt_id: 'pr1',
          kind: 'false_info',
          reason: 'pick false data',
          visibility: 'storyteller',
          options: [
            { option_id: 'a', label: 'A' },
            { option_id: 'b', label: 'B' }
          ]
        }
      },
      {
        event_id: 'p2',
        event_type: 'PromptResolved',
        created_at: '2026-03-13T00:00:01.000Z',
        payload: {
          prompt_id: 'pr1',
          selected_option_id: 'b',
          freeform: null,
          notes: 'pick b'
        }
      },
      {
        event_id: 'p3',
        event_type: 'StorytellerRulingRecorded',
        created_at: '2026-03-13T00:00:02.000Z',
        payload: {
          prompt_id: 'pr1',
          note: 'resolved for balance'
        }
      }
    ],
    create_initial_state('g1')
  );

  assert.deepEqual(state.pending_prompts, []);
  assert.equal(state.prompts_by_id.pr1?.status, 'resolved');
  assert.equal(state.prompts_by_id.pr1?.resolution_payload?.selected_option_id, 'b');
  assert.equal(state.storyteller_notes.length, 1);
});
