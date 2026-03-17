# TUI Migration Design (Blessed)

## Goal

Migrate the existing interactive CLI experience to a maintainable TUI while preserving deterministic engine behavior and script-mode workflows.

## Current Status

- Phase 1 complete: initial blessed app entrypoint exists.
- Phase 2 complete: parser and engine execution are reused from CLI.
- Phase 3 complete: multi-panel layout, inspector panel, focus cycling, and command history navigation.

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

## Phase 5 Hardening

- Add TUI smoke tests for keybindings and command loop behavior where feasible.
- Add parser/runtime regression tests for runtime extraction.
- Ensure no script-mode behavior changes.
- Update README with final keymap and panel docs.

## Non-Goals

- No replacement of script mode with TUI workflows.
- No change to command parser syntax in this migration.
- No changes to domain engine rules behavior.
