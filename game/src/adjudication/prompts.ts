import type {
  CancelPromptCommand,
  CreatePromptCommand,
  ResolvePromptCommand
} from '../domain/commands.js';
import type { DomainEvent } from '../domain/events.js';
import type { GameState } from '../domain/types.js';
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
  if (state.prompts_by_id[command.payload.prompt_id]) {
    return error('prompt_id_already_exists', `prompt already exists: ${command.payload.prompt_id}`);
  }

  return {
    ok: true,
    value: [
      {
        event_id: `${command.command_id}:PromptQueued`,
        event_type: 'PromptQueued',
        created_at,
        actor_id: command.actor_id,
        payload: {
          prompt_id: command.payload.prompt_id,
          kind: command.payload.kind,
          reason: command.payload.reason,
          visibility: command.payload.visibility,
          options: command.payload.options.map((option) => ({ ...option }))
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
  const prompt = state.prompts_by_id[command.payload.prompt_id];
  if (!prompt) {
    return error('prompt_not_found', `prompt not found: ${command.payload.prompt_id}`);
  }
  if (prompt.status !== 'pending') {
    return error('prompt_not_pending', `prompt is not pending: ${command.payload.prompt_id}`);
  }

  if (prompt.options.length > 0 && command.payload.selected_option_id === null) {
    return error('prompt_option_required', 'selected_option_id is required for option-based prompt');
  }

  if (command.payload.selected_option_id !== null) {
    const is_valid_option = prompt.options.some(
      (option) => option.option_id === command.payload.selected_option_id
    );
    if (!is_valid_option) {
      return error(
        'invalid_prompt_option',
        `selected_option_id is not valid for prompt: ${command.payload.selected_option_id}`
      );
    }
  }

  const events: DomainEvent[] = [
    {
      event_id: `${command.command_id}:PromptResolved`,
      event_type: 'PromptResolved',
      created_at,
      actor_id: command.actor_id,
      payload: {
        prompt_id: command.payload.prompt_id,
        selected_option_id: command.payload.selected_option_id,
        freeform: command.payload.freeform,
        notes: command.payload.notes
      }
    },
    {
      event_id: `${command.command_id}:StorytellerChoiceMade`,
      event_type: 'StorytellerChoiceMade',
      created_at,
      actor_id: command.actor_id,
      payload: {
        prompt_id: command.payload.prompt_id,
        selected_option_id: command.payload.selected_option_id,
        freeform: command.payload.freeform
      }
    }
  ];

  if (command.payload.notes !== null) {
    events.push({
      event_id: `${command.command_id}:StorytellerRulingRecorded`,
      event_type: 'StorytellerRulingRecorded',
      created_at,
      actor_id: command.actor_id,
      payload: {
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

export function handle_cancel_prompt(
  state: GameState,
  command: CancelPromptCommand,
  created_at: string
): EngineResult<DomainEvent[]> {
  const prompt = state.prompts_by_id[command.payload.prompt_id];
  if (!prompt) {
    return error('prompt_not_found', `prompt not found: ${command.payload.prompt_id}`);
  }
  if (prompt.status !== 'pending') {
    return error('prompt_not_pending', `prompt is not pending: ${command.payload.prompt_id}`);
  }

  return {
    ok: true,
    value: [
      {
        event_id: `${command.command_id}:PromptCancelled`,
        event_type: 'PromptCancelled',
        created_at,
        actor_id: command.actor_id,
        payload: {
          prompt_id: command.payload.prompt_id,
          reason: command.payload.reason
        }
      },
      {
        event_id: `${command.command_id}:StorytellerRulingRecorded`,
        event_type: 'StorytellerRulingRecorded',
        created_at,
        actor_id: command.actor_id,
        payload: {
          prompt_id: command.payload.prompt_id,
          note: command.payload.reason
        }
      }
    ]
  };
}
