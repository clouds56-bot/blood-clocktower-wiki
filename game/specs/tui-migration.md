# TUI Migration Design (Ink)

## Goal

Migrate the existing interactive CLI experience to a maintainable TUI while preserving deterministic engine behavior and script-mode workflows.

## Current Status

- Phase 1 complete: initial TUI app entrypoint exists.
- Phase 2 complete: parser and engine execution are reused from CLI.
- Phase 3 complete: multi-panel layout, inspector panel, focus cycling, and command history navigation.
- Phase 3.5 complete: high-signal inspector modes (`overview`, `prompts`, `players`, `markers`).
- Phase 3.6 complete: floating prompt resolve window (keyboard-driven) in Ink TUI.
- Phase 3.7 complete: state panel mode cycle includes storyteller-dense `players` view.
- Phase 3.8 complete: focus model and player-state rendering are tuned for storyteller scan speed.

## Architecture Decision

- The TUI stack is Ink (React-based) instead of blessed.
- Reason: blessed is unmaintained; Ink has an active ecosystem and clearer component model.
- Runtime output transport is channel-based (`event`, `output`, `error`, `state`, `status`) instead of direct `stdout` coupling.
- Channel envelopes now carry structured payloads where available (for example `event` includes domain event object + index, `state` includes state snapshot).
- Short-term compatibility strategy:
  - keep command parser and engine command flow shared with CLI
  - keep script mode as CLI-only deterministic path
  - CLI subscribes channels and prints to stdout
  - TUI subscribes channels and routes messages to panes

## Next Phase (Phase 4)

Focus on making the TUI operationally complete for Storyteller workflows.

### 4.1 Runtime Extraction

- Extract command execution/state transition logic from `src/cli/repl.ts` into a shared runtime module (`src/cli/runtime.ts`).
- Provide a typed runtime API that returns structured results instead of writing directly to `stdout`.
- Keep `run_cli_script_file` deterministic and unchanged in behavior.

### 4.2 Structured Output Channels

- Replace stdout capture in TUI with explicit runtime outputs:
  - local/system messages
  - engine errors
  - emitted event rows
  - state/projection payloads
- Keep existing formatter strings for CLI output compatibility.

### 4.3 Prompt Action UX

- Add a prompt-focused action mode in TUI:
  - select pending prompt
  - select option (or enter freeform)
  - submit `ResolvePrompt` directly
- Keep typed command entry available as fallback.

### 4.4 Event and State Views

- Add event filter modes (`all`, `engine-only`, `errors`).
- Add sticky phase/day/night status indicators.
- Add compact projection switching (`storyteller`, `public`, `player <id>`) in inspector.

### 4.5 Prompt-Centric Interaction

- Add dedicated pending-prompt list selection and inline resolve actions.
- Add shortcuts for common prompt actions (`resolve`, `inspect`, `cancel`) with confirmation.
- Keep typed command fallback for full flexibility.

## Phase 5 Hardening

- Add TUI smoke tests for keybindings and command loop behavior where feasible.
- Add parser/runtime regression tests for runtime extraction.
- Ensure no script-mode behavior changes.
- Update README with final keymap and panel docs.

## Phase 4.6 Input Lifecycle Hardening (Current)

This phase tightens command/search/filter behavior and prepares command-palette style invocation.

### 4.6.1 Pane-Owned Search State

- Search session state should be owned by the target pane domain:
  - events pane owns event search lifecycle and repeat state;
  - state-json pane owns json search lifecycle and repeat state.
- App-level code should orchestrate routing and rendering only.
- Search lifecycle state machine remains `idle -> preview -> started`.

### 4.6.2 Dispatch-First Command Execution

- Prefer dispatching `TuiCommand` ids through pane/app command handlers instead of direct helper calls.
- Input sources (keyboard now, command palette later) should invoke the same command dispatch path.
- Pane handlers remain command-id based (`cursor:*`, `viewport:*`, `search:*`, `filter:*`).
- App input handling should use a central command dispatcher (`dispatch_tui_command`) as a single routing path.

### 4.6.3 Command-Mode Backspace Cancellation

- `:` command mode adopts the same empty-input backspace cancellation rule used by search/filter:
  - Backspace on empty input exits command mode.
  - Backspace on non-empty input deletes one character.

## Event Panel Design Decisions (Normative)

These decisions are locked for current TUI behavior and should guide future refinements.

### Layout and Interaction

- Left side uses a single framed `Events` panel.
- Selected-event details render as an in-panel floating overlay (no nested border).
- Overlay placement rules:
  - default near top;
  - move to bottom if selected row is in covered top area;
  - when there are no events, pin overlay to bottom.
- Event list viewport must remain stable regardless of detail content length.
- Details may wrap across multiple lines; summary rows must remain strict single-line.
- `event_key` is hidden by default in details and can be toggled.

### Event Summary Formatting

- Summary format is compact and event-specific, implemented in `src/tui/event.tsx`.
- `prompt_key` should be rendered as the final field for prompt/storyteller-related summaries (`pk=<prompt_key>`).
- Storyteller choice/ruling summaries should include note/freeform text when present.
- Fallback formatting should degrade to compact single-line JSON if no specific formatter exists.

### Visual Style Semantics

- Selected row uses white background.
- Selected row foreground stays black for contrast; boldness depends on base style:
  - base white style => bold black;
  - base gray style => non-bold black.
- Event color/style mapping:
  - setup/config events => gray;
  - phase events => bold blue;
  - wake events => gray;
  - `PromptQueued` => bold yellow;
  - other prompt events => yellow;
  - storyteller-related events => bold white;
  - death/execution events => red;
  - reminder marker events => bold magenta;
  - poison/drunk/health effect toggles => magenta.

