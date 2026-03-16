# Trouble Brewing Implementation Plan

This plan turns `game/specs/edition.tb.md` into executable implementation slices.

## TB-01 Setup + Composition

Scope:
- Load TB edition metadata (`tb.json`) into runtime schedule and role registry input.
- Implement setup mutation for `baron` (+2 outsiders, -2 townsfolk).
- Implement `drunk` perceived-vs-true assignment model.
- Add setup-time `fortune_teller:red_herring` marker placement.

Done when:
- setup invariants pass after Baron mutation;
- Drunk gets `true_character_id=drunk` and Townsfolk `perceived_character_id`;
- red herring is persisted and replay-stable.

Tests:
- player-count composition with and without Baron;
- Drunk assignment visibility;
- red herring determinism under replay.

## TB-02 First-Night Information Roles

Scope:
- Implement plugins: `washerwoman`, `librarian`, `investigator`, `chef`, `empath`,
  `fortune_teller`.
- Wire first-night wake scheduling from TB night order.
- Add info payload formatter for role+pair and numeric outputs.

Done when:
- first-night info roles all emit `PrivateInfoShown` payloads deterministically;
- outputs support poison/drunk misinformation path.

Tests:
- each role baseline true-info scenario;
- poisoned first-night role receives legal false payload;
- empath uses alive-neighbor traversal.

## TB-03 Night Actions: Poison, Protect, Kill

Scope:
- Implement `poisoner`, `monk`, `soldier`, `imp`.
- Add death-attempt chain: poison/drunk -> protection -> kill resolution.
- Support Imp dead-target sink kills and no-death nights.

Done when:
- monk protection blocks demon kill while active;
- soldier blocks demon kill when healthy/sober;
- poison windows are night+next-day with dusk expiry;
- imp kill path is replay-stable.

Tests:
- monk protects target;
- poisoned monk fails to protect;
- soldier kill immunity and poisoned soldier failure;
- imp dead-target sink produces no new death.

## TB-04 Day/Reactive Roles

Scope:
- Implement `virgin`, `slayer`, `saint`, `mayor`, `ravenkeeper`, `undertaker`, `butler`.
- Integrate day interrupt handling for Virgin and Slayer via generic claimed ability activation flow.
- Implement Butler vote restriction checks.
- Implement Mayor final-3 no-execution win and night redirection hook.
- Migrate day-reactive logic to plugin boundaries where possible (`on_nomination_made`, `on_vote_cast_validate`, `on_execution_resolving`).

Done when:
- virgin trigger executes nominator exactly once;
- slayer shot is once-per-game and spends while drunk/poisoned;
- slayer shot is invoked through `UseClaimedAbility` prompt flow (no role-specific shot command);
- saint execution loss only on execution death;
- undertaker and ravenkeeper read flows resolve in proper windows;
- butler vote enforcement is deterministic.
- engine day-flow keeps orchestration/validation, while role-specific checks are plugin-owned.

Tests:
- virgin with townsfolk nominator;
- slayer hit/miss and spent state through claimed ability attempt prompt lifecycle;
- saint execution loss condition;
- mayor final-3 no-execution win;
- ravenkeeper night-death trigger;
- undertaker learns executed role;
- butler vote blocked without master vote.

## TB-05 Registration Engine for TB

Scope:
- Implement registration providers: `recluse`, `spy`.
- Add registration-query runtime (`query_id`, create/resolve lifecycle, deterministic replay records).
- Add registration-aware query helpers consumed by role checks.
- Implement Spy nightly grimoire reveal in private projection-safe path.
- Enforce per-check registration semantics (no sticky once/night lock).

Done when:
- registration-aware checks are used by all TB-sensitive roles;
- spy/recluse registration decisions are auditable and replay-safe;
- same subject can resolve differently across different query ids in one night/day;
- no hidden-state leaks in non-storyteller projections.

Tests:
- chef/empath/fortune_teller/investigator/slayer/virgin registration edge cases;
- undertaker/ravenkeeper read using registered state;
- chef pair-case proving different registrations for one subject across two query ids;
- projection anti-leak tests for registration internals.

## TB-06 Demon Continuity + Win Integration

Scope:
- Implement `scarlet_woman` takeover at demon death (>=5 alive non-travellers).
- Implement `imp` self-kill demon transfer to alive minion.
- Integrate with win-check ordering to avoid premature good victory.
- Place continuity behavior behind plugin-oriented boundaries (`on_player_died` and/or `on_pre_win_check`) while preserving deterministic win ordering.

Done when:
- demon continuity applies before final win resolution;
- takeover/self-transfer emit correct character-change and private role-reveal events.
- continuity trigger logic is plugin-owned; engine win-check remains final arbiter.

Tests:
- scarlet woman takeover at 5+ alive;
- no takeover below 5 alive;
- imp self-kill transfer;
- good win only after failed continuity.

## TB-08 Plugin-First Hook Migration

Scope:
- Expand plugin contracts and runtime boundaries for character-owned logic:
  - nomination reactions,
  - vote validation,
  - death reactions,
  - pre-win continuity,
  - registration adjudication queries.
- Incrementally move remaining engine-embedded character rules to plugins.

Done when:
- engine modules primarily orchestrate phases/commands and apply deterministic ordering;
- TB role-specific logic is implemented in character plugins;
- replay determinism and projection safety are unchanged.

Tests:
- parity tests for migrated roles (before/after behavior snapshots);
- boundary ordering tests (`base events -> hooks -> compatibility -> win check`);
- deterministic replay for mixed migrated/non-migrated roles.

## TB-07 End-to-End TB Matrix

Scope:
- Build scenario fixtures that combine setup, nightly flow, day flow, continuity, and projections.
- Add deterministic replay verification for all TB scenarios.

Done when:
- full TB matrix is green;
- event stream and final state are stable across replay.

Tests:
- integrated games covering:
  - Baron+Drunk setup signals,
  - Poison + Monk/Soldier protections,
  - Virgin + Slayer day interrupts,
  - Undertaker/Ravenkeeper info windows,
  - Recluse/Spy registration distortions,
  - Imp/SW continuity transitions.

## Recommended Execution Order

1. TB-01
2. TB-02
3. TB-03
4. TB-04
5. TB-05
6. TB-06
7. TB-07
8. TB-08

## Deliverable Gates

- Gate A: TB setup and first-night information complete (`TB-01`, `TB-02`)
- Gate B: core night/day mechanics complete (`TB-03`, `TB-04`)
- Gate C: interaction-hard cases complete (`TB-05`, `TB-06`)
- Gate D: end-to-end confidence complete (`TB-07`)
- Gate E: plugin-first architecture migration complete (`TB-08`)
