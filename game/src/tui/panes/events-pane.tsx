import React from 'react';
import { Box, Text } from 'ink';

import type { DomainEvent } from '../../domain/events.js';
import { EventSummaryRow, format_event_summary_text } from '../event.js';

interface EventEntry {
  event: DomainEvent;
  event_index: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function format_selected_event_detail_lines(selected: EventEntry | null, show_event_key: boolean): string[] {
  if (!selected) {
    return ['(no event selected)', 'Use w/W to focus events, j/k to select.'];
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

export function derive_event_view_model(args: {
  event_entries: EventEntry[];
  selected_event_index: number | null;
  event_list_offset: number;
  event_autoscroll: boolean;
  event_list_content_rows: number;
  event_panel_content_rows: number;
  event_details_max_rows: number;
  left_pane_width: number;
  event_search_query: string;
  filter_query: string;
  show_event_key: boolean;
}): {
  matched_event_indices: Set<number>;
  event_view_indices: number[];
  selected_event_index: number | null;
  effective_event_offset: number;
  visible_event_entries: Array<EventEntry & { absolute_index: number }>;
  overlay_top: number;
  event_overlay_rows: number;
  overlay_detail_rows: string[];
  event_scrollbar_line: string;
  next_selected_event_index: number | null;
  next_event_list_offset: number;
} {
  const {
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
  } = args;

  const matched_event_indices = new Set<number>();
  const search_needle = event_search_query.trim();
  if (search_needle.length > 0) {
    for (let index = 0; index < event_entries.length; index += 1) {
      const entry = event_entries[index];
      if (!entry) {
        continue;
      }
      if (event_matches_query(entry, search_needle)) {
        matched_event_indices.add(index);
      }
    }
  }

  const filter_needle = filter_query.trim();
  const event_view_indices = filter_needle.length === 0
    ? event_entries.map((_, index) => index)
    : event_entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => event_matches_query(entry, filter_needle))
        .map(({ index }) => index);

  const fallback_selected = event_view_indices.length > 0
    ? event_view_indices[event_view_indices.length - 1] ?? null
    : null;
  const normalized_selected = selected_event_index === null
    ? fallback_selected
    : (event_entries[selected_event_index] && event_view_indices.includes(selected_event_index)
      ? selected_event_index
      : fallback_selected);

  const selected_view_position = normalized_selected === null
    ? null
    : (() => {
        const position = event_view_indices.indexOf(normalized_selected);
        return position >= 0 ? position : null;
      })();

  const max_event_offset = Math.max(0, event_view_indices.length - event_list_content_rows);
  const effective_event_offset = event_autoscroll
    ? max_event_offset
    : clamp(event_list_offset, 0, max_event_offset);

  const visible_event_entries = event_view_indices
    .slice(effective_event_offset, effective_event_offset + event_list_content_rows)
    .map((absolute_index) => {
      const entry = event_entries[absolute_index];
      if (!entry) {
        return null;
      }
      return { ...entry, absolute_index };
    })
    .filter((entry): entry is EventEntry & { absolute_index: number } => Boolean(entry));

  const selected_event = normalized_selected === null
    ? null
    : event_entries[normalized_selected] ?? null;
  const selected_event_details = format_selected_event_detail_lines(selected_event, show_event_key);
  const wrapped_event_details = wrap_lines(selected_event_details, Math.max(8, left_pane_width));
  const event_overlay_rows = clamp(wrapped_event_details.length + 1, 4, event_details_max_rows);
  const visible_event_details = wrapped_event_details.slice(0, Math.max(1, event_overlay_rows - 1));
  const overlay_detail_rows = Array.from(
    { length: Math.max(1, event_overlay_rows - 1) },
    (_, index) => visible_event_details[index] ?? ''
  );

  const selected_visible_index = selected_view_position === null
    ? null
    : selected_view_position - effective_event_offset;
  const overlay_base_top = 2;
  const overlay_bottom_top = Math.max(overlay_base_top, event_panel_content_rows - event_overlay_rows);
  const overlay_top = selected_visible_index !== null && selected_visible_index < event_overlay_rows
    ? overlay_bottom_top
    : event_view_indices.length === 0
      ? overlay_bottom_top
      : overlay_base_top;

  const event_scrollbar_line = render_scrollbar_line(
    event_view_indices.length,
    event_list_content_rows,
    effective_event_offset
  );

  return {
    matched_event_indices,
    event_view_indices,
    selected_event_index: normalized_selected,
    effective_event_offset,
    visible_event_entries,
    overlay_top,
    event_overlay_rows,
    overlay_detail_rows,
    event_scrollbar_line,
    next_selected_event_index: normalized_selected,
    next_event_list_offset: event_view_indices.length === 0 ? 0 : clamp(event_list_offset, 0, max_event_offset)
  };
}

export function event_matches_query(entry: EventEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return false;
  }
  const summary = format_event_summary_text(entry.event, entry.event_index, 256).toLowerCase();
  return summary.includes(needle);
}

export function find_event_match_index(params: {
  query: string;
  direction: 1 | -1;
  event_entries: EventEntry[];
  view_indices: number[];
  selected_event_index: number | null;
  include_start?: boolean;
}): number | null {
  const { query, direction, event_entries, view_indices, selected_event_index, include_start = false } = params;
  const needle = query.trim().toLowerCase();
  if (needle.length === 0 || view_indices.length === 0) {
    return null;
  }
  const current_absolute = selected_event_index ?? view_indices[view_indices.length - 1] ?? 0;
  const current_position = Math.max(0, view_indices.indexOf(current_absolute));
  const attempts = view_indices.length;
  for (let iter = 0; iter < attempts; iter += 1) {
    const step = include_start ? iter : iter + 1;
    const candidate_position = (current_position + direction * step + view_indices.length * 2) % view_indices.length;
    const candidate_absolute = view_indices[candidate_position];
    if (candidate_absolute === undefined) {
      continue;
    }
    const entry = event_entries[candidate_absolute];
    if (!entry) {
      continue;
    }
    if (event_matches_query(entry, needle)) {
      return candidate_absolute;
    }
  }
  return null;
}

export function handle_events_pane_command(
  command: { id: string; count?: number; direction?: 1 | -1 },
  options: {
    page_size: number;
    half_page_size: number;
  },
  handlers: {
    move_cursor: (delta: number) => void;
    jump_top: (count: number | null) => void;
    jump_bottom: () => void;
    start_search: (direction: 1 | -1) => void;
    end_search: () => void;
    repeat_search: (kind: 'same' | 'opposite', count: number) => void;
    start_filter: () => void;
    end_filter: () => void;
  }
): boolean {
  const count = Math.max(1, command.count ?? 1);
  if (command.id === 'cursor:line_up') {
    handlers.move_cursor(-count);
    return true;
  }
  if (command.id === 'cursor:line_down') {
    handlers.move_cursor(count);
    return true;
  }
  if (command.id === 'cursor:jump_top') {
    handlers.jump_top(command.count ?? null);
    return true;
  }
  if (command.id === 'cursor:jump_bottom') {
    handlers.jump_bottom();
    return true;
  }
  if (command.id === 'search:start') {
    handlers.start_search(command.direction ?? -1);
    return true;
  }
  if (command.id === 'search:end') {
    handlers.end_search();
    return true;
  }
  if (command.id === 'search:cancel') {
    handlers.end_search();
    return true;
  }
  if (command.id === 'search:forward_direction') {
    handlers.repeat_search('same', count);
    return true;
  }
  if (command.id === 'search:backward_direction') {
    handlers.repeat_search('opposite', count);
    return true;
  }
  if (command.id === 'filter:start') {
    handlers.start_filter();
    return true;
  }
  if (command.id === 'filter:end') {
    handlers.end_filter();
    return true;
  }
  if (command.id === 'filter:cancel') {
    handlers.end_filter();
    return true;
  }
  if (command.id === 'viewport:line_up') {
    handlers.move_cursor(-count);
    return true;
  }
  if (command.id === 'viewport:line_down') {
    handlers.move_cursor(count);
    return true;
  }
  if (command.id === 'viewport:half_page_up') {
    handlers.move_cursor(-options.half_page_size * count);
    return true;
  }
  if (command.id === 'viewport:half_page_down') {
    handlers.move_cursor(options.half_page_size * count);
    return true;
  }
  if (command.id === 'viewport:page_up') {
    handlers.move_cursor(-options.page_size * count);
    return true;
  }
  if (command.id === 'viewport:page_down') {
    handlers.move_cursor(options.page_size * count);
    return true;
  }
  return false;
}

function fit_line(text: string, width: number): string {
  if (width <= 0) {
    return '';
  }
  const clipped = text.length > width ? text.slice(0, width) : text;
  return clipped.padEnd(width, ' ');
}

export function EventsPane(props: {
  pane_focus: 'events' | 'state';
  main_height: number;
  left_pane_width: number;
  event_entries: EventEntry[];
  event_autoscroll: boolean;
  event_scrollbar_line: string;
  visible_event_entries: Array<EventEntry & { absolute_index: number }>;
  effective_event_offset: number;
  selected_event_index: number | null;
  matched_event_indices: Set<number>;
  overlay_top: number;
  event_overlay_rows: number;
  overlay_detail_rows: string[];
}): React.ReactElement {
  const {
    pane_focus,
    main_height,
    left_pane_width,
    event_entries,
    event_autoscroll,
    event_scrollbar_line,
    visible_event_entries,
    effective_event_offset,
    selected_event_index,
    matched_event_indices,
    overlay_top,
    event_overlay_rows,
    overlay_detail_rows
  } = props;

  return (
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
          visible_event_entries.map((entry) => {
            const selected = selected_event_index === entry.absolute_index;
            return (
              <EventSummaryRow
                key={`event-row-${entry.event_index}`}
                event={entry.event}
                event_index={entry.event_index}
                selected={selected}
                matched={matched_event_indices.has(entry.absolute_index)}
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
  );
}
