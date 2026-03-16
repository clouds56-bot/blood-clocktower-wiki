import assert from 'node:assert/strict';
import test from 'node:test';

import type { DomainEvent } from '../../src/domain/events.js';
import { apply_events } from '../../src/domain/reducer.js';
import { create_initial_state } from '../../src/domain/state.js';
import { imp_plugin, is_imp_prompt_id } from '../../src/plugins/characters/imp.js';
import { make_player } from './tb-test-utils.js';

function to_domain_events(
  emitted_events: NonNullable<ReturnType<NonNullable<typeof imp_plugin.hooks.on_prompt_resolved>>>['emitted_events'],
  prefix: string
): DomainEvent[] {
  return emitted_events.map((event, index) => ({
    event_key: `${prefix}:${index}`,
    event_id: 2,
    event_type: event.event_type,
    created_at: '2026-03-15T00:00:00.000Z',
    payload: event.payload
  })) as DomainEvent[];
}

test('imp wake hook returns player-visible target prompt', () => {
  const state = create_initial_state('g1');
  state.players_by_id.p1 = make_player('p1', 'ImpPlayer', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'TargetA', 'washerwoman', 'good');

  const result = imp_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p1',
    wake_step_id: 'wake:1:0:p1:imp'
  });

  assert.ok(result);
  assert.equal(result?.queued_prompts.length, 1);
  const prompt = result?.queued_prompts[0];
  assert.ok(prompt);
  assert.equal(prompt?.visibility, 'player');
  assert.equal(prompt?.kind, 'choice');
  assert.equal(is_imp_prompt_id(prompt?.prompt_id ?? ''), true);
  assert.deepEqual(prompt?.options.map((item) => item.option_id), ['p1', 'p2']);
});

test('imp can choose itself and dies', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'ImpPlayer', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'Minion', 'poisoner', 'evil');

  const result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:n2:p1',
    selected_option_id: 'p1',
    freeform: null
  });

  assert.ok(result);
  assert.equal(result?.emitted_events.length, 2);
  assert.equal(result?.emitted_events[0]?.event_type, 'PlayerDied');
  assert.equal(result?.emitted_events[0]?.payload.player_id, 'p1');
  assert.equal(result?.emitted_events[1]?.event_type, 'ReminderMarkerApplied');
});

test('imp prompt resolution emits PlayerDied consequence', () => {
  const state = create_initial_state('g1');
  state.day_number = 0;
  state.night_number = 1;
  state.players_by_id.p1 = make_player('p1', 'ImpPlayer', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'TargetA', 'washerwoman', 'good');

  const result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:n1:p1',
    selected_option_id: 'p2',
    freeform: null
  });

  assert.ok(result);
  assert.equal(result?.emitted_events.length, 1);
  const event = result?.emitted_events[0];
  assert.ok(event);
  assert.equal(event?.event_type, 'PlayerDied');
  assert.deepEqual(event?.payload, {
    player_id: 'p2',
    day_number: 0,
    night_number: 1,
    reason: 'night_death'
  });
});

test('imp does not kill dead target', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'ImpPlayer', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'DeadTarget', 'washerwoman', 'good', { alive: false });

  const result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:n2:p1',
    selected_option_id: 'p2',
    freeform: null
  });

  assert.ok(result);
  assert.equal(result?.emitted_events.length, 0);
});

test('imp does not kill sober Soldier target', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'ImpPlayer', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'Soldier', 'soldier', 'good');

  const result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:n2:p1',
    selected_option_id: 'p2',
    freeform: null
  });

  assert.ok(result);
  assert.equal(result?.emitted_events.length, 0);
});

test('imp kills poisoned Soldier target', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'ImpPlayer', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'Soldier', 'soldier', 'good', { poisoned: true });

  const result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:n2:p1',
    selected_option_id: 'p2',
    freeform: null
  });

  assert.ok(result);
  assert.equal(result?.emitted_events.length, 1);
  assert.equal(result?.emitted_events[0]?.event_type, 'PlayerDied');
});

test('imp does not kill monk protected target', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'ImpPlayer', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'Target', 'washerwoman', 'good');
  state.reminder_markers_by_id.m1 = {
    marker_id: 'm1',
    kind: 'monk:safe',
    effect: 'demon_safe',
    note: 'safe',
    status: 'active',
    source_player_id: 'p3',
    source_character_id: 'monk',
    target_player_id: 'p2',
    target_scope: 'player',
    authoritative: true,
    expires_policy: 'end_of_night',
    expires_at_day_number: null,
    expires_at_night_number: null,
    created_at_event_id: 1,
    cleared_at_event_id: null,
    source_event_id: null,
    metadata: {}
  };
  state.active_reminder_marker_ids = ['m1'];

  const result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:n2:p1',
    selected_option_id: 'p2',
    freeform: null
  });

  assert.ok(result);
  assert.equal(result?.emitted_events.length, 0);
});

test('imp kill queues ravenkeeper death reveal prompt', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'ImpPlayer', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'Ravenkeeper', 'ravenkeeper', 'good');
  state.players_by_id.p3 = make_player('p3', 'Chef', 'chef', 'good');

  const result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:n2:p1',
    selected_option_id: 'p2',
    freeform: null
  });

  assert.ok(result);
  assert.deepEqual(
    result?.emitted_events.map((event) => event.event_type),
    ['PlayerDied']
  );
  assert.equal(result?.queued_prompts.length, 1);
  assert.equal(result?.queued_prompts[0]?.prompt_id, 'plugin:ravenkeeper:night_reveal:n2:p2');
});

