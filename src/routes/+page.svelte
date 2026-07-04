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
import { Spring } from 'svelte/motion';
import { dyeStore, loadDyes } from '$lib/dyes';
import {
  diversify,
  emptyPref,
  type Persona,
  type Pref,
  pickNextPair,
  QUESTION_COUNT,
  RESULT_COUNT,
  scoreDyes,
  selectRepresentatives,
  summarizePref,
  updatePref,
} from '$lib/engine';
import { shareResult } from '$lib/share-image';
import { t } from '$lib/translations';
import type { Dye } from '$lib/types';

const PICKER_URL = 'https://colorant-picker.pl4rd.com/';
const SITE_URL = 'https://colorant-swipe.pl4rd.com';

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
let persona = $state<Persona>('balanced');
let sharing = $state(false);

// ドラッグ追従と復帰を同一の物理で連続させる（掴む/離す瞬間の補間切替を無くす）
const DRAG_SPRING = { stiffness: 0.42, damping: 0.85 }; // 追従: 即応・低バウンド
const RELEASE_SPRING = { stiffness: 0.16, damping: 0.62 }; // 復帰: 柔らかいスプリング
const dragSpring = new Spring(0, DRAG_SPRING);

let dragging = $state<'left' | 'right' | null>(null); // 指が触れている側
let returnSide = $state<'left' | 'right' | null>(null); // 閾値未満で離してスプリング復帰中の側
let exiting = $state<'left' | 'right' | null>(null); // 確定演出中の勝者側

let pointerStart = 0;
let rawX = 0; // 生のドラッグ量（判定用、spring.current はラグがある）
let didDrag = false;
let lastX = 0;
let lastT = 0;
let velocity = 0; // px/ms（フリック判定用）
let exitTimer: ReturnType<typeof setTimeout> | null = null;
const COMMIT_PX = 90;
const DRAG_THRESHOLD = 8;
const FLICK_V = 0.5; // px/ms 以上なら距離不足でも確定
const EXIT_FALLBACK_MS = 420; // animationend が来ない環境向けの安全網

// スプリングのオフセット（translate/rotate）を適用する側。ドラッグ→復帰→確定を通して連続
const offsetSide = $derived(exiting ?? dragging ?? returnSide);
// ドラッグ/復帰の進捗 0..1（確定演出中は 0）。spring.current 基準で glow/対向カードが連続追従
const dragP = $derived(exiting ? 0 : Math.min(Math.abs(dragSpring.current) / COMMIT_PX, 1));

function prefersReduced() {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

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
  dragging = null;
  returnSide = null;
  rawX = 0;
  dragSpring.set(0, { instant: true });
}

function pick(side: 'left' | 'right') {
  if (!current || exiting) return;
  dragging = null;
  returnSide = null;
  exiting = side;
  // 掴んだ位置から中心へ柔らかく戻しつつ、勝者は snap で確定演出（両者 transform のみ）
  dragSpring.stiffness = RELEASE_SPRING.stiffness;
  dragSpring.damping = RELEASE_SPRING.damping;
  dragSpring.target = 0;
  if (prefersReduced()) {
    commitPick(side); // reduced-motion は即時切替（animationend を待たない）
  } else {
    // winner-snap の animationend で確定するが、発火しない環境向けに安全網も張る
    exitTimer = setTimeout(() => commitPick(side), EXIT_FALLBACK_MS);
  }
}

function commitPick(side: 'left' | 'right') {
  if (exiting !== side || !current) return; // 二重確定ガード（animationend + 安全網）
  if (exitTimer) {
    clearTimeout(exitTimer);
    exitTimer = null;
  }
  const [a, b] = current;
  const winner = side === 'left' ? a : b;
  const loser = side === 'left' ? b : a;
  pref = updatePref(pref, winner, loser);
  wins = [...wins, winner];
  losses = [...losses, loser];
  exiting = null;
  // 次のドラッグに備えて追従用パラメータへ戻す
  dragSpring.stiffness = DRAG_SPRING.stiffness;
  dragSpring.damping = DRAG_SPRING.damping;
  dragSpring.set(0, { instant: true });
  nextQuestion();
}

// winner の snap アニメーション終了で確定（setTimeout 連鎖よりタイミングが正確）
function onCardAnimEnd(side: 'left' | 'right', e: AnimationEvent) {
  if (e.animationName === 'winner-snap' && exiting === side) commitPick(side);
}

