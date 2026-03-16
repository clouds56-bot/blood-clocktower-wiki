import type {
  CancelPromptCommand,
  CreatePromptCommand,
  ResolvePromptCommand
} from '../domain/commands.js';
import type { DomainEvent } from '../domain/events.js';
import type {
  GameState,
  PromptColumnSpec,
  PromptRangeSpec,
  PromptSelectionMode
} from '../domain/types.js';
import type { EngineResult } from '../engine/phase-machine.js';

function error(code: string, message: string): EngineResult<never> {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

export function handle_create_prompt(
  state: GameState,
  command: CreatePromptCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  const prompt_key = command.payload.prompt_key;
  if (state.prompts_by_id[prompt_key]) {
    return error('prompt_id_already_exists', `prompt already exists: ${prompt_key}`);
  }

  const normalized_prompt = normalize_prompt_shape(command.payload);
  if (!normalized_prompt.ok) {
    return normalized_prompt;
  }

  return {
    ok: true,
    value: [
      {
        event_key: `${command.command_id}:PromptQueued`,
        event_id: 1,
        event_type: 'PromptQueued',
        created_at,
        actor_id: command.actor_id,
        payload: {
          prompt_key,
          prompt_id: command.payload.prompt_id,
          kind: command.payload.kind,
          reason: command.payload.reason,
          visibility: command.payload.visibility,
          options: command.payload.options.map((option) => ({ ...option })),
          selection_mode: normalized_prompt.value.selection_mode,
          number_range: normalized_prompt.value.number_range,
          multi_columns: normalized_prompt.value.multi_columns,
          storyteller_hint: command.payload.storyteller_hint ?? null
        }
      }
    ]
  };
}

export function handle_resolve_prompt(
  state: GameState,
  command: ResolvePromptCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  const prompt_key = command.payload.prompt_key;
  const prompt = state.prompts_by_id[prompt_key];
  if (!prompt) {
    return error('prompt_not_found', `prompt not found: ${prompt_key}`);
  }
  if (prompt.status !== 'pending') {
    return error('prompt_not_pending', `prompt is not pending: ${prompt_key}`);
  }

  const selection_mode = prompt.selection_mode ?? 'single_choice';
  const validation = validate_prompt_selection(prompt, selection_mode, command.payload.selected_option_id);
  if (!validation.ok) {
    return validation;
  }

  if (
    selection_mode === 'number_range' &&
    command.payload.selected_option_id !== null &&
    prompt.number_range
  ) {
    const normalized_numeric = normalize_numeric_token(command.payload.selected_option_id);
    if (normalized_numeric !== null) {
      command = {
        ...command,
        payload: {
          ...command.payload,
          selected_option_id: normalized_numeric
        }
      };
    }
  }

  const events: DomainEvent[] = [
    {
      event_key: `${command.command_id}:PromptResolved`,
      event_id: 1,
      event_type: 'PromptResolved',
      created_at,
      actor_id: command.actor_id,
      payload: {
        prompt_key,
        prompt_id: command.payload.prompt_id,
        selected_option_id: command.payload.selected_option_id,
        freeform: command.payload.freeform,
        notes: command.payload.notes
      }
    },
    {
      event_key: `${command.command_id}:StorytellerChoiceMade`,
      event_id: 1,
      event_type: 'StorytellerChoiceMade',
      created_at,
      actor_id: command.actor_id,
      payload: {
        prompt_key,
        prompt_id: command.payload.prompt_id,
        selected_option_id: command.payload.selected_option_id,
        freeform: command.payload.freeform
      }
    }
  ];

  if (command.payload.notes !== null) {
    events.push({
      event_key: `${command.command_id}:StorytellerRulingRecorded`,
      event_id: 1,
      event_type: 'StorytellerRulingRecorded',
      created_at,
      actor_id: command.actor_id,
      payload: {
        prompt_key,
        prompt_id: command.payload.prompt_id,
        note: command.payload.notes
      }
    });
  }

  return {
    ok: true,
    value: events
  };
}

function normalize_prompt_shape(payload: CreatePromptCommand['payload']): EngineResult<{
  selection_mode: PromptSelectionMode;
  number_range: PromptRangeSpec | null;
  multi_columns: PromptColumnSpec[] | null;
}> {
  const selection_mode =
    payload.selection_mode ??
    (payload.multi_columns
      ? 'multi_column'
      : payload.number_range
        ? 'number_range'
        : 'single_choice');

  if (selection_mode === 'single_choice') {
    return {
      ok: true,
      value: {
        selection_mode,
        number_range: null,
        multi_columns: null
      }
    };
  }

  if (selection_mode === 'number_range') {
    const range = payload.number_range;
    if (!range) {
      return error('invalid_prompt_shape', 'number_range prompt requires number_range payload');
    }
    const range_validation = validate_range_spec(range);
    if (!range_validation.ok) {
      return range_validation;
    }
    return {
      ok: true,
      value: {
        selection_mode,
        number_range: { ...range },
        multi_columns: null
      }
    };
  }

  if (!payload.multi_columns || payload.multi_columns.length === 0) {
    return error('invalid_prompt_shape', 'multi_column prompt requires non-empty multi_columns');
  }
  for (const column of payload.multi_columns) {
    const column_validation = validate_column_spec(column);
    if (!column_validation.ok) {
      return column_validation;
    }
  }
  return {
    ok: true,
    value: {
      selection_mode,
      number_range: null,
      multi_columns: payload.multi_columns.map((column) =>
        Array.isArray(column) ? [...column] : { ...column }
      )
    }
  };
}

function validate_prompt_selection(
  prompt: GameState['prompts_by_id'][string],
  selection_mode: PromptSelectionMode,
  selected_option_id: string | null
): EngineResult<true> {
  if (selection_mode === 'single_choice') {
    if (prompt.options.length > 0 && selected_option_id === null) {
      return error('prompt_option_required', 'selected_option_id is required for option-based prompt');
    }
    if (selected_option_id !== null) {
      const is_valid_option = prompt.options.some((option) => option.option_id === selected_option_id);
      if (!is_valid_option) {
        return error(
          'invalid_prompt_option',
          `selected_option_id is not valid for prompt: ${selected_option_id}`
        );
      }
    }
    return {
      ok: true,
      value: true
    };
  }

  if (selection_mode === 'number_range') {
    if (selected_option_id === null) {
      return error('prompt_option_required', 'selected_option_id is required for range prompt');
    }
    const range = prompt.number_range;
    if (!range) {
      return error('invalid_prompt_shape', 'number_range prompt missing number_range');
    }
    const value = parse_numeric_token(selected_option_id);
    if (value === null) {
      return error('invalid_prompt_option', `selected_option_id is not numeric: ${selected_option_id}`);
    }
    const max_inclusive = range.max_inclusive ?? true;
    const max_valid = max_inclusive ? value <= range.max : value < range.max;
    if (value < range.min || !max_valid) {
      return error(
        'invalid_prompt_option',
        `selected_option_id ${selected_option_id} is outside range min=${range.min} max=${range.max}`
      );
    }
    return {
      ok: true,
      value: true
    };
  }

  if (selected_option_id === null) {
    return error('prompt_option_required', 'selected_option_id is required for multi-column prompt');
  }
  const columns = prompt.multi_columns;
  if (!columns || columns.length === 0) {
    return error('invalid_prompt_shape', 'multi_column prompt missing columns');
  }

  const tokens = parse_multi_column_selection(selected_option_id);
  if (!tokens || tokens.length !== columns.length) {
    return error('invalid_prompt_option', `selected_option_id is not valid tuple: ${selected_option_id}`);
  }

  for (let i = 0; i < columns.length; i += 1) {
    const column = columns[i];
    const token = tokens[i];
    if (!column || token === undefined) {
      return error('invalid_prompt_option', `selected_option_id is not valid tuple: ${selected_option_id}`);
    }
    if (Array.isArray(column)) {
      if (!column.includes(token)) {
        return error(
          'invalid_prompt_option',
          `selected_option_id token ${token} not in column ${i}`
        );
      }
      continue;
    }

    const numeric = parse_numeric_token(token);
    if (numeric === null) {
      return error('invalid_prompt_option', `selected_option_id token ${token} not numeric for column ${i}`);
    }
    const max_inclusive = column.max_inclusive ?? true;
    const max_valid = max_inclusive ? numeric <= column.max : numeric < column.max;
    if (numeric < column.min || !max_valid) {
      return error(
        'invalid_prompt_option',
        `selected_option_id token ${token} outside column ${i} range`
      );
    }
  }

  return {
    ok: true,
    value: true
  };
}

function validate_range_spec(range: PromptRangeSpec): EngineResult<true> {
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max)) {
    return error('invalid_prompt_shape', 'number_range min/max must be finite numbers');
  }
  if (range.min > range.max) {
    return error('invalid_prompt_shape', 'number_range min must be <= max');
  }
  return {
    ok: true,
    value: true
  };
}

