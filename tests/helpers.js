// テスト用の共通部品。Node.js だけで動く（外部パッケージなし）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** data/ の JSON を読む（毎回新しいオブジェクトを返すので、書き換えても他のテストに影響しない） */
export function loadJson(name) {
  return JSON.parse(readFileSync(join(ROOT, 'data', name), 'utf8'));
}

/** tests/fixtures/ の固定データを読む（data/ の調整でテストが落ちないように） */
export function loadFixture(name) {
  return JSON.parse(readFileSync(join(ROOT, 'tests', 'fixtures', name), 'utf8'));
}

/**
 * data/ の rules / cards に、一部だけ上書きしたものを返す。
 * cards はカードごとに中身をまぜる（null を渡したカードは消す）。
 * @param {{rules?: object, cards?: object, source?: 'data' | 'fixture'}} [patch]
 */
export function buildData({ rules: rulesPatch = {}, cards: cardsPatch = {}, source = 'data' } = {}) {
  const load = source === 'fixture' ? loadFixture : loadJson;
  const rules = { ...load('rules.json'), ...rulesPatch };
  const cards = load('cards.json');
  for (const [k, v] of Object.entries(cardsPatch)) {
    if (v === null) delete cards[k];
    else cards[k] = { ...(cards[k] || {}), ...v };
  }
  return { rules, cards };
}

/**
 * 試合の始めの決まり（マリガン・後攻の補正）を切るルールの上書き。
 * それとは関係のない仕組みを、本物の data/rules.json で確かめるテストで使う（start() のあとすぐ先攻のターン1になる）
 */
export const PLAIN_START = { mulligan: false, secondPlayerHandBonus: 0, secondPlayerArmor: 0 };

/** data/ の魔物と強化（STEP 3）。ファイルがなければ null */
export function loadOptionalData() {
  const read = (name) => {
    try {
      return loadJson(name);
    } catch {
      return null;
    }
  };
  return { monsters: read('monsters.json'), upgrades: read('upgrades.json'), castles: read('castles.json'), decks: read('decks.json'), rarities: read('rarities.json'), weather: read('weather.json'), stages: read('stages.json'), elements: read('elements.json'), reactions: read('reactions.json'), factions: read('factions.json') };
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
