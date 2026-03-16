import assert from 'node:assert/strict';
import test from 'node:test';

import type { Command } from '../../src/domain/commands.js';
import { apply_events } from '../../src/domain/reducer.js';
import { create_initial_state } from '../../src/domain/state.js';
import type { GameState } from '../../src/domain/types.js';
import { handle_command } from '../../src/engine/command-handler.js';
import { chef_plugin } from '../../src/plugins/characters/chef.js';
import { butler_plugin } from '../../src/plugins/characters/butler.js';
import { empath_plugin } from '../../src/plugins/characters/empath.js';
import { fortune_teller_plugin } from '../../src/plugins/characters/fortune-teller.js';
import { imp_plugin } from '../../src/plugins/characters/imp.js';
import { investigator_plugin } from '../../src/plugins/characters/investigator.js';
import { librarian_plugin } from '../../src/plugins/characters/librarian.js';
import { monk_plugin } from '../../src/plugins/characters/monk.js';
import { ravenkeeper_plugin } from '../../src/plugins/characters/ravenkeeper.js';
import { slayer_plugin } from '../../src/plugins/characters/slayer.js';
import { undertaker_plugin } from '../../src/plugins/characters/undertaker.js';
import { virgin_plugin } from '../../src/plugins/characters/virgin.js';
import { washerwoman_plugin } from '../../src/plugins/characters/washerwoman.js';
import { PluginRegistry } from '../../src/plugins/registry.js';
import { make_player } from './tb-test-utils.js';

const DAY_HOOK_REGISTRY = new PluginRegistry([butler_plugin, slayer_plugin, virgin_plugin]);

