// シミュレーションを少しだけ回して、「必ず決着する」「止まらない」を毎回確かめる。
// 数字の比べ方は tests/sim/run.js で（こちらは速さのために試合数を少なくしている）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadJson } from './helpers.js';
import { runMany, runMatch } from './sim/sim.js';
import { STRATEGIES } from './sim/strategies.js';

// シミュレーションは data/ の今の値で回す（バランス調整で決着しなくなったら、ここで気づく）
const cards = loadJson('cards.json');
const rules = loadJson('rules.json');
// 1000手番（1人500ターン）を超えたら「決着しない」とみなす。今の値では守り優先同士の最長が700手番ほど
const maxTurns = 1000;
const names = Object.keys(STRATEGIES);

test('どの戦い方の組み合わせでも、全試合が決着する（各20試合）', () => {
  for (const a of names) {
    for (const b of names) {
      if (a === 'pass' && b === 'pass') continue; // 2人とも何も出さないと決着しない（遊ぶ人はカードを出す）
      const r = runMany({ games: 20, seed: 3, cards, rules, strategies: [a, b], maxTurns });
      assert.equal(r.decided, r.games, `${a} vs ${b}`);
    }
  }
});

test('カードの総数は変わらない（山札＋捨て札＋使い切り＋手札）', () => {
  const total = Object.values(cards).reduce((a, c) => a + c.count, 0);
  for (let seed = 1; seed <= 30; seed++) {
    const r = runMatch({ cards, rules, strategies: ['smart', 'random'], seed });
    const s = r.finalState;
    const hands = Object.values(s.players).reduce((a, p) => a + p.handCount, 0);
    assert.equal(s.deckCount + s.discardCount + s.exhaustedCount + hands, total);
  }
});

test('同じシードなら同じ結果になる', () => {
  const a = runMany({ games: 30, seed: 9, cards, rules, strategies: ['smart', 'random'] });
  const b = runMany({ games: 30, seed: 9, cards, rules, strategies: ['smart', 'random'] });
  assert.deepEqual(a, b);
});
