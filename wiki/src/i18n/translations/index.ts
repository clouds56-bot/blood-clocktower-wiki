import { en } from './en';
import { cn } from './cn';

export const translations = {
  en,
  cn,
};

export type TranslationKey = keyof typeof en;
