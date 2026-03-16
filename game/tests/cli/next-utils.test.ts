import assert from 'node:assert/strict';
import test from 'node:test';

import { create_initial_state } from '../../src/domain/state.js';
import { create_next_scope_anchor, has_reached_next_scope_target } from '../../src/cli/next-utils.js';

test('next day target is a future day boundary', () => {
  const state = create_initial_state('g1');
  state.phase = 'night';
  state.subphase = 'dawn';
  state.day_number = 1;
  state.night_number = 2;

  const anchor = create_next_scope_anchor(state);

  const sameDayState = {
    ...state,
    phase: 'day' as const,
    subphase: 'open_discussion' as const,
    day_number: 1,
    night_number: 2
  };
  assert.equal(has_reached_next_scope_target(sameDayState, 'day', anchor), false);

  const nextDayState = {
    ...state,
    phase: 'day' as const,
    subphase: 'open_discussion' as const,
    day_number: 2,
    night_number: 2
  };
  assert.equal(has_reached_next_scope_target(nextDayState, 'day', anchor), true);
});

test('next day from day requires finishing next night first', () => {
  const state = create_initial_state('g2');
  state.phase = 'day';
  state.subphase = 'open_discussion';
  state.day_number = 3;
  state.night_number = 3;

  const anchor = create_next_scope_anchor(state);

  const sameDayState = {
    ...state,
    phase: 'day' as const,
    subphase: 'day_end' as const,
    day_number: 3,
    night_number: 3
  };
  assert.equal(has_reached_next_scope_target(sameDayState, 'day', anchor), false);

  const afterNightNextDayState = {
    ...state,
    phase: 'day' as const,
    subphase: 'open_discussion' as const,
    day_number: 4,
    night_number: 4
  };
  assert.equal(has_reached_next_scope_target(afterNightNextDayState, 'day', anchor), true);
});

test('next night target is a future night boundary', () => {
  const state = create_initial_state('g3');
  state.phase = 'day';
  state.subphase = 'open_discussion';
  state.day_number = 2;
  state.night_number = 2;

  const anchor = create_next_scope_anchor(state);

  const sameNightState = {
    ...state,
    phase: 'night' as const,
    subphase: 'dusk' as const,
    day_number: 2,
    night_number: 2
  };
  assert.equal(has_reached_next_scope_target(sameNightState, 'night', anchor), false);

  const nextNightState = {
    ...state,
    phase: 'night' as const,
    subphase: 'dusk' as const,
    day_number: 3,
    night_number: 3
  };
  assert.equal(has_reached_next_scope_target(nextNightState, 'night', anchor), true);
});

test('next phase target is any phase change', () => {
  const state = create_initial_state('g4');
  state.phase = 'day';
  state.subphase = 'open_discussion';
  state.day_number = 2;
  state.night_number = 2;

  const anchor = create_next_scope_anchor(state);

  const samePhase = {
    ...state,
    phase: 'day' as const,
    subphase: 'vote_in_progress' as const,
    day_number: 2,
    night_number: 2
  };
  assert.equal(has_reached_next_scope_target(samePhase, 'phase', anchor), false);

  const changedPhase = {
    ...state,
    phase: 'night' as const,
    subphase: 'dusk' as const,
    day_number: 2,
    night_number: 3
  };
  assert.equal(has_reached_next_scope_target(changedPhase, 'phase', anchor), true);
});
