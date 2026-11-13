// STEP 1 のルールと「ロジックとUIの約束」（CLAUDE.md）を確かめるテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { loadJson, seededRng, recordEvents } from './helpers.js';

function newGame(rulesPatch = {}, cardsPatch = {}) {
  const cards = { ...loadJson('cards.json'), ...cardsPatch };
  const rules = { ...loadJson('rules.json'), ...rulesPatch };
  return new Game({ cards, rules, rng: seededRng(1) });
}

/** 手札と山札を決めて始める。log は start() 以降の全イベント */
function setup({ p1 = [], p2 = [], deck = [], rules = {}, cards = {} } = {}) {
  const game = newGame(rules, cards);
  game.debugSetHand('p1', p1);
  game.debugSetHand('p2', p2);
  game.debugSetDeck(deck);
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  return { game, log };
}

const types = (log) => log.map((e) => e.event);
const handId = (game, pid, type) => game.getState(pid).players[pid].hand.find((c) => c.type === type).cardId;
const play = (game, type) => game.playCard(handId(game, game.currentPlayer, type));

test('new Game: 初期手札が配られ、phase は ready、turn は 0', () => {
  const game = newGame();
  const s = game.getState('p1');
  assert.equal(s.phase, 'ready');
  assert.equal(s.turn, 0);
  assert.equal(s.players.p1.hand.length, 5);
  assert.equal(s.players.p2.hand, null);
  assert.equal(s.players.p2.handCount, 5);
  assert.equal(s.players.p1.castleHp, 25);
  assert.equal(s.players.p2.castleHp, 27);
  assert.equal(s.players.p2.castleMaxHp, 27);
  assert.equal(s.deckCount, 34 - 10);
});

test('new Game: データの間違いは例外（どこが悪いかを書く）', () => {
  const cards = loadJson('cards.json');
  const rules = loadJson('rules.json');
  assert.throws(() => new Game({ cards, rules: { ...rules, castleMaxHp: 0 } }), /castleMaxHp/);
  assert.throws(() => new Game({ cards: { ...cards, x: { name: 'x', kind: 'nope', count: 1 } }, rules }), /"x"/);
  assert.throws(() => new Game({ cards, rules, rng: 3 }), /rng/);
});

test('同じシードなら同じ山札になる', () => {
  const a = newGame().getState('p1').players.p1.hand;
  const b = newGame().getState('p1').players.p1.hand;
  assert.deepEqual(a, b);
});

test('getState(null) は両方の手札が null', () => {
  const s = newGame().getState(null);
  assert.equal(s.players.p1.hand, null);
  assert.equal(s.players.p2.hand, null);
});

test('start: turnStarted → cardDrawn（先攻も firstTurnDraw 枚）', () => {
  const { game, log } = setup({ deck: ['infantry', 'knight', 'heal'] });
  assert.deepEqual(types(log), ['turnStarted', 'cardDrawn']);
  assert.equal(log[1].cardIds.length, 1);
  assert.equal(game.getState('p1').phase, 'main');
  assert.deepEqual(game.start(), { ok: false, reason: 'ゲームはもう始まっています' });
});

test('1ターンに2枚は出せない。相手の番には出せない', () => {
  const { game } = setup({ p1: ['infantry', 'infantry'], p2: ['infantry'], deck: ['heal', 'heal'] });
  assert.equal(play(game, 'infantry').ok, true);
  const second = game.canPlayCard(handId(game, 'p1', 'infantry'));
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'このターンはもうカードを出しました');
  const p2card = game.getState('p2').players.p2.hand[0].cardId;
  assert.equal(game.playCard(p2card).reason, 'あなたの番ではありません');
});

test('出しても何も起きないカードは出せない（サンダー・満タンのヒール）', () => {
  const { game } = setup({ p1: ['thunder', 'heal'], deck: ['heal'] });
  assert.equal(game.canPlayCard(handId(game, 'p1', 'thunder')).reason, '道の上に相手の兵士がいません');
  assert.equal(game.canPlayCard(handId(game, 'p1', 'heal')).reason, '城のHPが満タンです');
});

