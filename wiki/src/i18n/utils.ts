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

export { languages, defaultLang } from './config';
export type { LanguageConfig } from './config';
export type { TranslationKey } from './translations';