test('imp on_player_died prefers Scarlet Woman as transfer target', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 2;
  state.seat_order = ['p1', 'p2', 'p3', 'p4'];
  state.players_by_id.p1 = make_player('p1', 'ImpPlayer', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'Poisoner', 'poisoner', 'evil');
  state.players_by_id.p3 = make_player('p3', 'Scarlet Woman', 'scarlet_woman', 'evil');
  state.players_by_id.p4 = make_player('p4', 'Chef', 'chef', 'good');

  const kill_result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:n2:p1',
    selected_option_id: 'p1',
    freeform: null
  });

  assert.ok(kill_result);
  const after_kill = apply_events(
    state,
    to_domain_events(kill_result?.emitted_events ?? [], 'e-kill')
  );

  const transfer = imp_plugin.hooks.on_player_died?.({
    state: after_kill,
    player_id: 'p1',
    day_number: 1,
    night_number: 2,
    reason: 'night_death'
  });

  assert.ok(transfer);
  assert.deepEqual(
    transfer?.emitted_events.map((event) => event.event_type),
    ['CharacterAssigned', 'CharacterAssigned', 'ReminderMarkerCleared']
  );
  assert.equal(transfer?.emitted_events[1]?.payload.player_id, 'p3');
  assert.equal(transfer?.emitted_events[1]?.payload.true_character_id, 'imp');
  assert.equal(transfer?.emitted_events[1]?.payload.is_demon, true);
});

test('imp on_player_died prompts storyteller to choose transfer target when no Scarlet Woman', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 2;
  state.seat_order = ['p1', 'p2', 'p3'];
  state.players_by_id.p1 = make_player('p1', 'ImpPlayer', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'Poisoner', 'poisoner', 'evil');
  state.players_by_id.p3 = make_player('p3', 'Spy', 'spy', 'evil');

  const kill_result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:n2:p1',
    selected_option_id: 'p1',
    freeform: null
  });
  const after_kill = apply_events(
    state,
    to_domain_events(kill_result?.emitted_events ?? [], 'e-kill-prompt')
  );

  const transfer = imp_plugin.hooks.on_player_died?.({
    state: after_kill,
    player_id: 'p1',
    day_number: 1,
    night_number: 2,
    reason: 'night_death'
  });

  assert.ok(transfer);
  assert.equal(transfer?.queued_prompts.length, 1);
  assert.equal(transfer?.queued_prompts[0]?.prompt_id, 'plugin:imp:transfer_target:n2:p1');
  assert.deepEqual(
    transfer?.queued_prompts[0]?.options.map((option) => option.option_id),
    ['p2', 'p3']
  );
});

test('imp transfer target prompt resolves into new demon and transferred imp can act next night', () => {
  let state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 2;
  state.seat_order = ['p1', 'p2', 'p3', 'p4'];
  state.players_by_id.p1 = make_player('p1', 'ImpPlayer', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'Poisoner', 'poisoner', 'evil');
  state.players_by_id.p3 = make_player('p3', 'Spy', 'spy', 'evil');
  state.players_by_id.p4 = make_player('p4', 'Chef', 'chef', 'good');

  const kill_result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:n2:p1',
    selected_option_id: 'p1',
    freeform: null
  });
  state = apply_events(
    state,
    to_domain_events(kill_result?.emitted_events ?? [], 'e-step1')
  );

  const on_death = imp_plugin.hooks.on_player_died?.({
    state,
    player_id: 'p1',
    day_number: 1,
    night_number: 2,
    reason: 'night_death'
  });
  state = apply_events(
    state,
    (on_death?.queued_prompts ?? []).map((prompt, index) => ({
      event_key: `e-step2-prompt-${index}`,
      event_id: 3,
      event_type: 'PromptQueued' as const,
      created_at: '2026-03-15T00:00:00.000Z',
      payload: {
        prompt_key: prompt.prompt_id,
        prompt_id: prompt.prompt_id,
        kind: prompt.kind,
        reason: prompt.reason,
        visibility: prompt.visibility,
        options: prompt.options,
        selection_mode: prompt.selection_mode ?? 'single_choice',
        number_range: prompt.number_range ?? null,
        multi_columns: prompt.multi_columns ?? null,
        storyteller_hint: prompt.storyteller_hint ?? null
      }
    }))
  );

  const transfer_prompt_result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:transfer_target:n2:p1',
    selected_option_id: 'p3',
    freeform: null
  });

  assert.ok(transfer_prompt_result);
  state = apply_events(
    state,
    to_domain_events(transfer_prompt_result?.emitted_events ?? [], 'e-step3')
  );

  assert.equal(state.players_by_id.p1?.is_demon, false);
  assert.equal(state.players_by_id.p3?.is_demon, true);
  assert.equal(state.players_by_id.p3?.true_character_id, 'imp');

  state.night_number = 3;
  const wake = imp_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p3',
    wake_step_id: 'wake:3:0:p3:imp'
  });
  assert.ok(wake);
  assert.equal(wake?.queued_prompts[0]?.prompt_id, 'plugin:imp:night_kill:n3:p3');

  const next_kill = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:n3:p3',
    selected_option_id: 'p4',
    freeform: null
  });
  assert.ok(next_kill);
  assert.equal(next_kill?.emitted_events[0]?.event_type, 'PlayerDied');
  assert.equal(next_kill?.emitted_events[0]?.payload.player_id, 'p4');
});
