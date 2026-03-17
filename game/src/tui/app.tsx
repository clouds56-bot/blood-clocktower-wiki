import React, { useMemo, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';

import { format_state_brief, format_state_json } from '../cli/formatters.js';
import { create_cli_context, process_cli_line } from '../cli/repl.js';

type StateMode = 'brief' | 'json';
type InspectorMode = 'overview' | 'prompts' | 'players' | 'markers';

interface CommandResult {
  keep_running: boolean;
  output: string;
}

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

function format_overview_panel(context: ReturnType<typeof create_cli_context>): string[] {
  const state = context.state;
  const players = Object.values(state.players_by_id);
  const alive = players.filter((player) => player.alive).length;
  const dead = players.length - alive;
  const pending_prompts = state.pending_prompts.filter((prompt_key) => {
    const prompt = state.prompts_by_id[prompt_key];
    return Boolean(prompt && prompt.status === 'pending');
  }).length;
  const markers = state.active_reminder_marker_ids.length;

  const lines = [
    `phase=${state.phase}/${state.subphase}`,
    `day=${state.day_number} night=${state.night_number} status=${state.status}`,
    `players=${players.length} alive=${alive} dead=${dead}`,
    `pending_prompts=${pending_prompts} active_markers=${markers}`,
    `winning_team=${state.winning_team ?? 'none'} end_reason=${state.end_reason ?? 'none'}`
  ];

  if (state.day_state.active_vote) {
    lines.push(
      `active_vote=${state.day_state.active_vote.nomination_id} nominee=${state.day_state.active_vote.nominee_player_id}`
    );
  } else {
    lines.push('active_vote=none');
  }

  return lines;
}

function format_prompts_panel(context: ReturnType<typeof create_cli_context>): string[] {
  const pending = context.state.pending_prompts.filter((prompt_key) => {
    const prompt = context.state.prompts_by_id[prompt_key];
    return Boolean(prompt && prompt.status === 'pending');
  });
  const total = Object.keys(context.state.prompts_by_id).length;

  const lines = [`prompts total=${total} pending=${pending.length}`];
  for (const prompt_key of pending.slice(0, 10)) {
    const prompt = context.state.prompts_by_id[prompt_key];
    if (!prompt) {
      continue;
    }
    lines.push(`- ${prompt.prompt_key} kind=${prompt.kind} vis=${prompt.visibility}`);
  }
  if (pending.length === 0) {
    lines.push('(no pending prompts)');
  }

  return lines;
}

function format_players_panel(context: ReturnType<typeof create_cli_context>): string[] {
  const player_ids: string[] = [...context.state.seat_order];
  for (const player_id of Object.keys(context.state.players_by_id).sort()) {
    if (!player_ids.includes(player_id)) {
      player_ids.push(player_id);
    }
  }

  const lines = [`players total=${player_ids.length}`];
  for (const player_id of player_ids.slice(0, 16)) {
    const player = context.state.players_by_id[player_id];
    if (!player) {
      continue;
    }
    lines.push(
      `- ${player.player_id} ${player.display_name} ${player.alive ? 'alive' : 'dead'} vote=${player.dead_vote_available}`
    );
  }

  return lines;
}

function format_markers_panel(context: ReturnType<typeof create_cli_context>): string[] {
  const marker_ids = context.state.active_reminder_marker_ids;
  const lines = [`markers active=${marker_ids.length}`];
  for (const marker_id of marker_ids.slice(0, 12)) {
    const marker = context.state.reminder_markers_by_id[marker_id];
    if (!marker) {
      continue;
    }
    lines.push(
      `- ${marker.marker_id} ${marker.kind} effect=${marker.effect} target=${marker.target_player_id ?? '-'}`
    );
  }
  if (marker_ids.length === 0) {
    lines.push('(no active markers)');
  }

  return lines;
}

function next_inspector_mode(mode: InspectorMode): InspectorMode {
  if (mode === 'overview') {
    return 'prompts';
  }
  if (mode === 'prompts') {
    return 'players';
  }
  if (mode === 'players') {
    return 'markers';
  }
  return 'overview';
}

function render_panel_lines(lines: string[]): React.ReactNode {
  return lines.map((line, index) => <Text key={`${index}:${line}`}>{line}</Text>);
}

function App({ initial_game_id }: { initial_game_id: string }): React.ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const columns = stdout.columns ?? 120;
  const rows = stdout.rows ?? 40;
  const context = useMemo(() => create_cli_context(initial_game_id), [initial_game_id]);

  const [input, set_input] = useState('');
  const [logs, set_logs] = useState<string[]>([
    'Clocktower Engine TUI (Ink)',
    'Type commands and press Enter. F2 toggles state mode. F3 cycles inspector.'
  ]);
  const [history, set_history] = useState<string[]>([]);
  const [history_cursor, set_history_cursor] = useState<number | null>(null);
  const [state_mode, set_state_mode] = useState<StateMode>('brief');
  const [inspector_mode, set_inspector_mode] = useState<InspectorMode>('overview');
  const [, set_tick] = useState(0);

  function append_log_lines(lines: string[]): void {
    if (lines.length === 0) {
      return;
    }
    set_logs((previous) => {
      const merged = [...previous, ...lines];
      return merged.slice(Math.max(0, merged.length - 120));
    });
  }

  function run_command(command: string): CommandResult {
    append_log_lines([`> ${command}`]);
    const captured = capture_stdout(() => process_cli_line(context, command));
    const output_lines = captured.output
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);
    append_log_lines(output_lines);
    set_tick((value) => value + 1);
    return {
      keep_running: captured.value,
      output: captured.output
    };
  }

  useInput((input_key, key) => {
    if (key.ctrl && input_key === 'c') {
      exit();
      return;
    }

    if (key.return) {
      const command = input.trim();
      if (command.length === 0) {
        return;
      }

      set_history((previous) => [...previous, command]);
      set_history_cursor(null);
      set_input('');

      const result = run_command(command);
      if (!result.keep_running) {
        exit();
      }
      return;
    }

    if (key.ctrl && input_key === 's') {
      set_state_mode((mode) => (mode === 'brief' ? 'json' : 'brief'));
      return;
    }

    if (key.ctrl && input_key === 'g') {
      set_inspector_mode((mode) => next_inspector_mode(mode));
      return;
    }

    if (key.upArrow) {
      if (history.length === 0) {
        return;
      }
      set_history_cursor((cursor) => {
        const next = cursor === null ? history.length - 1 : Math.max(0, cursor - 1);
        set_input(history[next] ?? '');
        return next;
      });
      return;
    }

    if (key.downArrow) {
      if (history.length === 0) {
        return;
      }
      set_history_cursor((cursor) => {
        if (cursor === null) {
          return null;
        }
        const next = cursor + 1;
        if (next >= history.length) {
          set_input('');
          return null;
        }
        set_input(history[next] ?? '');
        return next;
      });
      return;
    }

    if (key.backspace || key.delete) {
      set_input((value) => value.slice(0, -1));
      return;
    }

    if (key.tab) {
      return;
    }

    if (!key.ctrl && !key.meta && input_key.length > 0) {
      set_input((value) => `${value}${input_key}`);
    }
  });

  const state_text = state_mode === 'json' ? format_state_json(context.state) : format_state_brief(context.state);
  const available_rows = Math.max(24, rows);
  const header_height = 3;
  const input_height = 3;
  const main_height = Math.max(10, available_rows - header_height - input_height);
  const state_height = Math.max(6, Math.floor(main_height * 0.58));
  const inspector_height = Math.max(4, main_height - state_height);
  const content_rows = Math.max(1, main_height - 2);
  const state_content_rows = Math.max(1, state_height - 2);
  const inspector_content_rows = Math.max(1, inspector_height - 2);

  const state_lines = state_text.split('\n').slice(0, state_content_rows);

  const inspector_lines =
    inspector_mode === 'overview'
      ? format_overview_panel(context)
      : inspector_mode === 'prompts'
        ? format_prompts_panel(context)
        : inspector_mode === 'players'
          ? format_players_panel(context)
          : format_markers_panel(context);

  const recent_logs = logs.slice(Math.max(0, logs.length - content_rows));
  const players_total = Object.keys(context.state.players_by_id).length;
  const alive_count = Object.values(context.state.players_by_id).filter((player) => player.alive).length;
  const prompt_count = context.state.pending_prompts.filter((prompt_key) => {
    const prompt = context.state.prompts_by_id[prompt_key];
    return Boolean(prompt && prompt.status === 'pending');
  }).length;

  return (
    <Box flexDirection="column" width={columns} height={available_rows}>
      <Box borderStyle="single" paddingX={1} height={header_height}>
        <Text>
          phase={context.state.phase}/{context.state.subphase} day={context.state.day_number} night={context.state.night_number} alive={alive_count}/{players_total} prompts={prompt_count} | Ctrl+S state={state_mode} | Ctrl+G inspector={inspector_mode} | Ctrl+C quit
        </Text>
      </Box>

      <Box height={main_height}>
        <Box width="50%" borderStyle="single" flexDirection="column" paddingX={1}>
          <Text color="cyan">Events</Text>
          {render_panel_lines(recent_logs)}
        </Box>

        <Box width="50%" flexDirection="column">
          <Box borderStyle="single" flexDirection="column" height={state_height} paddingX={1}>
            <Text color="cyan">State ({state_mode})</Text>
            {render_panel_lines(state_lines)}
          </Box>

          <Box borderStyle="single" flexDirection="column" height={inspector_height} paddingX={1}>
            <Text color="cyan">Inspector ({inspector_mode})</Text>
            {render_panel_lines(inspector_lines.slice(0, inspector_content_rows))}
          </Box>
        </Box>
      </Box>

      <Box borderStyle="single" paddingX={1} height={input_height}>
        <Text color="green">Command&gt; </Text>
        <Text>{input}</Text>
      </Box>
    </Box>
  );
}

export async function start_tui(initial_game_id = 'cli_game'): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error('tui requires an interactive TTY session');
  }
  const { render } = await import('ink');
  render(<App initial_game_id={initial_game_id} />);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const game_id = process.argv[2] ?? 'cli_game';
  start_tui(game_id).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`fatal: ${message}\n`);
    process.exitCode = 1;
  });
}
