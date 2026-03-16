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

## Identity Conventions

- Event identity is dual:
  - `event_id`: global 1-based numeric ordinal assigned by reducer append order.
  - `event_key`: deterministic string key produced by command/plugin emitters and used for dedup/correlation.
- Internal event references keep `*_event_id` field names and store numeric `event_id` values.
- Prompt identity uses `prompt_key`.
- Wake-step identity uses `wake_key`.
- Time key format:
  - `d<day_number>` for day scope (for example `d1`)
  - `n<night_number>` for night scope (for example `n1`, `n2`)
- Plugin prompt/reason keys should begin with:
  - `plugin:<character_id>:<time_key>:<player_id>:...`
- Wake key format:
  - `wake:<time_key>:<global_order>:<player_id>:<character_id>`
  - `global_order` is deterministic per-time-slot sequence (resets for each `time_key`).

## Non-goals (initial phase)

- Full almanac-perfect automation for every character.
- Automated madness judgment from chat.
- Forcing social behavior or speech truthfulness.

---

## Core Architecture

Split into 7 layers:

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

6. **Reminder Marker Layer (Authoritative Buff/Debuff System)**
   - reminder markers are authoritative hidden rule state, not cosmetic UI tokens.
   - supports stackable multi-source effects (for example `poisoner:poisoned` and `no_dashii:poisoned` on one player).
   - status fields such as poisoned/drunk are derived from active reminder markers.

7. **CLI Interaction Layer**
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
- `game/src/engine/reminder-flow.ts`   # reminder marker lifecycle + expiry sweeps
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
  - `registered_character_id?` (optional snapshot/debug field; not authoritative for query-time checks)
  - `registered_alignment?` (optional snapshot/debug field; not authoritative for query-time checks)
  - `alive`
  - `drunk` (derived convenience field from active reminder markers)
  - `poisoned` (derived convenience field from active reminder markers)
  - `dead_vote_available`
- day tracking:
  - `has_nominated_today[player_id]`
  - `has_been_nominated_today[player_id]`
  - nominee vote totals
- runtime queues:
  - `wake_queue`
  - `interrupt_queue`
  - `pending_prompts`
- reminder markers:
  - `reminder_markers_by_id[marker_id]`
  - `active_reminder_marker_ids`
- logs:
  - `domain_events`
  - `private_info_log_by_player`
  - `public_event_log`
  - `storyteller_notes`
- social:
  - `claims`

### Registration Query Model

Registration is query-scoped adjudication state, not a globally fixed player property.

Design intent:
- support per-check Storyteller decisions for `might register as` behavior;
- allow the same player to register differently across separate checks in the same night/day;
- keep replay deterministic by recording each decision as an event.

`RegistrationQuery` keys (snake_case):
- `query_id` (deterministic id scoped to one rule check)
- `consumer_role_id` (role performing the check, for example `chef`, `fortune_teller`)
- `query_kind` (for example `alignment_check`, `character_type_check`, `character_check`, `demon_check`)
- `subject_player_id`
- `subject_context_player_ids` (optional related players for pair/group checks)
- `phase`, `day_number`, `night_number`
- `status` (`pending` | `resolved`)
- `resolved_character_id?`
- `resolved_character_type?`
- `resolved_alignment?`
- `decision_source` (`storyteller_prompt` | `deterministic_rule`)
- `created_at_event_id`
- `resolved_at_event_id?`
- `note?`

State indexes:
- `registration_queries_by_id[query_id]`
- `pending_registration_query_ids`

Rules:
- rule checks must use registration query resolution, not `players_by_id.registered_*` directly;
- one query id resolves once and is replay-stable;
- query resolution may differ between checks for the same subject player;
- registration query data is Storyteller/internal by default and deny-by-default in player/public views.

### Reminder Marker Model

Reminder markers are authoritative hidden state used by rule checks.

`ReminderMarker` keys (snake_case):
- `marker_id` (deterministic, event-linked instance id)
- `kind` (stable reminder/token kind id, for example `poisoner:poisoned`)
- `effect` (`poisoned` | `drunk` | ...)
- `note` (string; short storyteller-facing text)
- `status` (`active` | `cleared` | `expired`)
- `source_player_id?`
- `source_character_id?`
- `target_player_id?`
- `target_scope` (`player` | `game` | `pair`)
- `authoritative` (`true` means marker participates in rule checks)
- `expires_policy` (`manual` | `end_of_day` | `start_of_day` | `end_of_night` | `start_of_night` | `on_source_death` | `on_target_death` | `at_day` | `at_night`)
- `expires_at_day_number?`
- `expires_at_night_number?`
- `created_at_event_id`
- `cleared_at_event_id?`
- `source_event_id?`
- `metadata?`

Rules:
- `kind` is not unique; multiple active markers of the same kind may coexist.
- `marker_id` must be unique and replay-stable.
- rule checks use active authoritative markers; reminder UI is a projection of marker state.
- engine performs an automatic expiry sweep on `AdvancePhase` and appends `ReminderMarkerExpired` events when policies match.

Identity notes for reminder markers:
- event-linked references (`created_at_event_id`, `cleared_at_event_id`, `source_event_id`) store numeric `event_id` values.
- deterministic `marker_id` should be derived from stable producer identity (typically `event_key` lineage), not reducer ordinal.

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
- `UseClaimedAbility`
- `ApplyPoison` (compatibility command; resolved through reminder markers)
- `ApplyDrunk` (compatibility command; resolved through reminder markers)
- `ChangeCharacter`
- `ChangeAlignment`
- `ResolvePrompt`
- `DeclareForcedVictory`
- `RecordClaim`
- `RetractClaim`
- `MarkClaimStatus`
- `ApplyReminderMarker`
- `ClearReminderMarker`
- `ClearReminderMarkersBySelector`
- `SweepReminderExpiry`

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
  - `ClaimedAbilityAttempted`
