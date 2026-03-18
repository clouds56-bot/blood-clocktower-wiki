export interface InputKey {
  ctrl?: boolean;
  meta?: boolean;
  return?: boolean;
  escape?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  backspace?: boolean;
  delete?: boolean;
  tab?: boolean;
}

type PaneFocus = 'events' | 'state';
type StateMode = 'brief' | 'players' | 'json';
type VimMode = 'normal' | 'command' | 'search' | 'filter';

export interface TuiCommand {
  id: string;
  count?: number;
  text?: string;
  direction?: 1 | -1;
  pattern?: string;
}

export interface CommandBindingContext {
  suppress_input: boolean;
  mode: VimMode;
  pane_focus: PaneFocus;
  state_mode: StateMode;
  count_prefix: string;
  pending_g: boolean;
  mode_input: string;
  search_entry_direction: 1 | -1;
}

export interface CommandBindingResult {
  handled: boolean;
  command: TuiCommand | null;
  count_prefix: string;
  pending_g: boolean;
}

function parse_count(prefix: string): number {
  if (prefix.length === 0) {
    return 1;
  }
  const parsed = Number.parseInt(prefix, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }
  return parsed;
}

function result(
  handled: boolean,
  command: TuiCommand | null,
  count_prefix: string,
  pending_g: boolean
): CommandBindingResult {
  return { handled, command, count_prefix, pending_g };
}

