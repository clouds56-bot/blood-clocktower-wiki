# AGENTS.md

This document is the operating guide for agentic coding assistants working in this repository.
It reflects the current project structure, scripts, and conventions found in code.

## 1) Project Overview

- Root: pnpm workspace with two packages: `data/` and `wiki/`.
- `data/`: Node.js scraping/data pipeline package (`type` defaults to CommonJS).
- `data/scripts/`: scraping and build pipelines.
- `data/characters/`, `data/rules/`, `data/editions/`: generated/curated content.
- `wiki/`: Astro static site (ESM, TypeScript enabled).
- `wiki/src/pages/[lang]`: localized dynamic route pages.
- `assets/`: downloaded media mirrored into `wiki/public/assets` by scripts.
- `specs/`: technical notes, parser/scraper policies, and implementation specs.

## 2) Build, Run, Lint, and Test Commands

Run all commands from repo root unless noted.

### Setup

- Install dependencies: `pnpm install`

### Data package (`data/`)

- Scrape English: `pnpm --filter data run scrape:en`
- Scrape Chinese: `pnpm --filter data run scrape:cn`
- Scrape tools: `pnpm --filter data run scrape:tool`
- Scrape GitHub data: `pnpm --filter data run scrape:github`
- Scrape tokens: `pnpm --filter data run scrape:token`
- Scrape EN reminders: `pnpm --filter data run scrape:reminders:en`
- Scrape CN reminders: `pnpm --filter data run scrape:reminders:cn`
- Scrape glossary (EN+CN): `pnpm --filter data run scrape:glossary`
- Build glossary: `pnpm --filter data run build:glossary`
- Build characters: `pnpm --filter data run build:characters`
- Build special outputs: `pnpm --filter data run build:special`
- Full pipeline: `pnpm --filter data run scrape:all`

You can also run pipelines directly with Node when debugging:

- `node data/scripts/pipeline/en.js`
- `node data/scripts/pipeline/cn.js`
- `node data/scripts/pipeline/build.js`

### Wiki package (`wiki/`)

- Dev server: `pnpm --filter wiki run dev`
- Build static site: `pnpm --filter wiki run build`
- Preview build: `pnpm --filter wiki run preview`

### Testing (important)

Current state:

- `data/package.json` has `"test": "echo \"No tests\" && exit 0"`.
- No test files are currently present in the repo.

Recommended Node test commands for newly added tests:

- Run all tests (native runner): `node --test`
- Run all tests in a file: `node --test path/to/file.test.js`
- Run a single test by name: `node --test --test-name-pattern="parseCharacterPage" path/to/file.test.js`
- Watch mode: `node --test --watch`

If package scripts are added later, prefer package-level commands:

- `pnpm --filter data run test`
- `pnpm --filter wiki run test`

### Linting and formatting

Current state:

- No ESLint/Prettier scripts are defined in current package.json files.
- Type checking is available via TypeScript config in `wiki/`.

If lint/format scripts are introduced, run them after edits.

## 3) Code Style Guidelines

Follow existing local patterns first; these rules apply when patterns are missing.

### Language/module conventions

- `data/` scripts: CommonJS (`require`, `module.exports`).
- `wiki/` code: ESM/TypeScript (`import`, `export`).
- Avoid mixing module systems in the same package unless required.

### Imports

- Order imports as: built-in modules, third-party packages, internal modules.
- Keep import groups stable and avoid unused imports.
- Prefer explicit relative paths for local modules.

### Formatting

- Indentation: 2 spaces; do not use tabs.
- Semicolons: required.
- Strings: single quotes in JS/TS; double quotes in JSON and markup attributes.
- Line width: target ~100 chars; split long expressions cleanly.
- Braces: 1TBS style (`if (...) { ... } else { ... }`).

### Naming

- Variables/functions: `camelCase`.
- Constants: `UPPER_SNAKE_CASE`.
- Classes/components/types: `PascalCase`.
- Script filenames: `kebab-case.js`.
- Astro/TSX components: `PascalCase` filenames.

### Types and documentation

- In TypeScript, type function params and return values explicitly.
- Avoid `any`; use unions, generics, or `unknown` + narrowing.
- In JavaScript files with non-trivial logic, add focused JSDoc.
- Document data transformation assumptions and schema edge cases.

### Error handling

- Wrap network and filesystem operations in `try...catch`.
- Never silently swallow errors.
- Log actionable context (`id`, URL, filename, operation).
- Fail fast for corrupted inputs; use graceful fallback only when intentional.

### Code organization

- Prefer small, composable functions over long monolithic procedures.
- Keep mapping/config objects separate from execution flow.
- Minimize side effects and isolate I/O boundaries.
- Add comments for non-obvious "why", not obvious "what".

## 4) Agent Workflow Rules

- Never assume file contents; inspect files before changing them.
- Read relevant package configs before choosing commands.
- Align with existing project conventions over personal preference.
- Use absolute paths with file tools when required by the environment.
- Avoid interactive shell commands in non-interactive sessions.
- Verify changes with the narrowest useful command (build/test/typecheck).

## 5) Git Conventions

- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).
- Do not commit secrets, caches, or dependencies.
- Respect `.gitignore` and generated output boundaries.
- Keep commits focused and descriptive.

## 6) Cursor/Copilot Rule Files

Checked paths in this repository:

- `.cursorrules`
- `.cursor/rules/`
- `.github/copilot-instructions.md`

Current state:

- No Cursor rule files were found.
- No GitHub Copilot instruction file was found.

If any of these files are added later, treat them as higher-priority agent instructions and update this document.
