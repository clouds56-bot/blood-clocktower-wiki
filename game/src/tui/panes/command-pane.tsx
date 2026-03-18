import React from 'react';
import { Box, Text } from 'ink';

export type VimMode = 'normal' | 'command' | 'search';

export function CommandPane(props: {
  pane_focus: 'events' | 'state' | 'command';
  input_height: number;
  command_width: number;
  mode: VimMode;
  input: string;
  count_prefix: string;
  pending_g: boolean;
}): React.ReactElement {
  const prefix = props.mode === 'command' ? 'Command: ' : props.mode === 'search' ? 'Search / ' : 'Normal ';
  const body = props.mode === 'normal'
    ? `[count=${props.count_prefix || '1'}${props.pending_g ? ' g' : ''}] : command, / search, j/k move, gg top`
    : props.input;
  return (
    <Box borderStyle="single" borderColor={props.pane_focus === 'command' ? 'green' : 'white'} paddingX={1} height={props.input_height}>
      <Text color="green">{prefix}</Text>
      <Text>{body.slice(0, props.command_width)}</Text>
    </Box>
  );
}
