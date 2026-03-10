# Spec: I18n Refactoring - Generic Language System

## Goal
Refactor i18n system to be generic and future-proof, making it easy to add new languages without modifying multiple files.

## Current Problems
- Languages hardcoded in `wiki/src/i18n/utils.ts`
- UI translations mixed with utilities
- Hardcoded locale mapping (en → en_US, cn → zh_CN)
- Adding new language requires modifying 5+ files
- No separation of concerns

## New Architecture

### Phase 1: Create Language Configuration
**File:** `wiki/src/i18n/config.ts` (new)
```typescript
export interface LanguageConfig {
  code: string;
  name: string;
  locale: string; // HTML lang attribute
  ogLocale: string; // OpenGraph meta
  rtl?: boolean;
}

export const languages: Record<string, LanguageConfig> = {
  en: { code: 'en', name: 'English', locale: 'en', ogLocale: 'en_US' },
  cn: { code: 'cn', name: '中文', locale: 'zh', ogLocale: 'zh_CN' },
};

export const defaultLang = 'en';
export const supportedLangs = Object.keys(languages);
```

### Phase 2: Extract Translations
**File:** `wiki/src/i18n/translations/en.ts` (new)
```typescript
export const en = {
  'nav.characters': 'Characters',
  'nav.editions': 'Editions',
  'nav.rules': 'Rules',
  'home.title': 'Blood on the Clocktower',
  'home.subtitle': 'Welcome to the open-source, interactive wiki for the greatest social deduction game. Browse characters, rule sets, and explore mechanics.',
  'home.btn.characters': 'View Characters',
  'home.btn.rules': 'Browse Rules',
  'char.back': '← Back to Characters',
  'char.ability': 'Ability',
  'char.tips': 'Tips & Tricks',
  'char.examples': 'Examples',
  'char.how_to_run': 'How to Run',
  'char.view_official': 'View on Official Wiki',
  'editions.title': 'Editions',
  'editions.subtitle': 'Browse all Blood on the Clocktower rule sets.',
  'editions.characters': 'Characters',
  'editions.first_night': 'First Night',
  'editions.other_nights': 'Other Nights',
  'editions.view_official': 'View on Official Wiki',
  'editions.back': '← Back to Editions',
  'rules.back': '← Back to Rules',
  'rules.title': 'Rules & Setup',
  'footer.text': 'Unofficial Blood on the Clocktower Wiki. Data sourced from official wikis.',
} as const;
```

**File:** `wiki/src/i18n/translations/cn.ts` (new)
```typescript
export const cn = {
  'nav.characters': '角色',
  'nav.editions': '剧本',
  'nav.rules': '规则',
  'home.title': '染血钟楼',
  'home.subtitle': '欢迎来到这款最棒的社交推理游戏的开源交互式维基。浏览角色、规则集并探索机制。',
  'home.btn.characters': '查看角色',
  'home.btn.rules': '浏览规则',
  'char.back': '← 返回角色列表',
  'char.ability': '能力',
  'char.tips': '提示与技巧',
  'char.examples': '示例',
  'char.how_to_run': '如何运行',
  'char.view_official': '在官方维基上查看',
  'editions.title': '剧本',
  'editions.subtitle': '浏览所有血染钟楼剧本。',
  'editions.characters': '角色',
  'editions.first_night': '首个夜晚',
  'editions.other_nights': '其他夜晚',
  'editions.view_official': '在官方维基上查看',
  'editions.back': '← 返回剧本列表',
  'rules.back': '← 返回规则列表',
  'rules.title': '规则与设置',
  'footer.text': '非官方染血钟楼维基。数据来源于官方维基。',
} as const;
```

**File:** `wiki/src/i18n/translations/index.ts` (new)
```typescript
import { en } from './en';
import { cn } from './cn';

export const translations = {
  en,
  cn,
};

export type TranslationKey = keyof typeof en;
```

