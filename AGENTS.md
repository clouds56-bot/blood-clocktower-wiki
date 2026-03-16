# AGENTS.md

Operating guide for agentic coding assistants in this repository.
Use this as the default execution policy unless a more specific instruction overrides it.

## 1) Repository Overview

- Workspace manager: `pnpm` with packages in `data/`, `game/`, and `wiki/`.
- `data/`: scraping and transformation pipelines (CommonJS Node scripts).
- `game/`: TypeScript game engine + CLI + tests.
- `wiki/`: Astro + TypeScript static site.
- `assets/`: downloaded media mirrored into `wiki/public/assets` by copy scripts.
- `specs/`: technical notes and implementation specs.

## 2) Build, Run, Lint, and Test Commands

Run from repo root unless noted.

### Setup

- Install deps: `pnpm install`
- List workspace packages: `pnpm -r list --depth 0`

### Data Package (`data/`)

- EN scrape pipeline: `pnpm --filter data run scrape:en`
- CN scrape pipeline: `pnpm --filter data run scrape:cn`
- Translations scrape: `pnpm --filter data run scrape:translations`
- Jinx scrape: `pnpm --filter data run scrape:jinx`
- GitHub scrape: `pnpm --filter data run scrape:github`
- Token scrape: `pnpm --filter data run scrape:token`
- Reminder scrape (EN/CN): `pnpm --filter data run scrape:reminders:en` / `pnpm --filter data run scrape:reminders:cn`
- Rules scrape (EN/CN): `pnpm --filter data run scrape:rules:en` / `pnpm --filter data run scrape:rules:cn`
- Glossary scrape/build: `pnpm --filter data run scrape:glossary` / `pnpm --filter data run build:glossary`
- Characters/rules/special build: `pnpm --filter data run build:characters` / `pnpm --filter data run build:rules` / `pnpm --filter data run build:special`
- Full data pipeline: `pnpm --filter data run scrape:all`

### Game Package (`game/`)

- Typecheck only: `pnpm --filter game run typecheck`
- Build TS output: `pnpm --filter game run build`
- Run CLI: `pnpm --filter game run cli`
- Run example script: `pnpm --filter game run example`

Testing (`game`):

- Run all game tests: `pnpm --filter game run test`
- Run coverage: `pnpm --filter game run test:coverage`
- Run one test file: `pnpm --filter game exec node --test --import tsx tests/path/to/file.test.ts`
- Run one test by name: `pnpm --filter game exec node --test --import tsx --test-name-pattern="vote threshold" tests/path/to/file.test.ts`

### Wiki Package (`wiki/`)

- Dev server: `pnpm --filter wiki run dev`
- Production build: `pnpm --filter wiki run build`
- Preview build: `pnpm --filter wiki run preview`
- Typecheck (no emit): `pnpm --filter wiki exec tsc -p tsconfig.json --noEmit`

### Lint/Format Status

- No dedicated ESLint/Prettier scripts are currently defined.
- When lint/format scripts are added, run them after code edits and before handoff.

## 3) Code Style and Engineering Guidelines

Follow local file conventions first. When unclear, use these defaults.

### Language and Modules

- `data/` uses CommonJS (`require`, `module.exports`).
- `game/` and `wiki/` use ESM TypeScript (`import`, `export`).
- Do not mix module systems inside the same package unless required by existing code.

### Imports

- Order imports: Node built-ins, third-party packages, then internal modules.
- Keep import groups stable and remove unused imports.
- Prefer explicit relative imports for local modules.

### Formatting

- Indentation: 2 spaces.
- Semicolons: required.
- Strings: single quotes in JS/TS; JSON uses double quotes.
- Keep lines readable (~100 chars target); split long expressions cleanly.
- Use 1TBS brace style.

### Naming

- Variables/functions: `camelCase`.
- Classes/types/components: `PascalCase`.
- Constants: `UPPER_SNAKE_CASE`.
- JS script filenames: `kebab-case.js`.
- In `game/` serialization payloads/state keys should use `snake_case` per architecture docs.
- In `game/`, command/event/type identifiers should use `PascalCase` per architecture docs.

### Types and Data Contracts

- Type function params/returns explicitly in TypeScript.
- Avoid `any`; use narrowed `unknown`, unions, or generics.
- Preserve strict-mode compatibility (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` in `game/`).
- For DTO/event/state changes, update related types, invariants, and tests together.

### Error Handling and Logging

- Wrap IO/network boundaries in `try...catch`.
- Never swallow errors silently.
- Emit actionable context in errors/logs (operation, ids, file path, URL).
- Prefer fail-fast behavior for invalid/corrupt state.

### Code Organization

- Prefer small, composable functions.
- Keep pure logic separate from IO.
- Keep reducers/event handlers deterministic.
- Add comments only for non-obvious rationale.

## 4) Game App Development Flow (Required)

For any task touching `game/`, follow this sequence:

1. Read `game/architecture.md` first.
2. Read `game/rules.md` second.
3. Read `game/speckit-plan.md` third.
4. For implementation details, also read any relevant docs under `game/spec/*.md`.
5. If a design/behavior decision is confirmed during implementation, update the corresponding `game/spec/*.md` doc in the same change set.

Critical review gate:

- Do **not** edit `game/architecture.md` or `game/rules.md` directly without explicit human review.
- If changes to either file are needed, prepare a proposed diff and request review before applying edits.

## 5) Agent Workflow Rules

- Never assume file contents; inspect before editing.
- Prefer minimal, focused changes that match existing patterns.
- Verify with the narrowest useful command (targeted test, typecheck, build).
- Avoid destructive git commands unless explicitly requested.
- Do not revert unrelated user changes in a dirty working tree.

## 6) Git Conventions

- Use Conventional Commit prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`.
- Keep commits scoped and descriptive.
- Do not commit secrets, credentials, caches, or dependency directories.
- Respect generated outputs and `.gitignore` boundaries.

## 7) Cursor/Copilot Rules

Checked locations:

- `.cursorrules`
- `.cursor/rules/`
- `.github/copilot-instructions.md`

Current repository status:

- Cursor rules: none found.
- Copilot instructions: found at `.github/copilot-instructions.md` and should be treated as higher-priority guidance for UI/UX work in `wiki/`.

Copilot UI/UX highlights to follow for `wiki/` changes:

- Preserve existing visual language and tokens from `wiki/src/layouts/BaseLayout.astro`.
- Keep layouts mobile-first and responsive.
- Maintain clear interaction states and keyboard accessibility.
- Keep i18n consistent by updating both `en` and `cn` translation keys.
- Run `pnpm --filter wiki run build` before finalizing UI/UX edits.
