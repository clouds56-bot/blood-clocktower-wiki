import blessed from 'blessed';

import { format_state_brief, format_state_json } from '../cli/formatters.js';
import { create_cli_context, process_cli_line } from '../cli/repl.js';

type StateMode = 'brief' | 'json';

function capture_stdout<T>(run: () => T): { value: T; output: string } {
  let output = '';
  const original_write = process.stdout.write.bind(process.stdout);

  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stdout.write;

  try {
    return {
      value: run(),
      output
    };
  } finally {
    process.stdout.write = original_write;
  }
}

function format_state_for_mode(mode: StateMode, state: Parameters<typeof format_state_brief>[0]): string {
  return mode === 'json' ? format_state_json(state) : format_state_brief(state);
}

type InspectorMode = 'prompts' | 'players';

function format_prompts_panel(context: ReturnType<typeof create_cli_context>): string {
  const pending = context.state.pending_prompts.filter((prompt_key) => {
    const prompt = context.state.prompts_by_id[prompt_key];
    return Boolean(prompt && prompt.status === 'pending');
  });
  const total = Object.keys(context.state.prompts_by_id).length;

  if (total === 0) {
    return 'prompts total=0 pending=0\n(no prompts)';
  }

  const lines = [`prompts total=${total} pending=${pending.length}`];
  if (pending.length === 0) {
    lines.push('(no pending prompts)');
    return lines.join('\n');
  }

  for (const prompt_key of pending.slice(0, 12)) {
    const prompt = context.state.prompts_by_id[prompt_key];
    if (!prompt) {
      continue;
    }
    lines.push(`- ${prompt.prompt_key} kind=${prompt.kind} vis=${prompt.visibility}`);
  }
  if (pending.length > 12) {
    lines.push(`... and ${pending.length - 12} more`);
  }
  return lines.join('\n');
}

function format_players_panel(context: ReturnType<typeof create_cli_context>): string {
  const player_ids: string[] = [...context.state.seat_order];
  for (const player_id of Object.keys(context.state.players_by_id).sort()) {
    if (!player_ids.includes(player_id)) {
      player_ids.push(player_id);
    }
  }

  if (player_ids.length === 0) {
    return 'players total=0\n(no players)';
  }

  const lines = [`players total=${player_ids.length}`];
  for (const player_id of player_ids) {
    const player = context.state.players_by_id[player_id];
    if (!player) {
      continue;
    }
    const life = player.alive ? 'alive' : 'dead';
    lines.push(
      `- ${player.player_id} ${player.display_name} ${life} dead_vote=${player.dead_vote_available}`
    );
  }

  return lines.join('\n');
}

