# Game Engine CLI

Interactive CLI for the `game` package (Phase 5).

It lets you run engine commands, inspect emitted events, and inspect state while staying event-driven (`handle_command` + `apply_events`).

## Planning Docs

- `game/architecture.md` - engine architecture and phased delivery.
- `game/speckit-plan.md` - milestone plan and test matrix.

## Run

From repo root:

```bash
pnpm --filter game run cli
```

Optionally pass initial game id:

```bash
pnpm --filter game run cli -- my_game
```

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
- `prompt <prompt_id>`
- `new <game_id>`
- `quit` / `exit`

## Adjudication Prompt Commands

- `create-prompt <prompt_id> <kind> <storyteller|player|public> <reason...>`
- `resolve-prompt <prompt_id> [selected_option_id|-] [notes...]`
- `cancel-prompt <prompt_id> <reason...>`

## Manual Setup Commands

- `assign-character <player_id> <character_id> [--demon] [--traveller]`
- `assign-perceived <player_id> <character_id>`
- `assign-alignment <player_id> <good|evil>`

## Phase Step Command

- `next-phase` (aliases: `next`, `n`)

Behavior:

1. Move to next subphase when available.
2. If no next subphase, move to next phase entry subphase.
3. Day flow automations:
   - `open_discussion` -> auto `OpenNominationWindow`
   - `nomination_window` -> auto `OpenVote` for latest unresolved nomination; if none, auto `ResolveExecution`
   - `vote_in_progress` -> auto-cast `no` for missing voters, then auto `CloseVote`
   - `execution_resolution` -> auto `ResolveExecutionConsequences` when execution happened and consequences are unresolved

## Short Command Examples

Typical happy path after quick setup:

```text
start bmr 7
n
n
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
