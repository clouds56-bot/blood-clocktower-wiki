Project TODOs and next work items for blood-clocktower-wiki

Short-term (high priority)
- Scrape missing character categories: `travellers` and `fabled` into `data/characters/`.
- Populate `data/mechanics/` content (night order, poisoning, madness) or import from source wiki.
- Add basic unit tests for scraper parsing functions (character page parsing) under `data/tests/`.
- Add a root `package.json` scripts section to make monorepo commands easy (dev/build/test).

Medium-term (medium priority)
- Add Japanese (`ja`) locale support in `wiki/src/i18n/` (translations + config).
- Expand image downloader to verify checksums and skip re-downloads when identical.
- Move `page-consolidation-spec.md` and `ui-consistency-spec.md` into `specs/` (if not already).

Long-term (low priority)
- Implement interactive role builder (drag-drop) in frontend.
- Add CI for scraping tasks and website build on push (GitHub Actions).
- Add end-to-end tests for the built site (playwright).

Notes
- The `wiki/` frontend is an Astro app and already uses dynamic `[lang]` routes.
- Keep `.cache/html` out of git and ensure scraping cache is documented.
