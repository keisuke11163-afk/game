// 属性の相性（10種・乗算補正）のテスト。data/elements.json と js/game/Elements.js。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/Game.js';
import { DEFAULT_ELEMENTS, ELEMENT_IDS, validateElements, elementMultiplier, applyElementMultiplier } from '../js/game/Elements.js';
import { loadJson, loadFixture, seededRng } from './helpers.js';

const table = DEFAULT_ELEMENTS;
const mult = (a, d) => elementMultiplier(table, a, d);

test('既定テーブルは data/elements.json と同じ。検証を通る', () => {
  assert.deepEqual(loadJson('elements.json'), DEFAULT_ELEMENTS);
  validateElements(loadJson('elements.json'));
  assert.deepEqual([...ELEMENT_IDS].sort(), ['chaos', 'dark', 'earth', 'fire', 'ice', 'light', 'thunder', 'water', 'wind']);
  assert.equal(table.multipliers.advantage, 1.5);
  assert.equal(table.multipliers.disadvantage, 0.75);
});

const PAIRS = [['water', 'fire'], ['fire', 'ice'], ['ice', 'water'], ['wind', 'fire'], ['water', 'earth'], ['earth', 'thunder'], ['earth', 'wind'], ['thunder', 'water'], ['light', 'dark'], ['dark', 'light']];

test('有利な組み合わせ（10組の矢印）は1.5倍、逆向きは不利0.75倍（光闇を除く）', () => {
  for (const [a, d] of PAIRS) assert.equal(mult(a, d), 1.5, `${a} → ${d}`);
  for (const [a, d] of PAIRS.filter(([a]) => a !== 'light' && a !== 'dark')) assert.equal(mult(d, a), 0.75, `${d} → ${a}`);
});

test('光と闇は互いに有利（1.5）で、不利の0.75は出ない', () => {
  assert.equal(mult('light', 'dark'), 1.5);
  assert.equal(mult('dark', 'light'), 1.5);
});

test('不利は beats から決まる（JSON に weakAgainst は書かない）', () => {
  for (const def of Object.values(table.elements)) assert.equal(def.weakAgainst, undefined);
});

test('混沌は基本相性なし：どの属性とも1.0（混沌どうし・無・同属性も）', () => {
  assert.deepEqual(table.elements.chaos.beats, []);
  for (const x of ELEMENT_IDS) {
    assert.equal(mult('chaos', x), 1, `chaos → ${x}`);
    assert.equal(mult(x, 'chaos'), 1, `${x} → chaos`);
    assert.equal(mult(x, null), 1);
    assert.equal(mult(null, x), 1);
    assert.equal(mult(x, undefined), 1);
    assert.equal(mult(x, x), 1, `${x} → ${x}`);
  }
});

test('書いていない組み合わせは1.0（火と土・水と風など）', () => {
  for (const [a, d] of [['fire', 'earth'], ['water', 'wind'], ['ice', 'thunder'], ['light', 'fire'], ['dark', 'earth'], ['ice', 'earth']]) assert.equal(mult(a, d), 1, `${a} → ${d}`);
});

test('JSON を直すだけで相性と倍率を変えられる', () => {
  const t = structuredClone(table);
  t.multipliers = { advantage: 2, disadvantage: 0.5 };
  t.elements.fire.beats = ['water'];
  t.elements.dark.weakAgainst = ['chaos'];
  validateElements(t);
  assert.equal(elementMultiplier(t, 'fire', 'water'), 2);
  assert.equal(elementMultiplier(t, 'fire', 'ice'), 1);
  assert.equal(elementMultiplier(t, 'water', 'ice'), 0.5); // 逆向き（氷は水に有利）は不利
  assert.equal(elementMultiplier(t, 'dark', 'chaos'), 0.5); // weakAgainst は任意で足せる
});

test('validateElements：間違いは例外', () => {
  const bad = (f) => { const t = structuredClone(table); f(t); return () => validateElements(t); };
  assert.throws(bad((t) => { t.multipliers.advantage = 0; }), /advantage/);
  assert.throws(bad((t) => { t.multipliers.disadvantage = 'x'; }), /disadvantage/);
  assert.throws(bad((t) => { t.elements.fire.beats = ['nope']; }), /nope/);
  assert.throws(bad((t) => { t.elements.fire.weakAgainst = ['nope']; }), /nope/);
  assert.throws(bad((t) => { delete t.elements.fire.name; }), /name/);
  assert.throws(() => validateElements(null), /elements/);
});

test('applyElementMultiplier：切り上げ・最低1。浮動小数の誤差で増えない', () => {
  assert.equal(applyElementMultiplier(4, 1.5), 6);
  assert.equal(applyElementMultiplier(5, 1.5), 8); // 7.5 → 8
  assert.equal(applyElementMultiplier(5, 0.75), 4); // 3.75 → 4
  assert.equal(applyElementMultiplier(4, 0.75), 3); // ちょうど 3
  assert.equal(applyElementMultiplier(1, 0.75), 1); // 0.75 → 最低1
  assert.equal(applyElementMultiplier(1, 1.5), 2);
  assert.equal(applyElementMultiplier(10, 1.2), 12); // 浮動小数の誤差で増えない
  assert.equal(applyElementMultiplier(7, 1), 7);
});