test('chef example: no adjacent evil players -> learns 0', () => {
  const state = create_initial_state('g1');
  state.seat_order = ['p1', 'p2', 'p3', 'p4'];
  state.players_by_id.p1 = make_player('p1', 'Chef', 'chef', 'good');
  state.players_by_id.p2 = make_player('p2', 'GoodA', 'washerwoman', 'good');
  state.players_by_id.p3 = make_player('p3', 'Imp', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p4 = make_player('p4', 'GoodB', 'librarian', 'good');

  const result = chef_plugin.hooks.on_night_wake?.({ state, player_id: 'p1', wake_step_id: 'wake:1' });
  assert.equal(result?.emitted_events[0]?.payload.note, 'chef_info:p1:adjacent_evil_pairs=0');
});

test('chef example: two adjacent evil pairs -> learns 2', () => {
  const state = create_initial_state('g1');
  state.seat_order = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  state.players_by_id.p1 = make_player('p1', 'Chef', 'chef', 'good');
  state.players_by_id.p2 = make_player('p2', 'Imp', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p3 = make_player('p3', 'Baron', 'baron', 'evil');
  state.players_by_id.p4 = make_player('p4', 'GoodA', 'washerwoman', 'good');
  state.players_by_id.p5 = make_player('p5', 'Poisoner', 'poisoner', 'evil');
  state.players_by_id.p6 = make_player('p6', 'ScarletWoman', 'scarlet_woman', 'evil');

  const result = chef_plugin.hooks.on_night_wake?.({ state, player_id: 'p1', wake_step_id: 'wake:1' });
  assert.equal(result?.emitted_events[0]?.payload.note, 'chef_info:p1:adjacent_evil_pairs=2');
});

test.skip('chef example: recluse registration split pair behavior (not implemented yet)');

test('empath example: neighbors are Soldier and Monk -> learns 0', () => {
  const state = create_initial_state('g1');
  state.seat_order = ['p1', 'p2', 'p3'];
  state.players_by_id.p1 = make_player('p1', 'Empath', 'empath', 'good');
  state.players_by_id.p2 = make_player('p2', 'Soldier', 'soldier', 'good');
  state.players_by_id.p3 = make_player('p3', 'Monk', 'monk', 'good');

  const result = empath_plugin.hooks.on_night_wake?.({ state, player_id: 'p1', wake_step_id: 'wake:1' });
  assert.equal(result?.emitted_events[0]?.payload.note, 'empath_info:p1:alive_neighbor_evil_count=0');
});

test('empath example: after neighbors die, nearest alive include one evil -> learns 1', () => {
  const state = create_initial_state('g1');
  state.seat_order = ['p1', 'p2', 'p3', 'p4', 'p5'];
  state.players_by_id.p1 = make_player('p1', 'Empath', 'empath', 'good');
  state.players_by_id.p2 = make_player('p2', 'Soldier', 'soldier', 'good', { alive: false });
  state.players_by_id.p3 = make_player('p3', 'Librarian', 'librarian', 'good');
  state.players_by_id.p4 = make_player('p4', 'Monk', 'monk', 'good', { alive: false });
  state.players_by_id.p5 = make_player('p5', 'Gunslinger', 'gunslinger', 'evil');

  const result = empath_plugin.hooks.on_night_wake?.({ state, player_id: 'p1', wake_step_id: 'wake:2' });
  assert.equal(result?.emitted_events[0]?.payload.note, 'empath_info:p1:alive_neighbor_evil_count=1');
});

test('empath example: final 3 with Imp and Baron neighbors -> learns 2', () => {
  const state = create_initial_state('g1');
  state.seat_order = ['p1', 'p2', 'p3'];
  state.players_by_id.p1 = make_player('p1', 'Empath', 'empath', 'good');
  state.players_by_id.p2 = make_player('p2', 'Imp', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p3 = make_player('p3', 'Baron', 'baron', 'evil');

  const result = empath_plugin.hooks.on_night_wake?.({ state, player_id: 'p1', wake_step_id: 'wake:3' });
  assert.equal(result?.emitted_events[0]?.payload.note, 'empath_info:p1:alive_neighbor_evil_count=2');
});

test('fortune teller example: Monk + Undertaker -> no', () => {
  const state = create_initial_state('g1');
  state.players_by_id.p1 = make_player('p1', 'FortuneTeller', 'fortune_teller', 'good');
  state.players_by_id.p2 = make_player('p2', 'Monk', 'monk', 'good');
  state.players_by_id.p3 = make_player('p3', 'Undertaker', 'undertaker', 'good');

  const result = fortune_teller_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:fortune_teller:night_check:1:p1',
    selected_option_id: 'p2|p3',
    freeform: null
  });
  assert.equal(result?.emitted_events[0]?.payload.note, 'fortune_teller_info:p1:pair=p2,p3;yes=false');
});

test('fortune teller example: Imp + Empath -> yes', () => {
  const state = create_initial_state('g1');
  state.players_by_id.p1 = make_player('p1', 'FortuneTeller', 'fortune_teller', 'good');
  state.players_by_id.p2 = make_player('p2', 'Imp', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p3 = make_player('p3', 'Empath', 'empath', 'good');

  const result = fortune_teller_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:fortune_teller:night_check:1:p1',
    selected_option_id: 'p2|p3',
    freeform: null
  });
  assert.equal(result?.emitted_events[0]?.payload.note, 'fortune_teller_info:p1:pair=p2,p3;yes=true');
});

test('fortune teller example: alive Butler + dead Imp selection -> yes', () => {
  const state = create_initial_state('g1');
  state.players_by_id.p1 = make_player('p1', 'FortuneTeller', 'fortune_teller', 'good');
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
  assert.equal(result?.emitted_events[0]?.payload.note, 'fortune_teller_info:p1:pair=p2,p3;yes=true');
});

test('fortune teller example: self + red herring Saint -> yes', () => {
  const state = create_initial_state('g1');
  state.players_by_id.p1 = make_player('p1', 'FortuneTeller', 'fortune_teller', 'good');
  state.players_by_id.p2 = make_player('p2', 'Saint', 'saint', 'good');
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
    selected_option_id: 'p1|p2',
    freeform: null
  });
  assert.equal(result?.emitted_events[0]?.payload.note, 'fortune_teller_info:p1:pair=p1,p2;yes=true');
});