function validate_column_spec(column: PromptColumnSpec): EngineResult<true> {
  if (Array.isArray(column)) {
    if (column.length === 0) {
      return error('invalid_prompt_shape', 'enum column must be non-empty');
    }
    return {
      ok: true,
      value: true
    };
  }
  return validate_range_spec(column);
}

function parse_numeric_token(token: string): number | null {
  if (!/^-?\d+(\.\d+)?$/.test(token.trim())) {
    return null;
  }
  const parsed = Number(token);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize_numeric_token(token: string): string | null {
  const value = parse_numeric_token(token);
  if (value === null) {
    return null;
  }
  return String(value);
}

function parse_multi_column_selection(option_id: string): string[] | null {
  const delimiter = option_id.includes(',') ? ',' : option_id.includes('|') ? '|' : null;
  if (!delimiter) {
    return null;
  }
  return option_id.split(delimiter).map((token) => token.trim());
}

export function handle_cancel_prompt(
  state: GameState,
  command: CancelPromptCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  const prompt_key = command.payload.prompt_key;
  const prompt = state.prompts_by_id[prompt_key];
  if (!prompt) {
    return error('prompt_not_found', `prompt not found: ${prompt_key}`);
  }
  if (prompt.status !== 'pending') {
    return error('prompt_not_pending', `prompt is not pending: ${prompt_key}`);
  }

  return {
    ok: true,
    value: [
      {
        event_key: `${command.command_id}:PromptCancelled`,
        event_id: 1,
        event_type: 'PromptCancelled',
        created_at,
        actor_id: command.actor_id,
        payload: {
          prompt_key,
          prompt_id: command.payload.prompt_id,
          reason: command.payload.reason
        }
      },
      {
        event_key: `${command.command_id}:StorytellerRulingRecorded`,
        event_id: 1,
        event_type: 'StorytellerRulingRecorded',
        created_at,
        actor_id: command.actor_id,
        payload: {
          prompt_key,
          prompt_id: command.payload.prompt_id,
          note: command.payload.reason
        }
      }
    ]
  };
}
