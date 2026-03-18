# Game Engine CLI

Interactive CLI for the `game` package (Phase 6, with Phase 5.5 reminder markers).

It lets you run engine commands, inspect emitted events, and inspect state while staying event-driven (`handle_command` + `apply_events`).

## Planning Docs

- `game/architecture.md` - engine architecture and phased delivery.
- `game/speckit-plan.md` - milestone plan and test matrix.

## Run

From repo root:

```bash
pnpm --filter game run cli
```

Run the TUI:

```bash
pnpm --filter game run tui
```

Optionally pass initial game id:

```bash
pnpm --filter game run cli -- my_game
```

```bash
pnpm --filter game run tui -- my_game
```

## TUI

- The TUI is implemented with Ink (React for CLIs), replacing blessed.
- It reuses the same command parser and engine command flow as CLI.
- Type the same commands in the bottom input box (`help`, `start bmr 7`, `next`, etc.).
- Panels:
  - left: event channel log
  - right top: live state snapshot
  - right middle: inspector panel (overview, prompts, players, markers, output)
  - right bottom: status channel log (errors/status/commands)
- Keybindings:
  - `Ctrl+R`: open floating prompt resolver window
    - normal prompts: choose prompt, then choose option
    - multi-column prompts: `Left/Right` switch column, `Up/Down` choose value, `Enter` resolve
  - `w` / `W`: cycle focused pane (`events <-> state`)
  - `:` enter command mode, `Enter` run command, `Esc` cancel
  - `/` enter immediate search mode in events, `Enter` commit, `/<enter>` clear search
  - `?` enter immediate filter mode in events, `?<enter>` clear filter
  - `j` / `k`: move down/up in focused pane (`events` clamped, `players` wrapped)
  - `gg` / `G`: jump to first/last row; count supported for motions (for example `100j`, `100gg`)
  - `n` / `N`: repeat search same/opposite direction
  - `Ctrl+F` / `Ctrl+B`: page down/up in events (moves cursor)
  - `Ctrl+D` / `Ctrl+U`: half-page down/up in events (moves cursor)
  - `Ctrl+E` / `Ctrl+Y`: line down/up in events (moves cursor)
  - `Ctrl+E` (outside events): toggle status pane filter (errors only)
  - `Ctrl+S`: cycle state panel (`brief -> players -> json`)
  - `Ctrl+G`: cycle inspector panel (`overview -> prompts -> players -> markers -> output`)
  - `Up` / `Down` (in command mode): browse command history
  - `Ctrl+C`: quit

## TUI Rebuild Input Model (planned)

The next TUI rebuild switches input from editor-like typing to a vim-like mode model.

- Modes:
  - `normal` (default): navigation and pane interaction
  - `command`: enter with `:` and run CLI commands
  - `search`: enter with `/` and search in events
- Command/search cancellation:
  - `Esc` cancels command/search mode.
  - `Backspace` on empty command/search input also cancels that mode.
- Movement keys in normal mode:
  - `j` moves down and `k` moves up.
  - No `jk` sequence buffer is used; behavior is strictly per keypress.
  - `G` jumps to last row/item in the active pane.
  - `w` / `W` cycles pane focus (no command pane in focus cycle).
- Count prefixes:
  - Numeric prefixes apply to motion (for example `100j`).
  - `gg` jumps to top, with optional count (`100gg` to jump to index/row 100).
  - Events pane motions are saturated on overflow (clamped to bounds).
  - Players pane motions wrap on overflow (circular navigation).
- Search repeat:
  - `/` search is immediate while typing and highlights matches.
  - `/` defaults to backward jump direction in events.
  - `/<enter>` clears active search.
  - `n` repeats in the same direction as the last search.
  - `N` repeats in the opposite direction of the last search.
- Filter mode:
  - `?` enters immediate filter mode for events.
  - only matching rows are shown while filtering.
  - `?<enter>` clears the filter.
- Vim-style scrolling (events):
  - `Ctrl+F` / `Ctrl+B` move by page and keep selection aligned.
  - `Ctrl+D` / `Ctrl+U` move by half-page and keep selection aligned.
  - `Ctrl+E` / `Ctrl+Y` move by one line and keep selection aligned.

Implementation note:

- command dispatch uses colon-style ids (for example `cursor:line_up`, `viewport:page_down`).

## Quick Start

Create a ready-to-run setup (players + seats + random script-valid character/alignment assignment):

```text
start bmr 7
```

Aliases:

- `start` == `quick-start` == `quick-setup`
- signature: `quick-setup <script> <player_num> [game_id]`
- if `game_id` is omitted, it defaults to `<script>_<player_num>` (example: `bmr_7`)

## Core Local Commands

