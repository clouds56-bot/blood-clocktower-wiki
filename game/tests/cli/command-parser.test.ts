import assert from 'node:assert/strict';
import test from 'node:test';

import { parse_cli_line } from '../../src/cli/command-parser.js';
import { create_initial_state } from '../../src/domain/state.js';
import type { GameState } from '../../src/domain/types.js';

function make_cli_state(): GameState {
  const state = create_initial_state('g1');
  state.phase = 'day';
  state.status = 'in_progress';
  state.day_number = 1;
  state.night_number = 1;
  state.players_by_id = {
    p1: {
      player_id: 'p1',
      display_name: 'P1',
      alive: true,
      dead_vote_available: true,
      true_character_id: null,
      perceived_character_id: null,
      true_alignment: null,
      registered_character_id: null,
      registered_alignment: null,
      drunk: false,
      poisoned: false,
      is_traveller: false,
      is_demon: false
    },
    p2: {
      player_id: 'p2',
      display_name: 'P2',
      alive: true,
      dead_vote_available: true,
      true_character_id: null,
      perceived_character_id: null,
      true_alignment: null,
      registered_character_id: null,
      registered_alignment: null,
      drunk: false,
      poisoned: false,
      is_traveller: false,
      is_demon: false
    }
  };
  state.seat_order = ['p1', 'p2'];
  state.day_state.nominations_today.push({
    nomination_id: 'n1',
    day_number: 1,
    nominator_player_id: 'p1',
    nominee_player_id: 'p2',
    vote_total: null,
    threshold: null
  });
  state.day_state.active_vote = {
    nomination_id: 'n1',
    nominee_player_id: 'p2',
    opened_by_player_id: 'p1',
    votes_by_player_id: {}
  };
  state.day_state.executed_player_id = 'p2';
  return state;
}

test('parse local commands', () => {
  const state = parse_cli_line('state');
  assert.equal(state.ok, true);
  if (state.ok) {
    assert.equal(state.kind, 'local');
  }

  const nextPhase = parse_cli_line('next-phase');
  assert.equal(nextPhase.ok, true);
  if (nextPhase.ok && nextPhase.kind === 'local') {
    assert.equal(nextPhase.action.type, 'next_phase');
  }

  const nextAlias = parse_cli_line('next');
  assert.equal(nextAlias.ok, true);
  if (nextAlias.ok && nextAlias.kind === 'local') {
    assert.equal(nextAlias.action.type, 'next_phase');
  }

  const nAlias = parse_cli_line('n');
  assert.equal(nAlias.ok, true);
  if (nAlias.ok && nAlias.kind === 'local') {
    assert.equal(nAlias.action.type, 'next_phase');
  }

  const events = parse_cli_line('events 5');
  assert.equal(events.ok, true);
  if (events.ok && events.kind === 'local' && events.action.type === 'events') {
    assert.equal(events.action.count, 5);
  }
});

test('parse engine nominate command', () => {
  const parsed = parse_cli_line('nominate n1 1 p1 p2');
  assert.equal(parsed.ok, true);
  if (parsed.ok && parsed.kind === 'engine') {
    assert.equal(parsed.command.command_type, 'NominatePlayer');
    assert.deepEqual(parsed.command.payload, {
      nomination_id: 'n1',
      day_number: 1,
      nominator_player_id: 'p1',
      nominee_player_id: 'p2'
    });
  }

  const alias = parse_cli_line('nom n1 1 p1 p2');
  assert.equal(alias.ok, true);
  if (alias.ok && alias.kind === 'engine') {
    assert.equal(alias.command.command_type, 'NominatePlayer');
  }
});

test('parse assign-character flags', () => {
  const parsed = parse_cli_line('assign-character p2 imp --demon');
  assert.equal(parsed.ok, true);
  if (parsed.ok && parsed.kind === 'engine' && parsed.command.command_type === 'AssignCharacter') {
    assert.deepEqual(parsed.command, {
      command_type: 'AssignCharacter',
      payload: {
        player_id: 'p2',
        true_character_id: 'imp',
        is_demon: true,
        is_traveller: false
      }
    });
  }
});

test('invalid command gives usage', () => {
  const parsed = parse_cli_line('vote n1 p1 maybe');
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.match(parsed.message, /usage: vote/);
  }
});

