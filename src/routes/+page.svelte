<script lang="ts">
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Heart,
  RefreshCw,
  Share2,
  Sparkles,
} from '@lucide/svelte';
import { onMount } from 'svelte';
import { dyeStore, loadDyes } from '$lib/dyes';
import {
  diversify,
  emptyPref,
  type Pref,
  pickNextPair,
  QUESTION_COUNT,
  RESULT_COUNT,
  scoreDyes,
  selectRepresentatives,
  updatePref,
} from '$lib/engine';
import { shareResult } from '$lib/share-image';
import { t } from '$lib/translations';
import type { Dye } from '$lib/types';

const PICKER_URL = 'https://colorant-picker.pl4rd.com/';

type Phase = 'loading' | 'intro' | 'swipe' | 'result';

let phase = $state<Phase>('loading');
let dyes = $state<Dye[]>([]);
let reps = $state<Dye[]>([]);
let pref = $state<Pref>(emptyPref());
let wins = $state<Dye[]>([]);
let losses = $state<Dye[]>([]);
let seen = $state<Set<string>>(new Set());
let current = $state<[Dye, Dye] | null>(null);
let questionNo = $state(0);
let result = $state<Dye[]>([]);
let sharing = $state(false);

let dragX = $state(0);
let dragging = $state<'left' | 'right' | null>(null);
let exiting = $state<'left' | 'right' | null>(null);
let pointerStart = 0;
const COMMIT_PX = 90;
const EXIT_MS = 260;

// sveltekit-i18n は翻訳キー未登録時に key そのものを返す。raw 英名にフォールバック。
function dyeName(d: Dye): string {
  const translated = $t(`dye.names.${d.id}`);
  return translated === `dye.names.${d.id}` ? d.name : translated;
}

onMount(async () => {
  await loadDyes();
  dyes = $dyeStore;
  reps = selectRepresentatives(dyes);
  phase = 'intro';
});

function start() {
  pref = emptyPref();
  wins = [];
  losses = [];
  seen = new Set();
  questionNo = 0;
  nextQuestion();
  phase = 'swipe';
}

function nextQuestion() {
  if (questionNo >= QUESTION_COUNT) {
    finish();
    return;
  }
  const [a, b] = pickNextPair(reps, pref, seen);
  seen.add(a.id);
  seen.add(b.id);
  current = [a, b];
  questionNo += 1;
  dragX = 0;
  dragging = null;
}

function pick(side: 'left' | 'right') {
  if (!current || exiting) return;
  exiting = side;
  // ドラッグ中なら現在位置から終端へ滑らせる、その他はゼロから
  dragging = null;
  setTimeout(() => commitPick(side), EXIT_MS);
}

function commitPick(side: 'left' | 'right') {
  if (!current) return;
  const [a, b] = current;
  const winner = side === 'left' ? a : b;
  const loser = side === 'left' ? b : a;
  pref = updatePref(pref, winner, loser);
  wins = [...wins, winner];
  losses = [...losses, loser];
  exiting = null;
  nextQuestion();
}

function finish() {
  const scores = scoreDyes(dyes, wins, losses, pref);
  result = diversify(dyes, scores, RESULT_COUNT, undefined, [
    { test: (d) => !!d.tags?.includes('metallic'), max: 2 },
  ]);
  phase = 'result';
}

async function share() {
  if (sharing || result.length === 0) return;
  sharing = true;
  try {
    await shareResult(result, location.origin, $t('common.share.text'));
  } catch (e) {
    console.error(e);
  } finally {
    sharing = false;
  }
}

function onKey(e: KeyboardEvent) {
  if (phase !== 'swipe') return;
  if (e.key === 'ArrowLeft') pick('left');
  else if (e.key === 'ArrowRight') pick('right');
}

