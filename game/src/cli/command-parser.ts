import type { Command } from '../domain/commands.js';
import type {
  Alignment,
  GamePhase,
  GameState,
  GameSubphase,
  NominationRecord,
  PromptVisibility
} from '../domain/types.js';

export type CliLocalAction =
  | { type: 'help'; topic?: 'phase' | 'all' }
  | { type: 'next_phase' }
  | { type: 'bulk_vote'; nomination_id: string; voter_player_ids: string[]; in_favor: boolean }
  | { type: 'state'; format: 'brief' | 'json' }
  | { type: 'events'; count: number }
  | { type: 'players' }
  | { type: 'player'; player_id: string }
  | { type: 'view_storyteller'; json: boolean }
  | { type: 'view_public'; json: boolean }
  | { type: 'view_player'; player_id: string; json: boolean }
  | { type: 'prompts' }
  | { type: 'prompt'; prompt_id: string }
  | { type: 'markers' }
  | { type: 'marker'; marker_id: string }
  | {
      type: 'setup_player';
      player_id: string;
      true_character_id: string;
      perceived_character_id: string;
      character_type: CharacterSetupType;
      alignment: Alignment | null;
    }
  | { type: 'new_game'; game_id: string }
  | { type: 'quick_setup'; script: string; player_num: number; game_id?: string }
  | { type: 'quit' };

export type ParsedCliLine =
  | { ok: true; kind: 'empty' }
  | { ok: true; kind: 'local'; action: CliLocalAction }
  | { ok: true; kind: 'engine'; command: Omit<Command, 'command_id'> }
  | { ok: false; message: string };

type DeathReason = 'execution' | 'night_death' | 'ability' | 'storyteller';
type CharacterSetupType = 'townsfolk' | 'outsider' | 'minion' | 'demon' | 'traveller';

function parse_int(value: string, field: string): number | null {
  if (value.trim().length === 0) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return null;
  }
  if (parsed < 0) {
    return null;
  }
  return parsed;
}

function parse_alignment(value: string): Alignment | null {
  if (value === 'good' || value === 'evil') {
    return value;
  }
  return null;
}

function parse_phase(value: string): GamePhase | null {
  if (
    value === 'setup' ||
    value === 'first_night' ||
    value === 'day' ||
    value === 'night' ||
    value === 'ended'
  ) {
    return value;
  }
  return null;
}

function parse_subphase(value: string): GameSubphase | null {
  if (
    value === 'open_discussion' ||
    value === 'nomination_window' ||
    value === 'vote_in_progress' ||
    value === 'execution_resolution' ||
    value === 'day_end' ||
    value === 'dusk' ||
    value === 'night_wake_sequence' ||
    value === 'immediate_interrupt_resolution' ||
    value === 'dawn' ||
    value === 'idle' ||
    value === 'complete'
  ) {
    return value;
  }
  return null;
}

function parse_yes_no(value: string): boolean | null {
  if (value === 'yes' || value === 'y' || value === 'true') {
    return true;
  }
  if (value === 'no' || value === 'n' || value === 'false') {
    return false;
  }
  return null;
}

function parse_death_reason(value: string): DeathReason | null {
  if (value === 'execution' || value === 'night_death' || value === 'ability' || value === 'storyteller') {
    return value;
  }
  return null;
}

function parse_prompt_visibility(value: string): PromptVisibility | null {
  if (value === 'storyteller' || value === 'player' || value === 'public') {
    return value;
  }
  return null;
}

function parse_character_setup_type(value: string): CharacterSetupType | null {
  if (
    value === 'townsfolk' ||
    value === 'outsider' ||
    value === 'minion' ||
    value === 'demon' ||
    value === 'traveller'
  ) {
    return value;
  }
  return null;
}

function invalid(message: string): ParsedCliLine {
  return {
    ok: false,
    message
  };
}

function current_day_number(state?: GameState): number | null {
  return state ? state.day_number : null;
}

function current_night_number(state?: GameState): number | null {
  return state ? state.night_number : null;
}