test('兵士は位置0に出て、そのターンは動かない。次のターンから speed マス進む', () => {
  const { game, log } = setup({ p1: ['infantry'], deck: ['heal', 'heal', 'heal'] });
  play(game, 'infantry');
  assert.deepEqual(types(log).slice(-2), ['cardPlayed', 'soldierDeployed']);
  assert.equal(game.getState('p1').players.p1.soldiers[0].position, 0);
  game.endTurn(); // p2
  game.endTurn(); // p1
  const moved = log.filter((e) => e.event === 'soldierMoved');
  assert.deepEqual(moved.map(({ from, to }) => [from, to]), [[0, 2]]);
});

test('歩兵は 2→4→城 で着き、castleDamaged → soldierDestroyed(reachedCastle)', () => {
  const { game, log } = setup({ p1: ['infantry'], deck: Array(10).fill('heal') });
  play(game, 'infantry');
  for (let i = 0; i < 6; i++) game.endTurn();
  const tail = log.filter((e) => ['soldierMoved', 'castleDamaged', 'soldierDestroyed'].includes(e.event));
  assert.deepEqual(tail.map((e) => e.event), ['soldierMoved', 'soldierMoved', 'soldierMoved', 'castleDamaged', 'soldierDestroyed']);
  assert.equal(tail[2].to, 5); // laneLength にそろえる
  assert.equal(tail[3].amount, 3);
  assert.deepEqual(tail[3].source, { kind: 'soldier', soldierId: tail[0].soldierId });
  assert.equal(tail[4].reason, 'reachedCastle');
  assert.equal(game.getState('p2').players.p2.castleHp, 24);
});

test('正面からぶつかる：止まって戦う。square は攻める側が止まったマス', () => {
  // p1 騎士（HP4・攻5）、p2 歩兵（HP5・攻3）
  const { game, log } = setup({ p1: ['knight'], p2: ['infantry'], deck: Array(10).fill('heal') });
  play(game, 'knight');
  game.endTurn();
  play(game, 'infantry'); // p2 歩兵は道のマス4
  game.endTurn(); // p1 騎士：0→3 で、1つ先（マス4）に歩兵 → 戦う
  const i = log.findIndex((e) => e.event === 'soldiersClashed');
  const seq = log.slice(i - 1, i + 4);
  assert.deepEqual(types(seq), ['soldierMoved', 'soldiersClashed', 'soldierDamaged', 'soldierDamaged', 'soldierDestroyed']);
  assert.deepEqual([seq[0].from, seq[0].to], [0, 3]);
  assert.equal(seq[1].square, 3);
  assert.equal(seq[1].attacker.playerId, 'p1');
  assert.equal(seq[2].playerId, 'p2'); // 守る側が先
  assert.equal(seq[2].hp, 0);
  assert.equal(seq[3].playerId, 'p1');
  assert.equal(seq[3].hp, 1);
  assert.equal(seq[4].playerId, 'p2');
  // 相手だけ消えても、そのターンはその場で止まる
  assert.equal(game.getState('p1').players.p1.soldiers[0].position, 3);
});

test('両方消えるときの soldierDestroyed は 守る側 → 攻める側', () => {
  const { game, log } = setup({ p1: ['knight'], p2: ['knight'], deck: Array(10).fill('heal') });
  play(game, 'knight');
  game.endTurn();
  play(game, 'knight');
  game.endTurn();
  const destroyed = log.filter((e) => e.event === 'soldierDestroyed');
  assert.deepEqual(destroyed.map((e) => [e.playerId, e.reason]), [['p2', 'killed'], ['p1', 'killed']]);
});

