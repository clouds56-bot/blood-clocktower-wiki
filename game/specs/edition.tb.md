# Trouble Brewing Edition Spec (Engine + Interaction Contract)

## Scope

This spec defines the Trouble Brewing (TB) character set as an implementation contract for the
`game/` engine architecture.

It covers:
- role-to-role interactions in TB;
- timing and resolution order specific to TB;
- how each role maps to plugin handlers, prompts, events, and reminder markers;
- what must remain Storyteller adjudication.

Sources:
- `game/rules.md`
- `game/architecture.md`
- `game/speckit-plan.md`
- `data/editions/tb.json`
- TB character files under `data/characters/**`

## TB Roster

Townsfolk:
- `chef`, `empath`, `fortune_teller`, `investigator`, `librarian`, `mayor`, `monk`,
  `ravenkeeper`, `slayer`, `soldier`, `undertaker`, `virgin`, `washerwoman`

Outsiders:
- `butler`, `drunk`, `recluse`, `saint`

Minions:
- `baron`, `poisoner`, `scarlet_woman`, `spy`

Demon:
- `imp`

## TB Setup Contract

1. Apply base setup counts by player count.
2. Build candidate in-play set.
3. Apply setup modifiers:
   - `baron`: add 2 Outsiders and remove 2 Townsfolk.
4. Finalize character assignment.
5. Apply perceived-vs-true setup effects:
   - `drunk`: true role is `drunk`, perceived role is a Townsfolk.
6. Apply hidden setup metadata:
   - `fortune_teller` red herring target (good player).
7. Initialize first-night private info packets:
   - `minioninfo`, `demoninfo` (for 7+ player standard games).

## Night Order (TB)

From `data/editions/tb.json`.

First night:
1. `spy`
2. `dusk`
3. `minioninfo`
4. `demoninfo`
5. `poisoner`
6. `washerwoman`
7. `librarian`
8. `investigator`
9. `chef`
10. `empath`
11. `fortune_teller`
12. `butler`
13. `dawn`

Other nights:
1. `dusk`
2. `poisoner`
3. `monk`
4. `spy`
5. `scarlet_woman`
6. `imp`
7. `ravenkeeper`
8. `undertaker`
9. `empath`
10. `fortune_teller`
11. `butler`
12. `dawn`

Ability text can override fixed order via interrupt queue.

## Core TB Resolution Rules

### Protection, death, and replacement precedence

- Demon-sourced death checks target protections first (`monk`, `soldier`) unless target is
  currently poisoned/drunk.
- `mayor` night death replacement ("might") is Storyteller adjudicated.
- Dead players cannot die again.
- Execution and death are separate events.

### Demon continuity

- If Demon dies and `scarlet_woman` condition is met (5+ alive non-Travellers), Demon may transfer.
- If `imp` chooses self and is not blocked, self-dies and an alive Minion becomes new `imp`.
- Good wins on Demon death only when no successful Demon continuity applies.

### Registration and misinformation

- `recluse` and `spy` can register as different alignment/type for checks.
- registration is query-based and per-check, not globally sticky per player.
- the same `spy`/`recluse` may register differently across separate checks in one night/day.
- Poison/drunk can produce false info for affected players.
- Registered state is internal unless explicitly revealed by rules.

### Registration query contract

Registration-sensitive checks must create deterministic query records:
- `query_id` (stable per check instance)
- `consumer_role_id` (role doing the check)
- `query_kind` (`alignment_check` | `character_type_check` | `character_check` | `demon_check`)
- `subject_player_id` (+ optional context players for pair/group checks)
- phase/day/night context

Resolution rules:
- each query resolves once and is replay-stable;
- resolution can differ across different query ids for the same subject;
- resolution is Storyteller-auditable (prompt + decision record), with no player/public leak by default.

## Reminder Marker Model for TB

All persistent TB effects should be represented as authoritative reminder markers:

- `poisoner:poisoned` (expires at dusk)
- `monk:safe` (expires at dawn)
- `fortune_teller:red_herring` (setup-persistent)
- `butler:master` (reselected nightly)
- one-shot spend markers where useful for deterministic replay:
  - `virgin:spent`
  - `slayer:spent`

Status booleans (`poisoned`, `drunk`) are derived from active authoritative markers.

## TB Character Contracts

Each entry lists:
- ability summary;
- interaction-critical behavior;
- implementation mapping for plugin/runtime.

### Townsfolk

#### `chef`
- Ability: first night learn number of adjacent evil pairs.
- Interaction notes:
  - impacted by registration (`recluse`/`spy`) where Storyteller chooses applicable registration.
