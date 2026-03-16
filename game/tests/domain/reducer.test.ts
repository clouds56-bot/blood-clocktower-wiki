import assert from 'node:assert/strict';
import test from 'node:test';

import type { DomainEvent } from '../../src/domain/events.js';
import { apply_event } from '../../src/domain/reducer.js';
import { replay_events } from '../../src/domain/replay.js';
import { create_initial_state } from '../../src/domain/state.js';

function make_base_events(): DomainEvent[] {
  return [
    {
      event_id: 1,
      event_type: 'GameCreated',
      created_at: '2026-03-12T00:00:00.000Z',
      payload: {
        game_id: 'g1',
        created_at: '2026-03-12T00:00:00.000Z'
      }
    },
    {
      event_id: 2,
      event_type: 'PlayerAdded',
      created_at: '2026-03-12T00:00:01.000Z',
      payload: {
        player_id: 'p1',
        display_name: 'Alice'
      }
    },
    {
      event_id: 3,
      event_type: 'PlayerAdded',
      created_at: '2026-03-12T00:00:02.000Z',
      payload: {
        player_id: 'p2',
        display_name: 'Bob'
      }
    },
    {
      event_id: 4,
      event_type: 'SeatOrderSet',
      created_at: '2026-03-12T00:00:03.000Z',
      payload: {
        seat_order: ['p1', 'p2']
      }
    },
    {
      event_id: 5,
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
    event_id: 6,
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
        event_id: 7,
        event_type: 'CharacterAssigned',
        created_at: '2026-03-12T00:00:05.000Z',
        payload: {
          player_id: 'p1',
          true_character_id: 'imp'
        }
      },
      {
        event_id: 8,
        event_type: 'PerceivedCharacterAssigned',
        created_at: '2026-03-12T00:00:06.000Z',
        payload: {
          player_id: 'p1',
          perceived_character_id: 'imp'
        }
      },
      {
        event_id: 9,
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
        event_id: 10,
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
        event_id: 11,
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
        event_id: 12,
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

test('reducer tracks wake and interrupt queues', () => {
  const events: DomainEvent[] = [
    {
      event_id: 13,
      event_type: 'PlayerAdded',
      created_at: '2026-03-13T00:00:00.000Z',
      payload: {
        player_id: 'p1',
        display_name: 'Alice'
      }
    },
    {
      event_id: 14,
      event_type: 'WakeScheduled',
      created_at: '2026-03-13T00:00:01.000Z',
      payload: {
        wake_id: 'w1',
        character_id: 'imp',
        player_id: 'p1'
      }
    },
    {
      event_id: 15,
      event_type: 'InterruptScheduled',
      created_at: '2026-03-13T00:00:02.000Z',
      payload: {
        interrupt_id: 'i1',
        kind: 'immediate_death_resolution',
        source_plugin_id: 'imp',
        payload: {
          target_player_id: 'p2'
        }
      }
    },
    {
      event_id: 16,
      event_type: 'WakeConsumed',
      created_at: '2026-03-13T00:00:03.000Z',
      payload: {
        wake_id: 'w1'
      }
    },
    {
      event_id: 17,
      event_type: 'InterruptConsumed',
      created_at: '2026-03-13T00:00:04.000Z',
      payload: {
        interrupt_id: 'i1'
      }
    }
  ];

  const scheduled = replay_events(events.slice(0, 3), create_initial_state('g1'));
  assert.equal(scheduled.wake_queue.length, 1);
  assert.deepEqual(scheduled.wake_queue[0], {
    wake_key: 'w1',
    wake_id: 'w1',
    character_id: 'imp',
    player_id: 'p1'
  });
  assert.equal(scheduled.interrupt_queue.length, 1);
  assert.deepEqual(scheduled.interrupt_queue[0], {
    interrupt_id: 'i1',
    kind: 'immediate_death_resolution',
    source_plugin_id: 'imp',
    payload: {
      target_player_id: 'p2'
    }
  });

  const state = replay_events(events, create_initial_state('g1'));

  assert.deepEqual(state.wake_queue, []);
  assert.deepEqual(state.interrupt_queue, []);
});

test('WakeScheduled fails fast for unknown player', () => {
  const state = create_initial_state('g1');

  assert.throws(() =>
    apply_event(state, {
      event_id: 18,
      event_type: 'WakeScheduled',
      created_at: '2026-03-13T00:00:00.000Z',
      payload: {
        wake_id: 'w1',
        character_id: 'imp',
        player_id: 'missing'
      }
    })
  );
});

test('PromptQueued rejects duplicate prompt ids', () => {
  const state = replay_events(
    [
      {
        event_id: 19,
        event_type: 'PromptQueued',
        created_at: '2026-03-13T00:00:00.000Z',
        payload: {
          prompt_id: 'dup_prompt',
          kind: 'choice',
          reason: 'first',
          visibility: 'storyteller',
          options: []
        }
      }
    ],
    create_initial_state('g1')
  );

  assert.throws(() =>
    apply_event(state, {
      event_id: 20,
      event_type: 'PromptQueued',
      created_at: '2026-03-13T00:00:01.000Z',
      payload: {
        prompt_id: 'dup_prompt',
        kind: 'choice',
        reason: 'second',
        visibility: 'storyteller',
        options: []
      }
    })
  );
});

test('reducer applies poison lifecycle events', () => {
  const state = replay_events(
    [
      {
        event_id: 21,
        event_type: 'PlayerAdded',
        created_at: '2026-03-13T00:00:00.000Z',
        payload: {
          player_id: 'p1',
          display_name: 'Alice'
        }
      },
      {
        event_id: 22,
        event_type: 'PoisonApplied',
        created_at: '2026-03-13T00:00:01.000Z',
        payload: {
          player_id: 'p1',
          source_plugin_id: 'poisoner',
          day_number: 1,
          night_number: 1
        }
      },
      {
        event_id: 23,
        event_type: 'PoisonCleared',
        created_at: '2026-03-13T00:00:02.000Z',
        payload: {
          player_id: 'p1',
          source_plugin_id: 'poisoner',
          day_number: 1,
          night_number: 2
        }
      }
    ],
    create_initial_state('g1')
  );

  assert.equal(state.players_by_id.p1?.poisoned, false);
});

test('reducer applies reminder marker lifecycle and derives statuses', () => {
  const state = replay_events(
    [
      {
        event_id: 24,
        event_type: 'PlayerAdded',
        created_at: '2026-03-13T00:00:00.000Z',
        payload: {
          player_id: 'p1',
          display_name: 'Alice'
        }
      },
      {
        event_id: 25,
        event_type: 'ReminderMarkerApplied',
        created_at: '2026-03-13T00:00:01.000Z',
        payload: {
          marker_id: 'mk1',
          kind: 'poisoner:poisoned',
          effect: 'poisoned',
          note: 'poisoned by poisoner',
          source_player_id: 'p2',
          source_character_id: 'poisoner',
          target_player_id: 'p1',
          target_scope: 'player',
          authoritative: true,
          expires_policy: 'manual',
          expires_at_day_number: null,
          expires_at_night_number: null,
          source_event_id: null,
          metadata: {}
        }
      },
      {
        event_id: 26,
        event_type: 'ReminderMarkerCleared',
        created_at: '2026-03-13T00:00:02.000Z',
        payload: {
          marker_id: 'mk1',
          reason: 'manual'
        }
      }
    ],
    create_initial_state('g1')
  );

  assert.equal(state.players_by_id.p1?.poisoned, false);
  assert.equal(state.active_reminder_marker_ids.length, 0);
  assert.equal(state.reminder_markers_by_id.mk1?.status, 'cleared');
});

test('reducer keeps poisoned=true when one poison source clears but another remains', () => {
  const state = replay_events(
    [
      {
        event_id: 27,
        event_type: 'PlayerAdded',
        created_at: '2026-03-13T00:00:00.000Z',
        payload: {
          player_id: 'p1',
          display_name: 'Alice'
        }
      },
      {
        event_id: 28,
        event_type: 'ReminderMarkerApplied',
        created_at: '2026-03-13T00:00:01.000Z',
        payload: {
          marker_id: 'mk_poisoner',
          kind: 'poisoner:poisoned',
          effect: 'poisoned',
          note: 'poisoner',
          source_player_id: 'p5',
          source_character_id: 'poisoner',
          target_player_id: 'p1',
          target_scope: 'player',
          authoritative: true,
          expires_policy: 'manual',
          expires_at_day_number: null,
          expires_at_night_number: null,
          source_event_id: null,
          metadata: {}
        }
      },
      {
        event_id: 29,
        event_type: 'ReminderMarkerApplied',
        created_at: '2026-03-13T00:00:02.000Z',
        payload: {
          marker_id: 'mk_nodashii',
          kind: 'no_dashii:poisoned',
          effect: 'poisoned',
          note: 'no dashii',
          source_player_id: 'p3',
          source_character_id: 'no_dashii',
          target_player_id: 'p1',
          target_scope: 'player',
          authoritative: true,
          expires_policy: 'manual',
          expires_at_day_number: null,
          expires_at_night_number: null,
          source_event_id: null,
          metadata: {}
        }
      },
      {
        event_id: 30,
        event_type: 'ReminderMarkerCleared',
        created_at: '2026-03-13T00:00:03.000Z',
        payload: {
          marker_id: 'mk_poisoner',
          reason: 'retarget'
        }
      }
    ],
    create_initial_state('g1')
  );

  assert.equal(state.players_by_id.p1?.poisoned, true);
  assert.deepEqual(state.active_reminder_marker_ids, ['mk_nodashii']);
});
