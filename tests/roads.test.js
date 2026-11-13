// 何人でも扱える土台（道・対象の選び方・カードID）のテスト。2人のときは STEP 1 と同じに動く。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { buildData, seededRng, recordEvents } from './helpers.js';

function setup({ p1 = [], p2 = [], deck = [] } = {}) {
  const { cards, rules } = buildData({ source: 'fixture' });
  const game = new Game({ cards, rules, rng: seededRng(1) });
  game.debugSetHand('p1', p1);
  game.debugSetHand('p2', p2);
  game.debugSetDeck(deck);
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  return { game, log };
}
const idOf = (game, pid, type) => game.getState(pid).players[pid].hand.find((c) => c.type === type).cardId;

test('getState に playerOrder と roads が入る。2人なら道は1本', () => {
  const { game } = setup();
  const s = game.getState(null);
  assert.deepEqual(s.playerOrder, ['p1', 'p2']);
  assert.deepEqual(s.roads, [{ roadId: 'p1-p2', players: ['p1', 'p2'], length: 5 }]);
  assert.equal(s.players.p1.eliminated, false);
});

test('兵士は roadId と targetId を持ち、イベントにも入る', () => {
  const { game, log } = setup({ p1: ['knight'], p2: ['infantry'], deck: Array(10).fill('heal') });
  game.playCard(idOf(game, 'p1', 'knight'));
  const dep = log.find((e) => e.event === 'soldierDeployed');
  assert.equal(dep.roadId, 'p1-p2');
  assert.equal(dep.targetId, 'p2');
  assert.deepEqual(
    game.getState(null).players.p1.soldiers.map((s) => [s.roadId, s.targetId]),
    [['p1-p2', 'p2']],
  );
  game.endTurn();
  game.playCard(idOf(game, 'p2', 'infantry'));
  game.endTurn();
  assert.equal(log.find((e) => e.event === 'soldierMoved').roadId, 'p1-p2');
  assert.equal(log.find((e) => e.event === 'soldiersClashed').roadId, 'p1-p2');
});

test('getTargets：対象の一覧。出せないときは空', () => {
  const { game } = setup({ p1: ['fireball', 'infantry', 'heal', 'thunder'], p2: ['knight'], deck: Array(5).fill('heal') });
  assert.deepEqual(game.getTargets(idOf(game, 'p1', 'fireball')), [{ playerId: 'p2' }]);
  assert.deepEqual(game.getTargets(idOf(game, 'p1', 'infantry')), [{ playerId: 'p2' }]);
  assert.deepEqual(game.getTargets(idOf(game, 'p1', 'heal')), []); // 満タン
  assert.deepEqual(game.getTargets(idOf(game, 'p1', 'thunder')), []); // 相手の兵士なし
  assert.deepEqual(game.getTargets(game.getState('p2').players.p2.hand[0].cardId), []); // 相手の番
});

test('target を渡すとき：正しい対象なら出せる、違う対象なら ok:false', () => {
  const { game } = setup({ p1: ['fireball', 'fireball'], deck: ['heal'] });
  const [a] = game.getState('p1').players.p1.hand.map((c) => c.cardId);
  assert.equal(game.canPlayCard(a, { playerId: 'p1' }).reason, 'そこには出せません');
  assert.equal(game.canPlayCard(a, { playerId: 'p2', extra: 1 }).ok, false);
  assert.equal(game.canPlayCard(a, 'p2').ok, false);
  assert.deepEqual(game.canPlayCard(a, { playerId: 'p2' }), { ok: true });
  assert.equal(game.playCard(a, { playerId: 'p2' }).ok, true);
});

test('カードIDから種類が分からない（種類の順ではなく、シャッフルしたあとの順に振る）', () => {
  const { cards, rules } = buildData({ source: 'fixture' });
  const game = new Game({ cards, rules, rng: seededRng(5) });
  const s = game.getState('p1');
  // 初期手札（山札の先頭5枚）のIDは c01〜c05
  assert.deepEqual(s.players.p1.hand.map((c) => c.cardId), ['c01', 'c02', 'c03', 'c04', 'c05']);
  // c01〜c10 がすべて同じ種類、ということはない
  const types = new Set([...s.players.p1.hand, ...game.getState('p2').players.p2.hand].map((c) => c.type));
  assert.ok(types.size > 1);
});

test('roads は rebuildRoads で輪になる（3人以上の準備）', () => {
  const { game } = setup();
  // 内部の作りを確かめる：席を3人にして道を作り直す
  game.playerOrder = ['p1', 'p2', 'p3'];
  game.players.p3 = { id: 'p3', eliminated: false };
  const { opened, closed } = game.rebuildRoads();
  assert.deepEqual(game.roads.map((r) => r.roadId), ['p1-p2', 'p2-p3', 'p1-p3']);
  assert.deepEqual(opened.map((r) => r.roadId), ['p2-p3', 'p1-p3']);
  assert.equal(closed.length, 0);
  game.players.p2.eliminated = true;
  const r2 = game.rebuildRoads();
  assert.deepEqual(game.roads.map((r) => r.roadId), ['p1-p3']);
  assert.deepEqual(r2.closed.map((r) => r.roadId).sort(), ['p1-p2', 'p2-p3']);
  assert.equal(game.nextPlayerAfter('p1'), 'p3');
  assert.equal(game.nextPlayerAfter('p3'), 'p1');
});
