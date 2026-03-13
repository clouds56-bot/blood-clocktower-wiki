import assert from 'node:assert/strict';
import test from 'node:test';

import type { Command } from '../../src/domain/commands.js';
import { apply_events } from '../../src/domain/reducer.js';
import { create_initial_state } from '../../src/domain/state.js';
import type { GameState } from '../../src/domain/types.js';
import type { CharacterPlugin, CharacterPluginMetadata } from '../../src/plugins/contracts.js';
import { empty_plugin_result } from '../../src/plugins/contracts.js';
import { PluginRegistry } from '../../src/plugins/registry.js';
import { handle_command } from '../../src/engine/command-handler.js';

function make_metadata(id: string): CharacterPluginMetadata {
  return {
    id,
    name: id.toUpperCase(),
    type: id === 'imp' ? 'demon' : 'minion',
    alignment_at_start: 'evil',
    timing_category: 'each_night',
    is_once_per_game: false,
    target_constraints: {
      min_targets: 1,
      max_targets: 1,
      allow_self: false,
      require_alive: true,
      allow_travellers: false
    },
    flags: {
      can_function_while_dead: false,
      can_trigger_on_death: false,
      may_cause_drunkenness: false,
      may_cause_poisoning: id === 'poisoner',
      may_change_alignment: false,
      may_change_character: false,
      may_register_as_other: false
    }
  };
}

function bootstrap_night_state(): GameState {
  const seed = create_initial_state('g1');
  return apply_events(seed, [
    {
      event_id: 'e1',
      event_type: 'PlayerAdded',
      created_at: '2026-03-14T00:00:00.000Z',
      payload: { player_id: 'p1', display_name: 'Alice' }
    },
    {
      event_id: 'e2',
      event_type: 'PlayerAdded',
      created_at: '2026-03-14T00:00:01.000Z',
      payload: { player_id: 'p2', display_name: 'Bob' }
    },
    {
      event_id: 'e3',
      event_type: 'SeatOrderSet',
      created_at: '2026-03-14T00:00:02.000Z',
      payload: { seat_order: ['p1', 'p2'] }
    },
    {
      event_id: 'e4',
      event_type: 'CharacterAssigned',
      created_at: '2026-03-14T00:00:03.000Z',
      payload: { player_id: 'p1', true_character_id: 'imp', is_demon: true }
    },
    {
      event_id: 'e5',
      event_type: 'CharacterAssigned',
      created_at: '2026-03-14T00:00:04.000Z',
      payload: { player_id: 'p2', true_character_id: 'poisoner' }
    }
  ]);
}

