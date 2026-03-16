import type { GameState } from '../domain/types.js';
import {
  current_day_number,
  current_night_number,
  default_executed_player_id,
  default_opened_by_player_id,
  find_nomination,
  invalid,
  latest_nomination,
  next_nomination_id,
  parse_alignment,
  parse_death_reason,
  parse_int,
  parse_yes_no,
  type ParsedCliLine
} from './parser-common.js';
import { CLI_USAGE } from './command-registry.js';
import type { ParseCliOptions } from './command-parser.js';

function parse_next_scope(value: string): 'subphase' | 'phase' | 'day' | 'night' | null {
  if (value === 'subphase' || value === 'phase' || value === 'day' || value === 'night') {
    return value;
  }
  return null;
}

export function parse_day_domain_command(
  command: string,
  args: string[],
  state?: GameState,
  options?: ParseCliOptions
): ParsedCliLine | null {
  const script_mode = options?.script_mode ?? false;
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
    return invalid(`usage: ${CLI_USAGE.help}`);
  }

  if (command === 'next-phase' || command === 'next' || command === 'n') {
    let scope: 'subphase' | 'phase' | 'day' | 'night' = 'subphase';
    let auto_prompt = false;

    for (const token of args) {
      if (token === '--auto-prompt' || token === '--auto') {
        if (script_mode) {
          return invalid('script mode disallows random auto prompt resolution in next');
        }
        auto_prompt = true;
        continue;
      }
      const parsed_scope = parse_next_scope(token);
      if (parsed_scope && scope === 'subphase') {
        scope = parsed_scope;
        continue;
      }
      return invalid(`usage: ${CLI_USAGE.next}`);
    }

    return {
      ok: true,
      kind: 'local',
      action: {
        type: 'next_phase',
        scope,
        auto_prompt
      }
    };
  }

  if (command === 'state') {
    const format = args[0] === 'json' ? 'json' : 'brief';
    return { ok: true, kind: 'local', action: { type: 'state', format } };
  }

  if (command === 'events') {
    if (args.length === 0) {
      return { ok: true, kind: 'local', action: { type: 'events', count: 10 } };
    }
    const count = parse_int(args[0] ?? '');
    if (count === null) {
      return invalid(`usage: ${CLI_USAGE.events}`);
    }
    return { ok: true, kind: 'local', action: { type: 'events', count } };
  }

  if (command === 'players') {
    return { ok: true, kind: 'local', action: { type: 'players' } };
  }

  if (command === 'player') {
    const player_id = args[0];
    if (!player_id) {
      return invalid(`usage: ${CLI_USAGE.player}`);
    }
    return { ok: true, kind: 'local', action: { type: 'player', player_id } };
  }

  if (command === 'open-noms') {
    const day_number = args[0] === undefined ? current_day_number(state) : parse_int(args[0] ?? '');
    if (day_number === null) {
      return invalid(`usage: ${CLI_USAGE.open_noms}`);
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
      day_number = parse_int(args[1] ?? '');
      nominator_player_id = args[2];
      nominee_player_id = args[3];
    }

    if (!nomination_id || day_number === null || !nominator_player_id || !nominee_player_id) {
      return invalid(`usage: ${CLI_USAGE.nominate_short} | ${CLI_USAGE.nominate_with_id} | ${CLI_USAGE.nominate_full}`);
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
      return invalid(`usage: ${CLI_USAGE.open_vote}`);
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
        return invalid(`usage: ${CLI_USAGE.vote}`);
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
      return invalid(`usage: ${CLI_USAGE.vote}`);
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
      return invalid(`usage: ${CLI_USAGE.vote}`);
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

  if (command === 'claim-ability') {
    const claimant_player_id = args[0] ?? null;
    const claimed_character_id = args[1] ?? null;
    if (!claimant_player_id || !claimed_character_id) {
      return invalid(`usage: ${CLI_USAGE.claim_ability}`);
    }
    return {
      ok: true,
      kind: 'engine',
      command: {
        command_type: 'UseClaimedAbility',
        payload: {
          claimant_player_id,
          claimed_character_id
        }
      }
    };
  }

  if (command === 'close-vote') {
    const nomination_id = args[0] === undefined ? (state?.day_state.active_vote?.nomination_id ?? null) : (args[0] ?? null);
    const day_number = args[1] === undefined ? current_day_number(state) : parse_int(args[1] ?? '');
    if (!nomination_id || day_number === null) {
      return invalid(`usage: ${CLI_USAGE.close_vote}`);
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
    const day_number = args[0] === undefined ? current_day_number(state) : parse_int(args[0] ?? '');
    if (day_number === null) {
      return invalid(`usage: ${CLI_USAGE.resolve_exec}`);
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
    const day_number = args[0] === undefined ? current_day_number(state) : parse_int(args[0] ?? '');
    if (day_number === null) {
      return invalid(`usage: ${CLI_USAGE.resolve_conseq}`);
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
    const day_number = args[2] === undefined ? current_day_number(state) : parse_int(args[2] ?? '');
    const night_number = args[3] === undefined ? current_night_number(state) : parse_int(args[3] ?? '');
    if (!player_id || !reason || day_number === null || night_number === null) {
      return invalid(`usage: ${CLI_USAGE.apply_death}`);
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
    const day_number = args[1] === undefined ? current_day_number(state) : parse_int(args[1] ?? '');
    if (!player_id || day_number === null) {
      return invalid(`usage: ${CLI_USAGE.survive_exec}`);
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
    const day_number = args[0] === undefined ? current_day_number(state) : parse_int(args[0] ?? '');
    const night_number = args[1] === undefined ? current_night_number(state) : parse_int(args[1] ?? '');
    if (day_number === null || night_number === null) {
      return invalid(`usage: ${CLI_USAGE.check_win}`);
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
      return invalid(`usage: ${CLI_USAGE.force_win}`);
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
    const day_number = args[0] === undefined ? current_day_number(state) : parse_int(args[0] ?? '');
    if (day_number === null) {
      return invalid(`usage: ${CLI_USAGE.end_day}`);
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

  return null;
}
