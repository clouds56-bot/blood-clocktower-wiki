import assert from 'node:assert/strict';
import test from 'node:test';

import { resolve_tui_command } from '../../src/tui/command-bindings.js';
import {
  begin_event_pane_search,
  cancel_event_pane_search,
  commit_event_pane_search,
  create_event_pane_search_state
} from '../../src/tui/panes/events-pane.js';
import {
  begin_state_json_search,
  cancel_state_json_search,
  commit_state_json_search,
  create_state_json_search_state
} from '../../src/tui/panes/state-pane.js';

test('command mode backspace on empty input cancels mode', () => {
  const result = resolve_tui_command('', { backspace: true }, {
    suppress_input: false,
    mode: 'command',
    pane_focus: 'events',
    state_mode: 'players',
    count_prefix: '',
    pending_g: false,
    mode_input: '',
    search_entry_direction: -1
  });

  assert.equal(result.handled, true);
  assert.equal(result.command?.id, 'mode:cancel');
});

test('command mode backspace on non-empty input keeps editing', () => {
  const result = resolve_tui_command('', { backspace: true }, {
    suppress_input: false,
    mode: 'command',
    pane_focus: 'events',
    state_mode: 'players',
    count_prefix: '',
    pending_g: false,
    mode_input: 'he',
    search_entry_direction: -1
  });

  assert.equal(result.handled, true);
  assert.equal(result.command?.id, 'mode:backspace');
});

test('event pane search state lifecycle is pane-owned and deterministic', () => {
  const initial = create_event_pane_search_state();
  assert.equal(initial.phase, 'idle');
  assert.equal(initial.entry_direction, -1);

  const begun = begin_event_pane_search(initial, 12, 1);
  assert.equal(begun.phase, 'preview');
  assert.equal(begun.start_index, 12);
  assert.equal(begun.anchor_index, 12);
  assert.equal(begun.entry_direction, 1);

  const committed = commit_event_pane_search(begun, 'imp', true);
  assert.equal(committed.phase, 'started');
  assert.equal(committed.query, 'imp');
  assert.equal(committed.last_query, 'imp');
  assert.equal(committed.last_direction, 1);

  const cancelled = cancel_event_pane_search(begun);
  assert.equal(cancelled.restore_index, 12);
  assert.equal(cancelled.next.phase, 'idle');
  assert.equal(cancelled.next.query, '');
});

test('state json search state lifecycle is pane-owned and deterministic', () => {
  const initial = create_state_json_search_state();
  assert.equal(initial.phase, 'idle');
  assert.equal(initial.entry_direction, 1);

  const begun = begin_state_json_search(initial, 7, -1);
  assert.equal(begun.phase, 'preview');
  assert.equal(begun.start_cursor, 7);
  assert.equal(begun.anchor_cursor, 7);
  assert.equal(begun.entry_direction, -1);

  const committed = commit_state_json_search(begun, 'night_number', true);
  assert.equal(committed.phase, 'started');
  assert.equal(committed.query, 'night_number');
  assert.equal(committed.last_query, 'night_number');
  assert.equal(committed.last_direction, -1);

  const cancelled = cancel_state_json_search(begun);
  assert.equal(cancelled.restore_cursor, 7);
  assert.equal(cancelled.next.phase, 'idle');
  assert.equal(cancelled.next.query, '');
});
