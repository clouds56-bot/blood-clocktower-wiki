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
    prompt_key: 'pr1',
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
    prompt_key: 'pr1',
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
    prompt_key: 'pr1',
      kind: 'choice',
      reason: 'choose one',
      visibility: 'storyteller',
      options: [{ option_id: 'yes', label: 'yes' }]
    }
  });
  state = run(state, {
    command_type: 'ResolvePrompt',
    payload: {
    prompt_key: 'pr1',
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
        prompt_key: 'pr1',
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

test('resolve unknown prompt is rejected deterministically', () => {
  const state = create_initial_state('g1');

  const result = handle_command(
    state,
    {
      command_id: 'c_unknown',
      command_type: 'ResolvePrompt',
      actor_id: 'test',
      payload: {
        prompt_key: 'missing_prompt',
        selected_option_id: null,
        freeform: null,
        notes: null
      }
    },
    '2026-03-13T00:00:00.000Z'
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'prompt_not_found');
  }
});

test('resolve prompt emits adjudication event stream', () => {
  let state = create_initial_state('g1');
  state = run(state, {
    command_type: 'CreatePrompt',
    payload: {
    prompt_key: 'pr_emit',
      kind: 'false_info',
      reason: 'select misinformation target',
      visibility: 'storyteller',
      options: [{ option_id: 'opt_a', label: 'Option A' }]
    }
  });

  const result = handle_command(
    state,
    {
      command_id: 'c_emit',
      command_type: 'ResolvePrompt',
      actor_id: 'storyteller',
      payload: {
        prompt_key: 'pr_emit',
        selected_option_id: 'opt_a',
        freeform: null,
        notes: 'chosen for balance'
      }
    },
    '2026-03-13T00:00:00.000Z'
  );

  if (!result.ok) {
    assert.fail(`unexpected engine error ${result.error.code}: ${result.error.message}`);
  }

  assert.deepEqual(
    result.value.map((event) => event.event_type),
    ['PromptResolved', 'StorytellerChoiceMade', 'StorytellerRulingRecorded']
  );
});

test('number range prompt accepts values within min/max', () => {
  let state = create_initial_state('g1');
  state = run(state, {
    command_type: 'CreatePrompt',
    payload: {
    prompt_key: 'pr_range',
      kind: 'number_pick',
      reason: 'pick number',
      visibility: 'storyteller',
      options: [],
      selection_mode: 'number_range',
      number_range: {
        min: 0,
        max: 5
      }
    }
  });

  state = run(state, {
    command_type: 'ResolvePrompt',
    payload: {
    prompt_key: 'pr_range',
      selected_option_id: '3',
      freeform: null,
      notes: null
    }
  });

  assert.equal(state.prompts_by_id.pr_range?.resolution_payload?.selected_option_id, '3');
});

test('number range prompt rejects out-of-range values', () => {
  let state = create_initial_state('g1');
  state = run(state, {
    command_type: 'CreatePrompt',
    payload: {
    prompt_key: 'pr_range_exc',
      kind: 'number_pick',
      reason: 'pick number',
      visibility: 'storyteller',
      options: [],
      selection_mode: 'number_range',
      number_range: {
        min: 0,
        max: 100,
        max_inclusive: false
      }
    }
  });

  const result = handle_command(
    state,
    {
      command_id: 'c_bad_range',
      command_type: 'ResolvePrompt',
      actor_id: 'test',
      payload: {
        prompt_key: 'pr_range_exc',
        selected_option_id: '100',
        freeform: null,
        notes: null
      }
    },
    '2026-03-13T00:00:00.000Z'
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'invalid_prompt_option');
  }
});

test('multi-column prompt validates tuple selections', () => {
  let state = create_initial_state('g1');
  state = run(state, {
    command_type: 'CreatePrompt',
    payload: {
    prompt_key: 'pr_multi',
      kind: 'matrix_pick',
      reason: 'pick tuple',
      visibility: 'storyteller',
      options: [],
      selection_mode: 'multi_column',
      multi_columns: [
        { min: 0, max: 5 },
        ['a', 'b', 'c']
      ]
    }
  });

  state = run(state, {
    command_type: 'ResolvePrompt',
    payload: {
    prompt_key: 'pr_multi',
      selected_option_id: '5,c',
      freeform: null,
      notes: null
    }
  });

  assert.equal(state.prompts_by_id.pr_multi?.resolution_payload?.selected_option_id, '5,c');
});

test('storyteller hint is stored on prompt state', () => {
  let state = create_initial_state('g1');
  state = run(state, {
    command_type: 'CreatePrompt',
    payload: {
    prompt_key: 'pr_hint',
      kind: 'false_info',
      reason: 'pick misinformation',
      visibility: 'storyteller',
      options: [
        { option_id: 'o1', label: 'show good' },
        { option_id: 'o2', label: 'show evil' }
      ],
      storyteller_hint: 'truthful answer is o1'
    }
  });

  assert.equal(state.prompts_by_id.pr_hint?.storyteller_hint, 'truthful answer is o1');
});