test('investigator example: Baron and Mayor pair -> learns Baron', () => {
  const state = create_initial_state('g1');
  state.seat_order = ['p1', 'p2', 'p3'];
  state.players_by_id.p1 = make_player('p1', 'Investigator', 'investigator', 'good');
  state.players_by_id.p2 = make_player('p2', 'Amy', 'baron', 'evil');
  state.players_by_id.p3 = make_player('p3', 'Julian', 'mayor', 'good');

  const result = investigator_plugin.hooks.on_night_wake?.({ state, player_id: 'p1', wake_step_id: 'wake:1' });
  assert.equal(
    result?.emitted_events[0]?.payload.note,
    'investigator_info:p1:character=baron;players=p2,p3'
  );
});

test('investigator example: Spy and Poisoner pair -> learns Spy', () => {
  const state = create_initial_state('g1');
  state.seat_order = ['p1', 'p2', 'p3'];
  state.players_by_id.p1 = make_player('p1', 'Investigator', 'investigator', 'good');
  state.players_by_id.p2 = make_player('p2', 'Angelus', 'spy', 'evil');
  state.players_by_id.p3 = make_player('p3', 'Lewis', 'poisoner', 'evil');

  const result = investigator_plugin.hooks.on_night_wake?.({ state, player_id: 'p1', wake_step_id: 'wake:1' });
  assert.equal(
    result?.emitted_events[0]?.payload.note,
    'investigator_info:p1:character=spy;players=p2,p3'
  );
});

test.skip('investigator example: recluse registers as minion (registration system not implemented yet)');

test('librarian example: Saint in pair -> learns Saint', () => {
  const state = create_initial_state('g1');
  state.seat_order = ['p1', 'p2', 'p3'];
  state.players_by_id.p1 = make_player('p1', 'Librarian', 'librarian', 'good');
  state.players_by_id.p2 = make_player('p2', 'Benjamin', 'saint', 'good');
  state.players_by_id.p3 = make_player('p3', 'Filip', 'baron', 'evil');

  const result = librarian_plugin.hooks.on_night_wake?.({ state, player_id: 'p1', wake_step_id: 'wake:1' });
  assert.equal(result?.emitted_events[0]?.payload.note, 'librarian_info:p1:character=saint;players=p2,p3');
});

test('librarian example: zero outsiders in play -> learns 0', () => {
  const state = create_initial_state('g1');
  state.seat_order = ['p1', 'p2'];
  state.players_by_id.p1 = make_player('p1', 'Librarian', 'librarian', 'good');
  state.players_by_id.p2 = make_player('p2', 'Chef', 'chef', 'good');

  const result = librarian_plugin.hooks.on_night_wake?.({ state, player_id: 'p1', wake_step_id: 'wake:1' });
  assert.equal(result?.emitted_events[0]?.payload.note, 'librarian_info:p1:none_in_play');
});

test('librarian example: Drunk true role is shown, not perceived role', () => {
  const state = create_initial_state('g1');
  state.seat_order = ['p1', 'p2', 'p3'];
  state.players_by_id.p1 = make_player('p1', 'Librarian', 'librarian', 'good');
  state.players_by_id.p2 = {
    ...make_player('p2', 'Abdallah', 'drunk', 'good'),
    perceived_character_id: 'monk'
  };
  state.players_by_id.p3 = make_player('p3', 'Douglas', 'undertaker', 'good');

  const result = librarian_plugin.hooks.on_night_wake?.({ state, player_id: 'p1', wake_step_id: 'wake:1' });
  assert.equal(result?.emitted_events[0]?.payload.note, 'librarian_info:p1:character=drunk;players=p2,p3');
});

test('washerwoman example: Chef in pair -> learns Chef', () => {
  const state = create_initial_state('g1');
  state.seat_order = ['p1', 'p2', 'p3'];
  state.players_by_id.p1 = make_player('p1', 'Washerwoman', 'washerwoman', 'good');
  state.players_by_id.p2 = make_player('p2', 'Evin', 'chef', 'good');
  state.players_by_id.p3 = make_player('p3', 'Amy', 'ravenkeeper', 'good');

  const result = washerwoman_plugin.hooks.on_night_wake?.({ state, player_id: 'p1', wake_step_id: 'wake:1' });
  assert.equal(
    result?.emitted_events[0]?.payload.note,
    'washerwoman_info:p1:character=chef;players=p2,p3'
  );
});

