// 日本バージョン（data/japan/）のデータのテスト：Game が読めて、遊べる形になっているか。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/Game.js';
import { checkCostDeck } from '../js/game/Setup.js';
import { buildData, loadOptionalData, seededRng } from './helpers.js';

const japan = (rules = {}) => {
  const { cards, rules: r } = buildData({ rules, set: 'japan' });
  return { cards, rules: r, ...loadOptionalData('japan') };
};

test('日本版：全員共通の山札・コスト制のデッキ・3人の広場で Game を作れる', () => {
  for (const rules of [{}, { deckMode: 'cost' }, { deckMode: 'own' }, { playerCount: 3, roadLayout: 'plaza' }]) {
    const game = new Game({ ...japan(rules), rng: seededRng(3) });
    game.start();
    assert.ok(game.getState('p1').players.p1.handCount > 0);
  }
});

test('日本版：西洋版のカードは入っていない（混ぜない）。忍者の系統が5段階ある', () => {
  const { cards } = japan();
  const western = buildData().cards;
  assert.deepEqual(Object.keys(cards).filter((k) => k in western), [], '西洋版と同じキーのカードがある');
  const chain = [];
  for (let k = 'shinobiMinarai'; k; k = cards[k].fuseTo) chain.push(k);
  assert.deepEqual(chain, ['shinobiMinarai', 'genin', 'chunin', 'jonin', 'toryo']);
  assert.ok(chain.every((k) => cards[k].role === 'ninja'));
});

test('日本版：合成の行き先・妖怪の駒・見本のデッキがそろっている', () => {
  const { cards, monsters, decks, rarities, rules } = japan({ deckMode: 'cost' });
  for (const [k, def] of Object.entries(cards)) {
    if (def.fuseTo) assert.ok(cards[def.fuseTo], `${k} の合成先 ${def.fuseTo} がない`);
    if (def.monster) assert.ok(monsters[def.monster], `${k} の妖怪 ${def.monster} がない`);
  }
  for (const type of Object.keys(monsters)) assert.ok(cards[`beast_${type}`], `妖怪 ${type} の駒がない`);
  for (const [id, deck] of Object.entries(decks)) {
    for (const k of Object.keys(deck.cards)) assert.ok(cards[k], `${id} の ${k} がない`);
    if (deck.costDeck) assert.equal(checkCostDeck(deck.cards, cards, rarities, rules).ok, true, `${id} がコストの決まりに合わない`);
  }
  assert.ok(Object.values(decks.costBalance.cards).length > 0);
  assert.ok('shinobiMinarai' in decks.costBalance.cards, '見本のデッキに忍者が入っている');
});
