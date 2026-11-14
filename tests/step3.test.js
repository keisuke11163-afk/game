// STEP 3（魔物とコイン）のテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { loadFixture, seededRng, recordEvents } from './helpers.js';

const MONSTERS = {
  slime: { name: 'スライム', hp: 4, attack: 1, element: 'water', reward: 2, castleAttack: 2, attackEvery: 2, weight: 1 },
};
const UPGRADES = {
  repair: { name: '修理', effect: 'repairCastle', amount: 6, cost: 3, limit: 1 },
  recruit: { name: '補充', effect: 'drawCards', amount: 1, cost: 2 },
  sharpen: { name: 'とぎ石', effect: 'sharpenSoldiers', amount: 1, cost: 4 },
};

/** 1周目から必ず魔物が出る設定で始める */
function setup({ p1 = [], p2 = [], deck = Array(40).fill('heal'), rules = {}, monsters = MONSTERS, start = true } = {}) {
  const cards = loadFixture('cards-step2.json');
  const r = { ...loadFixture('rules.json'), monsterFirstRound: 1, monsterSpawnChance: 1, ...rules };
  const game = new Game({ cards, rules: r, rng: seededRng(1), monsters, upgrades: UPGRADES });
  game.debugSetHand('p1', p1);
  game.debugSetHand('p2', p2);
  game.debugSetDeck(deck);
  const log = recordEvents(game, EVENT_TYPES);
  if (start) game.start();
  return { game, log };
}
const idOf = (game, type) => {
  const pid = game.currentPlayer;
  return game.getState(pid).players[pid].hand.find((c) => c.type === type).cardId;
};
const play = (game, type, target) => game.playCard(idOf(game, type), target);
const events = (log) => log.map((e) => e.event);

test('monsters を渡さなければ魔物は出ない。round は数える', () => {
  const cards = loadFixture('cards-step2.json');
  const rules = { ...loadFixture('rules.json'), monsterFirstRound: 1, monsterSpawnChance: 1 };
  const game = new Game({ cards, rules, rng: seededRng(1) });
  game.start();
  game.endTurn(); game.endTurn();
  const s = game.getState(null);
  assert.equal(s.round, 2);
  assert.deepEqual(s.monsters, []);
});

test('周回の始め：turnStarted → roundStarted → monsterAppeared（真ん中のマス）', () => {
  const { game, log } = setup();
  assert.deepEqual(events(log).slice(0, 3), ['turnStarted', 'roundStarted', 'monsterAppeared']);
  assert.deepEqual(log[2], { event: 'monsterAppeared', monsterId: 'm01', type: 'slime', roadId: 'p1-p2', square: 2, hp: 4, attack: 1, element: 'water' });
  const s = game.getState(null);
  assert.equal(s.monsters.length, 1);
  assert.equal(s.monsters[0].attackIn, 2);
  game.endTurn(); // p2 のターンは周回の始めではない
  assert.equal(game.getState(null).round, 1);
  game.endTurn();
  assert.equal(game.getState(null).monsters.length, 1); // 1本の道に1体まで
});

test('monsterFirstRound より前は出ない', () => {
  const { game } = setup({ rules: { monsterFirstRound: 3 } });
  assert.equal(game.getState(null).monsters.length, 0);
  for (let i = 0; i < 4; i++) game.endTurn();
  assert.equal(game.getState(null).round, 3);
  assert.equal(game.getState(null).monsters.length, 1);
});

test('兵士は真ん中の手前で止まって魔物と戦う。倒したらとどめボーナス', () => {
  const { game, log } = setup({ p1: ['knight'] });
  play(game, 'knight');
  game.endTurn(); game.endTurn(); // 騎士：0→1（1つ先の真ん中に魔物）で止まって戦う
  const i = log.findIndex((e) => e.event === 'monsterClashed');
  assert.deepEqual(events(log).slice(i - 1, i + 5), [
    'soldierMoved', 'monsterClashed', 'monsterDamaged', 'soldierDamaged', 'monsterDefeated', 'coinsChanged',
  ]);
  assert.deepEqual([log[i - 1].from, log[i - 1].to], [0, 1]);
  assert.equal(log[i].square, 1);
  assert.equal(log[i + 1].amount, 5);
  assert.deepEqual(log[i + 3], { event: 'monsterDefeated', monsterId: 'm01', playerId: 'p1', reward: 2 });
  assert.deepEqual(log[i + 4], { event: 'coinsChanged', playerId: 'p1', delta: 2, coins: 2, reason: 'reward' });
  const s = game.getState(null);
  assert.equal(s.players.p1.coins, 2);
  assert.equal(s.players.p1.soldiers[0].position, 1); // 倒してもそのターンは止まる
  assert.equal(s.players.p1.soldiers[0].hp, 3);
});

