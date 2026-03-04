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
  return `${normalizedBase}/${lang}`;
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
  const [, lang] = url.pathname.split('/');
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
    'rules.back': '← Back to Rules',
    'rules.title': 'Rules & Setup',
    'footer.text': 'Unofficial Blood on the Clocktower Wiki. Data sourced from official wikis.',
  },
  cn: {
    'nav.characters': '角色',
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
    'rules.back': '← 返回规则列表',
    'rules.title': '规则与设置',
    'footer.text': '非官方染血钟楼维基。数据来源于官方维基。',
  },
} as const;
