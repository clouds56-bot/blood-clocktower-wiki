import assert from 'node:assert/strict';
import test from 'node:test';

import { create_initial_state } from '../../src/domain/state.js';
import { chef_plugin } from '../../src/plugins/characters/chef.js';
import { PluginRegistry } from '../../src/plugins/registry.js';
import { run_next_phase, resolve_all_pending_prompts } from '../../src/cli/repl.js';

function makeContext(state = create_initial_state('t1')) {
  return {
    state,
    event_log: [],
    next_command_index: 1,
    plugin_registry: new PluginRegistry([chef_plugin])
  } as any;
}

test('resolve_all_pending_prompts drains single pending prompt', () => {
  const state = create_initial_state('g1');
  state.prompts_by_id.pr1 = {
    prompt_key: 'pr1',
    prompt_id: 'pr1',
    kind: 'choice',
    reason: 'test',
    visibility: 'storyteller',
    options: [
      { option_id: 'opt_a', label: 'A' },
      { option_id: 'opt_b', label: 'B' }
    ],
    status: 'pending',
    created_at_event_id: 1,
    resolved_at_event_id: null,
    resolution_payload: null,
    notes: null
  };
  state.pending_prompts.push('pr1');

  const context = makeContext(state);
  const outcome = resolve_all_pending_prompts(context, 10);
  assert.equal(outcome.stop_reason, 'target_reached');
  assert.equal(outcome.prompts_resolved, 1);
  assert.equal(context.state.pending_prompts.length, 0);
});

test('resolve_all_pending_prompts respects guard limit', () => {
  const state = create_initial_state('g2');
  state.prompts_by_id.pr1 = {
    prompt_key: 'pr1',
    prompt_id: 'pr1',
    kind: 'choice',
    reason: 'test',
    visibility: 'storyteller',
    options: [{ option_id: 'opt_a', label: 'A' }],
    status: 'pending',
    created_at_event_id: 1,
    resolved_at_event_id: null,
    resolution_payload: null,
    notes: null
  };
  state.pending_prompts.push('pr1');

  const context = makeContext(state);
  const outcome = resolve_all_pending_prompts(context, 0);
  assert.equal(outcome.stop_reason, 'auto_prompt_guard_hit');
  assert.equal(outcome.prompts_resolved, 0);
});

test('run_next_phase blocks on pending prompt when auto_prompt is false', () => {
  const state = create_initial_state('g3');
  state.phase = 'day';
  state.subphase = 'open_discussion';
  state.prompts_by_id.pr1 = {
    prompt_key: 'pr1',
    prompt_id: 'pr1',
    kind: 'choice',
    reason: 'test',
    visibility: 'storyteller',
    options: [{ option_id: 'opt_a', label: 'A' }],
    status: 'pending',
    created_at_event_id: 1,
    resolved_at_event_id: null,
    resolution_payload: null,
    notes: null
  };
  state.pending_prompts.push('pr1');

  const context = makeContext(state);
  const outcome = run_next_phase(context, { type: 'next_phase', scope: 'subphase', auto_prompt: false });
  assert.equal(outcome.stop_reason, 'blocked_by_prompt');
});

test('run_next_phase with auto_prompt resolves prompts then advances one step', () => {
  const state = create_initial_state('g4');
  state.phase = 'day';
  state.subphase = 'open_discussion';
  state.day_number = 1;
  state.prompts_by_id.pr1 = {
    prompt_key: 'pr1',
    prompt_id: 'pr1',
    kind: 'choice',
    reason: 'test',
    visibility: 'storyteller',
    options: [{ option_id: 'opt_a', label: 'A' }],
    status: 'pending',
    created_at_event_id: 1,
    resolved_at_event_id: null,
    resolution_payload: null,
    notes: null
  };
  state.pending_prompts.push('pr1');

  const context = makeContext(state);
  const outcome = run_next_phase(context, { type: 'next_phase', scope: 'subphase', auto_prompt: true });
  // should resolve the prompt then perform one advancement (open nomination)
  assert.equal(outcome.prompts_resolved, 1);
  assert.equal(outcome.steps_advanced, 1);
  assert.equal(outcome.stop_reason === 'target_reached' || outcome.stop_reason === 'advanced', true);
});
