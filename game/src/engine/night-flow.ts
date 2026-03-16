import type { AdvancePhaseCommand } from '../domain/commands.js';
import type { DomainEvent } from '../domain/events.js';
import type { GameState, WakeQueueEntry } from '../domain/types.js';
import type { TimingCategory } from '../plugins/contracts.js';
import type { PluginRegistry } from '../plugins/registry.js';
import type { EngineResult } from './phase-machine.js';

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
    player_id: string;
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
      wake_id: wake_key,
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
  player_id: string,
  character_id: string
): string {
  return `wake:${time_key}:${global_order}:${player_id}:${character_id}`;
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

// Sourced from data/nightorder.tool.json for currently implemented roles.
const FIRST_NIGHT_ORDER_BY_CHARACTER_ID: Readonly<Record<string, number>> = {
  poisoner: 32,
  washerwoman: 51,
  librarian: 52,
  investigator: 53,
  chef: 54,
  empath: 55,
  fortune_teller: 56,
  butler: 57,
  spy: 71
};

// Sourced from data/nightorder.tool.json for currently implemented roles.
const OTHER_NIGHT_ORDER_BY_CHARACTER_ID: Readonly<Record<string, number>> = {
  poisoner: 17,
  monk: 24,
  scarlet_woman: 33,
  imp: 40,
  ravenkeeper: 75,
  empath: 76,
  fortune_teller: 77,
  undertaker: 78,
  butler: 91,
  spy: 92
};
