# Speckit Plan - Clocktower Engine (TypeScript)

## Planning Principles

- Build deterministic core first, character complexity second.
- Keep Storyteller adjudication explicit, never implicit.
- Keep social claims separate from authoritative state.
- Enforce naming convention:
  - payload/state keys = `snake_case`
  - command/event/type names = `PascalCase`

## Milestones

### SPEC-01 Foundation

**Goal**
Create TypeScript engine package and deterministic event core.

**Tasks**
- Initialize `game/` TS package (`package.json`, `tsconfig.json`, `src/`, `tests/`).
- Define `GameState`, command/event base types.
- Implement `applyEvent` reducer.
- Implement invariant runner and base invariants.
- Add replay helper (`replay(events) -> state`).

**Deliverables**
- `game/src/domain/*`
- baseline tests for reducer and replay.

**Definition of Done**
- replay produces stable state;
- invariant tests pass.

---

### SPEC-02 Phase + Day/Night Core

**Goal**
Implement phase machine and official day procedure.

**Tasks**
- Implement phase/subphase transitions.
- Implement nomination rules:
  - only alive nominators;
  - nominate once/day;
  - target nominated once/day.
- Implement vote flow and threshold:
  - `ceil(alive_count / 2)`;
  - tie means no execution.
- Implement execution vs death split.

**Deliverables**
- `phase-machine.ts`, `day-flow.ts`, initial `night-flow.ts`.

**Definition of Done**
- scenario tests pass:
  - normal execution day;
  - tie day no execution;
  - no nominee reaches threshold.

---

### SPEC-03 Death, Dead Vote, Win Checks

**Goal**
Complete death consequences and win logic.

**Tasks**
- Dead players cannot nominate.
- Dead vote token consumed once post-death.
- Dead cannot die again.
- Implement automatic win checks:
  - good wins when Demon dies;
  - evil wins at 2 alive (excluding Travellers).
- Add `DeclareForcedVictory` command for Storyteller override.

**Deliverables**
- `win-check.ts`, extended reducer/invariants.

**Definition of Done**
- targeted scenarios pass;
- win state transitions tested.

---

### SPEC-03.1 CLI Interface (Phase 3.1)

**Goal**
Provide an interactive CLI to run commands against the engine and inspect emitted events + current state.

**Tasks**
- Add interactive REPL entrypoint under `game/src/cli/`.
- Add human-friendly command parser (text command -> typed engine command).
- Add local CLI commands for inspection (`help`, `state`, `events`, `players`, `player`, `new`, `quit`).
- Route engine commands through `handle_command` + `apply_events` only.
- Add output formatters for event stream and state snapshots (brief + json).
- Add package script for running CLI.

**Deliverables**
- `game/src/cli/repl.ts`
- `game/src/cli/command-parser.ts`
- `game/src/cli/formatters.ts`
- `game/package.json` script update (`cli`)

**Definition of Done**
- CLI can execute existing Phase 1-3 commands.
- CLI prints engine errors with stable code/message output.
- CLI shows emitted events after successful command execution.
- CLI can print current state in both brief and JSON modes.

---

### SPEC-04 Adjudication Prompt System

**Goal**
Model discretionary rulings as explicit prompts.

**Tasks**
- Define prompt schema (`prompt_id`, `kind`, `reason`, `options`, `visibility`).
- Add prompt queue lifecycle.
- Implement `ResolvePrompt` command.
- Add adjudication events and notes linkage.

**Deliverables**
- `adjudication/prompts.ts` + reducer integration.

**Definition of Done**
- prompt creation/resolution fully evented and replay-safe.

---

### SPEC-05 Visibility Projections

**Goal**
Enforce hidden-information boundaries.

**Tasks**
- Implement Storyteller projection.
- Implement player projection.
- Implement public projection.
- Keep projection DTO identifiers typed with `PlayerId` (not plain `string`) where applicable.
- Ensure player projection does not expose `registered_character_id` / `registered_alignment` by default.
- Add anti-leak tests for private state.

**Deliverables**
- `projections/storyteller.ts`
- `projections/player.ts`
- `projections/public.ts`

**Definition of Done**
- privacy tests pass, no hidden-state leakage;
- player projection omits `registered_*` unless explicitly rules-gated;
- projection DTO identifier typing is consistent with domain ids.

---

### SPEC-06 Plugin Runtime (Character Engine)

**Goal**
Support character-specific behavior via plugins.

**Tasks**
- Define plugin contract and metadata schema.
- Implement plugin registry and hook dispatcher.
- Implement interrupt queue integration.
- Add two sample plugins (`imp`, `poisoner`) as proof of architecture.

