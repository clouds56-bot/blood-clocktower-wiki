import assert from 'node:assert/strict';
import test from 'node:test';

import { create_initial_state } from '../../src/domain/state.js';
import { chef_plugin } from '../../src/plugins/characters/chef.js';
import { empath_plugin } from '../../src/plugins/characters/empath.js';
import { build_registration_query_id } from '../../src/plugins/characters/tb-info-utils.js';
import {
  fortune_teller_plugin,
  is_fortune_teller_prompt_id
} from '../../src/plugins/characters/fortune-teller.js';
import { make_player } from './tb-test-utils.js';

test('chef records adjacent evil pair count', () => {
  const state = create_initial_state('g1');
  state.seat_order = ['p1', 'p2', 'p3', 'p4'];
  state.players_by_id.p1 = make_player('p1', 'Chef', 'chef', 'good');
  state.players_by_id.p2 = make_player('p2', 'Minion', 'poisoner', 'evil');
  state.players_by_id.p3 = make_player('p3', 'Demon', 'imp', 'evil');
  state.players_by_id.p4 = make_player('p4', 'Good', 'washerwoman', 'good');

  const result = chef_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p1',
    wake_step_id: 'wake:1:0:p1:chef'
  });

  assert.ok(result);
  assert.equal(result?.emitted_events.length, 1);
  const note = result?.emitted_events[0]?.payload.note;
  assert.equal(note, 'chef_info:p1:adjacent_evil_pairs=1');
});

test('chef queues misinformation prompt when poisoned', () => {
  const state = create_initial_state('g1');
  state.night_number = 1;
  state.players_by_id.p1 = make_player('p1', 'Chef', 'chef', 'good', { poisoned: true });
  state.players_by_id.p2 = make_player('p2', 'A', 'washerwoman', 'good');
  state.players_by_id.p3 = make_player('p3', 'B', 'imp', 'evil', { is_demon: true });

  const wake = chef_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p1',
    wake_step_id: 'wake:1:0:p1:chef'
  });
  assert.ok(wake);
  assert.equal(wake?.queued_prompts.length, 1);
  assert.equal(wake?.queued_prompts[0]?.prompt_id, 'plugin:chef:misinfo:1:p1');
  assert.equal(wake?.queued_prompts[0]?.selection_mode, 'number_range');
  assert.deepEqual(wake?.queued_prompts[0]?.number_range, { min: 0, max: 3 });
  const chef_range = wake?.queued_prompts[0]?.number_range;
  assert.ok(chef_range);
  const selected_for_chef = chef_range ? String(chef_range.max) : '0';

  const resolved = chef_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:chef:misinfo:1:p1',
    selected_option_id: selected_for_chef,
    freeform: null
  });
  assert.ok(resolved);
  assert.equal(
    resolved?.emitted_events[0]?.payload.note,
    `chef_info:p1:adjacent_evil_pairs=${selected_for_chef}`
  );
});

test('poisoned chef prompt includes truthful hint for storyteller', () => {
  const state = create_initial_state('g1');
  state.night_number = 2;
  state.seat_order = ['p1', 'p2', 'p3', 'p4'];
  state.players_by_id.p1 = make_player('p1', 'Chef', 'chef', 'good', { poisoned: true });
  state.players_by_id.p2 = make_player('p2', 'Poisoner', 'poisoner', 'evil');
  state.players_by_id.p3 = make_player('p3', 'Imp', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p4 = make_player('p4', 'Good', 'washerwoman', 'good');

  const wake = chef_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p1',
    wake_step_id: 'wake:2:0:p1:chef'
  });

  assert.ok(wake);
  assert.equal(wake?.queued_prompts.length, 1);
  assert.equal(wake?.queued_prompts[0]?.prompt_id, 'plugin:chef:misinfo:2:p1');
  assert.equal(wake?.queued_prompts[0]?.storyteller_hint, '1');
});