function next_nomination_id(state?: GameState): string | null {
  if (!state) {
    return null;
  }
  return `n${state.day_state.nominations_today.length + 1}`;
}

function latest_nomination(state?: GameState): NominationRecord | null {
  if (!state || state.day_state.nominations_today.length === 0) {
    return null;
  }
  return state.day_state.nominations_today[state.day_state.nominations_today.length - 1] ?? null;
}

function find_nomination(state: GameState | undefined, nomination_id: string): NominationRecord | null {
  if (!state) {
    return null;
  }
  return state.day_state.nominations_today.find((item) => item.nomination_id === nomination_id) ?? null;
}

function default_opened_by_player_id(state?: GameState, nomination_id?: string): string | null {
  if (!state) {
    return null;
  }
  if (nomination_id) {
    const nomination = find_nomination(state, nomination_id);
    if (nomination) {
      return nomination.nominator_player_id;
    }
  }
  for (const player_id of state.seat_order) {
    const player = state.players_by_id[player_id];
    if (player?.alive) {
      return player_id;
    }
  }
  const first = Object.keys(state.players_by_id)[0];
  return first ?? null;
}

function default_executed_player_id(state?: GameState): string | null {
  if (!state) {
    return null;
  }
  return state.day_state.executed_player_id;
}

function default_pending_prompt_id(state?: GameState): string | null {
  if (!state) {
    return null;
  }
  if (state.pending_prompts.length !== 1) {
    return null;
  }
  return state.pending_prompts[0] ?? null;
}

function random_option_id_for_prompt(state: GameState | undefined, prompt_id: string): string | null {
  if (!state) {
    return null;
  }
  const prompt = state.prompts_by_id[prompt_id];
  if (!prompt || prompt.status !== 'pending' || prompt.options.length === 0) {
    return null;
  }
  const index = Math.floor(Math.random() * prompt.options.length);
  const option = prompt.options[index];
  return option?.option_id ?? null;
}

