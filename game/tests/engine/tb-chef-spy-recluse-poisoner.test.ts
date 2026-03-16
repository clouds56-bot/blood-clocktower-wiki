import assert from 'node:assert/strict';
import test from 'node:test';

import type { Command } from '../../src/domain/commands.js';
import { apply_events } from '../../src/domain/reducer.js';
import { create_initial_state } from '../../src/domain/state.js';
import type { GameState } from '../../src/domain/types.js';
import { chef_plugin } from '../../src/plugins/characters/chef.js';
import { mayor_plugin } from '../../src/plugins/characters/mayor.js';
import { poisoner_plugin } from '../../src/plugins/characters/poisoner.js';
import { recluse_plugin } from '../../src/plugins/characters/recluse.js';
import { spy_plugin } from '../../src/plugins/characters/spy.js';
import { PluginRegistry } from '../../src/plugins/registry.js';
import { handle_command } from '../../src/engine/command-handler.js';

function run_with_registry(state: GameState, command: Command, registry: PluginRegistry) {
  const result = handle_command(state, command, '2026-03-16T01:00:00.000Z', {
    plugin_registry: registry
  });
  if (!result.ok) {
    assert.fail(`unexpected engine error ${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

function bootstrap_four_player_state(): GameState {
  const seed = create_initial_state('g1');
  return apply_events(seed, [
    {
      event_id: 1,
      event_type: 'PlayerAdded',
      created_at: '2026-03-16T00:00:00.000Z',
      payload: { player_id: 'p1', display_name: 'Chef' }
    },
    {
      event_id: 2,
      event_type: 'PlayerAdded',
      created_at: '2026-03-16T00:00:01.000Z',
      payload: { player_id: 'p2', display_name: 'Spy' }
    },
    {
      event_id: 3,
      event_type: 'PlayerAdded',
      created_at: '2026-03-16T00:00:02.000Z',
      payload: { player_id: 'p3', display_name: 'Poisoner' }
    },
    {
      event_id: 4,
      event_type: 'PlayerAdded',
      created_at: '2026-03-16T00:00:03.000Z',
      payload: { player_id: 'p4', display_name: 'Recluse' }
    },
    {
      event_id: 5,
      event_type: 'SeatOrderSet',
      created_at: '2026-03-16T00:00:04.000Z',
      payload: { seat_order: ['p1', 'p2', 'p3', 'p4'] }
    },
    {
      event_id: 6,
      event_type: 'CharacterAssigned',
      created_at: '2026-03-16T00:00:05.000Z',
      payload: { player_id: 'p1', true_character_id: 'chef' }
    },
    {
      event_id: 7,
      event_type: 'CharacterAssigned',
      created_at: '2026-03-16T00:00:06.000Z',
      payload: { player_id: 'p2', true_character_id: 'spy' }
    },
    {
      event_id: 8,
      event_type: 'CharacterAssigned',
      created_at: '2026-03-16T00:00:07.000Z',
      payload: { player_id: 'p3', true_character_id: 'poisoner' }
    },
    {
      event_id: 9,
      event_type: 'CharacterAssigned',
      created_at: '2026-03-16T00:00:08.000Z',
      payload: { player_id: 'p4', true_character_id: 'recluse' }
    },
    {
      event_id: 10,
      event_type: 'AlignmentAssigned',
      created_at: '2026-03-16T00:00:09.000Z',
      payload: { player_id: 'p1', true_alignment: 'good' }
    },
    {
      event_id: 11,
      event_type: 'AlignmentAssigned',
      created_at: '2026-03-16T00:00:10.000Z',
      payload: { player_id: 'p2', true_alignment: 'evil' }
    },
    {
      event_id: 12,
      event_type: 'AlignmentAssigned',
      created_at: '2026-03-16T00:00:11.000Z',
      payload: { player_id: 'p3', true_alignment: 'evil' }
    },
    {
      event_id: 13,
      event_type: 'AlignmentAssigned',
      created_at: '2026-03-16T00:00:12.000Z',
      payload: { player_id: 'p4', true_alignment: 'good' }
    }
  ]);
}

function bootstrap_five_player_state_for_half_resolution(): GameState {
  const seed = create_initial_state('g2');
  return apply_events(seed, [
    {
      event_id: 14,
      event_type: 'PlayerAdded',
      created_at: '2026-03-16T00:10:00.000Z',
      payload: { player_id: 'p1', display_name: 'Chef' }
    },
    {
      event_id: 15,
      event_type: 'PlayerAdded',
      created_at: '2026-03-16T00:10:01.000Z',
      payload: { player_id: 'p2', display_name: 'Spy' }
    },
    {
      event_id: 16,
      event_type: 'PlayerAdded',
      created_at: '2026-03-16T00:10:02.000Z',
      payload: { player_id: 'p3', display_name: 'Recluse' }
    },
    {
      event_id: 17,
      event_type: 'PlayerAdded',
      created_at: '2026-03-16T00:10:03.000Z',
      payload: { player_id: 'p4', display_name: 'Mayor' }
    },
    {
      event_id: 18,
      event_type: 'PlayerAdded',
      created_at: '2026-03-16T00:10:04.000Z',
      payload: { player_id: 'p5', display_name: 'Poisoner' }
    },
    {
      event_id: 19,
      event_type: 'SeatOrderSet',
      created_at: '2026-03-16T00:10:05.000Z',
      payload: { seat_order: ['p1', 'p2', 'p3', 'p4', 'p5'] }
    },
    {
      event_id: 20,
      event_type: 'CharacterAssigned',
      created_at: '2026-03-16T00:10:06.000Z',
      payload: { player_id: 'p1', true_character_id: 'chef' }
    },
    {
      event_id: 21,
      event_type: 'CharacterAssigned',
      created_at: '2026-03-16T00:10:07.000Z',
      payload: { player_id: 'p2', true_character_id: 'spy' }
    },
    {
      event_id: 22,
      event_type: 'CharacterAssigned',
      created_at: '2026-03-16T00:10:08.000Z',
      payload: { player_id: 'p3', true_character_id: 'recluse' }
    },
    {
      event_id: 23,
      event_type: 'CharacterAssigned',
      created_at: '2026-03-16T00:10:09.000Z',
      payload: { player_id: 'p4', true_character_id: 'mayor' }
    },
    {
      event_id: 24,
      event_type: 'CharacterAssigned',
      created_at: '2026-03-16T00:10:10.000Z',
      payload: { player_id: 'p5', true_character_id: 'poisoner' }
    },
    {
      event_id: 25,
      event_type: 'AlignmentAssigned',
      created_at: '2026-03-16T00:10:11.000Z',
      payload: { player_id: 'p1', true_alignment: 'good' }
    },
    {
      event_id: 26,
      event_type: 'AlignmentAssigned',
      created_at: '2026-03-16T00:10:12.000Z',
      payload: { player_id: 'p2', true_alignment: 'evil' }
    },
    {
      event_id: 27,
      event_type: 'AlignmentAssigned',
      created_at: '2026-03-16T00:10:13.000Z',
      payload: { player_id: 'p3', true_alignment: 'good' }
    },
    {
      event_id: 28,
      event_type: 'AlignmentAssigned',
      created_at: '2026-03-16T00:10:14.000Z',
      payload: { player_id: 'p4', true_alignment: 'good' }
    },
    {
      event_id: 29,
      event_type: 'AlignmentAssigned',
      created_at: '2026-03-16T00:10:15.000Z',
      payload: { player_id: 'p5', true_alignment: 'evil' }
    }
  ]);
}

function start_first_night(state: GameState, registry: PluginRegistry): GameState {
  const phase_events = run_with_registry(
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
  return apply_events(state, phase_events);
}

function resolve_poisoner_and_get_events(
  state: GameState,
  registry: PluginRegistry,
  target_player_id: string,
  command_id: string
) {
  return run_with_registry(
    state,
    {
      command_id,
      command_type: 'ResolvePrompt',
      actor_id: 'storyteller',
      payload: {
        prompt_key: 'plugin:poisoner:night_poison:n1:p3',
        prompt_id: 'plugin:poisoner:night_poison:n1:p3',
        selected_option_id: target_player_id,
        freeform: null,
        notes: null
      }
    },
    registry
  );
}

test('baseline: after poisoner self-poisons, chef receives both spy/recluse registration prompts', () => {
  const registry = new PluginRegistry([poisoner_plugin, chef_plugin, spy_plugin, recluse_plugin]);
  let state = bootstrap_four_player_state();
  state = start_first_night(state, registry);

  const resolve_events = resolve_poisoner_and_get_events(state, registry, 'p3', 'c_resolve_self');
  const queued_prompt_ids = resolve_events
    .filter((event) => event.event_type === 'PromptQueued')
    .map((event) => String(event.payload.prompt_id));

  assert.equal(
    queued_prompt_ids.some((prompt_id) => prompt_id.startsWith('plugin:spy:registration:chef:p1:adjacent_pairs:')),
    true
  );
  assert.equal(
    queued_prompt_ids.some((prompt_id) => prompt_id.startsWith('plugin:recluse:registration:chef:p1:adjacent_pairs:')),
    true
  );
  assert.equal(queued_prompt_ids.some((prompt_id) => prompt_id.startsWith('plugin:chef:misinfo:')), false);
});

test('poisoned spy suppresses chef registration prompt from spy', () => {
  const registry = new PluginRegistry([poisoner_plugin, chef_plugin, spy_plugin, recluse_plugin]);
  let state = bootstrap_four_player_state();
  state = start_first_night(state, registry);

  const resolve_events = resolve_poisoner_and_get_events(state, registry, 'p2', 'c_resolve_spy');
  const queued_prompt_ids = resolve_events
    .filter((event) => event.event_type === 'PromptQueued')
    .map((event) => String(event.payload.prompt_id));

  assert.equal(
    queued_prompt_ids.some((prompt_id) => prompt_id.startsWith('plugin:spy:registration:chef:p1:adjacent_pairs:')),
    false
  );
  assert.equal(
    queued_prompt_ids.some((prompt_id) => prompt_id.startsWith('plugin:recluse:registration:chef:p1:adjacent_pairs:')),
    true
  );
});

test('poisoned recluse suppresses chef registration prompt from recluse', () => {
  const registry = new PluginRegistry([poisoner_plugin, chef_plugin, spy_plugin, recluse_plugin]);
  let state = bootstrap_four_player_state();
  state = start_first_night(state, registry);

  const resolve_events = resolve_poisoner_and_get_events(state, registry, 'p4', 'c_resolve_recluse');
  const queued_prompt_ids = resolve_events
    .filter((event) => event.event_type === 'PromptQueued')
    .map((event) => String(event.payload.prompt_id));

  assert.equal(
    queued_prompt_ids.some((prompt_id) => prompt_id.startsWith('plugin:recluse:registration:chef:p1:adjacent_pairs:')),
    false
  );
  assert.equal(
    queued_prompt_ids.some((prompt_id) => prompt_id.startsWith('plugin:spy:registration:chef:p1:adjacent_pairs:')),
    true
  );
});

test('poisoned chef suppresses registration prompts and receives misinformation prompt', () => {
  const registry = new PluginRegistry([poisoner_plugin, chef_plugin, spy_plugin, recluse_plugin]);
  let state = bootstrap_four_player_state();
  state = start_first_night(state, registry);

  const resolve_events = resolve_poisoner_and_get_events(state, registry, 'p1', 'c_resolve_chef');
  const queued_prompt_ids = resolve_events
    .filter((event) => event.event_type === 'PromptQueued')
    .map((event) => String(event.payload.prompt_id));

  assert.equal(queued_prompt_ids.some((prompt_id) => prompt_id.startsWith('plugin:chef:misinfo:n1:p1')), true);
  assert.equal(
    queued_prompt_ids.some((prompt_id) => prompt_id.includes(':registration:chef:p1:adjacent_pairs:')),
    false
  );
});

test('chef can emit final info after one registration resolution when remaining prompt is no longer needed', () => {
  const registry = new PluginRegistry([
    poisoner_plugin,
    chef_plugin,
    spy_plugin,
    recluse_plugin,
    mayor_plugin
  ]);
  let state = bootstrap_five_player_state_for_half_resolution();
  state = start_first_night(state, registry);

  const poisoner_resolve_events = run_with_registry(
    state,
    {
      command_id: 'c_half_poisoner',
      command_type: 'ResolvePrompt',
      actor_id: 'storyteller',
      payload: {
        prompt_key: 'plugin:poisoner:night_poison:n1:p5',
        prompt_id: 'plugin:poisoner:night_poison:n1:p5',
        selected_option_id: 'p5',
        freeform: null,
        notes: null
      }
    },
    registry
  );
  state = apply_events(state, poisoner_resolve_events);

  const queued_after_poisoner = poisoner_resolve_events
    .filter((event) => event.event_type === 'PromptQueued')
    .map((event) => String(event.payload.prompt_id));

  const spy_prompt_id = queued_after_poisoner.find((prompt_id) =>
    prompt_id.startsWith('plugin:spy:registration:chef:p1:adjacent_pairs:')
  );
  const recluse_prompt_id = queued_after_poisoner.find((prompt_id) =>
    prompt_id.startsWith('plugin:recluse:registration:chef:p1:adjacent_pairs:')
  );
  assert.ok(spy_prompt_id);
  assert.ok(recluse_prompt_id);

  const spy_resolve_events = run_with_registry(
    state,
    {
      command_id: 'c_half_spy',
      command_type: 'ResolvePrompt',
      actor_id: 'storyteller',
      payload: {
        prompt_key: spy_prompt_id,
        prompt_id: spy_prompt_id,
        selected_option_id: 'alignment:good',
        freeform: null,
        notes: null
      }
    },
    registry
  );

  const extract_note = (event: (typeof spy_resolve_events)[number]): string | null => {
    if (event.event_type !== 'StorytellerRulingRecorded') {
      return null;
    }
    const payload = event.payload as { note?: unknown };
    return typeof payload.note === 'string' ? payload.note : null;
  };

  const chef_info_note = spy_resolve_events.find(
    (event) => extract_note(event)?.startsWith('chef_info:p1:adjacent_evil_pairs=') === true
  );
  assert.ok(chef_info_note);
  assert.equal(extract_note(chef_info_note), 'chef_info:p1:adjacent_evil_pairs=0');
  assert.equal(spy_resolve_events.some((event) => event.event_type === 'PromptQueued'), false);

  const after_spy = apply_events(state, spy_resolve_events);
  assert.equal(after_spy.pending_prompts.includes(recluse_prompt_id), true);
});
