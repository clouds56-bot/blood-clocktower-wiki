# Blood on the Clocktower Wiki

A multi-locale knowledge base for Blood on the Clocktower.

## Structure

```
blood-clocktower-wiki/
├── characters/           # Character data by type
│   ├── townsfolk/       # 69 characters
│   ├── outsiders/       # 23 characters
│   ├── minions/         # 27 characters
│   ├── demons/          # 19 characters
│   ├── travellers/      # Late joiners
│   └── fabled/          # Special rules characters
├── rules/               # Game rules
│   ├── setup.json       # Player count tables
│   └── win_conditions.md
├── mechanics/           # Game mechanics
│   ├── night_order.md   # Who acts when
│   ├── poisoning.md     # Poison/drunk states
│   └── madness.md       # Sects & Violets mechanic
├── assets/              # Images and tokens
├── i18n/                # Translations
│   ├── en/
│   ├── cn/
│   └── ja/
└── scripts/             # Scraping utilities
```

## Character Schema

Each character is stored as a JSON file with the following structure:

```json
{
  "id": "chef",
  "type": "townsfolk",
  "editions": ["trouble_brewing"],
  "name": { "en": "Chef", "cn": "厨师", "ja": "シェフ" },
  "ability": { "en": "...", "cn": "...", "ja": "..." },
  "first_night": true,
  "other_nights": false,
  "reminders": [],
  "jinxes": [],
  "tips": { "en": [...] }
}
```

## Scraping Status

| Category | Total | Scraped | Status |
|----------|-------|---------|--------|
| Townsfolk | 69 | 69 | ✅ Complete |
| Outsiders | 23 | 23 | ✅ Complete |
| Minions | 27 | 27 | ✅ Complete |
| Demons | 19 | 19 | ✅ Complete |

**Latest:** All 138 characters scraped with full data including:
- ✅ Ability, flavor_text, editions
- ✅ Examples, tips, jinxes, how_to_run
- ✅ Artist field from infobox
- ✅ **All 138 token images downloaded and pushed** 🖼️
- ✅ Local HTML caching for faster re-scraping

## Scripts

- `scripts/pipeline/en.js` - English wiki scraper
- `scripts/pipeline/cn.js` - Chinese wiki scraper
- `scripts/pipeline/build.js` - Build character JSON files
- `scripts/pipeline/token.js` - Extract token URLs

## License

Character data sourced from the [Blood on the Clocktower Wiki](https://wiki.bloodontheclocktower.com/).
Blood on the Clocktower is © The Pandemonium Institute.

## Demo

The site is published to GitHub Pages. View the live demo at:

- https://clouds56-bot.github.io/blood-clocktower-wiki/
