import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useApp, useInput, useStdin, useStdout } from 'ink';

import { CliChannelBus } from '../cli/channels.js';
import { format_state_brief, format_state_json } from '../cli/formatters.js';
import { create_cli_context, process_cli_line } from '../cli/repl.js';
import type { DomainEvent } from '../domain/events.js';
import type { PromptColumnSpec, PromptRangeSpec, PromptState } from '../domain/types.js';
import { resolve_tui_command, route_tui_command, type TuiCommand } from './command-bindings.js';
import { CommandPane, handle_command_mode_command, type VimMode } from './panes/command-pane.js';
import {
  EventsPane,
  derive_event_view_model,
  event_matches_query,
  find_event_match_index,
  handle_events_pane_command
} from './panes/events-pane.js';
import { InspectorPane } from './panes/inspector-pane.js';
import {
  StatePane,
  derive_player_state_model,
  find_state_json_match_index,
  ordered_player_ids,
  handle_state_pane_command
} from './panes/state-pane.js';
import { StatusPane } from './panes/status-pane.js';

type StateMode = 'brief' | 'players' | 'json';
type InspectorMode = 'overview' | 'prompts' | 'players' | 'markers' | 'output';
type PaneFocus = 'events' | 'state';
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

function slice_from_bottom(lines: string[], visible_count: number, scroll_offset: number): string[] {
  const end = Math.max(0, lines.length - Math.max(0, scroll_offset));
  const start = Math.max(0, end - Math.max(1, visible_count));
  return lines.slice(start, end);
}

function next_focus(focus: PaneFocus): PaneFocus {
  return focus === 'events' ? 'state' : 'events';
}

