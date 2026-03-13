# Game Engine Architecture (TypeScript)

## Scope

Implement a Blood on the Clocktower engine in `game/` using TypeScript, based on `game/rules.md`.

Goals:
- deterministic core rules engine;
- plugin-based character engine;
- Storyteller adjudication prompts for discretionary cases;
- strict visibility model (Storyteller / player / public);
- social-claims logging (claimed character, claimed event) for later review.
- interactive CLI for command execution, event inspection, and state inspection.

## Naming Convention (Serialization-Friendly)

- Structure/state fields and payload keys use `snake_case`.
  - Examples: `day_number`, `night_number`, `true_character_id`, `dead_vote_available`.
- Type names, event names, and command names use `PascalCase`.
  - Examples: `GameState`, `PlayerState`, `NominationMade`, `PlayerDied`, `StartGame`.
- Enum values use `snake_case` strings unless otherwise required.
  - Examples: `first_night`, `open_discussion`, `vote_in_progress`.

This convention is required for easy persistence and de/serialization consistency.

## Non-goals (initial phase)

- Full almanac-perfect automation for every character.
- Automated madness judgment from chat.
- Forcing social behavior or speech truthfulness.

---

## Core Architecture

Split into 6 layers:

1. **Core Rules Engine**
   - setup flow, phase machine, nomination/vote/execution/death/win logic.
   - deterministic reducer over events.

2. **Character Plugin Engine**
   - character metadata + hooks.
   - no hardcoded per-character behavior in core.

3. **Storyteller Adjudication Layer**
   - explicit prompts where rules require discretion.
   - decisions recorded as adjudication events.

4. **Visibility Projection Layer**
   - derived views for Storyteller, player, and public.
   - prevents hidden-state leakage.

5. **Social Claims Layer**
   - stores player statements as non-authoritative records.
   - includes claimed character + claimed event timeline.

6. **CLI Interaction Layer**
   - interactive shell for running engine commands.
   - command parser (human-friendly input -> typed engine command).
   - console formatters for event stream and state snapshots.

---

## Project Layout (under `game/`)

- `game/src/domain/types.ts`           # state/event/command core types
- `game/src/domain/events.ts`          # event definitions
- `game/src/domain/commands.ts`        # command definitions
- `game/src/domain/reducer.ts`         # apply_event(state, event)
- `game/src/domain/invariants.ts`      # validation checks
- `game/src/engine/phase-machine.ts`   # phase/subphase transitions
- `game/src/engine/day-flow.ts`        # nominations/votes/execution logic
- `game/src/engine/night-flow.ts`      # wake queue + interrupt queue
- `game/src/engine/win-check.ts`       # automatic + override entry points
- `game/src/plugins/contracts.ts`      # plugin API
- `game/src/plugins/registry.ts`       # plugin lookup/dispatch
- `game/src/adjudication/prompts.ts`   # prompt model + lifecycle
- `game/src/projections/storyteller.ts`
- `game/src/projections/player.ts`
- `game/src/projections/public.ts`
- `game/src/social/claims.ts`          # claimed character/event models
- `game/src/cli/command-parser.ts`     # human-friendly command parsing
- `game/src/cli/formatters.ts`         # state/event formatting for terminal output
- `game/src/cli/repl.ts`               # interactive CLI loop
- `game/src/index.ts`                  # engine public API
- `game/tests/...`                     # scenario + invariant + projection tests
- `game/package.json`
- `game/tsconfig.json`

---

## State Model

`GameState` minimum fields (snake_case keys):

- meta:
  - `game_id`
  - `script_id`
  - `edition_id`
  - `status`
- phase:
  - `phase`
  - `subphase`
  - `day_number`
  - `night_number`
- seating:
  - `seat_order`
  - neighbor helpers derived from stable seat order
- players (`players_by_id[player_id]`):
  - `true_character_id`
  - `perceived_character_id`
  - `true_alignment`
  - `registered_character_id?`
  - `registered_alignment?`
  - `alive`
  - `drunk`
  - `poisoned`
  - `dead_vote_available`
- day tracking:
  - `has_nominated_today[player_id]`
  - `has_been_nominated_today[player_id]`
  - nominee vote totals
