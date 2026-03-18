import React from 'react';
import { Box, Text } from 'ink';

export function StatusPane(props: {
  status_height: number;
  status_errors_only: boolean;
  lines: string[];
}): React.ReactElement {
  return (
    <Box borderStyle="single" borderColor="white" flexDirection="column" height={props.status_height} paddingX={1}>
      <Text color="cyan">Status (errors_only={props.status_errors_only})</Text>
      {props.lines.map((line, index) => <Text key={`status-${index}`}>{line}</Text>)}
    </Box>
  );
}
