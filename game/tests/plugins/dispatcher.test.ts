import assert from 'node:assert/strict';
import test from 'node:test';

import type { DomainEventType } from '../../src/domain/events.js';
import { create_initial_state } from '../../src/domain/state.js';
import {
  type CharacterPlugin,
  type CharacterPluginMetadata,
  empty_plugin_result,
  type EventAppliedHookContext,
  type NightWakeHookContext,
  type PromptResolvedHookContext
} from '../../src/plugins/contracts.js';
import { dispatch_hook } from '../../src/plugins/dispatcher.js';
import { PluginRegistry } from '../../src/plugins/registry.js';

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

function make_night_context(): NightWakeHookContext {
  return {
    state: create_initial_state('g1'),
    player_id: 'p1',
    wake_step_id: 'w1'
  };
}

function make_prompt_context(): PromptResolvedHookContext {
  return {
    state: create_initial_state('g1'),
    prompt_id: 'pr1',
    selected_option_id: 'a',
    freeform: null
  };
}

function make_event_context(): EventAppliedHookContext {
  return {
    state: create_initial_state('g1'),
    event_type: 'PromptResolved',
    event_payload: {
      prompt_id: 'pr1'
    }
  };
}

function make_plugin(
  id: string,
  options?: {
    night_hook?: (context: NightWakeHookContext) => ReturnType<typeof empty_plugin_result>;
    prompt_hook?: (context: PromptResolvedHookContext) => ReturnType<typeof empty_plugin_result>;
    event_hook?: (context: EventAppliedHookContext) => ReturnType<typeof empty_plugin_result>;
  }
): CharacterPlugin {
  const hooks: CharacterPlugin['hooks'] = {};
  if (options?.night_hook) {
    hooks.on_night_wake = options.night_hook;
  }
  if (options?.prompt_hook) {
    hooks.on_prompt_resolved = options.prompt_hook;
  }
  if (options?.event_hook) {
    hooks.on_event_applied = options.event_hook;
  }

  return {
    metadata: make_metadata(id),
    hooks
  };
}

test('dispatch_hook executes plugins in deterministic order and merges outputs', () => {
  const imp = make_plugin('imp', {
    night_hook: () => ({
      emitted_events: [
        {
          event_type: 'PromptQueued',
          payload: { from: 'imp' }
        }
      ],
      queued_prompts: [
        {
          prompt_id: 'pr_imp',
          kind: 'choice',
          reason: 'imp pick target',
          visibility: 'storyteller',
          options: [{ option_id: 'a', label: 'A' }]
        }
      ],
      queued_interrupts: []
    })
  });

  const poisoner = make_plugin('poisoner', {
    night_hook: () => ({
      emitted_events: [
        {
          event_type: 'PromptQueued',
          payload: { from: 'poisoner' }
        }
      ],
      queued_prompts: [],
      queued_interrupts: [
        {
          interrupt_id: 'int_1',
          kind: 'apply_poison',
          source_plugin_id: 'bad_source',
          payload: {
            target: 'p2'
          }
        }
      ]
    })
  });

  const registry = new PluginRegistry([imp, poisoner]);
  const result = dispatch_hook(registry, 'on_night_wake', ['poisoner', 'imp'], make_night_context());
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(
    result.value.trace.map((item) => item.plugin_id),
    ['poisoner', 'imp']
  );
  assert.deepEqual(
    result.value.output.emitted_events.map((item) => item.payload.from),
    ['poisoner', 'imp']
  );
  assert.equal(result.value.output.queued_interrupts[0]?.source_plugin_id, 'poisoner');
});

test('dispatch_hook skips missing plugin and missing hook with stable trace', () => {
  const registry = new PluginRegistry([
    make_plugin('imp', {
      night_hook: () => empty_plugin_result()
    }),
    make_plugin('poisoner')
  ]);

  const result = dispatch_hook(registry, 'on_prompt_resolved', ['missing', 'poisoner', 'imp'], make_prompt_context());
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.deepEqual(result.value.trace, [
    {
      plugin_id: 'missing',
      status: 'skipped_missing_plugin',
      emitted_events: 0,
      queued_prompts: 0,
      queued_interrupts: 0
    },
    {
      plugin_id: 'poisoner',
      status: 'skipped_missing_hook',
      emitted_events: 0,
      queued_prompts: 0,
      queued_interrupts: 0
    },
    {
      plugin_id: 'imp',
      status: 'skipped_missing_hook',
      emitted_events: 0,
      queued_prompts: 0,
      queued_interrupts: 0
    }
  ]);
});

test('dispatch_hook fails when plugin returns invalid output', () => {
  const registry = new PluginRegistry([
    make_plugin('imp', {
      event_hook: () => ({
        emitted_events: [
          {
            event_type: 'PromptQueued' as DomainEventType,
            payload: {},
            actor_id: ' '
          }
        ],
        queued_prompts: [
          {
            prompt_id: '',
            kind: 'choice',
            reason: 'ok',
            visibility: 'storyteller',
            options: [{ option_id: 'a', label: 'A' }, { option_id: 'a', label: 'B' }]
          }
        ],
        queued_interrupts: [
          {
            interrupt_id: '',
            kind: '',
            source_plugin_id: 'imp',
            payload: {}
          }
        ]
      })
    })
  ]);

  const result = dispatch_hook(registry, 'on_event_applied', ['imp'], make_event_context());
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, 'plugin_hook_dispatch_failed');
  const codes = new Set(result.error.issues.map((item) => item.code));
  assert.equal(codes.has('invalid_plugin_event_actor_id'), true);
  assert.equal(codes.has('invalid_plugin_prompt_id'), true);
  assert.equal(codes.has('duplicate_plugin_prompt_option_id'), true);
  assert.equal(codes.has('invalid_plugin_interrupt_id'), true);
  assert.equal(codes.has('invalid_plugin_interrupt_kind'), true);
});

test('dispatch_hook captures thrown plugin errors as deterministic issues', () => {
  const registry = new PluginRegistry([
    make_plugin('imp', {
      prompt_hook: () => {
        throw new Error('boom');
      }
    })
  ]);

  const result = dispatch_hook(registry, 'on_prompt_resolved', ['imp'], make_prompt_context());
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.error.code, 'plugin_hook_dispatch_failed');
  assert.equal(result.error.issues.length, 1);
  assert.equal(result.error.issues[0]?.code, 'plugin_hook_threw');
  assert.equal(result.error.issues[0]?.plugin_id, 'imp');
});

test('dispatch_hook deduplicates repeated plugin ids by first occurrence', () => {
  const registry = new PluginRegistry([
    make_plugin('imp', {
      night_hook: () => ({
        emitted_events: [
          {
            event_type: 'PromptQueued',
            payload: {
              n: 1
            }
          }
        ],
        queued_prompts: [],
        queued_interrupts: []
      })
    })
  ]);

  const result = dispatch_hook(registry, 'on_night_wake', ['imp', 'imp', 'imp'], make_night_context());
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.value.trace.length, 1);
  assert.equal(result.value.output.emitted_events.length, 1);
});
