import type { AdvancePhaseCommand } from '../domain/commands.js';
import type { DomainEvent } from '../domain/events.js';
import type { GameState, WakeQueueEntry } from '../domain/types.js';
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
        event_id: `${command.command_id}:PhaseAdvanced`,
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
  const wake_steps: WakeQueueEntry[] = [];

  for (const [seat_index, player_id] of state.seat_order.entries()) {
    const player = state.players_by_id[player_id];
    if (!player || !player.alive || player.true_character_id === null) {
      continue;
    }
    if (!plugin_registry.has(player.true_character_id)) {
      continue;
    }

    wake_steps.push({
      wake_id: `wake:${state.night_number}:${seat_index}:${player_id}:${player.true_character_id}`,
      character_id: player.true_character_id,
      player_id
    });
  }

  return wake_steps;
}
