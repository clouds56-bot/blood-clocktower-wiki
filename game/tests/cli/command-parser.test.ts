import assert from 'node:assert/strict';
import test from 'node:test';

import { parse_cli_line } from '../../src/cli/command-parser.js';

test('parse local commands', () => {
  const state = parse_cli_line('state');
  assert.equal(state.ok, true);
  if (state.ok) {
    assert.equal(state.kind, 'local');
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
