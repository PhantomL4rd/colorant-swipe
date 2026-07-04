import { dist } from './oklab';
import type { Dye } from './types';

// 数学的な床: 探索 1-2 + 境界探索 3。これ未満は SN 比で意味を失う。
export const QUESTION_COUNT = 5;
export const REP_COUNT = 30;
export const RESULT_COUNT = 6;
const SIGMA = 0.2; // 0.15 でも wins 直近への集中が強く「最初に選んだ色に引っ張られすぎる」問題が残ったので更に緩和
const DIVERSIFY_MIN_DIST = 0.06;
const PREF_BONUS = 0.8;
const EXPLORE_PMAG = 1.0; // updatePref が単位ベクトル加算になったので、|pref| は「同方向の一致問数」に対応。Q1 直後 pmag=1 で境界探索へ

// ponytail: 代表色は farthest-point sampling で実行時計算。
// シードは L の中央値付近＋そこそこの彩度を持つ色を選ぶ。
// 「高彩度色から開始」だと farthest-point が OKLab 極点 (暗いメタリック / 蛍光) を
// 貪欲に集めて代表色プールが端点まみれになり、選択肢の質が下がる。
export function selectRepresentatives(dyes: Dye[], k = REP_COUNT): Dye[] {
  if (dyes.length <= k) return [...dyes];

  // 極端暗色 (L < 0.20) は代表色プールから除外。Q1 の距離最大ペアが
  // 「白 vs Metallic Dark Blue」のような極端対比を組みやすく、
  // ゆるふわ派の体験を損ねる。結果 (diversify) には allDyes から選ばれ得る。
  const filtered = dyes.filter((d) => d.lab[0] >= 0.2);
  const pool = filtered.length >= k ? filtered : dyes;

  const sortedByL = [...pool].sort((a, b) => a.lab[0] - b.lab[0]);
  const medianL = sortedByL[Math.floor(sortedByL.length / 2)].lab[0];

  let seed = pool[0];
  let seedScore = -Infinity;
  for (const d of pool) {
    const distL = Math.abs(d.lab[0] - medianL);
    const c = Math.hypot(d.lab[1], d.lab[2]);
    // L 中央値に近いほど＋、彩度もある程度欲しい（白黒スタート回避）
    const score = -distL * 2 + c;
    if (score > seedScore) {
      seedScore = score;
      seed = d;
    }
  }

  const picked: Dye[] = [seed];
  const minDist = pool.map((d) => dist(d.lab, seed.lab));
  while (picked.length < k) {
    let maxIdx = -1;
    let maxD = -1;
    for (let i = 0; i < pool.length; i++) {
      if (minDist[i] > maxD) {
        maxD = minDist[i];
        maxIdx = i;
      }
    }
    if (maxIdx < 0) break;
    const next = pool[maxIdx];
    picked.push(next);
    for (let i = 0; i < pool.length; i++) {
      const d = dist(pool[i].lab, next.lab);
      if (d < minDist[i]) minDist[i] = d;
    }
  }
  return picked;
}

export type Pref = [number, number, number];
export const emptyPref = (): Pref => [0, 0, 0];

export function updatePref(pref: Pref, winner: Dye, loser: Dye): Pref {
  const dx = winner.lab[0] - loser.lab[0];
  const dy = winner.lab[1] - loser.lab[1];
  const dz = winner.lab[2] - loser.lab[2];
  const mag = Math.hypot(dx, dy, dz);
  if (mag < 1e-6) return pref;
  // 単位ベクトルとして加算。差ベクトルの大きさで重みが変わらないので、序盤の大差ペアと
  // 境界探索の僅差ペアが等価な情報量として蓄積される。pmag は「同方向の一致回数」に対応。
  return [pref[0] + dx / mag, pref[1] + dy / mag, pref[2] + dz / mag];
}

// ponytail: 全ペア列挙してスコア順に並べ、上位 K=4 からランダムに 1 個引く。
// 完全決定論だと同じ pref 状態で毎回同じペアが出て UX が退屈になるので、
// 上位内 (=質は保証) で変化を持たせる。K=4 は「上位品質を落とさない上限」の経験値。
// 序盤 (pref が弱い) は探索: 距離最大のペア。
// 中盤以降は搾取: 現在の好み境界に最も近い (=判別困難な) ペア。
const PAIR_TOP_K = 6;

