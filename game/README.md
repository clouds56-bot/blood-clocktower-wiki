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
  - `Ctrl+W`: cycle focused pane (`events -> inspector -> status`)
  - `Ctrl+U` / `Ctrl+D`: scroll focused pane up/down
  - `Ctrl+E`: toggle status pane filter (errors only)
  - `Ctrl+S`: cycle state panel (`brief -> players -> json`)
  - `Ctrl+G`: cycle inspector panel (`overview -> prompts -> players -> markers -> output`)
  - `Up` / `Down` (while input focused): browse command history
  - `Ctrl+C`: quit

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