test('auto-fills command params from state', () => {
  const state = make_cli_state();

  const openNoms = parse_cli_line('open-noms', state);
  assert.equal(openNoms.ok, true);
  if (openNoms.ok && openNoms.kind === 'engine' && openNoms.command.command_type === 'OpenNominationWindow') {
    assert.deepEqual(openNoms.command, {
      command_type: 'OpenNominationWindow',
      payload: { day_number: 1 }
    });
  }

  const nominate = parse_cli_line('nominate p1 p2', state);
  assert.equal(nominate.ok, true);
  if (nominate.ok && nominate.kind === 'engine' && nominate.command.command_type === 'NominatePlayer') {
    assert.deepEqual(nominate.command, {
      command_type: 'NominatePlayer',
      payload: {
        nomination_id: 'n2',
        day_number: 1,
        nominator_player_id: 'p1',
        nominee_player_id: 'p2'
      }
    });
  }

  const openVote = parse_cli_line('open-vote', state);
  assert.equal(openVote.ok, true);
  if (openVote.ok && openVote.kind === 'engine' && openVote.command.command_type === 'OpenVote') {
    assert.deepEqual(openVote.command, {
      command_type: 'OpenVote',
      payload: {
        nomination_id: 'n1',
        nominee_player_id: 'p2',
        opened_by_player_id: 'p1'
      }
    });
  }

  const vote = parse_cli_line('vote p1 yes', state);
  assert.equal(vote.ok, true);
  if (vote.ok && vote.kind === 'engine' && vote.command.command_type === 'CastVote') {
    assert.deepEqual(vote.command, {
      command_type: 'CastVote',
      payload: {
        nomination_id: 'n1',
        voter_player_id: 'p1',
        in_favor: true
      }
    });
  }

  const bulkVoteDefaultYes = parse_cli_line('vote p1 p2', state);
  assert.equal(bulkVoteDefaultYes.ok, true);
  if (bulkVoteDefaultYes.ok && bulkVoteDefaultYes.kind === 'local') {
    assert.equal(bulkVoteDefaultYes.action.type, 'bulk_vote');
    if (bulkVoteDefaultYes.action.type === 'bulk_vote') {
      assert.equal(bulkVoteDefaultYes.action.nomination_id, 'n1');
      assert.deepEqual(bulkVoteDefaultYes.action.voter_player_ids, ['p1', 'p2']);
      assert.equal(bulkVoteDefaultYes.action.in_favor, true);
    }
  }

  const bulkVoteNo = parse_cli_line('vote p1 p2 no', state);
  assert.equal(bulkVoteNo.ok, true);
  if (bulkVoteNo.ok && bulkVoteNo.kind === 'local') {
    assert.equal(bulkVoteNo.action.type, 'bulk_vote');
    if (bulkVoteNo.action.type === 'bulk_vote') {
      assert.deepEqual(bulkVoteNo.action.voter_player_ids, ['p1', 'p2']);
      assert.equal(bulkVoteNo.action.in_favor, false);
    }
  }

  const resolveExec = parse_cli_line('resolve-exec', state);
  assert.equal(resolveExec.ok, true);
  if (
    resolveExec.ok &&
    resolveExec.kind === 'engine' &&
    resolveExec.command.command_type === 'ResolveExecution'
  ) {
    assert.deepEqual(resolveExec.command, {
      command_type: 'ResolveExecution',
      payload: { day_number: 1 }
    });
  }

  const resolveConseq = parse_cli_line('resolve-conseq', state);
  assert.equal(resolveConseq.ok, true);
  if (
    resolveConseq.ok &&
    resolveConseq.kind === 'engine' &&
    resolveConseq.command.command_type === 'ResolveExecutionConsequences'
  ) {
    assert.deepEqual(resolveConseq.command, {
      command_type: 'ResolveExecutionConsequences',
      payload: { day_number: 1 }
    });
  }

  const surviveExec = parse_cli_line('survive-exec', state);
  assert.equal(surviveExec.ok, true);
  if (
    surviveExec.ok &&
    surviveExec.kind === 'engine' &&
    surviveExec.command.command_type === 'MarkPlayerSurvivedExecution'
  ) {
    assert.deepEqual(surviveExec.command, {
      command_type: 'MarkPlayerSurvivedExecution',
      payload: {
        player_id: 'p2',
        day_number: 1
      }
    });
  }

  const checkWin = parse_cli_line('check-win', state);
  assert.equal(checkWin.ok, true);
  if (checkWin.ok && checkWin.kind === 'engine' && checkWin.command.command_type === 'CheckWinConditions') {
    assert.deepEqual(checkWin.command, {
      command_type: 'CheckWinConditions',
      payload: {
        day_number: 1,
        night_number: 1
      }
    });
  }

  const endDay = parse_cli_line('end-day', state);
  assert.equal(endDay.ok, true);
  if (endDay.ok && endDay.kind === 'engine' && endDay.command.command_type === 'EndDay') {
    assert.deepEqual(endDay.command, {
      command_type: 'EndDay',
      payload: { day_number: 1 }
    });
  }
});

test('auto-fill requires state when omitted fields are needed', () => {
  const openVote = parse_cli_line('open-vote');
  assert.equal(openVote.ok, false);
  if (!openVote.ok) {
    assert.match(openVote.message, /usage: open-vote/);
  }

  const vote = parse_cli_line('vote p1 yes');
  assert.equal(vote.ok, false);
  if (!vote.ok) {
    assert.match(vote.message, /usage: vote/);
  }
});
