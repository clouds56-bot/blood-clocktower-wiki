# Chinese Data Policy

## When to include `cn` field

The `cn` field should **ONLY** be added if the official Chinese wiki (clocktower-wiki.gstonegames.com) has actual content for that character. Do NOT add empty `cn` fields.

## Frontend Fallback Logic

```
character.name[locale] || character.name.en || character.id
character.ability[locale] || character.ability.en
character.flavor_text[locale] || character.flavor_text.en
```

Example fallback chain for zh-CN:
1. Try `character.name.zh` (if exists, machine-translated)
2. Try `character.name.cn` (if exists, official Chinese wiki)
3. Fallback to `character.name.en` (English)

## Character Status

| Character | English Wiki | Chinese Wiki | Has cn Data? |
|----------|-------------|---------------|--------------|
| Chef | ✅ | ✅ | ✅ Yes |
| Empath | ✅ | ✅ | ✅ Yes |
| Fortune Teller | ✅ | ✅ | ✅ Yes |
| Imp | ✅ | ✅ | ✅ Yes |
| Poisoner | ✅ | ✅ | ✅ Yes |
| Scarlet Woman | ✅ | ✅ | ✅ Yes |
| Spy | ✅ | ✅ | ✅ Yes |

## Scraping Notes

When checking Chinese wiki:
- If page returns 404 or "本页面目前没有内容" (This page has no content), DO NOT add cn data
- If page has minimal content like just "This page has no content", DO NOT add cn data
- Only add cn when there's substantial character info (ability, description, tips, etc.)
