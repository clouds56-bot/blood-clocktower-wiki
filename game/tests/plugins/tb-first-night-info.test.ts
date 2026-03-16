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
  assert.equal(wake?.queued_prompts[0]?.prompt_id, 'plugin:chef:misinfo:n1:p1');
  assert.equal(wake?.queued_prompts[0]?.selection_mode, 'number_range');
  assert.deepEqual(wake?.queued_prompts[0]?.number_range, { min: 0, max: 3 });
  const chef_range = wake?.queued_prompts[0]?.number_range;
  assert.ok(chef_range);
  const selected_for_chef = chef_range ? String(chef_range.max) : '0';

  const resolved = chef_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_key: 'plugin:chef:misinfo:n1:p1',
    prompt_id: 'plugin:chef:misinfo:n1:p1',
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
  assert.equal(wake?.queued_prompts[0]?.prompt_id, 'plugin:chef:misinfo:n2:p1');
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
    created_at_event_id: 1,
    resolved_at_event_id: 2,
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
    created_at_event_id: 3,
    resolved_at_event_id: 4,
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

test('chef skips spy registration prompt when both adjacent pairs are guaranteed non-evil', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 1;
  state.seat_order = ['p1', 'p2', 'p3', 'p4'];
  state.players_by_id.p1 = make_player('p1', 'GoodA', 'chef', 'good');
  state.players_by_id.p2 = make_player('p2', 'Spy', 'spy', 'evil');
  state.players_by_id.p3 = make_player('p3', 'GoodB', 'washerwoman', 'good');
  state.players_by_id.p4 = make_player('p4', 'Chef', 'chef', 'good');

  const result = chef_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p4',
    wake_step_id: 'wake:1:0:p4:chef'
  });

  assert.ok(result);
  assert.equal(result?.queued_prompts.length, 0);
  assert.equal(result?.emitted_events.length, 1);
  assert.equal(result?.emitted_events[0]?.payload.note, 'chef_info:p4:adjacent_evil_pairs=0');
});

test('chef unresolved spy registration prompt id is provider-owned and readable', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 1;
  state.seat_order = ['p1', 'p2', 'p3', 'p4'];
  state.players_by_id.p1 = make_player('p1', 'EvilA', 'poisoner', 'evil');
  state.players_by_id.p2 = make_player('p2', 'Spy', 'spy', 'evil');
  state.players_by_id.p3 = make_player('p3', 'GoodA', 'washerwoman', 'good');
  state.players_by_id.p4 = make_player('p4', 'Chef', 'chef', 'good');

  const result = chef_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p4',
    wake_step_id: 'wake:1:0:p4:chef'
  });

  assert.ok(result);
  assert.equal(result?.queued_prompts.length, 1);
  const prompt_id = result?.queued_prompts[0]?.prompt_id ?? '';
  assert.equal(prompt_id.startsWith('plugin:spy:registration:chef:'), true);
  assert.equal(prompt_id.includes('%3A'), false);
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
  assert.equal(wake?.queued_prompts[0]?.prompt_id, 'plugin:empath:misinfo:n2:p1');
  assert.equal(wake?.queued_prompts[0]?.selection_mode, 'number_range');
  assert.deepEqual(wake?.queued_prompts[0]?.number_range, { min: 0, max: 2 });
  const empath_range = wake?.queued_prompts[0]?.number_range;
  assert.ok(empath_range);
  const selected_for_empath = empath_range ? String(empath_range.min) : '0';

  const resolved = empath_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_key: 'plugin:empath:misinfo:n2:p1',
    prompt_id: 'plugin:empath:misinfo:n2:p1',
    selected_option_id: selected_for_empath,
    freeform: null
  });
  assert.ok(resolved);
  assert.equal(
    resolved?.emitted_events[0]?.payload.note,
    `empath_info:p1:alive_neighbor_evil_count=${selected_for_empath}`
  );
});

test('empath queues all unresolved registration prompts in a single wake', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 2;
  state.seat_order = ['p1', 'p2', 'p3', 'p4'];
  state.players_by_id.p1 = make_player('p1', 'Empath', 'empath', 'good');
  state.players_by_id.p2 = make_player('p2', 'Spy', 'spy', 'evil');
  state.players_by_id.p3 = make_player('p3', 'Chef', 'chef', 'good');
  state.players_by_id.p4 = make_player('p4', 'Recluse', 'recluse', 'good');

  const wake = empath_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p1',
    wake_step_id: 'wake:2:0:p1:empath'
  });

  assert.ok(wake);
  assert.equal(wake?.queued_prompts.length, 2);
  assert.deepEqual(
    wake?.queued_prompts.map((prompt) => prompt.prompt_id),
    [
      'plugin:recluse:registration:empath:p1:alive_neighbors:reg:empath:alignment_check:d1:n2:p4:neighbor_0:p1',
      'plugin:spy:registration:empath:p1:alive_neighbors:reg:empath:alignment_check:d1:n2:p2:neighbor_1:p1'
    ]
  );

  const query_created_events =
    wake?.emitted_events.filter((event) => event.event_type === 'RegistrationQueryCreated') ?? [];
  assert.equal(query_created_events.length, 2);
});