- runtime queues:
  - `wake_queue`
  - `interrupt_queue`
  - `pending_prompts`
- logs:
  - `domain_events`
  - `private_info_log_by_player`
  - `public_event_log`
  - `storyteller_notes`
- social:
  - `claims`

### Social Claims Model

Claims are **not engine truth**. They are review artifacts.

`ClaimRecord` keys (snake_case):
- `claim_id`
- `day_number`
- `phase`
- `speaker_player_id`
- `audience` (`public` | `private` | `storyteller`)
- `claim_type` (`character_claim` | `event_claim` | `alignment_claim` | `other`)
- `subject_player_id?`
- `claimed_character_id?`
- `claimed_event?` (structured summary payload)
- `raw_text?`
- `confidence?` (`certain` | `uncertain`)
- `status` (`active` | `retracted` | `contradicted`)
- `created_at_event_index`

---

## Command/Event Model

Engine is event-oriented.

### Commands (PascalCase names)

- `StartGame`
- `AdvancePhase`
- `NominatePlayer`
- `OpenVote`
- `CastVote`
- `CloseVote`
- `ResolveExecution`
- `ApplyDeath`
- `ApplyPoison`
- `ApplyDrunk`
- `ChangeCharacter`
- `ChangeAlignment`
- `ResolvePrompt`
- `DeclareForcedVictory`
- `RecordClaim`
- `RetractClaim`
- `MarkClaimStatus`

### Events (PascalCase names)

- setup/assignment:
  - `ScriptSelected`
  - `CharactersSelected`
  - `CharacterAssigned`
  - `PerceivedCharacterAssigned`
  - `AlignmentAssigned`
- phase:
  - `DayStarted`
  - `NightStarted`
  - `DawnReached`
- social procedure:
  - `NominationMade`
  - `VoteOpened`
  - `VoteCast`
  - `VoteClosed`
- consequences:
  - `ExecutionOccurred`
  - `PlayerExecuted`
  - `PlayerDied`
  - `PlayerSurvivedExecution`
  - `ExileOccurred`
- state changes:
  - `DrunkApplied`
  - `PoisonApplied`
  - `SobrietyRestored`
  - `HealthRestored`
  - `AlignmentChanged`
  - `CharacterChanged`
  - `RegistrationChanged`
- info/adjudication:
  - `PrivateInfoShown`
  - `PublicDeathAnnounced`
  - `StorytellerChoiceMade`
  - `StorytellerRulingRecorded`
- social claims:
  - `ClaimRecorded`
  - `ClaimRetracted`
  - `ClaimStatusChanged`

---

## Plugin Contract (Character Engine)

Each character definition includes:
- `id`, `name`, `type`, `alignment_at_start`
- `timing_category`
- `is_once_per_game`
- targeting constraints
- flags for poison/drunk/registration/alignment/character interactions
- `handler` hooks

Rules:
- plugin returns events/prompts, never mutates state directly.
- immediate triggers can enqueue interrupt resolution.

### Runtime Primitives (Phase 6)

- `wake_queue`: ordered wake steps generated from character timing.
- `interrupt_queue`: immediate resolution work items that preempt normal wake order.
- `plugin_registry`: authoritative map of `character_id -> plugin`.
- `hook_dispatcher`: deterministic dispatcher that calls hooks and normalizes outputs.

### Hook Lifecycle (Event-Driven)

1. engine enters a hook boundary (for example: night wake step begins, prompt resolved).
2. dispatcher invokes target plugin hook with read-only context.
3. plugin returns declarative outputs (`events`, `prompts`, `interrupts`).
4. engine applies outputs through normal command/event pipeline.
5. reducer is the only state mutation path.

### Sample Behavior Contract (Imp)

- On wake, `imp` emits a prompt for a target selection.
- On prompt resolution, `imp` emits consequence events (for example, death application flow).
- If timing requires immediate nested resolution, `imp` emits interrupt tasks instead of mutating state.

### Phase 6 Scope Split