- consequences:
  - `ExecutionOccurred`
  - `PlayerExecuted`
  - `PlayerDied`
  - `PlayerSurvivedExecution`
  - `ExileOccurred`
- state changes:
  - `DrunkApplied` (compatibility status transition event)
  - `PoisonApplied` (compatibility status transition event)
  - `SobrietyRestored` (compatibility status transition event)
  - `HealthRestored` (compatibility status transition event)
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
- reminder markers:
  - `ReminderMarkerApplied`
  - `ReminderMarkerCleared`
  - `ReminderMarkerExpired`
- registration queries:
  - `RegistrationQueryCreated`
  - `RegistrationDecisionRecorded`

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
- plugin applies/removes effects through reminder marker events, not direct bool mutation.
- registration providers (for example `recluse`, `spy`) do not mutate persistent player fields to answer checks; they request/emit query-scoped registration decisions.
- engine remains authoritative for phase transitions, command validation, queue orchestration, and final win declaration.

Plugin-first split (target):
- character-specific rule logic should live in plugins whenever possible;
- engine should provide deterministic hook boundaries and execute plugin outputs in canonical order;
- non-character global rules remain engine-owned.

Compatibility bridge:
- keep `ApplyPoison` / `ApplyDrunk` commands and `PoisonApplied` / `DrunkApplied` / restore events for existing plugin callers.
- these compatibility commands are adapter entry points that create/clear authoritative reminder markers.
- plugin-emitted marker lifecycle events also pass through compatibility transition logic (`PoisonApplied`/`HealthRestored`, `DrunkApplied`/`SobrietyRestored`) when effective status changes.
- do not dispatch new commands from reducer/event hooks; compute and emit compatibility status events deterministically in command handling flow after marker lifecycle events are known.

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

### Claimed Ability Activation Flow

- `UseClaimedAbility` is the generic public ability-declaration command path.
- command payload identifies claimant and claimed character only; target selection is prompt-driven.
- engine validates coarse timing/eligibility and queues a pending prompt when target input is required (`PromptQueued`).
- storyteller resolves that prompt through the normal prompt lifecycle (`ResolvePrompt` command -> `PromptResolved` event).
- after prompt resolution, engine emits `ClaimedAbilityAttempted` as the public audit event, then dispatches plugin consequences.
- this flow is shared across day/reactive public claim abilities (for example Slayer) rather than role-specific commands.

### Extended Hook Surface (planned)

- `on_night_wake`: role wake actions.
- `on_prompt_resolved`: role-owned prompt follow-up.
- `on_event_applied`: optional passive reactions (already available).
- `on_nomination_made`: day-reactive nomination hooks (for example `virgin`).
- `on_vote_cast_validate`: vote-constraint hooks before vote acceptance (for example `butler`).
- `on_execution_resolving`: execution replacement/redirection hooks (for example `mayor` redirection path).
- `on_player_died`: death-trigger hooks and continuity triggers.
- `on_pre_win_check`: final continuity/override effects before winner resolution (for example `scarlet_woman`).
- `on_registration_query`: registration provider adjudication for query-scoped checks (`recluse`, `spy`).

Determinism rules for extended hooks:
- dispatch order must be stable (seat-order and/or explicit plugin precedence);
- each boundary defines a strict phase order: base command events -> plugin boundary hooks -> compatibility/status events -> win check;
- hook outputs must be replay-safe and idempotent by event identity rules (`event_key` dedup + reducer-assigned ordinal `event_id`).

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

### Next Hook Milestones

- M1: nomination and vote validation hooks (`on_nomination_made`, `on_vote_cast_validate`).
- M2: death and continuity hooks (`on_player_died`, `on_pre_win_check`).
- M3: registration provider hook (`on_registration_query`) with query lifecycle prompts.
- M4: migrate remaining engine-embedded character branches to plugin hooks and keep engine as orchestrator.

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
- `registered_character_id` and `registered_alignment` are Storyteller/internal by default and may be stale snapshots.
- registration query records and decisions are Storyteller/internal by default.
- player/public projections must not expose `registered_*` unless a specific rules-backed effect grants that knowledge.
- reminder markers are deny-by-default in player/public projections unless explicitly rules-visible.

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
- `active_reminder_marker_ids` reference existing markers with `status=active`;
- authoritative marker target/source references are valid when required;
- derived poisoned/drunk fields are consistent with active authoritative markers.
- registration query ids are unique and resolve at most once;
- registration-sensitive checks are tied to a deterministic query id and resolved decision.

---

## Delivery Strategy

Phase 1: engine skeleton + state/types + reducer + invariants.  
Phase 2: phase machine + day procedure (nomination/vote/execution procedure).  
Phase 3: death consequences + dead vote + win checks + forced victory.  
Phase 3.1: CLI interaction shell (command execution + event/state inspection) over existing engine API.  
Phase 4: prompted adjudication queue + `ResolvePrompt` lifecycle.  
Phase 5: visibility projections + anti-leak tests.  
Phase 5.5: reminder marker system (authoritative reminders/buffs) + derived status wiring.  
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

- **Phase 5.5 (reminder markers)**
  - Add CLI commands for marker inspection and lifecycle:
    - `markers` / `marker <marker_id>`
    - `apply-marker ...`
    - `clear-marker <marker_id>`
    - `sweep-markers`
  - Keep authoritative marker overrides explicit and auditable.

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