function run_with_registry(state: GameState, command: Command, registry: PluginRegistry) {
  const result = handle_command(state, command, '2026-03-14T01:00:00.000Z', {
    plugin_registry: registry
  });
  if (!result.ok) {
    assert.fail(`unexpected engine error ${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

test('advance phase night wake boundary integrates plugin runtime and drains interrupts', () => {
  const imp: CharacterPlugin = {
    metadata: make_metadata('imp'),
    hooks: {
      on_night_wake: () => ({
        emitted_events: [],
        queued_prompts: [
          {
            prompt_id: 'plugin:imp:night_kill',
            kind: 'choice',
            reason: 'plugin:imp:choose target',
            visibility: 'storyteller',
            options: [{ option_id: 'p2', label: 'Bob' }]
          }
        ],
        queued_interrupts: [
          {
            interrupt_id: 'imp_interrupt_1',
            kind: 'imp_followup',
            source_plugin_id: 'ignored_by_dispatcher',
            payload: { source: 'imp' }
          }
        ]
      })
    }
  };

  const poisoner: CharacterPlugin = {
    metadata: make_metadata('poisoner'),
    hooks: {
      on_night_wake: () => ({
        emitted_events: [],
        queued_prompts: [
          {
            prompt_id: 'plugin:poisoner:night_poison',
            kind: 'choice',
            reason: 'plugin:poisoner:choose target',
            visibility: 'storyteller',
            options: [{ option_id: 'p1', label: 'Alice' }]
          }
        ],
        queued_interrupts: []
      })
    }
  };

  const state = bootstrap_night_state();
  const registry = new PluginRegistry([imp, poisoner]);

  const events = run_with_registry(
    state,
    {
      command_id: 'c_phase',
      command_type: 'AdvancePhase',
      actor_id: 'storyteller',
      payload: {
        phase: 'first_night',
        subphase: 'night_wake_sequence',
        day_number: 0,
        night_number: 1
      }
    },
    registry
  );

  assert.deepEqual(
    events.map((event) => event.event_type),
    [
      'PhaseAdvanced',
      'WakeScheduled',
      'PromptQueued',
      'InterruptScheduled',
      'WakeConsumed',
      'InterruptConsumed',
      'WakeScheduled',
      'PromptQueued',
      'WakeConsumed'
    ]
  );

  const firstWakeConsumedIndex = events.findIndex((event) => event.event_type === 'WakeConsumed');
  const interruptConsumedIndex = events.findIndex((event) => event.event_type === 'InterruptConsumed');
  const secondWakeScheduledIndex = events.findIndex(
    (event, index) => event.event_type === 'WakeScheduled' && index > firstWakeConsumedIndex
  );

  assert.equal(interruptConsumedIndex > firstWakeConsumedIndex, true);
  assert.equal(interruptConsumedIndex < secondWakeScheduledIndex, true);
});

test('resolve prompt boundary re-enters plugin runtime via prompt owner tag', () => {
  const imp: CharacterPlugin = {
    metadata: make_metadata('imp'),
    hooks: {
      on_prompt_resolved: (context) => ({
        emitted_events: [
          {
            event_type: 'StorytellerRulingRecorded',
            payload: {
              prompt_id: context.prompt_id,
              note: `plugin handled ${context.selected_option_id}`
            }
          }
        ],
        queued_prompts: [],
        queued_interrupts: []
      })
    }
  };

  const registry = new PluginRegistry([imp]);
  const state = apply_events(create_initial_state('g1'), [
    {
      event_id: 'e1',
      event_type: 'PromptQueued',
      created_at: '2026-03-14T00:00:00.000Z',
      payload: {
        prompt_id: 'plugin:imp:night_kill',
        kind: 'choice',
        reason: 'plugin:imp:choose target',
        visibility: 'storyteller',
        options: [{ option_id: 'p2', label: 'Bob' }]
      }
    }
  ]);

  const events = run_with_registry(
    state,
    {
      command_id: 'c_resolve_prompt',
      command_type: 'ResolvePrompt',
      actor_id: 'storyteller',
      payload: {
        prompt_id: 'plugin:imp:night_kill',
        selected_option_id: 'p2',
        freeform: null,
        notes: null
      }
    },
    registry
  );

  assert.deepEqual(
    events.map((event) => event.event_type),
    ['PromptResolved', 'StorytellerChoiceMade', 'StorytellerRulingRecorded']
  );
});

test('non-boundary commands do not invoke plugin hooks', () => {
  let nightWakeCalls = 0;
  let promptResolveCalls = 0;

  const imp: CharacterPlugin = {
    metadata: make_metadata('imp'),
    hooks: {
      on_night_wake: () => {
        nightWakeCalls += 1;
        return empty_plugin_result();
      },
      on_prompt_resolved: () => {
        promptResolveCalls += 1;
        return empty_plugin_result();
      }
    }
  };

  const registry = new PluginRegistry([imp]);
  const state = create_initial_state('g1');

  const events = run_with_registry(
    state,
    {
      command_id: 'c_add_player',
      command_type: 'AddPlayer',
      actor_id: 'storyteller',
      payload: {
        player_id: 'p1',
        display_name: 'Alice'
      }
    },
    registry
  );

  assert.deepEqual(events.map((event) => event.event_type), ['PlayerAdded']);
  assert.equal(nightWakeCalls, 0);
  assert.equal(promptResolveCalls, 0);
});
