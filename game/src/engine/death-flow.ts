import type {
  ApplyDeathCommand,
  MarkPlayerSurvivedExecutionCommand,
  ResolveExecutionConsequencesCommand
} from '../domain/commands.js';
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

export function handle_resolve_execution_consequences(
  state: GameState,
  command: ResolveExecutionConsequencesCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  if (state.phase !== 'day' || state.subphase !== 'execution_resolution') {
    return error(
      'invalid_phase_for_execution_consequences',
      'resolve execution consequences requires day/execution_resolution'
    );
  }
  if (state.day_number !== command.payload.day_number) {
    return error(
      'day_number_mismatch',
      `day_number mismatch: expected ${state.day_number} but got ${command.payload.day_number}`
    );
  }
  if (state.day_state.execution_consequences_resolved_today) {
    return error(
      'execution_consequences_already_resolved',
      'execution consequences already resolved this day'
    );
  }

  if (!state.day_state.execution_occurred_today || !state.day_state.executed_player_id) {
    return {
      ok: true,
      value: [
        {
          event_id: `${command.command_id}:ExecutionConsequencesResolved`,
          event_type: 'ExecutionConsequencesResolved',
          created_at,
          actor_id: command.actor_id,
        payload: {
          day_number: state.day_number,
          player_id: null,
          outcome: 'none'
        }
      }
      ]
    };
  }

  const executed_player_id = state.day_state.executed_player_id;
  const player = state.players_by_id[executed_player_id];
  if (!player) {
    return error('executed_player_not_found', `executed player not found: ${executed_player_id}`);
  }
  if (!player.alive) {
    return {
      ok: true,
      value: [
        {
          event_id: `${command.command_id}:ExecutionConsequencesResolved`,
          event_type: 'ExecutionConsequencesResolved',
          created_at,
          actor_id: command.actor_id,
          payload: {
            day_number: state.day_number,
            player_id: executed_player_id,
            outcome: 'died'
          }
        }
      ]
    };
  }

  return {
    ok: true,
    value: [
      {
        event_id: `${command.command_id}:PlayerDied`,
        event_type: 'PlayerDied',
        created_at,
        actor_id: command.actor_id,
        payload: {
          player_id: executed_player_id,
          day_number: state.day_number,
          night_number: state.night_number,
          reason: 'execution'
        }
      },
      {
        event_id: `${command.command_id}:ExecutionConsequencesResolved`,
        event_type: 'ExecutionConsequencesResolved',
        created_at,
        actor_id: command.actor_id,
        payload: {
          day_number: state.day_number,
          player_id: executed_player_id,
          outcome: 'died'
        }
      }
    ]
  };
}

export function handle_apply_death(
  state: GameState,
  command: ApplyDeathCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  const player = state.players_by_id[command.payload.player_id];
  if (!player) {
    return error('player_not_found', `player not found: ${command.payload.player_id}`);
  }
  if (!player.alive) {
    return error('dead_player_cannot_die_again', 'dead players cannot die again');
  }

  return {
    ok: true,
    value: [
      {
        event_id: `${command.command_id}:PlayerDied`,
        event_type: 'PlayerDied',
        created_at,
        actor_id: command.actor_id,
        payload: {
          player_id: command.payload.player_id,
          day_number: command.payload.day_number,
          night_number: command.payload.night_number,
          reason: command.payload.reason
        }
      }
    ]
  };
}

export function handle_mark_player_survived_execution(
  state: GameState,
  command: MarkPlayerSurvivedExecutionCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  if (state.phase !== 'day' || state.subphase !== 'execution_resolution') {
    return error(
      'invalid_phase_for_survival_mark',
      'mark survived execution requires day/execution_resolution'
    );
  }
  if (state.day_number !== command.payload.day_number) {
    return error(
      'day_number_mismatch',
      `day_number mismatch: expected ${state.day_number} but got ${command.payload.day_number}`
    );
  }
  const player = state.players_by_id[command.payload.player_id];
  if (!player) {
    return error('player_not_found', `player not found: ${command.payload.player_id}`);
  }

  return {
    ok: true,
    value: [
      {
        event_id: `${command.command_id}:PlayerSurvivedExecution`,
        event_type: 'PlayerSurvivedExecution',
        created_at,
        actor_id: command.actor_id,
        payload: {
          day_number: command.payload.day_number,
          player_id: command.payload.player_id
        }
      },
      {
        event_id: `${command.command_id}:ExecutionConsequencesResolved`,
        event_type: 'ExecutionConsequencesResolved',
        created_at,
        actor_id: command.actor_id,
        payload: {
          day_number: command.payload.day_number,
          player_id: command.payload.player_id,
          outcome: 'survived'
        }
      }
    ]
  };
}
