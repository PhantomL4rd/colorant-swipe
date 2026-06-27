import { writable } from 'svelte/store';
import { rgbToHex, rgbToOklab } from './oklab';
import type { Dye, RawDyeFile } from './types';

export const dyeStore = writable<Dye[]>([]);

export async function loadDyes(): Promise<void> {
  const basePath = import.meta.env.BASE_URL || '';
  const res = await fetch(`${basePath}data/dyes.json`);
  if (!res.ok) throw new Error(`Failed to fetch dyes: ${res.status}`);
  const raw: RawDyeFile = await res.json();
  // 名前はテンプレ側で $t('dye.names.<id>') で翻訳。raw は英語フォールバック。
  const dyes: Dye[] = raw.dyes.map((d) => ({
    ...d,
    hex: rgbToHex(d.rgb.r, d.rgb.g, d.rgb.b),
    lab: rgbToOklab(d.rgb.r, d.rgb.g, d.rgb.b),
  }));
  dyeStore.set(dyes);
}
