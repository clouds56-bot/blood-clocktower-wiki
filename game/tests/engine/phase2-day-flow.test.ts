import assert from 'node:assert/strict';
import test from 'node:test';

import type { Command } from '../../src/domain/commands.js';
import { apply_events } from '../../src/domain/reducer.js';
import { create_initial_state } from '../../src/domain/state.js';
import type { GameState } from '../../src/domain/types.js';
import { handle_command } from '../../src/engine/command-handler.js';
import { butler_plugin } from '../../src/plugins/characters/butler.js';
import { slayer_plugin } from '../../src/plugins/characters/slayer.js';
import { virgin_plugin } from '../../src/plugins/characters/virgin.js';
import { PluginRegistry } from '../../src/plugins/registry.js';

const DAY_HOOK_REGISTRY = new PluginRegistry([butler_plugin, slayer_plugin, virgin_plugin]);

function bootstrap_day_state(): GameState {
  const seed = create_initial_state('g1');
  return apply_events(seed, [
    {
      event_id: 1,
      event_type: 'PlayerAdded',
      created_at: '2026-03-12T00:00:00.000Z',
      payload: { player_id: 'p1', display_name: 'Alice' }
    },
    {
      event_id: 2,
      event_type: 'PlayerAdded',
      created_at: '2026-03-12T00:00:01.000Z',
      payload: { player_id: 'p2', display_name: 'Bob' }
    },
    {
      event_id: 3,
      event_type: 'PlayerAdded',
      created_at: '2026-03-12T00:00:02.000Z',
      payload: { player_id: 'p3', display_name: 'Cara' }
    },
    {
      event_id: 4,
      event_type: 'PhaseAdvanced',
      created_at: '2026-03-12T00:00:03.000Z',
      payload: { phase: 'day', subphase: 'open_discussion', day_number: 1, night_number: 1 }
    }
  ]);
}

function run_command(state: GameState, command: Command, created_at = '2026-03-12T01:00:00.000Z'): GameState {
  const result = handle_command(state, command, created_at, {
    plugin_registry: DAY_HOOK_REGISTRY
  });
  if (!result.ok) {
    throw new Error(`${result.error.code}:${result.error.message}`);
  }
  return apply_events(state, result.value);
}

test('valid transition first_night -> day resets day tracking', () => {
  const seed = create_initial_state('g1');
  const firstNight = apply_events(seed, [
    {
      event_id: 5,
      event_type: 'PhaseAdvanced',
      created_at: '2026-03-12T00:00:00.000Z',
      payload: { phase: 'first_night', subphase: 'night_wake_sequence', day_number: 0, night_number: 1 }
    }
  ]);

  const result = handle_command(
    firstNight,
    {
      command_id: 'c1',
      command_type: 'AdvancePhase',
      payload: { phase: 'day', subphase: 'open_discussion', day_number: 1, night_number: 1 }
    },
    '2026-03-12T00:00:01.000Z'
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const next = apply_events(firstNight, result.value);
  assert.equal(next.phase, 'day');
  assert.equal(next.subphase, 'open_discussion');
  assert.equal(next.day_state.nominations_today.length, 0);
  assert.equal(next.day_state.nomination_window_open, false);
});

test('invalid transition setup -> night is rejected', () => {
  const state = create_initial_state('g1');
  const result = handle_command(
    state,
    {
      command_id: 'c1',
      command_type: 'AdvancePhase',
      payload: { phase: 'night', subphase: 'dusk', day_number: 0, night_number: 1 }
    },
    '2026-03-12T00:00:00.000Z'
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'invalid_phase_transition');
  }
});

test('dead nominator is rejected', () => {
  let state = bootstrap_day_state();
  const p1 = state.players_by_id.p1;
  assert.ok(p1);
  p1.alive = false;

  state = run_command(state, {
    command_id: 'c-open',
    command_type: 'OpenNominationWindow',
    payload: { day_number: 1 }
  });

  const result = handle_command(
    state,
    {
      command_id: 'c-nom',
      command_type: 'NominatePlayer',
      payload: {
        nomination_id: 'n1',
        day_number: 1,
        nominator_player_id: 'p1',
        nominee_player_id: 'p2'
      }
    },
    '2026-03-12T01:00:01.000Z'
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'dead_player_cannot_nominate');
  }
});

