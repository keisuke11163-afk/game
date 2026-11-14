// ファイアボール頼みの問題の案（advanceAfterWin・soldierCastleDamageMultiplier）のテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { buildData, seededRng, recordEvents } from './helpers.js';

function setup({ p1 = [], p2 = [], deck = [], rules = {} } = {}) {
  const { cards, rules: r } = buildData({ rules, source: 'fixture' });
  const game = new Game({ cards, rules: r, rng: seededRng(1) });
  game.debugSetHand('p1', p1);
  game.debugSetHand('p2', p2);
  game.debugSetDeck(deck);
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  return { game, log };
}
const play = (game, type) =>
  game.playCard(game.getState(game.currentPlayer).players[game.currentPlayer].hand.find((c) => c.type === type).cardId);

test('省略すると今までどおり（勝っても止まる・城ダメージは攻撃力そのまま）', () => {
  const { game } = setup({ p1: ['knight'], p2: ['infantry'], deck: Array(10).fill('heal') });
  assert.equal(game.rules.advanceAfterWin, false);
  assert.equal(game.rules.soldierCastleDamageMultiplier, 1);
});

test('advanceAfterWin：相手だけ消えたら残りの歩数で進む', () => {
  // p1 騎士（攻5・速3）が、道のマス1にいる p2 の兵士（HP1）を倒して進み続ける
  const weak = { rules: { advanceAfterWin: true } };
  const { game, log } = setup({ p1: ['knight'], p2: ['infantry'], deck: Array(10).fill('heal'), ...weak });
  play(game, 'knight');
  game.endTurn();
  play(game, 'infantry');
  game.players.p2.soldiers[0].position = 3; // 道のマス1
  game.endTurn(); // p1 騎士：位置0、1つ先（マス1）に相手 → 動かずに戦う → 倒して3マス進む
  const tail = log.slice(log.findLastIndex((e) => e.event === 'turnStarted'));
  const seq = tail.filter((e) => e.event !== 'cardDrawn' && e.event !== 'roundStarted').map((e) => e.event);
  assert.deepEqual(seq, ['turnStarted', 'soldiersClashed', 'soldierDamaged', 'soldierDamaged', 'soldierDestroyed', 'soldierMoved']);
  const moved = tail.find((e) => e.event === 'soldierMoved');
  assert.deepEqual([moved.from, moved.to], [0, 3]);
});

test('advanceAfterWin：両方生き残ったら、そのターンは止まる', () => {
  const { cards, rules } = buildData({ rules: { advanceAfterWin: true }, source: 'fixture' });
  const game = new Game({ cards, rules, rng: seededRng(1) });
  game.debugSetHand('p1', ['infantry']);
  game.debugSetHand('p2', ['infantry']);
  game.debugSetDeck(Array(10).fill('heal'));
  game.start();
  play(game, 'infantry');
  game.endTurn();
  play(game, 'infantry');
  game.players.p2.soldiers[0].position = 3; // 道のマス1
  game.endTurn(); // 歩兵同士（HP5・攻3）は両方残る
  assert.equal(game.players.p1.soldiers[0].position, 0);
});

test('soldierCastleDamageMultiplier：城に着いた兵士は 攻撃力 × 倍率', () => {
  const { game, log } = setup({ p1: ['knight'], deck: Array(10).fill('heal'), rules: { soldierCastleDamageMultiplier: 3 } });
  play(game, 'knight');
  for (let i = 0; i < 4; i++) game.endTurn();
  const dmg = log.find((e) => e.event === 'castleDamaged');
  assert.equal(dmg.amount, 15);
  assert.equal(dmg.hp, 27 - 15);
});

test('rules の値が間違っていたら例外', () => {
  const { cards, rules } = buildData({ source: 'fixture' });
  assert.throws(() => new Game({ cards, rules: { ...rules, advanceAfterWin: 'yes' } }), /advanceAfterWin/);
  assert.throws(() => new Game({ cards, rules: { ...rules, soldierCastleDamageMultiplier: 0 } }), /soldierCastleDamageMultiplier/);
});
