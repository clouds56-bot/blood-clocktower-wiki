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

export interface ShortcutContext {
  suppress_input: boolean;
  mode: VimMode;
  pane_focus: PaneFocus;
  state_mode: StateMode;
  count_prefix: string;
  pending_g: boolean;
  history_length: number;
  event_count: number;
  player_count: number;
  player_visible_count: number;
}

export interface ShortcutHandlers {
  exit: () => void;
  open_resolver: () => void;
  cycle_focus_forward: () => void;
  cycle_focus_backward: () => void;
  toggle_event_autoscroll: () => void;
  toggle_mouse_scroll: () => void;
  toggle_event_key: () => void;
  jump_latest_event: () => void;
  toggle_status_errors_only: () => void;
  scroll_events_by: (delta: number) => void;
  page_events_by: (delta_pages: number) => void;
  half_page_events_by: (delta_half_pages: number) => void;
  cycle_state_mode: () => void;
  cycle_inspector_mode: () => void;
  step_event_selection: (delta: number) => void;
  step_player_selection: (delta: number, total_count: number, visible_count: number) => void;
  history_up: () => void;
  history_down: () => void;
  mode_enter: (mode: VimMode) => void;
  mode_cancel: () => void;
  mode_submit: () => void;
  mode_append: (value: string) => void;
  mode_backspace: () => void;
  set_count_prefix: (value: string) => void;
  clear_count_prefix: () => void;
  set_pending_g: (value: boolean) => void;
  jump_top: (count: number | null) => void;
  jump_bottom: () => void;
  search_repeat: (kind: 'same' | 'opposite', count: number) => void;
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

function reset_motion_state(handlers: ShortcutHandlers): void {
  handlers.clear_count_prefix();
  handlers.set_pending_g(false);
}

export function handle_tui_shortcut(
  input_key: string,
  key: InputKey,
  context: ShortcutContext,
  handlers: ShortcutHandlers
): boolean {
  if (key.ctrl && input_key === 'c') {
    handlers.exit();
    return true;
  }

  if (context.suppress_input && !key.ctrl && !key.meta && !key.return) {
    return true;
  }

  if (key.ctrl && input_key === 'r') {
    handlers.open_resolver();
    return true;
  }

  if (context.mode === 'command' || context.mode === 'search' || context.mode === 'filter') {
    if (key.escape) {
      handlers.mode_cancel();
      return true;
    }
    if (key.return) {
      handlers.mode_submit();
      return true;
    }
    if (key.backspace || key.delete) {
      handlers.mode_backspace();
      return true;
    }

    if (context.mode === 'command' && key.upArrow) {
      handlers.history_up();
      return true;
    }
    if (context.mode === 'command' && key.downArrow) {
      handlers.history_down();
      return true;
    }

    if (!key.ctrl && !key.meta && !key.tab && input_key.length > 0) {
      handlers.mode_append(input_key);
      return true;
    }
    return true;
  }

  if (context.mode === 'normal' && input_key === 'w') {
    handlers.cycle_focus_forward();
    return true;
  }
  if (context.mode === 'normal' && input_key === 'W') {
    handlers.cycle_focus_backward();
    return true;
  }
  if (key.ctrl && input_key === 'w') {
    handlers.cycle_focus_forward();
    return true;
  }
  if (key.ctrl && input_key === 'a') {
    handlers.toggle_event_autoscroll();
    return true;
  }
  if (key.ctrl && input_key === 'm') {
    handlers.toggle_mouse_scroll();
    return true;
  }
  if (key.ctrl && input_key === 'k') {
    handlers.toggle_event_key();
    return true;
  }
  if (key.ctrl && input_key === 'l') {
    handlers.jump_latest_event();
    return true;
  }
  if (key.ctrl && input_key === 'e') {
    if (context.pane_focus === 'events') {
      handlers.scroll_events_by(1);
    } else {
      handlers.toggle_status_errors_only();
    }
    return true;
  }
  if (key.ctrl && input_key === 'y') {
    if (context.pane_focus === 'events') {
      handlers.scroll_events_by(-1);
    }
    return true;
  }
  if (key.ctrl && input_key === 'u') {
    if (context.pane_focus === 'events') {
      handlers.half_page_events_by(-1);
    }
    return true;
  }
  if (key.ctrl && input_key === 'd') {
    if (context.pane_focus === 'events') {
      handlers.half_page_events_by(1);
    }
    return true;
  }
  if (key.ctrl && input_key === 'b') {
    if (context.pane_focus === 'events') {
      handlers.page_events_by(-1);
    }
    return true;
  }
  if (key.ctrl && input_key === 'f') {
    if (context.pane_focus === 'events') {
      handlers.page_events_by(1);
    }
    return true;
  }
  if (key.ctrl && input_key === 's') {
    handlers.cycle_state_mode();
    return true;
  }
  if (key.ctrl && input_key === 'g') {
    handlers.cycle_inspector_mode();
    return true;
  }

  if (key.escape) {
    reset_motion_state(handlers);
    return true;
  }

  if (input_key === ':') {
    reset_motion_state(handlers);
    handlers.mode_enter('command');
    return true;
  }
  if (input_key === '/') {
    reset_motion_state(handlers);
    handlers.mode_enter('search');
    return true;
  }
  if (input_key === '?') {
    reset_motion_state(handlers);
    handlers.mode_enter('filter');
    return true;
  }

  if (/^[0-9]$/.test(input_key)) {
    const next = `${context.count_prefix}${input_key}`.slice(0, 8);
    handlers.set_count_prefix(next);
    return true;
  }

  const count = parse_count(context.count_prefix);
  if (context.pending_g) {
    if (input_key === 'g') {
      handlers.jump_top(context.count_prefix.length > 0 ? count : null);
      reset_motion_state(handlers);
      return true;
    }
    handlers.set_pending_g(false);
  }

  if (input_key === 'g') {
    handlers.set_pending_g(true);
    return true;
  }

  if (input_key === 'j' || key.downArrow) {
    if (context.pane_focus === 'events') {
      handlers.step_event_selection(count);
    } else if (context.pane_focus === 'state' && context.state_mode === 'players') {
      handlers.step_player_selection(count, context.player_count, context.player_visible_count);
    }
    reset_motion_state(handlers);
    return true;
  }
  if (input_key === 'k' || key.upArrow) {
    if (context.pane_focus === 'events') {
      handlers.step_event_selection(-count);
    } else if (context.pane_focus === 'state' && context.state_mode === 'players') {
      handlers.step_player_selection(-count, context.player_count, context.player_visible_count);
    }
    reset_motion_state(handlers);
    return true;
  }

  if (input_key === 'G') {
    handlers.jump_bottom();
    reset_motion_state(handlers);
    return true;
  }

  if (input_key === 'n') {
    handlers.search_repeat('same', count);
    reset_motion_state(handlers);
    return true;
  }
  if (input_key === 'N') {
    handlers.search_repeat('opposite', count);
    reset_motion_state(handlers);
    return true;
  }

  if (key.tab) {
    return true;
  }

  return false;
}
