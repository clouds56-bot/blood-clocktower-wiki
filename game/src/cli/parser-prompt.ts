import type { GameState } from '../domain/types.js';
import {
  default_pending_prompt_key,
  invalid,
  parse_prompt_visibility,
  random_option_id_for_prompt,
  type ParsedCliLine
} from './parser-common.js';
import { CLI_USAGE } from './command-registry.js';
import type { ParseCliOptions } from './command-parser.js';

export function parse_prompt_domain_command(
  command: string,
  args: string[],
  state?: GameState,
  options?: ParseCliOptions
): ParsedCliLine | null {
  const script_mode = options?.script_mode ?? false;
  if (command === 'prompts') {
    return { ok: true, kind: 'local', action: { type: 'prompts' } };
  }

  if (command === 'prompt') {
    const prompt_key = args[0];
    if (!prompt_key) {
      return invalid(`usage: ${CLI_USAGE.prompt}`);
    }
    return { ok: true, kind: 'local', action: { type: 'prompt', prompt_key } };
  }

  if (command === 'create-prompt') {
    const prompt_key = args[0];
    const kind = args[1];
    const visibility = parse_prompt_visibility(args[2] ?? '');
    const reason = args.slice(3).join(' ').trim();
    if (!prompt_key || !kind || !visibility || reason.length === 0) {
      return invalid(`usage: ${CLI_USAGE.create_prompt}`);
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'CreatePrompt',
        payload: {
          prompt_key,
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
    if (script_mode && is_choose_alias) {
      return invalid('script mode disallows random choose/ch shorthand');
    }
    const default_prompt_key = default_pending_prompt_key(state);

    if (is_choose_alias && args.length === 0) {
      if (!default_prompt_key) {
        return invalid('usage: choose [prompt_key] [selected_option_id|-] [notes...]');
      }
      return {
        ok: true,
        kind: 'engine',
        command: {
          command_type: 'ResolvePrompt',
          payload: {
            prompt_key: default_prompt_key,
            selected_option_id: random_option_id_for_prompt(state, default_prompt_key),
            freeform: null,
            notes: 'auto_random_choice'
          }
        }
      };
    }

    let prompt_key = args[0] ?? default_prompt_key;
    let selected_option_id: string | null = args[1] === undefined || args[1] === '-' ? null : (args[1] ?? null);
    let notes_text = args.slice(2).join(' ').trim();

    if (default_prompt_key && args.length > 0 && args[0] !== default_prompt_key) {
      prompt_key = default_prompt_key;
      selected_option_id = args[0] === '-' ? null : (args[0] ?? null);
      notes_text = args.slice(1).join(' ').trim();
    }

    if (!prompt_key) {
      return invalid(`usage: ${CLI_USAGE.resolve_prompt}`);
    }

    if (is_choose_alias && selected_option_id === null) {
      selected_option_id = random_option_id_for_prompt(state, prompt_key);
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
          prompt_key,
          selected_option_id,
          freeform: null,
          notes: notes_text.length > 0 ? notes_text : null
        }
      }
    };
  }

  if (command === 'cancel-prompt') {
    const prompt_key = args[0];
    const reason = args.slice(1).join(' ').trim();
    if (!prompt_key || reason.length === 0) {
      return invalid(`usage: ${CLI_USAGE.cancel_prompt}`);
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'CancelPrompt',
        payload: {
          prompt_key,
          reason
        }
      }
    };
  }

  return null;
}