test('washerwoman example: Imp + Virgin pair -> learns Virgin', () => {
  const state = create_initial_state('g1');
  state.seat_order = ['p1', 'p2', 'p3'];
  state.players_by_id.p1 = make_player('p1', 'Washerwoman', 'washerwoman', 'good');
  state.players_by_id.p2 = make_player('p2', 'Julian', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p3 = make_player('p3', 'Alex', 'virgin', 'good');

  const result = washerwoman_plugin.hooks.on_night_wake?.({ state, player_id: 'p1', wake_step_id: 'wake:1' });
  assert.equal(
    result?.emitted_events[0]?.payload.note,
    'washerwoman_info:p1:character=virgin;players=p3,p2'
  );
});

test.skip('washerwoman example: spy registers as townsfolk (registration system not implemented yet)');

test('monk example: protects Fortune Teller from Imp attack', () => {
  const state = create_initial_state('g1');
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'Monk', 'monk', 'good');
  state.players_by_id.p2 = make_player('p2', 'FortuneTeller', 'fortune_teller', 'good');
  state.players_by_id.p3 = make_player('p3', 'Imp', 'imp', 'evil', { is_demon: true });

  const monk_result = monk_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:monk:night_protect:2:p1',
    selected_option_id: 'p2',
    freeform: null
  });
  const marker_apply = monk_result?.emitted_events.find((event) => event.event_type === 'ReminderMarkerApplied');
  assert.ok(marker_apply);

  if (marker_apply && marker_apply.event_type === 'ReminderMarkerApplied') {
    const payload = marker_apply.payload as {
      marker_id: string;
      kind: string;
      effect: string;
      note: string;
      source_player_id: string | null;
      source_character_id: string | null;
      target_player_id: string | null;
      target_scope: 'player' | 'game' | 'pair';
      authoritative: boolean;
      expires_policy:
        | 'manual'
        | 'end_of_day'
        | 'start_of_day'
        | 'end_of_night'
        | 'start_of_night'
        | 'on_source_death'
        | 'on_target_death'
        | 'at_day'
        | 'at_night';
      expires_at_day_number: number | null;
      expires_at_night_number: number | null;
      source_event_id: string | null;
      metadata: Record<string, unknown>;
    };

    state.reminder_markers_by_id[payload.marker_id] = {
      ...payload,
      status: 'active',
      created_at_event_id: 'm1',
      cleared_at_event_id: null
    };
    state.active_reminder_marker_ids = [payload.marker_id];
  }

  const imp_result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:2:p3',
    selected_option_id: 'p2',
    freeform: null
  });
  assert.equal(imp_result?.emitted_events.length, 0);
});

test('monk example: protects Mayor from Imp attack (no death)', () => {
  const state = create_initial_state('g1');
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'Monk', 'monk', 'good');
  state.players_by_id.p2 = make_player('p2', 'Mayor', 'mayor', 'good');
  state.players_by_id.p3 = make_player('p3', 'Imp', 'imp', 'evil', { is_demon: true });

  const monk_result = monk_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:monk:night_protect:2:p1',
    selected_option_id: 'p2',
    freeform: null
  });
  const marker_apply = monk_result?.emitted_events.find((event) => event.event_type === 'ReminderMarkerApplied');
  assert.ok(marker_apply);

  if (marker_apply && marker_apply.event_type === 'ReminderMarkerApplied') {
    const payload = marker_apply.payload as {
      marker_id: string;
      kind: string;
      effect: string;
      note: string;
      source_player_id: string | null;
      source_character_id: string | null;
      target_player_id: string | null;
      target_scope: 'player' | 'game' | 'pair';
      authoritative: boolean;
      expires_policy:
        | 'manual'
        | 'end_of_day'
        | 'start_of_day'
        | 'end_of_night'
        | 'start_of_night'
        | 'on_source_death'
        | 'on_target_death'
        | 'at_day'
        | 'at_night';
      expires_at_day_number: number | null;
      expires_at_night_number: number | null;
      source_event_id: string | null;
      metadata: Record<string, unknown>;
    };

    state.reminder_markers_by_id[payload.marker_id] = {
      ...payload,
      status: 'active',
      created_at_event_id: 'm1',
      cleared_at_event_id: null
    };
    state.active_reminder_marker_ids = [payload.marker_id];
  }

  const imp_result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:2:p3',
    selected_option_id: 'p2',
    freeform: null
  });
  assert.equal(imp_result?.emitted_events.length, 0);
});

