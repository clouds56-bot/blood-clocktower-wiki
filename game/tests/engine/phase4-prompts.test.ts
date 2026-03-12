import assert from 'node:assert/strict';
import test from 'node:test';

import type { Command } from '../../src/domain/commands.js';
import { apply_events } from '../../src/domain/reducer.js';
import { create_initial_state } from '../../src/domain/state.js';
import { handle_command } from '../../src/engine/command-handler.js';

function run(state: ReturnType<typeof create_initial_state>, command: Omit<Command, 'command_id'>) {
  const full_command: Command = {
    ...command,
    command_id: `c_${Math.random().toString(16).slice(2)}`,
    actor_id: 'test'
  } as Command;

  const result = handle_command(state, full_command, '2026-03-13T00:00:00.000Z');
  if (!result.ok) {
    assert.fail(`unexpected engine error ${result.error.code}: ${result.error.message}`);
  }
  return apply_events(state, result.value);
}

test('prompt lifecycle create -> resolve is replay-safe', () => {
  let state = create_initial_state('g1');

  state = run(state, {
    command_type: 'CreatePrompt',
    payload: {
      prompt_id: 'pr1',
      kind: 'false_info',
      reason: 'pick misinformation',
      visibility: 'storyteller',
      options: [
        { option_id: 'o1', label: 'show good' },
        { option_id: 'o2', label: 'show evil' }
      ]
    }
  });

  assert.deepEqual(state.pending_prompts, ['pr1']);
  assert.equal(state.prompts_by_id.pr1?.status, 'pending');

  state = run(state, {
    command_type: 'ResolvePrompt',
    payload: {
      prompt_id: 'pr1',
      selected_option_id: 'o2',
      freeform: null,
      notes: 'picked stronger bluff line'
    }
  });

  assert.deepEqual(state.pending_prompts, []);
  assert.equal(state.prompts_by_id.pr1?.status, 'resolved');
  assert.equal(state.prompts_by_id.pr1?.resolution_payload?.selected_option_id, 'o2');
  assert.equal(state.storyteller_notes.length, 1);
});

test('cannot resolve prompt twice', () => {
  let state = create_initial_state('g1');
  state = run(state, {
    command_type: 'CreatePrompt',
    payload: {
      prompt_id: 'pr1',
      kind: 'choice',
      reason: 'choose one',
      visibility: 'storyteller',
      options: [{ option_id: 'yes', label: 'yes' }]
    }
  });
  state = run(state, {
    command_type: 'ResolvePrompt',
    payload: {
      prompt_id: 'pr1',
      selected_option_id: 'yes',
      freeform: null,
      notes: null
    }
  });

  const result = handle_command(
    state,
    {
      command_id: 'c_again',
      command_type: 'ResolvePrompt',
      actor_id: 'test',
      payload: {
        prompt_id: 'pr1',
        selected_option_id: 'yes',
        freeform: null,
        notes: null
      }
    },
    '2026-03-13T00:00:00.000Z'
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'prompt_not_pending');
  }
});