test('same nominator and same nominee second nomination are rejected', () => {
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

  const sameNominator = handle_command(
    state,
    {
      command_id: 'c-nom2',
      command_type: 'NominatePlayer',
      payload: {
        nomination_id: 'n2',
        day_number: 1,
        nominator_player_id: 'p1',
        nominee_player_id: 'p3'
      }
    },
    '2026-03-12T01:00:02.000Z'
  );
  assert.equal(sameNominator.ok, false);
  if (!sameNominator.ok) {
    assert.equal(sameNominator.error.code, 'already_nominated_today');
  }

  const sameNominee = handle_command(
    state,
    {
      command_id: 'c-nom3',
      command_type: 'NominatePlayer',
      payload: {
        nomination_id: 'n3',
        day_number: 1,
        nominator_player_id: 'p3',
        nominee_player_id: 'p2'
      }
    },
    '2026-03-12T01:00:03.000Z'
  );
  assert.equal(sameNominee.ok, false);
  if (!sameNominee.ok) {
    assert.equal(sameNominee.error.code, 'already_been_nominated_today');
  }
});

test('threshold reached leads to execution', () => {
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

  assert.equal(state.day_state.execution_occurred_today, true);
  assert.equal(state.execution_history.length, 1);
  assert.equal(state.execution_history[0]?.player_id, 'p2');
});

test('threshold not reached results in no execution', () => {
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

  assert.equal(state.day_state.execution_attempted_today, true);
  assert.equal(state.day_state.execution_occurred_today, false);
  assert.equal(state.execution_history.length, 0);
});

test('tie for highest results in no execution', () => {
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
    command_id: 'c-v-open-1',
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
    command_id: 'c-v-close-1',
    command_type: 'CloseVote',
    payload: {
      nomination_id: 'n1',
      day_number: 1
    }
  });

  state = run_command(state, {
    command_id: 'c-nom2',
    command_type: 'NominatePlayer',
    payload: {
      nomination_id: 'n2',
      day_number: 1,
      nominator_player_id: 'p2',
      nominee_player_id: 'p3'
    }
  });
  state = run_command(state, {
    command_id: 'c-v-open-2',
    command_type: 'OpenVote',
    payload: {
      nomination_id: 'n2',
      nominee_player_id: 'p3',
      opened_by_player_id: 'p2'
    }
  });
  state = run_command(state, {
    command_id: 'c-v2',
    command_type: 'CastVote',
    payload: {
      nomination_id: 'n2',
      voter_player_id: 'p2',
      in_favor: true
    }
  });
  state = run_command(state, {
    command_id: 'c-v-close-2',
    command_type: 'CloseVote',
    payload: {
      nomination_id: 'n2',
      day_number: 1
    }
  });

  state = run_command(state, {
    command_id: 'c-resolve',
    command_type: 'ResolveExecution',
    payload: { day_number: 1 }
  });

  assert.equal(state.day_state.execution_occurred_today, false);
  assert.equal(state.execution_history.length, 0);
});

test('second execution resolution same day is rejected', () => {
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
    command_id: 'c-resolve-1',
    command_type: 'ResolveExecution',
    payload: { day_number: 1 }
  });

  const secondResolve = handle_command(
    state,
    {
      command_id: 'c-resolve-2',
      command_type: 'ResolveExecution',
      payload: { day_number: 1 }
    },
    '2026-03-12T01:00:30.000Z'
  );

  assert.equal(secondResolve.ok, false);
  if (!secondResolve.ok) {
    assert.equal(secondResolve.error.code, 'execution_already_attempted_today');
  }
});

test('open vote emits PhaseAdvanced before VoteOpened', () => {
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

  const result = handle_command(
    state,
    {
      command_id: 'c-v-open-order',
      command_type: 'OpenVote',
      payload: {
        nomination_id: 'n1',
        nominee_player_id: 'p2',
        opened_by_player_id: 'p1'
      }
    },
    '2026-03-12T01:01:00.000Z'
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.value[0]?.event_type, 'PhaseAdvanced');
  assert.equal(result.value[1]?.event_type, 'VoteOpened');
});

