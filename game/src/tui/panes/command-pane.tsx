import React from 'react';
import { Box, Text } from 'ink';

export type VimMode = 'normal' | 'command' | 'search' | 'filter';
type PaneFocus = 'events' | 'state';
type StateMode = 'brief' | 'players' | 'json';
type SearchTarget = 'events' | 'state_json';

function resolve_search_target(mode_return_focus: PaneFocus, mode_return_state_mode: StateMode): SearchTarget {
  return mode_return_focus === 'state' && mode_return_state_mode === 'json' ? 'state_json' : 'events';
}

export function handle_command_mode_command(
  command: { id: string; text?: string; direction?: 1 | -1 },
  context: {
    mode: VimMode;
    input: string;
    history: string[];
    history_cursor: number | null;
    pane_focus: PaneFocus;
    state_mode: StateMode;
    mode_return_focus: PaneFocus;
    mode_return_state_mode: StateMode;
    search_entry_direction: 1 | -1;
  },
  handlers: {
    set_mode: (mode: VimMode) => void;
    set_input: (value: string | ((previous: string) => string)) => void;
    set_history: (updater: (previous: string[]) => string[]) => void;
    set_history_cursor: (value: number | null | ((previous: number | null) => number | null)) => void;
    set_mode_return_context: (pane_focus: PaneFocus, state_mode: StateMode) => void;
    set_search_entry_direction: (direction: 1 | -1) => void;
    set_pane_focus: (focus: PaneFocus) => void;
    start_search_session: (target: SearchTarget) => void;
    cancel_search: (target: SearchTarget) => void;
    apply_search_preview: (target: SearchTarget, query: string, direction: 1 | -1) => void;
    apply_search_commit: (target: SearchTarget, query: string, direction: 1 | -1) => void;
    clear_search: (target: SearchTarget) => void;
    apply_filter_preview: (query: string) => void;
    apply_filter_commit: (query: string) => void;
    run_command: (command_text: string) => boolean;
    exit: () => void;
  }
): boolean {
  if (command.id === 'mode:history_up') {
    if (context.history.length === 0) {
      return true;
    }
    const next_cursor = context.history_cursor === null
      ? context.history.length - 1
      : Math.max(0, context.history_cursor - 1);
    handlers.set_history_cursor(next_cursor);
    handlers.set_input(context.history[next_cursor] ?? '');
    return true;
  }

  if (command.id === 'mode:history_down') {
    if (context.history.length === 0) {
      return true;
    }
    if (context.history_cursor === null) {
      return true;
    }
    const next_cursor = context.history_cursor + 1;
    if (next_cursor >= context.history.length) {
      handlers.set_history_cursor(null);
      handlers.set_input('');
      return true;
    }
    handlers.set_history_cursor(next_cursor);
    handlers.set_input(context.history[next_cursor] ?? '');
    return true;
  }

  if (command.id === 'mode:enter_command') {
    handlers.set_mode_return_context(context.pane_focus, context.state_mode);
    handlers.set_mode('command');
    handlers.set_input('');
    handlers.set_history_cursor(null);
    return true;
  }

  if (command.id === 'mode:enter_search' || command.id === 'search:start') {
    const target = resolve_search_target(context.pane_focus, context.state_mode);
    handlers.set_mode_return_context(context.pane_focus, context.state_mode);
    handlers.start_search_session(target);
    handlers.set_search_entry_direction(command.direction ?? -1);
    handlers.set_mode('search');
    handlers.set_input('');
    handlers.set_history_cursor(null);
    return true;
  }

  if (command.id === 'mode:enter_filter' || command.id === 'filter:start') {
    handlers.set_mode_return_context(context.pane_focus, context.state_mode);
    handlers.set_mode('filter');
    handlers.set_input('');
    handlers.set_history_cursor(null);
    return true;
  }

  if (command.id === 'mode:cancel' || command.id === 'search:end' || command.id === 'filter:end') {
    if (context.mode === 'search' || command.id === 'search:end') {
      const target = resolve_search_target(context.mode_return_focus, context.mode_return_state_mode);
      handlers.cancel_search(target);
    }
    handlers.set_input('');
    handlers.set_history_cursor(null);
    handlers.set_mode('normal');
    handlers.set_pane_focus(context.mode_return_focus);
    return true;
  }

  if (command.id === 'mode:submit') {
    if (context.mode === 'command') {
      const command_text = context.input.trim();
      if (command_text.length === 0) {
        handlers.set_mode('normal');
        handlers.set_input('');
        handlers.set_pane_focus(context.mode_return_focus);
        return true;
      }
      handlers.set_history((previous) => [...previous, command_text]);
      handlers.set_history_cursor(null);
      handlers.set_input('');
      handlers.set_mode('normal');
      handlers.set_pane_focus(context.mode_return_focus);
      const keep_running = handlers.run_command(command_text);
      if (!keep_running) {
        handlers.exit();
      }
      return true;
    }

    if (context.mode === 'search') {
      const query = context.input.trim();
      const target = resolve_search_target(context.mode_return_focus, context.mode_return_state_mode);
      if (query.length === 0) {
        handlers.cancel_search(target);
        handlers.clear_search(target);
      } else {
        handlers.apply_search_commit(target, query, context.search_entry_direction);
      }
      handlers.set_input('');
      handlers.set_mode('normal');
      handlers.set_pane_focus(context.mode_return_focus);
      return true;
    }

    if (context.mode === 'filter') {
      handlers.apply_filter_commit(context.input.trim());
      handlers.set_input('');
      handlers.set_mode('normal');
      handlers.set_pane_focus(context.mode_return_focus);
      return true;
    }

    return true;
  }

  if (command.id === 'mode:backspace') {
    handlers.set_input((previous) => {
      if (previous.length === 0) {
        handlers.set_mode('normal');
        handlers.set_pane_focus(context.mode_return_focus);
        return '';
      }
      const next = previous.slice(0, -1);
      if (context.mode === 'search') {
        const target = resolve_search_target(context.mode_return_focus, context.mode_return_state_mode);
        handlers.apply_search_preview(target, next.trim(), context.search_entry_direction);
      }
      if (context.mode === 'filter') {
        handlers.apply_filter_preview(next.trim());
      }
      return next;
    });
    return true;
  }

  if (command.id === 'mode:append_input') {
    const value = command.text ?? '';
    handlers.set_input((current) => {
      const next = `${current}${value}`;
      if (context.mode === 'search') {
        const target = resolve_search_target(context.mode_return_focus, context.mode_return_state_mode);
        handlers.apply_search_preview(target, next.trim(), context.search_entry_direction);
      }
      if (context.mode === 'filter') {
        handlers.apply_filter_preview(next.trim());
      }
      return next;
    });
    return true;
  }

  return false;
}

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