test('monk example: monk protects Imp self-kill transfer case', () => {
  const state = create_initial_state('g1');
  state.night_number = 2;
  state.seat_order = ['p1', 'p2', 'p3'];
  state.players_by_id.p1 = make_player('p1', 'Monk', 'monk', 'good');
  state.players_by_id.p2 = make_player('p2', 'Imp', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p3 = make_player('p3', 'Poisoner', 'poisoner', 'evil');

  const monk_result = monk_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:monk:night_protect:2:p1',
    selected_option_id: 'p2',
    freeform: null
  });
  const marker_apply = monk_result?.emitted_events.find((event) => event.event_type === 'ReminderMarkerApplied');
  assert.ok(marker_apply);

  if (marker_apply && marker_apply.event_type === 'ReminderMarkerApplied') {
    const payload = marker_apply.payload as {
      marker_id: string;
      kind: string;
      effect: string;
      note: string;
      source_player_id: string | null;
      source_character_id: string | null;
      target_player_id: string | null;
      target_scope: 'player' | 'game' | 'pair';
      authoritative: boolean;
      expires_policy:
        | 'manual'
        | 'end_of_day'
        | 'start_of_day'
        | 'end_of_night'
        | 'start_of_night'
        | 'on_source_death'
        | 'on_target_death'
        | 'at_day'
        | 'at_night';
      expires_at_day_number: number | null;
      expires_at_night_number: number | null;
      source_event_id: string | null;
      metadata: Record<string, unknown>;
    };

    state.reminder_markers_by_id[payload.marker_id] = {
      ...payload,
      status: 'active',
      created_at_event_id: 'm1',
      cleared_at_event_id: null
    };
    state.active_reminder_marker_ids = [payload.marker_id];
  }

  const imp_result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:2:p2',
    selected_option_id: 'p2',
    freeform: null
  });
  assert.equal(imp_result?.emitted_events.length, 0);
});

test('soldier example: Imp attacks Soldier -> no death', () => {
  const state = create_initial_state('g1');
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'Imp', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'Soldier', 'soldier', 'good');

  const result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:2:p1',
    selected_option_id: 'p2',
    freeform: null
  });
  assert.equal(result?.emitted_events.length, 0);
});

test('soldier example: poisoned Soldier is killed by Imp', () => {
  const state = create_initial_state('g1');
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'Imp', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'Soldier', 'soldier', 'good', { poisoned: true });

  const result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:2:p1',
    selected_option_id: 'p2',
    freeform: null
  });
  assert.equal(result?.emitted_events.length, 1);
  assert.equal(result?.emitted_events[0]?.event_type, 'PlayerDied');
});

test('soldier example: drunk Soldier is killed by Imp', () => {
  const state = create_initial_state('g1');
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'Imp', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'Soldier', 'soldier', 'good', { drunk: true });

  const result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:2:p1',
    selected_option_id: 'p2',
    freeform: null
  });
  assert.equal(result?.emitted_events.length, 1);
  assert.equal(result?.emitted_events[0]?.event_type, 'PlayerDied');
});