test('butler yes vote requires master yes vote first', () => {
  let state = bootstrap_day_state();
  const p1 = state.players_by_id.p1;
  assert.ok(p1);
  p1.true_character_id = 'butler';
  p1.true_alignment = 'good';

  state.reminder_markers_by_id.m1 = {
    marker_id: 'm1',
    kind: 'butler:master',
    effect: 'butler_master',
    note: 'master',
    status: 'active',
    source_player_id: 'p1',
    source_character_id: 'butler',
    target_player_id: 'p2',
    target_scope: 'player',
    authoritative: true,
    expires_policy: 'end_of_day',
    expires_at_day_number: null,
    expires_at_night_number: null,
    created_at_event_id: 6,
    cleared_at_event_id: null,
    source_event_id: null,
    metadata: {}
  };
  state.active_reminder_marker_ids = ['m1'];

  state = run_command(state, {
    command_id: 'c-open',
    command_type: 'OpenNominationWindow',
    payload: { day_number: 1 }
  });
  state = run_command(state, {
    command_id: 'c-nom',
    command_type: 'NominatePlayer',
    payload: {
      nomination_id: 'n1',
      day_number: 1,
      nominator_player_id: 'p1',
      nominee_player_id: 'p3'
    }
  });
  state = run_command(state, {
    command_id: 'c-v-open',
    command_type: 'OpenVote',
    payload: {
      nomination_id: 'n1',
      nominee_player_id: 'p3',
      opened_by_player_id: 'p1'
    }
  });

  const blocked = handle_command(
    state,
    {
      command_id: 'c-v1',
      command_type: 'CastVote',
      payload: {
        nomination_id: 'n1',
        voter_player_id: 'p1',
        in_favor: true
      }
    },
    '2026-03-12T02:00:00.000Z',
    {
      plugin_registry: DAY_HOOK_REGISTRY
    }
  );

  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.error.code, 'butler_vote_restricted');
  }

  state = run_command(state, {
    command_id: 'c-v2',
    command_type: 'CastVote',
    payload: {
      nomination_id: 'n1',
      voter_player_id: 'p2',
      in_favor: true
    }
  });

  const allowed = handle_command(
    state,
    {
      command_id: 'c-v3',
      command_type: 'CastVote',
      payload: {
        nomination_id: 'n1',
        voter_player_id: 'p1',
        in_favor: true
      }
    },
    '2026-03-12T02:00:01.000Z',
    {
      plugin_registry: DAY_HOOK_REGISTRY
    }
  );
  assert.equal(allowed.ok, true);
});

test('virgin executes townsfolk nominator immediately on first nomination', () => {
  let state = bootstrap_day_state();
  state = run_command(state, {
    command_id: 'c-assign-virgin',
    command_type: 'AssignCharacter',
    payload: {
      player_id: 'p2',
      true_character_id: 'virgin'
    }
  });
  state = run_command(state, {
    command_id: 'c-assign-chef',
    command_type: 'AssignCharacter',
    payload: {
      player_id: 'p1',
      true_character_id: 'chef'
    }
  });
  state = run_command(state, {
    command_id: 'c-open',
    command_type: 'OpenNominationWindow',
    payload: { day_number: 1 }
  });
  state = run_command(state, {
    command_id: 'c-nom',
    command_type: 'NominatePlayer',
    payload: {
      nomination_id: 'n1',
      day_number: 1,
      nominator_player_id: 'p1',
      nominee_player_id: 'p2'
    }
  });

  assert.equal(state.players_by_id.p1?.alive, false);
  const virgin_spent = state.active_reminder_marker_ids.some((marker_id) => {
    const marker = state.reminder_markers_by_id[marker_id];
    return Boolean(marker && marker.kind === 'virgin:spent' && marker.source_player_id === 'p2');
  });
  assert.equal(virgin_spent, true);
});

test('virgin can execute spy nominator when storyteller resolves spy as townsfolk', () => {
  let state = bootstrap_day_state();
  state = run_command(state, {
    command_id: 'c-assign-virgin',
    command_type: 'AssignCharacter',
    payload: {
      player_id: 'p2',
      true_character_id: 'virgin'
    }
  });
  state = run_command(state, {
    command_id: 'c-assign-spy',
    command_type: 'AssignCharacter',
    payload: {
      player_id: 'p1',
      true_character_id: 'spy'
    }
  });
  state = run_command(state, {
    command_id: 'c-open',
    command_type: 'OpenNominationWindow',
    payload: { day_number: 1 }
  });
  state = run_command(state, {
    command_id: 'c-nom',
    command_type: 'NominatePlayer',
    payload: {
      nomination_id: 'n1',
      day_number: 1,
      nominator_player_id: 'p1',
      nominee_player_id: 'p2'
    }
  });

  assert.equal(state.players_by_id.p1?.alive, true);
  assert.equal(state.pending_prompts.length, 1);
  const prompt_id = state.pending_prompts[0] ?? '';
  assert.equal(prompt_id.startsWith('plugin:spy:registration:virgin:'), true);

  state = run_command(state, {
    command_id: 'c-resolve-virgin-spy-yes',
    command_type: 'ResolvePrompt',
    payload: {
      prompt_key: prompt_id,
      prompt_id,
      selected_option_id: 'character_type:townsfolk',
      freeform: null,
      notes: null
    }
  });

  assert.equal(state.players_by_id.p1?.alive, false);
});

