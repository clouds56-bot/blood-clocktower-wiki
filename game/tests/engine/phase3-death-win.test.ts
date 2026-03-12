import assert from 'node:assert/strict';
import test from 'node:test';

import type { Command } from '../../src/domain/commands.js';
import { apply_events } from '../../src/domain/reducer.js';
import { create_initial_state } from '../../src/domain/state.js';
import type { GameState } from '../../src/domain/types.js';
import { handle_command } from '../../src/engine/command-handler.js';

function bootstrap_day_state(): GameState {
  const seed = create_initial_state('g1');
  return apply_events(seed, [
    {
      event_id: 'e1',
      event_type: 'PlayerAdded',
      created_at: '2026-03-12T00:00:00.000Z',
      payload: { player_id: 'p1', display_name: 'Alice' }
    },
    {
      event_id: 'e2',
      event_type: 'PlayerAdded',
      created_at: '2026-03-12T00:00:01.000Z',
      payload: { player_id: 'p2', display_name: 'Bob' }
    },
    {
      event_id: 'e3',
      event_type: 'PlayerAdded',
      created_at: '2026-03-12T00:00:02.000Z',
      payload: { player_id: 'p3', display_name: 'Cara' }
    },
    {
      event_id: 'e4',
      event_type: 'PhaseAdvanced',
      created_at: '2026-03-12T00:00:03.000Z',
      payload: { phase: 'day', subphase: 'open_discussion', day_number: 1, night_number: 1 }
    }
  ]);
}

function run_command(state: GameState, command: Command, created_at = '2026-03-12T01:00:00.000Z'): GameState {
  const result = handle_command(state, command, created_at);
  if (!result.ok) {
    throw new Error(`${result.error.code}:${result.error.message}`);
  }
  return apply_events(state, result.value);
}

function run_command_result(
  state: GameState,
  command: Command,
  created_at = '2026-03-12T01:00:00.000Z'
) {
  return handle_command(state, command, created_at);
}

function create_execution_state(): GameState {
  let state = bootstrap_day_state();
  state = run_command(state, {
    command_id: 'c-open',
    command_type: 'OpenNominationWindow',
    payload: { day_number: 1 }
  });
  state = run_command(state, {
    command_id: 'c-nom1',
    command_type: 'NominatePlayer',
    payload: {
      nomination_id: 'n1',
      day_number: 1,
      nominator_player_id: 'p1',
      nominee_player_id: 'p2'
    }
  });
  state = run_command(state, {
    command_id: 'c-v-open',
    command_type: 'OpenVote',
    payload: {
      nomination_id: 'n1',
      nominee_player_id: 'p2',
      opened_by_player_id: 'p1'
    }
  });
  state = run_command(state, {
    command_id: 'c-v1',
    command_type: 'CastVote',
    payload: {
      nomination_id: 'n1',
      voter_player_id: 'p1',
      in_favor: true
    }
  });
  state = run_command(state, {
    command_id: 'c-v2',
    command_type: 'CastVote',
    payload: {
      nomination_id: 'n1',
      voter_player_id: 'p2',
      in_favor: true
    }
  });
  state = run_command(state, {
    command_id: 'c-v-close',
    command_type: 'CloseVote',
    payload: {
      nomination_id: 'n1',
      day_number: 1
    }
  });
  state = run_command(state, {
    command_id: 'c-resolve',
    command_type: 'ResolveExecution',
    payload: { day_number: 1 }
  });
  return state;
}

test('executed player dies path', () => {
  let state = create_execution_state();
  state = run_command(state, {
    command_id: 'c-conseq',
    command_type: 'ResolveExecutionConsequences',
    payload: { day_number: 1 }
  });

  assert.equal(state.players_by_id.p2?.alive, false);
  assert.equal(state.day_state.execution_outcome, 'died');
  assert.equal(state.day_state.execution_consequences_resolved_today, true);
});

test('executed player survives path', () => {
  let state = create_execution_state();
  state = run_command(state, {
    command_id: 'c-survive',
    command_type: 'MarkPlayerSurvivedExecution',
    payload: { player_id: 'p2', day_number: 1 }
  });

  assert.equal(state.players_by_id.p2?.alive, true);
  assert.equal(state.day_state.execution_outcome, 'survived');
  assert.equal(state.day_state.execution_consequences_resolved_today, true);
});

test('dead player cannot die again', () => {
  let state = bootstrap_day_state();
  state = run_command(state, {
    command_id: 'c-death-1',
    command_type: 'ApplyDeath',
    payload: {
      player_id: 'p1',
      reason: 'ability',
      day_number: 1,
      night_number: 1
    }
  });

  const secondDeath = run_command_result(state, {
    command_id: 'c-death-2',
    command_type: 'ApplyDeath',
    payload: {
      player_id: 'p1',
      reason: 'ability',
      day_number: 1,
      night_number: 1
    }
  });

  assert.equal(secondDeath.ok, false);
  if (!secondDeath.ok) {
    assert.equal(secondDeath.error.code, 'dead_player_cannot_die_again');
  }
});

