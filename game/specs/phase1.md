# SPEC-01: Foundation (Phase 1)

Goal
----
- Stand up a deterministic TypeScript engine core in `game/` that can define state, accept commands, emit/apply events, replay history, and validate invariants.

Expected outcomes
-----------------
- `game/` is a standalone TS package with build/test scripts.
- Canonical domain contracts exist:
  - `GameState`, `PlayerState`, `Command`, `DomainEvent`, `InvariantIssue` (PascalCase types).
  - serialized fields use `snake_case`.
- Pure reducer exists: `apply_event(state, event) -> state`.
- Replay exists: `replay_events(events, initial_state?) -> state`.
- Validation exists: `validate_invariants(state) -> InvariantIssue[]`.
- Baseline tests pass for deterministic replay, event application, and invariant detection.

Scope (in)
------------
- Package scaffolding and TS config.
- Domain type system and naming convention enforcement.
- Event schema v1 (core setup/state/log events only).
- Reducer skeleton with safe unknown-event handling policy.
- Invariant engine + initial invariant set.
- Test harness + fixture utilities.

Scope (out)
-------------
- Full phase machine (day/night) and vote logic.
- Character plugin runtime behavior.
- Storyteller prompt workflow.
- Visibility projections.
- Full social claims workflow commands/events (placeholders allowed).

Deliverables
------------
- `game/package.json` (scripts: `build`, `test`, `typecheck`).
- `game/tsconfig.json` (strict).
- `game/src/domain/types.ts` (`GameState`, `PlayerState`, IDs, enums).
- `game/src/domain/events.ts` (`DomainEvent` union + envelope type).
- `game/src/domain/commands.ts` (`Command` union + validation types).
- `game/src/domain/reducer.ts` (`apply_event`, basic event switch).
- `game/src/domain/invariants.ts` (`validate_invariants`).
- `game/src/domain/replay.ts` (`replay_events`).
- `game/tests/domain/*.test.ts` (replay/determinism/invariant fixtures).

Event/State contract rules
--------------------------
- Event envelope:
  - `event_id`, `event_type` (PascalCase), `created_at`, `actor_id?`, `payload`, `meta?`.
- State minimum:
  - `game_id`, `status`, `phase`, `subphase`, `day_number`, `night_number`.
  - `players_by_id`, `seat_order`.
  - `domain_events` (or external log reference).
- Naming: keys in `snake_case`; identifiers in `PascalCase`.

Initial invariants (Phase 1)
---------------------------
- no duplicate player ids in `players_by_id`.
- `seat_order` references only existing players.
- `day_number >= 0`, `night_number >= 0`.
- each player has required core fields (`alive`, `dead_vote_available`, etc.).
- enum/string fields are recognized values.

Test plan (minimum)
-------------------
- Reducer determinism: same initial state + same event list => identical final state.
- Replay determinism: replay twice => deep-equal outputs.
- Idempotency policy test: duplicate `event_id` behavior (explicit reject/ignore).
- Invariant tests: valid fixture => zero issues; invalid fixture => expected issue codes.
- Schema tests: ensure `snake_case` payload keys in event fixtures.

Definition of Done
------------------
- `pnpm --filter game run typecheck` passes.
- `pnpm --filter game run test` passes.
- event replay deterministic and covered by tests.
- invariant engine returns structured diagnostics.
- minimal docs/comments reflect `game/architecture.md` decisions.

Implementation order (recommended)
--------------------------------
1. Scaffold package + `tsconfig.json` + scripts.
2. Define IDs/enums/base types in `types.ts`.
3. Define event envelope and small event union in `events.ts`.
4. Implement reducer with exhaustive switch in `reducer.ts`.
5. Implement `replay_events` helper in `replay.ts`.
6. Implement invariant runner + issue codes in `invariants.ts`.
7. Write fixtures and tests.
8. Stabilize public API in `game/src/index.ts`.

Risks & mitigations
-------------------
- Overdesigning event schema too early — keep minimal and versionable.
- Mixing naming conventions — add tests or linter rules for snake_case in fixtures.
- Baking gameplay assumptions too early — keep Phase 1 foundational only.

Next steps
----------
Run the scaffold task: create `game/src` files and initial tests for the reducer and replay helper.  After that, implement invariants and run the test suite.
