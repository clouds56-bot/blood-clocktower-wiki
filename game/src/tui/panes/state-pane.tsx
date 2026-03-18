import React from 'react';
import { Box, Text } from 'ink';

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

export function handle_state_pane_command(
  command: { id: string; count?: number },
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
  }
): boolean {
  const count = Math.max(1, command.count ?? 1);
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