- Implementation:
  - `timing_category`: `first_night`
  - prompt: none (ST computes value)
  - output: `PrivateInfoShown(number)`
  - adjudication: only for registration choice and poison/drunk misinformation.

#### `empath`
- Ability: each night learn how many alive neighbors are evil (0-2).
- Interaction notes:
  - uses alive-neighbor relation (skip dead seats).
  - affected by registration and poison/drunk.
- Implementation:
  - `timing_category`: `each_night`
  - prompt: none
  - output: `PrivateInfoShown(number)`
  - helper dependency: `aliveNeighbors(player)`.

#### `fortune_teller`
- Ability: each night choose 2 players, learn if either is Demon; one good player registers as
  Demon to this role.
- Interaction notes:
  - red herring fixed at setup.
  - `recluse` can also register Demon.
  - Demon identity can change (`imp` self-kill, `scarlet_woman` takeover).
- Implementation:
  - `timing_category`: `each_night`
  - prompt: choose 2 players
  - markers: `fortune_teller:red_herring` on selected good player
  - output: `PrivateInfoShown(yes_no)`
  - adjudication: misinformation when drunk/poisoned.

#### `investigator`
- Ability: first night learn one of two players is a specific Minion.
- Interaction notes:
  - can be affected by registration and poison/drunk.
- Implementation:
  - `timing_category`: `first_night`
  - prompt: none for player; ST selects pair and role result
  - output: `PrivateInfoShown(minion_role, two_players)`.

#### `librarian`
- Ability: first night learn one of two players is a specific Outsider (or that none are in play).
- Interaction notes:
  - primary structural signal for `drunk` and `baron`-altered setup.
  - can be false while drunk/poisoned.
- Implementation:
  - `timing_category`: `first_night`
  - prompt: none for player
  - output: `PrivateInfoShown(outsider_or_zero, candidate_players)`.

#### `mayor`
- Ability: if 3 players alive and no execution, good wins; if Mayor dies at night, someone else
  might die instead.
- Interaction notes:
  - interacts with `imp` kill attempts and endgame no-execution logic.
  - disabled while drunk/poisoned.
- Implementation:
  - `timing_category`: `passive`
  - hooks:
    - night death replacement check
    - day-end special win check (3 alive + no execution)
  - adjudication: required for "might" replacement choice.

#### `monk`
- Ability: each night* choose a player (not self); target is safe from Demon tonight.
- Interaction notes:
  - can prevent Imp kills, including Imp self-kill if protected target is Imp.
  - blocked if Monk is drunk/poisoned.
- Implementation:
  - `timing_category`: `each_night_except_first`
  - prompt: choose 1 non-self target
  - marker: `monk:safe` expires at dawn
  - resolution guard: demon-sourced death checks this marker first.

#### `ravenkeeper`
- Ability: if killed at night, choose a player and learn their character.
- Interaction notes:
  - triggers only on night death.
  - registration effects can alter shown character.
  - can be nullified if drunk/poisoned when trigger would occur.
- Implementation:
  - `timing_category`: `on_death`
  - interrupt: after qualifying `PlayerDied` at night
  - prompt: choose 1 player
  - output: `PrivateInfoShown(character_token)`.

#### `slayer`
- Ability: once per game during day, publicly choose a player; if Demon, they die.
- Interaction notes:
  - may hit `recluse` as Demon via registration.
  - public action does not by itself prove role.
  - if drunk/poisoned at shot time, shot is spent with no effect.
- Implementation:
  - `timing_category`: `day`
  - `is_once_per_game`: true
  - command path: `UseClaimedAbility` (no target payload) queues public target prompt
  - prompt: public choose 1 target
  - marker: `slayer:spent`
  - events: `ClaimedAbilityAttempted` + optional `PlayerDied`.

#### `soldier`
- Ability: safe from Demon.
- Interaction notes:
  - creates no-death nights with Imp targeting.
  - protection fails while drunk/poisoned.
- Implementation:
  - `timing_category`: `passive`
  - guard in demon kill resolution.

#### `undertaker`
- Ability: each night* learn which character died by execution today.
- Interaction notes:
  - reacts to daily execution history, including atypical outcomes (e.g. Virgin-triggered execution).
  - registration can affect what is shown.
  - can be false while drunk/poisoned.
- Implementation:
  - `timing_category`: `each_night_except_first`
  - prompt: none
  - output: `PrivateInfoShown(character_token_of_executed)`.

#### `virgin`
- Ability: first time nominated, if nominator is Townsfolk, nominator is executed immediately.
- Interaction notes:
  - resolves inside nomination flow as interrupt.
  - depends on nominator registered type (`spy` may register Townsfolk).
  - if Virgin is drunk/poisoned, ability does not function.
