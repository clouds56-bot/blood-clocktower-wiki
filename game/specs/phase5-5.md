# Game Engine Phase 5.5 Expected Outcome

## Scope

Phase 5.5 introduces an authoritative reminder-marker system (buff/debuff model) on top of Phase 1-5 core state, adjudication, and visibility.

Focus areas:
- reminder markers as hidden authoritative rule state;
- stack-safe multi-source status resolution (for example poison from multiple sources);
- deterministic marker lifecycle (apply, clear, expire, sweep);
- compatibility bridge for existing status commands/events (`ApplyPoison`, `ApplyDrunk`, `PoisonApplied`, `DrunkApplied`, restore events);
- projection-safe marker visibility and CLI marker tooling.

Out of scope:
- full almanac-perfect implementation for all characters;
- social claims lifecycle/query features (Phase 7);
- broad DX hardening and fixture expansion (Phase 8).

## Expected Outcomes

By end of Phase 5.5, reminder markers are the single authoritative source for effect-style hidden state, while legacy poison/drunk commands remain supported via a deterministic adapter bridge.

### 1) Reminder marker model is formalized

- Add `ReminderMarker` schema with `snake_case` keys.
- Minimum fields:
  - `marker_id` (deterministic event-linked id)
  - `kind` (for example `poisoner:poisoned`)
  - `effect` (`poisoned` | `drunk` | ...)
  - `note` (string)
  - `status` (`active` | `cleared` | `expired`)
  - `source_player_id?`
  - `source_character_id?`
  - `target_player_id?`
  - `target_scope` (`player` | `game` | `pair`)
  - `authoritative`
  - `expires_policy`
  - `expires_at_day_number?`
  - `expires_at_night_number?`
  - `created_at_event_id`
  - `cleared_at_event_id?`
  - `source_event_id?`
  - `metadata?`
- `kind` is not unique; multiple active markers of the same kind may coexist.

### 2) Marker lifecycle is deterministic and replay-safe

- Apply/clear/expire paths are fully evented.
- Add state indexes:
  - `reminder_markers_by_id`
  - `active_reminder_marker_ids`
- `SweepReminderExpiry` deterministically expires matching markers based on policy and game clock.
- `AdvancePhase` automatically performs expiry sweep and emits `ReminderMarkerExpired` as needed.
- Replaying the same event stream yields identical active marker sets.

### 3) Status truth is marker-derived and stack-safe

- `poisoned` and `drunk` are derived from active authoritative markers.
- Multi-source stacking works by marker multiplicity, not single-source booleans.
- Example: player with both `poisoner:poisoned` and `no_dashii:poisoned` remains poisoned when only one source clears.

### 4) Compatibility bridge is explicit

- Keep existing commands/events for integration stability:
  - commands: `ApplyPoison`, `ApplyDrunk`
  - events: `PoisonApplied`, `HealthRestored`, `DrunkApplied`, `SobrietyRestored`
- Bridge behavior:
  - compatibility commands map to marker lifecycle operations;
  - plugin-emitted marker lifecycle events also trigger compatibility transition events when effective status changes;
  - status transition events are emitted only when effective status changes;
  - no hidden direct bool mutation outside reducer/event path.
- Important guardrail:
  - do not dispatch new commands from reducer/event hooks;
  - produce bridge events in command handling flow where pre/post state can be compared deterministically.

### 5) Event identity and marker ID policy is collision-safe

- `event_type` is not unique; repeated same-type events are expected.
- `event_id` is a global 1-based numeric ordinal assigned by reducer append order.
- `event_key` is a deterministic producer key string (for example `${command_id}:${event_type}:${index}`) and must be unique.
- `marker_id` must be deterministic and event-linked:
  - one marker per event: `marker_id = event_key`
  - multiple markers per event: `marker_id = ${event_key}:${index}`

### 6) Visibility and CLI support are integrated

