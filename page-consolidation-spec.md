# Spec: Consolidate Pages - Single Source for Multi-Language

## Goal
Eliminate duplicate page files by combining `pages/en/` and `pages/cn/` into a single `[lang]` dynamic routing structure.

## Current Problems
- 14 duplicate page files (7 en + 7 cn)
- Same logic repeated across languages
- Harder to maintain - need to update 2 files for one change
- Adding new language = duplicate entire directory structure

## Current Structure
```
wiki/src/pages/
├── index.astro                    # Root redirect
├── en/
│   ├── index.astro
│   ├── characters/
│   │   ├── index.astro
│   │   └── [...id].astro
│   ├── editions/
│   │   ├── index.astro
│   │   └── [id].astro
│   └── rules/
│       ├── index.astro
│       └── [id].astro
└── cn/
    ├── index.astro
    ├── characters/
    │   ├── index.astro
    │   └── [...id].astro
    ├── editions/
    │   ├── index.astro
    │   └── [id].astro
    └── rules/
        ├── index.astro
        └── [id].astro
```

## New Structure

```
wiki/src/pages/
├── index.astro                    # Root redirect (keep)
└── [lang]/
    ├── index.astro                # Language-specific home (combines en/cn index)
    ├── characters/
    │   ├── index.astro            # Combines en/cn characters/index
    │   └── [...id].astro         # Combines en/cn characters/[...id]
    ├── editions/
    │   ├── index.astro            # Combines en/cn editions/index
    │   └── [id].astro          # Combines en/cn editions/[id]
    └── rules/
        ├── index.astro            # Combines en/cn rules/index
        └── [id].astro          # Combines en/cn rules/[id]
```

**Result:** 8 files instead of 15 (14 en/cn + 1 root)

## Implementation

### Step 1: Update Root Index (Redirect)
**File:** `wiki/src/pages/index.astro`

Keep existing redirect logic or update to detect browser language:

```astro
---
// Keep current logic or add language detection
const defaultLang = 'en';
const supportedLangs = ['en', 'cn'];

// Simple redirect to default language
// Or add browser language detection
---
<script>
  window.location.href = '/en';
</script>
```

### Step 2: Create [lang] Dynamic Routes

**New file:** `wiki/src/pages/[lang]/index.astro`
```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import { defaultLang, useTranslations, getSupportedLangs } from '../../i18n/utils';

// Get lang from URL parameter
const { lang } = Astro.params;

// Validate language
const supportedLangs = getSupportedLangs().map(l => l.code);
const validatedLang = lang && supportedLangs.includes(lang) ? lang : defaultLang;

const { t } = useTranslations(validatedLang);
const editions = await getCollection('editions');

const getCharCount = (edition: any) => {
  const chars = edition.data.characters || {};
  const townsfolk = chars.townsfolk?.length || 0;
  const outsiders = chars.outsiders?.length || 0;
  const minions = chars.minions?.length || 0;
  const demons = chars.demons?.length || 0;
  return { townsfolk, outsiders, minions, demons, total: townsfolk + outsiders + minions + demons };
};
---

<BaseLayout title={`${t('home.title')} | Wiki`}>
  <div class="text-center mb-12">
    <h1 class="font-display text-5xl sm:text-6xl mb-6 text-[color:var(--ink-50)]">
      {t('home.title')}
    </h1>
    <p class="text-lg sm:text-xl text-[color:var(--ink-200)] max-w-3xl mx-auto mb-8">
      {t('home.subtitle')}
    </p>
    <div class="flex flex-wrap justify-center gap-4">
      <a href={`/${validatedLang}/characters`} class="px-8 py-3 rounded-full bg-[color:var(--accent-gold)] text-[#1a141f] font-semibold hover:bg-[#e5c67a] transition">
        {t('home.btn.characters')}
      </a>
      <a href={`/${validatedLang}/rules`} class="px-8 py-3 rounded-full border border-[rgba(215,180,106,0.5)] text-[color:var(--ink-50)] font-semibold hover:bg-[rgba(215,180,106,0.1)] transition">
        {t('home.btn.rules')}
      </a>
    </div>
  </div>

  <div class="mb-8">
    <h2 class="font-display text-2xl sm:text-3xl text-[color:var(--ink-50)] mb-6">
      Recent Editions
    </h2>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      {editions.slice(0, 3).map(edition => {
        const name = edition.data.name?.[validatedLang] || edition.data.name?.en || edition.id;
        const description = edition.data.description?.[validatedLang] || edition.data.description?.en || '';
        const counts = getCharCount(edition);

        return (
          <a
            href={`/${validatedLang}/editions/${edition.id}`}
            class="block surface-panel rounded-2xl p-6 hover:-translate-y-1 transition-all duration-300"
          >
            <h3 class="font-display text-xl sm:text-2xl text-[color:var(--ink-50)] mb-3">
              {name}
            </h3>
            <p class="text-sm text-[color:var(--ink-200)] line-clamp-3 mb-4">
              {description}
            </p>
            <div class="flex flex-wrap gap-2 text-xs uppercase tracking-widest">
              <span class="px-3 py-1 rounded-full border border-[rgba(90,162,255,0.4)] text-[color:var(--accent-blue)]">
                {counts.townsfolk} {t('nav.characters')}
              </span>
            </div>
          </a>
        )
      })}
    </div>
  </div>
</BaseLayout>
```