function makeGame(extra = {}, rulesPatch = {}) {
  const cards = loadFixture('cards-step2.json');
  const rules = { ...loadFixture('rules.json'), ...rulesPatch };
  return new Game({ cards, rules, rng: seededRng(1), ...extra });
}
const unit = (attack, element) => ({ attack, element });

test('fightDamage：有利は×1.5（切り上げ）、不利は×0.75（切り上げ・最低1）、混沌は補正なし、固定+2は無くなった', () => {
  const game = makeGame();
  assert.equal(game.fightDamage(unit(5, 'water'), unit(3, 'fire')), 8); // 7.5 → 8
  assert.equal(game.fightDamage(unit(5, 'fire'), unit(3, 'water')), 4); // 3.75 → 4
  assert.equal(game.fightDamage(unit(1, 'fire'), unit(3, 'water')), 1);
  assert.equal(game.fightDamage(unit(5, 'fire'), unit(3, 'chaos')), 5);
  assert.equal(game.fightDamage(unit(5, 'chaos'), unit(3, 'ice')), 5);
  assert.equal(game.fightDamage(unit(10, 'light'), unit(3, 'dark')), 15);
  assert.equal(game.fightDamage(unit(10, 'dark'), unit(3, 'light')), 15);
  assert.equal(game.fightDamage(unit(10, 'fire'), unit(3, null)), 10);
  assert.equal(game.fightDamage(unit(10, null), unit(3, 'fire')), 10);
});

test('rules.elementBonus を書いても、もう効かない（固定加算は使わない）', () => {
  const game = makeGame({}, { elementBonus: 2 });
  assert.equal(game.fightDamage(unit(5, 'water'), unit(3, 'fire')), 8); // 5+2=7 ではない
});

test('elements を渡さなくても既定の相性表で動く。渡した表が使われる', () => {
  const game = makeGame();
  assert.equal(game.elementTable, DEFAULT_ELEMENTS);
  const t = structuredClone(table);
  t.multipliers.advantage = 2;
  const g2 = makeGame({ elements: t });
  assert.equal(g2.fightDamage(unit(5, 'water'), unit(3, 'fire')), 10);
  assert.throws(() => makeGame({ elements: { multipliers: { advantage: -1, disadvantage: 1 }, elements: {} } }), /elements/);
});

test('順番：属性倍率 → 天候の属性ボーナス → ステージ倍率', () => {
  const stages = { lava: { name: '溶岩', weight: 1, element: 'fire', elementMultiplier: 1.5 } };
  const game = makeGame({ stages, setup: { stage: 'lava' } });
  game.debugSetHand('p1', ['infantry', 'flameSword']);
  game.start();
  const id = (t) => game.getState('p1').players.p1.hand.find((c) => c.type === t).cardId;
  assert.equal(game.playCard(id('infantry')).ok, true);
  assert.equal(game.playCard(id('flameSword')).ok, true);
  const s = game.players.p1.soldiers[0];
  assert.equal(s.element, 'fire');
  game.weatherDef = () => ({ elementBonus: { fire: 2 } });
  const base = game.attackOf(s);
  const target = unit(1, 'ice'); // 火→氷は有利
  const expected = Math.ceil((Math.ceil(base * 1.5 - 1e-9) + 2) * 1.5);
  assert.equal(game.fightDamage(s, target), expected);
  // 別の順（ステージ→属性→天候）だと値が違う組み合わせで確かめる
  const wrongOrder = Math.ceil(Math.ceil(base * 1.5) * 1.5 - 1e-9) + 2;
  assert.notEqual(expected, wrongOrder, `基本${base}で順番の違いが出る`);
});

test('新属性を武器・魔物・ステージ・天候に書ける。知らない属性は例外', () => {
  const cards = loadFixture('cards-step2.json');
  const rules = loadFixture('rules.json');
  for (const element of ['ice', 'thunder', 'dark', 'light', 'chaos']) {
    new Game({ cards: { ...cards, x: { name: 'x', kind: 'weapon', attackBonus: 1, element, count: 1 } }, rules });
    const monsters = { m: { name: 'm', hp: 3, attack: 1, element, weight: 1, reward: 1, castleAttack: 1, attackEvery: 2 } };
    new Game({ cards, rules, monsters });
    new Game({ cards, rules, weather: { w: { name: 'w', weight: 1, rounds: [1, 2], elementBonus: { [element]: 1 } } } });
    new Game({ cards, rules, stages: { s: { name: 's', weight: 1, element, elementMultiplier: 1.5 } } });
  }
  assert.throws(() => new Game({ cards: { ...cards, x: { name: 'x', kind: 'weapon', attackBonus: 1, element: 'wood', count: 1 } }, rules }), /element/);
});

test('火水風土の相性：水→火・土、風→火、土→風（輪ではなくなった）', () => {
  for (const [a, d] of [['water', 'fire'], ['water', 'earth'], ['wind', 'fire'], ['earth', 'wind']]) assert.equal(mult(a, d), 1.5);
  for (const [a, d] of [['fire', 'water'], ['earth', 'water'], ['fire', 'wind'], ['wind', 'earth']]) assert.equal(mult(a, d), 0.75);
});
