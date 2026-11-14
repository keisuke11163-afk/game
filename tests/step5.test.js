// STEP 5（人数・勝利条件・城の種類・デッキ対戦）のテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { loadFixture, seededRng, recordEvents } from './helpers.js';

const CASTLES = {
  standard: { name: 'ふつうの城' },
  fortress: { name: 'とりで', hpBonus: 8, maxHandBonus: -2 },
  tower: { name: '魔法の塔', hpBonus: -5, castleSpellBonus: 3 },
  barracks: { name: '兵舎', hpBonus: -4, soldierAttackBonus: 1 },
};
const DECKS = {
  aggro: { name: '攻め', cards: { knight: 6, fireball: 4 } },
  guard: { name: '守り', cards: { infantry: 6, heal: 4 } },
};

function make({ rules = {}, setup, castles = CASTLES, decks = DECKS, seed = 1 } = {}) {
  const cards = loadFixture('cards-step2.json');
  const r = { ...loadFixture('rules.json'), ...rules };
  const game = new Game({ cards, rules: r, rng: seededRng(seed), castles, decks, setup });
  const log = recordEvents(game, EVENT_TYPES);
  return { game, log };
}
const idOf = (game, type) => {
  const pid = game.currentPlayer;
  return game.getState(pid).players[pid].hand.find((c) => c.type === type).cardId;
};
const events = (log) => log.map((e) => e.event);