function prev_focus(focus: PaneFocus): PaneFocus {
  return focus === 'events' ? 'state' : 'events';
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
  const [vim_mode, set_vim_mode] = useState<VimMode>('normal');
  const [count_prefix, set_count_prefix] = useState('');
  const [pending_g, set_pending_g] = useState(false);
  const [event_search_query, set_event_search_query] = useState('');
  const [last_event_search_query, set_last_event_search_query] = useState('');
  const [last_event_search_direction, set_last_event_search_direction] = useState<1 | -1>(-1);
  const [search_entry_direction, set_search_entry_direction] = useState<1 | -1>(-1);
  const [filter_query, set_filter_query] = useState('');
  const [state_json_cursor, set_state_json_cursor] = useState(0);
  const [state_json_offset, set_state_json_offset] = useState(0);
  const [state_json_search_query, set_state_json_search_query] = useState('');
  const [last_state_json_search_query, set_last_state_json_search_query] = useState('');
  const [last_state_json_search_direction, set_last_state_json_search_direction] = useState<1 | -1>(1);
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
  const [state_mode, set_state_mode] = useState<StateMode>('players');
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
  const [mode_return_focus, set_mode_return_focus] = useState<PaneFocus>('events');
  const [mode_return_state_mode, set_mode_return_state_mode] = useState<StateMode>('players');
  const [search_start_event_index, set_search_start_event_index] = useState<number | null>(null);
  const [search_start_state_json_cursor, set_search_start_state_json_cursor] = useState<number | null>(null);
  const [search_anchor_event_index, set_search_anchor_event_index] = useState<number | null>(null);
  const [search_anchor_state_json_cursor, set_search_anchor_state_json_cursor] = useState<number | null>(null);
  const [status_errors_only, set_status_errors_only] = useState(false);
  const [mouse_scroll_enabled, set_mouse_scroll_enabled] = useState(true);
  const [, set_tick] = useState(0);
  const suppress_input_until_ref = useRef(0);
  const event_autoscroll_ref = useRef(event_autoscroll);
  const event_list_content_rows_ref = useRef(event_list_content_rows);
  const event_view_indices_ref = useRef<number[]>([]);
  const filter_query_ref = useRef(filter_query);
  const state_json_lines = useMemo(() => format_state_json(context.state).split('\n'), [context.state]);

  useEffect(() => {
    event_autoscroll_ref.current = event_autoscroll;
  }, [event_autoscroll]);

  useEffect(() => {
    event_list_content_rows_ref.current = event_list_content_rows;
  }, [event_list_content_rows]);

  useEffect(() => {
    filter_query_ref.current = filter_query;
  }, [filter_query]);

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

  function select_event_by_view_position(view_position: number): void {
    const view = event_view_indices_ref.current;
    if (view.length === 0) {
      return;
    }
    const clamped_position = clamp(view_position, 0, view.length - 1);
    const absolute_index = view[clamped_position];
    if (absolute_index === undefined) {
      return;
    }
    const at_latest = clamped_position === view.length - 1;
    set_selected_event_index(absolute_index);
    set_event_autoscroll(at_latest);
    set_event_list_offset((offset) =>
      ensure_visible_offset(clamped_position, offset, event_list_content_rows, view.length)
    );
  }

  function select_event_at(absolute_index: number): void {
    const view = event_view_indices_ref.current;
    if (view.length === 0) {
      return;
    }
    const position = view.indexOf(absolute_index);
    if (position >= 0) {
      select_event_by_view_position(position);
      return;
    }
    const fallback = clamp(absolute_index, 0, view.length - 1);
    select_event_by_view_position(fallback);
  }

  function run_event_search(
    query: string,
    direction: 1 | -1,
    emit_not_found = true,
    base_index: number | null = selected_event_index,
    include_start = true
  ): boolean {
    const needle = query.trim();
    if (needle.length === 0) {
      return false;
    }
    const current = base_index;
    if (current !== null) {
      const current_entry = event_entries[current];
      if (current_entry && event_matches_query(current_entry, needle)) {
        return true;
      }
    }
    const matched = find_event_match_index({
      query: needle,
      direction,
      event_entries,
      view_indices: event_view_indices_ref.current,
      selected_event_index: base_index,
      include_start
    });
    if (matched === null) {
      if (emit_not_found) {
        append_status_lines([`(no match for /${needle})`]);
      }
      return false;
    }
    select_event_at(matched);
    return true;
  }

  function move_state_json_cursor(delta: number): void {
    if (state_json_lines.length === 0 || delta === 0) {
      return;
    }
    set_state_json_cursor((previous) => {
      const next = clamp(previous + delta, 0, state_json_lines.length - 1);
      set_state_json_offset((offset) => ensure_visible_offset(next, offset, state_content_rows, state_json_lines.length));
      return next;
    });
  }

  function jump_state_json_top(count: number | null): void {
    if (state_json_lines.length === 0) {
      return;
    }
    const target = count === null ? 0 : clamp(count - 1, 0, state_json_lines.length - 1);
    set_state_json_cursor(target);
    set_state_json_offset((offset) => ensure_visible_offset(target, offset, state_content_rows, state_json_lines.length));
  }

  function jump_state_json_bottom(): void {
    if (state_json_lines.length === 0) {
      return;
    }
    const target = state_json_lines.length - 1;
    set_state_json_cursor(target);
    set_state_json_offset((offset) => ensure_visible_offset(target, offset, state_content_rows, state_json_lines.length));
  }

  function run_state_json_search(
    query: string,
    direction: 1 | -1,
    emit_not_found = true,
    base_index = state_json_cursor,
    include_start = true
  ): boolean {
    const needle = query.trim();
    if (needle.length === 0) {
      return false;
    }
    const current = clamp(base_index, 0, Math.max(0, state_json_lines.length - 1));
    const current_line = state_json_lines[current] ?? '';
    if (current_line.toLowerCase().includes(needle.toLowerCase())) {
      return true;
    }
    const matched = find_state_json_match_index({
      query: needle,
      direction,
      lines: state_json_lines,
      current_index: base_index,
      include_start
    });
    if (matched === null) {
      if (emit_not_found) {
        append_status_lines([`(no match for /${needle} in state json)`]);
      }
      return false;
    }
    set_state_json_cursor(matched);
    set_state_json_offset((offset) => ensure_visible_offset(matched, offset, state_content_rows, state_json_lines.length));
    return true;
  }

  function repeat_event_search(kind: 'same' | 'opposite', count: number): void {
    const needle = last_event_search_query.trim();
    if (needle.length === 0) {
      append_status_lines(['(no previous search query in events)']);
      return;
    }
    const direction = kind === 'same'
      ? last_event_search_direction
      : (last_event_search_direction === 1 ? -1 : 1);
    const attempts = Math.max(1, count);
    for (let i = 0; i < attempts; i += 1) {
      const matched = find_event_match_index({
        query: needle,
        direction,
        event_entries,
        view_indices: event_view_indices_ref.current,
        selected_event_index
      });
      if (matched === null) {
        append_status_lines([`(no match for /${needle})`]);
        return;
      }
      select_event_at(matched);
    }
  }

  function repeat_state_json_search(kind: 'same' | 'opposite', count: number): void {
    const needle = last_state_json_search_query.trim();
    if (needle.length === 0) {
      append_status_lines(['(no previous search query in state json)']);
      return;
    }
    const direction = kind === 'same'
      ? last_state_json_search_direction
      : (last_state_json_search_direction === 1 ? -1 : 1);
    const attempts = Math.max(1, count);
    for (let i = 0; i < attempts; i += 1) {
      const matched = find_state_json_match_index({
        query: needle,
        direction,
        lines: state_json_lines,
        current_index: state_json_cursor
      });
      if (matched === null) {
        append_status_lines([`(no match for /${needle} in state json)`]);
        return;
      }
      set_state_json_cursor(matched);
      set_state_json_offset((offset) => ensure_visible_offset(matched, offset, state_content_rows, state_json_lines.length));
    }
  }

  function start_search_session(target: 'events' | 'state_json'): void {
    if (target === 'state_json') {
      set_search_start_state_json_cursor(state_json_cursor);
      set_search_anchor_state_json_cursor(state_json_cursor);
      set_search_start_event_index(null);
      set_search_anchor_event_index(null);
      return;
    }
    set_search_start_event_index(selected_event_index);
    set_search_anchor_event_index(selected_event_index);
    set_search_start_state_json_cursor(null);
    set_search_anchor_state_json_cursor(null);
  }

  function cancel_search_session(target: 'events' | 'state_json'): void {
    if (target === 'state_json') {
      if (search_start_state_json_cursor !== null) {
        const restored = clamp(search_start_state_json_cursor, 0, Math.max(0, state_json_lines.length - 1));
        set_state_json_cursor(restored);
        set_state_json_offset((offset) => ensure_visible_offset(restored, offset, state_content_rows, state_json_lines.length));
      }
      set_search_start_state_json_cursor(null);
      set_search_anchor_state_json_cursor(null);
      return;
    }
    if (search_start_event_index !== null) {
      select_event_at(search_start_event_index);
    }
    set_search_start_event_index(null);
    set_search_anchor_event_index(null);
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
    const view = event_view_indices_ref.current;
    if (view.length === 0 || delta === 0) {
      return;
    }
    set_selected_event_index((previous_absolute) => {
      const fallback = view[view.length - 1] ?? 0;
      const current_absolute = previous_absolute ?? fallback;
      const current_position = Math.max(0, view.indexOf(current_absolute));
      const next_position = clamp(current_position + delta, 0, view.length - 1);
      const next_absolute = view[next_position] ?? current_absolute;
      const at_latest = next_position === view.length - 1;
      set_event_autoscroll(at_latest);
      set_event_list_offset((offset) =>
        ensure_visible_offset(next_position, offset, event_list_content_rows, view.length)
      );
      return next_absolute;
    });
  }, [event_list_content_rows]);

  const jump_top_selection = useCallback((count: number | null): void => {
    if (pane_focus === 'events') {
      const total_count = event_view_indices_ref.current.length;
      if (total_count === 0) {
        return;
      }
      const target_position = count === null ? 0 : clamp(count - 1, 0, total_count - 1);
      select_event_by_view_position(target_position);
      return;
    }
    if (pane_focus === 'state' && state_mode === 'players') {
      const total_count = ordered_player_ids(context.state).length;
      if (total_count <= 0) {
        return;
      }
      const raw_target = count === null ? 0 : Math.max(0, count - 1);
      const wrapped_target = ((raw_target % total_count) + total_count) % total_count;
      set_selected_player_index(wrapped_target);
      set_player_list_offset((offset) => ensure_visible_offset(wrapped_target, offset, Math.max(1, state_content_rows - 4), total_count));
      return;
    }
    if (pane_focus === 'state' && state_mode === 'json') {
      jump_state_json_top(count);
    }
  }, [pane_focus, state_mode, context.state, state_content_rows, jump_state_json_top]);

  const jump_bottom_selection = useCallback((): void => {
    if (pane_focus === 'events') {
      const total_count = event_view_indices_ref.current.length;
      if (total_count <= 0) {
        return;
      }
      select_event_by_view_position(total_count - 1);
      return;
    }
    if (pane_focus === 'state' && state_mode === 'players') {
      const total_count = ordered_player_ids(context.state).length;
      if (total_count <= 0) {
        return;
      }
      set_selected_player_index(total_count - 1);
      set_player_list_offset((offset) => ensure_visible_offset(total_count - 1, offset, Math.max(1, state_content_rows - 4), total_count));
      return;
    }
    if (pane_focus === 'state' && state_mode === 'json') {
      jump_state_json_bottom();
    }
  }, [pane_focus, state_mode, context.state, state_content_rows, jump_state_json_bottom]);

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
          if (event_autoscroll_ref.current && filter_query_ref.current.trim().length === 0) {
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

    const player_count = ordered_player_ids(context.state).length;
    const player_visible_count = Math.max(1, state_content_rows - 4);
    const binding = resolve_tui_command(input_key, key, {
      suppress_input,
      mode: vim_mode,
      pane_focus,
      state_mode,
      count_prefix,
      pending_g
    });

    if (binding.count_prefix !== count_prefix) {
      set_count_prefix(binding.count_prefix);
    }
    if (binding.pending_g !== pending_g) {
      set_pending_g(binding.pending_g);
    }
    if (!binding.handled || !binding.command) {
      return;
    }

    const command: TuiCommand = binding.command;
    const target = route_tui_command(command, { pane_focus, state_mode });
    const should_try_pane = !command.id.startsWith('mode:')
      && (
        target === 'pane'
        || command.id.startsWith('search:')
        || command.id.startsWith('filter:')
        || command.id.startsWith('state:')
        || command.id.startsWith('inspector:')
      );
    if (should_try_pane) {
      if (pane_focus === 'events') {
        const handled = handle_events_pane_command(
          command,
          {
            page_size: Math.max(1, event_list_content_rows - 1),
            half_page_size: Math.max(1, Math.floor(event_list_content_rows / 2))
          },
          {
            move_cursor: step_event_selection,
            jump_top: jump_top_selection,
            jump_bottom: jump_bottom_selection,
            start_search: (direction) => {
              set_mode_return_focus(pane_focus);
              set_mode_return_state_mode(state_mode);
              set_search_entry_direction(direction);
              set_vim_mode('search');
              set_input('');
              set_history_cursor(null);
            },
            end_search: () => {
              const target_mode = mode_return_focus === 'state' && mode_return_state_mode === 'json'
                ? 'state_json'
                : 'events';
              cancel_search_session(target_mode);
              set_input('');
              set_history_cursor(null);
              set_vim_mode('normal');
              set_pane_focus(mode_return_focus);
            },
            repeat_search: repeat_event_search,
            start_filter: () => {
              set_mode_return_focus(pane_focus);
              set_mode_return_state_mode(state_mode);
              set_vim_mode('filter');
              set_input('');
              set_history_cursor(null);
            },
            end_filter: () => {
              set_input('');
              set_history_cursor(null);
              set_vim_mode('normal');
              set_pane_focus(mode_return_focus);
            }
          }
        );
        if (handled) {
          return;
        }
      }

      if (pane_focus === 'state') {
        const handled = handle_state_pane_command(
          command,
          {
            state_mode,
            page_size: Math.max(1, state_content_rows - 1),
            half_page_size: Math.max(1, Math.floor(state_content_rows / 2)),
            player_count,
            player_visible_count
          },
          {
            move_player: step_player_selection,
            move_json_cursor: move_state_json_cursor,
            jump_top: jump_top_selection,
            jump_bottom: jump_bottom_selection,
            start_search: (direction) => {
              set_mode_return_focus(pane_focus);
              set_mode_return_state_mode(state_mode);
              set_search_entry_direction(direction);
              set_vim_mode('search');
              set_input('');
              set_history_cursor(null);
            },
            end_search: () => {
              const target_mode = mode_return_focus === 'state' && mode_return_state_mode === 'json'
                ? 'state_json'
                : 'events';
              cancel_search_session(target_mode);
              set_input('');
              set_history_cursor(null);
              set_vim_mode('normal');
              set_pane_focus(mode_return_focus);
            },
            repeat_search: repeat_state_json_search,
            cycle_state_mode: () => set_state_mode((mode) => next_state_mode(mode)),
            cycle_inspector_mode: () => set_inspector_mode((mode) => next_inspector_mode(mode))
          }
        );
        if (handled) {
          return;
        }
      }
    }

    if (command.id === 'app:exit') {
      exit();
      return;
    }
    if (command.id === 'resolver:open') {
      open_resolver();
      return;
    }
    if (command.id === 'pane:focus_next') {
      set_pane_focus((focus) => next_focus(focus));
      return;
    }
    if (command.id === 'pane:focus_prev') {
      set_pane_focus((focus) => prev_focus(focus));
      return;
    }
    if (command.id === 'events:toggle_autoscroll') {
      set_event_autoscroll((value) => !value);
      return;
    }
    if (command.id === 'events:toggle_mouse_scroll') {
      set_mouse_scroll_enabled((value) => !value);
      return;
    }
    if (command.id === 'events:toggle_key') {
      set_show_event_key((value) => !value);
      return;
    }
    if (command.id === 'events:jump_latest') {
      const view = event_view_indices_ref.current;
      if (view.length > 0) {
        select_event_by_view_position(view.length - 1);
      }
      return;
    }
    if (command.id === 'status:toggle_errors_only') {
      set_status_errors_only((value) => !value);
      return;
    }
    if (command.id === 'state:cycle_mode') {
      set_state_mode((mode) => next_state_mode(mode));
      return;
    }
    if (command.id === 'inspector:cycle_mode') {
      set_inspector_mode((mode) => next_inspector_mode(mode));
      return;
    }
    if (command.id.startsWith('mode:') || command.id.startsWith('search:') || command.id.startsWith('filter:')) {
      const handled = handle_command_mode_command(
        command,
        {
          mode: vim_mode,
          input,
          history,
          history_cursor,
          pane_focus,
          state_mode,
          mode_return_focus,
          mode_return_state_mode,
          search_entry_direction
        },
        {
          set_mode: set_vim_mode,
          set_input,
          set_history,
          set_history_cursor,
          set_mode_return_context: (focus, mode) => {
            set_mode_return_focus(focus);
            set_mode_return_state_mode(mode);
          },
          set_search_entry_direction,
          set_pane_focus,
          start_search_session,
          cancel_search: cancel_search_session,
          apply_search_preview: (target, query, direction) => {
            if (target === 'state_json') {
              set_state_json_search_query(query);
              if (query.length > 0) {
                const base = search_anchor_state_json_cursor ?? state_json_cursor;
                run_state_json_search(query, direction, false, base, true);
              }
            } else {
              set_event_search_query(query);
              if (query.length > 0) {
                const base = search_anchor_event_index ?? selected_event_index;
                run_event_search(query, direction, false, base, true);
              }
            }
          },
          apply_search_commit: (target, query, direction) => {
            if (target === 'state_json') {
              set_state_json_search_query(query);
              const base = search_anchor_state_json_cursor ?? state_json_cursor;
              const matched = run_state_json_search(query, direction, false, base, true);
              if (matched) {
                set_last_state_json_search_query(query);
                set_last_state_json_search_direction(direction);
              }
            } else {
              set_event_search_query(query);
              const base = search_anchor_event_index ?? selected_event_index;
              const matched = run_event_search(query, direction, false, base, true);
              if (matched) {
                set_last_event_search_query(query);
                set_last_event_search_direction(direction);
              }
            }
          },
          clear_search: (target) => {
            if (target === 'state_json') {
              set_state_json_search_query('');
              set_last_state_json_search_query('');
            } else {
              set_event_search_query('');
              set_last_event_search_query('');
            }
          },
          apply_filter_preview: (query) => set_filter_query(query),
          apply_filter_commit: (query) => set_filter_query(query),
          run_command,
          exit
        }
      );
      if (handled) {
        return;
      }
    }
  });

  const effective_state = context.state;
  const state_brief_lines = format_state_brief(effective_state).split('\n').slice(0, state_content_rows);
  const state_json_matched_indices = useMemo(() => {
    const matches = new Set<number>();
    const needle = state_json_search_query.trim().toLowerCase();
    if (needle.length === 0) {
      return matches;
    }
    for (let index = 0; index < state_json_lines.length; index += 1) {
      const line = state_json_lines[index] ?? '';
      if (line.toLowerCase().includes(needle)) {
        matches.add(index);
      }
    }
    return matches;
  }, [state_json_lines, state_json_search_query]);

  const clamped_state_json_cursor = state_json_lines.length === 0
    ? null
    : clamp(state_json_cursor, 0, state_json_lines.length - 1);
  const max_state_json_offset = Math.max(0, state_json_lines.length - state_content_rows);
  const effective_state_json_offset = clamp(state_json_offset, 0, max_state_json_offset);
  const visible_state_json_lines = state_json_lines.slice(
    effective_state_json_offset,
    effective_state_json_offset + state_content_rows
  );

  useEffect(() => {
    if (state_json_lines.length === 0) {
      if (state_json_cursor !== 0) {
        set_state_json_cursor(0);
      }
      if (state_json_offset !== 0) {
        set_state_json_offset(0);
      }
      return;
    }
    const clamped = clamp(state_json_cursor, 0, state_json_lines.length - 1);
    if (clamped !== state_json_cursor) {
      set_state_json_cursor(clamped);
    }
    const next_offset = ensure_visible_offset(clamped, state_json_offset, state_content_rows, state_json_lines.length);
    if (next_offset !== state_json_offset) {
      set_state_json_offset(next_offset);
    }
  }, [state_json_cursor, state_json_offset, state_json_lines, state_content_rows]);

  const player_state_header = 'sel seat id   name         vote markers type       role                flags';
  const player_state_separator = '--- ---- ---- ------------ ---- ------- ---------- ------------------- -----';
  const player_model = useMemo(() => derive_player_state_model({
    state: effective_state,
    selected_player_index,
    player_list_offset,
    state_content_rows
  }), [effective_state, selected_player_index, player_list_offset, state_content_rows]);

  const {
    player_rows,
    clamped_selected_player_index,
    effective_player_offset,
    player_visible_count,
    visible_player_rows,
    selected_player_status_prefix,
    selected_player_marker_lines,
    next_selected_player_index,
    next_player_list_offset
  } = player_model;

  useEffect(() => {
    if (next_selected_player_index !== selected_player_index) {
      set_selected_player_index(next_selected_player_index);
    }
    if (next_player_list_offset !== player_list_offset) {
      set_player_list_offset(next_player_list_offset);
    }
  }, [next_selected_player_index, next_player_list_offset, selected_player_index, player_list_offset]);

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

  const event_model = useMemo(() => derive_event_view_model({
    event_entries,
    selected_event_index,
    event_list_offset,
    event_autoscroll,
    event_list_content_rows,
    event_panel_content_rows,
    event_details_max_rows,
    left_pane_width,
    event_search_query,
    filter_query,
    show_event_key
  }), [
    event_entries,
    selected_event_index,
    event_list_offset,
    event_autoscroll,
    event_list_content_rows,
    event_panel_content_rows,
    event_details_max_rows,
    left_pane_width,
    event_search_query,
    filter_query,
    show_event_key
  ]);

  const {
    matched_event_indices,
    event_view_indices,
    selected_event_index: clamped_selected_event_index,
    effective_event_offset,
    visible_event_entries,
    overlay_top,
    event_overlay_rows,
    overlay_detail_rows,
    event_scrollbar_line,
    next_selected_event_index,
    next_event_list_offset
  } = event_model;
  event_view_indices_ref.current = event_view_indices;

  useEffect(() => {
    if (next_selected_event_index !== selected_event_index) {
      set_selected_event_index(next_selected_event_index);
    }
    if (next_event_list_offset !== event_list_offset) {
      set_event_list_offset(next_event_list_offset);
    }
  }, [next_selected_event_index, next_event_list_offset, selected_event_index, event_list_offset]);
  const inspector_visible_lines = slice_from_bottom(inspector_lines, inspector_content_rows, 0);
  const status_inspector_lines = slice_from_bottom(status_filtered_lines, status_content_rows, 0);
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
          phase={context.state.phase}/{context.state.subphase} day={context.state.day_number} night={context.state.night_number} alive={alive_count}/{players_total} prompts={prompt_count} | mode={vim_mode} focus={pane_focus} count={count_prefix || '1'} | events autoscroll={event_autoscroll} key={show_event_key ? 'shown' : 'hidden'} mouse={mouse_scroll_enabled ? 'on' : 'off'} | : command | / search | ? filter | j/k move | gg/G | n/N repeat | w/W pane | Ctrl+F/B page | Ctrl+U/D half | Ctrl+E/Y line | Ctrl+R resolver | Ctrl+C quit
        </Text>
      </Box>

      <Box height={main_height}>
        <EventsPane
          pane_focus={pane_focus}
          main_height={main_height}
          left_pane_width={left_pane_width}
          event_entries={event_entries}
          event_autoscroll={event_autoscroll}
          event_scrollbar_line={event_scrollbar_line}
          visible_event_entries={visible_event_entries}
          effective_event_offset={effective_event_offset}
          selected_event_index={clamped_selected_event_index}
          matched_event_indices={matched_event_indices}
          overlay_top={overlay_top}
          event_overlay_rows={event_overlay_rows}
          overlay_detail_rows={overlay_detail_rows}
        />

        <Box width="50%" flexDirection="column">
          <StatePane
            pane_focus={pane_focus}
            state_height={state_height}
            right_pane_width={right_pane_width}
            state_mode={state_mode}
            title={state_mode === 'players'
              ? `State (${state_mode}) ${timing_label} sub=${effective_state.subphase} alive=${alive_count}/${players_total}`
              : `State (${state_mode})`}
            panel_lines={state_mode === 'json' ? visible_state_json_lines : state_brief_lines}
            json_offset={effective_state_json_offset}
            json_selected_index={clamped_state_json_cursor}
            json_matched_indices={state_json_matched_indices}
            player_state_header={player_state_header}
            player_state_separator={player_state_separator}
            visible_player_rows={visible_player_rows}
            effective_player_offset={effective_player_offset}
            selected_player_index={clamped_selected_player_index}
            selected_player_status_prefix={selected_player_status_prefix}
            selected_player_marker_lines={selected_player_marker_lines}
          />
          <InspectorPane inspector_height={inspector_height} inspector_mode={inspector_mode} lines={inspector_visible_lines} />
          <StatusPane status_height={status_height} status_errors_only={status_errors_only} lines={status_inspector_lines} />
        </Box>
      </Box>

      <CommandPane
        pane_focus={pane_focus}
        input_height={input_height}
        command_width={command_width}
        mode={vim_mode}
        input={input}
        count_prefix={count_prefix}
        pending_g={pending_g}
      />

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
