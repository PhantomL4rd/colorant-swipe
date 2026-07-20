<script lang="ts">
import '../app.css';
import { ArrowLeftRight } from '@lucide/svelte';
import { ModeWatcher } from 'mode-watcher';
import { resolve } from '$app/paths';
import LanguageSwitcher from '$lib/components/ui/LanguageSwitcher.svelte';
import SideDrawer from '$lib/components/ui/SideDrawer.svelte';
import { t } from '$lib/translations';

const { children } = $props();
</script>

<svelte:head>
  <title>{$t('common.app.name')}</title>
</svelte:head>

<ModeWatcher />

<div class="min-h-dvh bg-background">
  <header class="bg-background border-b border-border">
    <div class="container mx-auto flex items-center h-12 px-4">
      <h1 class="flex-1 text-base font-semibold">
        <a href={resolve('/')} data-sveltekit-reload class="inline-flex items-center gap-2 hover:opacity-80 transition-opacity">
          <ArrowLeftRight class="size-5" />
          {$t('common.app.name')}
        </a>
      </h1>
      <div class="flex items-center gap-1">
        <LanguageSwitcher />
        <SideDrawer />
      </div>
    </div>
  </header>

  <div class="container mx-auto px-4 pt-6 pb-8">
    <main>
      {@render children?.()}
    </main>
  </div>

  <footer class="text-center text-xs text-muted-foreground py-4">
    © SQUARE ENIX
  </footer>
</div>