test('imp example: self-kill passes demonhood to a minion', () => {
  const state = create_initial_state('g1');
  state.night_number = 2;
  state.seat_order = ['p1', 'p2', 'p3'];
  state.players_by_id.p1 = make_player('p1', 'Imp', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'Poisoner', 'poisoner', 'evil');
  state.players_by_id.p3 = make_player('p3', 'Spy', 'spy', 'evil');

  const result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:2:p1',
    selected_option_id: 'p1',
    freeform: null
  });

  assert.ok(result);
  assert.deepEqual(
    result?.emitted_events.map((event) => event.event_type),
    ['PlayerDied', 'ReminderMarkerApplied']
  );
});
test.skip('poisoner examples: slayer/undertaker/saint/poison-source removal interactions (not implemented yet)');

test('slayer example: chooses Imp, Imp dies, then good wins', () => {
  let state = bootstrap_day_state();
  state = run_command(state, {
    command_id: 'c-assign-slayer',
    command_type: 'AssignCharacter',
    payload: { player_id: 'p1', true_character_id: 'slayer' }
  });
  state = run_command(state, {
    command_id: 'c-assign-imp',
    command_type: 'AssignCharacter',
    payload: { player_id: 'p2', true_character_id: 'imp', is_demon: true }
  });
  state = run_command(state, {
    command_id: 'c-slay',
    command_type: 'UseClaimedAbility',
    payload: {
      claimant_player_id: 'p1',
      claimed_character_id: 'slayer'
    }
  });
  const prompt_id = state.pending_prompts[0] ?? '';
  state = run_command(state, {
    command_id: 'c-slay-resolve',
    command_type: 'ResolvePrompt',
    payload: {
      prompt_id,
      selected_option_id: 'p2',
      freeform: null,
      notes: null
    }
  });
  state = run_command(state, {
    command_id: 'c-check-win',
    command_type: 'CheckWinConditions',
    payload: { day_number: 1, night_number: 1 }
  });

  assert.equal(state.players_by_id.p2?.alive, false);
  assert.equal(state.winning_team, 'good');
});

test.skip('slayer example: chooses Recluse and recluse dies via demon registration (registration not implemented yet)');

test('slayer example: Imp bluffing as Slayer creates attempt but no kill', () => {
  let state = bootstrap_day_state();
  state = run_command(state, {
    command_id: 'c-fake-slay',
    command_type: 'UseClaimedAbility',
    payload: {
      claimant_player_id: 'p2',
      claimed_character_id: 'slayer'
    }
  });
  const prompt_id = state.pending_prompts[0] ?? '';
  state = run_command(state, {
    command_id: 'c-fake-slay-resolve',
    command_type: 'ResolvePrompt',
    payload: {
      prompt_id,
      selected_option_id: 'p3',
      freeform: null,
      notes: null
    }
  });

  assert.equal(state.players_by_id.p3?.alive, true);
  const attempt_events = state.domain_events.filter((event) => event.event_type === 'ClaimedAbilityAttempted');
  assert.equal(attempt_events.length, 1);
});

