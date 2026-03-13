import assert from 'node:assert/strict';
import test from 'node:test';

import {
  empty_plugin_result,
  type CharacterPlugin,
  type CharacterPluginMetadata
} from '../../src/plugins/contracts.js';
import { PluginRegistry, create_plugin_registry } from '../../src/plugins/registry.js';

function make_metadata(id: string): CharacterPluginMetadata {
  return {
    id,
    name: id.toUpperCase(),
    type: id === 'imp' ? 'demon' : 'minion',
    alignment_at_start: 'evil',
    timing_category: 'each_night',
    is_once_per_game: false,
    target_constraints: {
      min_targets: 1,
      max_targets: 1,
      allow_self: false,
      require_alive: true,
      allow_travellers: false
    },
    flags: {
      can_function_while_dead: false,
      can_trigger_on_death: false,
      may_cause_drunkenness: false,
      may_cause_poisoning: id === 'poisoner',
      may_change_alignment: false,
      may_change_character: false,
      may_register_as_other: false
    }
  };
}

function make_plugin(id: string): CharacterPlugin {
  return {
    metadata: make_metadata(id),
    hooks: {
      on_night_wake: () => empty_plugin_result()
    }
  };
}

test('registry registers plugin and supports get/has/list', () => {
  const registry = new PluginRegistry();
  const result = registry.register(make_plugin('imp'));
  assert.equal(result.ok, true);

  assert.equal(registry.has('imp'), true);
  assert.equal(registry.has('poisoner'), false);
  assert.equal(registry.get('imp')?.metadata.id, 'imp');
  assert.equal(registry.get('poisoner'), null);

  assert.deepEqual(registry.list().map((item) => item.id), ['imp']);
});

test('registry rejects duplicate plugin id deterministically', () => {
  const registry = new PluginRegistry([make_plugin('imp')]);
  const result = registry.register(make_plugin('imp'));

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'plugin_already_registered');
  }
});

test('registry rejects invalid plugin metadata', () => {
  const registry = new PluginRegistry();
  const plugin = make_plugin('invalid');
  plugin.metadata.id = '  ';
  plugin.metadata.target_constraints.min_targets = 2;
  plugin.metadata.target_constraints.max_targets = 1;

  const result = registry.register(plugin);
  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.equal(result.error.code, 'plugin_metadata_invalid');
    assert.match(result.error.message, /plugin_id_required/);
    assert.match(result.error.message, /target_constraints_range_invalid/);
  }
});

test('registry rejects non-canonical metadata id and name', () => {
  const registry = new PluginRegistry();
  const plugin = make_plugin('imp');
  plugin.metadata.id = ' imp ';
  plugin.metadata.name = ' Imp ';

  const result = registry.register(plugin);
  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.equal(result.error.code, 'plugin_metadata_invalid');
    assert.match(result.error.message, /plugin_id_canonical/);
    assert.match(result.error.message, /plugin_name_canonical/);
  }
});

test('registry list is sorted by id', () => {
  const registry = new PluginRegistry([make_plugin('poisoner'), make_plugin('imp')]);
  assert.deepEqual(registry.list().map((item) => item.id), ['imp', 'poisoner']);
});

test('create_plugin_registry returns initialization error for invalid input', () => {
  const result = create_plugin_registry([make_plugin('imp'), make_plugin('imp')]);
  assert.equal(result.ok, false);

  if (!result.ok) {
    assert.equal(result.error.code, 'plugin_registry_init_failed');
    assert.match(result.error.message, /plugin_already_registered/);
  }
});

test('registry does not expose mutable internal metadata', () => {
  const registry = new PluginRegistry([make_plugin('imp')]);

  const listed = registry.list();
  assert.ok(listed[0]);
  listed[0]!.id = 'mutated_id';
  listed[0]!.target_constraints.min_targets = 99;
  listed[0]!.flags.may_change_character = true;

  const plugin = registry.get('imp');
  assert.ok(plugin);
  if (!plugin) {
    return;
  }

  plugin.metadata.id = 'mutated_plugin';
  plugin.metadata.target_constraints.max_targets = 99;
  plugin.metadata.flags.may_change_alignment = true;

  const listed_again = registry.list();
  assert.deepEqual(listed_again.map((item) => item.id), ['imp']);

  const imp = registry.get('imp');
  assert.ok(imp);
  assert.equal(imp?.metadata.id, 'imp');
  assert.equal(imp?.metadata.target_constraints.min_targets, 1);
  assert.equal(imp?.metadata.target_constraints.max_targets, 1);
  assert.equal(imp?.metadata.flags.may_change_character, false);
  assert.equal(imp?.metadata.flags.may_change_alignment, false);
});
