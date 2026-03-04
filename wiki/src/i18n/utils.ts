export const languages = {
  en: 'English',
  cn: '中文',
};

export const defaultLang = 'en';

export function getBasePath(lang: keyof typeof languages) {
  // Use Vite/Astro base when available (e.g. GitHub Pages). Normalize it so
  // we don't end up with double slashes. When BASE_URL is not set (local
  // dev), this becomes an empty string and the result is `/en` as before.
  const rawBase = (import.meta.env.BASE_URL ?? '') as string;
  const normalizedBase = rawBase.replace(/\/$/, '');
  // Ensure a leading slash when a base is present (so we always produce
  // absolute paths like `/repo/en` instead of `repo/en` which would be
  // interpreted as relative by the browser).
  const prefix = normalizedBase === '' ? '' : (normalizedBase.startsWith('/') ? normalizedBase : `/${normalizedBase}`);
  return `${prefix}/${lang}`;
}

export function stripBase(pathname: string) {
  const rawBase = (import.meta.env.BASE_URL ?? '') as string;
  const normalizedBase = rawBase.replace(/\/$/, '');

  if (normalizedBase === '' || normalizedBase === '/') {
    return pathname;
  }

  // Remove base prefix if pathname starts with it
  // e.g., /blood-clocktower-wiki/en/characters → /en/characters
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

export function getLangFromUrl(url: URL) {
  // Remove base path from pathname before detecting language
  // e.g., '/blood-clocktower-wiki/en/characters/' -> '/en/characters/'
  const pathname = url.pathname.replace(/^\/[^\/]+/, '');
  const [, lang] = pathname.split('/');
  if (lang in languages) return lang as keyof typeof languages;
  return defaultLang;
}

export function useTranslations(lang: keyof typeof languages) {
  return function t(key: keyof typeof ui[typeof defaultLang]) {
    return ui[lang][key] || ui[defaultLang][key];
  }
}

export const ui = {
  en: {
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
  },
  cn: {
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
  },
} as const;

export function getAssetUrl(path: string) {
  const rawBase = (import.meta.env.BASE_URL ?? '') as string;
  const normalizedBase = rawBase.replace(/\/$/, '');
  const assetBase = normalizedBase === '' ? '' : (normalizedBase.startsWith('/') ? normalizedBase : `/${normalizedBase}`);
  const cleanPath = path.replace(/^\/+/, '');
  if (cleanPath.startsWith('http') || cleanPath.startsWith('//')) return cleanPath;
  return `${assetBase}/${cleanPath}`;
}
