import readline from 'node:readline';

import type { Command } from '../domain/commands.js';
import type { DomainEvent } from '../domain/events.js';
import { apply_events } from '../domain/reducer.js';
import { create_initial_state } from '../domain/state.js';
import type { GameState } from '../domain/types.js';
import { handle_command } from '../engine/command-handler.js';
import { parse_cli_line, type CliLocalAction } from './command-parser.js';
import {
  format_event,
  format_help,
  format_player,
  format_players_table,
  format_state_brief,
  format_state_json
} from './formatters.js';

interface CliContext {
  state: GameState;
  event_log: DomainEvent[];
  next_command_index: number;
}

const ANSI = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m'
} as const;

function color_enabled(): boolean {
  if (process.env.NO_COLOR) {
    return false;
  }
  return Boolean(process.stdout.isTTY);
}

function paint(text: string, color: keyof typeof ANSI): string {
  if (!color_enabled() || color === 'reset') {
    return text;
  }
  return `${ANSI[color]}${text}${ANSI.reset}`;
}

function now_iso(): string {
  return new Date().toISOString();
}

function make_command_id(context: CliContext): string {
  const id = `cli-${String(context.next_command_index).padStart(6, '0')}`;
  context.next_command_index += 1;
  return id;
}

function normalize_script(script: string): string {
  return script.trim().toLowerCase();
}

function resolve_edition_id(script: string): string {
  if (script === 'tb' || script === 'trouble_brewing') {
    return 'trouble_brewing';
  }
  if (script === 'bmr' || script === 'bad_moon_rising') {
    return 'bad_moon_rising';
  }
  if (script === 'snv' || script === 'sects_and_violets') {
    return 'sects_and_violets';
  }
  return script;
}

function build_player_ids(player_num: number): string[] {
  const ids: string[] = [];
  for (let i = 1; i <= player_num; i += 1) {
    ids.push(`p${i}`);
  }
  return ids;
}

function run_quick_setup(context: CliContext, script_input: string, player_num: number, game_id?: string): void {
  const script_id = normalize_script(script_input);
  const edition_id = resolve_edition_id(script_id);
  const player_ids = build_player_ids(player_num);
  const resolved_game_id = game_id ?? `${script_id}_${player_num}`;

  context.state = create_initial_state(resolved_game_id);
  context.event_log = [];

  const seed_commands: Array<Omit<Command, 'command_id'>> = [
    {
      command_type: 'SelectScript',
      payload: {
        script_id
      }
    },
    {
      command_type: 'SelectEdition',
      payload: {
        edition_id
      }
    }
  ];

  for (let i = 0; i < player_ids.length; i += 1) {
    const player_id = player_ids[i] as string;
    seed_commands.push({
      command_type: 'AddPlayer',
      payload: {
        player_id,
        display_name: `Player ${i + 1}`
      }
    });
  }

  seed_commands.push({
    command_type: 'SetSeatOrder',
    payload: {
      seat_order: player_ids
    }
  });

  seed_commands.push({
    command_type: 'AdvancePhase',
    payload: {
      phase: 'first_night',
      subphase: 'night_wake_sequence',
      day_number: 0,
      night_number: 1
    }
  });

  for (const command of seed_commands) {
    const full_command: Command = {
      ...command,
      command_id: make_command_id(context),
      actor_id: 'cli'
    } as Command;
    const result = handle_command(context.state, full_command, now_iso());
    if (!result.ok) {
      process.stdout.write(
        `${paint('quick_setup_error', 'red')} code=${result.error.code} message=${result.error.message} command=${command.command_type}\n`
      );
      return;
    }
    context.state = apply_events(context.state, result.value);
    context.event_log.push(...result.value);
  }

  process.stdout.write(
    `quick setup complete: script=${script_id} players=${player_num} game=${resolved_game_id}\n`
  );
  process.stdout.write(`${format_state_brief(context.state)}\n`);
}

function run_engine_command(context: CliContext, command: Omit<Command, 'command_id'>): void {
  const full_command: Command = {
    ...command,
    command_id: make_command_id(context),
    actor_id: 'cli'
  } as Command;

  const result = handle_command(context.state, full_command, now_iso());
  if (!result.ok) {
    process.stdout.write(
      `${paint('engine_error', 'red')} code=${result.error.code} message=${result.error.message}\n`
    );
    return;
  }

  const events = result.value;
  context.state = apply_events(context.state, events);
  context.event_log.push(...events);

  if (events.length === 0) {
    process.stdout.write(`${paint('ok', 'green')} (no events)\n`);
    return;
  }

  process.stdout.write(`${paint('ok', 'green')} emitted=${events.length}\n`);
  const start_index = context.event_log.length - events.length + 1;
  events.forEach((event, event_index) => {
    process.stdout.write(`${format_event(event, start_index + event_index)}\n`);
  });
}