export async function start_tui(initial_game_id = 'cli_game'): Promise<void> {
  const context = create_cli_context(initial_game_id);
  let state_mode: StateMode = 'brief';
  let inspector_mode: InspectorMode = 'prompts';
  const history: string[] = [];
  let history_cursor: number | null = null;

  const screen = blessed.screen({
    smartCSR: true,
    title: 'Clocktower Engine TUI'
  });

  const status = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    style: { fg: 'black', bg: 'cyan' },
    content:
      ' Clocktower TUI | F2 state mode | F3 inspector | Tab focus | Up/Down history | Ctrl+C quit '
  });

  const events = blessed.log({
    parent: screen,
    top: 1,
    left: 0,
    width: '50%',
    bottom: 3,
    label: ' Events ',
    border: 'line',
    tags: false,
    keys: true,
    vi: true,
    scrollback: 4000,
    alwaysScroll: true,
    scrollbar: { ch: ' ' }
  });

  const state = blessed.box({
    parent: screen,
    top: 1,
    left: '50%',
    width: '50%',
    height: '58%',
    label: ' State ',
    border: 'line',
    tags: false,
    keys: true,
    vi: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: ' ' }
  });

  const inspector = blessed.box({
    parent: screen,
    top: '59%',
    left: '50%',
    width: '50%',
    bottom: 3,
    label: ' Inspector ',
    border: 'line',
    tags: false,
    keys: true,
    vi: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: ' ' }
  });

  const input = blessed.textbox({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 3,
    border: 'line',
    label: ' Command ',
    inputOnFocus: true,
    keys: true,
    mouse: true,
    style: {
      focus: { border: { fg: 'cyan' } }
    }
  });

  function refresh_state(): void {
    state.setContent(format_state_for_mode(state_mode, context.state));
    state.setScrollPerc(0);
    const mode_label = state_mode === 'json' ? 'State (json)' : 'State (brief)';
    state.setLabel(` ${mode_label} `);

    if (inspector_mode === 'prompts') {
      inspector.setContent(format_prompts_panel(context));
      inspector.setLabel(' Inspector (prompts) ');
    } else {
      inspector.setContent(format_players_panel(context));
      inspector.setLabel(' Inspector (players) ');
    }
    inspector.setScrollPerc(0);
  }

  function push_output(output: string): void {
    const trimmed = output.trimEnd();
    if (trimmed.length === 0) {
      return;
    }
    for (const line of trimmed.split('\n')) {
      events.log(line);
    }
  }

  function run_command(line: string): void {
    const command = line.trim();
    if (command.length === 0) {
      return;
    }

    history.push(command);
    history_cursor = null;

    events.log(`> ${command}`);
    const captured = capture_stdout(() => process_cli_line(context, command));
    push_output(captured.output);
    refresh_state();

    if (!captured.value) {
      screen.destroy();
      process.exit(0);
    }
  }

  input.on('submit', (value: string) => {
    run_command(value);
    input.clearValue();
    screen.render();
    input.focus();
    input.readInput();
  });

  function set_input_value(next_value: string): void {
    input.setValue(next_value);
    input.focus();
    screen.render();
  }

  function browse_history(direction: -1 | 1): void {
    if (history.length === 0 || screen.focused !== input) {
      return;
    }

    if (history_cursor === null) {
      history_cursor = direction < 0 ? history.length - 1 : history.length;
    } else {
      history_cursor += direction;
    }

    if (history_cursor < 0) {
      history_cursor = 0;
    }

    if (history_cursor >= history.length) {
      history_cursor = history.length;
      set_input_value('');
      return;
    }

    const value = history[history_cursor] ?? '';
    set_input_value(value);
  }

  screen.key(['C-c'], () => {
    screen.destroy();
    process.exit(0);
  });

  screen.key(['f2'], () => {
    state_mode = state_mode === 'brief' ? 'json' : 'brief';
    refresh_state();
    status.setContent(
      ` Clocktower TUI | state=${state_mode} inspector=${inspector_mode} | F2 state | F3 inspector | Tab focus | Up/Down history | Ctrl+C quit `
    );
    screen.render();
  });

  screen.key(['f3'], () => {
    inspector_mode = inspector_mode === 'prompts' ? 'players' : 'prompts';
    refresh_state();
    status.setContent(
      ` Clocktower TUI | state=${state_mode} inspector=${inspector_mode} | F2 state | F3 inspector | Tab focus | Up/Down history | Ctrl+C quit `
    );
    screen.render();
  });

  screen.key(['up'], () => browse_history(-1));
  screen.key(['down'], () => browse_history(1));

  const focusable: blessed.Widgets.BlessedElement[] = [events, state, inspector, input];
  let focus_index = focusable.length - 1;

  function focus_at(index: number): void {
    const wrapped = (index + focusable.length) % focusable.length;
    focus_index = wrapped;
    const target = focusable[focus_index];
    target?.focus();
    if (target === input) {
      input.readInput();
    }
    screen.render();
  }

  screen.key(['tab'], () => focus_at(focus_index + 1));
  screen.key(['S-tab'], () => focus_at(focus_index - 1));

  events.log('Clocktower Engine TUI');
  events.log('Type commands as in CLI, for example: help, state, start bmr 7');
  refresh_state();
  screen.render();

  focus_at(focusable.length - 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const game_id = process.argv[2] ?? 'cli_game';
  start_tui(game_id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`fatal: ${message}\n`);
    process.exitCode = 1;
  });
}