**New file:** `wiki/src/pages/[lang]/characters/index.astro`
```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import CharacterList from '../../components/CharacterList.astro';
import { defaultLang, useTranslations, getSupportedLangs } from '../../i18n/utils';

const characters = await getCollection('characters');
const { lang } = Astro.params;

// Validate language
const supportedLangs = getSupportedLangs().map(l => l.code);
const validatedLang = lang && supportedLangs.includes(lang) ? lang : defaultLang;

const { t } = useTranslations(validatedLang);
---

<BaseLayout title={`${t('nav.characters')} | Wiki`}>
  <div class="mb-8">
    <p class="uppercase tracking-[0.4em] text-xs text-[color:var(--ink-200)]">Grimoire Index</p>
    <h1 class="font-display text-4xl sm:text-5xl mt-3 mb-3 text-[color:var(--ink-50)]">
      {t('nav.characters')}
    </h1>
    <p class="text-base sm:text-lg text-[color:var(--ink-200)] max-w-2xl">
      {validatedLang === 'cn'
        ? '浏览并搜索所有染血钟楼角色。'
        : 'Browse and search all Blood on the Clocktower characters.'}
    </p>
  </div>

  <CharacterList characters={characters} lang={validatedLang} />
</BaseLayout>
```

**New file:** `wiki/src/pages/[lang]/characters/[...id].astro`
```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../../../layouts/BaseLayout.astro';
import { defaultLang, useTranslations, getBasePath, getSupportedLangs, getAssetUrl } from '../../../../i18n/utils';

const characters = await getCollection('characters');
const { lang, id } = Astro.params;

// Validate language
const supportedLangs = getSupportedLangs().map(l => l.code);
const validatedLang = lang && supportedLangs.includes(lang) ? lang : defaultLang;

const { t } = useTranslations(validatedLang);
const base = getBasePath(validatedLang);

// Find character
const char = characters.find(c => c.id === id);
if (!char) return Astro.redirect('/404');

const name = char.data.name?.[validatedLang] || char.data.name?.en || char.id;
const ability = char.data.ability?.[validatedLang] || char.data.ability?.en || '';
const flavorText = char.data.flavor_text?.[validatedLang] || char.data.flavor_text?.en || '';
const type = char.data.type || 'unknown';
const edition = char.data.edition?.[0] || '';

const typeLabels = {
  townsfolk: { en: 'Townsfolk', cn: '镇民' },
  outsider: { en: 'Outsider', cn: '外来者' },
  minion: { en: 'Minion', cn: '爪牙' },
  demon: { en: 'Demon', cn: '恶魔' },
  traveller: { en: 'Traveller', cn: '旅行者' },
  fabled: { en: 'Fabled', cn: '传奇' },
};

const typeLabel = typeLabels[type]?.[validatedLang] || type;
const isGood = ['townsfolk', 'outsider', 'traveller', 'fabled'].includes(type);

const tips = char.data.tips?.[validatedLang] || char.data.tips?.en || [];
const examples = char.data.examples?.[validatedLang] || char.data.examples?.en || [];
const howToRun = char.data.how_to_run?.[validatedLang] || char.data.how_to_run?.en || '';

const imageSrc = char.data.image
  ? getAssetUrl(char.data.image)
  : getAssetUrl(`assets/tokens/${id}.png`);
---

<BaseLayout title={`${name} | ${t('nav.characters')}`}>
  <a href={`${base}/characters`} class="inline-block text-[color:var(--ink-200)] hover:text-[color:var(--accent-gold)] transition mb-6">
    ← {t('char.back')}
  </a>

  <div class="grid lg:grid-cols-3 gap-8">
    <!-- Left: Character Info -->
    <div class="lg:col-span-2">
      <div class="flex flex-col sm:flex-row gap-6 mb-8">
        <div class={`token-ring mx-auto sm:mx-0 sm:mr-0 w-32 h-32 sm:w-40 sm:h-40 rounded-full overflow-hidden bg-[color:var(--bg-700)] flex items-center justify-center border ${isGood ? 'border-[rgba(90,162,255,0.6)]' : 'border-[rgba(255,90,90,0.6)]'}`}>
          <img src={imageSrc} alt={name} class="w-full h-full object-cover" onerror="this.style.display='none'" />
        </div>
        <div class="flex-1">
          <div class="mb-4">
            <p class="uppercase tracking-[0.2em] text-xs text-[color:var(--ink-200)] mb-2">
              {typeLabel}
            </p>
            <h1 class="font-display text-4xl sm:text-5xl text-[color:var(--ink-50)]">
              {name}
            </h1>
          </div>
          <div class="surface-panel rounded-xl p-6 mb-6">
            <p class="uppercase tracking-[0.2em] text-xs text-[color:var(--ink-200)] mb-2">
              {t('char.ability')}
            </p>
            <p class="text-[color:var(--ink-50)] text-lg leading-relaxed">
              {ability}
            </p>
          </div>
        </div>
      </div>

      {flavorText && (
        <div class="surface-panel rounded-xl p-6 mb-6">
          <h2 class="font-display text-xl text-[color:var(--ink-50)] mb-3">
            Background
          </h2>
          <p class="text-[color:var(--ink-200)] leading-relaxed">
            {flavorText}
          </p>
        </div>
      )}
    </div>

    <!-- Right: Tips & Info -->
    <div class="space-y-6">
      <div class="surface-panel rounded-xl p-6">
        <h2 class="font-display text-xl text-[color:var(--ink-50)] mb-4">
          {t('char.tips')}
        </h2>
        <ul class="space-y-3">
          {tips.map((tip, i) => (
            <li key={i} class="text-sm text-[color:var(--ink-200)] flex items-start">
              <span class="mr-2 text-[color:var(--accent-gold)]">•</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>

      {examples.length > 0 && (
        <div class="surface-panel rounded-xl p-6">
          <h2 class="font-display text-xl text-[color:var(--ink-50)] mb-4">
            {t('char.examples')}
          </h2>
          <ul class="space-y-3">
            {examples.map((ex, i) => (
              <li key={i} class="text-sm text-[color:var(--ink-200)] flex items-start">
                <span class="mr-2 text-[color:var(--accent-gold)]">•</span>
                <span>{ex}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {howToRun && (
        <div class="surface-panel rounded-xl p-6">
          <h2 class="font-display text-xl text-[color:var(--ink-50)] mb-4">
            {t('char.how_to_run')}
          </h2>
          <p class="text-sm text-[color:var(--ink-200)] leading-relaxed">
            {howToRun}
          </p>
        </div>
      )}

      <div class="surface-panel rounded-xl p-6">
        <h2 class="font-display text-xl text-[color:var(--ink-50)] mb-4">
          Info
        </h2>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-[color:var(--ink-200)]">Type</span>
            <span class="text-[color:var(--ink-50)]">{typeLabel}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-[color:var(--ink-200)]">Edition</span>
            <span class="text-[color:var(--ink-50)] text-capitalize">{edition}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</BaseLayout>
```

