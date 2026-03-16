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
  state.prompts_by_id.pr1 = {
    prompt_id: 'pr1',
    kind: 'choice',
    reason: 'test prompt',
    visibility: 'storyteller',
    options: [
      { option_id: 'opt_a', label: 'A' },
      { option_id: 'opt_b', label: 'B' }
    ],
    status: 'pending',
    created_at_event_id: 'e1',
    resolved_at_event_id: null,
    resolution_payload: null,
    notes: null
  };
  state.pending_prompts = ['pr1'];
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
    if (nextPhase.action.type === 'next_phase') {
      assert.equal(nextPhase.action.scope, 'subphase');
      assert.equal(nextPhase.action.auto_prompt, false);
    }
  }

  const nextAlias = parse_cli_line('next');
  assert.equal(nextAlias.ok, true);
  if (nextAlias.ok && nextAlias.kind === 'local') {
    assert.equal(nextAlias.action.type, 'next_phase');
    if (nextAlias.action.type === 'next_phase') {
      assert.equal(nextAlias.action.scope, 'subphase');
      assert.equal(nextAlias.action.auto_prompt, false);
    }
  }

  const nAlias = parse_cli_line('n');
  assert.equal(nAlias.ok, true);
  if (nAlias.ok && nAlias.kind === 'local') {
    assert.equal(nAlias.action.type, 'next_phase');
    if (nAlias.action.type === 'next_phase') {
      assert.equal(nAlias.action.scope, 'subphase');
      assert.equal(nAlias.action.auto_prompt, false);
    }
  }

  const nextAutoPrompt = parse_cli_line('next --auto');
  assert.equal(nextAutoPrompt.ok, true);
  if (nextAutoPrompt.ok && nextAutoPrompt.kind === 'local') {
    assert.equal(nextAutoPrompt.action.type, 'next_phase');
    if (nextAutoPrompt.action.type === 'next_phase') {
      assert.equal(nextAutoPrompt.action.scope, 'subphase');
      assert.equal(nextAutoPrompt.action.auto_prompt, true);
    }
  }

  const nextPhaseScope = parse_cli_line('next phase');
  assert.equal(nextPhaseScope.ok, true);
  if (nextPhaseScope.ok && nextPhaseScope.kind === 'local') {
    assert.equal(nextPhaseScope.action.type, 'next_phase');
    if (nextPhaseScope.action.type === 'next_phase') {
      assert.equal(nextPhaseScope.action.scope, 'phase');
      assert.equal(nextPhaseScope.action.auto_prompt, false);
    }
  }

  const nextDayAutoPrompt = parse_cli_line('next day --auto-prompt');
  assert.equal(nextDayAutoPrompt.ok, true);
  if (nextDayAutoPrompt.ok && nextDayAutoPrompt.kind === 'local') {
    assert.equal(nextDayAutoPrompt.action.type, 'next_phase');
    if (nextDayAutoPrompt.action.type === 'next_phase') {
      assert.equal(nextDayAutoPrompt.action.scope, 'day');
      assert.equal(nextDayAutoPrompt.action.auto_prompt, true);
    }
  }

  const nextSubphase = parse_cli_line('next subphase');
  assert.equal(nextSubphase.ok, true);
  if (nextSubphase.ok && nextSubphase.kind === 'local') {
    assert.equal(nextSubphase.action.type, 'next_phase');
    if (nextSubphase.action.type === 'next_phase') {
      assert.equal(nextSubphase.action.scope, 'subphase');
      assert.equal(nextSubphase.action.auto_prompt, false);
    }
  }

  const events = parse_cli_line('events 5');
  assert.equal(events.ok, true);
  if (events.ok && events.kind === 'local' && events.action.type === 'events') {
    assert.equal(events.action.count, 5);
  }

  const prompts = parse_cli_line('prompts');
  assert.equal(prompts.ok, true);
  if (prompts.ok && prompts.kind === 'local') {
    assert.equal(prompts.action.type, 'prompts');
  }

  const prompt = parse_cli_line('prompt pr1');
  assert.equal(prompt.ok, true);
  if (prompt.ok && prompt.kind === 'local' && prompt.action.type === 'prompt') {
    assert.equal(prompt.action.prompt_id, 'pr1');
  }

  const reminders = parse_cli_line('reminders');
  assert.equal(reminders.ok, true);
  if (reminders.ok && reminders.kind === 'local') {
    assert.equal(reminders.action.type, 'markers');
  }

  const reminder = parse_cli_line('reminder mk1');
  assert.equal(reminder.ok, true);
  if (reminder.ok && reminder.kind === 'local' && reminder.action.type === 'marker') {
    assert.equal(reminder.action.marker_id, 'mk1');
  }

  const viewStoryteller = parse_cli_line('view storyteller');
  assert.equal(viewStoryteller.ok, true);
  if (viewStoryteller.ok && viewStoryteller.kind === 'local') {
    assert.equal(viewStoryteller.action.type, 'view_storyteller');
    if (viewStoryteller.action.type === 'view_storyteller') {
      assert.equal(viewStoryteller.action.json, false);
    }
  }

  const viewStorytellerAlias = parse_cli_line('view st --json');
  assert.equal(viewStorytellerAlias.ok, true);
  if (viewStorytellerAlias.ok && viewStorytellerAlias.kind === 'local') {
    assert.equal(viewStorytellerAlias.action.type, 'view_storyteller');
    if (viewStorytellerAlias.action.type === 'view_storyteller') {
      assert.equal(viewStorytellerAlias.action.json, true);
    }
  }

  const viewPublic = parse_cli_line('view public');
  assert.equal(viewPublic.ok, true);
  if (viewPublic.ok && viewPublic.kind === 'local') {
    assert.equal(viewPublic.action.type, 'view_public');
    if (viewPublic.action.type === 'view_public') {
      assert.equal(viewPublic.action.json, false);
    }
  }

  const viewPlayer = parse_cli_line('view player p1');
  assert.equal(viewPlayer.ok, true);
  if (viewPlayer.ok && viewPlayer.kind === 'local' && viewPlayer.action.type === 'view_player') {
    assert.equal(viewPlayer.action.player_id, 'p1');
    assert.equal(viewPlayer.action.json, false);
  }

  const viewPlayerAlias = parse_cli_line('view p1 --json');
  assert.equal(viewPlayerAlias.ok, true);
  if (viewPlayerAlias.ok && viewPlayerAlias.kind === 'local' && viewPlayerAlias.action.type === 'view_player') {
    assert.equal(viewPlayerAlias.action.player_id, 'p1');
    assert.equal(viewPlayerAlias.action.json, true);
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

test('parse setup-player local command', () => {
  const withDefaults = parse_cli_line('setup-player p1 washerwoman townsfolk');
  assert.equal(withDefaults.ok, true);
  if (withDefaults.ok && withDefaults.kind === 'local' && withDefaults.action.type === 'setup_player') {
    assert.deepEqual(withDefaults.action, {
      type: 'setup_player',
      player_id: 'p1',
      true_character_id: 'washerwoman',
      perceived_character_id: 'washerwoman',
      character_type: 'townsfolk',
      alignment: null
    });
  }

  const withPerceivedAndAlignment = parse_cli_line(
    'setup-player p2 imp soldier demon evil'
  );
  assert.equal(withPerceivedAndAlignment.ok, true);
  if (
    withPerceivedAndAlignment.ok &&
    withPerceivedAndAlignment.kind === 'local' &&
    withPerceivedAndAlignment.action.type === 'setup_player'
  ) {
    assert.deepEqual(withPerceivedAndAlignment.action, {
      type: 'setup_player',
      player_id: 'p2',
      true_character_id: 'imp',
      perceived_character_id: 'soldier',
      character_type: 'demon',
      alignment: 'evil'
    });
  }

  const travellerEvil = parse_cli_line('setup-player p3 thief thief traveller evil');
  assert.equal(travellerEvil.ok, true);
  if (travellerEvil.ok && travellerEvil.kind === 'local' && travellerEvil.action.type === 'setup_player') {
    assert.equal(travellerEvil.action.alignment, 'evil');
  }
});

test('invalid command gives usage', () => {
  const parsed = parse_cli_line('vote n1 p1 maybe');
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.match(parsed.message, /usage: vote/);
  }

  const viewInvalid = parse_cli_line('view maybe');
  assert.equal(viewInvalid.ok, true);
  if (viewInvalid.ok && viewInvalid.kind === 'local') {
    assert.equal(viewInvalid.action.type, 'view_player');
    if (viewInvalid.action.type === 'view_player') {
      assert.equal(viewInvalid.action.player_id, 'maybe');
    }
  }

  const setupPlayerInvalid = parse_cli_line('setup-player p1 imp maybe');
  assert.equal(setupPlayerInvalid.ok, false);
  if (!setupPlayerInvalid.ok) {
    assert.match(setupPlayerInvalid.message, /usage: setup-player/);
  }

  const nextInvalid = parse_cli_line('next later');
  assert.equal(nextInvalid.ok, false);
  if (!nextInvalid.ok) {
    assert.match(nextInvalid.message, /usage: next/);
  }
});