test('chef can use different registration outcomes for the same player across pair checks', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 1;
  state.seat_order = ['p1', 'p2', 'p3', 'p4'];
  state.players_by_id.p1 = make_player('p1', 'Poisoner', 'poisoner', 'evil');
  state.players_by_id.p2 = make_player('p2', 'Spy', 'spy', 'evil');
  state.players_by_id.p3 = make_player('p3', 'Imp', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p4 = make_player('p4', 'Chef', 'chef', 'good');

  const p2_as_good_for_pair0 = build_registration_query_id({
    consumer_role_id: 'chef',
    query_kind: 'alignment_check',
    day_number: 1,
    night_number: 1,
    subject_player_id: 'p2',
    query_slot: 'pair_0_right',
    context_player_ids: ['p1']
  });
  const p2_as_evil_for_pair1 = build_registration_query_id({
    consumer_role_id: 'chef',
    query_kind: 'alignment_check',
    day_number: 1,
    night_number: 1,
    subject_player_id: 'p2',
    query_slot: 'pair_1_left',
    context_player_ids: ['p3']
  });

  state.registration_queries_by_id[p2_as_good_for_pair0] = {
    query_id: p2_as_good_for_pair0,
    consumer_role_id: 'chef',
    query_kind: 'alignment_check',
    subject_player_id: 'p2',
    subject_context_player_ids: ['p1'],
    phase: 'first_night',
    day_number: 1,
    night_number: 1,
    status: 'resolved',
    resolved_character_id: null,
    resolved_character_type: null,
    resolved_alignment: 'good',
    decision_source: 'storyteller_prompt',
    created_at_event_id: 'q1',
    resolved_at_event_id: 'q1r',
    note: 'spy registers good for pair 0'
  };
  state.registration_queries_by_id[p2_as_evil_for_pair1] = {
    query_id: p2_as_evil_for_pair1,
    consumer_role_id: 'chef',
    query_kind: 'alignment_check',
    subject_player_id: 'p2',
    subject_context_player_ids: ['p3'],
    phase: 'first_night',
    day_number: 1,
    night_number: 1,
    status: 'resolved',
    resolved_character_id: null,
    resolved_character_type: null,
    resolved_alignment: 'evil',
    decision_source: 'storyteller_prompt',
    created_at_event_id: 'q2',
    resolved_at_event_id: 'q2r',
    note: 'spy registers evil for pair 1'
  };

  const result = chef_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p4',
    wake_step_id: 'wake:1:0:p4:chef'
  });

  assert.ok(result);
  assert.equal(result?.emitted_events.length, 1);
  assert.equal(result?.emitted_events[0]?.payload.note, 'chef_info:p4:adjacent_evil_pairs=1');
});

test('empath counts alive evil neighbors and skips dead players', () => {
  const state = create_initial_state('g1');
  state.seat_order = ['p1', 'p2', 'p3', 'p4', 'p5'];
  state.players_by_id.p1 = make_player('p1', 'Empath', 'empath', 'good');
  state.players_by_id.p2 = make_player('p2', 'DeadGood', 'washerwoman', 'good', { alive: false });
  state.players_by_id.p3 = make_player('p3', 'Minion', 'poisoner', 'evil');
  state.players_by_id.p4 = make_player('p4', 'Good2', 'chef', 'good');
  state.players_by_id.p5 = make_player('p5', 'Demon', 'imp', 'evil');

  const result = empath_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p1',
    wake_step_id: 'wake:1:0:p1:empath'
  });

  assert.ok(result);
  assert.equal(result?.emitted_events.length, 1);
  const note = result?.emitted_events[0]?.payload.note;
  assert.equal(note, 'empath_info:p1:alive_neighbor_evil_count=2');
});

test('empath queues misinformation prompt when drunk', () => {
  const state = create_initial_state('g1');
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'Empath', 'empath', 'good', { drunk: true });

  const wake = empath_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p1',
    wake_step_id: 'wake:2:0:p1:empath'
  });
  assert.ok(wake);
  assert.equal(wake?.queued_prompts.length, 1);
  assert.equal(wake?.queued_prompts[0]?.prompt_id, 'plugin:empath:misinfo:2:p1');
  assert.equal(wake?.queued_prompts[0]?.selection_mode, 'number_range');
  assert.deepEqual(wake?.queued_prompts[0]?.number_range, { min: 0, max: 2 });
  const empath_range = wake?.queued_prompts[0]?.number_range;
  assert.ok(empath_range);
  const selected_for_empath = empath_range ? String(empath_range.min) : '0';

  const resolved = empath_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:empath:misinfo:2:p1',
    selected_option_id: selected_for_empath,
    freeform: null
  });
  assert.ok(resolved);
  assert.equal(
    resolved?.emitted_events[0]?.payload.note,
    `empath_info:p1:alive_neighbor_evil_count=${selected_for_empath}`
  );
});

