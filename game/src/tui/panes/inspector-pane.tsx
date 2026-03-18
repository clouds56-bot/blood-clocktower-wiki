import React from 'react';
import { Box, Text } from 'ink';

export function InspectorPane(props: {
  inspector_height: number;
  inspector_mode: 'overview' | 'prompts' | 'players' | 'markers' | 'output';
  lines: string[];
}): React.ReactElement {
  return (
    <Box borderStyle="single" borderColor="white" flexDirection="column" height={props.inspector_height} paddingX={1}>
      <Text color="cyan">Inspector ({props.inspector_mode})</Text>
      {props.lines.map((line, index) => <Text key={`inspector-${index}`}>{line}</Text>)}
    </Box>
  );
}
