# Game Engine Phase 3 Expected Outcome

## Scope

Phase 3 completes core consequence and victory systems on top of Phase 2 day-flow.

Focus areas:
- death consequences and lifecycle;
- dead vote token lifecycle;
- execution-to-death handling contract;
- automatic win checks;
- Storyteller forced-victory override hook.

Out of scope:
- full adjudication prompt UI/queue (Phase 4);
- visibility projections and anti-leak projections (Phase 5);
- character plugin runtime and interrupt-driven ability execution (Phase 6);
- social claims workflow and timeline review layer (Phase 7).

## Expected Outcomes

By end of Phase 3, the engine should deterministically resolve death and victory state transitions for core rules, while preserving the separation between execution and death.

### 1) Death lifecycle is formally represented

- Introduce explicit death-related commands/events for consequence resolution.
- Support cases where a player is executed but does not die.
- Support cases where no execution occurs and no death occurs.
- Preserve event separation:
  - `PlayerExecuted` = public procedure outcome
  - `PlayerDied` = life-state transition

### 2) Dead player rules are enforced

- Dead players cannot die again.
- Dead players cannot nominate.
- Dead players remain in game state and continue to be valid participants for non-procedural systems.

### 3) Dead vote token lifecycle is enforced

- Dead players have exactly one vote for the rest of the game.
- First valid vote by a dead player consumes `dead_vote_available`.
- Subsequent votes by that dead player are rejected.
- Alive players are not subject to dead-vote constraints.

### 4) Execution and death integration is deterministic

- Execution resolution produces `PlayerExecuted` when a nominee wins the day vote.
- Death resolution is explicit and can emit either:
  - `PlayerDied`, or
  - `PlayerSurvivedExecution`
- Day resolution remains replay-safe and deterministic from event history.

### 5) Win checks are active

- Automatic win conditions implemented:
  - good wins if Demon dies;
  - evil wins when only 2 players are alive, excluding Travellers.
- Win checks run at deterministic checkpoints after consequence events.
- Game transitions to ended state on resolved automatic win.

### 6) Forced victory override is available

- Add Storyteller authority command to end game when victory is certain.
- Override records team and rationale.
- Override must be explicit, auditable, and evented.

## Required Deliverables

- `game/src/engine/death-flow.ts`
- `game/src/engine/win-check.ts`
- command/event union updates for death + win flow
- reducer integration for life/dead-vote/win state updates
- invariant extensions for death/vote/win constraints
- scenario tests for death and win outcomes

## Command/Event Expectations (Phase 3)

Use `PascalCase` command/event names and `snake_case` payload keys.

### Commands (minimum)

- `ResolveExecutionConsequences`
- `ApplyDeath`
- `MarkPlayerSurvivedExecution`
- `CheckWinConditions`
- `DeclareForcedVictory`

### Events (minimum)

- `ExecutionConsequencesResolved`
- `PlayerDied`
- `PlayerSurvivedExecution`
- `DeadVoteConsumed`
- `WinCheckCompleted`
- `GameWon`
- `ForcedVictoryDeclared`
- `GameEnded`

Note: if the existing `PlayerSurvivedExecution` event from Phase 2 is reused, keep payload shape stable and avoid duplicate semantic events.

## State Expectations

Phase 3 should include these state capabilities (snake_case):

- player life state (`alive`) transitions from true -> false only once.
- dead vote status (`dead_vote_available`) tracked and consumed deterministically.
- execution history and death history remain separate.
- game outcome fields available when ended, such as:
  - `winning_team`
  - `end_reason`
  - `ended_at_event_id` (optional but recommended)

## Invariants to Add

- dead players cannot return to alive unless a future phase explicitly introduces resurrection behavior.
- dead players cannot consume more than one dead vote.
- `dead_vote_available=false` for alive players should be warning/error according to policy.
- `winning_team` must be null when `status!=ended`.
- if `status=ended`, outcome metadata must be present.
- automatic evil 2-alive check excludes Travellers.

## Definition of Done

Phase 3 is complete when all conditions below are true:

- execution/death distinction is preserved in code and tests;
- dead vote consumption logic is implemented and tested;
- dead re-death attempts are safely ignored or rejected by deterministic rule;
- automatic win checks produce correct outcomes;
- forced victory command ends game with auditable rationale;
- replay output remains deterministic for all new scenario fixtures;
- `pnpm --filter game run typecheck` passes;
- `pnpm --filter game run test` passes.

## Test Matrix (minimum)

- executed player dies path
- executed player survives path
- dead player cannot die again
- dead player first vote succeeds and consumes token
- dead player second vote rejected
- good win when Demon dies
- evil win when 2 non-Traveller players alive
- no false evil win when Travellers are present
- forced victory sets winner and ends game
- post-end commands that mutate core flow are rejected

## Risks and Guardrails

- Risk: conflating execution with death in reducer.
  - Guardrail: keep separate commands/events and separate history lists.
- Risk: dead-vote logic leaks into generic vote count incorrectly.
  - Guardrail: centralize vote eligibility checks in one engine path.
- Risk: premature full character semantics in win checks.
  - Guardrail: implement only obvious automatic wins + explicit forced override.

## Acceptance Summary

Phase 3 should leave the engine with reliable consequence resolution and game-ending logic for core rules, so that Phase 4+ can focus on adjudication, visibility, and character complexity without reworking base lifecycle mechanics.