test('出した位置に相手がいても出せる。出したときは戦わず、次の進軍で動かずに戦う', () => {
  const { game, log } = setup({ p1: ['infantry'], p2: ['infantry'], deck: Array(20).fill('heal') });
  play(game, 'infantry');
  game.endTurn(); game.endTurn(); // p1 0→2
  game.endTurn(); game.endTurn(); // p1 2→4（相手の城の前）
  assert.equal(game.getState('p1').players.p1.soldiers[0].position, 4);
  assert.equal(game.currentPlayer, 'p1');
  game.endTurn(); // p2
  const before = log.length;
  play(game, 'infantry'); // p2 の兵士は道のマス4。p1 と同じマス
  assert.ok(!types(log.slice(before)).includes('soldiersClashed'));
  game.endTurn(); // p1：動かずに戦う
  const after = log.slice(before);
  const i = after.findIndex((e) => e.event === 'soldiersClashed');
  assert.notEqual(after[i - 1].event, 'soldierMoved');
  assert.equal(after[i].square, 4);
});

test('findClashTarget：同じマスと1つ先に相手が1体ずつ → 先に出された方', () => {
  const { game } = setup({ p1: ['infantry'], p2: ['infantry', 'infantry'], deck: Array(20).fill('heal') });
  play(game, 'infantry');
  game.endTurn();
  play(game, 'infantry');
  game.endTurn(); game.endTurn();
  play(game, 'infantry');
  const [first, second] = game.players.p2.soldiers;
  const me = game.players.p1.soldiers[0];
  me.position = 1;
  first.position = 2; // 道のマス2（1つ先）
  second.position = 3; // 道のマス1（同じマス）
  assert.equal(game.findClashTarget(me, game.players.p2), first);
  first.position = 1; // 道のマス3（範囲外）
  assert.equal(game.findClashTarget(me, game.players.p2), second);
});

test('ファイアボール：spellCast → castleDamaged（source は spell）', () => {
  const { game, log } = setup({ p1: ['fireball'], deck: ['heal'] });
  play(game, 'fireball');
  const tail = log.slice(-3);
  assert.deepEqual(types(tail), ['cardPlayed', 'spellCast', 'castleDamaged']);
  assert.equal(tail[1].target, 'p2');
  assert.deepEqual(tail[2].source, { kind: 'spell', type: 'fireball' });
  assert.equal(tail[2].hp, 19);
});

test('サンダー：相手の兵士1体ずつ soldierDamaged →（0なら）soldierDestroyed', () => {
  const { game, log } = setup({ p1: ['thunder'], p2: ['knight', 'infantry'], deck: Array(10).fill('heal') });
  game.endTurn();
  play(game, 'knight');
  game.endTurn(); game.endTurn();
  play(game, 'infantry');
  game.endTurn();
  const before = log.length;
  play(game, 'thunder');
  const tail = log.slice(before);
  assert.deepEqual(types(tail), ['cardPlayed', 'spellCast', 'soldierDamaged', 'soldierDamaged']);
  // 騎士 HP4 → 1、歩兵 HP5 → 2（サンダーに耐える）
  assert.deepEqual(tail.slice(2).map((e) => e.hp), [1, 2]);
});

test('ヒール：実際に増えたぶんだけ amount に入り、使い切り置き場へ行く', () => {
  const { game, log } = setup({ p1: ['heal'], deck: ['infantry'] });
  game.debugSetCastleHp('p1', 20);
  play(game, 'heal');
  const healed = log.find((e) => e.event === 'castleHealed');
  assert.deepEqual([healed.amount, healed.hp], [5, 25]);
  const s = game.getState('p1');
  assert.equal(s.exhaustedCount, 1);
  assert.equal(s.discardCount, 0);
});