- `help [all|phase]`
- `state [brief|json]`
- `events [count]`
- `players`
- `player <player_id>`
- `view storyteller` (alias: `view st`)
- `view public`
- `view player <player_id>` (alias: `view <player_id>`)
  - add `--json` to any `view` command for JSON output
- `setup-player <player_id> <true_character_id> [perceived_character_id] <townsfolk|outsider|minion|demon|traveller> [good|evil]`
- `prompts`
- `prompt <prompt_key>`
- `new <game_id>`
- `quit` / `exit`

## Adjudication Prompt Commands

- `create-prompt <prompt_key> <kind> <storyteller|player|public> <reason...>`
- `resolve-prompt <prompt_key> [selected_option_id|-] [notes...]`
- `cancel-prompt <prompt_key> <reason...>`

Prompt/wake key conventions:

- prompt keys: `plugin:<character_id>:<verb>:<time_key>:<player_id>[:detail...]`
  - example: `plugin:poisoner:night_poison:n1:p5`
- wake keys: `wake:<time_key>:<global_order>:<player_id>:<character_id>`
  - example: `wake:n1:1:p5:poisoner`
- `time_key`: `d<day_number>` or `n<night_number>`
- compatibility note: legacy `prompt_id` / `wake_id` fields are removed; use key-only names in commands/events/debug output.

## Reminder Marker Commands

- `markers`
- `marker <marker_id>`
- `apply-marker <marker_id> <kind> <effect> [target_player_id] [source_character_id] [note...]`
- `clear-marker <marker_id> [reason...]`
- `sweep-markers`

Notes:

- reminder markers are authoritative hidden effect state (buff/debuff model), not UI-only tokens.
- compatibility transitions are still emitted for consumers that rely on status events:
  - `PoisonApplied` / `HealthRestored`
  - `DrunkApplied` / `SobrietyRestored`

## Manual Setup Commands

- `assign-character <player_id> <character_id> [--demon] [--traveller]`
- `assign-perceived <player_id> <character_id>`
- `assign-alignment <player_id> <good|evil>`

## Phase Step Commands

- `next-phase` (aliases: `next`, `n`)
- Signature: `next [subphase|phase|day|night] [--auto|--auto-prompt]`

Behavior:

1. Default `next` advances one deterministic workflow step.
2. Default `next` does not auto-resolve prompts; when pending prompts exist it stops with `blocked_by_prompt`.
3. `--auto` (`--auto-prompt`) resolves pending prompts repeatedly until queue is empty (guarded), then continues requested `next` scope.
4. Auto prompt resolution by `next` remains random (random valid option/range/tuple).
5. `next subphase` advances one subphase (same as default `next`).
6. `next phase` advances until phase changes.
7. `next day` / `next night` advances until the next future day/night boundary is reached.
   - from night, `next day` lands on the next day number.
   - from day, `next day` continues through night and lands on the following day.
8. Day flow automations remain:
   - `open_discussion` -> auto `OpenNominationWindow`
   - `nomination_window` -> auto `OpenVote` for latest unresolved nomination; if none, auto `ResolveExecution`
   - `vote_in_progress` -> auto-cast `no` for missing voters, then auto `CloseVote`
   - `execution_resolution` -> auto `ResolveExecutionConsequences` when execution happened and consequences are unresolved
9. Reminder marker expiry is auto-swept on `AdvancePhase`; expired markers emit `ReminderMarkerExpired`.

`next` output includes a stop reason and counters:

- `stop=<reason> steps=<n> prompts_resolved=<n>`

## Scriptable CLI (Plain Text)

- Run script mode: `pnpm --filter game run cli -- --script <path> [game_id]`
- Format: one CLI command per line; blank lines and `#` comment lines are ignored.
- Script mode is fail-fast: first parse/engine error aborts the run with non-zero exit.
- Script mode forbids random commands and shorthands:
  - `next --auto` / `next --auto-prompt` are rejected.
  - `choose` / `ch` are rejected (use deterministic `resolve-prompt ...` instead).

## Short Command Examples

Typical happy path after quick setup:

```text
start bmr 7
n
next --auto
nom p1 p2
n
vote p1 p2
n
n
check-win
state
```

### Vote command forms

- single: `vote <voter_id> <yes|no>`
- bulk (default yes): `vote <voter_id...>`
- bulk explicit: `vote <voter_id...> <yes|no>`
- explicit nomination: `vote <nomination_id> <voter_id> <yes|no>`

Example:

```text
vote p1 p2
```

This casts `yes` for both `p1` and `p2` on the active vote.

## Color Output

CLI output is colorized in TTY:

- event types by category
- success/error status lines
- player life status (`alive`/`dead`)

Color is disabled when `NO_COLOR` is set.

## Notes

- Command IDs are generated automatically (`cli-000001`, ...).
- All mutations go through engine command handling; no direct state mutation in CLI.
- Engine errors are shown as `engine_error code=<...> message=<...>`.
