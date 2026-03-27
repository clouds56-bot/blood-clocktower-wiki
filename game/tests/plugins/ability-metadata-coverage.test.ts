import assert from 'node:assert/strict';
import test from 'node:test';

import { create_cli_context } from '../../src/cli/repl.js';
import { DEFAULT_CHARACTER_PLUGINS } from '../../src/plugins/default-plugins.js';

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
    ability_index.get('baron')?.has('baron.setup_outsider_shift'),
    true
  );
  assert.equal(
    ability_index.get('drunk')?.has('drunk.perceived_role_substitution'),
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

test('default plugin catalog includes setup-only TB plugins', () => {
  const plugin_ids = new Set(DEFAULT_CHARACTER_PLUGINS.map((plugin) => plugin.metadata.id));
  assert.equal(plugin_ids.has('baron'), true);
  assert.equal(plugin_ids.has('drunk'), true);
});
