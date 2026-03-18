import React from 'react';
import { Box, Text } from 'ink';

import type { DomainEvent } from '../../domain/events.js';
import { EventSummaryRow } from '../event.js';

interface EventEntry {
  event: DomainEvent;
  event_index: number;
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
