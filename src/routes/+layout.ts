import { browser } from '$app/environment';
import { getInitialLocale, loadTranslations } from '$lib/translations';

export const prerender = true;
export const ssr = false;

export const load = async ({ url }) => {
  const init = browser ? getInitialLocale() : 'en';
  await loadTranslations(init, url.pathname);
  return {};
};