function run_next_phase(context: CliContext): void {
  const { phase, subphase, day_number, night_number } = context.state;

  function advance_to(next_subphase: GameState['subphase']): void {
    run_engine_command(context, {
      command_type: 'AdvancePhase',
      payload: {
        phase,
        subphase: next_subphase,
        day_number,
        night_number
      }
    });
  }

  function advance_to_phase(
    next_phase: GameState['phase'],
    next_subphase: GameState['subphase'],
    next_day_number: number,
    next_night_number: number
  ): void {
    run_engine_command(context, {
      command_type: 'AdvancePhase',
      payload: {
        phase: next_phase,
        subphase: next_subphase,
        day_number: next_day_number,
        night_number: next_night_number
      }
    });
  }

  function step_subphase(sequence: GameState['subphase'][]): boolean {
    const index = sequence.indexOf(subphase);
    if (index === -1) {
      return false;
    }
    const next_index = index + 1;
    if (next_index >= sequence.length) {
      return false;
    }
    const next_subphase = sequence[next_index];
    if (!next_subphase) {
      return false;
    }
    advance_to(next_subphase);
    return true;
  }

  if (phase === 'ended') {
    process.stdout.write('next-phase not allowed: game already ended\n');
    return;
  }

  if (phase === 'setup') {
    advance_to_phase('first_night', 'dusk', day_number, Math.max(1, night_number));
    return;
  }

  if (phase === 'first_night') {
    const ok = step_subphase([
      'dusk',
      'night_wake_sequence',
      'immediate_interrupt_resolution',
      'dawn'
    ]);
    if (!ok) {
      advance_to_phase('day', 'open_discussion', day_number + 1, night_number);
    }
    return;
  }

  if (phase === 'day') {
    if (subphase === 'open_discussion') {
      run_engine_command(context, {
        command_type: 'OpenNominationWindow',
        payload: {
          day_number
        }
      });
      return;
    }

    const ok = step_subphase([
      'nomination_window',
      'vote_in_progress',
      'execution_resolution',
      'day_end'
    ]);
    if (!ok) {
      advance_to_phase('night', 'dusk', day_number, night_number + 1);
    }
    return;
  }

  const ok = step_subphase([
    'dusk',
    'night_wake_sequence',
    'immediate_interrupt_resolution',
    'dawn'
  ]);
  if (!ok) {
    advance_to_phase('day', 'open_discussion', day_number + 1, night_number);
  }
}

function handle_local_action(context: CliContext, action: CliLocalAction): boolean {
  if (action.type === 'quit') {
    process.stdout.write('bye\n');
    return false;
  }

  if (action.type === 'help') {
    process.stdout.write(`${format_help(action.topic ?? 'all')}\n`);
    return true;
  }

  if (action.type === 'next_phase') {
    run_next_phase(context);
    return true;
  }

  if (action.type === 'state') {
    if (action.format === 'json') {
      process.stdout.write(`${format_state_json(context.state)}\n`);
    } else {
      process.stdout.write(`${format_state_brief(context.state)}\n`);
    }
    return true;
  }

  if (action.type === 'events') {
    if (context.event_log.length === 0) {
      process.stdout.write('no events\n');
      return true;
    }
    const count = Math.max(0, action.count);
    const start = Math.max(0, context.event_log.length - count);
    context.event_log.slice(start).forEach((event, index) => {
      process.stdout.write(`${format_event(event, start + index + 1)}\n`);
    });
    return true;
  }

  if (action.type === 'players') {
    process.stdout.write(`${format_players_table(context.state)}\n`);
    return true;
  }

  if (action.type === 'player') {
    const player = context.state.players_by_id[action.player_id];
    if (!player) {
      process.stdout.write(`player not found: ${action.player_id}\n`);
      return true;
    }
    process.stdout.write(`${format_player(player)}\n`);
    return true;
  }

  if (action.type === 'new_game') {
    context.state = create_initial_state(action.game_id);
    context.event_log = [];
    process.stdout.write(`created game ${action.game_id}\n`);
    process.stdout.write(`${format_state_brief(context.state)}\n`);
    return true;
  }

  if (action.type === 'quick_setup') {
    run_quick_setup(context, action.script, action.player_num, action.game_id);
    return true;
  }

  return true;
}

export async function start_cli_repl(initial_game_id = 'cli_game'): Promise<void> {
  const context: CliContext = {
    state: create_initial_state(initial_game_id),
    event_log: [],
    next_command_index: 1
  };

  process.stdout.write('Clocktower Engine CLI (Phase 3.1)\n');
  process.stdout.write(`${paint('type "help" for commands', 'yellow')}\n`);
  process.stdout.write(`${format_state_brief(context.state)}\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'clocktower> '
  });

  rl.prompt();

  rl.on('line', (line) => {
    const parsed = parse_cli_line(line, context.state);
    if (!parsed.ok) {
      process.stdout.write(`${parsed.message}\n`);
      rl.prompt();
      return;
    }

    if (parsed.kind === 'empty') {
      rl.prompt();
      return;
    }

    if (parsed.kind === 'local') {
      const keep_running = handle_local_action(context, parsed.action);
      if (!keep_running) {
        rl.close();
        return;
      }
      rl.prompt();
      return;
    }

    run_engine_command(context, parsed.command);
    rl.prompt();
  });

  await new Promise<void>((resolve) => {
    rl.on('close', () => {
      resolve();
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const game_id = process.argv[2] ?? 'cli_game';
  start_cli_repl(game_id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`fatal: ${message}\n`);
    process.exitCode = 1;
  });
}
