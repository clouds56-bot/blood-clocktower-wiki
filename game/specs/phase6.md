# Game Engine Phase 6 Expected Outcome

## Scope

Phase 6 implements the character plugin runtime on top of Phase 1-5.5 core engine, adjudication, visibility, and reminder-marker layers.

Focus areas:
- plugin contract and metadata for character behavior;
- deterministic registry and hook dispatcher;
- runtime scheduling via `wake_queue` and `interrupt_queue`;
- engine integration at explicit hook boundaries;
- proof plugins (`imp`, `poisoner`) that resolve through events/prompts;
- CLI debugging support for plugin runtime internals.

Out of scope:
- full almanac-perfect handling for every character;
- social claims lifecycle/query features (Phase 7);
- broader API/DX hardening and fixture matrix expansion (Phase 8).

## Expected Outcomes (Overall)

By end of Phase 6, character behavior is executed by plugins through deterministic, event-driven hook dispatch and never by direct state mutation.

### 1) Plugin boundary is formalized

- Define explicit plugin interfaces for metadata and hooks.
- Plugin outputs are declarative only:
  - domain events;
  - prompt requests;
  - interrupt tasks.
- Core engine remains character-agnostic.

### 2) Runtime queues are first-class state

- Add `wake_queue` for ordered wake processing.
- Add `interrupt_queue` for immediate/preemptive resolution.
- Queue structures are serialization-friendly (`snake_case` payload/state keys).
- Invariants validate queue integrity and reference validity.

### 3) Hook dispatch is deterministic and replay-safe

- Dispatcher runs at explicit boundaries only.
- Hook execution order is stable and testable.
- Plugin-generated outputs are normalized into standard command/event flow.
- Replaying the same event stream yields the same resulting state.

### 4) Engine integration is explicit

- Night flow enqueues/executes wake steps through plugin runtime.
- Prompt resolution can re-enter plugin runtime for follow-up effects.
- Interrupts are drained deterministically before resuming normal wake flow.

### 5) Imp and Poisoner prove architecture

- `imp` demonstrates prompt-driven kill resolution.
- `poisoner` demonstrates status-effect lifecycle via reminder marker events (`poisoner:poisoned`) emitted by plugin output.
- Both implementations prove plugin hooks can express core character behavior without core hardcoding.

### 6) CLI supports plugin runtime debugging

- List registered plugins.
- Inspect last hook-dispatch output (events/prompts/interrupts).
- Inspect `wake_queue` and `interrupt_queue`.

## Step Breakdown (Phase 6.1-6.8)

### 6.1 Contract + Registry

Goal:
- establish plugin type contracts and registry APIs.

Expected deliverables:
- `game/src/plugins/contracts.ts`
- `game/src/plugins/registry.ts`
- `game/src/index.ts` exports for plugin modules

Done when:
- plugins can be registered, listed, and retrieved by `character_id`;
- duplicate registration fails with stable error behavior.

### 6.2 Runtime Queue Model

Goal:
- model wake/interrupt scheduling in authoritative game state.

Expected deliverables:
- updates to `game/src/domain/types.ts`, `game/src/domain/state.ts`, `game/src/domain/reducer.ts`, `game/src/domain/invariants.ts`

Done when:
- state supports `wake_queue` and `interrupt_queue`;
- reducer events maintain queue transitions correctly;
- invariants catch duplicate/missing/invalid queue references.

### 6.3 Hook Dispatcher

Goal:
- implement deterministic hook execution and output normalization.

Expected deliverables:
- `game/src/plugins/dispatcher.ts` (or equivalent runtime module)

Done when:
- dispatcher executes known hook boundaries with stable ordering;
- returned outputs are validated and normalized for engine consumption.

### 6.4 Engine Integration

Goal:
- wire plugin runtime into night and prompt lifecycles.

Expected deliverables:
- integration updates in `game/src/engine/night-flow.ts`, `game/src/engine/command-handler.ts`, and any needed reducer/event wiring

