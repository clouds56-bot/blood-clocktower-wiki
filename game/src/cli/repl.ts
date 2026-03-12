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

function now_iso(): string {
  return new Date().toISOString();
}

function make_command_id(context: CliContext): string {
  const id = `cli-${String(context.next_command_index).padStart(6, '0')}`;
  context.next_command_index += 1;
  return id;
}

function run_engine_command(context: CliContext, command: Omit<Command, 'command_id'>): void {
  const full_command: Command = {
    ...command,
    command_id: make_command_id(context),
    actor_id: 'cli'
  } as Command;

  const result = handle_command(context.state, full_command, now_iso());
  if (!result.ok) {
    process.stdout.write(`engine_error code=${result.error.code} message=${result.error.message}\n`);
    return;
  }

  const events = result.value;
  context.state = apply_events(context.state, events);
  context.event_log.push(...events);

  if (events.length === 0) {
    process.stdout.write('ok (no events)\n');
    return;
  }

  process.stdout.write(`ok emitted=${events.length}\n`);
  const start_index = context.event_log.length - events.length + 1;
  events.forEach((event, event_index) => {
    process.stdout.write(`${format_event(event, start_index + event_index)}\n`);
  });
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

  return true;
}

export async function start_cli_repl(initial_game_id = 'cli_game'): Promise<void> {
  const context: CliContext = {
    state: create_initial_state(initial_game_id),
    event_log: [],
    next_command_index: 1
  };

  process.stdout.write('Clocktower Engine CLI (Phase 3.1)\n');
  process.stdout.write('type "help" for commands\n');
  process.stdout.write(`${format_state_brief(context.state)}\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'clocktower> '
  });

  rl.prompt();

  rl.on('line', (line) => {
    const parsed = parse_cli_line(line);
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