export function resolve_tui_command(
  input_key: string,
  key: InputKey,
  context: CommandBindingContext
): CommandBindingResult {
  let next_count = context.count_prefix;
  let next_pending_g = context.pending_g;

  if (key.ctrl && input_key === 'c') {
    return result(true, { id: 'app:exit' }, next_count, next_pending_g);
  }

  if (context.suppress_input && !key.ctrl && !key.meta && !key.return) {
    return result(true, null, next_count, next_pending_g);
  }

  if (context.mode === 'command' || context.mode === 'search' || context.mode === 'filter') {
    if (context.mode === 'search') {
      if (key.escape || key.backspace || key.delete) {
        return result(true, { id: 'search:cancel' }, next_count, next_pending_g);
      }
      if (key.return) {
        const pattern = context.mode_input.trim();
        if (pattern.length === 0) {
          return result(true, { id: 'search:end' }, next_count, next_pending_g);
        }
        return result(true, { id: 'search:start', direction: context.search_entry_direction, pattern }, next_count, next_pending_g);
      }
      if (!key.ctrl && !key.meta && !key.tab && input_key.length > 0) {
        return result(
          true,
          { id: 'search:preview', direction: context.search_entry_direction, pattern: `${context.mode_input}${input_key}` },
          next_count,
          next_pending_g
        );
      }
      return result(true, null, next_count, next_pending_g);
    }

    if (context.mode === 'filter') {
      if (key.escape || key.backspace || key.delete) {
        return result(true, { id: 'filter:cancel' }, next_count, next_pending_g);
      }
      if (key.return) {
        const pattern = context.mode_input.trim();
        if (pattern.length === 0) {
          return result(true, { id: 'filter:end' }, next_count, next_pending_g);
        }
        return result(true, { id: 'filter:start', pattern }, next_count, next_pending_g);
      }
      if (!key.ctrl && !key.meta && !key.tab && input_key.length > 0) {
        return result(
          true,
          { id: 'filter:preview', pattern: `${context.mode_input}${input_key}` },
          next_count,
          next_pending_g
        );
      }
      return result(true, null, next_count, next_pending_g);
    }

    if (key.escape) {
      return result(true, { id: 'mode:cancel' }, next_count, next_pending_g);
    }
    if (key.return) {
      return result(true, { id: 'mode:submit' }, next_count, next_pending_g);
    }
    if (key.backspace || key.delete) {
      return result(true, { id: 'mode:backspace' }, next_count, next_pending_g);
    }

    if (context.mode === 'command' && key.upArrow) {
      return result(true, { id: 'mode:history_up' }, next_count, next_pending_g);
    }
    if (context.mode === 'command' && key.downArrow) {
      return result(true, { id: 'mode:history_down' }, next_count, next_pending_g);
    }

    if (!key.ctrl && !key.meta && !key.tab && input_key.length > 0) {
      return result(true, { id: 'mode:append_input', text: input_key }, next_count, next_pending_g);
    }
    return result(true, null, next_count, next_pending_g);
  }

  if (key.ctrl && input_key === 'r') {
    return result(true, { id: 'resolver:open' }, next_count, next_pending_g);
  }
  if (input_key === 'w') {
    return result(true, { id: 'pane:focus_next' }, next_count, next_pending_g);
  }
  if (input_key === 'W') {
    return result(true, { id: 'pane:focus_prev' }, next_count, next_pending_g);
  }
  if (key.ctrl && input_key === 'w') {
    return result(true, { id: 'pane:focus_next' }, next_count, next_pending_g);
  }
  if (key.ctrl && input_key === 'a') {
    return result(true, { id: 'events:toggle_autoscroll' }, next_count, next_pending_g);
  }
  if (key.ctrl && input_key === 'm') {
    return result(true, { id: 'events:toggle_mouse_scroll' }, next_count, next_pending_g);
  }
  if (key.ctrl && input_key === 'k') {
    return result(true, { id: 'events:toggle_key' }, next_count, next_pending_g);
  }
  if (key.ctrl && input_key === 'l') {
    return result(true, { id: 'events:jump_latest' }, next_count, next_pending_g);
  }
  if (key.ctrl && input_key === 'f') {
    if (context.pane_focus === 'events' || (context.pane_focus === 'state' && context.state_mode === 'json')) {
      return result(true, { id: 'viewport:page_down' }, next_count, next_pending_g);
    }
    return result(true, null, next_count, next_pending_g);
  }
  if (key.ctrl && input_key === 'b') {
    if (context.pane_focus === 'events' || (context.pane_focus === 'state' && context.state_mode === 'json')) {
      return result(true, { id: 'viewport:page_up' }, next_count, next_pending_g);
    }
    return result(true, null, next_count, next_pending_g);
  }
  if (key.ctrl && input_key === 'd') {
    if (context.pane_focus === 'events' || (context.pane_focus === 'state' && context.state_mode === 'json')) {
      return result(true, { id: 'viewport:half_page_down' }, next_count, next_pending_g);
    }
    return result(true, null, next_count, next_pending_g);
  }
  if (key.ctrl && input_key === 'u') {
    if (context.pane_focus === 'events' || (context.pane_focus === 'state' && context.state_mode === 'json')) {
      return result(true, { id: 'viewport:half_page_up' }, next_count, next_pending_g);
    }
    return result(true, null, next_count, next_pending_g);
  }
  if (key.ctrl && input_key === 'e') {
    if (context.pane_focus === 'events' || (context.pane_focus === 'state' && context.state_mode === 'json')) {
      return result(true, { id: 'viewport:line_down' }, next_count, next_pending_g);
    }
    return result(true, { id: 'status:toggle_errors_only' }, next_count, next_pending_g);
  }
  if (key.ctrl && input_key === 'y') {
    if (context.pane_focus === 'events' || (context.pane_focus === 'state' && context.state_mode === 'json')) {
      return result(true, { id: 'viewport:line_up' }, next_count, next_pending_g);
    }
    return result(true, null, next_count, next_pending_g);
  }
  if (key.ctrl && input_key === 's') {
    return result(true, { id: 'state:cycle_mode' }, next_count, next_pending_g);
  }
  if (key.ctrl && input_key === 'g') {
    return result(true, { id: 'inspector:cycle_mode' }, next_count, next_pending_g);
  }

  if (key.escape) {
    return result(true, null, '', false);
  }

  if (input_key === ':') {
    return result(true, { id: 'mode:enter_command' }, '', false);
  }
  if (input_key === '/') {
    if (context.pane_focus === 'state' && context.state_mode === 'json') {
      return result(true, { id: 'mode:enter_search', direction: 1 }, '', false);
    }
    return result(true, { id: 'mode:enter_search', direction: -1 }, '', false);
  }
  if (input_key === '?') {
    if (context.pane_focus === 'state' && context.state_mode === 'json') {
      return result(true, { id: 'mode:enter_search', direction: -1 }, '', false);
    }
    return result(true, { id: 'mode:enter_filter' }, '', false);
  }

  if (/^[0-9]$/.test(input_key)) {
    next_count = `${context.count_prefix}${input_key}`.slice(0, 8);
    return result(true, null, next_count, next_pending_g);
  }

  const count = parse_count(context.count_prefix);
  if (next_pending_g) {
    if (input_key === 'g') {
      const jump_top_command: TuiCommand = context.count_prefix.length > 0
        ? { id: 'cursor:jump_top', count }
        : { id: 'cursor:jump_top' };
      return result(
        true,
        jump_top_command,
        '',
        false
      );
    }
    next_pending_g = false;
  }

  if (input_key === 'g') {
    return result(true, null, next_count, true);
  }

  if (input_key === 'j' || key.downArrow) {
    return result(true, { id: 'cursor:line_down', count }, '', false);
  }
  if (input_key === 'k' || key.upArrow) {
    return result(true, { id: 'cursor:line_up', count }, '', false);
  }
  if (input_key === 'G') {
    return result(true, { id: 'cursor:jump_bottom' }, '', false);
  }
  if (input_key === 'n') {
    return result(true, { id: 'search:forward_direction', count }, '', false);
  }
  if (input_key === 'N') {
    return result(true, { id: 'search:backward_direction', count }, '', false);
  }
  if (key.tab) {
    return result(true, null, next_count, next_pending_g);
  }

  return result(false, null, next_count, next_pending_g);
}

export function route_tui_command(command: TuiCommand, context: {
  pane_focus: PaneFocus;
  state_mode: StateMode;
}): 'app' | 'pane' {
  if (
    command.id.startsWith('cursor:')
    || command.id.startsWith('viewport:')
    || command.id.startsWith('search:')
    || command.id.startsWith('filter:')
    || command.id.startsWith('state:')
    || command.id.startsWith('inspector:')
  ) {
    if (context.pane_focus === 'events') {
      return 'pane';
    }
    if (context.pane_focus === 'state' && context.state_mode === 'json') {
      return 'pane';
    }
    if (context.pane_focus === 'state' && context.state_mode === 'players' && command.id.startsWith('cursor:')) {
      return 'pane';
    }
    return 'app';
  }
  return 'app';
}
