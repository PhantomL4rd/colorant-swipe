import { dist } from './oklab';
import type { Dye } from './types';

// 数学的な床: 探索 1-2 + 境界探索 3。これ未満は SN 比で意味を失う。
export const QUESTION_COUNT = 5;
export const REP_COUNT = 30;
export const RESULT_COUNT = 6;
const SIGMA = 0.1;
const DIVERSIFY_MIN_DIST = 0.06;
const PREF_BONUS = 0.8; // 短セッションでは方向情報を重視
const EXPLORE_PMAG = 0.25; // 探索フェーズを短く

// ponytail: 代表色は farthest-point sampling で実行時計算。
// 代表色フラグを DB に持たせる案 (spec) は不要、選色ロジック1本で済む。
export function selectRepresentatives(dyes: Dye[], k = REP_COUNT): Dye[] {
  if (dyes.length <= k) return [...dyes];
  // 高彩度色から開始（白黒だけでスタートさせない）
  let seed = dyes[0];
  let seedChroma = -1;
  for (const d of dyes) {
    const c = Math.hypot(d.lab[1], d.lab[2]);
    if (c > seedChroma) {
      seedChroma = c;
      seed = d;
    }
  }
  const picked: Dye[] = [seed];
  const minDist = dyes.map((d) => dist(d.lab, seed.lab));
  while (picked.length < k) {
    let maxIdx = -1;
    let maxD = -1;
    for (let i = 0; i < dyes.length; i++) {
      if (minDist[i] > maxD) {
        maxD = minDist[i];
        maxIdx = i;
      }
    }
    if (maxIdx < 0) break;
    const next = dyes[maxIdx];
    picked.push(next);
    for (let i = 0; i < dyes.length; i++) {
      const d = dist(dyes[i].lab, next.lab);
      if (d < minDist[i]) minDist[i] = d;
    }
  }
  return picked;
}

export type Pref = [number, number, number];
export const emptyPref = (): Pref => [0, 0, 0];

export function updatePref(pref: Pref, winner: Dye, loser: Dye): Pref {
  return [
    pref[0] + (winner.lab[0] - loser.lab[0]),
    pref[1] + (winner.lab[1] - loser.lab[1]),
    pref[2] + (winner.lab[2] - loser.lab[2]),
  ];
}

// ponytail: entropy 最大化はランダムサンプリングで近似。
// 序盤 (pref が弱い) は探索: 距離最大のペア。
// 中盤以降は搾取: 現在の好み境界に最も近い (=判別困難な) ペア。
export function pickNextPair(rep: Dye[], pref: Pref, seenIds: Set<string>): [Dye, Dye] {
  const pool = rep.filter((d) => !seenIds.has(d.id));
  if (pool.length < 2) {
    // 代表色を使い切ったら全 rep から再サンプリング (境界探索を続行)
    const fallback = rep;
    return [fallback[0], fallback[fallback.length - 1]];
  }
  const pmag = Math.hypot(pref[0], pref[1], pref[2]);
  const explore = pmag < EXPLORE_PMAG;
  let best: [Dye, Dye] | null = null;
  let bestScore = explore ? -Infinity : Infinity;
  const target = Math.min(80, (pool.length * (pool.length - 1)) / 2);
  for (let i = 0; i < target; i++) {
    const a = pool[Math.floor(Math.random() * pool.length)];
    const b = pool[Math.floor(Math.random() * pool.length)];
    if (a.id === b.id) continue;
    const diff: [number, number, number] = [
      a.lab[0] - b.lab[0],
      a.lab[1] - b.lab[1],
      a.lab[2] - b.lab[2],
    ];
    const sep = Math.hypot(diff[0], diff[1], diff[2]);
    if (sep < 0.08) continue;
    if (explore) {
      if (sep > bestScore) {
        bestScore = sep;
        best = [a, b];
      }
    } else {
      const dot = pref[0] * diff[0] + pref[1] * diff[1] + pref[2] * diff[2];
      const score = Math.abs(dot) / (sep * pmag); // 0 に近いほど判別困難
      if (score < bestScore) {
        bestScore = score;
        best = [a, b];
      }
    }
  }
  return best ?? [pool[0], pool[1]];
}

// ガウス重み (局所一致) + Pref ベクトルとの内積 (方向一致) を合成。
// ガウスだけだと wins から少し離れた色が拾えず、Pref だけだと「明るい何か」になりやすい。
export function scoreDyes(
  allDyes: Dye[],
  wins: Dye[],
  losses: Dye[],
  pref: Pref = emptyPref(),
  sigma = SIGMA
): Map<string, number> {
  const s2 = sigma * sigma;
  const pmag = Math.hypot(pref[0], pref[1], pref[2]) || 1;
  const pn: Pref = [pref[0] / pmag, pref[1] / pmag, pref[2] / pmag];
  // wins の重心を Pref 方向投影の基準点にする
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const all = [...wins, ...losses];
  if (all.length > 0) {
    for (const d of all) {
      cx += d.lab[0];
      cy += d.lab[1];
      cz += d.lab[2];
    }
    cx /= all.length;
    cy /= all.length;
    cz /= all.length;
  }
  const m = new Map<string, number>();
  for (const d of allDyes) {
    let s = 0;
    for (const w of wins) {
      const r = dist(d.lab, w.lab);
      s += Math.exp(-(r * r) / s2);
    }
    for (const l of losses) {
      const r = dist(d.lab, l.lab);
      s -= Math.exp(-(r * r) / s2);
    }
    if (pmag > 0.01) {
      const proj = (d.lab[0] - cx) * pn[0] + (d.lab[1] - cy) * pn[1] + (d.lab[2] - cz) * pn[2];
      s += PREF_BONUS * proj;
    }
    m.set(d.id, s);
  }
  return m;
}

// 高スコア順に走査、既選色との最低距離を満たすもののみ採用。
// 足りなければ距離制約だけ外して穴埋め (caps は最後まで尊重)。
export type DiversifyCap = { test: (d: Dye) => boolean; max: number };

export function diversify(
  allDyes: Dye[],
  scores: Map<string, number>,
  k = RESULT_COUNT,
  minDist = DIVERSIFY_MIN_DIST,
  caps: DiversifyCap[] = [],
  excludeIds: Set<string> = new Set()
): Dye[] {
  const sorted = [...allDyes]
    .filter((d) => !excludeIds.has(d.id))
    .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0));
  const picked: Dye[] = [];
  const counts = caps.map(() => 0);
  const exceedsCap = (d: Dye) => caps.some((c, i) => c.test(d) && counts[i] >= c.max);
  const accept = (d: Dye) => {
    picked.push(d);
    caps.forEach((c, i) => {
      if (c.test(d)) counts[i] += 1;
    });
  };
  for (const d of sorted) {
    if (exceedsCap(d)) continue;
    if (picked.every((p) => dist(p.lab, d.lab) >= minDist)) {
      accept(d);
      if (picked.length === k) return picked;
    }
  }
  for (const d of sorted) {
    if (picked.includes(d)) continue;
    if (exceedsCap(d)) continue;
    accept(d);
    if (picked.length === k) break;
  }
  return picked;
}
