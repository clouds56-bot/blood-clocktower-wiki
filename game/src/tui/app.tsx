import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';

import { CliChannelBus } from '../cli/channels.js';
import { format_state_brief, format_state_json } from '../cli/formatters.js';
import { create_cli_context, process_cli_line } from '../cli/repl.js';
import type { DomainEvent } from '../domain/events.js';
import type { GameState, PromptColumnSpec, PromptRangeSpec, PromptState } from '../domain/types.js';

type StateMode = 'brief' | 'json';
type InspectorMode = 'overview' | 'prompts' | 'players' | 'markers' | 'output';

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
  if (mode === 'markers') {
    return 'output';
  }
  return 'overview';
}

function pending_prompts(context: ReturnType<typeof create_cli_context>): PromptState[] {
  return context.state.pending_prompts
    .map((prompt_key) => context.state.prompts_by_id[prompt_key])
    .filter((prompt): prompt is PromptState => Boolean(prompt && prompt.status === 'pending'));
}

function is_range_column(column: PromptColumnSpec): column is PromptRangeSpec {
  return !Array.isArray(column);
}

function column_values(column: PromptColumnSpec): string[] {
  if (Array.isArray(column)) {
    return column;
  }

  const min = Math.ceil(column.min);
  const max_raw = (column.max_inclusive ?? true)
    ? Math.floor(column.max)
    : Math.ceil(column.max) - 1;
  if (max_raw < min) {
    return [];
  }

  const max_count = 30;
  const values: string[] = [];
  for (let value = min; value <= max_raw && values.length < max_count; value += 1) {
    values.push(String(value));
  }
  return values;
}

function render_panel_lines(lines: string[]): React.ReactNode {
  return lines.map((line, index) => <Text key={`${index}:${line}`}>{line}</Text>);
}

function fit_line(text: string, width: number): string {
  if (width <= 0) {
    return '';
  }
  const clipped = text.length > width ? text.slice(0, width) : text;
  return clipped.padEnd(width, ' ');
}

