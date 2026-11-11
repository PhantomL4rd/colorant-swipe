<script lang="ts">
import { Home, Info, Menu, MessageCircle, VenetianMask, X } from '@lucide/svelte';
import { resolve } from '$app/paths';
import { t } from '$lib/translations';

let isOpen = $state(false);

function open() {
  isOpen = true;
}
function close() {
  isOpen = false;
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close();
}
</script>

<svelte:window onkeydown={onKey} />

<button
  type="button"
  onclick={open}
  aria-label={$t('common.aria.openMenu')}
  class="inline-flex items-center justify-center size-9 rounded-md hover:bg-accent transition-colors"
>
  <Menu class="size-5" />
</button>

{#if isOpen}
  <button
    type="button"
    onclick={close}
    aria-label={$t('common.aria.closeMenu')}
    class="fixed inset-0 z-50 bg-black/50"
  ></button>
{/if}

<div
  class="fixed top-0 right-0 z-50 h-full w-64 bg-card text-card-foreground shadow-xl transition-transform duration-300 ease-out {isOpen
    ? 'translate-x-0'
    : 'translate-x-full'}"
  role="dialog"
  aria-modal="true"
  aria-hidden={!isOpen}
>
  <div class="flex items-center justify-between p-4 border-b border-border">
    <span class="font-bold">{$t('common.nav.menu')}</span>
    <button
      type="button"
      onclick={close}
      class="p-2 rounded-md hover:bg-accent transition-colors"
      aria-label={$t('common.aria.closeMenu')}
    >
      <X class="size-5" />
    </button>
  </div>

  <nav class="p-2">
    <a
      href={resolve('/about')}
      onclick={close}
      class="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent transition-colors"
    >
      <Info class="size-5" />
      {$t('common.nav.about')}
    </a>

    <a
      href="https://contact.pl4rd.com/?service=colorant-swipe"
      target="_blank"
      rel="noopener noreferrer"
      onclick={close}
      class="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent transition-colors"
    >
      <MessageCircle class="size-5" />
      {$t('common.externalLinks.contact')}
    </a>

    <p class="px-3 py-2 text-xs text-muted-foreground">{$t('common.nav.links')}</p>

    <a
      href="https://pl4rd.com/"
      target="_blank"
      rel="noopener noreferrer"
      onclick={close}
      class="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent transition-colors"
    >
      <Home class="size-5" />
      {$t('common.externalLinks.home')}
    </a>

    <a
      href="https://pl4rd.com/privacy"
      target="_blank"
      rel="noopener noreferrer"
      onclick={close}
      class="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent transition-colors"
    >
      <VenetianMask class="size-5" />
      {$t('common.externalLinks.privacy')}
    </a>
  </nav>
</div>
