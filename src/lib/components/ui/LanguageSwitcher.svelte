<script lang="ts">
import { Globe } from '@lucide/svelte';
import {
  LOCALE_NAMES,
  type Locale,
  locale,
  SUPPORTED_LOCALES,
  setLocale,
  t,
} from '$lib/translations';

// ponytail: bits-ui DropdownMenu の代わりに自前トグル + click-outside。
// 1ボタン2項目のためにshadcn一式入れるのは過剰。
let open = $state(false);
let menuEl = $state<HTMLDivElement | null>(null);
const currentLocale = $derived($locale as Locale);

async function pick(loc: Locale) {
  await setLocale(loc);
  open = false;
}

function onDocClick(e: MouseEvent) {
  if (!open) return;
  if (menuEl && !menuEl.contains(e.target as Node)) open = false;
}

function onKey(e: KeyboardEvent) {
  if (open && e.key === 'Escape') open = false;
}
</script>

<svelte:window on:click={onDocClick} on:keydown={onKey} />

<div class="relative" bind:this={menuEl}>
  <button
    type="button"
    aria-label={$t('common.aria.languageSwitch')}
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => (open = !open)}
    class="inline-flex items-center justify-center size-9 rounded-md hover:bg-primary-foreground/10 transition-colors"
  >
    <Globe class="size-5" />
  </button>

  {#if open}
    <div
      role="menu"
      class="absolute right-0 mt-1 w-36 rounded-md border border-border bg-popover text-popover-foreground shadow-md z-50 py-1"
    >
      {#each SUPPORTED_LOCALES as loc}
        <button
          type="button"
          role="menuitem"
          onclick={() => pick(loc)}
          class="w-full text-left px-3 py-1.5 text-sm hover:bg-accent {currentLocale === loc ? 'bg-accent' : ''}"
        >
          {LOCALE_NAMES[loc]}
        </button>
      {/each}
    </div>
  {/if}
</div>
