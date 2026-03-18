import React from 'react';
import { Box, Text } from 'ink';

import type { GameState, PlayerState } from '../../domain/types.js';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function find_state_json_match_index(params: {
  query: string;
  direction: 1 | -1;
  lines: string[];
  current_index: number;
}): number | null {
  const { query, direction, lines, current_index } = params;
  const needle = query.trim().toLowerCase();
  if (needle.length === 0 || lines.length === 0) {
    return null;
  }
  const current = clamp(current_index, 0, Math.max(0, lines.length - 1));
  for (let step = 1; step <= lines.length; step += 1) {
    const candidate = (current + direction * step + lines.length * 2) % lines.length;
    const line = lines[candidate] ?? '';
    if (line.toLowerCase().includes(needle)) {
      return candidate;
    }
  }
  return null;
}

interface MarkerSeatToken {
  seat: string;
  color: string;
}

export interface PlayerStateRow {
  key: string;
  seat: string;
  identity: string;
  vote: string;
  markers: string;
  marker_tokens: MarkerSeatToken[];
  type: string;
  role: string;
  suffix: string;
  identity_color: string;
  type_color: string;
  role_color: string;
  italic: boolean;
  strikethrough: boolean;
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

export function marker_source_color(effect: string | null | undefined): string {
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

function format_player_state_row(player: PlayerState, seat_index: number, marker_sources: MarkerSeatToken[]): Omit<PlayerStateRow, 'key'> {
  const seat = String(seat_index + 1).padStart(2, ' ');
  const id = player.player_id.padEnd(4, ' ').slice(0, 4);
  const name = player.display_name.padEnd(12, ' ').slice(0, 12);
  const vote = player.dead_vote_available ? 'yes ' : 'no  ';
  const markers = marker_sources.length > 0 ? marker_sources.map((source) => source.seat).join(',') : '-';
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
    marker_tokens: marker_sources,
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

export function ordered_player_ids(state: GameState): string[] {
  const seated_player_ids = new Set(state.seat_order);
  return [
    ...state.seat_order,
    ...Object.keys(state.players_by_id)
      .filter((player_id) => !seated_player_ids.has(player_id))
      .sort((a, b) => a.localeCompare(b))
  ];
}

export function derive_player_state_model(args: {
  state: GameState;
  selected_player_index: number;
  player_list_offset: number;
  state_content_rows: number;
}): {
  player_rows: PlayerStateRow[];
  player_ids: string[];
  clamped_selected_player_index: number | null;
  effective_player_offset: number;
  player_visible_count: number;
  visible_player_rows: PlayerStateRow[];
  selected_player_status_prefix: string;
  selected_player_marker_lines: Array<{ text: string; color: string }>;
  next_selected_player_index: number;
  next_player_list_offset: number;
} {
  const { state, selected_player_index, player_list_offset, state_content_rows } = args;
  const player_ids = ordered_player_ids(state);
  const seat_by_player_id = new Map<string, string>(
    player_ids.map((player_id, index) => [player_id, String(index + 1)])
  );

  const player_marker_sources = new Map<string, MarkerSeatToken[]>();
  for (const marker_id of state.active_reminder_marker_ids) {
    const marker = state.reminder_markers_by_id[marker_id];
    if (!marker || !marker.target_player_id) {
      continue;
    }
    const source_seat = marker.source_player_id ? seat_by_player_id.get(marker.source_player_id) ?? '?' : '?';
    const source_color = marker_source_color(marker.effect);
    const current = player_marker_sources.get(marker.target_player_id) ?? [];
    current.push({ seat: source_seat, color: source_color });
    player_marker_sources.set(marker.target_player_id, current);
  }

  const player_rows = player_ids
    .map((player_id, index) => {
      const player = state.players_by_id[player_id];
      if (!player) {
        return null;
      }
      const row = format_player_state_row(player, index, player_marker_sources.get(player_id) ?? []);
      return {
        key: `${player_id}:${index}`,
        ...row
      };
    })
    .filter((value): value is PlayerStateRow => Boolean(value));

  const player_visible_count = Math.max(1, state_content_rows - 4);
  const clamped_selected_player_index = player_rows.length === 0
    ? null
    : clamp(selected_player_index, 0, player_rows.length - 1);
  const max_player_offset = Math.max(0, player_rows.length - Math.max(1, player_visible_count));
  const effective_player_offset = clamp(player_list_offset, 0, max_player_offset);

  const next_selected_player_index = player_rows.length === 0
    ? 0
    : (clamped_selected_player_index ?? 0);
  const next_player_list_offset = player_rows.length === 0
    ? 0
    : ensure_visible_offset(
        next_selected_player_index,
        player_list_offset,
        Math.max(1, player_visible_count),
        player_rows.length
      );

  const selected_player = clamped_selected_player_index === null
    ? null
    : state.players_by_id[player_ids[clamped_selected_player_index] ?? ''] ?? null;
  const selected_player_marker_details = selected_player
    ? state.active_reminder_marker_ids
        .map((marker_id) => state.reminder_markers_by_id[marker_id])
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
    ? `selected=${selected_player.player_id} `
    : 'selected=(none)';
  const selected_player_marker_lines = selected_player_markers.map((marker) => ({
    text: `${marker.kind}:${marker.seats.join(',')}`,
    color: marker_source_color(marker.effect)
  }));

  const visible_player_rows = player_rows.slice(effective_player_offset, effective_player_offset + player_visible_count);

  return {
    player_rows,
    player_ids,
    clamped_selected_player_index,
    effective_player_offset,
    player_visible_count,
    visible_player_rows,
    selected_player_status_prefix,
    selected_player_marker_lines,
    next_selected_player_index,
    next_player_list_offset
  };
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

export function handle_state_pane_command(
  command: { id: string; count?: number; direction?: 1 | -1 },
  context: {
    state_mode: 'brief' | 'players' | 'json';
    page_size: number;
    half_page_size: number;
    player_count: number;
    player_visible_count: number;
  },
  handlers: {
    move_player: (delta: number, total_count: number, visible_count: number) => void;
    move_json_cursor: (delta: number) => void;
    jump_top: (count: number | null) => void;
    jump_bottom: () => void;
    start_search: (direction: 1 | -1) => void;
    end_search: () => void;
    repeat_search: (kind: 'same' | 'opposite', count: number) => void;
    cycle_state_mode: () => void;
    cycle_inspector_mode: () => void;
  }
): boolean {
  const count = Math.max(1, command.count ?? 1);
  if (command.id === 'state:cycle_mode') {
    handlers.cycle_state_mode();
    return true;
  }
  if (command.id === 'inspector:cycle_mode') {
    handlers.cycle_inspector_mode();
    return true;
  }

  if (context.state_mode === 'players') {
    if (command.id === 'cursor:line_up') {
      handlers.move_player(-count, context.player_count, context.player_visible_count);
      return true;
    }
    if (command.id === 'cursor:line_down') {
      handlers.move_player(count, context.player_count, context.player_visible_count);
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
    return false;
  }

  if (context.state_mode === 'json') {
    if (command.id === 'search:start') {
      handlers.start_search(command.direction ?? 1);
      return true;
    }
    if (command.id === 'search:end') {
      handlers.end_search();
      return true;
    }
    if (command.id === 'search:repeat_same') {
      handlers.repeat_search('same', count);
      return true;
    }
    if (command.id === 'search:repeat_opposite') {
      handlers.repeat_search('opposite', count);
      return true;
    }
    if (command.id === 'cursor:line_up') {
      handlers.move_json_cursor(-count);
      return true;
    }
    if (command.id === 'cursor:line_down') {
      handlers.move_json_cursor(count);
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
    if (command.id === 'viewport:line_up') {
      handlers.move_json_cursor(-count);
      return true;
    }
    if (command.id === 'viewport:line_down') {
      handlers.move_json_cursor(count);
      return true;
    }
    if (command.id === 'viewport:half_page_up') {
      handlers.move_json_cursor(-context.half_page_size * count);
      return true;
    }
    if (command.id === 'viewport:half_page_down') {
      handlers.move_json_cursor(context.half_page_size * count);
      return true;
    }
    if (command.id === 'viewport:page_up') {
      handlers.move_json_cursor(-context.page_size * count);
      return true;
    }
    if (command.id === 'viewport:page_down') {
      handlers.move_json_cursor(context.page_size * count);
      return true;
    }
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

function PlayersStateWidget(props: {
  right_pane_width: number;
  player_state_header: string;
  player_state_separator: string;
  visible_player_rows: PlayerStateRow[];
  effective_player_offset: number;
  selected_player_index: number | null;
  selected_player_status_prefix: string;
  selected_player_marker_lines: Array<{ text: string; color: string }>;
}): React.ReactElement {
  return (
    <>
      <Text>{fit_line(props.player_state_header, props.right_pane_width)}</Text>
      <Text color="gray">{fit_line(props.player_state_separator, props.right_pane_width)}</Text>
      {props.visible_player_rows.length > 0 ? (
        props.visible_player_rows.map((row, index) => {
          const absolute_index = props.effective_player_offset + index;
          const selected = absolute_index === (props.selected_player_index ?? -1);
          return (
            <Text
              key={`player-state-${row.key}`}
              bold={selected}
              italic={row.italic}
              strikethrough={row.strikethrough}
              wrap="truncate-end"
            >
              <Text>{selected ? '>  ' : '   '}</Text>
              <Text>{`${row.seat}   `}</Text>
              <Text color={row.identity_color}>{`${row.identity} `}</Text>
              <Text>{`${row.vote} `}</Text>
              <Text>{`${row.markers.padEnd(7, ' ')} `}</Text>
              <Text color={row.type_color}>{row.type}</Text>
              <Text> </Text>
              <Text color={row.role_color}>{row.role}</Text>
              <Text>{row.suffix}</Text>
            </Text>
          );
        })
      ) : (
        <Text>(no players)</Text>
      )}
      <Text wrap="truncate-end">
        <Text color="gray">{props.selected_player_status_prefix}</Text>
        {props.selected_player_marker_lines.length > 0 ? (
          props.selected_player_marker_lines.map((marker, index) => (
            <Text key={`selected-player-marker-${index}`}>
              <Text color={marker.color}>{marker.text}</Text>
              <Text>{index < props.selected_player_marker_lines.length - 1 ? ', ' : ''}</Text>
            </Text>
          ))
        ) : (
          <Text color="gray">(none)</Text>
        )}
      </Text>
    </>
  );
}

function TextStateWidget(props: { lines: string[] }): React.ReactElement {
  return <>{props.lines.map((line, index) => <Text key={`state-line-${index}`}>{line}</Text>)}</>;
}

function JsonStateWidget(props: {
  lines: string[];
  offset: number;
  selected_index: number | null;
  matched_indices: Set<number>;
}): React.ReactElement {
  return (
    <>
      {props.lines.map((line, index) => {
        const absolute = props.offset + index;
        const selected = props.selected_index === absolute;
        const matched = props.matched_indices.has(absolute);
        const color = selected ? 'black' : matched ? 'yellow' : 'white';
        const content = `${selected ? '> ' : '  '}${line}`;
        if (selected) {
          return (
            <Text
              key={`state-json-${absolute}`}
              color={color}
              backgroundColor="white"
              bold
              wrap="truncate-end"
            >
              {content}
            </Text>
          );
        }
        return (
          <Text
            key={`state-json-${absolute}`}
            color={color}
            bold={matched}
            wrap="truncate-end"
          >
            {content}
          </Text>
        );
      })}
    </>
  );
}

export function StatePane(props: {
  pane_focus: 'events' | 'state';
  state_height: number;
  right_pane_width: number;
  state_mode: 'brief' | 'players' | 'json';
  title: string;
  panel_lines: string[];
  json_offset: number;
  json_selected_index: number | null;
  json_matched_indices: Set<number>;
  player_state_header: string;
  player_state_separator: string;
  visible_player_rows: PlayerStateRow[];
  effective_player_offset: number;
  selected_player_index: number | null;
  selected_player_status_prefix: string;
  selected_player_marker_lines: Array<{ text: string; color: string }>;
}): React.ReactElement {
  const {
    pane_focus,
    state_height,
    right_pane_width,
    state_mode,
    title,
    panel_lines,
    player_state_header,
    player_state_separator,
    visible_player_rows,
    effective_player_offset,
    selected_player_index,
    selected_player_status_prefix,
    selected_player_marker_lines
  } = props;

  return (
    <Box borderStyle="single" borderColor={pane_focus === 'state' ? 'green' : 'white'} flexDirection="column" height={state_height} paddingX={1}>
      <Text color="cyan">{title}</Text>
      {state_mode === 'players' ? (
        <PlayersStateWidget
          right_pane_width={right_pane_width}
          player_state_header={player_state_header}
          player_state_separator={player_state_separator}
          visible_player_rows={visible_player_rows}
          effective_player_offset={effective_player_offset}
          selected_player_index={selected_player_index}
          selected_player_status_prefix={selected_player_status_prefix}
          selected_player_marker_lines={selected_player_marker_lines}
        />
      ) : state_mode === 'json' ? (
        <JsonStateWidget
          lines={panel_lines}
          offset={props.json_offset}
          selected_index={props.json_selected_index}
          matched_indices={props.json_matched_indices}
        />
      ) : (
        <TextStateWidget lines={panel_lines} />
      )}
    </Box>
  );
}