Done when:
- hook boundaries are invoked only at explicit integration points;
- reducer remains sole mutation path;
- interrupts preempt normal wake steps deterministically.

### 6.5 Sample Plugin: Imp

Goal:
- provide a concrete demon plugin proving prompt -> consequence flow.

Expected deliverables:
- `game/src/plugins/characters/imp.ts` (or equivalent)

Done when:
- imp wake produces target prompt;
- prompt resolution emits consequence events through engine flow;
- scenario behavior is covered by tests.

### 6.6 Sample Plugin: Poisoner

Goal:
- provide a concrete minion plugin proving status-effect flow.

Expected deliverables:
- `game/src/plugins/characters/poisoner.ts` (or equivalent)

Done when:
- poisoner wake produces target prompt;
- prompt resolution emits reminder marker apply/clear lifecycle events for poison targeting;
- scenario behavior is covered by tests.

### 6.7 CLI Debugging Surface

Goal:
- make plugin runtime behavior inspectable from CLI.

Expected deliverables:
- updates to `game/src/cli/command-parser.ts`, `game/src/cli/repl.ts`, `game/src/cli/formatters.ts`

Done when:
- CLI can list plugins, inspect dispatch outputs, and inspect queues;
- output is stable and useful for debugging deterministic flow.

### 6.8 Tests + Hardening

Goal:
- lock behavior with deterministic test coverage.

Expected deliverables:
- `game/tests/plugins/*.test.ts`
- `game/tests/engine/phase6-*.test.ts`
- optional CLI tests for plugin debug commands

Done when:
- plugin runtime tests cover registry, dispatch, queue preemption, imp/poisoner scenarios, and replay determinism;
- `pnpm --filter game run typecheck` passes;
- `pnpm --filter game run test` passes.

## Imp Reference Flow (Normative for 6.5)

1. Night flow schedules an `imp` wake step into `wake_queue`.
2. Dispatcher invokes the `imp` wake hook.
3. Hook returns a target-choice prompt.
4. Storyteller resolves via `ResolvePrompt`.
5. Dispatcher invokes the `imp` prompt-resolution hook.
6. Hook returns consequence events (and optional interrupts).
7. Engine applies events through reducer, then drains interrupts before continuing wake flow.

Constraints:
- plugin does not mutate `GameState` directly;
- all state transition effects are represented as events/prompts;
- target legality and lifecycle guards stay deterministic.

## Required Deliverables (Phase 6 Complete)

- plugin contract + registry modules
- dispatcher module + queue integration
- sample plugins: `imp`, `poisoner`
- CLI runtime debugging commands
- tests for plugin runtime correctness and determinism

## Definition of Done

Phase 6 is complete when all conditions below are true:

- character runtime is plugin-driven for Phase 6 sample characters;
- plugin outputs are declarative and reducer-only mutation is preserved;
- `wake_queue` and `interrupt_queue` are integrated and validated;
- imp and poisoner scenarios pass under tests;
- replay determinism is preserved with plugin-generated outputs;
- CLI exposes plugin/queue debug commands for Storyteller/developer workflow;
- `pnpm --filter game run typecheck` passes;
- `pnpm --filter game run test` passes.

## Risks and Guardrails

- Risk: character-specific behavior leaks into core engine.
  - Guardrail: enforce plugin boundary and reject direct state mutation paths.
- Risk: nondeterministic hook execution order.
  - Guardrail: stable queue ordering + deterministic dispatch tests.
- Risk: queue growth or dangling references.
  - Guardrail: queue invariants and strict enqueue/dequeue ownership rules.
- Risk: hidden-state leakage in debug output.
  - Guardrail: keep projection boundaries intact; treat debug commands as Storyteller/developer-only.

## Acceptance Summary

Phase 6 should leave the project with a deterministic character runtime extension layer where new character behavior can be added as plugins without rewriting core day/night rules.
