# Game Engine Phase 5 Expected Outcome

## Scope

Phase 5 implements the visibility projection layer on top of Phase 1-4 core state and adjudication.

Focus areas:
- deny-by-default visibility projections for Storyteller, player, and public views;
- strict anti-leak handling for hidden/registered/perceived truth boundaries;
- projection-safe CLI views;
- test matrix that proves privacy boundaries under replayed state.

Out of scope:
- authoritative reminder marker lifecycle and command/event model (Phase 5.5);
- plugin hook runtime and character ability execution (Phase 6);
- social claims timeline workflow and review tools (Phase 7);
- full almanac-perfect character semantics.

## Expected Outcomes

By end of Phase 5, all state inspection for non-Storyteller audiences goes through explicit projection functions and cannot leak hidden truth by default.

### 1) Projection contracts are formalized

- Add dedicated projection modules:
  - `project_for_storyteller(state)`
  - `project_for_player(state, player_id)`
  - `project_for_public(state)`
- Projection result types are explicit and serialization-friendly (`snake_case` keys).
- Storyteller projection may expose full authoritative truth.
- Player/public projections expose only authorized fields.

### 2) Hidden-state leakage is blocked by default

- Player/public projections never expose unauthorized hidden fields.
- Sensitive fields are excluded unless explicitly allowed:
  - other players' `true_character_id`
  - other players' `true_alignment`
  - `drunk` / `poisoned`
  - hidden reminder markers and marker metadata
  - pending prompt internals
  - Storyteller notes
  - private info logs not addressed to viewer
- Public projection includes only official public truth (alive/dead, nominations, votes, executions, phase clock).

### 3) Player-known truth rules are encoded

- Player projection includes self-knowledge fields where appropriate:
  - own perceived role/alignment lane;
  - own alive/dead and dead-vote availability;
  - own private info log entries.
- Player projection does not imply causes or hidden mechanics when rules do not guarantee them.

### 4) Adjudication + projection interplay is safe

- Prompt and ruling data is role-gated:
  - Storyteller sees full prompt queue and notes;
  - player/public views do not leak unresolved prompt internals.
- Resolved outcomes that become official public truth are reflected only through public-facing events, not raw hidden prompt state.

### 5) CLI gains projection-aware views

- Add local CLI view commands:
  - `view storyteller`
  - `view player <player_id>`
  - `view public`
- Output uses projection functions, not raw `GameState`, for non-storyteller modes.
- Existing `state` command may remain Storyteller/debug mode, but view commands must enforce visibility boundaries.

### 6) Replay and determinism remain intact

- Projection functions are pure and deterministic for a given `GameState`.
- Replayed game state yields identical projections for same audience.
- Projection logic does not mutate state and does not bypass command/event flow.

## Required Deliverables

- `game/src/projections/storyteller.ts`
- `game/src/projections/player.ts`
- `game/src/projections/public.ts`
- projection result types (new types file or `domain/types.ts` extension)
- CLI parser/repl/formatter updates for `view` commands
- tests for projection privacy and deterministic outputs

## Projection Expectations (Phase 5)

Use `snake_case` payload keys in projected objects.

### Minimum projection functions

- `project_for_storyteller(state)`
- `project_for_player(state, player_id)`
- `project_for_public(state)`

### Minimum projection guarantees

- Storyteller: full truth + adjudication + private logs.
- Player: own private truths + official public truth; never other hidden truths.
- Public: official public truth only.

## State and Data Handling Expectations

Phase 5 should not require fundamental engine-state redesign.

Projection rules:
- treat `GameState` as authoritative source; projection is derived-only;
- no projection may mutate source state;
- if a field is not explicitly allowed for audience, it is omitted.

## Validation and Invariants to Add

- projection outputs are deterministic for fixed input state.
- player/public projections do not contain forbidden keys.
- `project_for_player` rejects unknown `player_id` with deterministic error/result contract.
- view commands cannot bypass projection boundaries.

## Definition of Done

Phase 5 is complete when all conditions below are true:

- projection modules exist and are wired into public API;
- CLI supports `view storyteller|player|public` commands;
- anti-leak tests cover hidden truth, private logs, and prompt/ruling confidentiality;
- projection functions are pure and deterministic;
- `pnpm --filter game run typecheck` passes;
- `pnpm --filter game run test` passes.

## Test Matrix (minimum)

- storyteller projection includes hidden truth fields
- player projection includes own private info but excludes other players' hidden truth
- public projection includes alive/dead + public day flow and excludes hidden fields
- player projection excludes storyteller notes and unresolved prompt internals
- projection determinism: same state -> deep-equal projection output
- replayed state projection equals directly evolved state projection
- unknown player id in `project_for_player` handled deterministically
- CLI `view player` and `view public` paths render projection output (not raw state)

## Risks and Guardrails

- Risk: accidental leakage through broad object spreading.
  - Guardrail: construct projection DTOs field-by-field with deny-by-default policy.
- Risk: projection logic drifting from rules/public-truth boundaries.
  - Guardrail: add explicit forbidden-field assertions in tests.
- Risk: CLI accidentally exposing raw state in player/public commands.
  - Guardrail: route all `view` commands through projection modules only.

## Acceptance Summary

Phase 5 should leave the project with a reliable privacy boundary layer so downstream plugin and social systems can build on safe audience-specific views without reworking core engine state.
