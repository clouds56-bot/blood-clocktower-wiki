import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useApp, useInput, useStdin, useStdout } from 'ink';

import { CliChannelBus } from '../cli/channels.js';
import { format_state_brief, format_state_json } from '../cli/formatters.js';
import { create_cli_context, process_cli_line } from '../cli/repl.js';
import type { DomainEvent } from '../domain/events.js';
import type { GameState, PlayerState, PromptColumnSpec, PromptRangeSpec, PromptState } from '../domain/types.js';
import { EventSummaryRow } from './event.js';

type StateMode = 'brief' | 'players' | 'json';
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

function wrap_line(text: string, width: number): string[] {
  if (width <= 0) {
    return [''];
  }
  if (text.length <= width) {
    return [text];
  }

  const rows: string[] = [];
  for (let start = 0; start < text.length; start += width) {
    rows.push(text.slice(start, start + width));
  }
  return rows;
}

function wrap_lines(lines: string[], width: number): string[] {
  const wrapped: string[] = [];
  for (const line of lines) {
    wrapped.push(...wrap_line(line, width));
  }
  return wrapped;
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

  detail_lines.push(`payload_json=${JSON.stringify(selected.event.payload)}`);
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

function ordered_player_ids(state: GameState): string[] {
  return [
    ...state.seat_order,
    ...Object.keys(state.players_by_id)
      .filter((player_id) => !state.seat_order.includes(player_id))
      .sort((a, b) => a.localeCompare(b))
  ];
}

function role_color(character_type: PlayerState['true_character_type']): string {
  if (character_type === 'townsfolk') {
    return 'blue';
  }
  if (character_type === 'outsider') {
    return 'cyan';
  }
  if (character_type === 'minion') {
    return 'magenta';
  }
  if (character_type === 'demon') {
    return 'red';
  }
  if (character_type === 'traveller') {
    return 'yellow';
  }
  return 'white';
}

function alignment_color(alignment: PlayerState['true_alignment']): string {
  if (alignment === 'good') {
    return 'green';
  }
  if (alignment === 'evil') {
    return 'red';
  }
  return 'gray';
}

function marker_source_color(effect: string | null | undefined): string {
  const normalized = (effect ?? '').toLowerCase();
  if (normalized.includes('poison') || normalized.includes('drunk')) {
    return 'magenta';
  }
  if (normalized.includes('protect')) {
    return 'green';
  }
  if (normalized.length === 0 || normalized === 'none') {
    return 'gray';
  }
  return 'white';
}

function format_player_state_row(player: PlayerState, seat_index: number, marker_count: number): {
  seat: string;
  identity: string;
  vote: string;
  markers: string;
  type: string;
  role: string;
  suffix: string;
  identity_color: string;
  type_color: string;
  role_color: string;
  italic: boolean;
  strikethrough: boolean;
} {
  const seat = String(seat_index + 1).padStart(2, ' ');
  const id = player.player_id.padEnd(4, ' ').slice(0, 4);
  const name = player.display_name.padEnd(12, ' ').slice(0, 12);
  const vote = player.dead_vote_available ? 'yes ' : 'no  ';
  const markers = marker_count > 0 ? '.'.repeat(marker_count) : '-';
  const character_type = (player.true_character_type ?? 'none').padEnd(10, ' ').slice(0, 10);
  const role = (player.true_character_id ?? 'none').padEnd(19, ' ').slice(0, 19);
  const flags = [
    player.perceived_character_id && player.perceived_character_id !== player.true_character_id
      ? `seen:${player.perceived_character_id}`
      : null,
    player.registered_alignment ? `regA:${player.registered_alignment}` : null,
    player.registered_character_id ? `regC:${player.registered_character_id}` : null
  ].filter((value): value is string => Boolean(value)).join(',');

  return {
    seat,
    identity: `${id} ${name}`,
    vote,
    markers,
    type: character_type,
    role,
    suffix: ` ${flags || '-'}`,
    identity_color: player.alive ? 'white' : 'gray',
    type_color: alignment_color(player.true_alignment),
    role_color: role_color(player.true_character_type ?? null),
    italic: player.drunk || player.poisoned,
    strikethrough: !player.alive
  };
}

function next_state_mode(mode: StateMode): StateMode {
  if (mode === 'brief') {
    return 'players';
  }
  if (mode === 'players') {
    return 'json';
  }
  return 'brief';
}

function App({ initial_game_id }: { initial_game_id: string }): React.ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { stdin } = useStdin();
  const columns = stdout.columns ?? 120;
  const rows = stdout.rows ?? 40;
  const available_rows = Math.max(24, rows);
  const header_height = 3;
  const input_height = 3;
  const main_height = Math.max(10, available_rows - header_height - input_height);
  const state_height = Math.max(6, Math.floor(main_height * 0.52));
  const status_height = Math.max(4, Math.floor(main_height * 0.2));
  const inspector_height = Math.max(4, main_height - state_height - status_height);
  const event_panel_content_rows = Math.max(1, main_height - 2);
  const event_details_max_rows = Math.max(5, Math.min(10, Math.floor(event_panel_content_rows * 0.45)));
  const event_list_content_rows = Math.max(1, event_panel_content_rows - 2);
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
  const [history, set_history] = useState<string[]>([]);
  const [history_cursor, set_history_cursor] = useState<number | null>(null);
  const [state_mode, set_state_mode] = useState<StateMode>('brief');
  const [selected_player_index, set_selected_player_index] = useState(0);
  const [player_list_offset, set_player_list_offset] = useState(0);
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
  const [mouse_scroll_enabled, set_mouse_scroll_enabled] = useState(true);
  const [, set_tick] = useState(0);
  const suppress_input_until_ref = useRef(0);
  const event_autoscroll_ref = useRef(event_autoscroll);
  const event_list_content_rows_ref = useRef(event_list_content_rows);

  useEffect(() => {
    event_autoscroll_ref.current = event_autoscroll;
  }, [event_autoscroll]);

  useEffect(() => {
    event_list_content_rows_ref.current = event_list_content_rows;
  }, [event_list_content_rows]);

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

  const step_player_selection = useCallback((delta: number, total_count: number, visible_count: number): void => {
    if (total_count <= 0 || delta === 0) {
      return;
    }
    set_selected_player_index((previous) => {
      const normalized_previous = ((previous % total_count) + total_count) % total_count;
      const next = ((normalized_previous + delta) % total_count + total_count) % total_count;
      set_player_list_offset((offset) => ensure_visible_offset(next, offset, visible_count, total_count));
      return next;
    });
  }, []);

  const step_event_selection = useCallback((delta: number): void => {
    if (event_entries.length === 0 || delta === 0) {
      return;
    }
    set_selected_event_index((previous) => {
      const current = previous ?? event_entries.length - 1;
      const next = clamp(current + delta, 0, event_entries.length - 1);
      const at_latest = next === event_entries.length - 1;
      set_event_autoscroll(at_latest);
      set_event_list_offset((offset) =>
        ensure_visible_offset(next, offset, event_list_content_rows, event_entries.length)
      );
      return next;
    });
  }, [event_entries.length, event_list_content_rows]);

  useEffect(() => {
    const unsubscribe = channel_bus.subscribe('*', (message) => {
      const clean = strip_ansi(message.text);

      if (message.channel === 'state') {
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
          if (event_autoscroll_ref.current) {
            const latest = merged.length - 1;
            set_selected_event_index(latest);
            const max_offset = Math.max(0, merged.length - event_list_content_rows_ref.current);
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
  }, [channel_bus]);

  useEffect(() => {
    if (!stdin || !process.stdout.isTTY || !mouse_scroll_enabled) {
      return;
    }

    const enable = '\x1b[?1000h\x1b[?1006h';
    const disable = '\x1b[?1000l\x1b[?1006l';
    process.stdout.write(enable);

    const on_data = (chunk: Buffer | string): void => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      const matches = text.matchAll(/\x1b\[<(\d+);(\d+);(\d+)([mM])/g);
      for (const match of matches) {
        const code = Number(match[1]);
        const x = Number(match[2]);
        const y = Number(match[3]);
        const action = match[4];

        if (action !== 'M') {
          continue;
        }
        suppress_input_until_ref.current = Date.now() + 120;

        const is_wheel_up = code === 64;
        const is_wheel_down = code === 65;
        if (!is_wheel_up && !is_wheel_down) {
          continue;
        }

        const event_panel_right = Math.max(1, Math.floor(columns / 2));
        const event_panel_top = header_height + 1;
        const event_panel_bottom = header_height + main_height;
        const in_event_panel = x >= 1 && x <= event_panel_right && y >= event_panel_top && y <= event_panel_bottom;
        if (!in_event_panel) {
          continue;
        }

        step_event_selection(is_wheel_up ? -1 : 1);
      }
    };

    stdin.on('data', on_data);
    return () => {
      stdin.off('data', on_data);
      process.stdout.write(disable);
    };
  }, [stdin, columns, header_height, main_height, mouse_scroll_enabled, step_event_selection]);

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

    const suppress_input = Date.now() < suppress_input_until_ref.current;
    if (suppress_input && !key.ctrl && !key.meta && !key.return) {
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

    if (key.ctrl && input_key === 'm') {
      set_mouse_scroll_enabled((value) => !value);
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
      set_state_mode((mode) => next_state_mode(mode));
      return;
    }

    if (key.ctrl && input_key === 'g') {
      set_inspector_mode((mode) => next_inspector_mode(mode));
      return;
    }

    const player_count = ordered_player_ids(context.state).length;
    const player_visible_count = Math.max(1, state_content_rows - 3);

    if (key.ctrl && input_key === 'p') {
      step_player_selection(-1, player_count, player_visible_count);
      return;
    }

    if (key.ctrl && input_key === 'n') {
      step_player_selection(1, player_count, player_visible_count);
      return;
    }

    if (pane_focus === 'events' && key.upArrow) {
      step_event_selection(-1);
      return;
    }

    if (pane_focus === 'events' && key.downArrow) {
      step_event_selection(1);
      return;
    }

    if (state_mode === 'players' && pane_focus !== 'events' && key.upArrow) {
      step_player_selection(-1, player_count, player_visible_count);
      return;
    }

    if (state_mode === 'players' && pane_focus !== 'events' && key.downArrow) {
      step_player_selection(1, player_count, player_visible_count);
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

  const effective_state = context.state;
  const state_text = state_mode === 'json' ? format_state_json(effective_state) : format_state_brief(effective_state);

  const state_lines = state_text.split('\n').slice(0, state_content_rows);
  const player_state_header = 'sel seat id   name         vote markers type       role                flags';
  const player_state_separator = '--- ---- ---- ------------ ---- ------- ---------- ------------------- -----';
  const player_marker_ids = new Map<string, string[]>();
  for (const marker_id of effective_state.active_reminder_marker_ids) {
    const marker = effective_state.reminder_markers_by_id[marker_id];
    if (!marker || !marker.target_player_id) {
      continue;
    }
    const current = player_marker_ids.get(marker.target_player_id) ?? [];
    current.push(marker_id);
    player_marker_ids.set(marker.target_player_id, current);
  }

  const player_ids = ordered_player_ids(effective_state);
  const seat_by_player_id = new Map<string, string>(
    player_ids.map((player_id, index) => [player_id, String(index + 1)])
  );
  const player_rows = player_ids
    .map((player_id, index) => {
      const player = effective_state.players_by_id[player_id];
      if (!player) {
        return null;
      }
      const marker_count = player_marker_ids.get(player_id)?.length ?? 0;
      return {
        key: `${player_id}:${index}`,
        row: format_player_state_row(player, index, marker_count)
      };
    })
    .filter((value): value is { key: string; row: ReturnType<typeof format_player_state_row> } => Boolean(value));

  const player_visible_count = Math.max(0, state_content_rows - 3);
  const clamped_selected_player_index = player_rows.length === 0
    ? null
    : clamp(selected_player_index, 0, player_rows.length - 1);
  const max_player_offset = Math.max(0, player_rows.length - Math.max(1, player_visible_count));
  const effective_player_offset = clamp(player_list_offset, 0, max_player_offset);
  const selected_player = clamped_selected_player_index === null
    ? null
    : effective_state.players_by_id[player_ids[clamped_selected_player_index] ?? ''] ?? null;
  const selected_player_marker_details = selected_player
    ? effective_state.active_reminder_marker_ids
        .map((marker_id) => effective_state.reminder_markers_by_id[marker_id])
        .filter((marker): marker is NonNullable<typeof marker> => Boolean(marker && marker.target_player_id === selected_player.player_id))
        .reduce((acc, marker) => {
          const key = `${marker.kind}|${marker.effect}`;
          const seat = marker.source_player_id ? seat_by_player_id.get(marker.source_player_id) ?? '?' : '?';
          const existing = acc.get(key);
          if (existing) {
            existing.seats.push(seat);
            return acc;
          }
          acc.set(key, {
            kind: marker.kind,
            effect: marker.effect,
            seats: [seat]
          });
          return acc;
        }, new Map<string, { kind: string; effect: string; seats: string[] }>())
    : new Map<string, { kind: string; effect: string; seats: string[] }>();
  const selected_player_markers = Array.from(selected_player_marker_details.values())
    .map((entry) => ({
      ...entry,
      seats: [...entry.seats].sort((a, b) => a.localeCompare(b))
    }))
    .sort((left, right) => left.kind.localeCompare(right.kind));
  const selected_player_status_prefix = selected_player
    ? `selected=${selected_player.player_id} reminders=${selected_player_markers.length} `
    : 'selected=(none) reminders=(none)';

  useEffect(() => {
    if (player_rows.length === 0) {
      if (selected_player_index !== 0) {
        set_selected_player_index(0);
      }
      if (player_list_offset !== 0) {
        set_player_list_offset(0);
      }
      return;
    }
    if (selected_player_index >= player_rows.length) {
      set_selected_player_index(player_rows.length - 1);
    }
    if (clamped_selected_player_index !== null) {
      const next_offset = ensure_visible_offset(
        clamped_selected_player_index,
        player_list_offset,
        Math.max(1, player_visible_count),
        player_rows.length
      );
      if (next_offset !== player_list_offset) {
        set_player_list_offset(next_offset);
      }
    }
  }, [
    clamped_selected_player_index,
    player_list_offset,
    player_rows.length,
    player_visible_count,
    selected_player_index
  ]);

  const visible_player_rows = player_rows.slice(
    effective_player_offset,
    effective_player_offset + Math.max(0, player_visible_count)
  );

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
  const wrapped_event_details = wrap_lines(selected_event_details, Math.max(8, left_pane_width));
  const event_overlay_rows = clamp(wrapped_event_details.length + 1, 4, event_details_max_rows);
  const visible_event_details = wrapped_event_details.slice(0, Math.max(1, event_overlay_rows - 1));
  const overlay_detail_rows = Array.from(
    { length: Math.max(1, event_overlay_rows - 1) },
    (_, index) => visible_event_details[index] ?? ''
  );
  const selected_visible_index = clamped_selected_event_index === null
    ? null
    : clamped_selected_event_index - effective_event_offset;
  const overlay_base_top = 2;
  const overlay_bottom_top = Math.max(overlay_base_top, event_panel_content_rows - event_overlay_rows);
  const overlay_top = selected_visible_index !== null && selected_visible_index < event_overlay_rows
    ? overlay_bottom_top
    : event_entries.length === 0
      ? overlay_bottom_top
      : overlay_base_top;
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
  const timing_label = effective_state.phase === 'day'
    ? `d${effective_state.day_number}`
    : effective_state.phase === 'night'
      ? `n${effective_state.night_number}`
      : effective_state.phase;

  return (
    <Box flexDirection="column" width={columns} height={available_rows}>
      <Box borderStyle="single" paddingX={1} height={header_height}>
        <Text>
          phase={context.state.phase}/{context.state.subphase} day={context.state.day_number} night={context.state.night_number} alive={alive_count}/{players_total} prompts={prompt_count} | focus={pane_focus} | events autoscroll={event_autoscroll} key={show_event_key ? 'shown' : 'hidden'} mouse={mouse_scroll_enabled ? 'on' : 'off'} | Ctrl+W pane | Ctrl+A autoscroll | Ctrl+M mouse | Ctrl+L latest | Ctrl+K key | Ctrl+U/D scroll | Ctrl+E errors={status_errors_only} | Ctrl+S state={state_mode} | Ctrl+G inspector={inspector_mode} | Ctrl+P/N player | Ctrl+C quit
        </Text>
      </Box>

      <Box height={main_height}>
        <Box width="50%" flexDirection="column">
          <Box
            borderStyle="single"
            borderColor={pane_focus === 'events' ? 'green' : 'white'}
            flexDirection="column"
            height={main_height}
            paddingX={1}
          >
            <Text color="cyan">Events ({event_entries.length}) autoscroll={event_autoscroll ? 'on' : 'off'}</Text>
            <Text color="gray">{fit_line(event_scrollbar_line, left_pane_width)}</Text>
            {visible_event_entries.length === 0 ? (
              <Text>(no events yet)</Text>
            ) : (
              visible_event_entries.map((entry, visible_index) => {
                const absolute_index = effective_event_offset + visible_index;
                const selected = clamped_selected_event_index === absolute_index;
                return (
                  <EventSummaryRow
                    key={`event-row-${entry.event_index}`}
                    event={entry.event}
                    event_index={entry.event_index}
                    selected={selected}
                    width={left_pane_width}
                  />
                );
              })
            )}

            <Box
              position="absolute"
              marginTop={overlay_top}
              width={left_pane_width}
              height={event_overlay_rows}
              flexDirection="column"
            >
              <Text color="cyan" backgroundColor="black">{fit_line('Selected Event', left_pane_width)}</Text>
              {overlay_detail_rows.map((line, index) => (
                <Text key={`event-detail-${index}`} backgroundColor="black">
                  {fit_line(index === 0 && line.length === 0 ? '(none)' : line, left_pane_width)}
                </Text>
              ))}
            </Box>
          </Box>
        </Box>

        <Box width="50%" flexDirection="column">
          <Box borderStyle="single" flexDirection="column" height={state_height} paddingX={1}>
            <Text color="cyan">
              {state_mode === 'players'
                ? `State (${state_mode}) ${timing_label} sub=${effective_state.subphase} alive=${alive_count}/${players_total}`
                : `State (${state_mode})`}
            </Text>
            {state_mode === 'players' ? (
              <>
                <Text>{fit_line(player_state_header, right_pane_width)}</Text>
                <Text color="gray">{fit_line(player_state_separator, right_pane_width)}</Text>
                {visible_player_rows.length > 0 ? (
                  visible_player_rows.map(({ key, row }, index) => {
                    const absolute_index = effective_player_offset + index;
                    const selected = absolute_index === (clamped_selected_player_index ?? -1);
                    const content = (
                      <>
                        <Text>{selected ? '>  ' : '   '}</Text>
                        <Text>{`${row.seat}   `}</Text>
                        <Text color={row.identity_color}>{`${row.identity} `}</Text>
                        <Text>{`${row.vote} `}</Text>
                        <Text>{`${row.markers.padEnd(7, ' ')} `}</Text>
                        <Text color={row.type_color}>{row.type}</Text>
                        <Text> </Text>
                        <Text color={row.role_color}>{row.role}</Text>
                        <Text>{row.suffix}</Text>
                      </>
                    );
                    return (
                      <Text
                        key={`player-state-${key}`}
                        bold={selected}
                        italic={row.italic}
                        strikethrough={row.strikethrough}
                        wrap="truncate-end"
                      >
                        {content}
                      </Text>
                    );
                  })
                ) : (
                  <Text>(no players)</Text>
                )}
                {selected_player ? (
                  <Text wrap="truncate-end">
                    <Text color="gray">{selected_player_status_prefix}</Text>
                    {selected_player_markers.length > 0 ? (
                      selected_player_markers.map((marker, index) => (
                        <Text key={`selected-player-marker-${marker.kind}-${marker.effect}-${index}`}>
                          <Text>{`${marker.kind}:`}</Text>
                          <Text color={marker_source_color(marker.effect)}>{marker.seats.join(',')}</Text>
                          <Text>{index < selected_player_markers.length - 1 ? ', ' : ''}</Text>
                        </Text>
                      ))
                    ) : (
                      <Text color="gray">(none)</Text>
                    )}
                  </Text>
                ) : (
                  <Text color="gray" wrap="truncate-end">{selected_player_status_prefix}</Text>
                )}
              </>
            ) : (
              render_panel_lines(state_lines, right_pane_width)
            )}
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
