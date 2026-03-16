# Game Engine Phase 4 Expected Outcome

## Scope

Phase 4 introduces the adjudication prompt system on top of the Phase 1-3 deterministic core.

Focus areas:
- explicit modeling of Storyteller discretion points as queued prompts;
- deterministic prompt lifecycle (create, list, resolve, close/cancel);
- `ResolvePrompt` command path and reducer integration;
- auditable adjudication events and notes linkage.

Out of scope:
- projection privacy layer and anti-leak projection tests (Phase 5);
- plugin-driven character runtime and interrupt hook execution (Phase 6);
- social claims timeline workflow (Phase 7);
- full character-almanac automation.

## Expected Outcomes

By end of Phase 4, discretionary rulings are represented as explicit engine state and events, never as implicit side effects.

### 1) Prompt schema is formalized

- Add a serializable prompt schema with `snake_case` keys.
- Minimum fields:
  - `prompt_key`
  - `kind`
  - `reason`
  - `visibility`
  - `options`
  - `status` (`pending` | `resolved` | `cancelled`)
  - `created_at_event_id`
  - `resolved_at_event_id?`
  - `resolution_payload?`
  - `notes?`
- Schema supports both strict-choice prompts and freeform Storyteller rationale.

### 2) Prompt queue lifecycle is deterministic

- Introduce queue/state structures for pending prompts.
- Prompt creation is evented and replay-safe.
- Prompt resolution is evented and replay-safe.
- Resolved/cancelled prompts remain in history for auditability.
- Duplicate resolution of the same prompt is rejected with stable error codes.

### 3) `ResolvePrompt` command is implemented

- Add `ResolvePrompt` to command model and command-handler dispatch.
- Command validates:
  - prompt exists;
  - prompt is currently `pending`;
  - resolution payload matches prompt constraints.
- Command emits adjudication events only; direct state mutation is disallowed.

### 4) Adjudication events are auditable

- Prompt lifecycle is represented in domain events.
- At minimum, resolution emits events that capture:
  - who resolved the prompt (`actor_id`);
  - what decision was made (`resolution_payload`);
  - why (`reason` and/or `notes`).
- Events integrate cleanly with replay and existing `domain_events` history.

### 5) Storyteller notes linkage exists

- Decision notes are linked to prompt records and event ids.
- Notes are retained in authoritative state for later review/debugging.
- Engine truth remains separate from player social claims.

### 6) CLI supports prompt operation (Phase 4 increment)

- Add local CLI commands for prompt workflow:
  - list pending prompts;
  - inspect prompt details;
  - resolve prompt via `ResolvePrompt` dispatch.
- CLI rendering is concise and Storyteller-focused.
- CLI still routes all game mutations through `handle_command` + `apply_events`.

## Required Deliverables

- `game/src/adjudication/prompts.ts`
- command/event union updates for prompt lifecycle
- reducer integration for prompt queue and resolution state
- command handler integration for `ResolvePrompt`
- CLI parser/repl/formatter updates for prompt commands
- tests for prompt lifecycle determinism and validation

## Command/Event Expectations (Phase 4)

Use `PascalCase` command/event names and `snake_case` payload keys.

### Commands (minimum)

- `ResolvePrompt`

Optional but recommended if needed for testability/bootstrap:
- `CreatePrompt`
- `CancelPrompt`

### Events (minimum)

- `StorytellerChoiceMade`
- `StorytellerRulingRecorded`

Optional but recommended for explicit lifecycle tracing:
- `PromptQueued`
- `PromptResolved`
- `PromptCancelled`

## State Expectations

Phase 4 should include these state capabilities (snake_case):

- `pending_prompts` runtime queue with stable ordering.
- prompt registry/history keyed by `prompt_key`.
- per-prompt status and resolution metadata.
- linkage to adjudication notes and event ids.

State rules:
- prompt resolution is monotonic (`pending` -> `resolved`/`cancelled`, no reopen).
- prompt keys are unique within a game.
- prompt resolution does not bypass existing day/death/win invariants.

## Validation and Invariants to Add

- pending prompt keys must be unique.
- every key in `pending_prompts` must reference an existing prompt record.
- only `pending` prompts may appear in `pending_prompts`.
- `resolved`/`cancelled` prompts must have `resolved_at_event_id`.
- `ResolvePrompt` against unknown/non-pending prompt is rejected deterministically.

Prompt key conventions (normative)
---------------------------------
- Plugin-authored prompt keys should use:
  - `plugin:<character_id>:<verb>:<time_key>:<player_id>[:detail...]`
- `time_key` format:
  - `d<day_number>` for day scope
  - `n<night_number>` for night scope
- Examples:
  - `plugin:poisoner:night_poison:n1:p5`
  - `plugin:imp:night_kill:n2:p2`

Payload conventions (normative)
-------------------------------
- `prompt_id` alias is removed from command/event payloads.
- prompt lifecycle commands/events use `prompt_key` only.

## Definition of Done

Phase 4 is complete when all conditions below are true:

- prompt schema exists and is used by engine state;
- prompt creation/resolution is fully evented;
- `ResolvePrompt` lifecycle is replay-safe and test-covered;
- CLI can inspect and resolve prompts through engine command dispatch;
- adjudication notes and decision metadata are preserved in state/event log;
- `pnpm --filter game run typecheck` passes;
- `pnpm --filter game run test` passes.

## Test Matrix (minimum)

- prompt queued -> visible in pending list
- prompt resolved -> removed from pending and marked resolved
- resolve same prompt twice rejected
- resolve unknown prompt rejected
- replay determinism with mixed gameplay + adjudication events
- reducer invariant catches dangling prompt id in queue
- CLI parser accepts prompt commands and maps to engine commands
- CLI resolution path emits expected adjudication events

## Risks and Guardrails

- Risk: hidden discretionary logic leaks into direct state mutation.
  - Guardrail: all adjudication decisions must be command/event-driven.
- Risk: prompt schema too narrow for future character interactions.
  - Guardrail: include extensible `options` and `resolution_payload` shapes.
- Risk: lifecycle ambiguity between resolved and cancelled prompts.
  - Guardrail: enforce explicit status transitions and invariant checks.

## Acceptance Summary

Phase 4 should leave the engine with an explicit, auditable adjudication layer that records Storyteller discretion as deterministic events, enabling later phases (visibility and plugins) to consume prompt outcomes without reworking core flow.
