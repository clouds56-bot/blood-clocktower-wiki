# Game Engine Phase 2 Expected Outcome

## Scope

Phase 2 builds the core game-flow runtime on top of Phase 1 foundations.

Focus areas:
- phase/subphase transitions;
- nomination and vote procedure;
- execution resolution;
- execution vs death event separation.

Out of scope:
- win checks and death-token lifecycle finalization (Phase 3);
- adjudication prompts (Phase 4);
- visibility projections (Phase 5);
- plugin-driven character runtime (Phase 6);
- social claims workflow (Phase 7).

## Expected Outcomes

By end of Phase 2, the engine should support deterministic progression through a Day cycle with complete nomination and vote handling.

### 1) Phase machine foundation is active

- Implement guarded transitions for:
  - `setup` -> `first_night`
  - `first_night` -> `day`
  - `day` -> `night`
  - `night` -> `day`
- Maintain valid `subphase` combinations for each `phase`.
- Reject invalid transitions with stable error codes.

### 2) Day nomination rules are enforced

- Only alive players can nominate.
- A player can nominate at most once per day.
- A player can be nominated at most once per day.
- Per-day nomination tracking resets at day start.

### 3) Voting lifecycle is complete

- Vote lifecycle commands/events exist and are replay-safe:
  - open vote
  - cast vote
  - close vote
- Votes are counted against current alive player count.
- Threshold rule implemented:
  - `threshold = ceil(alive_player_count / 2)`
- Tie handling implemented:
  - tied top vote totals produce no execution.

### 4) Day execution resolution works

- At most one execution attempt per day.
- Day may end with no execution.
- Engine emits execution-related events deterministically.
- `PlayerExecuted` and `PlayerDied` remain distinct concepts/events.

### 5) Replay and invariants remain stable

- Full Phase 2 scenarios replay deterministically from events.
- Existing Phase 1 invariants still pass.
- New Phase 2 invariants added for day-flow constraints.

## Required Deliverables

- `game/src/engine/phase-machine.ts`
- `game/src/engine/day-flow.ts`
- `game/src/engine/night-flow.ts` (minimal, transition scaffolding)
- updates to command/event unions for phase/day procedure
- reducer integration for new events
- invariant extensions for day-flow rules
- scenario tests for nominal and edge behavior

## Command/Event Expectations (Phase 2)

Use `PascalCase` command/event names and `snake_case` payload keys.

### Commands (minimum)

- `AdvancePhase`
- `OpenNominationWindow`
- `NominatePlayer`
- `OpenVote`
- `CastVote`
- `CloseVote`
- `ResolveExecution`
- `EndDay`

### Events (minimum)

- `PhaseAdvanced`
- `NominationWindowOpened`
- `NominationMade`
- `VoteOpened`
- `VoteCast`
- `VoteClosed`
- `ExecutionOccurred`
- `PlayerExecuted`
- `PlayerSurvivedExecution` (when applicable)

Note: `PlayerDied` may be emitted in later phases when death resolution is fully integrated.

## Definition of Done

Phase 2 is complete when all conditions below are true:

- command handlers and reducer support complete day vote/execution flow;
- invalid day actions are rejected with deterministic, test-covered errors;
- tie and threshold behavior are validated by tests;
- no more than one execution attempt is possible per day;
- replay output is deterministic for all Phase 2 scenario fixtures;
- `pnpm --filter game run typecheck` passes;
- `pnpm --filter game run test` passes.

## Test Matrix (minimum)

- valid transition: `first_night` -> `day` with reset day trackers
- invalid transition rejected (e.g., `setup` -> `night`)
- dead nominator rejected
- same nominator second nomination rejected
- same nominee second nomination rejected
- vote threshold reached -> execution occurs
- threshold not reached -> no execution
- tie for highest -> no execution
- attempt second execution same day rejected

## Risks and Guardrails

- Risk: blending execution and death semantics too early.
  - Guardrail: keep `PlayerExecuted` separate from `PlayerDied` in event model.
- Risk: day-state mutation spread across reducer and handlers.
  - Guardrail: isolate day-flow logic in `engine/day-flow.ts` and emit events only.
- Risk: fragile tie logic.
  - Guardrail: lock with table-driven tests using fixed fixtures.

## Acceptance Summary

Phase 2 should leave the project with a reliable, replayable, rules-aligned Day procedure that can drive real sessions at the core-system level, while deferring character-specific and discretionary logic to later phases.