### Phase 3: Update Utilities
**File:** `wiki/src/i18n/utils.ts` (refactor)
```typescript
import { languages, defaultLang, type LanguageConfig } from './config';
import { translations, type TranslationKey } from './translations';

export function getBasePath(langCode: string): string {
  const rawBase = (import.meta.env.BASE_URL ?? '') as string;
  const normalizedBase = rawBase.replace(/\/$/, '');
  const prefix = normalizedBase === '' ? '' : (normalizedBase.startsWith('/') ? normalizedBase : `/${normalizedBase}`);
  return `${prefix}/${langCode}`;
}

export function stripBase(pathname: string) {
  const rawBase = (import.meta.env.BASE_URL ?? '') as string;
  const normalizedBase = rawBase.replace(/\/$/, '');

  if (normalizedBase === '' || normalizedBase === '/') {
    return pathname;
  }

  if (pathname.startsWith(normalizedBase)) {
    return pathname.slice(normalizedBase.length);
  }

  return pathname;
}

export function stripLangFromPath(pathname: string) {
  const parts = pathname.split('/');
  const maybeLang = parts[1];
  if (maybeLang in languages) {
    parts.splice(1, 1);
  }
  const next = parts.join('/');
  return next === '' ? '/' : next;
}

export function getLangFromUrl(url: URL): string {
  const pathname = url.pathname.replace(/^\/[^\/]+/, '');
  const [, lang] = pathname.split('/');
  if (lang in languages) return lang;
  return defaultLang;
}

export function useTranslations(langCode: string) {
  const langConfig = languages[langCode] || languages[defaultLang];
  const langTranslations = translations[langCode as keyof typeof translations] || translations[defaultLang as keyof typeof translations];

  return {
    t: (key: TranslationKey): string => langTranslations[key] || translations[defaultLang as keyof typeof translations][key] || key,
    lang: langConfig,
  };
}

export function getSupportedLangs(): LanguageConfig[] {
  return Object.values(languages);
}

export function getAssetUrl(path: string) {
  const rawBase = (import.meta.env.BASE_URL ?? '') as string;
  const normalizedBase = rawBase.replace(/\/$/, '');
  const assetBase = normalizedBase === '' ? '' : (normalizedBase.startsWith('/') ? normalizedBase : `/${normalizedBase}`);
  const cleanPath = path.replace(/^\/+/, '');
  if (cleanPath.startsWith('http') || cleanPath.startsWith('//')) return cleanPath;
  return `${assetBase}/${cleanPath}`;
}
```

**File:** `wiki/src/i18n/utils.ts` (keep at bottom for backwards compatibility)
```typescript
// Backward compatibility: re-export commonly used items
export { languages, defaultLang } from './config';
export type { LanguageConfig } from './config';
export type { TranslationKey } from './translations';
```

### Phase 4: Update BaseLayout
**File:** `wiki/src/layouts/BaseLayout.astro`
- Update imports to use new structure
- Use `langConfig.locale` for HTML lang attribute
- Use `langConfig.ogLocale` for OpenGraph meta
- Use `getSupportedLangs()` for alternate links

### Phase 5: Update Language Picker
**File:** `wiki/src/components/LanguagePicker.astro`
- Update imports
- Use `getSupportedLangs()` to render options
- Remove hardcoded language checks

## Acceptance Criteria

- [ ] New i18n structure created (config + translations)
- [ ] All existing translations extracted to separate files
- [ ] `utils.ts` refactored and backwards compatible
- [ ] `BaseLayout.astro` updated and working
- [ ] `LanguagePicker.astro` updated and working
- [ ] All pages render correctly with en/cn
- [ ] Language switching works
- [ ] SEO meta tags (canonical, alternate, og:locale) correct
- [ ] No TypeScript errors
- [ ] No regressions in existing functionality

## Files to Create/Modify

**Create:**
- `wiki/src/i18n/config.ts`
- `wiki/src/i18n/translations/en.ts`
- `wiki/src/i18n/translations/cn.ts`
- `wiki/src/i18n/translations/index.ts`

**Modify:**
- `wiki/src/i18n/utils.ts`
- `wiki/src/layouts/BaseLayout.astro`
- `wiki/src/components/LanguagePicker.astro`

## Future Example: Adding Japanese Language

1. Add to `config.ts`:
```typescript
ja: { code: 'ja', name: '日本語', locale: 'ja', ogLocale: 'ja_JP' },
```

2. Create `wiki/src/i18n/translations/ja.ts` with Japanese translations

**Done!** Language picker, alternate links, and meta tags auto-update.

## Notes

- Keep backwards compatibility for existing pages
- Test language switching on all page types
- Verify no console errors
- Check mobile responsiveness of language picker
