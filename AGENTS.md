# Agent Instructions & Guidelines

Our overarching goal is to create an interactive wiki website for Blood on the Clocktower. This repository contains data scraping scripts, schema configurations, and eventually the interactive web interface.

This file serves as the definitive guide for all agentic coding assistants (e.g., Cursor, GitHub Copilot, opencode, custom AI agents) operating within this repository. 

## 1. Project Overview & Structure
- `/scripts/`: Node.js utilities for scraping the official English and Chinese wikis, and downloading assets.
- `/specs/`: Technical specifications, scraper rules, and data policies.
- `/characters/` & `/rules/`: Scraped JSON data following defined schemas.
- `/assets/`: Downloaded images and media.

## 2. Build, Lint, and Test Commands

This repository is organised as a small pnpm workspace. The scraping package lives in `data/` and its scripts are under `data/scripts/`.

Install dependencies (from the repo root):

- `pnpm install`

Run the scraping utilities (from the repo root):

- **Scrape Wiki (English)**: `pnpm run scrape` — runs `data/scripts/scrape-wiki.js`
- **Scrape Chinese Wiki**: `pnpm run scrape:cn` — runs `data/scripts/scrape-chinese-wiki.js`
- **Download Images**: `pnpm run download-images` — runs `data/scripts/download-images.js`

You can also run the scripts directly with node if you prefer:

- `node data/scripts/scrape-wiki.js`
- `node data/scripts/scrape-chinese-wiki.js`
- `node data/scripts/download-images.js`

### Testing
We encourage writing tests for pure functions (e.g., parsing logic, data transformations). The project currently does not have a comprehensive test suite, but as we migrate toward test-driven development, standard Node testing practices apply.
- **Run all tests**: `npm test` (or `node --test` for native Node.js testing).
- **Run tests in watch mode**: `node --test --watch`
- **Run a single test file**: `node --test <path-to-test-file>`
- **Run a single test by name**: `node --test-name-pattern="<Test Name>" <path-to-test-file>` 
  *Example*: `node --test-name-pattern="parseCharacterPage" tests/scrape-wiki.test.js`

### Linting & Formatting
If ESLint/Prettier is added to the project:
- **Lint**: `npm run lint`
- **Format**: `npm run format` (Prefer Prettier with 2-space indentation).
- Agents should proactively run linting commands after editing code if these scripts exist in `package.json`.

## 3. Code Style Guidelines

All agents must strictly adhere to the following coding standards to ensure consistency and maintainability.

### Architecture & Frameworks
- The current backend/scraping logic is vanilla Node.js (`type: "commonjs"`). Use standard built-in modules (`fs`, `path`) and `cheerio` for DOM parsing.
- For the future frontend interactive wiki, prefer modern, standard frameworks (React, Vue, or Next.js), unless otherwise specified by the user. Prioritize static generation (SSG).

### Imports & Exports
- **Node.js Scripts**: Use CommonJS (`require` / `module.exports`) as currently established in the `scripts/` directory.
- **Frontend/Shared**: If transitioning to a bundler or modern Node (`"type": "module"`), use ES Modules (`import` / `export`).
- Keep imports organized: Built-in Node modules first, third-party packages second, internal project files third.

### Formatting
- **Indentation**: 2 spaces. No tabs.
- **Quotes**: Use single quotes (`'`) for strings in JavaScript/TypeScript. Use double quotes (`"`) for JSON or HTML/JSX attributes.
- **Semicolons**: Always use semicolons at the end of statements.
- **Line Length**: Soft cap at 100 characters per line. Break down long method chains or complex conditions.
- **Braces**: Use 1TBS (One True Brace Style). E.g., `if (condition) { ... } else { ... }`.

### Naming Conventions
- **Variables & Functions**: `camelCase` (e.g., `parseCharacterPage`, `htmlContent`).
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `BASE_URL`, `TYPE_MAPPING`).
- **Classes & Components**: `PascalCase` (e.g., `CharacterCard`, `WikiScraper`).
- **File Names**: 
  - Scripts/Utilities: `kebab-case.js` (e.g., `scrape-wiki.js`).
  - Components (if added): `PascalCase.tsx` (e.g., `CharacterCard.tsx`).

### Typing & Documentation
- **TypeScript**: If `.ts` or `.tsx` files are introduced, strictly type all function parameters and return values. Avoid `any`.
- **JSDoc**: For current plain JavaScript files, use JSDoc annotations to document function signatures, expected inputs, and complex logic.
  ```javascript
  /**
   * Fetches HTML content with local file caching.
   * @param {string} url - The URL to fetch.
   * @param {string} urlParam - The sanitized parameter for cache naming.
   * @returns {Promise<string>} The HTML content.
   */
  ```

### Error Handling
- Use `try...catch` blocks for asynchronous operations and I/O tasks (like network requests or file system operations).
- Do not silently swallow errors. Log them informatively with context (e.g., `console.error('Failed to parse character:', characterId, error)`).
- Provide fallback values or graceful degradation where appropriate, especially when scraping unstructured web content.

### Code Organization & Comments
- **Small, focused functions**: Break down large procedures into smaller, testable pure functions.
- **Separate data from logic**: Keep configuration mappings outside of execution functions.
- **Comments**: Add comments sparingly. Focus on *why* something is done, especially for complex scraping logic or Regex patterns, rather than *what* is done.

## 4. Git Conventions
- **Commits**: Use conventional commits (e.g., `feat: add new character schema`, `fix: parser logic for outsiders`, `docs: update scraping policies`).
- Do not commit changes unless explicitly requested.
- Avoid committing secrets, cache folders (e.g., `.cache/html`), or raw downloaded node modules. Ensure `.gitignore` is respected.

## 5. Copilot / Cursor / AI Agent System Rules

These apply to all AI models and agents working in this repository:
1. **Never Assume File Contents**: Always use the `read` or `glob` tools to examine existing files before making edits. Do not assume the structure of a file.
2. **Context First**: Rigorously adhere to existing project conventions when modifying code. Analyze surrounding code, tests, and configurations (like `package.json`) before employing new libraries.
3. **Idiomatic Integration**: When editing, understand the local context (imports, functions/classes) to ensure your changes integrate naturally and idiomatically.
4. **File Paths**: Before using any file system tool (e.g., `read` or `write`), you must construct the full absolute path for the file argument, anchored to the workspace root.
5. **Interactive Commands**: Do not run interactive shell commands (like `git rebase -i` or `npm init` without `-y`) as they will hang the CLI environment.
6. **Self-Verification**: When writing new logic, formulate an internal plan. Use output logs, debug statements, and tests as a self-verification loop to arrive at a solution.
7. **Proactive Polishing**: If generating UI or prototypes, aim for a visually complete state with no missing logic. Use functional placeholders where necessary.