- 6.1 contract + metadata schema + registry API.
- 6.2 state runtime queues (`wake_queue`, `interrupt_queue`) + invariants.
- 6.3 hook dispatcher + output normalization.
- 6.4 engine integration points (night flow + prompt lifecycle).
- 6.5 sample `imp` plugin.
- 6.6 sample `poisoner` plugin.
- 6.7 CLI debug commands (plugins, hooks, queues).
- 6.8 scenario tests + replay determinism hardening.

### Initial Hook Boundaries (Phase 6)

- when a night wake step begins.
- when a plugin-owned prompt is resolved.
- optional post-event follow-up boundary for scheduling additional wake/interrupt work.

### Phase 6 Test Targets

- registry duplicate-id rejection and plugin lookup behavior.
- deterministic hook dispatch ordering.
- imp prompt -> resolution -> consequence scenario.
- interrupt queue preemption ordering over normal wake queue.
- replay determinism for plugin-generated events.

---

## Visibility Rules

Three projection functions:
- `project_for_storyteller(state)` -> full truth + claims.
- `project_for_player(state, player_id)` -> only allowed private truths + own claims + authorized public.
- `project_for_public(state)` -> official public truths + optionally public claims feed (clearly marked non-authoritative).

No projection may leak hidden fields by default.

Projection policy notes:
- `registered_character_id` and `registered_alignment` are Storyteller/internal by default.
- player/public projections must not expose `registered_*` unless a specific rules-backed effect grants that knowledge.

---

## Invariants

Continuously validate:
- one true character per non-Traveller player;
- non-Traveller character count equals non-Traveller player count;
- only alive players nominate;
- once/day nomination and nomination-target limits;
- max one execution/day;
- dead cannot die again;
- dead vote spends at most once post-death;
- evil 2-alive win excludes Travellers;
- projection privacy boundaries hold.

---

## Delivery Strategy

Phase 1: engine skeleton + state/types + reducer + invariants.  
Phase 2: phase machine + day procedure (nomination/vote/execution procedure).  
Phase 3: death consequences + dead vote + win checks + forced victory.  
Phase 3.1: CLI interaction shell (command execution + event/state inspection) over existing engine API.  
Phase 4: prompted adjudication queue + `ResolvePrompt` lifecycle.  
Phase 5: visibility projections + anti-leak tests.  
Phase 6: plugin runtime + sample characters (Imp, Poisoner), delivered as 6.1-6.8 subphases above.  
Phase 7: social claims tracking + timeline tooling.  
Phase 8: hardening, fixture matrix, and API/DX stabilization.

## CLI By Phase

- **Phase 3.1 baseline**
  - Support direct command execution for current engine commands.
  - Show emitted domain events after each accepted command.
  - Show state in brief and JSON modes.
  - Keep all state transitions event-driven (`handle_command` + `apply_events`) with no direct state mutation.

- **Phase 4 (adjudication prompts)**
  - Add CLI commands for prompt listing, prompt details, and `ResolvePrompt` dispatch.
  - Render pending prompts in concise storyteller-focused output.

- **Phase 5 (visibility projections)**
  - Add projection-aware CLI views:
    - `view storyteller` (alias `view st`)
    - `view player <player_id>` (alias `view <player_id>`)
    - `view public`
  - Add `--json` support for `view` commands.
  - Default `view` output should be compact table/text (JSON optional).
  - Ensure output is deny-by-default for hidden fields in non-storyteller views.

- **Phase 5.1 (CLI setup ergonomics)**
  - Add local setup helper:
    - `setup-player <player_id> <true_character_id> [perceived_character_id] <townsfolk|outsider|minion|demon|traveller> [good|evil]`
  - Keep granular setup commands (`assign-character`, `assign-perceived`, `assign-alignment`).
  - Make `quick-setup` / `start` assign random script-valid characters + alignments from edition/setup data.

- **Phase 6 (plugin runtime)**
  - Add plugin debugging commands:
    - list registered plugins
    - inspect hook dispatch output
    - inspect interrupt queue and wake queue

- **Phase 7 (social claims)**
  - Add claim lifecycle commands (`RecordClaim`, `RetractClaim`, `MarkClaimStatus`).
  - Add timeline filters (by day/phase/speaker/subject/type).

- **Phase 8 (hardening + DX)**
  - Stabilize CLI error code display and command help.
  - Add snapshot-style CLI scenario fixtures for regression testing.
