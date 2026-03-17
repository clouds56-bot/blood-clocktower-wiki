import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';

import { CliChannelBus } from '../cli/channels.js';
import { format_state_brief, format_state_json } from '../cli/formatters.js';
import { create_cli_context, process_cli_line } from '../cli/repl.js';
import type { DomainEvent } from '../domain/events.js';
import type { GameState, PromptColumnSpec, PromptRangeSpec, PromptState } from '../domain/types.js';

type StateMode = 'brief' | 'json';
type InspectorMode = 'overview' | 'prompts' | 'players' | 'markers' | 'output';
type PaneFocus = 'events' | 'inspector' | 'status';
type StatusKind = 'status' | 'error';

interface StatusEntry {
  text: string;
  kind: StatusKind;
}

interface EventEntry {
  event: DomainEvent;
  event_index: number;
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

function render_panel_lines(lines: string[], max_width: number): React.ReactNode {
  return lines.map((line, index) => {
    const clipped = max_width > 0 && line.length > max_width
      ? `${line.slice(0, Math.max(0, max_width - 1))}~`
      : line;
    return <Text key={`${index}:${line}`}>{clipped}</Text>;
  });
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

function event_color_for_tui(event_type: DomainEvent['event_type']): string {
  if (event_type === 'GameEnded' || event_type === 'GameWon' || event_type === 'ForcedVictoryDeclared') {
    return 'magenta';
  }
  if (event_type === 'PlayerDied' || event_type === 'PlayerExecuted') {
    return 'red';
  }
  if (event_type === 'PhaseAdvanced') {
    return 'blue';
  }
  if (event_type === 'PromptQueued') {
    return 'yellow';
  }
  if (
    event_type === 'NominationMade' ||
    event_type === 'VoteOpened' ||
    event_type === 'VoteCast' ||
    event_type === 'VoteClosed'
  ) {
    return 'yellow';
  }
  if (event_type === 'WinCheckCompleted' || event_type === 'ExecutionResolutionCompleted') {
    return 'cyan';
  }
  return 'white';
}

function payload_summary(payload: unknown, max_len: number): string {
  let raw = '';
  try {
    raw = JSON.stringify(payload);
  } catch {
    raw = String(payload);
  }
  if (raw.length <= max_len) {
    return raw;
  }
  return `${raw.slice(0, Math.max(0, max_len - 1))}~`;
}

function format_event_summary_line(entry: EventEntry, payload_max_len: number): string {
  const summary = payload_summary(entry.event.payload, payload_max_len);
  return `#${entry.event_index} ${entry.event.event_type} ${summary}`;
}

function format_selected_event_detail_lines(
  selected: EventEntry | null,
  show_event_key: boolean
): string[] {
  if (!selected) {
    return ['(no event selected)', 'Use Ctrl+W to focus events, Up/Down to select.'];
  }

  const detail_lines = [
    `selected=#${selected.event_index} ${selected.event.event_type}`,
    `event_id=${selected.event.event_id} created_at=${selected.event.created_at}`,
    `actor_id=${selected.event.actor_id ?? 'none'}`
  ];

  if (show_event_key) {
    detail_lines.push(`event_key=${selected.event.event_key ?? 'none'}`);
  } else {
    detail_lines.push('event_key=(hidden) Ctrl+K to toggle');
  }

  const payload = JSON.stringify(selected.event.payload, null, 2).split('\n');
  detail_lines.push('payload:');
  detail_lines.push(...payload);
  return detail_lines;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function ensure_visible_offset(
  selected_index: number,
  current_offset: number,
  visible_count: number,
  total_count: number
): number {
  const max_offset = Math.max(0, total_count - visible_count);
  if (selected_index < current_offset) {
    return clamp(selected_index, 0, max_offset);
  }
  if (selected_index >= current_offset + visible_count) {
    return clamp(selected_index - visible_count + 1, 0, max_offset);
  }
  return clamp(current_offset, 0, max_offset);
}

function render_scrollbar_line(total_count: number, visible_count: number, offset: number): string {
  const width = 18;
  if (total_count <= 0) {
    return `scroll [${'-'.repeat(width)}] 0/0`;
  }

  if (total_count <= visible_count) {
    return `scroll [${'#'.repeat(width)}] ${total_count}/${total_count}`;
  }

  const max_offset = Math.max(1, total_count - visible_count);
  const thumb_size = Math.max(1, Math.round((visible_count / total_count) * width));
  const travel = Math.max(0, width - thumb_size);
  const thumb_pos = Math.round((offset / max_offset) * travel);

  const chars = Array.from({ length: width }, () => '-');
  for (let i = 0; i < thumb_size; i += 1) {
    const position = thumb_pos + i;
    if (position >= 0 && position < chars.length) {
      chars[position] = '#';
    }
  }

  const view_end = Math.min(total_count, offset + visible_count);
  return `scroll [${chars.join('')}] ${view_end}/${total_count}`;
}

function slice_from_bottom(lines: string[], visible_count: number, scroll_offset: number): string[] {
  const end = Math.max(0, lines.length - Math.max(0, scroll_offset));
  const start = Math.max(0, end - Math.max(1, visible_count));
  return lines.slice(start, end);
}

function next_focus(focus: PaneFocus): PaneFocus {
  if (focus === 'events') {
    return 'inspector';
  }
  if (focus === 'inspector') {
    return 'status';
  }
  return 'events';
}

function App({ initial_game_id }: { initial_game_id: string }): React.ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const columns = stdout.columns ?? 120;
  const rows = stdout.rows ?? 40;
  const available_rows = Math.max(24, rows);
  const header_height = 3;
  const input_height = 3;
  const main_height = Math.max(10, available_rows - header_height - input_height);
  const state_height = Math.max(6, Math.floor(main_height * 0.52));
  const status_height = Math.max(4, Math.floor(main_height * 0.2));
  const inspector_height = Math.max(4, main_height - state_height - status_height);
  const event_details_height = Math.max(8, Math.floor(main_height * 0.46));
  const event_list_height = Math.max(8, main_height - event_details_height);
  const event_details_content_rows = Math.max(1, event_details_height - 2);
  const event_list_content_rows = Math.max(1, event_list_height - 3);
  const state_content_rows = Math.max(1, state_height - 2);
  const inspector_content_rows = Math.max(1, inspector_height - 2);
  const status_content_rows = Math.max(1, status_height - 2);
  const channel_bus = useMemo(() => new CliChannelBus(), []);
  const context = useMemo(
    () => create_cli_context(initial_game_id, { channel_bus }),
    [initial_game_id, channel_bus]
  );

  const [input, set_input] = useState('');
  const [event_entries, set_event_entries] = useState<EventEntry[]>([]);
  const [selected_event_index, set_selected_event_index] = useState<number | null>(null);
  const [event_list_offset, set_event_list_offset] = useState(0);
  const [event_autoscroll, set_event_autoscroll] = useState(true);
  const [show_event_key, set_show_event_key] = useState(false);
  const [status_entries, set_status_entries] = useState<StatusEntry[]>([
    { text: 'Type commands and press Enter. Ctrl+R opens resolve prompt picker.', kind: 'status' }
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
  const [pane_focus, set_pane_focus] = useState<PaneFocus>('events');
  const [inspector_scroll, set_inspector_scroll] = useState(0);
  const [status_scroll, set_status_scroll] = useState(0);
  const [status_errors_only, set_status_errors_only] = useState(false);
  const [, set_tick] = useState(0);

  function append_status_lines(lines: string[], kind: StatusKind = 'status'): void {
    if (lines.length === 0) {
      return;
    }
    set_status_entries((previous) => {
      const next = lines.map((line) => ({ text: line, kind }));
      const merged = [...previous, ...next];
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
    append_status_lines([`> ${command}`]);
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

      if (message.channel === 'event') {
        const event = message.event;
        if (!event) {
          return;
        }
        set_event_entries((previous) => {
          const next_index = message.event_index ?? previous.length + 1;
          const merged = [...previous, { event, event_index: next_index }];
          if (event_autoscroll) {
            const latest = merged.length - 1;
            set_selected_event_index(latest);
            const max_offset = Math.max(0, merged.length - event_list_content_rows);
            set_event_list_offset(max_offset);
          }
          return merged;
        });
        return;
      }

      if (message.channel === 'output') {
        append_output_lines(clean.split('\n'));
        return;
      }

      append_status_lines([clean], message.channel === 'error' ? 'error' : 'status');
    });
    return unsubscribe;
  }, [channel_bus, event_autoscroll, event_list_content_rows]);

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
      append_status_lines(['(no pending prompts to resolve)']);
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
              append_status_lines([`(prompt ${prompt.prompt_key} has invalid number range)`]);
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

    if (key.ctrl && input_key === 'w') {
      set_pane_focus((focus) => next_focus(focus));
      return;
    }

    if (key.ctrl && input_key === 'a') {
      set_event_autoscroll((value) => !value);
      return;
    }

    if (key.ctrl && input_key === 'k') {
      set_show_event_key((value) => !value);
      return;
    }

    if (key.ctrl && input_key === 'l') {
      const last_index = event_entries.length - 1;
      if (last_index >= 0) {
        set_selected_event_index(last_index);
      }
      set_event_autoscroll(true);
      return;
    }

    if (key.ctrl && input_key === 'e') {
      set_status_errors_only((value) => !value);
      return;
    }

    if (key.ctrl && input_key === 'u') {
      if (pane_focus === 'events') {
        set_event_autoscroll(false);
        set_event_list_offset((value) => Math.max(0, value - 1));
      } else if (pane_focus === 'inspector') {
        set_inspector_scroll((value) => value + 1);
      } else {
        set_status_scroll((value) => value + 1);
      }
      return;
    }

    if (key.ctrl && input_key === 'd') {
      if (pane_focus === 'events') {
        set_event_autoscroll(false);
        const max_offset = Math.max(0, event_entries.length - event_list_content_rows);
        set_event_list_offset((value) => Math.min(max_offset, value + 1));
      } else if (pane_focus === 'inspector') {
        set_inspector_scroll((value) => Math.max(0, value - 1));
      } else {
        set_status_scroll((value) => Math.max(0, value - 1));
      }
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

    if (pane_focus === 'events' && key.upArrow) {
      if (event_entries.length === 0) {
        return;
      }
      set_event_autoscroll(false);
      set_selected_event_index((previous) => {
        const current = previous ?? event_entries.length - 1;
        const next = Math.max(0, current - 1);
        set_event_list_offset((offset) =>
          ensure_visible_offset(next, offset, event_list_content_rows, event_entries.length)
        );
        return next;
      });
      return;
    }

    if (pane_focus === 'events' && key.downArrow) {
      if (event_entries.length === 0) {
        return;
      }
      set_selected_event_index((previous) => {
        const current = previous ?? event_entries.length - 1;
        const next = Math.min(event_entries.length - 1, current + 1);
        const at_latest = next === event_entries.length - 1;
        set_event_autoscroll(at_latest);
        set_event_list_offset((offset) =>
          ensure_visible_offset(next, offset, event_list_content_rows, event_entries.length)
        );
        return next;
      });
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

  const state_lines = state_text.split('\n').slice(0, state_content_rows);

  const right_pane_width = Math.max(20, Math.floor(columns / 2) - 4);
  const left_pane_width = Math.max(20, Math.floor(columns / 2) - 4);
  const command_width = Math.max(10, columns - 14);

  const output_inspector_lines = output_lines;
  const status_filtered_lines = status_entries
    .filter((entry) => !status_errors_only || entry.kind === 'error')
    .map((entry) => (entry.kind === 'error' ? `! ${entry.text}` : entry.text));

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

  const clamped_selected_event_index = selected_event_index === null
    ? (event_entries.length === 0 ? null : event_entries.length - 1)
    : clamp(selected_event_index, 0, Math.max(0, event_entries.length - 1));
  const max_event_offset = Math.max(0, event_entries.length - event_list_content_rows);
  const effective_event_offset = event_autoscroll
    ? max_event_offset
    : clamp(event_list_offset, 0, max_event_offset);
  const visible_event_entries = event_entries.slice(
    effective_event_offset,
    effective_event_offset + event_list_content_rows
  );
  const selected_event = clamped_selected_event_index === null
    ? null
    : event_entries[clamped_selected_event_index] ?? null;
  const selected_event_details = format_selected_event_detail_lines(selected_event, show_event_key);
  const visible_event_details = slice_from_bottom(selected_event_details, event_details_content_rows, 0);
  const event_scrollbar_line = render_scrollbar_line(
    event_entries.length,
    event_list_content_rows,
    effective_event_offset
  );
  const inspector_visible_lines = slice_from_bottom(inspector_lines, inspector_content_rows, inspector_scroll);
  const status_inspector_lines = slice_from_bottom(status_filtered_lines, status_content_rows, status_scroll);
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
          phase={context.state.phase}/{context.state.subphase} day={context.state.day_number} night={context.state.night_number} alive={alive_count}/{players_total} prompts={prompt_count} | focus={pane_focus} | events autoscroll={event_autoscroll} key={show_event_key ? 'shown' : 'hidden'} | Ctrl+W pane | Ctrl+A autoscroll | Ctrl+L latest | Ctrl+K key | Ctrl+U/D scroll | Ctrl+E errors={status_errors_only} | Ctrl+S state={state_mode} | Ctrl+G inspector={inspector_mode} | Ctrl+C quit
        </Text>
      </Box>

      <Box height={main_height}>
        <Box width="50%" flexDirection="column">
          <Box
            borderStyle="single"
            borderColor={pane_focus === 'events' ? 'green' : 'white'}
            flexDirection="column"
            height={event_details_height}
            paddingX={1}
          >
            <Text color="cyan">Event Details (selected)</Text>
            {render_panel_lines(visible_event_details, left_pane_width)}
          </Box>

          <Box
            borderStyle="single"
            borderColor={pane_focus === 'events' ? 'green' : 'white'}
            flexDirection="column"
            height={event_list_height}
            paddingX={1}
          >
            <Text color="cyan">Event Summary ({event_entries.length}) autoscroll={event_autoscroll ? 'on' : 'off'}</Text>
            <Text color="gray">{fit_line(event_scrollbar_line, left_pane_width)}</Text>
            {visible_event_entries.length === 0 ? (
              <Text>(no events yet)</Text>
            ) : (
              visible_event_entries.map((entry, visible_index) => {
                const absolute_index = effective_event_offset + visible_index;
                const selected = clamped_selected_event_index === absolute_index;
                const line = format_event_summary_line(entry, Math.max(24, left_pane_width - 20));
                return (
                  <Text key={`event-row-${entry.event_index}`} color={selected ? 'green' : event_color_for_tui(entry.event.event_type)}>
                    {fit_line(`${selected ? '> ' : '  '}${line}`, left_pane_width)}
                  </Text>
                );
              })
            )}
          </Box>
        </Box>

        <Box width="50%" flexDirection="column">
          <Box borderStyle="single" flexDirection="column" height={state_height} paddingX={1}>
            <Text color="cyan">State ({state_mode})</Text>
            {render_panel_lines(state_lines, right_pane_width)}
          </Box>

          <Box borderStyle="single" borderColor={pane_focus === 'inspector' ? 'green' : 'white'} flexDirection="column" height={inspector_height} paddingX={1}>
            <Text color="cyan">Inspector ({inspector_mode})</Text>
            {render_panel_lines(inspector_visible_lines, right_pane_width)}
          </Box>

          <Box borderStyle="single" borderColor={pane_focus === 'status' ? 'green' : 'white'} flexDirection="column" height={status_height} paddingX={1}>
            <Text color="cyan">Status (errors_only={status_errors_only})</Text>
            {render_panel_lines(status_inspector_lines, right_pane_width)}
          </Box>
        </Box>
      </Box>

      <Box borderStyle="single" paddingX={1} height={input_height}>
        <Text color="green">Command&gt; </Text>
        <Text>{input.slice(0, command_width)}</Text>
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