export function pickNextPair(rep: Dye[], pref: Pref, seenIds: Set<string>): [Dye, Dye] {
  const pool = rep.filter((d) => !seenIds.has(d.id));
  if (pool.length < 2) {
    const fallback = rep;
    return [fallback[0], fallback[fallback.length - 1]];
  }
  const pmag = Math.hypot(pref[0], pref[1], pref[2]);
  const explore = pmag < EXPLORE_PMAG;
  // 全ペアを (pair, score) で列挙。score は「大きいほど好ましい」に符号を統一する。
  const candidates: Array<{ pair: [Dye, Dye]; score: number }> = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i];
      const b = pool[j];
      const diff: [number, number, number] = [
        a.lab[0] - b.lab[0],
        a.lab[1] - b.lab[1],
        a.lab[2] - b.lab[2],
      ];
      const sep = Math.hypot(diff[0], diff[1], diff[2]);
      if (sep < 0.08) continue;
      let score: number;
      if (explore) {
        // 距離最大が好ましいが、両方が高彩度な「派手 vs 派手」ペア（例: Neon Yellow vs Metallic Dark Blue）
        // が Q1 の上位 K を独占して「毎回同じ黄色と黒」体験になっていたので、彩度平均で軽く減点する。
        // これで「白/淡色 vs 暗色」のような落ち着いた極端対比が上位に浮上する。
        const avgC = (Math.hypot(a.lab[1], a.lab[2]) + Math.hypot(b.lab[1], b.lab[2])) / 2;
        score = sep * (1 - Math.min(0.5, avgC));
      } else {
        // 判別困難 (境界に近い) ほど好ましい。|dot|/sep/pmag が小さいほど良いので符号反転。
        const dot = pref[0] * diff[0] + pref[1] * diff[1] + pref[2] * diff[2];
        score = -Math.abs(dot) / (sep * pmag);
      }
      candidates.push({ pair: [a, b], score });
    }
  }
  if (candidates.length === 0) return [pool[0], pool[1]];
  candidates.sort((x, y) => y.score - x.score);

  // 上位 K 内で「1 色が最大 PER_COLOR_CAP 回まで」に制限。
  // 現状 rep で最明色 (例: Vanilla Yellow) が distance-max ペアの片方として
  // 上位 15 のうち過半に登場し、K=6 選出時に「毎回同じ色が選択肢に出る」
  // 単調さの原因になっていた。
  const PER_COLOR_CAP = 2;
  const perColor = new Map<string, number>();
  const topK: typeof candidates = [];
  for (const c of candidates) {
    if (topK.length >= PAIR_TOP_K) break;
    const [a, b] = c.pair;
    if ((perColor.get(a.id) ?? 0) >= PER_COLOR_CAP) continue;
    if ((perColor.get(b.id) ?? 0) >= PER_COLOR_CAP) continue;
    topK.push(c);
    perColor.set(a.id, (perColor.get(a.id) ?? 0) + 1);
    perColor.set(b.id, (perColor.get(b.id) ?? 0) + 1);
  }
  const pool2 = topK.length > 0 ? topK : candidates.slice(0, PAIR_TOP_K);
  const idx = Math.floor(Math.random() * pool2.length);
  return pool2[idx].pair;
}

// ガウス重み (局所一致) + Pref ベクトルとの内積 (方向一致) を合成。
// ガウスだけだと wins から少し離れた色が拾えず、Pref だけだと「明るい何か」になりやすい。
// pref 投影の基準点は wins の重心 (=「好きなものの中心」)。losses は減点ガウスで別途反映する。
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
  let cx = 0;
  let cy = 0;
  let cz = 0;
  if (wins.length > 0) {
    for (const w of wins) {
      cx += w.lab[0];
      cy += w.lab[1];
      cz += w.lab[2];
    }
    cx /= wins.length;
    cy /= wins.length;
    cz /= wins.length;
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

// 入力 Dye 群の重心から傾向を一語で要約。OKLab の彩度 / hue / L だけで決める。
// wins を渡せば「好み」の要約、result を渡せば「診断結果」の要約になる。
export type Persona =
  | 'warm'
  | 'cool'
  | 'green'
  | 'purple'
  | 'bright'
  | 'dark'
  | 'pale'
  | 'balanced';

export function summarizePref(wins: Dye[]): Persona {
  if (wins.length === 0) return 'balanced';
  let l = 0;
  let a = 0;
  let b = 0;
  for (const w of wins) {
    l += w.lab[0];
    a += w.lab[1];
    b += w.lab[2];
  }
  l /= wins.length;
  a /= wins.length;
  b /= wins.length;
  const chroma = Math.hypot(a, b);

  // 明淡帯 (明るくて彩度控えめ) を Pastel/Snow/Ivory 含めて "pale" に集約。
  // 旧: chroma<0.03 かつ 0.4<L<0.78 という「中グレー限定」で pastel が bright に落ちていた。
  if (l > 0.72 && chroma < 0.14) return 'pale';

  // 有色 (中〜高彩度) は色相で分類
  if (chroma > 0.09) {
    const hueDeg = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
    if (hueDeg < 110 || hueDeg >= 330) return 'warm';
    if (hueDeg < 200) return 'green';
    if (hueDeg < 280) return 'cool';
    return 'purple';
  }

  // 低彩度は明度で明るい/暗い/中間に分類
  if (l > 0.78) return 'bright';
  if (l < 0.4) return 'dark';
  return 'balanced';
}

// 高スコア順に走査、既選色との最低距離を満たすもののみ採用。
// 足りなければ minDist を段階的に緩めて再試行する。旧実装は「距離制約無視」の
// フォールバックで派閥外の色 (ペール派なのに Marsh Green など) が末尾に混じっていた。
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

  const tryFill = (md: number): Dye[] => {
    const picked: Dye[] = [];
    const counts = caps.map(() => 0);
    for (const d of sorted) {
      if (caps.some((c, i) => c.test(d) && counts[i] >= c.max)) continue;
      if (picked.every((p) => dist(p.lab, d.lab) >= md)) {
        picked.push(d);
        caps.forEach((c, i) => {
          if (c.test(d)) counts[i] += 1;
        });
        if (picked.length === k) return picked;
      }
    }
    return picked;
  };

  for (const factor of [1.0, 0.7, 0.4]) {
    const attempt = tryFill(minDist * factor);
    if (attempt.length === k) return attempt;
  }
  // ハード最小 0.02 を残して穴埋め (真の重複は依然弾く)
  return tryFill(0.02);
}