### Mouse and Input Policy

- Mouse support (scroll in events pane) is enabled by default and can be toggled via keybinding (`Ctrl+M`).
- When enabled, wheel events in the events pane move selected event up/down.
- Escape sequences from mouse reporting must never leak into command input.
- Keep text selection/copy ergonomics intact by allowing mouse mode to be disabled via the toggle when needed.

## Input Mode Migration Decisions (Locked for Rebuild)

These decisions define the vim-like input model for the TUI rebuild.

### Modes

- Input is mode-based with `normal` as default.
- `:` enters command mode.
- `/` enters search mode for event summaries.

### Command and Search Cancellation

- `Esc` exits command/search mode without execution.
- `Backspace` on empty command/search input exits that mode.

### Navigation Keys and Counts

- In normal mode, `j` moves down and `k` moves up in the active pane behavior.
- No `jk` sequence-buffer logic is used; behavior is per single keypress.
- Numeric count prefixes apply to movement commands (for example `100j`).
- `gg` jumps to the first row/item; counted form `Ngg` jumps to index/row `N`.
- `G` jumps to the last row/item.
- Pane focus moves with `w`/`W` and cycles only between navigable panes (`events` and `state`), excluding command mode.

Overflow behavior:

- Events pane motion is saturating/clamped at bounds.
- Players pane motion wraps circularly at bounds.

### Search Repeat

- `/` only enters search mode (`mode:enter_search`) and does not preview by itself.
- Typing in search mode appends to input first (`mode:append_input`), then emits preview behavior (`search:preview`) from the current input value.
- Search lifecycle states are `idle`, `preview`, and `started`.
- `search:preview` is anchored and immediate; nearest match is chosen from anchor in current direction.
- `search:start` commits the current search input as started session.
- `search:end` exits search mode; if phase was `preview`, restore anchor; if phase was `started`, keep current line.
- `search:cancel` exits preview-only sessions and restores anchor.
- `Backspace` cancellation rule: only backspace on already-empty input cancels (`search:cancel`); if backspace makes input empty, do not auto-cancel.
- `n` maps to `search:forward_direction`; `N` maps to `search:backward_direction`.

### Filter Mode

- `?` only enters filter mode (`mode:enter_filter`) and does not preview by itself.
- Typing in filter mode appends to input first (`mode:append_input`), then emits preview behavior (`filter:preview`) from current input.
- `filter:start` commits current input as started filter session.
- `filter:end` exits filter mode; preview phase restores, started phase keeps current filtering.
- `filter:cancel` exits preview-only filter sessions.
- Backspace cancellation rule mirrors search: only backspace on already-empty input cancels.

### Vim-Style Event Viewport Scrolling

- `Ctrl+F` and `Ctrl+B` move one page down/up in the events pane.
- `Ctrl+D` and `Ctrl+U` move half page down/up in the events pane.
- `Ctrl+E` and `Ctrl+Y` move one line down/up in the events pane.
- These scroll motions also move selection/cursor to stay aligned with viewport movement.
- Internal command naming follows colon-style ids, with `cursor:line_*` for line motions and `viewport:*` for viewport motions.
- Search lifecycle command set: `search:preview`, `search:start`, `search:end`, `search:cancel`, `search:forward_direction`, `search:backward_direction`.
- Filter lifecycle command set: `filter:preview`, `filter:start`, `filter:end`, `filter:cancel`.
- Command routing is pane-first when possible; app handles global concerns, with `mode:*` treated as app-handled lifecycle.

### Runtime Subscription Stability

- Channel subscriptions should be stable and not re-created for visual state changes.
- Do not include rapidly changing view flags (for example autoscroll/layout rows) in subscription effect dependencies.
- Use refs for live read of mutable view-state inside subscribed handlers to avoid event-loss windows.

## State Panel Design Decisions (Normative)

These decisions lock the current storyteller-oriented state panel behavior.

### Focus and Input Principles

- Focus cycle is intentionally limited to `events <-> state` (`w`/`W`).
- `inspector` and `status` panes are always visible but are not focus targets.
- Command editing/submit is mode-based (`:` enters command mode) and not tied to a dedicated focus pane.
- Player selection (`Up`/`Down`) is active only when focus is `state` and state mode is `players`.
- Player selection wraps at boundaries (first <-> last).

### Players Mode Information Architecture

- Default state mode is `players` for operational play.
- Header line in players mode should show timing as a single label (`dN` or `nN`), current subphase, and alive count.
- Table columns are fixed-width and single-line to keep scanning stable under rapid updates.
- Markers column shows source seat ids for active reminders on each target player.
- Markers column width is capped/padded to preserve table alignment.

### Players Mode Visual Style Semantics

- Selected row uses marker (`>`) + bold emphasis; no background inversion.
- Dead players use strikethrough and gray id/name to reduce noise while preserving visibility.
- Drunk or poisoned players use italic row style.
- `type` column color reflects true alignment (`good` green, `evil` red, unknown gray).
- `role` column color reflects true character type (townsfolk/outsider/minion/demon/traveller mapping).

### Reminder Encoding Principles

- Bottom selected-player status line starts with `selected=<player_id>` and omits redundant counters for compactness.
- Reminder summaries are grouped by kind/effect and list source seats as comma-separated values.
- Source-seat color in reminder summaries and markers follows effect semantics:
  - poison/drunk effects => magenta;
  - protect effects => green;
  - no effect => gray;
  - any other effect => default foreground.

## Non-Goals

- No replacement of script mode with TUI workflows.
- No change to command parser syntax in this migration.
- No changes to domain engine rules behavior.
