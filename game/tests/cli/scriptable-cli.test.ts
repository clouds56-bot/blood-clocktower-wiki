import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { parse_cli_line } from '../../src/cli/command-parser.js';
import { run_cli_script_file } from '../../src/cli/repl.js';
import { create_initial_state } from '../../src/domain/state.js';

test('script mode rejects random CLI shorthands', () => {
  const state = create_initial_state('script_mode');

  const nextAuto = parse_cli_line('next --auto', state, { script_mode: true });
  assert.equal(nextAuto.ok, false);
  if (!nextAuto.ok) {
    assert.match(nextAuto.message, /script mode disallows random auto prompt resolution/);
  }

  const chooseAlias = parse_cli_line('choose', state, { script_mode: true });
  assert.equal(chooseAlias.ok, false);
  if (!chooseAlias.ok) {
    assert.match(chooseAlias.message, /script mode disallows random choose\/ch shorthand/);
  }

  const chAlias = parse_cli_line('ch', state, { script_mode: true });
  assert.equal(chAlias.ok, false);
  if (!chAlias.ok) {
    assert.match(chAlias.message, /script mode disallows random choose\/ch shorthand/);
  }
});

test('script runner executes plain-text scripts with comments', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'clocktower-cli-script-'));
  const scriptPath = join(dir, 'demo.cli');
  await writeFile(
    scriptPath,
    [
      '# script comment',
      '',
      'new script_game',
      'state',
      'events 1'
    ].join('\n'),
    'utf8'
  );

  await run_cli_script_file(scriptPath, 'seed_game');
});

test('script runner fails fast on disallowed random command', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'clocktower-cli-script-'));
  const scriptPath = join(dir, 'bad.cli');
  await writeFile(scriptPath, ['new script_game', 'next --auto'].join('\n'), 'utf8');

  await assert.rejects(async () => {
    await run_cli_script_file(scriptPath, 'seed_game');
  }, /script failed at line 2: next --auto/);
});
