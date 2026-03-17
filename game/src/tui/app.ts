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

export async function start_tui(initial_game_id = 'cli_game'): Promise<void> {
  const context = create_cli_context(initial_game_id);
  let state_mode: StateMode = 'brief';

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
    content: ' Clocktower TUI | F2 toggle state view | Ctrl+C quit '
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
    bottom: 3,
    label: ' State ',
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

  screen.key(['C-c'], () => {
    screen.destroy();
    process.exit(0);
  });

  screen.key(['f2'], () => {
    state_mode = state_mode === 'brief' ? 'json' : 'brief';
    refresh_state();
    status.setContent(
      ` Clocktower TUI | mode=${state_mode} | F2 toggle state view | Ctrl+C quit `
    );
    screen.render();
  });

  events.log('Clocktower Engine TUI');
  events.log('Type commands as in CLI, for example: help, state, start bmr 7');
  refresh_state();
  screen.render();

  input.focus();
  input.readInput();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const game_id = process.argv[2] ?? 'cli_game';
  start_tui(game_id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`fatal: ${message}\n`);
    process.exitCode = 1;
  });
}