**Subtasks (implementation order)**
- **SPEC-06.1 Contract + Registry**
  - Add plugin interfaces (metadata, hook signatures, result envelope).
  - Add registry APIs (register/get/list/validate duplicate ids).
- **SPEC-06.2 Runtime Queue Model**
  - Add `wake_queue` and `interrupt_queue` to state model.
  - Add reducer support and invariants for queue integrity.
- **SPEC-06.3 Hook Dispatcher**
  - Implement deterministic dispatch with explicit hook boundaries.
  - Normalize plugin outputs into events/prompts/interrupt tasks.
- **SPEC-06.4 Engine Integration**
  - Wire dispatcher into night flow and prompt resolution flow.
  - Enforce reducer-only mutation path.
- **SPEC-06.5 Sample Plugin: Imp**
  - Wake hook requests a kill target prompt.
  - Prompt resolution hook emits consequence events via engine flow.
- **SPEC-06.6 Sample Plugin: Poisoner**
  - Wake hook requests poison target prompt.
  - Prompt resolution hook emits poison apply/restore lifecycle events.
- **SPEC-06.7 CLI Debugging Surface**
  - Add commands to list plugins, inspect last hook dispatch output, inspect queues.
- **SPEC-06.8 Test + Hardening**
  - Add scenario tests for imp/poisoner behavior and interrupt ordering.
  - Add replay checks for plugin-generated outputs.

**Imp Reference Flow**
1. Night flow schedules an `imp` wake step into `wake_queue`.
2. Dispatcher calls the `imp` wake hook and gets a target-choice prompt.
3. Storyteller resolves prompt through `ResolvePrompt`.
4. Dispatcher calls the `imp` prompt-resolution hook.
5. Plugin returns consequence events and optional interrupts.
6. Engine applies events through reducer, then drains interrupts deterministically.

**Deliverables**
- `plugins/contracts.ts`, `plugins/registry.ts`
- sample plugin modules and tests.

**Definition of Done**
- sample scenarios resolve via plugin events/prompts.
- imp flow is documented and covered by scenario tests.
- plugin hooks remain pure/declarative (no direct state mutation).

---

### SPEC-07 Social Claims + Review Timeline

**Goal**
Track player claims for post-game and mid-game review.

**Tasks**
- Define `ClaimRecord` model.
- Implement claim commands:
  - `RecordClaim`
  - `RetractClaim`
  - `MarkClaimStatus`
- Add claim events:
  - `ClaimRecorded`
  - `ClaimRetracted`
  - `ClaimStatusChanged`
- Build claim timeline query utilities:
  - by day/phase
  - by speaker
  - by subject
  - by claim type

**Deliverables**
- `social/claims.ts`
- claim-focused tests.

**Definition of Done**
- claims are queryable and replayed correctly;
- claims never treated as authoritative truth in rule checks.

---

### SPEC-08 Hardening + DX

**Goal**
Stabilize API and improve developer workflow.

**Tasks**
- Add command validation errors with stable codes.
- Add fixture-based scenario test matrix.
- Add docs for:
  - architecture decisions;
  - naming rules;
  - extension flow for new character plugins.

**Deliverables**
- test fixtures and docs updates.

**Definition of Done**
- all milestones green;
- clear extension path documented.

## Dependency Order

1. SPEC-01
2. SPEC-02
3. SPEC-03
4. SPEC-03.1
5. SPEC-04 + SPEC-05 (parallel possible after SPEC-02/03)
6. SPEC-06.1 -> SPEC-06.8
7. SPEC-07
8. SPEC-08

## Test Matrix (minimum)

- reducer replay determinism
- phase transition guards
- nomination eligibility
- vote threshold and tie behavior
- execution vs death separation
- dead vote single-use rule
- dead cannot die again
- automatic win checks + forced victory
- CLI command parser validity/usage errors
- CLI engine-command dispatch emits event stream
- adjudication prompt lifecycle
- projection non-leak guarantees
- projection omits `registered_*` from player/public by default
- projection DTO id types align with domain id aliases
- plugin interrupt behavior
- social claims lifecycle and querying

## Risks and Mitigations

- **Risk:** Character edge cases overwhelm core.
  - **Mitigation:** keep plugin boundary strict; prompt unresolved cases.
- **Risk:** Hidden info leaks in projections.
  - **Mitigation:** projection tests + deny-by-default field exposure.
- **Risk:** Event schema churn.
  - **Mitigation:** finalize naming convention early; version event payloads if needed.

## Initial Execution Checklist

- Create `game/` TS package structure.
- Commit SPEC-01 scaffolding first.
- Add scenario tests before plugin complexity.
- Integrate sample plugins only after core flow is stable.
