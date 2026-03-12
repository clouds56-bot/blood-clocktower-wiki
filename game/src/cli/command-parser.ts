import type { Command } from '../domain/commands.js';
import type { Alignment, GamePhase, GameSubphase } from '../domain/types.js';

export type CliLocalAction =
  | { type: 'help'; topic?: 'phase' | 'all' }
  | { type: 'state'; format: 'brief' | 'json' }
  | { type: 'events'; count: number }
  | { type: 'players' }
  | { type: 'player'; player_id: string }
  | { type: 'new_game'; game_id: string }
  | { type: 'quit' };

export type ParsedCliLine =
  | { ok: true; kind: 'empty' }
  | { ok: true; kind: 'local'; action: CliLocalAction }
  | { ok: true; kind: 'engine'; command: Omit<Command, 'command_id'> }
  | { ok: false; message: string };

type DeathReason = 'execution' | 'night_death' | 'ability' | 'storyteller';

function parse_int(value: string, field: string): number | null {
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

function invalid(message: string): ParsedCliLine {
  return {
    ok: false,
    message
  };
}

export function parse_cli_line(input: string): ParsedCliLine {
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
  if (command === 'new') {
    const game_id = args[0];
    if (!game_id) {
      return invalid('usage: new <game_id>');
    }
    return { ok: true, kind: 'local', action: { type: 'new_game', game_id } };
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
    const day_number = parse_int(args[0] ?? '', 'day_number');
    if (day_number === null) {
      return invalid('usage: open-noms <day_number>');
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

  if (command === 'nominate') {
    const nomination_id = args[0];
    const day_number = parse_int(args[1] ?? '', 'day_number');
    const nominator_player_id = args[2];
    const nominee_player_id = args[3];
    if (!nomination_id || day_number === null || !nominator_player_id || !nominee_player_id) {
      return invalid('usage: nominate <nomination_id> <day_number> <nominator_id> <nominee_id>');
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
    const nomination_id = args[0];
    const nominee_player_id = args[1];
    const opened_by_player_id = args[2];
    if (!nomination_id || !nominee_player_id || !opened_by_player_id) {
      return invalid('usage: open-vote <nomination_id> <nominee_id> <opened_by_id>');
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
    const nomination_id = args[0];
    const voter_player_id = args[1];
    const in_favor = parse_yes_no(args[2] ?? '');
    if (!nomination_id || !voter_player_id || in_favor === null) {
      return invalid('usage: vote <nomination_id> <voter_id> <yes|no>');
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'CastVote',
        payload: {
          nomination_id,
          voter_player_id,
          in_favor
        }
      }
    };
  }

  if (command === 'close-vote') {
    const nomination_id = args[0];
    const day_number = parse_int(args[1] ?? '', 'day_number');
    if (!nomination_id || day_number === null) {
      return invalid('usage: close-vote <nomination_id> <day_number>');
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
    const day_number = parse_int(args[0] ?? '', 'day_number');
    if (day_number === null) {
      return invalid('usage: resolve-exec <day_number>');
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
    const day_number = parse_int(args[0] ?? '', 'day_number');
    if (day_number === null) {
      return invalid('usage: resolve-conseq <day_number>');
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
    const day_number = parse_int(args[2] ?? '', 'day_number');
    const night_number = parse_int(args[3] ?? '', 'night_number');
    if (!player_id || !reason || day_number === null || night_number === null) {
      return invalid(
        'usage: apply-death <player_id> <execution|night_death|ability|storyteller> <day_number> <night_number>'
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
    const player_id = args[0];
    const day_number = parse_int(args[1] ?? '', 'day_number');
    if (!player_id || day_number === null) {
      return invalid('usage: survive-exec <player_id> <day_number>');
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
    const day_number = parse_int(args[0] ?? '', 'day_number');
    const night_number = parse_int(args[1] ?? '', 'night_number');
    if (day_number === null || night_number === null) {
      return invalid('usage: check-win <day_number> <night_number>');
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
    const rationale = args.slice(1).join(' ').trim();
    if (!winning_team || rationale.length === 0) {
      return invalid('usage: force-win <good|evil> <rationale...>');
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

  if (command === 'end-day') {
    const day_number = parse_int(args[0] ?? '', 'day_number');
    if (day_number === null) {
      return invalid('usage: end-day <day_number>');
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

  return invalid(`unknown command: ${command}. run "help" for available commands.`);
}