test('倒すまで先へは進めない（両方生き残ったら次の進軍でもまた戦う）', () => {
  const monsters = { rock: { name: 'いわ', hp: 20, attack: 1, reward: 1, castleAttack: 1, attackEvery: 9, weight: 1 } };
  const { game, log } = setup({ p1: ['infantry'], monsters });
  play(game, 'infantry');
  for (let i = 0; i < 6; i++) game.endTurn();
  assert.equal(game.getState(null).players.p1.soldiers[0].position, 1);
  assert.ok(log.filter((e) => e.event === 'monsterClashed').length >= 2);
});

test('ファイアボールで魔物を狙える。サンダーは魔物を狙えない', () => {
  const { game, log } = setup({ p1: ['fireball', 'thunder'] });
  const fb = idOf(game, 'fireball');
  assert.deepEqual(game.getTargets(fb), [{ playerId: 'p2' }, { monsterId: 'm01' }]);
  assert.deepEqual(game.canPlayCard(fb), { ok: true, needsTarget: true });
  assert.equal(game.canPlayCard(idOf(game, 'thunder'), { monsterId: 'm01' }).ok, false);
  game.playCard(fb, { monsterId: 'm01' });
  assert.deepEqual(events(log).slice(-5), ['cardPlayed', 'spellCast', 'monsterDamaged', 'monsterDefeated', 'coinsChanged']);
  assert.equal(log.at(-4).target, 'm01');
  assert.deepEqual(log.at(-3).by, { playerId: 'p1', type: 'fireball' });
});

test('放置すると attackEvery 周ごとに城を攻める。城を落としたら、落とされた方の負け', () => {
  const { game, log } = setup();
  game.debugSetCastleHp('p1', 1);
  game.debugSetCastleHp('p2', 1);
  for (let i = 0; i < 4; i++) game.endTurn(); // 3周目の始め（p1 のターン）に攻める（attackEvery 2）
  const atk = log.filter((e) => e.event === 'monsterAttackedCastle');
  assert.equal(atk.length, 1);
  assert.equal(atk[0].amount, 1);
  assert.equal(atk[0].hp, 0);
  const i = log.indexOf(atk[0]);
  assert.equal(log[i - 1].event, 'roundStarted');
  // そのあとは gameOver だけ（魔物の出現・ドロー・進軍はしない）
  assert.deepEqual(events(log.slice(i + 1)), ['gameOver']);
  const loser = atk[0].playerId;
  const st = game.getState(null);
  assert.equal(st.phase, 'gameOver');
  assert.equal(st.winner, loser === 'p1' ? 'p2' : 'p1');
  assert.equal(game.endTurn().ok, false);
});

test('手番の人（p1）の城が魔物に落とされたら、p2 の勝ち', () => {
  const { game, log } = setup();
  game.debugSetCastleHp('p1', 1);
  game.rng = () => 0; // 攻める城：道の players[0] ＝ p1
  for (let i = 0; i < 4; i++) game.endTurn();
  const atk = log.find((e) => e.event === 'monsterAttackedCastle');
  assert.equal(atk.playerId, 'p1');
  assert.equal(game.getState(null).winner, 'p2');
  assert.equal(log.at(-1).event, 'gameOver');
  assert.equal(log.at(-1).winner, 'p2');
});

test('放置した魔物の攻撃：ふつうは castleAttack ぶん減る', () => {
  const { game, log } = setup();
  for (let i = 0; i < 4; i++) game.endTurn();
  const atk = log.find((e) => e.event === 'monsterAttackedCastle');
  assert.equal(atk.amount, 2);
  assert.ok(['p1', 'p2'].includes(atk.playerId));
});

test('強化：コインが足りないと買えない。買うとコインが減り効果が出る', () => {
  const { game, log } = setup({ p1: ['infantry'] });
  assert.equal(game.canBuyUpgrade('repair').reason, 'コインが足りません（あと3枚）');
  assert.equal(game.canBuyUpgrade('nope').reason, 'その強化はありません');
  game.players.p1.coins = 9;
  assert.equal(game.canBuyUpgrade('repair').reason, '城のHPが満タンです');
  assert.equal(game.canBuyUpgrade('sharpen').reason, '道の上に自分の兵士がいません');
  play(game, 'infantry');
  assert.equal(game.buyUpgrade('sharpen').ok, true);
  assert.deepEqual(events(log).slice(-3), ['coinsChanged', 'upgradeBought', 'soldierBuffed']);
  assert.equal(log.at(-1).attack, 4);
  assert.equal(game.buyUpgrade('recruit').ok, true); // メインを出したあとでも買える
  assert.equal(log.at(-1).event, 'cardDrawn');
  assert.equal(game.getState('p1').players.p1.coins, 3);
  game.debugSetCastleHp('p1', 20);
  assert.equal(game.buyUpgrade('repair').ok, true);
  assert.equal(log.at(-1).hp, 25);
  assert.equal(game.getState('p1').players.p1.coins, 0);
});