test('unknown command returns global help hint', () => {
  const unknown = parse_cli_line('mystery-command');
  assert.equal(unknown.ok, false);
  if (!unknown.ok) {
    assert.match(unknown.message, /unknown command: mystery-command/);
    assert.match(unknown.message, /run "help \[all\|phase\]" for available commands/);
  }
});

test('parse prompt engine commands', () => {
  const create = parse_cli_line('create-prompt pr1 false_info storyteller choose false info');
  assert.equal(create.ok, true);
  if (create.ok && create.kind === 'engine' && create.command.command_type === 'CreatePrompt') {
    assert.deepEqual(create.command.payload, {
      prompt_id: 'pr1',
      kind: 'false_info',
      reason: 'choose false info',
      visibility: 'storyteller',
      options: []
    });
  }

  const resolve = parse_cli_line('resolve-prompt pr1 option_a note text');
  assert.equal(resolve.ok, true);
  if (resolve.ok && resolve.kind === 'engine' && resolve.command.command_type === 'ResolvePrompt') {
    assert.deepEqual(resolve.command.payload, {
      prompt_id: 'pr1',
      selected_option_id: 'option_a',
      freeform: null,
      notes: 'note text'
    });
  }

  const chooseAlias = parse_cli_line('choose pr1 option_a note text');
  assert.equal(chooseAlias.ok, true);
  if (chooseAlias.ok && chooseAlias.kind === 'engine' && chooseAlias.command.command_type === 'ResolvePrompt') {
    assert.deepEqual(chooseAlias.command.payload, {
      prompt_id: 'pr1',
      selected_option_id: 'option_a',
      freeform: null,
      notes: 'note text'
    });
  }

  const chAlias = parse_cli_line('ch pr1 option_a note text');
  assert.equal(chAlias.ok, true);
  if (chAlias.ok && chAlias.kind === 'engine' && chAlias.command.command_type === 'ResolvePrompt') {
    assert.deepEqual(chAlias.command.payload, {
      prompt_id: 'pr1',
      selected_option_id: 'option_a',
      freeform: null,
      notes: 'note text'
    });
  }

  const cancel = parse_cli_line('cancel-prompt pr1 no longer needed');
  assert.equal(cancel.ok, true);
  if (cancel.ok && cancel.kind === 'engine' && cancel.command.command_type === 'CancelPrompt') {
    assert.deepEqual(cancel.command.payload, {
      prompt_id: 'pr1',
      reason: 'no longer needed'
    });
  }

  const applyReminder = parse_cli_line('apply-reminder mk1 poisoner:poisoned poisoned p1 poisoner nightly poison');
  assert.equal(applyReminder.ok, true);
  if (applyReminder.ok && applyReminder.kind === 'engine') {
    assert.deepEqual(applyReminder.command, {
      command_type: 'ApplyReminderMarker',
      payload: {
        marker_id: 'mk1',
        kind: 'poisoner:poisoned',
        effect: 'poisoned',
        note: 'nightly poison',
        source_player_id: null,
        source_character_id: 'poisoner',
        target_player_id: 'p1',
        target_scope: 'player',
        authoritative: true,
        expires_policy: 'manual',
        expires_at_day_number: null,
        expires_at_night_number: null,
        source_event_id: null,
        metadata: {}
      }
    });
  }

  const clearReminder = parse_cli_line('clear-reminder mk1 expired');
  assert.equal(clearReminder.ok, true);
  if (clearReminder.ok && clearReminder.kind === 'engine') {
    assert.deepEqual(clearReminder.command, {
      command_type: 'ClearReminderMarker',
      payload: {
        marker_id: 'mk1',
        reason: 'expired'
      }
    });
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

  const claimedAbility = parse_cli_line('claim-ability p1 slayer', state);
  assert.equal(claimedAbility.ok, true);
  if (
    claimedAbility.ok &&
    claimedAbility.kind === 'engine' &&
    claimedAbility.command.command_type === 'UseClaimedAbility'
  ) {
    assert.deepEqual(claimedAbility.command.payload, {
      claimant_player_id: 'p1',
      claimed_character_id: 'slayer'
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

  const sweepReminders = parse_cli_line('sweep-reminders', state);
  assert.equal(sweepReminders.ok, true);
  if (
    sweepReminders.ok &&
    sweepReminders.kind === 'engine' &&
    sweepReminders.command.command_type === 'SweepReminderExpiry'
  ) {
    assert.deepEqual(sweepReminders.command.payload, {
      phase: 'day',
      subphase: 'idle',
      day_number: 1,
      night_number: 1
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

  const resolvePromptNoState = parse_cli_line('resolve-prompt');
  assert.equal(resolvePromptNoState.ok, false);
  if (!resolvePromptNoState.ok) {
    assert.match(resolvePromptNoState.message, /usage: resolve-prompt/);
  }

  const chooseNoState = parse_cli_line('choose');
  assert.equal(chooseNoState.ok, false);
  if (!chooseNoState.ok) {
    assert.match(chooseNoState.message, /usage: choose/);
  }
});

test('resolve-prompt can omit prompt_id when exactly one pending prompt exists', () => {
  const state = make_cli_state();
  const parsed = parse_cli_line('resolve-prompt', state);
  assert.equal(parsed.ok, true);
  if (parsed.ok && parsed.kind === 'engine' && parsed.command.command_type === 'ResolvePrompt') {
    assert.deepEqual(parsed.command.payload, {
      prompt_id: 'pr1',
      selected_option_id: null,
      freeform: null,
      notes: null
    });
  }

  const withSelectedOption = parse_cli_line('resolve-prompt p1', state);
  assert.equal(withSelectedOption.ok, true);
  if (
    withSelectedOption.ok &&
    withSelectedOption.kind === 'engine' &&
    withSelectedOption.command.command_type === 'ResolvePrompt'
  ) {
    assert.deepEqual(withSelectedOption.command.payload, {
      prompt_id: 'pr1',
      selected_option_id: 'p1',
      freeform: null,
      notes: null
    });
  }

  const chooseRandom = parse_cli_line('choose', state);
  assert.equal(chooseRandom.ok, true);
  if (chooseRandom.ok && chooseRandom.kind === 'engine' && chooseRandom.command.command_type === 'ResolvePrompt') {
    const payload = chooseRandom.command.payload as {
      prompt_id: string;
      selected_option_id: string | null;
      notes: string | null;
    };
    assert.equal(payload.prompt_id, 'pr1');
    assert.equal(['opt_a', 'opt_b'].includes(payload.selected_option_id ?? ''), true);
    assert.equal(payload.notes, 'auto_random_choice');
  }

  state.pending_prompts.push('pr2');
  const ambiguous = parse_cli_line('resolve-prompt', state);
  assert.equal(ambiguous.ok, false);
  if (!ambiguous.ok) {
    assert.match(ambiguous.message, /usage: resolve-prompt/);
  }
});
