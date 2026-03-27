import assert from 'node:assert/strict';
import test from 'node:test';

import { create_cli_context } from '../../src/cli/repl.js';

test('all registered plugins expose non-empty ability metadata', () => {
  const context = create_cli_context('ability-metadata-coverage');
  const metadata = context.plugin_registry.list();

  const missing_abilities = metadata.filter(
    (entry) => !Array.isArray(entry.abilities) || entry.abilities.length === 0
  );
  assert.deepEqual(
    missing_abilities.map((entry) => entry.id),
    []
  );
});

test('critical TB setup abilities are present in registered metadata', () => {
  const context = create_cli_context('ability-metadata-coverage');
  const metadata = context.plugin_registry.list();

  const ability_index = new Map<string, Set<string>>();
  for (const entry of metadata) {
    ability_index.set(
      entry.id,
      new Set((entry.abilities ?? []).map((ability) => ability.ability_id))
    );
  }

  assert.equal(
    ability_index.get('fortune_teller')?.has('fortune_teller.red_herring_seed'),
    true
  );
  assert.equal(
    ability_index.get('imp')?.has('imp.self_kill_transfer'),
    true
  );
  assert.equal(
    ability_index.get('slayer')?.has('slayer.public_shot'),
    true
  );
});
