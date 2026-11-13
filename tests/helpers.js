// テスト用の共通部品。Node.js だけで動く（外部パッケージなし）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** data/ の JSON を読む（毎回新しいオブジェクトを返すので、書き換えても他のテストに影響しない） */
export function loadJson(name) {
  return JSON.parse(readFileSync(join(ROOT, 'data', name), 'utf8'));
}

/** シード付きの乱数（mulberry32）。同じシードなら同じ並びになる */
export function seededRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Game が出すイベントを全部ためる */
export function recordEvents(game, types) {
  const log = [];
  for (const type of types) game.on(type, (payload) => log.push({ ...payload, event: type }));
  return log;
}
