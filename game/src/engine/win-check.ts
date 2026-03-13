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

function has_executed_saint_death(state: GameState): boolean {
  for (const death of state.death_history) {
    if (death.reason !== 'execution') {
      continue;
    }
    const player = state.players_by_id[death.player_id];
    if (!player || player.true_character_id !== 'saint') {
      continue;
    }
    if (player.drunk || player.poisoned) {
      continue;
    }
    return true;
  }
  return false;
}

function has_functional_alive_mayor(state: GameState): boolean {
  return Object.values(state.players_by_id).some((player) => {
    return (
      player.alive &&
      player.true_character_id === 'mayor' &&
      !player.drunk &&
      !player.poisoned
    );
  });
}

function mayor_no_execution_win(state: GameState): boolean {
  if (state.phase !== 'day' || state.subphase !== 'execution_resolution') {
    return false;
  }
  if (!state.day_state.execution_attempted_today || state.day_state.execution_occurred_today) {
    return false;
  }
  if (count_alive_non_travellers(state) !== 3) {
    return false;
  }
  return has_functional_alive_mayor(state);
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

  const saint_executed = has_executed_saint_death(state);
  const good_wins = has_dead_demon(state) || mayor_no_execution_win(state);
  const evil_wins = saint_executed || count_alive_non_travellers(state) <= 2;

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

  if (saint_executed) {
    const reason = 'saint_executed';
    events.push({
      event_id: `${command.command_id}:GameWon`,
      event_type: 'GameWon',
      created_at,
      actor_id: command.actor_id,
      payload: {
        winning_team: 'evil',
        reason
      }
    });
    events.push({
      event_id: `${command.command_id}:GameEnded`,
      event_type: 'GameEnded',
      created_at,
      actor_id: command.actor_id,
      payload: {
        winning_team: 'evil',
        reason
      }
    });
    return {
      ok: true,
      value: events
    };
  }

  if (good_wins) {
    const reason = has_dead_demon(state) ? 'demon_died' : 'mayor_final_three_no_execution';
    events.push({
      event_id: `${command.command_id}:GameWon`,
      event_type: 'GameWon',
      created_at,
      actor_id: command.actor_id,
      payload: {
        winning_team: 'good',
        reason
      }
    });
    events.push({
      event_id: `${command.command_id}:GameEnded`,
      event_type: 'GameEnded',
      created_at,
      actor_id: command.actor_id,
      payload: {
        winning_team: 'good',
        reason
      }
    });
    return {
      ok: true,
      value: events
    };
  }

  if (evil_wins) {
    const reason = 'two_alive_non_travellers';
    events.push({
      event_id: `${command.command_id}:GameWon`,
      event_type: 'GameWon',
      created_at,
      actor_id: command.actor_id,
      payload: {
        winning_team: 'evil',
        reason
      }
    });
    events.push({
      event_id: `${command.command_id}:GameEnded`,
      event_type: 'GameEnded',
      created_at,
      actor_id: command.actor_id,
      payload: {
        winning_team: 'evil',
        reason
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
