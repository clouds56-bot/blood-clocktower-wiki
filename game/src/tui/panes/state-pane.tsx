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

function fit_line(text: string, width: number): string {
  if (width <= 0) {
    return '';
  }
  const clipped = text.length > width ? text.slice(0, width) : text;
  return clipped.padEnd(width, ' ');
}

export function StatePane(props: {
  pane_focus: 'events' | 'state';
  state_height: number;
  right_pane_width: number;
  state_mode: 'brief' | 'players' | 'json';
  title: string;
  panel_lines: string[];
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
        <>
          <Text>{fit_line(player_state_header, right_pane_width)}</Text>
          <Text color="gray">{fit_line(player_state_separator, right_pane_width)}</Text>
          {visible_player_rows.length > 0 ? (
            visible_player_rows.map((row, index) => {
              const absolute_index = effective_player_offset + index;
              const selected = absolute_index === (selected_player_index ?? -1);
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
            <Text color="gray">{selected_player_status_prefix}</Text>
            {selected_player_marker_lines.length > 0 ? (
              selected_player_marker_lines.map((marker, index) => (
                <Text key={`selected-player-marker-${index}`}>
                  <Text color={marker.color}>{marker.text}</Text>
                  <Text>{index < selected_player_marker_lines.length - 1 ? ', ' : ''}</Text>
                </Text>
              ))
            ) : (
              <Text color="gray">(none)</Text>
            )}
          </Text>
        </>
      ) : (
        panel_lines.map((line, index) => <Text key={`state-line-${index}`}>{line}</Text>)
      )}
    </Box>
  );
}