test('人数：playerCount で p1〜pN。道は輪。席ごとの城ボーナス', () => {
  const { game } = make({ rules: { playerCount: 4, secondPlayerCastleBonus: 3 } });
  const s = game.getState(null);
  assert.deepEqual(s.playerOrder, ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(s.roads.map((r) => r.roadId), ['p1-p2', 'p2-p3', 'p3-p4', 'p1-p4']);
  assert.deepEqual(s.playerOrder.map((id) => s.players[id].castleMaxHp), [25, 26, 27, 28]);
  const g8 = make({ rules: { playerCount: 8, seatCastleBonus: [0, 0, 1, 1, 2, 2, 3, 3] } }).game;
  assert.deepEqual(g8.getState(null).playerOrder.map((id) => g8.getState(null).players[id].castleMaxHp), [25, 25, 26, 26, 27, 27, 28, 28]);
  assert.throws(() => make({ rules: { playerCount: 9 } }), /playerCount/);
  assert.throws(() => make({ rules: { playerCount: 3, seatCastleBonus: [0, 1] } }), /seatCastleBonus/);
});

test('firstDestroy（省略したとき）：どこかの城を落とした人の勝ち。reason は castleDestroyed', () => {
  const { game, log } = make({ rules: { playerCount: 3 } });
  game.debugSetHand('p1', ['fireball']);
  game.debugSetCastleHp('p3', 3);
  game.start();
  game.playCard(idOf(game, 'fireball'), { playerId: 'p3' });
  assert.deepEqual(log.at(-1), { event: 'gameOver', winner: 'p1', reason: 'castleDestroyed' });
});

test('castleSpellRange "neighbors"：4人ならとなりの2人だけ。"any" なら全員', () => {
  const near = make({ rules: { playerCount: 4, castleSpellRange: 'neighbors' } }).game;
  near.debugSetHand('p1', ['fireball']);
  near.start();
  assert.deepEqual(near.getTargets(idOf(near, 'fireball')), [{ playerId: 'p2' }, { playerId: 'p4' }]);
  const any = make({ rules: { playerCount: 4, castleSpellRange: 'any' } }).game;
  any.debugSetHand('p1', ['fireball']);
  any.start();
  assert.equal(any.getTargets(idOf(any, 'fireball')).length, 3);
});

test('lastStanding：城が落ちた人は抜け、道がつなぎ直される。残り1人で勝ち', () => {
  const { game, log } = make({ rules: { playerCount: 3, winCondition: 'lastStanding' } });
  game.debugSetHand('p1', ['fireball', 'knight']);
  game.debugSetHand('p2', ['infantry']);
  game.debugSetHand('p3', ['fireball']);
  game.debugSetDeck(Array(20).fill('heal'));
  game.start();
  game.playCard(idOf(game, 'knight'), { playerId: 'p2' }); // 道 p1-p2
  game.endTurn();
  game.playCard(idOf(game, 'infantry'), { playerId: 'p3' }); // 道 p2-p3
  game.endTurn();
  game.debugSetCastleHp('p2', 3);
  game.playCard(idOf(game, 'fireball'), { playerId: 'p2' });
  const i = log.findIndex((e) => e.event === 'playerEliminated');
  assert.deepEqual(log[i], { event: 'playerEliminated', playerId: 'p2', by: 'p3' });
  const after = events(log).slice(i);
  assert.deepEqual(after, ['playerEliminated', 'soldierDestroyed', 'roadClosed', 'soldierDestroyed', 'roadClosed']);
  assert.equal(log[i + 1].reason, 'eliminated');
  assert.equal(log[i + 3].reason, 'roadClosed');
  const s = game.getState(null);
  assert.equal(s.players.p2.eliminated, true);
  assert.equal(s.players.p2.handCount, 0);
  assert.deepEqual(s.roads.map((r) => r.roadId), ['p1-p3']); // p1-p3 はもとからある道
  assert.equal(s.phase, 'main');
  game.endTurn(); // p2 は飛ばして p1
  assert.equal(game.getState(null).currentPlayer, 'p1');
  game.debugSetCastleHp('p3', 3);
  game.debugSetHand('p1', ['fireball']);
  game.playCard(idOf(game, 'fireball'), { playerId: 'p3' });
  assert.deepEqual(log.at(-1), { event: 'gameOver', winner: 'p1', reason: 'lastStanding' });
});

test('lastStanding（4人）：抜けた人の両どなりに新しい道ができる（roadOpened）', () => {
  const { game, log } = make({ rules: { playerCount: 4, winCondition: 'lastStanding', castleSpellRange: 'any' } });
  game.debugSetHand('p1', ['fireball']);
  game.debugSetCastleHp('p3', 3);
  game.start();
  game.playCard(idOf(game, 'fireball'), { playerId: 'p3' });
  const opened = log.find((e) => e.event === 'roadOpened');
  assert.deepEqual(opened, { event: 'roadOpened', roadId: 'p2-p4', players: ['p2', 'p4'] });
  assert.deepEqual(game.getState(null).roads.map((r) => r.roadId), ['p1-p2', 'p2-p4', 'p1-p4']);
});

test('周回の上限：城HPの割合 → 城HP → 席順が後ろ の順で勝ち（reason は roundLimit）', () => {
  const { game, log } = make({ rules: { maxRounds: 2 } });
  game.start();
  game.debugSetCastleHp('p1', 20); // 20/25 = 0.8、p2 は 27/27
  for (let i = 0; i < 4; i++) game.endTurn();
  assert.deepEqual(log.at(-1), { event: 'gameOver', winner: 'p2', reason: 'roundLimit' });
  assert.equal(game.getState(null).round, 2);
  // 同じ割合・同じHPなら、席順が後ろの人
  const tie = make({ rules: { maxRounds: 1, secondPlayerCastleBonus: 0 } });
  tie.game.start();
  tie.game.endTurn(); tie.game.endTurn();
  assert.equal(tie.log.at(-1).winner, 'p2');
});

test('城の種類：HP・手札の上限・城への魔法・兵士の攻撃', () => {
  const { game, log } = make({ rules: { secondPlayerCastleBonus: 0 }, setup: { castles: ['tower', 'fortress'] } });
  const s = game.getState(null);
  assert.deepEqual([s.players.p1.castleType, s.players.p1.castleMaxHp, s.players.p2.castleMaxHp], ['tower', 20, 33]);
  assert.equal(s.players.p2.maxHand, 6);
  game.debugSetHand('p1', ['fireball']);
  game.start();
  game.playCard(idOf(game, 'fireball'));
  assert.equal(log.find((e) => e.event === 'castleDamaged').amount, 11);
  const b = make({ setup: { castles: ['barracks', 'standard'] } }).game;
  b.debugSetHand('p1', ['infantry']);
  b.start();
  b.playCard(idOf(b, 'infantry'));
  assert.equal(b.getState(null).players.p1.soldiers[0].attack, 4);
  assert.throws(() => make({ setup: { castles: ['moon', 'standard'] } }), /moon/);
  assert.throws(() => make({ setup: { castles: ['standard'] } }), /人数ぶん/);
  assert.throws(() => make({ castles: { x: { name: 'x', hpBonus: 'a' } } }), /hpBonus/);
});

test('デッキ対戦（own）：1人1つの山札。state は自分の山札の数と、それぞれの数', () => {
  const { game } = make({ rules: { deckMode: 'own' }, setup: { decks: ['aggro', 'guard'] } });
  const s1 = game.getState('p1');
  assert.equal(s1.deckMode, 'own');
  assert.ok(s1.players.p1.hand.every((c) => ['knight', 'fireball'].includes(c.type)));
  assert.ok(game.getState('p2').players.p2.hand.every((c) => ['infantry', 'heal'].includes(c.type)));
  assert.equal(s1.deckCount, 10 - 5);
  assert.equal(s1.players.p2.deckCount, 10 - 5);
  assert.equal(game.getState(null).deckCount, null);
  assert.equal(game.getState(null).players.p1.deckId, 'aggro');
  const shared = make().game.getState(null);
  assert.equal(shared.players.p1.deckCount, null);
  assert.throws(() => make({ rules: { deckMode: 'own' }, decks: null }), /decks/);
  assert.throws(() => make({ decks: { x: { name: 'x', cards: { dragon: 1 } } } }), /dragon/);
});

test('デッキ対戦（own）：自分の山札が尽きたら自分の捨て札を切り直す（deckShuffled に playerId）', () => {
  const { game, log } = make({ rules: { deckMode: 'own' }, setup: { decks: ['aggro', 'guard'] } });
  game.debugSetDeck([], 'p1');
  game.debugSetHand('p1', ['knight']);
  game.start();
  game.playCard(idOf(game, 'knight'));
  game.endTurn(); game.endTurn();
  const sh = log.find((e) => e.event === 'deckShuffled');
  assert.deepEqual(sh, { event: 'deckShuffled', deckCount: 1, playerId: 'p1' });
});

test('lastStanding：進軍中に兵士が城を落として人が抜けても、残りの兵士の進軍は続く（閉じた道の自分の兵士は消える）', () => {
  const { game, log } = make({ rules: { playerCount: 3, winCondition: 'lastStanding' } });
  game.debugSetHand('p1', ['knight', 'knight']);
  game.debugSetDeck(Array(30).fill('heal'));
  game.start();
  game.playCard(idOf(game, 'knight'), { playerId: 'p2' }); // 道 p1-p2
  game.endTurn(); game.endTurn(); game.endTurn();
  game.playCard(idOf(game, 'knight'), { playerId: 'p3' }); // 道 p1-p3
  game.endTurn(); game.endTurn();
  game.debugSetCastleHp('p2', 1);
  game.endTurn(); // p1：1体目が p2 の城に着いて p2 が抜ける。2体目（p1-p3）は進む
  const i = log.findIndex((e) => e.event === 'playerEliminated');
  assert.equal(log[i - 1].reason, 'reachedCastle');
  assert.equal(game.getState(null).phase, 'main');
  assert.ok(log.slice(i).some((e) => e.event === 'soldierMoved'));
});

test('とりでは手札の上限が少ないので、捨てる枚数が変わる。デッキ対戦では捨てたカードはその人の捨て札へ', () => {
  const { game, log } = make({ rules: { deckMode: 'own' }, setup: { castles: ['fortress', 'standard'], decks: ['aggro', 'guard'] } });
  game.debugSetHand('p1', Array(7).fill('infantry'));
  game.start(); // 1枚引いて8枚。上限6なので2枚捨てる
  game.endTurn();
  assert.equal(log.at(-1).count, 2);
  const ids = game.getState('p1').players.p1.hand.slice(0, 2).map((c) => c.cardId);
  game.discard(ids);
  const s = game.getState(null);
  assert.equal(s.players.p1.discardCount, 2);
  assert.equal(s.players.p2.discardCount, 0);
});

test('setup の間違い：null は省略と同じ。shared で decks を渡したら例外。ボーナスがマイナスなら例外', () => {
  assert.doesNotThrow(() => make({ setup: null }));
  assert.throws(() => make({ setup: { decks: ['assault', 'balanced'] } }), /deckMode/);
  assert.throws(() => make({ castles: { x: { name: 'x', castleSpellBonus: -1 } } }), /castleSpellBonus/);
});

test('（試作）lastStanding で手番の人が魔物に城を落とされたら抜けて、同じ周回のまま次の人の番', () => {
  const cards = loadFixture('cards-step2.json');
  const monsters = { slime: { name: 'スライム', hp: 30, attack: 1, element: 'water', reward: 2, castleAttack: 5, attackEvery: 1, weight: 1 } };
  const rules = { ...loadFixture('rules.json'), playerCount: 3, winCondition: 'lastStanding', monsterFirstRound: 1, monsterSpawnChance: 1 };
  const game = new Game({ cards, rules, rng: () => 0, monsters });
  const log = recordEvents(game, EVENT_TYPES);
  game.debugSetCastleHp('p1', 1);
  game.start(); // 1周目：魔物が出る（rng 0：p1-p2 の道の魔物は p1 を攻める）
  game.endTurn(); game.endTurn(); game.endTurn(); // 2周目の始め：p1 の城が落ちる
  assert.ok(game.getState(null).players.p1.eliminated);
  assert.equal(game.getState(null).phase, 'main');
  assert.equal(game.getState(null).currentPlayer, 'p2');
  assert.equal(log.filter((e) => e.event === 'roundStarted').length, 2);
});