test('手札が上限を超えたら discard。枚数ちょうどでないとだめ。捨てたら次の人の番', () => {
  const hand = Array(9).fill('infantry');
  const { game, log } = setup({ p1: hand, deck: Array(5).fill('heal') });
  // 9 + 1 = 10 枚 → 2枚捨てる
  game.endTurn();
  assert.equal(game.getState('p1').phase, 'discard');
  assert.deepEqual(log.at(-1), { event: 'discardRequired', playerId: 'p1', count: 2 });
  const ids = game.getState('p1').players.p1.hand.map((c) => c.cardId);
  assert.equal(game.discard([ids[0]]).ok, false);
  assert.equal(game.discard([ids[0], ids[0]]).ok, false);
  assert.equal(game.discard([ids[0], 'zzz']).ok, false);
  assert.equal(game.endTurn().ok, false);
  assert.equal(game.canPlayCard(ids[0]).ok, false);
  assert.equal(game.discard([ids[0], ids[1]]).ok, true);
  const i = log.findIndex((e) => e.event === 'cardDiscarded');
  assert.equal(log[i + 1].event, 'turnStarted');
  assert.equal(log[i + 1].playerId, 'p2');
});

test('山札が尽きたら捨て札を切り直す。両方空なら引かない', () => {
  const { game, log } = setup({ p1: ['infantry'], deck: [] });
  // 山札0・捨て札0 → 引かない（cardDrawn も出さない）
  assert.deepEqual(types(log), ['turnStarted']);
  play(game, 'infantry'); // 捨て札1
  game.endTurn();
  assert.deepEqual(types(log).slice(-3), ['turnStarted', 'deckShuffled', 'cardDrawn']);
  assert.equal(log.at(-2).deckCount, 1);
});

test('城HPが0以下になったら gameOver。そのあとの操作はすべて ok:false', () => {
  const { game, log } = setup({ p1: ['fireball'], deck: ['heal'] });
  game.debugSetCastleHp('p2', 3);
  play(game, 'fireball');
  assert.equal(log.at(-1).event, 'gameOver');
  assert.equal(log.at(-1).winner, 'p1');
  const castle = log.at(-2);
  assert.equal(castle.amount, 8); // 値そのまま
  assert.equal(castle.hp, 0); // 0未満にならない
  assert.equal(game.endTurn().ok, false);
  assert.equal(game.debugSetCastleHp('p1', 3).ok, false);
  assert.equal(log.filter((e) => e.event === 'gameOver').length, 1);
});

test('進軍の途中で城が落ちたら、残りの兵士は動かない', () => {
  const { game, log } = setup({ p1: ['knight', 'knight'], deck: Array(10).fill('heal') });
  play(game, 'knight');
  game.endTurn(); game.endTurn(); // 1体目 0→3
  play(game, 'knight');
  game.endTurn();
  game.debugSetCastleHp('p2', 5);
  game.endTurn(); // 1体目が城に着いて落ちる。2体目は動かない
  const tail = log.slice(log.findLastIndex((e) => e.event === 'turnStarted'));
  assert.deepEqual(types(tail).slice(-4), ['soldierMoved', 'castleDamaged', 'soldierDestroyed', 'gameOver']);
});

test('on / off：表にないイベントは ok:false。handler の例外でも止まらない', () => {
  const game = newGame();
  assert.equal(game.on('nope', () => {}).ok, false);
  const origError = console.error;
  console.error = () => {};
  try {
    game.on('turnStarted', () => { throw new Error('boom'); });
    assert.equal(game.start().ok, true);
  } finally {
    console.error = origError;
  }
  assert.equal(game.getState('p1').phase, 'main');
});

test('デバッグ：範囲外の値は ok:false', () => {
  const game = newGame();
  assert.equal(game.debugSetCastleHp('p1', 0).ok, false);
  assert.equal(game.debugSetCastleHp('p2', 28).ok, false);
  assert.equal(game.debugSetCastleHp('p2', 27).ok, true);
  assert.equal(game.debugSetHand('p1', ['dragon']).ok, false);
  assert.equal(game.debugSetDeck('x').ok, false);
});
