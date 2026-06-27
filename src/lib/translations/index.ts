// picker と同じ sveltekit-i18n 構成。swipe は common と dye の2キーのみ。

import type { Config } from 'sveltekit-i18n';
import i18n from 'sveltekit-i18n';
import { browser } from '$app/environment';

export const SUPPORTED_LOCALES = ['en', 'ja'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  ja: '日本語',
};

const STORAGE_KEY = 'colorant-swipe:locale';

export function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  const browserLang = navigator.language.split('-')[0];
  return SUPPORTED_LOCALES.includes(browserLang as Locale)
    ? (browserLang as Locale)
    : DEFAULT_LOCALE;
}

export function getStoredLocale(): Locale | null {
  if (!browser) return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LOCALES.includes(stored as Locale)) {
      return stored as Locale;
    }
  } catch {
    // ignore
  }
  return null;
}

export function storeLocale(loc: Locale): void {
  if (!browser) return;
  try {
    localStorage.setItem(STORAGE_KEY, loc);
  } catch {
    // ignore
  }
}

export function getInitialLocale(): Locale {
  return getStoredLocale() ?? detectBrowserLocale();
}

const config: Config = {
  fallbackLocale: DEFAULT_LOCALE,
  log: { level: 'warn' },
  loaders: [
    {
      locale: 'en',
      key: 'common',
      loader: async () => (await import('./en/common.json')).default,
    },
    {
      locale: 'ja',
      key: 'common',
      loader: async () => (await import('./ja/common.json')).default,
    },
    {
      locale: 'en',
      key: 'dye',
      loader: async () => (await import('./en/dye.json')).default,
    },
    {
      locale: 'ja',
      key: 'dye',
      loader: async () => (await import('./ja/dye.json')).default,
    },
  ],
};

const { t, locale, locales, loading, loadTranslations: i18nLoadTranslations } = new i18n(config);

export { loading, locale, locales, t };

export async function loadTranslations(newLocale: string, pathname?: string): Promise<void> {
  await i18nLoadTranslations(newLocale, pathname);
}

export async function setLocale(newLocale: Locale): Promise<void> {
  storeLocale(newLocale);
  locale.set(newLocale);
  await loadTranslations(newLocale);
}
