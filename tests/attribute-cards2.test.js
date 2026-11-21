// 闇・光・混沌の武器・魔法のカード（闇の鎌・光の槍・混沌の杖、闇弾・聖光線・混沌の渦）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { loadJson, seededRng, recordEvents, PLAIN_START } from './helpers.js';

const CARDS = loadJson('cards.json');
const REACTIONS = loadJson('reactions.json');
const ofType = (log, t) => log.filter((e) => e.event === t);
const SPELLS = { shadowBolt: 'dark', holyRay: 'light', chaosVortex: 'chaos' };
const WEAPONS = { darkScythe: 'dark', lightLance: 'light', chaosStaff: 'chaos' };

function newGame(seed = 1) {
  const cards = { ...CARDS, post: { name: '杭', kind: 'soldier', hp: 100, attack: 1, speed: 1, count: 1 },
    dummy: { name: '木人', kind: 'soldier', hp: 100, attack: 1, speed: 3, count: 1 } };
  const game = new Game({ cards, rules: { ...loadJson('rules.json'), ...PLAIN_START, laneLength: 5, laneCount: 1, defenseReaction: false }, reactions: REACTIONS, rng: seededRng(seed) });
  const log = recordEvents(game, EVENT_TYPES);
  game.debugSetDeck(Array(60).fill('heal'));
  game.start();
  return { game, log };
}
function play(game, type, target) {
  const pid = game.currentPlayer;
  const p = game.players[pid];
  p.playedThisTurn = false; p.soldiersPlayedThisTurn = 0; p.mp = 30;
  game.debugSetHand(pid, [type]);
  const r = game.playCard(p.hand[0].cardId, target);
  assert.equal(r.ok, true, r.reason);
  return p.soldiers.at(-1);
}
function foeSetup(game) {
  game.endTurn();
  const s = play(game, 'post'); s.position = 1;
  game.endTurn();
  return s;
}
/** p1 の木人（武器 w）と p2 の杭（element f）を同じ道でぶつけ、p1 の進軍で戦わせる */
function fight(weapon, foeElement) {
  const { game, log } = newGame();
  const m = play(game, 'dummy');
  if (weapon) play(game, weapon, { soldierId: m.soldierId });
  game.endTurn();
  const f = play(game, 'post'); f.position = 2; m.position = 1; f.element = foeElement;
  game.endTurn();
  const dmg = (sid) => ofType(log, 'soldierDamaged').find((e) => e.soldierId === sid)?.amount;
  return { toFoe: dmg(f.soldierId), toMine: dmg(m.soldierId), f, log };
}

test('データ：new Game が通り、属性・強さ・合成先が既存の属性カードと同じ', () => {
  newGame();
  for (const [k, el] of Object.entries(SPELLS)) {
    const c = CARDS[k];
    assert.equal(c.element, el); assert.equal(c.effect, 'damageEnemySoldiers'); assert.equal(c.scope, 'lane');
    assert.equal(c.amount, 2); assert.equal(c.rarity, 'common'); assert.equal(c.fuseTo, 'thunder');
    assert.ok(c.description);
  }
  for (const [k, el] of Object.entries(WEAPONS)) {
    assert.equal(CARDS[k].kind, 'weapon'); assert.equal(CARDS[k].element, el);
    assert.equal(CARDS[k].attackBonus, CARDS.flameSword.attackBonus); assert.equal(CARDS[k].fuseTo, 'ironSword');
  }
});

test('闇と光は互いに有利（1.5倍）、混沌と他は等倍', () => {
  assert.equal(fight('darkScythe', 'light').toFoe, 3); // 攻撃1+1=2 ×1.5
  assert.equal(fight('lightLance', 'dark').toFoe, 3);
  assert.equal(fight('darkScythe', 'fire').toFoe, 2);
  assert.equal(fight('chaosStaff', 'light').toFoe, 2);
  assert.equal(fight('lightLance', 'chaos').toFoe, 2);
  // 逆向き：光の杭が闇の兵士を攻撃すると 1 ×1.5 → 切り上げて 2（等倍なら 1）
  assert.equal(fight('darkScythe', 'light').toMine, 2);
  assert.equal(fight('darkScythe', null).toMine, 1);
});

test('闇弾・聖光線・混沌の渦が当たると、その属性が付着する', () => {
  for (const [k, el] of Object.entries(SPELLS)) {
    const { game } = newGame();
    const foe = foeSetup(game);
    play(game, k, undefined);
    assert.equal(foe.attachment?.element, el, k);
    assert.equal(foe.attachment.turns, 3);
  }
});

test('闇と光の付着には反応の表がなく、反応は起きない（付着だけ上書きされる）', () => {
  for (const [a, b] of [['shadowBolt', 'holyRay'], ['holyRay', 'shadowBolt'], ['shadowBolt', 'waterJet']]) {
    const { game, log } = newGame();
    const foe = foeSetup(game);
    play(game, a, undefined); play(game, b, undefined);
    assert.equal(ofType(log, 'reactionTriggered').length, 0, `${a}→${b}`);
    assert.equal(foe.attachment.element, SPELLS[b] ?? 'water');
  }
});

test('混沌の付着に別の属性、または混沌の攻撃で付着に当てると、chaosPool のどれかの反応が起きる', () => {
  const pool = new Set(REACTIONS.chaosPool);
  for (const [first, second] of [['chaosVortex', 'waterJet'], ['flameBolt', 'chaosVortex'], ['shadowBolt', 'chaosVortex'], ['chaosVortex', 'holyRay']]) {
    const { game, log } = newGame();
    foeSetup(game);
    play(game, first, undefined); play(game, second, undefined);
    const r = ofType(log, 'reactionTriggered');
    assert.equal(r.length, 1, `${first}→${second}`);
    assert.equal(r[0].chaos, true);
    assert.ok(pool.has(r[0].reaction));
  }
});

test('混沌の反応は乱数で決まり、同じシードなら同じ・シードを変えると別の反応が出うる', () => {
  const run = (seed) => {
    const { game, log } = newGame(seed);
    foeSetup(game);
    play(game, 'chaosVortex', undefined); play(game, 'waterJet', undefined);
    return ofType(log, 'reactionTriggered')[0].reaction;
  };
  assert.equal(run(5), run(5));
  const seen = new Set();
  for (let s = 1; s <= 40; s++) seen.add(run(s));
  assert.ok(seen.size >= 3, `反応がばらける（${[...seen]}）`);
});

test('混沌どうし・無属性の攻撃では反応は起きない', () => {
  let { game, log } = newGame();
  foeSetup(game);
  play(game, 'chaosVortex', undefined); play(game, 'chaosVortex', undefined);
  assert.equal(ofType(log, 'reactionTriggered').length, 0);
  ({ game, log } = newGame());
  const foe = foeSetup(game);
  play(game, 'chaosVortex', undefined); play(game, 'thunder', undefined); // サンダーは属性なし
  assert.equal(ofType(log, 'reactionTriggered').length, 0);
  assert.equal(foe.attachment?.element, 'chaos');
});

test('混沌の杖を持った兵士の攻撃でも付着し、水の付着に当たると混沌の反応が起きる', () => {
  const { game, log } = newGame();
  const m = play(game, 'dummy');
  play(game, 'chaosStaff', { soldierId: m.soldierId });
  game.endTurn();
  const f = play(game, 'post'); f.position = 2; m.position = 1;
  f.attachment = { element: 'water', turns: 2, from: null };
  game.endTurn();
  const r = ofType(log, 'reactionTriggered');
  assert.equal(r.length, 1);
  assert.equal(r[0].chaos, true);
});