- Implementation:
  - `timing_category`: `day` (reactive)
  - trigger: on first nomination against Virgin
  - marker: `virgin:spent`
  - events: `PlayerExecuted` (+ optional `PlayerDied`) on nominator.

#### `washerwoman`
- Ability: first night learn one of two players is a specific Townsfolk.
- Interaction notes:
  - can be affected by `spy` registration as Townsfolk.
  - false info possible while drunk/poisoned.
- Implementation:
  - `timing_category`: `first_night`
  - prompt: none for player; ST chooses payload
  - output: `PrivateInfoShown(townsfolk_role, two_players)`.

### Outsiders

#### `butler`
- Ability: each night choose a player (master); next day may only vote if master votes.
- Interaction notes:
  - dead Butler has no ability.
  - primarily a vote-eligibility constraint, not info.
- Implementation:
  - `timing_category`: `each_night`
  - prompt: choose 1 non-self master
  - marker: `butler:master`
  - day validator: reject or flag vote when master does not vote.

#### `drunk`
- Ability: player is an Outsider but believes they are a Townsfolk.
- Interaction notes:
  - all role behavior follows perceived role interactions from player perspective, but true ability is
    absent.
  - key misinformation source in TB setup and reads.
- Implementation:
  - `timing_category`: `setup`
  - state: `true_character_id=drunk`, `perceived_character_id=<townsfolk>`
  - marker/status: persistent drunk effect on player
  - visibility: never reveal true role to that player unless rules effect would.

#### `recluse`
- Ability: might register as evil and as Minion or Demon, even if dead.
- Interaction notes:
  - affects many checks: `chef`, `empath`, `fortune_teller`, `investigator`, `slayer`,
    `undertaker`, `ravenkeeper`.
- Implementation:
  - `timing_category`: `passive`
  - registration provider: answers registration queries for relevant checks
  - query behavior: per-check adjudication, no persistent global registration lock
  - adjudication: Storyteller decides when/where alternate registration applies.

#### `saint`
- Ability: if executed and dies, good loses.
- Interaction notes:
  - execution-only loss trigger.
  - night deaths do not trigger this clause.
  - if poisoned/drunk when executed, ability fails.
- Implementation:
  - `timing_category`: `passive`
  - trigger: `PlayerDied` with cause `execution` and target `saint`
  - outcome: immediate evil victory event/transition.

### Minions

#### `baron`
- Ability: setup has +2 Outsiders.
- Interaction notes:
  - composition-only effect.
  - informs inference around Outsider counts and Drunk presence.
- Implementation:
  - `timing_category`: `setup`
  - setup mutation in pre-assignment pipeline.

#### `poisoner`
- Ability: each night choose player, poisoned tonight and tomorrow day.
- Interaction notes:
  - central failure mode for TB information and protection roles.
  - poisoning ends at dusk and can be replaced nightly.
  - if Poisoner leaves play (e.g. becomes Imp), poison from this source ends.
- Implementation:
  - `timing_category`: `each_night`
  - prompt: choose 1 player
  - marker: `poisoner:poisoned` with source and expiry policy
  - compatibility transitions: emit `PoisonApplied`/`HealthRestored` when derived status changes.

#### `scarlet_woman`
- Ability: if there are 5+ alive players and Demon dies, become Demon.
- Interaction notes:
  - blocks immediate good win by preserving demon continuity.
  - strongly interacts with execution timing and final-five logic.
  - if drunk/poisoned when trigger window occurs, transfer fails.
- Implementation:
  - `timing_category`: `passive`
  - trigger: on Demon death attempt
  - condition: alive non-Travellers >= 5 and Scarlet Woman alive/functional
  - outcome: `CharacterChanged(scarlet_woman -> imp)` + private "you are" reveal.

#### `spy`
- Ability: each night see Grimoire; might register as good and as Townsfolk or Outsider, even if dead.
- Interaction notes:
  - strongest registration-disruption role in TB.
  - can influence `washerwoman`, `librarian`, `virgin` nominator check, and other read roles.
- Implementation:
  - `timing_category`: `each_night` + `passive` registration
  - prompt: ST shows full hidden state to Spy player
  - registration provider: answers registration queries for relevant checks
  - query behavior: can register differently across separate checks in the same window
  - visibility: this reveal is private to Spy only, never public.

### Demon

#### `imp`
- Ability: each night* choose a player, they die; if self-kill this way, an alive Minion becomes Imp.
- Interaction notes:
  - interacts with `monk` and `soldier` protections.
  - can target dead player to create no-death night.
  - self-kill transfer path and `scarlet_woman` path are separate continuity mechanisms.
