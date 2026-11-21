import test from 'node:test';
import assert from 'node:assert/strict';
import { groupOf, groupStarts, sortHand } from '../js/ui/handOrder.js';
import { loadJson } from './helpers.js';

const cards = loadJson('cards.json');
const rarities = loadJson('rarities.json');
const hand = (...types) => types.map((type, i) => ({ cardId: `c${String(i + 1).padStart(2, '0')}`, type }));
const types = (h) => h.map((c) => c.type);

test('手札の並び：種類順（兵士 → 武器 → 魔法 → 防御 → 特殊）', () => {
  const sorted = sortHand(hand('blessing', 'shield', 'fireball', 'ironSword', 'infantry'), cards, rarities);
  assert.deepEqual(types(sorted), ['infantry', 'ironSword', 'fireball', 'shield', 'blessing']);
});

test('手札の並び：同じ種類の中は、レアリティが高い方から低い方へ', () => {
  // 武器：神剣（レジェンド）→ 聖剣（エピック）→ 魔剣（レア）→ 鉄の剣（アンコモン）→ フレイムソード（コモン）
  const sorted = sortHand(hand('flameSword', 'godSword', 'ironSword', 'magicSword', 'holySword'), cards, rarities);
  assert.deepEqual(types(sorted), ['godSword', 'holySword', 'magicSword', 'ironSword', 'flameSword']);
});

test('手札の並び：同じカードは隣り合い、同じ並びなら毎回同じ（引いた順）', () => {
  const sorted = sortHand(hand('fireball', 'bolt', 'fireball', 'bolt'), cards, rarities);
  assert.deepEqual(types(sorted), ['bolt', 'bolt', 'fireball', 'fireball']); // 同じレアリティ（コモン）は種類順
  assert.deepEqual(sorted.map((c) => c.cardId), ['c02', 'c04', 'c01', 'c03']);
  assert.deepEqual(sortHand(sorted, cards, rarities), sorted);
});

test('手札の並び：コインや手札を引き直すカードは「特殊」。元の配列は変えない', () => {
  assert.equal(groupOf(cards.treasure), 'special');
  assert.equal(groupOf(cards.blessing), 'special');
  assert.equal(groupOf(cards.heal), 'spell');
  assert.equal(groupOf(cards.shield), 'defense');
  const h = hand('treasure', 'heal');
  const copy = [...h];
  sortHand(h, cards, rarities);
  assert.deepEqual(h, copy);
});

test('手札の並び：グループの最初のカードがわかる', () => {
  const sorted = sortHand(hand('infantry', 'heavy', 'fireball', 'shield'), cards, rarities);
  const starts = groupStarts(sorted, cards);
  assert.deepEqual(sorted.filter((c) => starts.has(c.cardId)).map((c) => c.type), ['heavy', 'fireball', 'shield']);
});
