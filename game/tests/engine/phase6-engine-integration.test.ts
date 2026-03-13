import assert from 'node:assert/strict';
import test from 'node:test';

import type { Command } from '../../src/domain/commands.js';
import { apply_events } from '../../src/domain/reducer.js';
import { create_initial_state } from '../../src/domain/state.js';
import type { GameState } from '../../src/domain/types.js';
import type { CharacterPlugin, CharacterPluginMetadata } from '../../src/plugins/contracts.js';
import { empty_plugin_result } from '../../src/plugins/contracts.js';
import { imp_plugin } from '../../src/plugins/characters/imp.js';
import { poisoner_plugin } from '../../src/plugins/characters/poisoner.js';
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

test('advance phase night wake boundary suspends further wakes when a prompt is pending', () => {
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
      'WakeScheduled',
      'PromptQueued',
      'InterruptScheduled',
      'WakeConsumed',
      'InterruptConsumed'
    ]
  );

  assert.equal(events.some((event) => event.event_type === 'PromptQueued' && event.payload.prompt_id === 'plugin:poisoner:night_poison'), false);
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

test('resolve prompt resumes suspended wake queue', () => {
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
            visibility: 'player',
            options: [{ option_id: 'p2', label: 'Bob' }]
          }
        ],
        queued_interrupts: []
      }),
      on_prompt_resolved: () => ({
        emitted_events: [],
        queued_prompts: [],
        queued_interrupts: []
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
            visibility: 'player',
            options: [{ option_id: 'p1', label: 'Alice' }]
          }
        ],
        queued_interrupts: []
      })
    }
  };

  let state = bootstrap_night_state();
  const registry = new PluginRegistry([imp, poisoner]);

  const phase_events = run_with_registry(
    state,
    {
      command_id: 'c_phase_resume',
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
  state = apply_events(state, phase_events);

  assert.equal(state.pending_prompts.includes('plugin:imp:night_kill'), true);
  assert.equal(state.pending_prompts.includes('plugin:poisoner:night_poison'), false);

  const resolve_events = run_with_registry(
    state,
    {
      command_id: 'c_resolve_resume',
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

  assert.equal(
    resolve_events.some(
      (event) => event.event_type === 'PromptQueued' && event.payload.prompt_id === 'plugin:poisoner:night_poison'
    ),
    true
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

test('imp does not wake on first night', () => {
  const state = bootstrap_night_state();
  const registry = new PluginRegistry([imp_plugin]);

  const events = run_with_registry(
    state,
    {
      command_id: 'c_phase_imp_first_night',
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

  assert.deepEqual(events.map((event) => event.event_type), ['PhaseAdvanced']);
});

test('imp plugin prompt resolves into death through engine flow', () => {
  let state = bootstrap_night_state();
  state.phase = 'night';
  state.subphase = 'dusk';
  state.day_number = 1;
  state.night_number = 1;
  const registry = new PluginRegistry([imp_plugin]);

  const wake_events = run_with_registry(
    state,
    {
      command_id: 'c_phase_imp',
      command_type: 'AdvancePhase',
      actor_id: 'storyteller',
      payload: {
        phase: 'night',
        subphase: 'night_wake_sequence',
        day_number: 1,
        night_number: 1
      }
    },
    registry
  );

  state = apply_events(state, wake_events);

  const imp_prompt = wake_events.find(
    (event) => event.event_type === 'PromptQueued' && event.payload.prompt_id.startsWith('plugin:imp:night_kill:')
  );
  assert.ok(imp_prompt);
  const imp_prompt_id =
    imp_prompt && imp_prompt.event_type === 'PromptQueued' ? imp_prompt.payload.prompt_id : null;
  assert.ok(imp_prompt_id);

  const resolve_events = run_with_registry(
    state,
    {
      command_id: 'c_resolve_imp_prompt',
      command_type: 'ResolvePrompt',
      actor_id: 'storyteller',
      payload: {
        prompt_id: imp_prompt_id!,
        selected_option_id: 'p2',
        freeform: null,
        notes: 'imp chooses Bob'
      }
    },
    registry
  );

  assert.equal(resolve_events.some((event) => event.event_type === 'WakeScheduled'), false);
  assert.equal(resolve_events.some((event) => event.event_type === 'PromptQueued'), false);
  assert.equal(resolve_events.some((event) => event.event_type === 'PlayerDied'), true);

  const resolved_state = apply_events(state, resolve_events);
  assert.equal(resolved_state.players_by_id.p2?.alive, false);
});

test('plugin runtime returns deterministic error on duplicate queued prompt id', () => {
  const registry = new PluginRegistry([
    {
      metadata: make_metadata('imp'),
      hooks: {
        on_prompt_resolved: () => ({
          emitted_events: [],
          queued_prompts: [
            {
              prompt_id: 'plugin:imp:night_kill:1:p1',
              kind: 'choice',
              reason: 'plugin:imp:choose night kill target',
              visibility: 'storyteller',
              options: []
            }
          ],
          queued_interrupts: []
        })
      }
    }
  ]);

  const state = apply_events(create_initial_state('g1'), [
    {
      event_id: 'e1',
      event_type: 'PromptQueued',
      created_at: '2026-03-14T00:00:00.000Z',
      payload: {
        prompt_id: 'plugin:imp:night_kill:1:p1',
        kind: 'choice',
        reason: 'plugin:imp:choose night kill target',
        visibility: 'storyteller',
        options: []
      }
    }
  ]);

  const result = handle_command(
    state,
    {
      command_id: 'c_dup_prompt',
      command_type: 'ResolvePrompt',
      actor_id: 'storyteller',
      payload: {
        prompt_id: 'plugin:imp:night_kill:1:p1',
        selected_option_id: null,
        freeform: null,
        notes: null
      }
    },
    '2026-03-14T01:00:00.000Z',
    {
      plugin_registry: registry
    }
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'prompt_id_already_exists');
  }
});

test('poisoner prompt resolves into reminder marker apply and clear flow', () => {
  let state = bootstrap_night_state();
  state.phase = 'night';
  state.subphase = 'dusk';
  state.day_number = 1;
  state.night_number = 1;

  const registry = new PluginRegistry([poisoner_plugin]);

  const wake_events = run_with_registry(
    state,
    {
      command_id: 'c_phase_poisoner_n1',
      command_type: 'AdvancePhase',
      actor_id: 'storyteller',
      payload: {
        phase: 'night',
        subphase: 'night_wake_sequence',
        day_number: 1,
        night_number: 1
      }
    },
    registry
  );
  state = apply_events(state, wake_events);

  const poisoner_prompt_n1 = wake_events.find(
    (event) =>
      event.event_type === 'PromptQueued' &&
      event.payload.prompt_id.startsWith('plugin:poisoner:night_poison:1:')
  );
  assert.ok(poisoner_prompt_n1 && poisoner_prompt_n1.event_type === 'PromptQueued');

  const resolve_n1_events = run_with_registry(
    state,
    {
      command_id: 'c_resolve_poisoner_n1',
      command_type: 'ResolvePrompt',
      actor_id: 'storyteller',
      payload: {
        prompt_id: poisoner_prompt_n1.payload.prompt_id,
        selected_option_id: 'p1',
        freeform: null,
        notes: null
      }
    },
    registry
  );
  assert.equal(resolve_n1_events.some((event) => event.event_type === 'ReminderMarkerApplied'), true);
  assert.equal(resolve_n1_events.some((event) => event.event_type === 'PoisonApplied'), true);
  state = apply_events(state, resolve_n1_events);
  assert.equal(state.players_by_id.p1?.poisoned, true);

  const phase_to_n2 = run_with_registry(
    state,
    {
      command_id: 'c_phase_to_n2',
      command_type: 'AdvancePhase',
      actor_id: 'storyteller',
      payload: {
        phase: 'night',
        subphase: 'night_wake_sequence',
        day_number: 2,
        night_number: 2
      }
    },
    registry
  );
  assert.equal(phase_to_n2.some((event) => event.event_type === 'ReminderMarkerExpired'), true);
  assert.equal(phase_to_n2.some((event) => event.event_type === 'HealthRestored'), true);
  state = apply_events(state, phase_to_n2);
  assert.equal(state.players_by_id.p1?.poisoned, false);

  const poisoner_prompt_n2 = phase_to_n2.find(
    (event) =>
      event.event_type === 'PromptQueued' &&
      event.payload.prompt_id.startsWith('plugin:poisoner:night_poison:2:')
  );
  assert.ok(poisoner_prompt_n2 && poisoner_prompt_n2.event_type === 'PromptQueued');

  const resolve_n2_events = run_with_registry(
    state,
    {
      command_id: 'c_resolve_poisoner_n2',
      command_type: 'ResolvePrompt',
      actor_id: 'storyteller',
      payload: {
        prompt_id: poisoner_prompt_n2.payload.prompt_id,
        selected_option_id: 'p2',
        freeform: null,
        notes: null
      }
    },
    registry
  );

  assert.equal(resolve_n2_events.some((event) => event.event_type === 'ReminderMarkerCleared'), false);
  assert.equal(resolve_n2_events.some((event) => event.event_type === 'ReminderMarkerApplied'), true);
  assert.equal(resolve_n2_events.some((event) => event.event_type === 'HealthRestored'), false);
  assert.equal(resolve_n2_events.some((event) => event.event_type === 'PoisonApplied'), true);

  const resolved_n2_state = apply_events(state, resolve_n2_events);
  assert.equal(resolved_n2_state.players_by_id.p1?.poisoned, false);
  assert.equal(resolved_n2_state.players_by_id.p2?.poisoned, true);
});

test('poisoned imp still wakes and chooses but kill effect is suppressed', () => {
  let state = create_initial_state('g1');
  state = apply_events(state, [
    {
      event_id: 'e1',
      event_type: 'PlayerAdded',
      created_at: '2026-03-14T00:00:00.000Z',
      payload: { player_id: 'p1', display_name: 'Poisoner' }
    },
    {
      event_id: 'e2',
      event_type: 'PlayerAdded',
      created_at: '2026-03-14T00:00:01.000Z',
      payload: { player_id: 'p2', display_name: 'Imp' }
    },
    {
      event_id: 'e3',
      event_type: 'PlayerAdded',
      created_at: '2026-03-14T00:00:02.000Z',
      payload: { player_id: 'p3', display_name: 'Target' }
    },
    {
      event_id: 'e4',
      event_type: 'SeatOrderSet',
      created_at: '2026-03-14T00:00:03.000Z',
      payload: { seat_order: ['p1', 'p2', 'p3'] }
    },
    {
      event_id: 'e5',
      event_type: 'CharacterAssigned',
      created_at: '2026-03-14T00:00:04.000Z',
      payload: { player_id: 'p1', true_character_id: 'poisoner' }
    },
    {
      event_id: 'e6',
      event_type: 'CharacterAssigned',
      created_at: '2026-03-14T00:00:05.000Z',
      payload: { player_id: 'p2', true_character_id: 'imp', is_demon: true }
    }
  ]);
  state.phase = 'night';
  state.subphase = 'dusk';
  state.day_number = 1;
  state.night_number = 1;

  const registry = new PluginRegistry([poisoner_plugin, imp_plugin]);

  const phase_events = run_with_registry(
    state,
    {
      command_id: 'c_phase_poison_imp',
      command_type: 'AdvancePhase',
      actor_id: 'storyteller',
      payload: {
        phase: 'night',
        subphase: 'night_wake_sequence',
        day_number: 1,
        night_number: 1
      }
    },
    registry
  );
  state = apply_events(state, phase_events);

  const poison_prompt = phase_events.find(
    (event) =>
      event.event_type === 'PromptQueued' &&
      event.payload.prompt_id.startsWith('plugin:poisoner:night_poison:1:p1')
  );
  assert.ok(poison_prompt && poison_prompt.event_type === 'PromptQueued');

  const resolve_events = run_with_registry(
    state,
    {
      command_id: 'c_resolve_poison_imp',
      command_type: 'ResolvePrompt',
      actor_id: 'storyteller',
      payload: {
        prompt_id: poison_prompt.payload.prompt_id,
        selected_option_id: 'p2',
        freeform: null,
        notes: null
      }
    },
    registry
  );

  assert.equal(resolve_events.some((event) => event.event_type === 'ReminderMarkerApplied'), true);
  assert.equal(resolve_events.some((event) => event.event_type === 'PoisonApplied'), true);
  assert.equal(
    resolve_events.some(
      (event) =>
        event.event_type === 'PromptQueued' &&
        event.payload.prompt_id.startsWith('plugin:imp:night_kill:')
    ),
    true
  );

  state = apply_events(state, resolve_events);
  const imp_prompt = resolve_events.find(
    (event) =>
      event.event_type === 'PromptQueued' &&
      event.payload.prompt_id.startsWith('plugin:imp:night_kill:1:p2')
  );
  assert.ok(imp_prompt && imp_prompt.event_type === 'PromptQueued');

  const resolve_imp_events = run_with_registry(
    state,
    {
      command_id: 'c_resolve_imp_poisoned',
      command_type: 'ResolvePrompt',
      actor_id: 'storyteller',
      payload: {
        prompt_id: imp_prompt.payload.prompt_id,
        selected_option_id: 'p3',
        freeform: null,
        notes: null
      }
    },
    registry
  );

  assert.equal(
    resolve_imp_events.some(
      (event) =>
        event.event_type === 'PlayerDied' &&
        event.payload.player_id === 'p3'
    ),
    false
  );
});