test('dead player first vote consumes token and second vote is rejected', () => {
  let state = bootstrap_day_state();
  state = run_command(state, {
    command_id: 'c-death',
    command_type: 'ApplyDeath',
    payload: {
      player_id: 'p3',
      reason: 'ability',
      day_number: 1,
      night_number: 1
    }
  });
  state = run_command(state, {
    command_id: 'c-open',
    command_type: 'OpenNominationWindow',
    payload: { day_number: 1 }
  });
  state = run_command(state, {
    command_id: 'c-nom1',
    command_type: 'NominatePlayer',
    payload: {
      nomination_id: 'n1',
      day_number: 1,
      nominator_player_id: 'p1',
      nominee_player_id: 'p2'
    }
  });
  state = run_command(state, {
    command_id: 'c-v-open',
    command_type: 'OpenVote',
    payload: {
      nomination_id: 'n1',
      nominee_player_id: 'p2',
      opened_by_player_id: 'p1'
    }
  });
  state = run_command(state, {
    command_id: 'c-v-dead-1',
    command_type: 'CastVote',
    payload: {
      nomination_id: 'n1',
      voter_player_id: 'p3',
      in_favor: true
    }
  });

  assert.equal(state.players_by_id.p3?.dead_vote_available, false);

  const secondDeadVote = run_command_result(state, {
    command_id: 'c-v-dead-2',
    command_type: 'CastVote',
    payload: {
      nomination_id: 'n1',
      voter_player_id: 'p3',
      in_favor: true
    }
  });
  assert.equal(secondDeadVote.ok, false);
  if (!secondDeadVote.ok) {
    assert.equal(secondDeadVote.error.code, 'dead_vote_not_available');
  }
});

test('good wins when demon dies', () => {
  let state = bootstrap_day_state();
  state = run_command(state, {
    command_id: 'c-assign-demon',
    command_type: 'AssignCharacter',
    payload: {
      player_id: 'p2',
      true_character_id: 'imp',
      is_demon: true
    }
  });
  state = run_command(state, {
    command_id: 'c-kill-demon',
    command_type: 'ApplyDeath',
    payload: {
      player_id: 'p2',
      reason: 'execution',
      day_number: 1,
      night_number: 1
    }
  });
  state = run_command(state, {
    command_id: 'c-check-win',
    command_type: 'CheckWinConditions',
    payload: { day_number: 1, night_number: 1 }
  });

  assert.equal(state.status, 'ended');
  assert.equal(state.winning_team, 'good');
});

test('evil wins when two non-traveller players alive', () => {
  let state = bootstrap_day_state();
  state = run_command(state, {
    command_id: 'c-kill-p1',
    command_type: 'ApplyDeath',
    payload: {
      player_id: 'p1',
      reason: 'ability',
      day_number: 1,
      night_number: 1
    }
  });
  state = run_command(state, {
    command_id: 'c-check-win',
    command_type: 'CheckWinConditions',
    payload: { day_number: 1, night_number: 1 }
  });

  assert.equal(state.status, 'ended');
  assert.equal(state.winning_team, 'evil');
});

test('travellers are excluded from evil two-alive check', () => {
  let state = bootstrap_day_state();
  state = run_command(state, {
    command_id: 'c-add-traveller',
    command_type: 'AddPlayer',
    payload: {
      player_id: 'p4',
      display_name: 'Trev'
    }
  });
  state = run_command(state, {
    command_id: 'c-make-traveller',
    command_type: 'AssignCharacter',
    payload: {
      player_id: 'p4',
      true_character_id: 'judge',
      is_traveller: true
    }
  });
  state = run_command(state, {
    command_id: 'c-check-win',
    command_type: 'CheckWinConditions',
    payload: { day_number: 1, night_number: 1 }
  });

  assert.equal(state.status, 'in_progress');
  assert.equal(state.winning_team, null);
});

test('forced victory ends game with rationale', () => {
  let state = bootstrap_day_state();
  state = run_command(state, {
    command_id: 'c-forced',
    command_type: 'DeclareForcedVictory',
    payload: {
      winning_team: 'evil',
      rationale: 'deterministic_lock'
    }
  });

  assert.equal(state.status, 'ended');
  assert.equal(state.winning_team, 'evil');
  assert.equal(state.end_reason, 'deterministic_lock');
});

test('mutating commands are rejected after game ended', () => {
  let state = bootstrap_day_state();
  state = run_command(state, {
    command_id: 'c-forced',
    command_type: 'DeclareForcedVictory',
    payload: {
      winning_team: 'good',
      rationale: 'manual_end'
    }
  });

  const result = run_command_result(state, {
    command_id: 'c-open',
    command_type: 'OpenNominationWindow',
    payload: { day_number: 1 }
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'game_already_ended');
  }
});