test('virgin example: washerwoman nominates virgin and is executed immediately', () => {
  let state = bootstrap_day_state();
  state = run_command(state, {
    command_id: 'c-assign-virgin',
    command_type: 'AssignCharacter',
    payload: { player_id: 'p2', true_character_id: 'virgin' }
  });
  state = run_command(state, {
    command_id: 'c-assign-washerwoman',
    command_type: 'AssignCharacter',
    payload: { player_id: 'p1', true_character_id: 'washerwoman' }
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
});

test('virgin example: Drunk nominates Virgin and Virgin still loses ability', () => {
  let state = bootstrap_day_state();
  state = run_command(state, {
    command_id: 'c-assign-virgin',
    command_type: 'AssignCharacter',
    payload: { player_id: 'p2', true_character_id: 'virgin' }
  });
  state = run_command(state, {
    command_id: 'c-assign-drunk',
    command_type: 'AssignCharacter',
    payload: { player_id: 'p1', true_character_id: 'drunk' }
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

  const virgin_spent = state.active_reminder_marker_ids.some((marker_id) => {
    const marker = state.reminder_markers_by_id[marker_id];
    return Boolean(marker && marker.kind === 'virgin:spent' && marker.source_player_id === 'p2');
  });

  assert.equal(state.players_by_id.p1?.alive, true);
  assert.equal(virgin_spent, true);
});

test('virgin example: poisoned Virgin nomination spends ability but does not execute nominator', () => {
  let state = bootstrap_day_state();
  state = run_command(state, {
    command_id: 'c-assign-virgin',
    command_type: 'AssignCharacter',
    payload: { player_id: 'p2', true_character_id: 'virgin' }
  });
  state = run_command(state, {
    command_id: 'c-assign-chef',
    command_type: 'AssignCharacter',
    payload: { player_id: 'p1', true_character_id: 'chef' }
  });
  state = run_command(state, {
    command_id: 'c-poison-virgin',
    command_type: 'ApplyPoison',
    payload: {
      marker_id: 'm-poison-virgin',
      kind: 'test:poison',
      source_player_id: null,
      source_character_id: 'test',
      target_player_id: 'p2',
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
    command_id: 'c-nom',
    command_type: 'NominatePlayer',
    payload: {
      nomination_id: 'n1',
      day_number: 1,
      nominator_player_id: 'p1',
      nominee_player_id: 'p2'
    }
  });

  const virgin_spent = state.active_reminder_marker_ids.some((marker_id) => {
    const marker = state.reminder_markers_by_id[marker_id];
    return Boolean(marker && marker.kind === 'virgin:spent' && marker.source_player_id === 'p2');
  });

  assert.equal(state.players_by_id.p1?.alive, true);
  assert.equal(virgin_spent, true);
});

test('virgin example: dead player nomination does not count and virgin stays unspent', () => {
  let state = bootstrap_day_state();
  state = run_command(state, {
    command_id: 'c-assign-virgin',
    command_type: 'AssignCharacter',
    payload: { player_id: 'p2', true_character_id: 'virgin' }
  });
  state = run_command(state, {
    command_id: 'c-kill-p1',
    command_type: 'ApplyDeath',
    payload: { player_id: 'p1', reason: 'ability', day_number: 1, night_number: 1 }
  });
  state = run_command(state, {
    command_id: 'c-open',
    command_type: 'OpenNominationWindow',
    payload: { day_number: 1 }
  });
  const nomination = handle_command(
    state,
    {
      command_id: 'c-dead-nom',
      command_type: 'NominatePlayer',
      payload: {
        nomination_id: 'n1',
        day_number: 1,
        nominator_player_id: 'p1',
        nominee_player_id: 'p2'
      }
    },
    '2026-03-12T02:00:00.000Z'
  );

  assert.equal(nomination.ok, false);
  if (!nomination.ok) {
    assert.equal(nomination.error.code, 'dead_player_cannot_nominate');
  }
});

test('ravenkeeper example: killed by Imp and learns chosen player character', () => {
  const state = create_initial_state('g1');
  state.night_number = 2;
  state.players_by_id.p1 = make_player('p1', 'Imp', 'imp', 'evil', { is_demon: true });
  state.players_by_id.p2 = make_player('p2', 'Ravenkeeper', 'ravenkeeper', 'good');
  state.players_by_id.p3 = make_player('p3', 'Benjamin', 'empath', 'good');

  const imp_result = imp_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:imp:night_kill:2:p1',
    selected_option_id: 'p2',
    freeform: null
  });
  assert.equal(imp_result?.queued_prompts[0]?.prompt_id, 'plugin:ravenkeeper:night_reveal:2:p2');

  const rk_result = ravenkeeper_plugin.hooks.on_prompt_resolved?.({
    state,
    prompt_id: 'plugin:ravenkeeper:night_reveal:2:p2',
    selected_option_id: 'p3',
    freeform: null
  });
  assert.equal(rk_result?.emitted_events[0]?.payload.note, 'ravenkeeper_info:p2:target=p3;character=empath');
});

test.skip('ravenkeeper example: mayor redirection and recluse registration (registration/redirection not fully implemented yet)');

test('saint example: executed saint causes evil win', () => {
  let state = bootstrap_day_state();
  state = run_command(state, {
    command_id: 'c-assign-saint',
    command_type: 'AssignCharacter',
    payload: { player_id: 'p2', true_character_id: 'saint' }
  });
  state = run_command(state, {
    command_id: 'c-exec-saint',
    command_type: 'ApplyDeath',
    payload: {
      player_id: 'p2',
      reason: 'execution',
      day_number: 1,
      night_number: 1
    }
  });
  state = run_command(state, {
    command_id: 'c-check',
    command_type: 'CheckWinConditions',
    payload: { day_number: 1, night_number: 1 }
  });

  assert.equal(state.winning_team, 'evil');
  assert.equal(state.end_reason, 'saint_executed');
});

test('butler example: dead butler can vote freely', () => {
  let state = bootstrap_day_state();
  state = run_command(state, {
    command_id: 'c-assign-butler',
    command_type: 'AssignCharacter',
    payload: { player_id: 'p1', true_character_id: 'butler' }
  });
  state = run_command(state, {
    command_id: 'c-kill-butler',
    command_type: 'ApplyDeath',
    payload: { player_id: 'p1', reason: 'ability', day_number: 1, night_number: 1 }
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
      nominator_player_id: 'p2',
      nominee_player_id: 'p3'
    }
  });
  state = run_command(state, {
    command_id: 'c-v-open',
    command_type: 'OpenVote',
    payload: {
      nomination_id: 'n1',
      nominee_player_id: 'p3',
      opened_by_player_id: 'p2'
    }
  });
  state = run_command(state, {
    command_id: 'c-vote',
    command_type: 'CastVote',
    payload: {
      nomination_id: 'n1',
      voter_player_id: 'p1',
      in_favor: true
    }
  });

  assert.equal(state.players_by_id.p1?.dead_vote_available, false);
});

test('undertaker example: mayor executed today, undertaker learns mayor', () => {
  const state = create_initial_state('g1');
  state.players_by_id.p1 = make_player('p1', 'Undertaker', 'undertaker', 'good');
  state.players_by_id.p2 = make_player('p2', 'Mayor', 'mayor', 'good', { alive: false });
  state.day_state.executed_player_id = 'p2';

  const result = undertaker_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p1',
    wake_step_id: 'wake:2'
  });
  assert.equal(result?.emitted_events[0]?.payload.note, 'undertaker_info:p1:executed_player=p2;character=mayor');
});

