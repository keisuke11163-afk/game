import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildData, loadJson, seededRng } from './helpers.js';
import { Game } from '../js/game/Game.js';
import { Card } from '../js/game/Card.js';
import { validateEvolutions, applyEvolution } from '../js/game/Evolution.js';
import { validateSynergies } from '../js/game/Synergy.js';

const factions = loadJson('factions.json');
const races = loadJson('races.json');
const rarities = loadJson('rarities.json');

function cardsWith(patch) {
  const { cards } = buildData({ cards: { infantry: patch } });
  return cards;
}

test('faction / race / evolutionLine: 正しい値は通る', () => {
  const cards = cardsWith({ faction: 'kingdom', race: 'human', evolutionLine: 'knight-line' });
  Card.validateDefinitions(cards, rarities, { factions, races });
});

test('faction / race / evolutionLine: 不正な値は例外', () => {
  assert.throws(() => Card.validateDefinitions(cardsWith({ faction: 'nope' }), rarities, { factions, races }), /faction/);
  assert.throws(() => Card.validateDefinitions(cardsWith({ race: 'nope' }), rarities, { factions, races }), /race/);
  assert.throws(() => Card.validateDefinitions(cardsWith({ evolutionLine: '' }), rarities, { factions, races }), /evolutionLine/);
  assert.throws(() => Card.validateDefinitions(cardsWith({ evolutionLine: 3 }), rarities, { factions, races }), /evolutionLine/);
  assert.throws(() => Card.validateDefinitions(cardsWith({ faction: 5 }), rarities), /faction/);
});

test('factions / races を渡さなければ、値の中身は確かめない（後方互換）', () => {
  // 合成先も合成元も陣営なしのカード（賢者）で確かめる（合成先が別の陣営になる組み合わせは、四大陣営の検査で一覧なしでも弾くため）
  Card.validateDefinitions(buildData({ cards: { sage: { faction: 'whatever', race: 'whatever' } } }).cards, rarities);
  const { rules, cards } = buildData();
  new Game({ cards, rules, rng: seededRng(1) });
  new Game({ cards: cardsWith({ faction: 'kingdom', race: 'human' }), rules, rarities, factions, races, rng: seededRng(1) });
  assert.throws(() => new Game({ cards: cardsWith({ faction: 'x' }), rules, rarities, factions, races }), /faction/);
});

const evo = loadJson('evolutions.json');
const { cards: allCards } = buildData();

test('validateEvolutions: 正常と異常', () => {
  validateEvolutions(evo, allCards);
  const bad = (mut) => { const e = structuredClone(evo); mut(e.knight); return e; };
  assert.throws(() => validateEvolutions({ ghostCard: evo.knight }, allCards), /cards\.json にない/);
  assert.throws(() => validateEvolutions(bad((k) => { k.stages[1].stage = 3; }), allCards), /stage/);
  assert.throws(() => validateEvolutions(bad((k) => { k.stages[0].expRequired = -1; }), allCards), /expRequired/);
  assert.throws(() => validateEvolutions(bad((k) => { k.stages[0].expRequired = 1.5; }), allCards), /expRequired/);
  assert.throws(() => validateEvolutions(bad((k) => { k.stages[0].statBonus.hp = 'a'; }), allCards), /statBonus/);
});

test('applyEvolution: 元を変えず、段階ぶんを足す', () => {
  const def = allCards.knight;
  const snapshot = structuredClone(def);
  assert.equal(applyEvolution(def, evo.knight, 0), def);
  assert.equal(applyEvolution(def, null, 2), def);
  const s1 = applyEvolution(def, evo.knight, 1);
  assert.notEqual(s1, def);
  assert.equal(s1.hp, def.hp + 1);
  const s2 = applyEvolution(def, evo.knight, 2);
  assert.equal(s2.hp, def.hp + 1 + 2);
  assert.equal(s2.attack, def.attack + 1 + 2);
  assert.equal(s2.name, '聖騎士王');
  assert.deepEqual(def, snapshot);
});

test('validateSynergies: 正常と異常', () => {
  const syn = loadJson('synergies.json');
  validateSynergies(syn, factions, races);
  const c = () => structuredClone(syn);
  const a = c(); delete a.faction.kingdom;
  assert.throws(() => validateSynergies(a, factions, races), /kingdom/);
  const b = c(); b.race.elf['4'] = b.race.elf['2'];
  assert.throws(() => validateSynergies(b, factions, races), /"2" か "3"/);
  const d = c(); d.faction.demon['2'].bonus.attack = 'x';
  assert.throws(() => validateSynergies(d, factions, races), /bonus/);
  const e = c(); e.race.fake = e.race.elf;
  assert.throws(() => validateSynergies(e, factions, races), /fake/);
  assert.throws(() => validateSynergies(null, factions, races));
});

test('本物のデータが検証を通る', () => {
  const syn = loadJson('synergies.json');
  for (const f of [factions, races]) {
    for (const d of Object.values(f)) assert.ok(d.name && d.description);
  }
  validateSynergies(syn, factions, races);
  validateEvolutions(evo, loadJson('cards.json'));
  assert.equal(loadJson('rules.json').maxMp, 30);
});