test('empath on_registration_resolved waits for remaining pending registration queries', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 2;
  state.phase = 'night';
  state.seat_order = ['p1', 'p2', 'p3', 'p4'];
  state.players_by_id.p1 = make_player('p1', 'Empath', 'empath', 'good');
  state.players_by_id.p2 = make_player('p2', 'Spy', 'spy', 'evil');
  state.players_by_id.p3 = make_player('p3', 'Chef', 'chef', 'good');
  state.players_by_id.p4 = make_player('p4', 'Recluse', 'recluse', 'good');

  const qLeft = build_registration_query_id({
    consumer_role_id: 'empath',
    query_kind: 'alignment_check',
    day_number: 1,
    night_number: 2,
    subject_player_id: 'p4',
    query_slot: 'neighbor_0',
    context_player_ids: ['p1']
  });
  const qRight = build_registration_query_id({
    consumer_role_id: 'empath',
    query_kind: 'alignment_check',
    day_number: 1,
    night_number: 2,
    subject_player_id: 'p2',
    query_slot: 'neighbor_1',
    context_player_ids: ['p1']
  });

  state.registration_queries_by_id[qLeft] = {
    query_id: qLeft,
    consumer_role_id: 'empath',
    query_kind: 'alignment_check',
    subject_player_id: 'p4',
    subject_context_player_ids: ['p1'],
    phase: 'night',
    day_number: 1,
    night_number: 2,
    status: 'resolved',
    resolved_character_id: null,
    resolved_character_type: null,
    resolved_alignment: 'evil',
    decision_source: 'storyteller_prompt',
    created_at_event_id: 5,
    resolved_at_event_id: 6,
    note: 'recluse registers evil for this check'
  };
  state.registration_queries_by_id[qRight] = {
    query_id: qRight,
    consumer_role_id: 'empath',
    query_kind: 'alignment_check',
    subject_player_id: 'p2',
    subject_context_player_ids: ['p1'],
    phase: 'night',
    day_number: 1,
    night_number: 2,
    status: 'pending',
    resolved_character_id: null,
    resolved_character_type: null,
    resolved_alignment: null,
    decision_source: 'storyteller_prompt',
    created_at_event_id: 7,
    resolved_at_event_id: null,
    note: null
  };

  const blocked = empath_plugin.hooks.on_registration_resolved?.({
    state,
    prompt_key: `plugin:recluse:registration:empath:p1:alive_neighbors:${qLeft}`,
    prompt_id: `plugin:recluse:registration:empath:p1:alive_neighbors:${qLeft}`,
    provider_role_id: 'recluse',
    consumer_role_id: 'empath',
    owner_player_id: 'p1',
    context_tag: 'alive_neighbors',
    query_id: qLeft,
    selected_option_id: 'alignment:evil',
    freeform: null,
    decision: {
      query_id: qLeft,
      resolved_character_id: null,
      resolved_character_type: null,
      resolved_alignment: 'evil',
      decision_source: 'storyteller_prompt',
      note: 'registration_alignment:evil'
    }
  });

  assert.ok(blocked);
  assert.equal(blocked?.queued_prompts.length, 0);
  assert.equal(blocked?.emitted_events.length, 0);

  state.registration_queries_by_id[qRight] = {
    ...state.registration_queries_by_id[qRight],
    status: 'resolved',
    resolved_alignment: 'good',
    resolved_at_event_id: 8,
    note: 'spy registers good for this check'
  };

  const done = empath_plugin.hooks.on_registration_resolved?.({
    state,
    prompt_key: `plugin:spy:registration:empath:p1:alive_neighbors:${qRight}`,
    prompt_id: `plugin:spy:registration:empath:p1:alive_neighbors:${qRight}`,
    provider_role_id: 'spy',
    consumer_role_id: 'empath',
    owner_player_id: 'p1',
    context_tag: 'alive_neighbors',
    query_id: qRight,
    selected_option_id: 'alignment:good',
    freeform: null,
    decision: {
      query_id: qRight,
      resolved_character_id: null,
      resolved_character_type: null,
      resolved_alignment: 'good',
      decision_source: 'storyteller_prompt',
      note: 'registration_alignment:good'
    }
  });

  assert.ok(done);
  assert.equal(done?.queued_prompts.length, 0);
  assert.equal(done?.emitted_events.length, 1);
  assert.equal(done?.emitted_events[0]?.payload.note, 'empath_info:p1:alive_neighbor_evil_count=1');
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
    prompt_key: 'plugin:fortune_teller:night_check:n2:p1',
    prompt_id: 'plugin:fortune_teller:night_check:n2:p1',
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
    created_at_event_id: 9,
    resolved_at_event_id: 10,
    note: 'spy registers as demon for this check'
  };

  const result = fortune_teller_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_key: 'plugin:fortune_teller:night_check:n2:p1',
    prompt_id: 'plugin:fortune_teller:night_check:n2:p1',
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
    prompt_key: 'plugin:fortune_teller:night_check:n2:p1',
    prompt_id: 'plugin:fortune_teller:night_check:n2:p1',
    selected_option_id: 'p2|p3',
    freeform: null
  });

  assert.ok(first);
  assert.equal(first?.emitted_events[0]?.event_type, 'RegistrationQueryCreated');
  assert.equal(first?.queued_prompts.length, 1);
  const registration_prompt_id = first?.queued_prompts[0]?.prompt_id ?? '';
  assert.equal(registration_prompt_id.startsWith('plugin:recluse:registration:fortune_teller:'), true);

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
    created_at_event_id: 11,
    resolved_at_event_id: null,
    note: null
  };

  after_create.registration_queries_by_id[query_id] = {
    ...after_create.registration_queries_by_id[query_id],
    status: 'resolved',
    resolved_character_type: 'demon',
    resolved_at_event_id: 12,
    note: 'recluse registers as demon for this query'
  };

  const resolved = fortune_teller_plugin.hooks.on_registration_resolved?.({
    state: after_create,
    prompt_key: registration_prompt_id,
    prompt_id: registration_prompt_id,
    provider_role_id: 'recluse',
    consumer_role_id: 'fortune_teller',
    owner_player_id: 'p1',
    context_tag: 'p2,p3',
    query_id,
    selected_option_id: 'character_type:demon',
    freeform: null,
    decision: {
      query_id,
      resolved_character_id: null,
      resolved_character_type: 'demon',
      resolved_alignment: null,
      decision_source: 'storyteller_prompt',
      note: 'registration_character_type:demon'
    }
  });

  assert.ok(resolved);
  assert.equal(resolved?.emitted_events[0]?.payload.note, 'fortune_teller_info:p1:pair=p2,p3;yes=true');
});

