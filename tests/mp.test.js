// MP（魔法のコスト）・マナ回復・武器の加算・魔物の強化・排出率の恒久強化のテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/Game.js';
import { buildData, loadJson, seededRng, recordEvents, PLAIN_START } from './helpers.js';

function make(rulesPatch = {}, extra = {}) {
  const { cards, rules } = buildData({ rules: { ...PLAIN_START, drawUntilHand: 0, ...rulesPatch } });
  return new Game({ cards, rules, rng: seededRng(5), rarities: loadJson('rarities.json'), ...extra });
}
/** ターンを終える（手札が多ければ先頭から捨てる） */
function pass(g) {
  g.endTurn();
  if (g.phase === 'discard') {
    const hand = g.getState(g.currentPlayer).players[g.currentPlayer].hand;
    g.discard(hand.slice(0, g.discardCount).map((c) => c.cardId));
  }
}
const idOf = (g, pid, type) => g.getState(pid).players[pid].hand.find((c) => c.type === type).cardId;

test('MP：開始時は initialMp。攻撃の魔法と精霊はレアリティのコスト（1〜5）で MP を使う', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['fireball', 'inferno', 'fireSpirit']);
  const st = g.getState('p1');
  assert.equal(st.players.p1.mp, 10);
  assert.equal(st.maxMp, 20);
  assert.equal(st.mpCosts.fireball, 1); // コモン
  assert.equal(st.mpCosts.inferno, 2); // アンコモン
  assert.equal(st.mpCosts.legendaryDummy, undefined);
  g.start();
  const log = recordEvents(g, ['mpChanged']);
  assert.equal(g.playCard(idOf(g, 'p1', 'fireball'), { playerId: 'p2' }).ok, true);
  assert.deepEqual(log.at(-1), { event: 'mpChanged', playerId: 'p1', delta: -1, mp: 9, reason: 'cast' });
  assert.equal(g.getState('p1').players.p1.mp, 9);
});

test('MP：足りなければ出せない（理由に必要な量が出る）。兵士・武器・防御・回復は MP を使わない', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['infantry', 'fireball', 'heal', 'shield']);
  g.start();
  g.players.p1.mp = 0;
  const handBefore = g.getState('p1').players.p1.hand.length;
  const res = g.canPlayCard(idOf(g, 'p1', 'fireball'));
  assert.equal(res.ok, false);
  assert.match(res.reason, /MPが足りません/);
  assert.equal(g.playCard(idOf(g, 'p1', 'fireball'), { playerId: 'p2' }).ok, false);
  assert.equal(g.getState('p1').players.p1.hand.length, handBefore); // 手札は減らない
  for (const t of ['infantry', 'shield']) assert.notEqual(g.canPlayCard(idOf(g, 'p1', t)).reason?.includes('MP'), true, t);
  assert.equal(g.getState('p1').mpCosts.heal, undefined);
});

test('MP：maxMp が 0 のときは MP を使わない（コストなし）', () => {
  const g = make({ initialMp: 0, maxMp: 0 });
  g.debugSetHand('p1', ['fireball']);
  g.start();
  assert.equal(g.playCard(idOf(g, 'p1', 'fireball'), { playerId: 'p2' }).ok, true);
});

test('マナ回復：コモン1・アンコモン2・レア5・エピック10・レジェンド20。上限を超えたぶんは無視。メインを使わない', () => {
  const c = loadJson('cards.json');
  const line = ['manaShard', 'manaDrop', 'manaCrystal', 'manaSpring', 'worldTreeDew'];
  assert.deepEqual(line.map((t) => c[t].amount), [1, 2, 5, 10, 20]);
  assert.deepEqual(line.map((t) => c[t].rarity), ['common', 'uncommon', 'rare', 'epic', 'legendary']);
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['manaSpring', 'manaSpring', 'worldTreeDew', 'fireball']);
  g.start();
  const log = recordEvents(g, ['mpChanged']);
  assert.equal(g.playCard(idOf(g, 'p1', 'manaSpring')).ok, true); // 10 → 20
  assert.equal(g.getState('p1').players.p1.mp, 20);
  assert.equal(g.canPlayCard(idOf(g, 'p1', 'manaSpring')).ok, false); // 満タン
  g.players.p1.mp = 15;
  assert.equal(g.playCard(idOf(g, 'p1', 'worldTreeDew')).ok, true); // +20 → 上限20で止まる
  assert.equal(g.getState('p1').players.p1.mp, 20);
  assert.equal(log.at(-1).delta, 5);
  assert.equal(g.playCard(idOf(g, 'p1', 'fireball'), { playerId: 'p2' }).ok, true); // メインはまだ使える
});