- Implementation:
  - `timing_category`: `each_night_except_first`
  - prompt: choose 1 player (alive or dead legal)
  - consequences:
    - normal: candidate death event for target
    - self-target success: self death + `CharacterChanged(minion -> imp)`
  - visibility: public learns only who died, not cause.

## TB Interaction Matrix (Role-to-Role Hotspots)

### Registration-sensitive checks

These checks must query registered state, not only true state:
- `chef`
- `empath`
- `fortune_teller`
- `investigator`
- `slayer`
- `virgin` (nominator Townsfolk check)
- `undertaker` and `ravenkeeper` character reads

Primary registration providers in TB:
- `recluse`
- `spy`

Query semantics:
- checks are evaluated per query id, not by reading a single player-level `registered_*` value;
- pair/group checks may produce different registration outcomes for the same subject in different comparisons
  (for example, `chef` adjacent pair A vs pair B);
- if unresolved, engine prompts Storyteller; once resolved, result is reused only for that query id.

### Poison/drunk-sensitive abilities

Critical abilities that fail or misinform while malfunctioning:
- Info roles: `chef`, `empath`, `fortune_teller`, `investigator`, `librarian`, `undertaker`,
  `washerwoman`, `ravenkeeper`
- Trigger/protection roles: `virgin`, `slayer`, `soldier`, `monk`, `mayor`, `saint`,
  `scarlet_woman`

### Kill/protect chain

Typical nightly death attempt order:
1. establish poison/drunk state (`poisoner`)
2. establish protection (`monk`, passive `soldier`)
3. resolve demon attack (`imp`)
4. process replacement/redirection (`mayor`)
5. process death triggers (`ravenkeeper`)
6. evaluate Demon continuity (`imp` self-transfer / `scarlet_woman` transfer)
7. evaluate win conditions

## Visibility Contract for TB

Storyteller view only:
- true characters/alignments
- registration queries and resolved registration decisions
- reminder markers and source links
- red herring target
- poison/drunk truth

Player view:
- own perceived role
- own guaranteed private info results
- no implicit exposure of registered state or hidden markers

Public view:
- alive/dead state
- nomination/vote/execution outcomes
- day start night-death announcements without causes

## Adjudication Points (Must Stay Explicit)

- choosing false information under poison/drunk.
- deciding when "might" registration/replacement effects apply (`recluse`, `spy`, `mayor`).
- resolving registration per query (not as global once/night lock).
- tie/edge handling when multiple continuity effects could matter in unusual custom interactions.
- unusual ordering conflicts: use interrupt queue + recorded Storyteller ruling.

## Implementation Plan: TB Completion

1. Build TB data loader:
   - parse `data/editions/tb.json` into runtime night schedule and role registry input.
2. Implement setup roles/effects:
   - `baron`, `drunk`, `fortune_teller:red_herring`.
3. Implement first-night information roles:
   - `washerwoman`, `librarian`, `investigator`, `chef`, `empath`, `fortune_teller`.
4. Implement nightly action/protection roles:
   - `poisoner`, `monk`, `imp`, `undertaker`, `butler`.
5. Implement day/reactive roles:
   - `virgin`, `slayer`, `saint`, `mayor`, `ravenkeeper`.
6. Implement registration system for TB:
   - query engine (`query_id`, creation, prompt, resolution record, replay-safe lookup).
   - `recluse`/`spy` providers integrated into registration queries.
   - migrate all registration-sensitive checks to query API.
7. Implement Demon continuity:
   - `imp` self-kill transfer, `scarlet_woman` takeover, and win-check integration.
8. Add TB scenario matrix tests:
   - setup counts and Baron mutation
   - Drunk perceived role behavior
   - Poison windows (night+day)
   - Monk/Soldier protection outcomes
   - Virgin immediate execution path
   - Slayer hit/miss and spent behavior
   - Saint execution loss
   - Mayor final-3 no-execution win
   - Imp self-kill transfer
   - Scarlet Woman takeover at >=5 alive
   - registration-sensitive read consistency for Recluse/Spy.

## Acceptance Criteria for TB Spec Compliance

- all 22 TB characters represented in plugin registry metadata;
- all TB role abilities resolvable through command/event pipeline with reducer-only mutation;
- no hidden-state leakage in player/public projections;
- deterministic replay for role markers, prompts, and continuity outcomes;
- registration query ids and decisions are deterministic and auditable;
- per-check registration variance is supported for the same player in the same night/day;
- Storyteller discretion points are prompt-driven and auditable.