export function parse_cli_line(input: string, state?: GameState): ParsedCliLine {
  const line = input.trim();
  if (line.length === 0) {
    return { ok: true, kind: 'empty' };
  }

  const parts = line.split(/\s+/);
  const [raw_command, ...args] = parts;
  const command = raw_command?.toLowerCase();

  if (!command) {
    return { ok: true, kind: 'empty' };
  }

  if (command === 'quit' || command === 'exit') {
    return { ok: true, kind: 'local', action: { type: 'quit' } };
  }
  if (command === 'help') {
    const topic = args[0];
    if (topic === undefined || topic === 'all') {
      return { ok: true, kind: 'local', action: { type: 'help', topic: 'all' } };
    }
    if (topic === 'phase') {
      return { ok: true, kind: 'local', action: { type: 'help', topic: 'phase' } };
    }
    return invalid('usage: help [all|phase]');
  }
  if (command === 'next-phase' || command === 'next' || command === 'n') {
    return { ok: true, kind: 'local', action: { type: 'next_phase' } };
  }
  if (command === 'state') {
    const format = args[0] === 'json' ? 'json' : 'brief';
    return { ok: true, kind: 'local', action: { type: 'state', format } };
  }
  if (command === 'events') {
    if (args.length === 0) {
      return { ok: true, kind: 'local', action: { type: 'events', count: 10 } };
    }
    const count = parse_int(args[0] ?? '', 'count');
    if (count === null) {
      return invalid('usage: events [count]');
    }
    return { ok: true, kind: 'local', action: { type: 'events', count } };
  }
  if (command === 'players') {
    return { ok: true, kind: 'local', action: { type: 'players' } };
  }
  if (command === 'player') {
    const player_id = args[0];
    if (!player_id) {
      return invalid('usage: player <player_id>');
    }
    return { ok: true, kind: 'local', action: { type: 'player', player_id } };
  }
  if (command === 'view') {
    const json = args.includes('--json');
    const tokens = args.filter((token) => token !== '--json');
    const mode = tokens[0];

    if (mode === 'storyteller' || mode === 'st') {
      return { ok: true, kind: 'local', action: { type: 'view_storyteller', json } };
    }
    if (mode === 'public') {
      return { ok: true, kind: 'local', action: { type: 'view_public', json } };
    }
    if (mode === 'player') {
      const player_id = tokens[1];
      if (!player_id) {
      return invalid('usage: view player <player_id> [--json]');
      }
      return { ok: true, kind: 'local', action: { type: 'view_player', player_id, json } };
    }
    if (mode && mode !== 'public' && mode !== 'storyteller' && mode !== 'st') {
      return { ok: true, kind: 'local', action: { type: 'view_player', player_id: mode, json } };
    }
    return invalid(
      'usage: view storyteller|st [--json] | view public [--json] | view player <player_id> [--json] | view <player_id> [--json]'
    );
  }
  if (command === 'prompts') {
    return { ok: true, kind: 'local', action: { type: 'prompts' } };
  }
  if (command === 'prompt') {
    const prompt_id = args[0];
    if (!prompt_id) {
      return invalid('usage: prompt <prompt_id>');
    }
    return { ok: true, kind: 'local', action: { type: 'prompt', prompt_id } };
  }
  if (command === 'markers') {
    return { ok: true, kind: 'local', action: { type: 'markers' } };
  }
  if (command === 'reminders') {
    return { ok: true, kind: 'local', action: { type: 'markers' } };
  }
  if (command === 'marker') {
    const marker_id = args[0];
    if (!marker_id) {
      return invalid('usage: marker <marker_id>');
    }
    return { ok: true, kind: 'local', action: { type: 'marker', marker_id } };
  }
  if (command === 'reminder') {
    const marker_id = args[0];
    if (!marker_id) {
      return invalid('usage: reminder <marker_id>');
    }
    return { ok: true, kind: 'local', action: { type: 'marker', marker_id } };
  }
  if (command === 'new') {
    const game_id = args[0];
    if (!game_id) {
      return invalid('usage: new <game_id>');
    }
    return { ok: true, kind: 'local', action: { type: 'new_game', game_id } };
  }

  if (command === 'quick-setup' || command === 'quick-start' || command === 'start') {
    const script = args[0];
    const player_num = parse_int(args[1] ?? '', 'player_num');
    const game_id = args[2];
    if (!script || player_num === null) {
      return invalid('usage: quick-setup <script> <player_num> [game_id]');
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
    const usage =
      'usage: setup-player <player_id> <true_character_id> [perceived_character_id] <townsfolk|outsider|minion|demon|traveller> [good|evil]';
    if (args.length < 3) {
      return invalid(usage);
    }

    let alignment: Alignment | null = null;
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
      return invalid(usage);
    }
    parts.pop();

    if (parts.length < 2 || parts.length > 3) {
      return invalid(usage);
    }

    const player_id = parts[0];
    const true_character_id = parts[1];
    const perceived_character_id = parts[2] ?? true_character_id;
    if (!player_id || !true_character_id || !perceived_character_id) {
      return invalid(usage);
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
      return invalid('usage: select-script <script_id>');
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
      return invalid('usage: select-edition <edition_id>');
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
      return invalid('usage: add-player <player_id> <display_name>');
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
      return invalid('usage: set-seat-order <player_id...>');
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
      return invalid('usage: assign-character <player_id> <character_id> [--demon] [--traveller]');
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
      return invalid('usage: assign-perceived <player_id> <character_id>');
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
      return invalid('usage: assign-alignment <player_id> <good|evil>');
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
    const day_number = parse_int(args[2] ?? '', 'day_number');
    const night_number = parse_int(args[3] ?? '', 'night_number');
    if (!phase || !subphase || day_number === null || night_number === null) {
      return invalid('usage: phase <phase> <subphase> <day_number> <night_number>');
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

  if (command === 'open-noms') {
    const day_number =
      args[0] === undefined
        ? current_day_number(state)
        : parse_int(args[0] ?? '', 'day_number');
    if (day_number === null) {
      return invalid('usage: open-noms [day_number]');
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'OpenNominationWindow',
        payload: { day_number }
      }
    };
  }

  if (command === 'nominate' || command === 'nom') {
    let nomination_id: string | null = null;
    let day_number: number | null = null;
    let nominator_player_id: string | undefined;
    let nominee_player_id: string | undefined;

    if (args.length === 2) {
      nomination_id = next_nomination_id(state);
      day_number = current_day_number(state);
      nominator_player_id = args[0];
      nominee_player_id = args[1];
    } else if (args.length === 3) {
      nomination_id = args[0] ?? null;
      day_number = current_day_number(state);
      nominator_player_id = args[1];
      nominee_player_id = args[2];
    } else {
      nomination_id = args[0] ?? null;
      day_number = parse_int(args[1] ?? '', 'day_number');
      nominator_player_id = args[2];
      nominee_player_id = args[3];
    }

    if (!nomination_id || day_number === null || !nominator_player_id || !nominee_player_id) {
      return invalid(
        'usage: nominate <nominator_id> <nominee_id> | nominate <nomination_id> <nominator_id> <nominee_id> | nominate <nomination_id> <day_number> <nominator_id> <nominee_id>'
      );
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'NominatePlayer',
        payload: {
          nomination_id,
          day_number,
          nominator_player_id,
          nominee_player_id
        }
      }
    };
  }

  if (command === 'open-vote') {
    let nomination_id: string | null = null;
    let nominee_player_id: string | null = null;
    let opened_by_player_id: string | null = null;

    if (args.length === 0) {
      const latest = latest_nomination(state);
      nomination_id = latest?.nomination_id ?? null;
      nominee_player_id = latest?.nominee_player_id ?? null;
      opened_by_player_id = default_opened_by_player_id(state, nomination_id ?? undefined);
    } else if (args.length === 1) {
      nomination_id = args[0] ?? null;
      const nomination = nomination_id && state ? find_nomination(state, nomination_id) : null;
      nominee_player_id = nomination?.nominee_player_id ?? null;
      opened_by_player_id = default_opened_by_player_id(state, nomination_id ?? undefined);
    } else if (args.length === 2) {
      nomination_id = args[0] ?? null;
      opened_by_player_id = args[1] ?? null;
      const nomination = nomination_id && state ? find_nomination(state, nomination_id) : null;
      nominee_player_id = nomination?.nominee_player_id ?? null;
    } else {
      nomination_id = args[0] ?? null;
      nominee_player_id = args[1] ?? null;
      opened_by_player_id = args[2] ?? null;
    }

    if (!nomination_id || !nominee_player_id || !opened_by_player_id) {
      return invalid(
        'usage: open-vote | open-vote <nomination_id> | open-vote <nomination_id> <opened_by_id> | open-vote <nomination_id> <nominee_id> <opened_by_id>'
      );
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'OpenVote',
        payload: {
          nomination_id,
          nominee_player_id,
          opened_by_player_id
        }
      }
    };
  }

  if (command === 'vote') {
    const active_nomination_id = state?.day_state.active_vote?.nomination_id ?? null;
    const explicit_nomination = args[0] && state ? find_nomination(state, args[0]) : null;

    if (explicit_nomination) {
      const voter_player_id = args[1];
      const in_favor = parse_yes_no(args[2] ?? '');
      if (!voter_player_id || in_favor === null) {
        return invalid('usage: vote <nomination_id> <voter_id> <yes|no>');
      }
      return {
        ok: true,
        kind: 'engine',
        command: {
          command_type: 'CastVote',
          payload: {
            nomination_id: explicit_nomination.nomination_id,
            voter_player_id,
            in_favor
          }
        }
      };
    }

    if (!active_nomination_id || args.length === 0) {
      return invalid(
        'usage: vote <voter_id> <yes|no> | vote <voter_id...> [yes|no] | vote <nomination_id> <voter_id> <yes|no>'
      );
    }

    if (args.length === 2) {
      const single_vote = parse_yes_no(args[1] ?? '');
      if (single_vote !== null) {
        return {
          ok: true,
          kind: 'engine',
          command: {
            command_type: 'CastVote',
            payload: {
              nomination_id: active_nomination_id,
              voter_player_id: args[0] as string,
              in_favor: single_vote
            }
          }
        };
      }
    }

    const last_token = args[args.length - 1];
    const explicit_bulk_vote = last_token ? parse_yes_no(last_token) : null;
    const in_favor = explicit_bulk_vote ?? true;
    const voter_player_ids = explicit_bulk_vote === null ? args : args.slice(0, -1);

    if (voter_player_ids.length === 0) {
      return invalid(
        'usage: vote <voter_id> <yes|no> | vote <voter_id...> [yes|no] | vote <nomination_id> <voter_id> <yes|no>'
      );
    }

    return {
      ok: true,
      kind: 'local',
      action: {
        type: 'bulk_vote',
        nomination_id: active_nomination_id,
        voter_player_ids,
        in_favor
      }
    };
  }

  if (command === 'close-vote') {
    const nomination_id =
      args[0] === undefined
        ? (state?.day_state.active_vote?.nomination_id ?? null)
        : (args[0] ?? null);
    const day_number =
      args[1] === undefined
        ? current_day_number(state)
        : parse_int(args[1] ?? '', 'day_number');
    if (!nomination_id || day_number === null) {
      return invalid('usage: close-vote [nomination_id] [day_number]');
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'CloseVote',
        payload: {
          nomination_id,
          day_number
        }
      }
    };
  }

  if (command === 'resolve-exec') {
    const day_number =
      args[0] === undefined
        ? current_day_number(state)
        : parse_int(args[0] ?? '', 'day_number');
    if (day_number === null) {
      return invalid('usage: resolve-exec [day_number]');
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'ResolveExecution',
        payload: { day_number }
      }
    };
  }

  if (command === 'resolve-conseq') {
    const day_number =
      args[0] === undefined
        ? current_day_number(state)
        : parse_int(args[0] ?? '', 'day_number');
    if (day_number === null) {
      return invalid('usage: resolve-conseq [day_number]');
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'ResolveExecutionConsequences',
        payload: { day_number }
      }
    };
  }

  if (command === 'apply-death') {
    const player_id = args[0];
    const reason = parse_death_reason(args[1] ?? '');
    const day_number =
      args[2] === undefined
        ? current_day_number(state)
        : parse_int(args[2] ?? '', 'day_number');
    const night_number =
      args[3] === undefined
        ? current_night_number(state)
        : parse_int(args[3] ?? '', 'night_number');
    if (!player_id || !reason || day_number === null || night_number === null) {
      return invalid(
        'usage: apply-death <player_id> <execution|night_death|ability|storyteller> [day_number] [night_number]'
      );
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'ApplyDeath',
        payload: {
          player_id,
          reason,
          day_number,
          night_number
        }
      }
    };
  }

  if (command === 'survive-exec') {
    const player_id = args[0] ?? default_executed_player_id(state);
    const day_number =
      args[1] === undefined
        ? current_day_number(state)
        : parse_int(args[1] ?? '', 'day_number');
    if (!player_id || day_number === null) {
      return invalid('usage: survive-exec [player_id] [day_number]');
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'MarkPlayerSurvivedExecution',
        payload: {
          player_id,
          day_number
        }
      }
    };
  }

  if (command === 'check-win') {
    const day_number =
      args[0] === undefined
        ? current_day_number(state)
        : parse_int(args[0] ?? '', 'day_number');
    const night_number =
      args[1] === undefined
        ? current_night_number(state)
        : parse_int(args[1] ?? '', 'night_number');
    if (day_number === null || night_number === null) {
      return invalid('usage: check-win [day_number] [night_number]');
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'CheckWinConditions',
        payload: {
          day_number,
          night_number
        }
      }
    };
  }

  if (command === 'force-win') {
    const winning_team = parse_alignment(args[0] ?? '');
    const rationale = args.slice(1).join(' ').trim() || 'cli_forced_victory';
    if (!winning_team) {
      return invalid('usage: force-win <good|evil> [rationale...]');
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'DeclareForcedVictory',
        payload: {
          winning_team,
          rationale
        }
      }
    };
  }

  if (command === 'create-prompt') {
    const prompt_id = args[0];
    const kind = args[1];
    const visibility = parse_prompt_visibility(args[2] ?? '');
    const reason = args.slice(3).join(' ').trim();
    if (!prompt_id || !kind || !visibility || reason.length === 0) {
      return invalid('usage: create-prompt <prompt_id> <kind> <storyteller|player|public> <reason...>');
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
      return invalid('usage: resolve-prompt [prompt_id] [selected_option_id|-] [notes...]');
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
      return invalid('usage: cancel-prompt <prompt_id> <reason...>');
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

  if (command === 'end-day') {
    const day_number =
      args[0] === undefined
        ? current_day_number(state)
        : parse_int(args[0] ?? '', 'day_number');
    if (day_number === null) {
      return invalid('usage: end-day [day_number]');
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'EndDay',
        payload: {
          day_number
        }
      }
    };
  }

  if (command === 'apply-marker') {
    const marker_id = args[0];
    const kind = args[1];
    const effect = args[2];
    const target_player_id = args[3] ?? null;
    const source_character_id = args[4] ?? null;
    const note = args.slice(5).join(' ').trim() || `${kind ?? 'marker'}:${effect ?? 'effect'}`;
    if (!marker_id || !kind || !effect) {
      return invalid('usage: apply-marker <marker_id> <kind> <effect> [target_player_id] [source_character_id] [note...]');
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'ApplyReminderMarker',
        payload: {
          marker_id,
          kind,
          effect,
          note,
          source_player_id: null,
          source_character_id,
          target_player_id,
          target_scope: target_player_id ? 'player' : 'game',
          authoritative: true,
          expires_policy: 'manual',
          expires_at_day_number: null,
          expires_at_night_number: null,
          source_event_id: null,
          metadata: {}
        }
      }
    };
  }

  if (command === 'apply-reminder') {
    const marker_id = args[0];
    const kind = args[1];
    const effect = args[2];
    const target_player_id = args[3] ?? null;
    const source_character_id = args[4] ?? null;
    const note = args.slice(5).join(' ').trim() || `${kind ?? 'marker'}:${effect ?? 'effect'}`;
    if (!marker_id || !kind || !effect) {
      return invalid('usage: apply-reminder <marker_id> <kind> <effect> [target_player_id] [source_character_id] [note...]');
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'ApplyReminderMarker',
        payload: {
          marker_id,
          kind,
          effect,
          note,
          source_player_id: null,
          source_character_id,
          target_player_id,
          target_scope: target_player_id ? 'player' : 'game',
          authoritative: true,
          expires_policy: 'manual',
          expires_at_day_number: null,
          expires_at_night_number: null,
          source_event_id: null,
          metadata: {}
        }
      }
    };
  }

  if (command === 'clear-marker') {
    const marker_id = args[0];
    const reason = args.slice(1).join(' ').trim() || 'manual_clear';
    if (!marker_id) {
      return invalid('usage: clear-marker <marker_id> [reason...]');
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'ClearReminderMarker',
        payload: {
          marker_id,
          reason
        }
      }
    };
  }

  if (command === 'clear-reminder') {
    const marker_id = args[0];
    const reason = args.slice(1).join(' ').trim() || 'manual_clear';
    if (!marker_id) {
      return invalid('usage: clear-reminder <marker_id> [reason...]');
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'ClearReminderMarker',
        payload: {
          marker_id,
          reason
        }
      }
    };
  }

  if (command === 'sweep-markers') {
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'SweepReminderExpiry',
        payload: {
          phase: state?.phase ?? 'setup',
          subphase: state?.subphase ?? 'idle',
          day_number: state?.day_number ?? 0,
          night_number: state?.night_number ?? 0
        }
      }
    };
  }

  if (command === 'sweep-reminders') {
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'SweepReminderExpiry',
        payload: {
          phase: state?.phase ?? 'setup',
          subphase: state?.subphase ?? 'idle',
          day_number: state?.day_number ?? 0,
          night_number: state?.night_number ?? 0
        }
      }
    };
  }

  return invalid(`unknown command: ${command}. run "help" for available commands.`);
}
