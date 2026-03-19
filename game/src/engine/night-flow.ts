import type { AdvancePhaseCommand } from '../domain/commands.js';
import type { DomainEvent } from '../domain/events.js';
import type { GameState, WakeQueueEntry } from '../domain/types.js';
import type { TimingCategory } from '../plugins/contracts.js';
import type { PluginRegistry } from '../plugins/registry.js';
import type { EngineResult } from './phase-machine.js';
import {
  FIRST_NIGHT_SPECIAL_ORDER_BY_NUMBER,
  OTHER_NIGHT_SPECIAL_ORDER_BY_NUMBER,
  FIRST_NIGHT_ORDER_BY_CHARACTER_ID,
  OTHER_NIGHT_ORDER_BY_CHARACTER_ID
} from './night-order-tool.js';

function error(code: string, message: string): EngineResult<never> {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

export function handle_night_transition(
  state: GameState,
  command: AdvancePhaseCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  if (command.payload.phase !== 'night') {
    return error('invalid_night_transition_target', 'night transition must target night phase');
  }

  return {
    ok: true,
    value: [
      {
        event_key: `${command.command_id}:PhaseAdvanced`,
        event_id: 1,
        event_type: 'PhaseAdvanced',
        created_at,
        actor_id: command.actor_id,
        payload: {
          phase: 'night',
          subphase: command.payload.subphase,
          day_number: state.day_number,
          night_number: command.payload.night_number
        }
      }
    ]
  };
}

export function collect_night_wake_steps(state: GameState, plugin_registry: PluginRegistry): WakeQueueEntry[] {
  const wake_candidates: Array<{
    seat_index: number;
    player_id: string | null;
    character_id: string;
    night_order: number;
  }> = [];

  for (const [seat_index, player_id] of state.seat_order.entries()) {
    const player = state.players_by_id[player_id];
    if (!player || player.true_character_id === null) {
      continue;
    }
    const plugin = plugin_registry.get(player.true_character_id);
    if (!plugin) {
      continue;
    }
    if (!player.alive && !plugin.metadata.flags.can_function_while_dead) {
      continue;
    }
    if (!should_wake_for_phase(plugin.metadata.timing_category, state.phase)) {
      continue;
    }

    wake_candidates.push({
      seat_index,
      player_id,
      character_id: player.true_character_id,
      night_order: resolve_night_order(player.true_character_id, state.phase)
    });
  }

  const special_wake_candidates = collect_special_wake_candidates(state, plugin_registry);
  wake_candidates.push(...special_wake_candidates);

  wake_candidates.sort((left, right) => {
    if (left.night_order !== right.night_order) {
      return left.night_order - right.night_order;
    }
    return left.seat_index - right.seat_index;
  });

  const time_key = build_time_key(state);
  return wake_candidates.map((candidate, index) => {
    const global_order = index + 1;
    const wake_key = build_wake_key(time_key, global_order, candidate.player_id, candidate.character_id);
    return {
      wake_key,
      character_id: candidate.character_id,
      player_id: candidate.player_id
    };
  });
}

function build_time_key(state: Pick<GameState, 'phase' | 'day_number' | 'night_number'>): string {
  return state.phase === 'day' ? `d${state.day_number}` : `n${state.night_number}`;
}

function build_wake_key(
  time_key: string,
  global_order: number,
  player_id: string | null,
  character_id: string
): string {
  return `wake:${time_key}:${global_order}:${player_id ?? 'system'}:${character_id}`;
}

function collect_special_wake_candidates(
  state: GameState,
  plugin_registry: PluginRegistry
): Array<{
  seat_index: number;
  player_id: string | null;
  character_id: string;
  night_order: number;
}> {
  if (state.phase !== 'first_night' && state.phase !== 'night') {
    return [];
  }

  const special_ids =
    state.phase === 'first_night' ? FIRST_NIGHT_SPECIAL_ORDER_BY_NUMBER : OTHER_NIGHT_SPECIAL_ORDER_BY_NUMBER;

  const candidates: Array<{
    seat_index: number;
    player_id: string | null;
    character_id: string;
    night_order: number;
  }> = [];

  const non_traveller_count = Object.values(state.players_by_id).filter((player) => !player.is_traveller).length;
  for (const special_id of special_ids) {
    const plugin = plugin_registry.get(special_id);
    if (!plugin) {
      continue;
    }
    if (!should_wake_for_phase(plugin.metadata.timing_category, state.phase)) {
      continue;
    }

    if ((special_id === 'minioninfo' || special_id === 'demoninfo') && non_traveller_count < 7) {
      continue;
    }

    const owner = resolve_special_owner(state, special_id);
    candidates.push({
      seat_index: owner ? state.seat_order.indexOf(owner.player_id) : Number.MAX_SAFE_INTEGER,
      player_id: null,
      character_id: special_id,
      night_order: resolve_night_order(special_id, state.phase)
    });
  }

  return candidates;
}

function resolve_special_owner(
  state: GameState,
  special_id: string
): { player_id: string } | null {
  if (special_id === 'minioninfo') {
    for (const player_id of state.seat_order) {
      const player = state.players_by_id[player_id];
      if (player && !player.is_traveller && player.true_character_type === 'minion') {
        return { player_id };
      }
    }
    return null;
  }

  if (special_id === 'demoninfo') {
    for (const player_id of state.seat_order) {
      const player = state.players_by_id[player_id];
      if (player && !player.is_traveller && player.true_character_type === 'demon') {
        return { player_id };
      }
    }
    return null;
  }

  return null;
}

function should_wake_for_phase(
  timing_category: TimingCategory,
  phase: GameState['phase']
): boolean {
  if (phase === 'first_night') {
    return timing_category === 'first_night' || timing_category === 'each_night';
  }
  if (phase === 'night') {
    return timing_category === 'each_night' || timing_category === 'each_night_except_first';
  }
  return false;
}

function resolve_night_order(character_id: string, phase: GameState['phase']): number {
  if (phase === 'first_night') {
    return FIRST_NIGHT_ORDER_BY_CHARACTER_ID[character_id] ?? Number.MAX_SAFE_INTEGER;
  }
  if (phase === 'night') {
    return OTHER_NIGHT_ORDER_BY_CHARACTER_ID[character_id] ?? Number.MAX_SAFE_INTEGER;
  }
  return Number.MAX_SAFE_INTEGER;
}
