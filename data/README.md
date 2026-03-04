This folder contains runtime data and configuration moved out of `config/` and top-level paths.

- `characters.json` - main character list used by scrapers (moved from `config/characters.json`).
- `scrape-results.json` - last run of the English scraper.
- `scrape-results-cn.json` - last run of the Chinese scraper.

Agents: when referencing files here, use absolute paths from repo root, e.g.
`/home/openclaw/workspace/blood-clocktower-wiki/data/characters.json` or `data/characters.json`.

Do not commit large cache files (.cache) or downloaded assets; prefer adding them to `.gitignore`.
