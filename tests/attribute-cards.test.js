// 属性の武器・魔法のカード（氷の刃・雷の斧、火炎弾・水流・突風・地鳴り・氷の礫・雷撃）で、付着と反応が実際に起きるか。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { loadJson, seededRng, recordEvents, PLAIN_START } from './helpers.js';

const CARDS = loadJson('cards.json');
const REACTIONS = loadJson('reactions.json');
const ofType = (log, t) => log.filter((e) => e.event === t);
const SPELLS = { flameBolt: 'fire', waterJet: 'water', gust: 'wind', tremor: 'earth', iceShard: 'ice', sparkBolt: 'thunder' };
const WEAPONS = { iceBlade: 'ice', thunderAxe: 'thunder' };

function newGame(rules = {}) {
  const cards = { ...CARDS, post: { name: '杭', kind: 'soldier', hp: 100, attack: 1, speed: 1, count: 1 },
    dummy: { name: '木人', kind: 'soldier', hp: 100, attack: 1, speed: 3, count: 1 } };
  const game = new Game({ cards, rules: { ...loadJson('rules.json'), ...PLAIN_START, laneLength: 5, laneCount: 1, defenseReaction: false, ...rules }, reactions: REACTIONS, rng: seededRng(1) });
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
/** p2 が杭を置いて、p1 の番に戻す */
function foeSetup(game) {
  game.endTurn();
  const s = play(game, 'post'); s.position = 1;
  game.endTurn();
  return s;
}

test('新カードのデータ：cards.json が new Game を通り、属性・合成先が決まりどおり', () => {
  newGame();
  for (const [k, el] of Object.entries(SPELLS)) {
    const c = CARDS[k];
    assert.equal(c.element, el); assert.equal(c.effect, 'damageEnemySoldiers'); assert.equal(c.scope, 'lane');
    assert.equal(c.amount, 2); assert.equal(c.rarity, 'common'); assert.equal(c.fuseTo, 'thunder');
    assert.ok(c.amount < CARDS.thunder.amount, 'サンダーより弱い');
  }
  for (const [k, el] of Object.entries(WEAPONS)) {
    assert.equal(CARDS[k].kind, 'weapon'); assert.equal(CARDS[k].element, el);
    assert.equal(CARDS[k].attackBonus, CARDS.flameSword.attackBonus); assert.equal(CARDS[k].fuseTo, 'ironSword');
  }
});

test('属性魔法が兵士に当たると、その属性が付着する（3ターン）', () => {
  for (const [k, el] of Object.entries(SPELLS)) {
    const { game } = newGame();
    const foe = foeSetup(game);
    play(game, k, undefined);
    assert.equal(foe.attachment?.element, el, k);
    assert.equal(foe.attachment.turns, 3, '付着は3ターン');
  }
});

test('水流のあとに火炎弾→蒸発（別の魔法で反応）。1ターン1回の制限で2回目は反応しない', () => {
  const { game, log } = newGame();
  const foe = foeSetup(game);
  const t = undefined;
  play(game, 'waterJet', t);
  play(game, 'flameBolt', t);
  const r = ofType(log, 'reactionTriggered');
  assert.equal(r.length, 1);
  assert.equal(r[0].reaction, 'evaporate');
  assert.equal(game.players.p1.reactionsThisTurn, 1);
  // 付着は消えた。もう一度水流→火炎弾でも、同じターンの2回目は反応しない（付着を上書きするだけ）
  play(game, 'waterJet', t);
  play(game, 'flameBolt', t);
  assert.equal(ofType(log, 'reactionTriggered').length, 1);
  assert.equal(foe.attachment.element, 'fire');
});

test('水流のあとに雷撃→感電、氷の礫のあとに水流→凍結', () => {
  let { game, log } = newGame();
  let foe = foeSetup(game);
  let t = undefined;
  play(game, 'waterJet', t); play(game, 'sparkBolt', t);
  assert.equal(ofType(log, 'reactionTriggered')[0].reaction, 'shock');
  ({ game, log } = newGame());
  foe = foeSetup(game);
  t = undefined;
  play(game, 'iceShard', t); play(game, 'waterJet', t);
  assert.equal(ofType(log, 'reactionTriggered')[0].reaction, 'freeze');
  assert.equal(foe.frozen > 0, true);
});

test('氷の刃・雷の斧を持った兵士の戦いでも付着が起き、水流のあとの雷の斧→感電', () => {
  for (const [w, el] of Object.entries(WEAPONS)) {
    const { game } = newGame();
    const m = play(game, 'dummy');
    play(game, w, { soldierId: m.soldierId });
    assert.equal(m.element, el);
    game.endTurn();
    const f = play(game, 'post');
    f.position = 2; m.position = 1; // p1 から数えて 1、p2 の兵士は p1 から数えて 2（1つ先）
    game.endTurn();
    assert.equal(f.attachment?.element, el, `${w} の攻撃で付着`);
  }
  const { game, log } = newGame();
  const m = play(game, 'dummy');
  play(game, 'thunderAxe', { soldierId: m.soldierId });
  game.endTurn();
  const f = play(game, 'post'); f.position = 2; m.position = 1;
  f.attachment = { element: 'water', turns: 2, from: null };
  game.endTurn();
  assert.equal(ofType(log, 'reactionTriggered').at(0)?.reaction, 'shock');
});

test('付着は3ターン残る：相手のターンの終わりを2回越えても残り、3回目で消える', () => {
  const { game } = newGame();
  const foe = foeSetup(game);
  play(game, 'flameBolt', undefined);
  assert.equal(foe.attachment.turns, 3);
  game.endTurn(); game.endTurn(); // p1 → p2：p2 の番の終わりで 2
  assert.equal(foe.attachment.turns, 2);
  game.endTurn(); game.endTurn();
  assert.equal(foe.attachment.turns, 1);
  game.endTurn(); game.endTurn();
  assert.equal(foe.attachment, null);
});