function onPointerDown(side: 'left' | 'right', e: PointerEvent) {
  dragging = side;
  pointerStart = e.clientX;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function onPointerMove(e: PointerEvent) {
  if (!dragging) return;
  dragX = e.clientX - pointerStart;
}
function onPointerUp() {
  if (!dragging) return;
  // 掴んだカードをどっち方向に投げてもそのカードを選ぶ
  if (Math.abs(dragX) > COMMIT_PX) pick(dragging);
  dragX = 0;
  dragging = null;
}
</script>

<svelte:window on:keydown={onKey} />

<div class="mx-auto max-w-2xl">
  {#if phase === 'loading'}
    <div class="py-24 text-center text-muted-foreground">{$t('common.state.loading')}</div>

  {:else if phase === 'intro'}
    <section class="py-12 text-center space-y-6">
      <div class="flex justify-center">
        <Sparkles class="size-12 text-popular animate-pulse-slow" />
      </div>
      <h2 class="text-3xl font-bold">{$t('common.intro.tagline')}</h2>
      <p class="text-muted-foreground leading-relaxed">
        {$t('common.intro.lead').replace('{count}', String(QUESTION_COUNT))}<br />
        {$t('common.intro.leadSuffix').replace('{count}', String(RESULT_COUNT))}
      </p>
      <button
        type="button"
        onclick={start}
        class="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-8 py-3 text-base font-semibold hover:opacity-90 active:animate-bounce-subtle"
      >
        <Heart class="size-5" />
        {$t('common.intro.start')}
      </button>
    </section>

  {:else if phase === 'swipe' && current}
    {@const [left, right] = current}
    <section class="space-y-6">
      <div class="space-y-2">
        <div class="flex justify-between text-xs text-muted-foreground">
          <span>{questionNo} / {QUESTION_COUNT}</span>
          <span>{$t('common.swipe.prompt')}</span>
        </div>
        <div class="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            class="h-full bg-primary transition-all"
            style="width: {(questionNo / QUESTION_COUNT) * 100}%"
          ></div>
        </div>
      </div>

      {#key questionNo}
        <div class="grid grid-cols-2 gap-3 sm:gap-4 animate-card-in">
          {#each [{ side: 'left' as const, dye: left }, { side: 'right' as const, dye: right }] as item (item.side + item.dye.id)}
            <button
              type="button"
              onclick={() => pick(item.side)}
              onpointerdown={(e) => onPointerDown(item.side, e)}
              onpointermove={onPointerMove}
              onpointerup={onPointerUp}
              onpointercancel={onPointerUp}
              disabled={!!exiting}
              class="swipe-card"
              class:is-dragging={dragging === item.side}
              class:winner={exiting === item.side}
              class:loser={exiting && exiting !== item.side}
              class:hint-swipe-left={questionNo === 1 && item.side === 'left'}
              class:hint-swipe-right={questionNo === 1 && item.side === 'right'}
              style="background-color: {item.dye.hex}; --drag-x: {dragging === item.side ? dragX : 0}px; --drag-rot: {dragging === item.side ? dragX / 24 : 0}deg; --exit-x: {item.side === 'left' ? '-130%' : '130%'};"
              aria-label={item.side === 'left' ? $t('common.aria.pickLeft') : $t('common.aria.pickRight')}
            ></button>
          {/each}
        </div>
      {/key}

      <div class="hidden sm:flex items-center justify-center gap-3 text-sm text-muted-foreground">
        <button
          type="button"
          onclick={() => pick('left')}
          aria-label={$t('common.aria.pickLeft')}
          class="inline-flex items-center justify-center rounded-full bg-secondary p-2 hover:bg-accent"
        >
          <ArrowLeft class="size-4" />
        </button>
        <span class="text-xs">{$t('common.swipe.keyHint')}</span>
        <button
          type="button"
          onclick={() => pick('right')}
          aria-label={$t('common.aria.pickRight')}
          class="inline-flex items-center justify-center rounded-full bg-secondary p-2 hover:bg-accent"
        >
          <ArrowRight class="size-4" />
        </button>
      </div>
    </section>

  {:else if phase === 'result'}
    <section class="space-y-8 animate-fade-in-up">
      <header class="text-center space-y-2">
        <h2 class="text-2xl font-bold">
          {$t('common.result.title').replace('{count}', String(RESULT_COUNT))}
        </h2>
        <p class="text-sm text-muted-foreground">
          {$t('common.result.subtitle').replace('{count}', String(questionNo))}
        </p>
      </header>

      <ul class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {#each result as dye (dye.id)}
          <li>
            <a
              href="{PICKER_URL}?dye={dye.id}"
              target="_blank"
              rel="noopener noreferrer"
              class="group block overflow-hidden rounded-xl border border-border bg-card hover:bg-accent transition-colors"
            >
              <div class="aspect-[4/3]" style="background-color: {dye.hex}"></div>
              <div class="flex items-center gap-1.5 px-3 py-2">
                <span class="text-sm font-medium truncate">{dyeName(dye)}</span>
                <ExternalLink class="size-3.5 shrink-0 text-muted-foreground" />
              </div>
            </a>
          </li>
        {/each}
      </ul>

      <div class="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onclick={share}
          disabled={sharing}
          class="inline-flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground px-6 py-3 font-semibold hover:opacity-90 disabled:opacity-60"
        >
          <Share2 class="size-4" />
          {$t('common.result.share')}
        </button>
        <button
          type="button"
          onclick={start}
          class="inline-flex items-center justify-center gap-2 rounded-full bg-secondary text-secondary-foreground px-6 py-3 font-semibold hover:bg-accent"
        >
          <RefreshCw class="size-4" />
          {$t('common.result.retry')}
        </button>
      </div>
    </section>
  {/if}
</div>