function strip_ansi(text: string): string {
  return text.replace(/\x1B\[[0-9;]*m/g, '');
}

function format_event_for_tui(event: DomainEvent, event_index?: number): string {
  const prefix = event_index ? `#${event_index} ` : '';
  return `${prefix}${event.event_type} ${JSON.stringify(event.payload)}`;
}

function App({ initial_game_id }: { initial_game_id: string }): React.ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const columns = stdout.columns ?? 120;
  const rows = stdout.rows ?? 40;
  const channel_bus = useMemo(() => new CliChannelBus(), []);
  const context = useMemo(
    () => create_cli_context(initial_game_id, { channel_bus }),
    [initial_game_id, channel_bus]
  );

  const [input, set_input] = useState('');
  const [stream_lines, set_stream_lines] = useState<string[]>([
    'Clocktower Engine TUI (Ink)',
    'Type commands and press Enter. Ctrl+R opens resolve prompt picker.'
  ]);
  const [output_lines, set_output_lines] = useState<string[]>([]);
  const [latest_state_snapshot, set_latest_state_snapshot] = useState<GameState | null>(null);
  const [history, set_history] = useState<string[]>([]);
  const [history_cursor, set_history_cursor] = useState<number | null>(null);
  const [state_mode, set_state_mode] = useState<StateMode>('brief');
  const [inspector_mode, set_inspector_mode] = useState<InspectorMode>('overview');
  const [resolver_open, set_resolver_open] = useState(false);
  const [resolver_step, set_resolver_step] = useState<'prompt' | 'option' | 'multi_column'>('prompt');
  const [resolver_prompt_index, set_resolver_prompt_index] = useState(0);
  const [resolver_option_index, set_resolver_option_index] = useState(0);
  const [resolver_option_values, set_resolver_option_values] = useState<string[]>([]);
  const [resolver_option_labels, set_resolver_option_labels] = useState<string[]>([]);
  const [resolver_prompt_key, set_resolver_prompt_key] = useState<string | null>(null);
  const [resolver_multi_values, set_resolver_multi_values] = useState<string[]>([]);
  const [resolver_multi_column_index, set_resolver_multi_column_index] = useState(0);
  const [, set_tick] = useState(0);

  function append_log_lines(lines: string[]): void {
    if (lines.length === 0) {
      return;
    }
    set_stream_lines((previous) => {
      const merged = [...previous, ...lines];
      return merged.slice(Math.max(0, merged.length - 120));
    });
  }

  function append_output_lines(lines: string[]): void {
    if (lines.length === 0) {
      return;
    }
    set_output_lines((previous) => {
      const merged = [...previous, ...lines];
      return merged.slice(Math.max(0, merged.length - 200));
    });
  }

  function run_command(command: string): boolean {
    append_log_lines([`> ${command}`]);
    const keep_running = process_cli_line(context, command);
    set_tick((value) => value + 1);
    return keep_running;
  }

  useEffect(() => {
    const unsubscribe = channel_bus.subscribe('*', (message) => {
      const clean = strip_ansi(message.text);

      if (message.channel === 'state') {
        if (message.state_snapshot) {
          set_latest_state_snapshot(message.state_snapshot);
        }
        return;
      }

      if (message.channel === 'event' && message.event) {
        append_log_lines([format_event_for_tui(message.event, message.event_index)]);
        return;
      }

      if (message.channel === 'output') {
        append_output_lines(clean.split('\n'));
        return;
      }

      append_log_lines([clean]);
    });
    return unsubscribe;
  }, [channel_bus]);

  function close_resolver(): void {
    set_resolver_open(false);
    set_resolver_step('prompt');
    set_resolver_prompt_index(0);
    set_resolver_option_index(0);
    set_resolver_option_values([]);
    set_resolver_option_labels([]);
    set_resolver_prompt_key(null);
    set_resolver_multi_values([]);
    set_resolver_multi_column_index(0);
  }

  function open_resolver(): void {
    const pending = pending_prompts(context);
    if (pending.length === 0) {
      append_log_lines(['(no pending prompts to resolve)']);
      return;
    }
    set_resolver_open(true);
    set_resolver_step('prompt');
    set_resolver_prompt_index(0);
    set_resolver_option_index(0);
    set_resolver_option_values([]);
    set_resolver_option_labels([]);
    set_resolver_prompt_key(null);
    set_resolver_multi_values([]);
    set_resolver_multi_column_index(0);
  }

  useInput((input_key, key) => {
    if (key.ctrl && input_key === 'c') {
      exit();
      return;
    }

    const pending = pending_prompts(context);

    if (resolver_open) {
      if (key.escape) {
        close_resolver();
        return;
      }

      if (resolver_step === 'prompt') {
        if (pending.length === 0) {
          if (key.return) {
            close_resolver();
          }
          return;
        }

        if (key.upArrow) {
          set_resolver_prompt_index((index) => Math.max(0, index - 1));
          return;
        }

        if (key.downArrow) {
          set_resolver_prompt_index((index) => Math.min(pending.length - 1, index + 1));
          return;
        }

        if (key.return) {
          const prompt = pending[resolver_prompt_index] ?? pending[0];
          if (!prompt) {
            close_resolver();
            return;
          }

          if (prompt.selection_mode === 'multi_column' && prompt.multi_columns && prompt.multi_columns.length > 0) {
            const initial_values = prompt.multi_columns.map((column) => {
              const values = column_values(column);
              return values[0] ?? '0';
            });

            set_resolver_prompt_key(prompt.prompt_key);
            set_resolver_multi_values(initial_values);
            set_resolver_multi_column_index(0);
            set_resolver_option_index(0);
            set_resolver_option_values([]);
            set_resolver_option_labels([]);
            set_resolver_step('multi_column');
            return;
          }

          if (prompt.selection_mode === 'number_range' && prompt.number_range) {
            const values = column_values(prompt.number_range);
            if (values.length === 0) {
              append_log_lines([`(prompt ${prompt.prompt_key} has invalid number range)`]);
              close_resolver();
              return;
            }

            set_resolver_prompt_key(prompt.prompt_key);
            set_resolver_option_values(values);
            set_resolver_option_labels(values);
            set_resolver_option_index(0);
            set_resolver_step('option');
            return;
          }

          const option_values = prompt.options.map((option) => option.option_id);
          const option_labels = prompt.options.map((option) => `${option.option_id} - ${option.label}`);

          if (option_values.length === 0) {
            const keep_running = run_command(`resolve-prompt ${prompt.prompt_key} -`);
            close_resolver();
            if (!keep_running) {
              exit();
            }
            return;
          }

          set_resolver_prompt_key(prompt.prompt_key);
          set_resolver_option_values(option_values);
          set_resolver_option_labels(option_labels);
          set_resolver_option_index(0);
          set_resolver_step('option');
        }
        return;
      }

      if (resolver_step === 'multi_column') {
        const selected_prompt = pending.find((prompt) => prompt.prompt_key === resolver_prompt_key) ?? null;
        if (!selected_prompt || !selected_prompt.multi_columns || selected_prompt.multi_columns.length === 0) {
          set_resolver_step('prompt');
          set_resolver_prompt_key(null);
          set_resolver_option_values([]);
          set_resolver_option_labels([]);
          set_resolver_multi_values([]);
          set_resolver_multi_column_index(0);
          set_resolver_option_index(0);
          return;
        }

        const column_count = selected_prompt.multi_columns.length;
        const active_index = Math.min(Math.max(0, resolver_multi_column_index), column_count - 1);
        const active_column = selected_prompt.multi_columns[active_index];
        const active_values = active_column ? column_values(active_column) : [];

        if (key.leftArrow) {
          const next_index = Math.max(0, active_index - 1);
          set_resolver_multi_column_index(next_index);
          const next_values = column_values(selected_prompt.multi_columns[next_index] ?? []);
          const current_value = resolver_multi_values[next_index] ?? next_values[0] ?? '0';
          const next_option_index = Math.max(0, next_values.indexOf(current_value));
          set_resolver_option_index(next_option_index);
          return;
        }

        if (key.rightArrow) {
          const next_index = Math.min(column_count - 1, active_index + 1);
          set_resolver_multi_column_index(next_index);
          const next_values = column_values(selected_prompt.multi_columns[next_index] ?? []);
          const current_value = resolver_multi_values[next_index] ?? next_values[0] ?? '0';
          const next_option_index = Math.max(0, next_values.indexOf(current_value));
          set_resolver_option_index(next_option_index);
          return;
        }

        if (key.upArrow) {
          const next_option_index = Math.max(0, resolver_option_index - 1);
          set_resolver_option_index(next_option_index);
          const next_value = active_values[next_option_index];
          if (next_value !== undefined) {
            set_resolver_multi_values((previous) => {
              const copy = [...previous];
              copy[active_index] = next_value;
              return copy;
            });
          }
          return;
        }

        if (key.downArrow) {
          const next_option_index = Math.min(active_values.length - 1, resolver_option_index + 1);
          set_resolver_option_index(next_option_index);
          const next_value = active_values[next_option_index];
          if (next_value !== undefined) {
            set_resolver_multi_values((previous) => {
              const copy = [...previous];
              copy[active_index] = next_value;
              return copy;
            });
          }
          return;
        }

        if (key.backspace) {
          set_resolver_step('prompt');
          set_resolver_option_values([]);
          set_resolver_option_labels([]);
          set_resolver_multi_values([]);
          set_resolver_multi_column_index(0);
          set_resolver_option_index(0);
          set_resolver_prompt_key(null);
          return;
        }

        if (key.return) {
          const selected_value = resolver_multi_values.length === column_count
            ? resolver_multi_values.join(',')
            : selected_prompt.multi_columns
                .map((column, index) => resolver_multi_values[index] ?? column_values(column)[0] ?? '0')
                .join(',');
          const keep_running = run_command(`resolve-prompt ${selected_prompt.prompt_key} ${selected_value}`);
          close_resolver();
          if (!keep_running) {
            exit();
          }
        }
        return;
      }

      const selected_prompt = pending.find((prompt) => prompt.prompt_key === resolver_prompt_key) ?? null;
      if (!selected_prompt) {
        set_resolver_step('prompt');
        set_resolver_prompt_key(null);
        set_resolver_option_values([]);
        set_resolver_option_labels([]);
        set_resolver_option_index(0);
        return;
      }

      const option_count = resolver_option_values.length;
      if (option_count === 0) {
        set_resolver_step('prompt');
        set_resolver_prompt_key(null);
        set_resolver_option_values([]);
        set_resolver_option_labels([]);
        set_resolver_option_index(0);
        return;
      }

      if (key.upArrow) {
        set_resolver_option_index((index) => Math.max(0, index - 1));
        return;
      }

      if (key.downArrow) {
        set_resolver_option_index((index) => Math.min(option_count - 1, index + 1));
        return;
      }

      if (key.leftArrow || key.backspace) {
        set_resolver_step('prompt');
        set_resolver_option_index(0);
        set_resolver_prompt_key(null);
        set_resolver_option_values([]);
        set_resolver_option_labels([]);
        return;
      }

      if (key.return) {
        const selected_option = resolver_option_values[resolver_option_index] ?? '-';
        const keep_running = run_command(`resolve-prompt ${selected_prompt.prompt_key} ${selected_option}`);
        close_resolver();
        if (!keep_running) {
          exit();
        }
      }
      return;
    }

    if (key.ctrl && input_key === 'r') {
      open_resolver();
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

      const keep_running = run_command(command);
      if (!keep_running) {
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

  const effective_state = latest_state_snapshot ?? context.state;
  const state_text = state_mode === 'json' ? format_state_json(effective_state) : format_state_brief(effective_state);
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

  const output_inspector_lines = output_lines.slice(Math.max(0, output_lines.length - inspector_content_rows));

  const inspector_lines =
    inspector_mode === 'overview'
      ? format_overview_panel(context)
      : inspector_mode === 'prompts'
        ? format_prompts_panel(context)
        : inspector_mode === 'players'
          ? format_players_panel(context)
          : inspector_mode === 'markers'
            ? format_markers_panel(context)
            : output_inspector_lines.length > 0
              ? output_inspector_lines
              : ['(no output yet)'];

  const recent_logs = stream_lines.slice(Math.max(0, stream_lines.length - content_rows));
  const players_total = Object.keys(context.state.players_by_id).length;
  const alive_count = Object.values(context.state.players_by_id).filter((player) => player.alive).length;
  const prompt_count = context.state.pending_prompts.filter((prompt_key) => {
    const prompt = context.state.prompts_by_id[prompt_key];
    return Boolean(prompt && prompt.status === 'pending');
  }).length;

  const modal_width = Math.max(56, Math.min(columns - 4, Math.floor(columns * 0.75)));
  const modal_height = Math.max(12, Math.min(rows - 6, 18));
  const modal_left = Math.max(0, Math.floor((columns - modal_width) / 2));
  const modal_top = Math.max(1, Math.floor((rows - modal_height) / 2));

  const modal_pending = pending_prompts(context);
  const modal_prompt = resolver_prompt_key
    ? modal_pending.find((prompt) => prompt.prompt_key === resolver_prompt_key) ?? null
    : null;
  const modal_multi_columns = modal_prompt?.multi_columns ?? [];
  const modal_active_column = modal_multi_columns[resolver_multi_column_index];
  const modal_active_values = modal_active_column ? column_values(modal_active_column) : [];
  const modal_active_window = Math.max(1, modal_height - 10);
  const modal_inner_width = Math.max(16, modal_width - 4);

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

      {resolver_open && (
        <Box position="absolute" width={columns} height={available_rows} flexDirection="column">
          <Box position="absolute" width={columns} height={available_rows} flexDirection="column">
          <Box marginTop={modal_top}>
            <Box marginLeft={modal_left}>
              <Box
                width={modal_width}
                height={modal_height}
                borderStyle="double"
                borderColor="yellow"
                flexDirection="column"
                paddingX={1}
              >
                <Text color="yellow" backgroundColor="black">{fit_line('Resolve Prompt', modal_inner_width)}</Text>
                {resolver_step === 'prompt' ? (
                  <>
                    <Text backgroundColor="black">{fit_line('Select pending prompt (Enter). Esc closes.', modal_inner_width)}</Text>
                    {modal_pending.length === 0 ? (
                      <Text backgroundColor="black">{fit_line('(no pending prompts)', modal_inner_width)}</Text>
                    ) : (
                      modal_pending.slice(0, modal_height - 5).map((prompt, index) => {
                        const selected = index === resolver_prompt_index;
                        return (
                          <Text key={prompt.prompt_key} color={selected ? 'green' : 'white'} backgroundColor="black">
                            {fit_line(`${selected ? '> ' : '  '}${prompt.prompt_key} kind=${prompt.kind} vis=${prompt.visibility}`, modal_inner_width)}
                          </Text>
                        );
                      })
                    )}
                  </>
                ) : resolver_step === 'multi_column' ? (
                  <>
                    <Text backgroundColor="black">
                      {fit_line(
                        modal_prompt
                          ? `Prompt ${modal_prompt.prompt_key} - Left/Right col, Up/Down value, Enter resolve`
                          : 'Prompt no longer pending',
                        modal_inner_width
                      )}
                    </Text>
                    <Box>
                    {modal_multi_columns.map((column, index) => {
                      const current = resolver_multi_values[index] ?? column_values(column)[0] ?? '-';
                      const selected = index === resolver_multi_column_index;
                      return (
                        <Box key={`col-${index}`} marginRight={2}>
                          <Text color={selected ? 'green' : 'white'} backgroundColor="black">
                            {fit_line(`${selected ? '> ' : '  '}col ${index + 1}: ${current}`, 18)}
                          </Text>
                        </Box>
                      );
                    })}
                    </Box>
                    <Text backgroundColor="black">{fit_line('active column options:', modal_inner_width)}</Text>
                    {modal_active_values.slice(0, modal_active_window).map((value, index) => {
                      const selected = index === resolver_option_index;
                      return (
                        <Text key={`active-option-${value}`} color={selected ? 'green' : 'white'} backgroundColor="black">
                          {fit_line(`${selected ? '> ' : '  '}${value}`, modal_inner_width)}
                        </Text>
                      );
                    })}
                  </>
                ) : (
                  <>
                    <Text backgroundColor="black">
                      {fit_line(
                        modal_prompt
                          ? `Prompt ${modal_prompt.prompt_key} - choose option (Backspace to prompt list)`
                          : 'Prompt no longer pending',
                        modal_inner_width
                      )}
                    </Text>
                    {resolver_option_labels.slice(0, modal_height - 5).map((option_label, index) => {
                      const selected = resolver_option_index === index;
                      return (
                        <Text key={`option-label-${index}`} color={selected ? 'green' : 'white'} backgroundColor="black">
                          {fit_line(`${selected ? '> ' : '  '}${option_label}`, modal_inner_width)}
                        </Text>
                      );
                    })}
                  </>
                )}
              </Box>
            </Box>
          </Box>
          </Box>
        </Box>
      )}
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