function finish() {
  const scores = scoreDyes(dyes, wins, losses, pref);
  // 出題で見た色は結果から除外 → 「こんな色もあったのね」を最大化
  result = diversify(
    dyes,
    scores,
    RESULT_COUNT,
    undefined,
    [{ test: (d) => !!d.tags?.includes('metallic'), max: 2 }],
    seen
  );
  // ラベルは上位 3 色の重心から出す。full result だと末尾の穴埋め色（diversify が
  // 距離制約なしで拾う次点）に引きずられ、上位が示す傾向がラベルに出にくくなる。
  persona = summarizePref(result.slice(0, 3));
  phase = 'result';
}

async function share() {
  if (sharing || result.length === 0) return;
  sharing = true;
  try {
    const personaName = $t(`common.result.persona.${persona}`);
    const text = $t('common.share.text')
      .replace('{persona}', personaName)
      .replace('{url}', SITE_URL);
    const personaText = $t('common.result.personaShare').replace('{persona}', personaName);
    // X は url フィールドを無視するため text に URL 必須。url フィールドは渡さない（重複防止）
    await shareResult(result, '', text, personaText);
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

function haptic() {
  // commit 時の触覚フィードバック（未対応環境は無視）
  if ('vibrate' in navigator) navigator.vibrate?.(12);
}

// キーボード起点の click（detail === 0）のみ拾う。ポインタは pointerup で処理済み
function onCardClick(side: 'left' | 'right', e: MouseEvent) {
  if (e.detail === 0) pick(side);
}

function onPointerDown(side: 'left' | 'right', e: PointerEvent) {
  if (exiting) return;
  // 主ボタン（左クリック / 主タッチ）以外は無視。右・中クリックで pick が発火しないように
  if (!e.isPrimary || e.button !== 0) return;
  dragging = side;
  returnSide = null;
  didDrag = false;
  pointerStart = e.clientX;
  rawX = 0;
  velocity = 0;
  lastX = e.clientX;
  lastT = performance.now();
  // 追従用パラメータへ戻し、現在位置は 0 から掴み直す
  dragSpring.stiffness = DRAG_SPRING.stiffness;
  dragSpring.damping = DRAG_SPRING.damping;
  dragSpring.set(0, { instant: true });
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function onPointerMove(e: PointerEvent) {
  if (!dragging) return;
  rawX = e.clientX - pointerStart;
  dragSpring.target = rawX; // spring が指を追う（わずかなラグ = 吸い付き感）
  const now = performance.now();
  const dt = now - lastT;
  if (dt > 0) velocity = (e.clientX - lastX) / dt;
  lastX = e.clientX;
  lastT = now;
  if (Math.abs(rawX) > DRAG_THRESHOLD) didDrag = true;
}
function onPointerUp() {
  if (!dragging) return;
  const side = dragging;
  if (!didDrag) {
    // 8px 未満 = タップ扱い、その側を選ぶ
    dragging = null;
    haptic();
    pick(side);
  } else if (Math.abs(rawX) > COMMIT_PX || Math.abs(velocity) > FLICK_V) {
    // 閾値超え、または軽いフリック（速度十分）で確定
    dragging = null;
    haptic();
    pick(side);
  } else {
    // 閾値未満で離した = 同じ spring を復帰パラメータに切替えて連続的に戻す
    dragging = null;
    didDrag = false;
    returnSide = side;
    dragSpring.stiffness = RELEASE_SPRING.stiffness;
    dragSpring.damping = RELEASE_SPRING.damping;
    dragSpring.set(0).then(() => {
      if (returnSide === side) returnSide = null;
    });
  }
}
function onPointerCancel() {
  // ジェスチャ中断 = 選ばずにスプリングで中央へ戻す
  if (!dragging) return;
  const side = dragging;
  dragging = null;
  didDrag = false;
  returnSide = side;
  dragSpring.stiffness = RELEASE_SPRING.stiffness;
  dragSpring.damping = RELEASE_SPRING.damping;
  dragSpring.set(0).then(() => {
    if (returnSide === side) returnSide = null;
  });
}
</script>

<svelte:window on:keydown={onKey} />

<div class="mx-auto max-w-2xl">
  {#if phase === 'loading'}
    <div class="py-24 text-center text-muted-foreground">{$t('common.state.loading')}</div>

  {:else if phase === 'intro'}
    <section class="py-12 text-center space-y-6">
      <div class="relative flex justify-center intro-stagger" style="animation-delay: 0ms">
        <Sparkles class="relative size-12 text-popular animate-pulse-slow" />
      </div>
      <h2 class="text-3xl font-bold intro-stagger" style="animation-delay: 80ms">
        {$t('common.intro.tagline')}
      </h2>
      <p class="text-muted-foreground leading-relaxed intro-stagger" style="animation-delay: 160ms">
        {$t('common.intro.lead').replace('{count}', String(QUESTION_COUNT))}<br />
        {$t('common.intro.leadSuffix').replace('{count}', String(RESULT_COUNT))}
      </p>
      <button
        type="button"
        onclick={start}
        class="intro-stagger inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-8 py-3 text-base font-semibold hover:opacity-90 active:animate-bounce-subtle"
        style="animation-delay: 240ms"
      >
        <Heart class="size-5" />
        {$t('common.intro.start')}
      </button>
    </section>

  {:else if phase === 'swipe' && current}
    {@const [left, right] = current}
    <section class="relative space-y-6">
      <div class="relative z-10 space-y-6">
        <div class="space-y-2">
          <div class="flex justify-between text-xs text-muted-foreground">
            <span>{questionNo} / {QUESTION_COUNT}</span>
            <span>{$t('common.swipe.prompt')}</span>
          </div>
          <div
            class="progress-dots"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax={QUESTION_COUNT}
            aria-valuenow={questionNo}
            aria-label={$t('common.aria.progress')}
          >
            {#each Array(QUESTION_COUNT) as _, i (i)}
              <span
                class="dot"
                class:filled={i < questionNo - 1}
                class:current={i === questionNo - 1}
              ></span>
            {/each}
          </div>
        </div>

        <div class="relative" style="--drag-p: {dragP}">
          {#key questionNo}
            <div class="grid grid-cols-2 gap-3 sm:gap-4">
              {#each [{ side: 'left' as const, dye: left }, { side: 'right' as const, dye: right }] as item (item.side + item.dye.id)}
                <button
                  type="button"
                  onclick={(e) => onCardClick(item.side, e)}
                  onpointerdown={(e) => onPointerDown(item.side, e)}
                  onpointermove={onPointerMove}
                  onpointerup={onPointerUp}
                  onpointercancel={onPointerCancel}
                  onanimationend={(e) => onCardAnimEnd(item.side, e)}
                  disabled={!!exiting}
                  class="swipe-card"
                  class:is-dragging={dragging === item.side}
                  class:is-other={!!offsetSide && offsetSide !== item.side && !exiting}
                  class:spring={offsetSide === item.side}
                  class:card-enter={questionNo > 1}
                  class:winner={exiting === item.side}
                  class:loser={exiting && exiting !== item.side}
                  class:hint-swipe-left={questionNo === 1 && item.side === 'left'}
                  class:hint-swipe-right={questionNo === 1 && item.side === 'right'}
                  style="background-color: {item.dye.hex}; --glow: {item.dye.hex}; --drag-x: {offsetSide === item.side ? dragSpring.current : 0}px; --drag-rot: {offsetSide === item.side ? dragSpring.current / 24 : 0}deg;"
                  aria-label={item.side === 'left' ? $t('common.aria.pickLeft') : $t('common.aria.pickRight')}
                >
                  <span class="heart-pop" aria-hidden="true">
                    <Heart class="heart-pop-icon" />
                  </span>
                </button>
              {/each}
            </div>
          {/key}
          <span class="vs-badge" aria-hidden="true">VS</span>
        </div>

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
      </div>
    </section>

  {:else if phase === 'result'}
    <section class="space-y-8 animate-fade-in-up">
      <header class="text-center space-y-3">
        <div class="text-xs text-muted-foreground tracking-wide uppercase">
          {$t('common.result.personaLabel')}
        </div>
        <div class="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2 text-lg font-bold animate-bounce-subtle">
          <Sparkles class="size-5 text-popular" />
          {$t('common.result.persona.' + persona)}
        </div>
        <h2 class="text-xl font-semibold pt-2">
          {$t('common.result.title').replace('{count}', String(RESULT_COUNT))}
        </h2>
        <p class="text-sm text-muted-foreground">
          {$t('common.result.subtitle').replace('{count}', String(questionNo))}
        </p>
      </header>

      <ul class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {#each result as dye, i (dye.id)}
          <li class="tile-in" style="animation-delay: {i * 60}ms">
            <a
              href="{PICKER_URL}?dye={dye.id}"
              target="_blank"
              rel="noopener noreferrer"
              class="group block overflow-hidden rounded-xl border border-border bg-card hover:bg-accent"
            >
              <div class="aspect-[4/3]" style="background-color: {dye.hex}"></div>
              <div class="flex items-center gap-1.5 px-3 py-2.5">
                <span class="text-base font-semibold truncate">{dyeName(dye)}</span>
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
