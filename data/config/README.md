# Configuration Files

This directory contains configuration files for the Blood on the Clocktower wiki scraper.

## Files

### `characters.json`

Contains the complete list of all characters to scrape, organized by type:

- `townsfolk` - Townsfolk characters (69)
- `outsiders` - Outsider characters (23)
- `minions` - Minion characters (27)
- `demons` - Demon characters (19)

## Updating Character Lists

To add, remove, or update characters:

1. Open `characters.json`
2. Edit the appropriate character type array
3. Save the file
4. Run the scraper: `node scripts/pipeline/en.js`

**Important:** Character names must match the wiki URLs exactly:
- Use underscores for spaces: `Bounty_Hunter`
- Use `%27` for apostrophes: `Devil%27s_Advocate`
- Use hyphens for multi-word names: `Al-Hadikhia`

## Example

```json
{
  "characters": {
    "townsfolk": [
      "Chef",
      "Empath",
      "Investigator"
    ],
    "demons": [
      "Imp",
      "Zombuul"
    ]
  }
}
```