test('virgin can leave spy nominator alive when registration is not triggered', () => {
  let state = bootstrap_day_state();
  state = run_command(state, {
    command_id: 'c-assign-virgin',
    command_type: 'AssignCharacter',
    payload: {
      player_id: 'p2',
      true_character_id: 'virgin'
    }
  });
  state = run_command(state, {
    command_id: 'c-assign-spy',
    command_type: 'AssignCharacter',
    payload: {
      player_id: 'p1',
      true_character_id: 'spy'
    }
  });
  state = run_command(state, {
    command_id: 'c-open',
    command_type: 'OpenNominationWindow',
    payload: { day_number: 1 }
  });
  state = run_command(state, {
    command_id: 'c-nom',
    command_type: 'NominatePlayer',
    payload: {
      nomination_id: 'n1',
      day_number: 1,
      nominator_player_id: 'p1',
      nominee_player_id: 'p2'
    }
  });

  assert.equal(state.pending_prompts.length, 1);
  const prompt_id = state.pending_prompts[0] ?? '';

  state = run_command(state, {
    command_id: 'c-resolve-virgin-spy-no',
    command_type: 'ResolvePrompt',
    payload: {
      prompt_key: prompt_id,
      prompt_id,
      selected_option_id: 'default',
      freeform: null,
      notes: null
    }
  });

  assert.equal(state.players_by_id.p1?.alive, true);
});

test('slayer shot kills demon and is once per game', () => {
  let state = bootstrap_day_state();
  state = run_command(state, {
    command_id: 'c-assign-slayer',
    command_type: 'AssignCharacter',
    payload: {
      player_id: 'p1',
      true_character_id: 'slayer'
    }
  });
  state = run_command(state, {
    command_id: 'c-assign-imp',
    command_type: 'AssignCharacter',
    payload: {
      player_id: 'p2',
      true_character_id: 'imp',
      is_demon: true
    }
  });

  state = run_command(state, {
    command_id: 'c-slay',
    command_type: 'UseClaimedAbility',
    payload: {
      claimant_player_id: 'p1',
      claimed_character_id: 'slayer'
    }
  });
  const firstPromptId = state.pending_prompts[0] ?? '';
  state = run_command(state, {
    command_id: 'c-slay-resolve',
    command_type: 'ResolvePrompt',
    payload: {
    prompt_key: firstPromptId,
      prompt_id: firstPromptId,
      selected_option_id: 'p2',
      freeform: null,
      notes: null
    }
  });

  assert.equal(state.players_by_id.p2?.alive, false);
  const attempted = state.domain_events.find((event) => event.event_type === 'ClaimedAbilityAttempted');
  assert.ok(attempted);

  const second = handle_command(
    state,
    {
      command_id: 'c-slay-2',
      command_type: 'UseClaimedAbility',
      payload: {
        claimant_player_id: 'p1',
        claimed_character_id: 'slayer'
      }
    },
    '2026-03-12T02:00:00.000Z',
    {
      plugin_registry: DAY_HOOK_REGISTRY
    }
  );
  assert.equal(second.ok, true);
  if (second.ok) {
    const after_second = apply_events(state, second.value);
    const secondPromptId = after_second.pending_prompts[0] ?? '';
    const resolved_second = handle_command(
      after_second,
      {
        command_id: 'c-slay-resolve-2',
        command_type: 'ResolvePrompt',
        payload: {
    prompt_key: secondPromptId,
          prompt_id: secondPromptId,
          selected_option_id: 'p3',
          freeform: null,
          notes: null
        }
      },
      '2026-03-12T02:00:01.000Z',
      {
        plugin_registry: DAY_HOOK_REGISTRY
      }
    );
    assert.equal(resolved_second.ok, true);
    if (resolved_second.ok) {
      const final_state = apply_events(after_second, resolved_second.value);
      assert.equal(final_state.players_by_id.p3?.alive, true);
    }
  }
});
