import type { GameState } from '../domain/types.js';
import {
  default_pending_prompt_id,
  invalid,
  parse_prompt_visibility,
  random_option_id_for_prompt,
  type ParsedCliLine
} from './parser-common.js';
import { CLI_USAGE } from './command-registry.js';

export function parse_prompt_domain_command(
  command: string,
  args: string[],
  state?: GameState
): ParsedCliLine | null {
  if (command === 'prompts') {
    return { ok: true, kind: 'local', action: { type: 'prompts' } };
  }

  if (command === 'prompt') {
    const prompt_id = args[0];
    if (!prompt_id) {
      return invalid(`usage: ${CLI_USAGE.prompt}`);
    }
    return { ok: true, kind: 'local', action: { type: 'prompt', prompt_id } };
  }

  if (command === 'create-prompt') {
    const prompt_id = args[0];
    const kind = args[1];
    const visibility = parse_prompt_visibility(args[2] ?? '');
    const reason = args.slice(3).join(' ').trim();
    if (!prompt_id || !kind || !visibility || reason.length === 0) {
      return invalid(`usage: ${CLI_USAGE.create_prompt}`);
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'CreatePrompt',
        payload: {
          prompt_id,
          kind,
          reason,
          visibility,
          options: []
        }
      }
    };
  }

  if (command === 'resolve-prompt' || command === 'choose' || command === 'ch') {
    const is_choose_alias = command === 'choose' || command === 'ch';
    const default_prompt_id = default_pending_prompt_id(state);

    if (is_choose_alias && args.length === 0) {
      if (!default_prompt_id) {
        return invalid('usage: choose [prompt_id] [selected_option_id|-] [notes...]');
      }
      return {
        ok: true,
        kind: 'engine',
        command: {
          command_type: 'ResolvePrompt',
          payload: {
            prompt_id: default_prompt_id,
            selected_option_id: random_option_id_for_prompt(state, default_prompt_id),
            freeform: null,
            notes: 'auto_random_choice'
          }
        }
      };
    }

    let prompt_id = args[0] ?? default_prompt_id;
    let selected_option_id: string | null = args[1] === undefined || args[1] === '-' ? null : (args[1] ?? null);
    let notes_text = args.slice(2).join(' ').trim();

    if (default_prompt_id && args.length > 0 && args[0] !== default_prompt_id) {
      prompt_id = default_prompt_id;
      selected_option_id = args[0] === '-' ? null : (args[0] ?? null);
      notes_text = args.slice(1).join(' ').trim();
    }

    if (!prompt_id) {
      return invalid(`usage: ${CLI_USAGE.resolve_prompt}`);
    }

    if (is_choose_alias && selected_option_id === null) {
      selected_option_id = random_option_id_for_prompt(state, prompt_id);
      if (notes_text.length === 0) {
        notes_text = 'auto_random_choice';
      }
    }

    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'ResolvePrompt',
        payload: {
          prompt_id,
          selected_option_id,
          freeform: null,
          notes: notes_text.length > 0 ? notes_text : null
        }
      }
    };
  }

  if (command === 'cancel-prompt') {
    const prompt_id = args[0];
    const reason = args.slice(1).join(' ').trim();
    if (!prompt_id || reason.length === 0) {
      return invalid(`usage: ${CLI_USAGE.cancel_prompt}`);
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'CancelPrompt',
        payload: {
          prompt_id,
          reason
        }
      }
    };
  }

  return null;
}