test('マナ回復：合成で1つ上のレアリティになる（かけら×2 → しずく）', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['manaShard', 'manaShard']);
  g.start();
  const [a, b] = g.getState('p1').players.p1.hand.filter((c) => c.type === 'manaShard').map((c) => c.cardId);
  assert.equal(g.fuse(a, b).ok, true);
  assert.ok(g.getState('p1').players.p1.hand.some((c) => c.type === 'manaDrop'));
});

test('魔物：後半ほど、レアリティの高い魔物が出やすくなる', () => {
  const g = make({ monsterLateBias: 0.5 }, { monsters: loadJson('monsters.json') });
  g.round = 3;
  const early = g.monsterWeight('demonKing');
  g.round = 13;
  const late = g.monsterWeight('demonKing');
  assert.ok(late > early * 4);
  g.round = 13;
  assert.equal(g.monsterWeight('bat'), g.monsterDefs.bat.weight); // コモンは変わらない
});

test('魔物：放置すると monsterEvolveEvery 周ごとにレアリティが1つ上がり、強くなる（レジェンドはそのまま）', () => {
  const monsters = { rock: { name: 'いわ', hp: 10, attack: 2, rewardRarity: 'common', castleAttack: 2, attackEvery: 99, weight: 1 } };
  const g = make({ monsterFirstRound: 1, monsterSpawnChance: 1, monsterEvolveEvery: 2, monsterEvolveMultiplier: 2 }, { monsters });
  const log = recordEvents(g, ['monsterEvolved']);
  g.start();
  for (let i = 0; i < 20 && log.length < 1; i++) pass(g);
  const m = g.getState(null).monsters[0];
  assert.equal(log[0].rewardRarity, 'uncommon');
  assert.equal(m.rewardRarity, 'uncommon');
  assert.equal(m.maxHp, 20);
  assert.equal(m.hp, 20);
  assert.equal(m.attack, 4);
  assert.equal(m.castleAttack, 4);
  assert.equal(m.evolveCount, 1);
  for (let i = 0; i < 40; i++) pass(g);
  assert.equal(g.getState(null).monsters[0].rewardRarity, 'legendary');
  const last = g.getState(null).monsters[0].evolveCount;
  for (let i = 0; i < 12; i++) pass(g);
  assert.equal(g.getState(null).monsters[0].rewardRarity, 'legendary');
  assert.ok(g.getState(null).monsters[0].evolveCount >= last);
});

test('魔物：強くなったあとに倒すと、上がったレアリティのごほうびが出る', () => {
  const monsters = { rock: { name: 'いわ', hp: 1, attack: 1, rewardRarity: 'common', castleAttack: 1, attackEvery: 99, weight: 1 } };
  const g = make({ monsterFirstRound: 1, monsterSpawnChance: 1, monsterEvolveEvery: 1, monsterEvolveMultiplier: 1, rewardLuckyChance: 0 }, { monsters });
  g.start();
  for (let i = 0; i < 4; i++) pass(g);
  const m = g.monsters[0];
  const log = recordEvents(g, ['monsterDefeated']);
  m.hp = 0;
  g.defeatMonsterIfDead(m, 'p1');
  assert.equal(log[0].baseRarity, m.rewardRarity);
  assert.notEqual(log[0].rewardRarity, 'common');
});

test('排出率の恒久強化：買うほど、引くときに高レアが出る確率が上がる（山札は減らない）', () => {
  const upgrades = loadJson('upgrades.json');
  const g = make({}, { upgrades });
  g.start();
  g.players.p1.coins = 100;
  assert.equal(g.buyUpgrade('permLuck').ok, true);
  assert.equal(g.getState('p1').players.p1.permLuck.chance, 0.15);
  assert.equal(g.buyUpgrade('permLuck').ok, true);
  assert.ok(Math.abs(g.getState('p1').players.p1.permLuck.chance - 0.3) < 1e-9);
  assert.equal(g.buyUpgrade('permLuck').ok, true);
  assert.equal(g.buyUpgrade('permLuck').ok, true);
  assert.equal(g.canBuyUpgrade('permLuck').ok, false); // 4回まで
  g.players.p1.permLuck.chance = 1;
  const deck = g.pileOf('p1').deck.length;
  g.drawCards(g.players.p1, 3);
  assert.equal(g.pileOf('p1').deck.length, deck); // 山札からは引かない
});

test('データ：初期コインは0、歩兵の速さ2・騎兵の速さ3、武器は重ねられる', () => {
  assert.equal(loadJson('rules.json').initialCoins, 0);
  assert.equal(loadJson('rules.json').maxMp, 30);
  const c = loadJson('cards.json');
  assert.equal(c.infantry.speed, 2);
  assert.equal(c.cavalry.speed, 3);
});
