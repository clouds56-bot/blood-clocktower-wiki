import React from 'react';
import { Box, Text } from 'ink';

export type VimMode = 'normal' | 'command' | 'search' | 'filter';

export function CommandPane(props: {
  pane_focus: 'events' | 'state';
  input_height: number;
  command_width: number;
  mode: VimMode;
  input: string;
  count_prefix: string;
  pending_g: boolean;
}): React.ReactElement {
  const prefix = props.mode === 'command'
    ? 'Command: '
    : props.mode === 'search'
      ? 'Search / '
      : props.mode === 'filter'
        ? 'Filter ? '
        : 'Normal ';
  const body = props.mode === 'normal'
    ? `[count=${props.count_prefix || '1'}${props.pending_g ? ' g' : ''}] : command, / search, ? filter, j/k move, gg/G`
    : props.input;
  const borderColor = props.mode === 'search' ? 'yellow' : props.mode === 'filter' ? 'cyan' : 'white';
  return (
    <Box borderStyle="single" borderColor={borderColor} paddingX={1} height={props.input_height}>
      <Text color="green">{prefix}</Text>
      <Text>{body.slice(0, props.command_width)}</Text>
    </Box>
  );
}
