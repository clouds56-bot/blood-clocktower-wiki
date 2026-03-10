export interface LanguageConfig {
  code: string;
  name: string;
  locale: string;
  ogLocale: string;
  rtl?: boolean;
}

export const languages: Record<string, LanguageConfig> = {
  en: { code: 'en', name: 'English', locale: 'en', ogLocale: 'en_US' },
  cn: { code: 'cn', name: '中文', locale: 'zh', ogLocale: 'zh_CN' },
};

export const defaultLang = 'en';
export const supportedLangs = Object.keys(languages);
