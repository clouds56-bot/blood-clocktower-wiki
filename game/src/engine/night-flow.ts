import type { AdvancePhaseCommand } from '../domain/commands.js';
import type { DomainEvent } from '../domain/events.js';
import type { GameState } from '../domain/types.js';
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