test('fortune teller wake prompt uses multi-column player selection', () => {
  const state = create_initial_state('g1');
  state.night_number = 1;
  state.players_by_id.p1 = make_player('p1', 'FT', 'fortune_teller', 'good');
  state.players_by_id.p2 = make_player('p2', 'A', 'washerwoman', 'good');
  state.players_by_id.p3 = make_player('p3', 'B', 'poisoner', 'evil');
  state.players_by_id.p4 = make_player('p4', 'DeadImp', 'imp', 'evil', {
    alive: false,
    is_demon: true
  });

  const result = fortune_teller_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p1',
    wake_step_id: 'wake:1:0:p1:fortune_teller'
  });

  assert.ok(result);
  assert.equal(result?.queued_prompts.length, 1);
  const prompt = result?.queued_prompts[0];
  assert.ok(prompt);
  assert.equal(is_fortune_teller_prompt_id(prompt?.prompt_id ?? ''), true);
  assert.equal(prompt?.selection_mode, 'multi_column');
  assert.deepEqual(prompt?.multi_columns, [
    ['p1', 'p2', 'p3', 'p4'],
    ['p1', 'p2', 'p3', 'p4']
  ]);
});

test('fortune teller resolves yes when pair includes dead demon', () => {
  const state = create_initial_state('g1');
  state.players_by_id.p1 = make_player('p1', 'FT', 'fortune_teller', 'good');
  state.players_by_id.p2 = make_player('p2', 'Butler', 'butler', 'good');
  state.players_by_id.p3 = make_player('p3', 'DeadImp', 'imp', 'evil', {
    alive: false,
    is_demon: true
  });

  const result = fortune_teller_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:fortune_teller:night_check:2:p1',
    selected_option_id: 'p2|p3',
    freeform: null
  });

  assert.ok(result);
  assert.equal(result?.emitted_events[0]?.payload.note, 'fortune_teller_info:p1:pair=p2,p3;yes=true');
});

test('fortune teller can resolve yes from query-scoped demon registration', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'FT', 'fortune_teller', 'good');
  state.players_by_id.p2 = make_player('p2', 'Spy', 'spy', 'evil');
  state.players_by_id.p3 = make_player('p3', 'Chef', 'chef', 'good');

  const query_id = build_registration_query_id({
    consumer_role_id: 'fortune_teller',
    query_kind: 'demon_check',
    day_number: 1,
    night_number: 2,
    subject_player_id: 'p2',
    query_slot: 'pair_left',
    context_player_ids: ['p3']
  });

  state.registration_queries_by_id[query_id] = {
    query_id,
    consumer_role_id: 'fortune_teller',
    query_kind: 'demon_check',
    subject_player_id: 'p2',
    subject_context_player_ids: ['p3'],
    phase: 'night',
    day_number: 1,
    night_number: 2,
    status: 'resolved',
    resolved_character_id: null,
    resolved_character_type: 'demon',
    resolved_alignment: null,
    decision_source: 'storyteller_prompt',
    created_at_event_id: 'q3',
    resolved_at_event_id: 'q3r',
    note: 'spy registers as demon for this check'
  };

  const result = fortune_teller_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:fortune_teller:night_check:2:p1',
    selected_option_id: 'p2|p3',
    freeform: null
  });

  assert.ok(result);
  assert.equal(result?.emitted_events[0]?.payload.note, 'fortune_teller_info:p1:pair=p2,p3;yes=true');
});