test('強化は自分の番のメインの場面だけ', () => {
  const { game } = setup({ start: false });
  assert.equal(game.canBuyUpgrade('recruit').reason, 'ゲームがまだ始まっていません');
});

test('monsters.json / upgrades.json / rules の間違いは例外', () => {
  const cards = loadFixture('cards-step2.json');
  const rules = loadFixture('rules.json');
  assert.throws(() => new Game({ cards, rules, monsters: { x: { name: 'x', hp: 0 } } }), /"x"/);
  assert.throws(() => new Game({ cards, rules, upgrades: { x: { name: 'x', effect: 'boom', cost: 1, amount: 1 } } }), /effect/);
  assert.throws(() => new Game({ cards, rules: { ...rules, monsterSpawnChance: 2 } }), /monsterSpawnChance/);
});

test('強化："constructor" などプロトタイプのキーは強化として扱わない。limit 回まで', () => {
  const { game } = setup();
  game.players.p1.coins = 20;
  for (const id of ['constructor', 'toString', '__proto__', 5]) {
    assert.equal(game.buyUpgrade(id).reason, 'その強化はありません');
  }
  assert.equal(game.getState('p1').players.p1.coins, 20);
  game.debugSetCastleHp('p1', 10);
  assert.equal(game.buyUpgrade('repair').ok, true);
  assert.equal(game.canBuyUpgrade('repair').reason, 'この強化は1試合に1回までです');
});

test('兵士と魔物が両方倒れるとき：monsterDefeated → coinsChanged → soldierDestroyed', () => {
  const monsters = { ogre: { name: 'オーガ', hp: 5, attack: 9, reward: 4, castleAttack: 1, attackEvery: 9, weight: 1 } };
  const { game, log } = setup({ p1: ['knight'], monsters });
  play(game, 'knight');
  game.endTurn(); game.endTurn();
  const i = log.findIndex((e) => e.event === 'monsterDefeated');
  assert.deepEqual(events(log).slice(i, i + 3), ['monsterDefeated', 'coinsChanged', 'soldierDestroyed']);
});

test('魔物を倒した道には monsterCooldownRounds のあいだ出ない。state に reward と castleAttack', () => {
  const { game, log } = setup({ p1: ['fireball'], rules: { monsterCooldownRounds: 2 } });
  const m = game.getState(null).monsters[0];
  assert.deepEqual([m.reward, m.castleAttack], [2, 2]);
  play(game, 'fireball', { monsterId: 'm01' });
  assert.equal(log.find((e) => e.event === 'spellCast').targetKind, 'monster');
  for (let i = 0; i < 4; i++) game.endTurn(); // 2周目・3周目は出ない
  assert.equal(log.filter((e) => e.event === 'monsterAppeared').length, 1);
  game.endTurn(); game.endTurn(); // 4周目に出る
  assert.equal(log.filter((e) => e.event === 'monsterAppeared').length, 2);
});

test('monsterSpawnChance が 0 なら、魔物を渡しても山札の並びは変わらない（乱数を使わない）', () => {
  const cards = loadFixture('cards-step2.json');
  const rules = { ...loadFixture('rules.json'), monsterFirstRound: 1, monsterSpawnChance: 0 };
  const play10 = (opts) => {
    const g = new Game({ cards, rules, rng: seededRng(4), ...opts });
    const log = recordEvents(g, ['cardDrawn']);
    g.start();
    for (let i = 0; i < 10; i++) g.endTurn();
    return JSON.stringify(log);
  };
  assert.equal(play10({}), play10({ monsters: MONSTERS }));
});

test('魔物を使うとき laneLength が偶数なら例外', () => {
  const cards = loadFixture('cards-step2.json');
  const rules = { ...loadFixture('rules.json'), laneLength: 6 };
  assert.throws(() => new Game({ cards, rules, monsters: MONSTERS }), /laneLength/);
});

test('道3マス：魔物は真ん中（マス1）に出て、兵士は出したマスから動かずに戦う。兵士同士はぶつからない', () => {
  const big = { slime: { ...MONSTERS.slime, hp: 30 } };
  const { game, log } = setup({ p1: ['knight'], p2: ['infantry'], rules: { laneLength: 3 }, monsters: big });
  assert.equal(game.getState(null).monsters[0].square, 1);
  play(game, 'knight');
  game.endTurn();
  play(game, 'infantry');
  game.endTurn(); // p1 騎士：1つ先が魔物 → その場で戦う
  const i = log.findLastIndex((e) => e.event === 'turnStarted');
  const seq = events(log.slice(i)).filter((e) => e !== 'cardDrawn');
  assert.ok(!seq.includes('soldierMoved'));
  assert.ok(seq.includes('monsterClashed'));
  assert.ok(!seq.includes('soldiersClashed'));
  assert.equal(game.getState(null).players.p1.soldiers[0].position, 0);
});
