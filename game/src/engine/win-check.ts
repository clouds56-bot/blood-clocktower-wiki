import type { CheckWinConditionsCommand, DeclareForcedVictoryCommand } from '../domain/commands.js';
import type { DomainEvent } from '../domain/events.js';
import { apply_events } from '../domain/reducer.js';
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

function has_alive_demon(state: GameState): boolean {
  for (const player of Object.values(state.players_by_id)) {
    if (player.alive && player.is_demon) {
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

function find_recent_dead_demon_id(state: GameState, day_number: number, night_number: number): string | null {
  for (let i = state.death_history.length - 1; i >= 0; i -= 1) {
    const death = state.death_history[i];
    if (!death) {
      continue;
    }
    if (death.day_number !== day_number || death.night_number !== night_number) {
      continue;
    }
    const player = state.players_by_id[death.player_id];
    if (!player || player.alive || !player.is_demon) {
      continue;
    }
    return death.player_id;
  }

  return null;
}

function find_scarlet_woman_takeover_candidate_id(state: GameState): string | null {
  for (const player_id of state.seat_order) {
    const player = state.players_by_id[player_id];
    if (!player || !player.alive) {
      continue;
    }
    if (player.true_character_id !== 'scarlet_woman') {
      continue;
    }
    if (player.drunk || player.poisoned) {
      continue;
    }
    return player_id;
  }

  for (const [player_id, player] of Object.entries(state.players_by_id)) {
    if (!player.alive || player.true_character_id !== 'scarlet_woman') {
      continue;
    }
    if (player.drunk || player.poisoned) {
      continue;
    }
    return player_id;
  }

  return null;
}

function build_scarlet_woman_continuity_events(
  state: GameState,
  command: CheckWinConditionsCommand,
  created_at: string
): DomainEvent[] {
  if (has_alive_demon(state)) {
    return [];
  }
  const dead_demon_id = find_recent_dead_demon_id(state, command.payload.day_number, command.payload.night_number);
  if (!dead_demon_id) {
    return [];
  }
  if (count_alive_non_travellers(state) < 4) {
    return [];
  }
  const scarlet_woman_id = find_scarlet_woman_takeover_candidate_id(state);
  if (!dead_demon_id || !scarlet_woman_id) {
    return [];
  }

  const dead_demon = state.players_by_id[dead_demon_id];
  if (!dead_demon) {
    return [];
  }

  return [
    {
      event_id: `${command.command_id}:DemonContinuity:FormerDemonDemoted`,
      event_type: 'CharacterAssigned',
      created_at,
      actor_id: command.actor_id,
      payload: {
        player_id: dead_demon_id,
        true_character_id: dead_demon.true_character_id ?? 'imp',
        true_character_type: 'demon',
        is_demon: false
      }
    },
    {
      event_id: `${command.command_id}:DemonContinuity:ScarletWomanPromoted`,
      event_type: 'CharacterAssigned',
      created_at,
      actor_id: command.actor_id,
      payload: {
        player_id: scarlet_woman_id,
        true_character_id: 'imp',
        true_character_type: 'demon',
        is_demon: true
      }
    },
    {
      event_id: `${command.command_id}:DemonContinuity:Recorded`,
      event_type: 'StorytellerRulingRecorded',
      created_at,
      actor_id: command.actor_id,
      payload: {
        prompt_id: null,
        note: `demon_continuity:scarlet_woman:${scarlet_woman_id}:from:${dead_demon_id}`
      }
    }
  ];
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
  const continuity_events = saint_executed
    ? []
    : build_scarlet_woman_continuity_events(state, command, created_at);

  if (continuity_events.length > 0) {
    events.push(...continuity_events);
  }

  const state_for_win_check = continuity_events.length > 0 ? apply_events(state, continuity_events) : state;

  const good_wins = has_dead_demon(state_for_win_check) || mayor_no_execution_win(state_for_win_check);
  const evil_wins = saint_executed || count_alive_non_travellers(state_for_win_check) <= 2;

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
    const reason = has_dead_demon(state_for_win_check)
      ? 'demon_died'
      : 'mayor_final_three_no_execution';
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
