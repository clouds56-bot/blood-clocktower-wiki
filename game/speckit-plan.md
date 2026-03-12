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
- Add anti-leak tests for private state.

**Deliverables**
- `projections/storyteller.ts`
- `projections/player.ts`
- `projections/public.ts`

**Definition of Done**
- privacy tests pass, no hidden-state leakage.

---

### SPEC-06 Plugin Runtime (Character Engine)

**Goal**
Support character-specific behavior via plugins.

**Tasks**
- Define plugin contract and metadata schema.
- Implement plugin registry and hook dispatcher.
- Implement interrupt queue integration.
- Add two sample plugins (`imp`, `poisoner`) as proof of architecture.

**Deliverables**
- `plugins/contracts.ts`, `plugins/registry.ts`
- sample plugin modules and tests.

**Definition of Done**
- sample scenarios resolve via plugin events/prompts.

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
4. SPEC-04 + SPEC-05 (parallel possible after SPEC-02/03)
5. SPEC-06
6. SPEC-07
7. SPEC-08

## Test Matrix (minimum)

- reducer replay determinism
- phase transition guards
- nomination eligibility
- vote threshold and tie behavior
- execution vs death separation
- dead vote single-use rule
- dead cannot die again
- automatic win checks + forced victory
- adjudication prompt lifecycle
- projection non-leak guarantees
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
