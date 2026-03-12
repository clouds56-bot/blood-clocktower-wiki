import type { AdvancePhaseCommand } from '../domain/commands.js';
import type { DomainEvent } from '../domain/events.js';
import type { GameState } from '../domain/types.js';

export interface EngineError {
  code: string;
  message: string;
}

export type EngineResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: EngineError;
    };

function error(code: string, message: string): EngineResult<never> {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

function is_valid_phase_transition(from_phase: GameState['phase'], to_phase: GameState['phase']): boolean {
  if (from_phase === to_phase) {
    return true;
  }
  if (from_phase === 'setup' && to_phase === 'first_night') {
    return true;
  }
  if (from_phase === 'first_night' && to_phase === 'day') {
    return true;
  }
  if (from_phase === 'day' && to_phase === 'night') {
    return true;
  }
  if (from_phase === 'night' && to_phase === 'day') {
    return true;
  }
  if (to_phase === 'ended') {
    return true;
  }
  return false;
}

function is_valid_subphase_for_phase(
  phase: GameState['phase'],
  subphase: GameState['subphase']
): boolean {
  if (phase === 'setup') {
    return subphase === 'idle';
  }
  if (phase === 'first_night') {
    return subphase === 'dusk' || subphase === 'night_wake_sequence' || subphase === 'immediate_interrupt_resolution' || subphase === 'dawn';
  }
  if (phase === 'day') {
    return (
      subphase === 'open_discussion' ||
      subphase === 'nomination_window' ||
      subphase === 'vote_in_progress' ||
      subphase === 'execution_resolution' ||
      subphase === 'day_end'
    );
  }
  if (phase === 'night') {
    return subphase === 'dusk' || subphase === 'night_wake_sequence' || subphase === 'immediate_interrupt_resolution' || subphase === 'dawn';
  }
  return phase === 'ended' && subphase === 'complete';
}

export function handle_advance_phase(
  state: GameState,
  command: AdvancePhaseCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  const next_phase = command.payload.phase;
  const next_subphase = command.payload.subphase;

  if (!is_valid_phase_transition(state.phase, next_phase)) {
    return error(
      'invalid_phase_transition',
      `cannot transition phase from ${state.phase} to ${next_phase}`
    );
  }

  if (!is_valid_subphase_for_phase(next_phase, next_subphase)) {
    return error(
      'invalid_subphase_for_phase',
      `subphase ${next_subphase} is invalid for phase ${next_phase}`
    );
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
          phase: next_phase,
          subphase: next_subphase,
          day_number: command.payload.day_number,
          night_number: command.payload.night_number
        }
      }
    ]
  };
}