test('undertaker example: executed Drunk is seen as Drunk token', () => {
  const state = create_initial_state('g1');
  state.players_by_id.p1 = make_player('p1', 'Undertaker', 'undertaker', 'good');
  state.players_by_id.p2 = make_player('p2', 'Drunk', 'drunk', 'good', { alive: false, perceived_character_id: 'virgin' });
  state.day_state.executed_player_id = 'p2';

  const result = undertaker_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p1',
    wake_step_id: 'wake:2'
  });
  assert.equal(result?.emitted_events[0]?.payload.note, 'undertaker_info:p1:executed_player=p2;character=drunk');
});

test.skip('undertaker example: spy registers as butler on death (registration not implemented yet)');

test('undertaker example: no execution means undertaker does not wake with info', () => {
  const state = create_initial_state('g1');
  state.players_by_id.p1 = make_player('p1', 'Undertaker', 'undertaker', 'good');
  state.day_state.executed_player_id = null;

  const result = undertaker_plugin.hooks.on_night_wake?.({
    state,
    player_id: 'p1',
    wake_step_id: 'wake:2'
  });
  assert.equal(result?.emitted_events[0]?.payload.note, 'undertaker_info:p1:no_execution_today');
});

test.skip('spy examples are registration-driven and deferred until registration system is implemented');

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
      event_type: 'SeatOrderSet',
      created_at: '2026-03-12T00:00:03.000Z',
      payload: { seat_order: ['p1', 'p2', 'p3'] }
    },
    {
      event_id: 'e5',
      event_type: 'PhaseAdvanced',
      created_at: '2026-03-12T00:00:04.000Z',
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
