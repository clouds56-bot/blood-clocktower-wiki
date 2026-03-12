import assert from 'node:assert/strict';
import test from 'node:test';

import { parse_cli_line } from '../../src/cli/command-parser.js';

test('quick-setup parses generic signature', () => {
  const parsed = parse_cli_line('quick-setup bmr 7 demo_game');
  assert.equal(parsed.ok, true);
  if (parsed.ok && parsed.kind === 'local') {
    assert.equal(parsed.action.type, 'quick_setup');
    if (parsed.action.type === 'quick_setup') {
      assert.equal(parsed.action.script, 'bmr');
      assert.equal(parsed.action.player_num, 7);
      assert.equal(parsed.action.game_id, 'demo_game');
    }
  }
});

test('quick-start and start aliases parse', () => {
  const quickStart = parse_cli_line('quick-start bmr 7 demo_game');
  assert.equal(quickStart.ok, true);
  if (quickStart.ok && quickStart.kind === 'local') {
    assert.equal(quickStart.action.type, 'quick_setup');
  }

  const start = parse_cli_line('start bmr 7 demo_game');
  assert.equal(start.ok, true);
  if (start.ok && start.kind === 'local') {
    assert.equal(start.action.type, 'quick_setup');
  }
});

test('quick-setup allows omitted game_id', () => {
  const parsed = parse_cli_line('quick-setup bmr 7');
  assert.equal(parsed.ok, true);
  if (parsed.ok && parsed.kind === 'local') {
    assert.equal(parsed.action.type, 'quick_setup');
    if (parsed.action.type === 'quick_setup') {
      assert.equal(parsed.action.script, 'bmr');
      assert.equal(parsed.action.player_num, 7);
      assert.equal(parsed.action.game_id, undefined);
    }
  }
});

test('quick-setup rejects unknown template', () => {
  const parsed = parse_cli_line('quick-setup tb7');
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.match(parsed.message, /usage: quick-setup <script> <player_num> \[game_id\]/);
  }
});

test('quick-setup rejects unsupported player range', () => {
  const parsed = parse_cli_line('quick-setup bmr 4 demo_game');
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.match(parsed.message, /supports player_num in range 5..15/);
  }
});
