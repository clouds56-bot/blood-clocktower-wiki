import type { GameState } from '../domain/types.js';
import {
  invalid,
  parse_alignment,
  parse_character_setup_type,
  parse_int,
  parse_phase,
  parse_subphase,
  type ParsedCliLine
} from './parser-common.js';
import { CLI_USAGE } from './command-registry.js';

export function parse_setup_domain_command(
  command: string,
  args: string[],
  _state?: GameState
): ParsedCliLine | null {
  if (command === 'new') {
    const game_id = args[0];
    if (!game_id) {
      return invalid(`usage: ${CLI_USAGE.new_game}`);
    }
    return { ok: true, kind: 'local', action: { type: 'new_game', game_id } };
  }

  if (command === 'quick-setup' || command === 'quick-start' || command === 'start') {
    const script = args[0];
    const player_num = parse_int(args[1] ?? '');
    const game_id = args[2];
    if (!script || player_num === null) {
      return invalid(`usage: ${CLI_USAGE.quick_setup}`);
    }
    if (player_num < 5 || player_num > 15) {
      return invalid('quick-setup currently supports player_num in range 5..15');
    }
    return {
      ok: true,
      kind: 'local',
      action: game_id
        ? { type: 'quick_setup', script, player_num, game_id }
        : { type: 'quick_setup', script, player_num }
    };
  }

  if (command === 'setup-player') {
    if (args.length < 3) {
      return invalid(`usage: ${CLI_USAGE.setup_player}`);
    }

    let alignment = null;
    const parts = [...args];
    const last = parts[parts.length - 1];
    const parsed_alignment = last ? parse_alignment(last) : null;
    if (parsed_alignment) {
      alignment = parsed_alignment;
      parts.pop();
    }

    const type_token = parts[parts.length - 1];
    const character_type = type_token ? parse_character_setup_type(type_token) : null;
    if (!character_type) {
      return invalid(`usage: ${CLI_USAGE.setup_player}`);
    }
    parts.pop();

    if (parts.length < 2 || parts.length > 3) {
      return invalid(`usage: ${CLI_USAGE.setup_player}`);
    }

    const player_id = parts[0];
    const true_character_id = parts[1];
    const perceived_character_id = parts[2] ?? true_character_id;
    if (!player_id || !true_character_id || !perceived_character_id) {
      return invalid(`usage: ${CLI_USAGE.setup_player}`);
    }

    return {
      ok: true,
      kind: 'local',
      action: {
        type: 'setup_player',
        player_id,
        true_character_id,
        perceived_character_id,
        character_type,
        alignment
      }
    };
  }

  if (command === 'select-script') {
    const script_id = args[0];
    if (!script_id) {
      return invalid(`usage: ${CLI_USAGE.select_script}`);
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'SelectScript',
        payload: { script_id }
      }
    };
  }

  if (command === 'select-edition') {
    const edition_id = args[0];
    if (!edition_id) {
      return invalid(`usage: ${CLI_USAGE.select_edition}`);
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'SelectEdition',
        payload: { edition_id }
      }
    };
  }

  if (command === 'add-player') {
    const player_id = args[0];
    const display_name = args.slice(1).join(' ').trim();
    if (!player_id || display_name.length === 0) {
      return invalid(`usage: ${CLI_USAGE.add_player}`);
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'AddPlayer',
        payload: { player_id, display_name }
      }
    };
  }

  if (command === 'set-seat-order') {
    if (args.length === 0) {
      return invalid(`usage: ${CLI_USAGE.set_seat_order}`);
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'SetSeatOrder',
        payload: { seat_order: args }
      }
    };
  }

  if (command === 'assign-character') {
    const player_id = args[0];
    const true_character_id = args[1];
    if (!player_id || !true_character_id) {
      return invalid(`usage: ${CLI_USAGE.assign_character}`);
    }
    const flags = new Set(args.slice(2));
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'AssignCharacter',
        payload: {
          player_id,
          true_character_id,
          is_demon: flags.has('--demon'),
          is_traveller: flags.has('--traveller')
        }
      }
    };
  }

  if (command === 'assign-perceived') {
    const player_id = args[0];
    const perceived_character_id = args[1];
    if (!player_id || !perceived_character_id) {
      return invalid(`usage: ${CLI_USAGE.assign_perceived}`);
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'AssignPerceivedCharacter',
        payload: {
          player_id,
          perceived_character_id
        }
      }
    };
  }

  if (command === 'assign-alignment') {
    const player_id = args[0];
    const true_alignment = parse_alignment(args[1] ?? '');
    if (!player_id || !true_alignment) {
      return invalid(`usage: ${CLI_USAGE.assign_alignment}`);
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'AssignAlignment',
        payload: {
          player_id,
          true_alignment
        }
      }
    };
  }

  if (command === 'phase') {
    const phase = parse_phase(args[0] ?? '');
    const subphase = parse_subphase(args[1] ?? '');
    const day_number = parse_int(args[2] ?? '');
    const night_number = parse_int(args[3] ?? '');
    if (!phase || !subphase || day_number === null || night_number === null) {
      return invalid(`usage: ${CLI_USAGE.phase}`);
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'AdvancePhase',
        payload: {
          phase,
          subphase,
          day_number,
          night_number
        }
      }
    };
  }

  return null;
}
