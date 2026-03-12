import type { CheckWinConditionsCommand, DeclareForcedVictoryCommand } from '../domain/commands.js';
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

function has_dead_demon(state: GameState): boolean {
  for (const player of Object.values(state.players_by_id)) {
    if (!player.alive && player.is_demon) {
      return true;
    }
  }
  return false;
}

function count_alive_non_travellers(state: GameState): number {
  return Object.values(state.players_by_id).filter((player) => player.alive && !player.is_traveller).length;
}

export function handle_check_win_conditions(
  state: GameState,
  command: CheckWinConditionsCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  if (state.status === 'ended') {
    return error('game_already_ended', 'cannot check win conditions after game ended');
  }

  if (state.day_number !== command.payload.day_number || state.night_number !== command.payload.night_number) {
    return error(
      'clock_mismatch',
      `day/night mismatch, expected d${state.day_number} n${state.night_number} got d${command.payload.day_number} n${command.payload.night_number}`
    );
  }

  const events: DomainEvent[] = [];

  const good_wins = has_dead_demon(state);
  const evil_wins = count_alive_non_travellers(state) <= 2;

  events.push({
    event_id: `${command.command_id}:WinCheckCompleted`,
    event_type: 'WinCheckCompleted',
    created_at,
    actor_id: command.actor_id,
    payload: {
      day_number: state.day_number,
      night_number: state.night_number,
      winner_found: good_wins || evil_wins
    }
  });

  if (good_wins) {
    events.push({
      event_id: `${command.command_id}:GameWon`,
      event_type: 'GameWon',
      created_at,
      actor_id: command.actor_id,
      payload: {
        winning_team: 'good',
        reason: 'demon_died'
      }
    });
    events.push({
      event_id: `${command.command_id}:GameEnded`,
      event_type: 'GameEnded',
      created_at,
      actor_id: command.actor_id,
      payload: {
        winning_team: 'good',
        reason: 'demon_died'
      }
    });
    return {
      ok: true,
      value: events
    };
  }

  if (evil_wins) {
    events.push({
      event_id: `${command.command_id}:GameWon`,
      event_type: 'GameWon',
      created_at,
      actor_id: command.actor_id,
      payload: {
        winning_team: 'evil',
        reason: 'two_alive_non_travellers'
      }
    });
    events.push({
      event_id: `${command.command_id}:GameEnded`,
      event_type: 'GameEnded',
      created_at,
      actor_id: command.actor_id,
      payload: {
        winning_team: 'evil',
        reason: 'two_alive_non_travellers'
      }
    });
  }

  return {
    ok: true,
    value: events
  };
}

export function handle_declare_forced_victory(
  state: GameState,
  command: DeclareForcedVictoryCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  if (state.status === 'ended') {
    return error('game_already_ended', 'cannot declare forced victory after game ended');
  }

  return {
    ok: true,
    value: [
      {
        event_id: `${command.command_id}:ForcedVictoryDeclared`,
        event_type: 'ForcedVictoryDeclared',
        created_at,
        actor_id: command.actor_id,
        payload: {
          winning_team: command.payload.winning_team,
          rationale: command.payload.rationale
        }
      },
      {
        event_id: `${command.command_id}:GameEnded`,
        event_type: 'GameEnded',
        created_at,
        actor_id: command.actor_id,
        payload: {
          winning_team: command.payload.winning_team,
          reason: command.payload.rationale
        }
      }
    ]
  };
}