**Repeat pattern for:**
- `wiki/src/pages/[lang]/editions/index.astro`
- `wiki/src/pages/[lang]/editions/[id].astro`
- `wiki/src/pages/[lang]/rules/index.astro`
- `wiki/src/pages/[lang]/rules/[id].astro`

### Step 3: Remove Old Directories

After testing, remove:
- `wiki/src/pages/en/` (entire directory)
- `wiki/src/pages/cn/` (entire directory)

## Acceptance Criteria

- [ ] All new `[lang]` pages created
- [ ] Language validation works (redirects invalid langs to default)
- [ ] All routes work: `/en/`, `/cn/`, `/en/characters`, `/cn/characters`, etc.
- [ ] Character detail pages work with dynamic lang
- [ ] Edition pages work with dynamic lang
- [ ] Rules pages work with dynamic lang
- [ ] Translations display correctly for each language
- [ ] No broken links
- [ ] Build succeeds with same page count (295)
- [ ] Old en/cn directories removed

## Benefits

| Before | After |
|--------|-------|
| 14 duplicate files | 7 single files |
| 2 updates per change | 1 update per change |
| New lang = 7 new files | New lang = 0 new pages (just translations) |
| Harder to maintain | Easier to maintain |

## Files to Create
- `wiki/src/pages/[lang]/index.astro`
- `wiki/src/pages/[lang]/characters/index.astro`
- `wiki/src/pages/[lang]/characters/[...id].astro`
- `wiki/src/pages/[lang]/editions/index.astro`
- `wiki/src/pages/[lang]/editions/[id].astro`
- `wiki/src/pages/[lang]/rules/index.astro`
- `wiki/src/pages/[lang]/rules/[id].astro`

## Files to Delete
- `wiki/src/pages/en/` (entire directory)
- `wiki/src/pages/cn/` (entire directory)

## Notes

- Use `Astro.params.lang` to get language from URL
- Validate language against supported list
- Fallback to defaultLang for invalid languages
- Keep `index.astro` as root redirect
- Test all routes before deleting old files
