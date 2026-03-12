# Game Engine Architecture (TypeScript)

## Scope

Implement a Blood on the Clocktower engine in `game/` using TypeScript, based on `game/rules.md`.

Goals:
- deterministic core rules engine;
- plugin-based character engine;
- Storyteller adjudication prompts for discretionary cases;
- strict visibility model (Storyteller / player / public);
- social-claims logging (claimed character, claimed event) for later review.

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

Split into 5 layers:

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

---

## Visibility Rules

Three projection functions:
- `project_for_storyteller(state)` -> full truth + claims.
- `project_for_player(state, player_id)` -> only allowed private truths + own claims + authorized public.
- `project_for_public(state)` -> official public truths + optionally public claims feed (clearly marked non-authoritative).

No projection may leak hidden fields by default.

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
Phase 2: day/night phase machine + vote/execution/death/win.  
Phase 3: prompted adjudication + visibility projections.  
Phase 4: plugin runtime + sample characters (Imp, Poisoner).  
Phase 5: social claims tracking + replay/review tooling.  
Phase 6: scenario tests + replay snapshots + API stabilization.