test('fortune teller queues storyteller registration prompt for unresolved recluse query', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'FT', 'fortune_teller', 'good');
  state.players_by_id.p2 = make_player('p2', 'Recluse', 'recluse', 'good');
  state.players_by_id.p3 = make_player('p3', 'Chef', 'chef', 'good');

  const first = fortune_teller_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:fortune_teller:night_check:2:p1',
    selected_option_id: 'p2|p3',
    freeform: null
  });

  assert.ok(first);
  assert.equal(first?.emitted_events[0]?.event_type, 'RegistrationQueryCreated');
  assert.equal(first?.queued_prompts.length, 1);
  const registration_prompt_id = first?.queued_prompts[0]?.prompt_id ?? '';
  assert.equal(registration_prompt_id.startsWith('plugin:fortune_teller:registration:'), true);

  const after_create = create_initial_state('g1');
  Object.assign(after_create, state);
  const query_id = String(first?.emitted_events[0]?.payload.query_id ?? '');
  after_create.registration_queries_by_id[query_id] = {
    query_id,
    consumer_role_id: 'fortune_teller',
    query_kind: 'demon_check',
    subject_player_id: 'p2',
    subject_context_player_ids: ['p3'],
    phase: 'night',
    day_number: 1,
    night_number: 2,
    status: 'pending',
    resolved_character_id: null,
    resolved_character_type: null,
    resolved_alignment: null,
    decision_source: 'storyteller_prompt',
    created_at_event_id: 'q1',
    resolved_at_event_id: null,
    note: null
  };

  const resolved = fortune_teller_plugin.hooks.on_prompt_resolved?.({
    state: after_create,
    prompt_id: registration_prompt_id,
    selected_option_id: 'character_type:demon',
    freeform: null
  });

  assert.ok(resolved);
  assert.equal(resolved?.emitted_events[0]?.event_type, 'RegistrationDecisionRecorded');
  assert.equal(resolved?.emitted_events[1]?.payload.note, 'fortune_teller_info:p1:pair=p2,p3;yes=true');
});

test('fortune teller resolves yes when pair includes red herring', () => {
  const state = create_initial_state('g1');
  state.day_number = 0;
  state.night_number = 1;
  state.players_by_id.p1 = make_player('p1', 'FT', 'fortune_teller', 'good');
  state.players_by_id.p2 = make_player('p2', 'GoodA', 'chef', 'good');
  state.players_by_id.p3 = make_player('p3', 'GoodB', 'washerwoman', 'good');
  state.players_by_id.p4 = make_player('p4', 'Imp', 'imp', 'evil', { is_demon: true });
  state.reminder_markers_by_id.rh = {
    marker_id: 'rh',
    kind: 'fortune_teller:red_herring',
    effect: 'register_as_demon',
    note: 'setup',
    status: 'active',
    source_player_id: 'p1',
    source_character_id: 'fortune_teller',
    target_player_id: 'p2',
    target_scope: 'player',
    authoritative: true,
    expires_policy: 'manual',
    expires_at_day_number: null,
    expires_at_night_number: null,
    created_at_event_id: 'e1',
    cleared_at_event_id: null,
    source_event_id: null,
    metadata: {}
  };
  state.active_reminder_marker_ids = ['rh'];

  const result = fortune_teller_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:fortune_teller:night_check:1:p1',
    selected_option_id: 'p2|p3',
    freeform: null
  });

  assert.ok(result);
  assert.equal(result?.emitted_events.length, 1);
  const note = result?.emitted_events[0]?.payload.note;
  assert.equal(note, 'fortune_teller_info:p1:pair=p2,p3;yes=true');
});

test('fortune teller queues misinformation prompt when poisoned', () => {
  const state = create_initial_state('g1');
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'FT', 'fortune_teller', 'good', { poisoned: true });
  state.players_by_id.p2 = make_player('p2', 'A', 'washerwoman', 'good');
  state.players_by_id.p3 = make_player('p3', 'B', 'imp', 'evil', { is_demon: true });

  const result = fortune_teller_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:fortune_teller:night_check:2:p1',
    selected_option_id: 'p2|p3',
    freeform: null
  });
  assert.ok(result);
  assert.equal(result?.queued_prompts.length, 1);
  assert.equal(result?.queued_prompts[0]?.prompt_id, 'plugin:fortune_teller:misinfo:2:p1:p2:p3');
  assert.equal(result?.queued_prompts[0]?.selection_mode, 'single_choice');
  assert.deepEqual(
    result?.queued_prompts[0]?.options.map((option) => option.option_id),
    ['yes', 'no']
  );

  const misinfo_choice = result?.queued_prompts[0]?.options[1]?.option_id ?? 'no';

  const misinfoResolved = fortune_teller_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:fortune_teller:misinfo:2:p1:p2:p3',
    selected_option_id: misinfo_choice,
    freeform: null
  });
  assert.ok(misinfoResolved);
  assert.equal(
    misinfoResolved?.emitted_events[0]?.payload.note,
    `fortune_teller_info:p1:pair=p2,p3;yes=${misinfo_choice === 'yes'}`
  );
});