- Storyteller projection includes full marker data.
- Player/public projections are deny-by-default for hidden markers and metadata.
- Add marker CLI operations:
  - `markers`
  - `marker <marker_id>`
  - `apply-marker ...`
  - `clear-marker <marker_id>`
  - `sweep-markers`

## Required Deliverables

- `game/src/domain/types.ts` (marker types + state fields)
- `game/src/domain/state.ts` (initial marker state)
- `game/src/domain/commands.ts` (marker commands + compatibility command contract)
- `game/src/domain/events.ts` (marker lifecycle events + compatibility event contract)
- `game/src/domain/reducer.ts` (marker lifecycle + derived status updates)
- `game/src/domain/invariants.ts` (marker and derived-status consistency checks)
- `game/src/engine/reminder-flow.ts` (marker lifecycle and expiry orchestration)
- `game/src/engine/command-handler.ts` integration for compatibility bridge
- `game/src/projections/*` updates for marker visibility policy
- `game/src/cli/*` marker command parsing and rendering
- tests for marker lifecycle, bridge behavior, and replay determinism

## Command/Event Expectations (Phase 5.5)

Use `PascalCase` command/event names and `snake_case` payload keys.

### Commands (minimum)

- `ApplyReminderMarker`
- `ClearReminderMarker`
- `ClearReminderMarkersBySelector`
- `SweepReminderExpiry`

Compatibility commands (must remain supported):
- `ApplyPoison`
- `ApplyDrunk`

### Events (minimum)

- `ReminderMarkerApplied`
- `ReminderMarkerCleared`
- `ReminderMarkerExpired`

Compatibility status transition events (must remain supported):
- `PoisonApplied`
- `HealthRestored`
- `DrunkApplied`
- `SobrietyRestored`

## State and Invariant Expectations

Add and validate at least:
- unique `marker_id` across `reminder_markers_by_id`;
- unique `active_reminder_marker_ids`;
- each active id references an existing marker with `status=active`;
- cleared/expired markers include `cleared_at_event_id`;
- authoritative player-targeted markers reference existing players;
- derived `poisoned`/`drunk` flags equal marker-derived truth.

## Definition of Done

Phase 5.5 is complete when all conditions below are true:

- reminder markers are authoritative and replay-safe;
- stacking and selective clear semantics are correct;
- compatibility commands/events still work through marker bridge;
- compatibility transition events fire only on effective status changes;
- projections enforce non-leak marker visibility;
- CLI exposes marker inspection/lifecycle commands;
- `pnpm --filter game run typecheck` passes;
- `pnpm --filter game run test` passes.

## Test Matrix (minimum)

- apply marker -> appears active with deterministic `marker_id`
- clear marker -> removed from active, status updated
- expiry sweep expires only eligible markers
- same-kind multi-source markers coexist
- auto sweep on phase advance emits `ReminderMarkerExpired` for eligible markers
- poison stacking scenario (`poisoner:poisoned` + `no_dashii:poisoned`) remains poisoned when one source clears
- compatibility `ApplyPoison` creates marker + emits `PoisonApplied` only on status transition
- compatibility clear path emits `HealthRestored` only when final poison source is removed
- compatibility `ApplyDrunk` path mirrors poison behavior for drunk/sober transitions
- replay determinism with mixed gameplay, marker, and compatibility events
- projection non-leak for marker fields/metadata in player/public views
- CLI parser and dispatch for marker commands

## Risks and Guardrails

- Risk: marker and compatibility paths diverge.
  - Guardrail: single bridge implementation with transition-only compatibility event emission.
- Risk: command recursion from event hooks.
  - Guardrail: never dispatch commands from reducer/event hooks.
- Risk: marker id collisions during multi-event commands.
  - Guardrail: deterministic indexed event id policy.
- Risk: hidden marker leakage to player/public views.
  - Guardrail: deny-by-default projection construction + explicit anti-leak assertions.

## Acceptance Summary

Phase 5.5 should leave the project with a deterministic, authoritative reminder-marker engine that supports stacked effects and preserves legacy poison/drunk integration contracts through a clean compatibility bridge.
