// 自己検証: tsx 経由で実行 (npm run test:engine)
import assert from 'node:assert/strict';
import {
  diversify,
  emptyPref,
  pickNextPair,
  scoreDyes,
  selectRepresentatives,
  summarizePref,
  updatePref,
} from './engine';
import { rgbToHex, rgbToOklab } from './oklab';
import type { Dye } from './types';

const dye = (id: string, r: number, g: number, b: number): Dye => ({
  id,
  name: id,
  category: 'x',
  rgb: { r, g, b },
  hex: rgbToHex(r, g, b),
  lab: rgbToOklab(r, g, b),
});

// rgbToOklab: 白は L≈1
const [whiteL] = rgbToOklab(255, 255, 255);
assert.ok(whiteL > 0.98 && whiteL < 1.02, `white L≈1, got ${whiteL}`);

const dyes = [
  dye('red', 255, 0, 0),
  dye('green', 0, 255, 0),
  dye('blue', 0, 0, 255),
  dye('white', 255, 255, 255),
  dye('black', 0, 0, 0),
  dye('yellow', 255, 255, 0),
];

// selectRepresentatives: 重複なくちょうど k 個
const reps = selectRepresentatives(dyes, 4);
assert.equal(reps.length, 4);
assert.equal(new Set(reps.map((d) => d.id)).size, 4);

// updatePref: 明るい色を好めば L 成分が正方向に動く
const pref = updatePref(emptyPref(), dyes[5], dyes[4]); // yellow > black
assert.ok(pref[0] > 0, `liking bright should raise L, got ${pref[0]}`);

// scoreDyes: 好き=red, 嫌い=blue なら red > blue
const prefRB = updatePref(emptyPref(), dyes[0], dyes[2]);
const scores = scoreDyes(dyes, [dyes[0]], [dyes[2]], prefRB);
assert.ok(scores.get('red')! > scores.get('blue')!, 'red should beat blue');
// yellow は red 寄りなので blue より高くなるべき
assert.ok(scores.get('yellow')! > scores.get('blue')!, 'pref bonus should pull yellow above blue');

// diversify: 似た2色は両採用しない
const close = [...dyes, dye('r1', 255, 0, 0), dye('r2', 250, 5, 5)];
const fakeScores = new Map(close.map((d) => [d.id, d.id.startsWith('r') ? 10 : 1]));
const picked = diversify(close, fakeScores, 4, 0.05);
const hasBothNear = picked.some((d) => d.id === 'r1') && picked.some((d) => d.id === 'r2');
assert.ok(!hasBothNear, 'should not pick both near-duplicate reds');
assert.equal(picked.length, 4);

// diversify: excludeIds に指定された色は結果に出ない
const excludeReds = new Set(['r1', 'r2', 'red']);
const pickedNoRed = diversify(close, fakeScores, 4, 0.05, [], excludeReds);
assert.ok(
  pickedNoRed.every((d) => !excludeReds.has(d.id)),
  'excludeIds must keep listed dyes out of the result'
);

// pickNextPair: 2色以上残っていればちゃんとペアを返す & seen を尊重
const seen = new Set<string>(['red', 'green']);
const [a, b] = pickNextPair(dyes, emptyPref(), seen);
assert.ok(a.id !== b.id, 'pair must be distinct');
assert.ok(!seen.has(a.id) && !seen.has(b.id), 'pair must skip seen ids');

// summarizePref: 代表的な好みは想定通りのラベルに落ちる
assert.equal(summarizePref([dyes[0]]), 'warm', 'red → warm');
assert.equal(summarizePref([dyes[5]]), 'warm', 'yellow → warm');
assert.equal(summarizePref([dyes[1]]), 'green', 'green → green');
assert.equal(summarizePref([dyes[2]]), 'cool', 'blue → cool');
assert.equal(summarizePref([dyes[3]]), 'bright', 'white → bright');
assert.equal(summarizePref([dyes[4]]), 'dark', 'black → dark');
assert.equal(summarizePref([]), 'balanced', 'empty wins → balanced');

console.log('engine check: OK');