test('fortune teller skips recluse registration query when pair already has real demon', () => {
  const state = create_initial_state('g1');
  state.day_number = 1;
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'FT', 'fortune_teller', 'good');
  state.players_by_id.p2 = make_player('p2', 'Imp', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p3 = make_player('p3', 'Recluse', 'recluse', 'good');

  const result = fortune_teller_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_key: 'plugin:fortune_teller:night_check:n2:p1',
    prompt_id: 'plugin:fortune_teller:night_check:n2:p1',
    selected_option_id: 'p2|p3',
    freeform: null
  });

  assert.ok(result);
  assert.equal(result?.queued_prompts.length, 0);
  assert.equal(result?.emitted_events.length, 1);
  assert.equal(result?.emitted_events[0]?.payload.note, 'fortune_teller_info:p1:pair=p2,p3;yes=true');
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
    created_at_event_id: 13,
    cleared_at_event_id: null,
    source_event_id: null,
    metadata: {}
  };
  state.active_reminder_marker_ids = ['rh'];

  const result = fortune_teller_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_key: 'plugin:fortune_teller:night_check:n1:p1',
    prompt_id: 'plugin:fortune_teller:night_check:n1:p1',
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
    prompt_key: 'plugin:fortune_teller:night_check:n2:p1',
    prompt_id: 'plugin:fortune_teller:night_check:n2:p1',
    selected_option_id: 'p2|p3',
    freeform: null
  });
  assert.ok(result);
  assert.equal(result?.queued_prompts.length, 1);
  assert.equal(result?.queued_prompts[0]?.prompt_id, 'plugin:fortune_teller:misinfo_pair:n2:p1:p2,p3');
  assert.equal(result?.queued_prompts[0]?.selection_mode, 'single_choice');
  assert.deepEqual(
    result?.queued_prompts[0]?.options.map((option) => option.option_id),
    ['yes', 'no']
  );

  const misinfo_choice = result?.queued_prompts[0]?.options[1]?.option_id ?? 'no';

  const misinfoResolved = fortune_teller_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_key: 'plugin:fortune_teller:misinfo_pair:n2:p1:p2,p3',
    prompt_id: 'plugin:fortune_teller:misinfo_pair:n2:p1:p2,p3',
    selected_option_id: misinfo_choice,
    freeform: null
  });
  assert.ok(misinfoResolved);
  assert.equal(
    misinfoResolved?.emitted_events[0]?.payload.note,
    `fortune_teller_info:p1:pair=p2,p3;yes=${misinfo_choice === 'yes'}`
  );
});
