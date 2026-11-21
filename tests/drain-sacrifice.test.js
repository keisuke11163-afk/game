// 追加カード（仕様書4章。レア・合成しない）：魔力強奪・命の簒奪・決死の砲撃・火薬庫のテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game/Game.js';
import { buildData, loadJson, seededRng, recordEvents, PLAIN_START } from './helpers.js';

function make(rulesPatch = {}) {
  const { cards, rules } = buildData({ rules: { ...PLAIN_START, drawUntilHand: 0, defenseReaction: false, ...rulesPatch } });
  return new Game({ cards, rules, rng: seededRng(7), rarities: loadJson('rarities.json') });
}
const idOf = (g, pid, type) => g.getState(pid).players[pid].hand.find((c) => c.type === type).cardId;
function pass(g) {
  g.endTurn();
  if (g.phase === 'discard') {
    const hand = g.getState(g.currentPlayer).players[g.currentPlayer].hand;
    g.discard(hand.slice(0, g.discardCount).map((c) => c.cardId));
  }
}

test('cards.json：4枚はレア。魔力強奪・決死の砲撃・火薬庫は合成しない（fuseTo: null）。命の簒奪だけは人間の決定で魂喰らいに合成できる。MP はレアのコスト（3）', () => {
  const c = loadJson('cards.json');
  const expect = { manaRaid: ['drainMp', 4], lifeSteal: ['drainCastle', 8], desperateShot: ['sacrificeAttack', 20], powderKeg: ['damageAllSoldiers', 8] };
  for (const [type, [effect, amount]] of Object.entries(expect)) {
    assert.equal(c[type].effect, effect, type);
    assert.equal(c[type].amount, amount, type);
    assert.equal(c[type].rarity, 'rare', type);
    assert.equal(c[type].fuseTo, type === 'lifeSteal' ? 'demon_drain_epic' : null, type);
    assert.equal(c[type].mpCost, undefined, type);
  }
  assert.equal(c.desperateShot.selfDamage, 6);
});

test('合成しないカード（fuseTo: null）：同じカード2枚でも、適応とでも合成できない（魔力強奪で確かめる）', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['manaRaid', 'manaRaid', 'adapt']);
  g.start();
  const ids = g.getState('p1').players.p1.hand.filter((x) => x.type === 'manaRaid').map((x) => x.cardId);
  assert.equal(g.canFuse(ids[0], ids[1]).reason, 'このカードは合成できません');
  assert.equal(g.canFuse(idOf(g, 'p1', 'adapt'), ids[0]).reason, 'このカードは合成できません');
});

test('剣の攻撃力：魔剣+4・聖剣+6・神剣+9', () => {
  const c = loadJson('cards.json');
  assert.deepEqual(['magicSword', 'holySword', 'godSword'].map((t) => c[t].attackBonus), [4, 6, 9]);
});

test('cards.json：fuseTo を書き忘れたレア（null でない）は例外', () => {
  const { cards, rules } = buildData({ rules: PLAIN_START });
  delete cards.lifeSteal.fuseTo;
  assert.throws(() => new Game({ cards, rules, rarities: loadJson('rarities.json') }), /fuseTo/);
});

test('MPドレイン：相手の MP を奪って自分の MP にする。MP は使わない。相手の MP が0なら出せない', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['manaRaid', 'manaRaid']);
  g.start();
  g.players.p1.mp = 5;
  g.players.p2.mp = 3;
  const log = recordEvents(g, ['mpChanged']);
  assert.equal(g.playCard(idOf(g, 'p1', 'manaRaid'), { playerId: 'p2' }).ok, true);
  // 4奪おうとしても、相手は3しか持っていない
  assert.deepEqual(log, [
    { event: 'mpChanged', playerId: 'p2', delta: -3, mp: 0, reason: 'drained' },
    { event: 'mpChanged', playerId: 'p1', delta: 3, mp: 8, reason: 'drain' },
  ]);
  pass(g);
  pass(g);
  const res = g.canPlayCard(idOf(g, 'p1', 'manaRaid'));
  assert.equal(res.ok, false);
  assert.equal(res.reason, '相手のMPがありません');
});

test('MPドレイン：自分の上限を超えたぶんは捨てる', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['manaRaid']);
  g.start();
  g.players.p1.mp = 18;
  g.players.p2.mp = 20;
  assert.equal(g.playCard(idOf(g, 'p1', 'manaRaid'), { playerId: 'p2' }).ok, true);
  assert.equal(g.players.p2.mp, 16);
  assert.equal(g.players.p1.mp, 20);
});

test('生命吸収：相手の城に与えたぶん自分の城を回復。城壁が受けたぶんは回復しない。MP を使う', () => {
  const g = make({ initialMp: 10, maxMp: 20, armorMax: 40 });
  g.debugSetHand('p1', ['lifeSteal']);
  g.start();
  g.players.p1.castle.hp = 30;
  g.players.p2.armor = 3;
  const hp2 = g.players.p2.castle.hp;
  const log = recordEvents(g, ['castleDamaged', 'castleHealed', 'mpChanged']);
  assert.equal(g.playCard(idOf(g, 'p1', 'lifeSteal'), { playerId: 'p2' }).ok, true);
  assert.equal(g.players.p2.castle.hp, hp2 - 5);
  assert.equal(g.players.p1.castle.hp, 35);
  assert.deepEqual(log.map((e) => e.event), ['mpChanged', 'castleDamaged', 'castleHealed']);
  assert.equal(log[0].delta, -3); // レア
  assert.equal(log[2].amount, 5);
});

test('生命吸収：自分の城が満タンなら回復は出ない（城HPの上限で止まる）', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['lifeSteal']);
  g.start();
  const log = recordEvents(g, ['castleHealed']);
  assert.equal(g.playCard(idOf(g, 'p1', 'lifeSteal'), { playerId: 'p2' }).ok, true);
  assert.equal(log.length, 0);
});

test('捨て身：自分の城HPを払って、相手の城に大ダメージ。払うのは城壁を通さない', () => {
  const g = make({ initialMp: 10, maxMp: 20, armorMax: 40 });
  g.debugSetHand('p1', ['desperateShot']);
  g.start();
  g.players.p1.armor = 10;
  const hp1 = g.players.p1.castle.hp;
  const hp2 = g.players.p2.castle.hp;
  const log = recordEvents(g, ['castleDamaged']);
  assert.equal(g.playCard(idOf(g, 'p1', 'desperateShot'), { playerId: 'p2' }).ok, true);
  assert.equal(g.players.p1.castle.hp, hp1 - 6);
  assert.equal(g.players.p1.armor, 10);
  assert.equal(g.players.p2.castle.hp, hp2 - 20);
  assert.deepEqual(log[0], { event: 'castleDamaged', playerId: 'p1', amount: 6, blocked: 0, hp: hp1 - 6, source: { kind: 'sacrifice', type: 'desperateShot' } });
  assert.deepEqual(log[1].source, { kind: 'spell', type: 'desperateShot' });
});

test('捨て身：払うと自分の城が落ちるなら出せない', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['desperateShot']);
  g.start();
  g.players.p1.castle.hp = 6;
  const res = g.canPlayCard(idOf(g, 'p1', 'desperateShot'));
  assert.equal(res.ok, false);
  assert.equal(res.reason, '城のHPが足りません（6より多く必要です）');
  g.players.p1.castle.hp = 7;
  assert.equal(g.canPlayCard(idOf(g, 'p1', 'desperateShot')).ok, true);
});

test('捨て身：相手の城を落とせば勝ち', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['desperateShot']);
  g.debugSetCastleHp('p2', 20);
  g.start();
  assert.equal(g.playCard(idOf(g, 'p1', 'desperateShot'), { playerId: 'p2' }).ok, true);
  assert.equal(g.phase, 'gameOver');
  assert.equal(g.getState('p1').winner, 'p1');
});

test('爆発：自分の兵士も相手の兵士も、場の兵士全員にダメージ。場に兵士がいなければ出せない', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['powderKeg', 'infantry']);
  g.start();
  assert.equal(g.canPlayCard(idOf(g, 'p1', 'powderKeg')).reason, '場に兵士がいません');
  const targets = g.getTargets(idOf(g, 'p1', 'infantry'));
  assert.equal(g.playCard(idOf(g, 'p1', 'infantry'), targets[0]).ok, true);
  pass(g);
  g.debugSetHand('p2', ['infantry']);
  assert.equal(g.playCard(idOf(g, 'p2', 'infantry'), g.getTargets(idOf(g, 'p2', 'infantry'))[0]).ok, true);
  pass(g);
  g.debugSetHand('p1', ['powderKeg']);
  const mine = g.players.p1.soldiers[0];
  const theirs = g.players.p2.soldiers[0];
  const [hpMine, hpTheirs] = [mine.hp, theirs.hp];
  const log = recordEvents(g, ['soldierDamaged']);
  assert.equal(g.playCard(idOf(g, 'p1', 'powderKeg')).ok, true); // 対象は選ばない
  assert.deepEqual(log.map((e) => [e.playerId, e.amount, e.cause]), [['p1', 8, 'spell'], ['p2', 8, 'spell']]);
  // 歩兵（HP5）は両方とも倒れる
  assert.equal(g.players.p1.soldiers.includes(mine), hpMine > 8);
  assert.equal(g.players.p2.soldiers.includes(theirs), hpTheirs > 8);
});

// ---------- 合成・高レアリティの機会を増やす調整（適応の排出率・排出率アップの強化の値段） ----------

test('適応の排出率は約2.5%。解毒薬・天候の呪文は約0.33%・0.16%', async () => {
  const { dropRates } = await import('../js/game/Setup.js');
  const all = dropRates(loadJson("cards.json"), loadJson("rarities.json")); const rates = all.cards ?? all;
  assert.ok(Math.abs(rates.adapt - 2.5) < 0.05, String(rates.adapt));
  assert.ok(Math.abs(rates.antidote - 0.328) < 0.01);
  assert.ok(Math.abs(rates.weatherCall - 0.164) < 0.01);
  const total = Object.values(loadJson('rarities.json')).reduce((a, r) => a + r.dropRate, 0);
  assert.ok(Math.abs(total - 100) < 1e-9);
});

test('幸運の加護は買うたびに値段が上がる（3 → 5 → 8 → 11、4回まで）。運命の祈りは3', () => {
  const { cards, rules } = buildData({ rules: { ...PLAIN_START, drawUntilHand: 0 } });
  const g = new Game({ cards, rules, rng: seededRng(3), rarities: loadJson('rarities.json'), upgrades: loadJson('upgrades.json') });
  g.start();
  const p1 = g.players.p1;
  p1.coins = 100;
  assert.equal(g.getState('p1').players.p1.upgradeCosts.luck, 3);
  const log = recordEvents(g, ['upgradeBought']);
  const paid = [];
  for (let i = 0; i < 4; i++) {
    assert.equal(g.getState('p2').players.p1.upgradeCosts.permLuck, [3, 5, 8, 11][i]); // 相手からも見える
    assert.equal(g.buyUpgrade('permLuck').ok, true);
    paid.push(log.at(-1).cost);
  }
  assert.deepEqual(paid, [3, 5, 8, 11]);
  assert.equal(p1.coins, 100 - 27);
  assert.equal(g.canBuyUpgrade('permLuck').reason, 'この強化は1試合に4回までです');
  p1.coins = 2;
  assert.equal(g.canBuyUpgrade('luck').reason, 'コインが足りません（あと1枚）');
});

test('upgrades.json：costs の最初が cost と違うと例外', () => {
  const { cards, rules } = buildData({ rules: PLAIN_START });
  const upgrades = loadJson('upgrades.json');
  upgrades.permLuck.costs = [4, 5];
  assert.throws(() => new Game({ cards, rules, rarities: loadJson('rarities.json'), upgrades }), /costs の最初は cost と同じ/);
});

// ---------- 魔物のカードを効果にする：ヴァンパイア（相手の城に10、自分の城を10回復） ----------

test('ヴァンパイアのカードは魔法（駒ではない）。相手の城に10、自分の城を10回復。MP は使わない', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['beast_vampire']);
  g.start();
  g.players.p1.castle.hp = 20;
  const hp2 = g.players.p2.castle.hp;
  const log = recordEvents(g, ['spellCast', 'castleDamaged', 'castleHealed', 'mpChanged', 'soldierDeployed']);
  assert.equal(g.playCard(idOf(g, 'p1', 'beast_vampire'), { playerId: 'p2' }).ok, true);
  assert.deepEqual(log.map((e) => e.event), ['spellCast', 'castleDamaged', 'castleHealed']);
  assert.equal(g.players.p2.castle.hp, hp2 - 10);
  assert.equal(g.players.p1.castle.hp, 30);
  assert.equal(g.players.p1.soldiers.length, 0);
  assert.equal(g.pileOf('p1').exhausted.length, 1); // 魔物のカードは使い切り（山札に戻らない）
});

test('ヴァンパイアのカード：城壁に防がれても回復する。相手の城を落としたら回復せずに勝ち', () => {
  const g = make({ initialMp: 10, maxMp: 20, armorMax: 40 });
  g.debugSetHand('p1', ['beast_vampire', 'beast_vampire']);
  g.start();
  g.players.p1.castle.hp = 20;
  g.players.p2.armor = 20;
  assert.equal(g.playCard(idOf(g, 'p1', 'beast_vampire'), { playerId: 'p2' }).ok, true);
  assert.equal(g.players.p2.armor, 10);
  assert.equal(g.players.p1.castle.hp, 30);
  pass(g); pass(g);
  g.debugSetCastleHp('p2', 5);
  g.players.p2.armor = 0;
  const log = recordEvents(g, ['castleHealed', 'gameOver']);
  assert.equal(g.playCard(idOf(g, 'p1', 'beast_vampire'), { playerId: 'p2' }).ok, true);
  assert.deepEqual(log.map((e) => e.event), ['gameOver']);
});

test('魔物のカードは合成できない', () => {
  const g = make();
  g.debugSetHand('p1', ['beast_vampire', 'beast_vampire']);
  g.start();
  const ids = g.getState('p1').players.p1.hand.map((c) => c.cardId);
  assert.equal(g.canFuse(ids[0], ids[1]).reason, '魔物のカードは合成できません');
});

test('ヴァンパイアのカード：相手が防御を選ぶときは、返事のあとで当たって回復する', () => {
  const g = make({ initialMp: 10, maxMp: 20, defenseReaction: true, armorMax: 40 });
  g.debugSetHand('p1', ['beast_vampire']);
  g.debugSetHand('p2', ['sandbag']);
  g.start();
  g.players.p1.castle.hp = 20;
  const hp2 = g.players.p2.castle.hp;
  assert.equal(g.playCard(idOf(g, 'p1', 'beast_vampire'), { playerId: 'p2' }).ok, true);
  assert.equal(g.phase, 'defend');
  assert.equal(g.players.p1.castle.hp, 20); // まだ回復しない
  assert.equal(g.passDefense().ok, true);
  assert.equal(g.players.p2.castle.hp, hp2 - 10);
  assert.equal(g.players.p1.castle.hp, 30);
  assert.equal(g.phase, 'main');
});

// ---------- 魔物のカード（効果）：コウモリ・スライム・スケルトン・ゴースト・トレント・デーモン・ミミック・ドラゴン・魔王 ----------

/** p1 と p2 に兵士を1体ずつ出して、p1 の番に戻す */
function withSoldiers(g) {
  g.debugSetHand('p1', ['heavy']);
  assert.equal(g.playCard(idOf(g, 'p1', 'heavy'), g.getTargets(idOf(g, 'p1', 'heavy'))[0]).ok, true);
  pass(g);
  g.debugSetHand('p2', ['heavy', 'heavy']);
  for (let i = 0; i < 2; i++) assert.equal(g.playCard(idOf(g, 'p2', 'heavy'), g.getTargets(idOf(g, 'p2', 'heavy'))[i]).ok, true);
  pass(g);
}

test('魔物のカード：どれも MP を使わない。ゴブリン・ゴーレムは駒のまま、スケルトンは弓兵の駒', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  const costs = g.getState('p1').mpCosts;
  for (const t of ['beast_bat', 'beast_dragon', 'beast_demon', 'beast_demonKing']) assert.equal(costs[t], undefined, t);
  const c = loadJson('cards.json');
  assert.equal(c.beast_goblin.kind, 'soldier');
  assert.equal(c.beast_golem.kind, 'soldier');
  assert.equal(c.beast_skeleton.kind, 'soldier');
  assert.equal(c.beast_skeleton.role, 'archer');
});

test('コウモリ：相手の兵士全員を1ターン止める', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.start();
  withSoldiers(g);
  g.debugSetHand('p1', ['beast_bat']);
  assert.equal(g.playCard(idOf(g, 'p1', 'beast_bat'), { playerId: 'p2' }).ok, true);
  assert.ok(g.players.p2.soldiers.length > 0);
  for (const s of g.players.p2.soldiers) assert.equal(s.frozen, 1);
});

test('スライム：城HPか MP のどちらかを5回復。満タンの方は選ばない', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['beast_slime', 'beast_slime']);
  g.start();
  g.players.p1.castle.hp = 30; // MP は満タンにしておく → 城HPが増える
  g.players.p1.mp = 20;
  assert.equal(g.playCard(idOf(g, 'p1', 'beast_slime')).ok, true);
  assert.equal(g.players.p1.castle.hp, 35);
  pass(g); pass(g);
  g.players.p1.castle.hp = g.players.p1.castle.maxHp; // 城が満タン → MP が増える
  g.players.p1.mp = 3;
  assert.equal(g.playCard(idOf(g, 'p1', 'beast_slime')).ok, true);
  assert.equal(g.players.p1.mp, 8);
});

test('スライム：城HPも MP も満タンなら出せない', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.debugSetHand('p1', ['beast_slime']);
  g.start();
  g.players.p1.mp = 20;
  assert.equal(g.canPlayCard(idOf(g, 'p1', 'beast_slime')).reason, '城のHPもMPも満タンです');
});

test('ゴースト：相手の手札を2枚奪う（1枚しかなければ1枚）', () => {
  const g = make();
  g.debugSetHand('p1', ['beast_ghost', 'beast_ghost']);
  g.debugSetHand('p2', ['infantry', 'heal', 'shield']);
  g.start();
  const log = recordEvents(g, ['cardStolen']);
  assert.equal(g.playCard(idOf(g, 'p1', 'beast_ghost'), { playerId: 'p2' }).ok, true);
  assert.equal(log.length, 2);
  assert.equal(g.players.p2.hand.length, 1);
  pass(g); pass(g);
  g.debugSetHand('p2', ['infantry']);
  assert.equal(g.playCard(idOf(g, 'p1', 'beast_ghost'), { playerId: 'p2' }).ok, true);
  assert.equal(g.players.p2.hand.length, 0);
});

test('トレント：城HPを10回復し、城壁を5置く', () => {
  const g = make({ armorMax: 40 });
  g.debugSetHand('p1', ['beast_treant']);
  g.start();
  g.players.p1.castle.hp = 20;
  assert.equal(g.playCard(idOf(g, 'p1', 'beast_treant')).ok, true);
  assert.equal(g.players.p1.castle.hp, 30);
  assert.equal(g.players.p1.armor, 5);
});

test('デーモン：相手の城と兵士を毒3にする', () => {
  const g = make({ initialMp: 10, maxMp: 20 });
  g.start();
  withSoldiers(g);
  g.debugSetHand('p1', ['beast_demon']);
  assert.equal(g.playCard(idOf(g, 'p1', 'beast_demon'), { playerId: 'p2' }).ok, true);
  assert.equal(g.players.p2.castle.poison, 3);
  for (const s of g.players.p2.soldiers) assert.equal(s.poison.amount, 3);
});

test('ミミック：相手のコインを5枚奪う（持っている分だけ）。相手が0枚なら出せない', () => {
  const g = make();
  g.debugSetHand('p1', ['beast_mimic', 'beast_mimic']);
  g.start();
  g.players.p2.coins = 0;
  assert.equal(g.canPlayCard(idOf(g, 'p1', 'beast_mimic')).reason, '相手のコインがありません');
  g.players.p2.coins = 3;
  const before = g.players.p1.coins;
  const log = recordEvents(g, ['coinsChanged']);
  assert.equal(g.playCard(idOf(g, 'p1', 'beast_mimic'), { playerId: 'p2' }).ok, true);
  assert.equal(g.players.p2.coins, 0);
  assert.equal(g.players.p1.coins, before + 3);
  assert.deepEqual(log.map((e) => [e.playerId, e.delta, e.reason]), [['p2', -3, 'stolen'], ['p1', 3, 'steal']]);
});

test('ドラゴン：相手の城に15ダメージ', () => {
  const g = make();
  g.debugSetHand('p1', ['beast_dragon']);
  g.start();
  const hp2 = g.players.p2.castle.hp;
  assert.equal(g.playCard(idOf(g, 'p1', 'beast_dragon'), { playerId: 'p2' }).ok, true);
  assert.equal(g.players.p2.castle.hp, hp2 - 15);
});

test('魔王：相手の城と、相手の兵士全員に15ダメージ', () => {
  const g = make();
  g.start();
  withSoldiers(g);
  g.debugSetHand('p1', ['beast_demonKing']);
  const hp2 = g.players.p2.castle.hp;
  const mine = g.players.p1.soldiers.length;
  assert.ok(g.players.p2.soldiers.length > 0);
  assert.equal(g.playCard(idOf(g, 'p1', 'beast_demonKing'), { playerId: 'p2' }).ok, true);
  assert.equal(g.players.p2.castle.hp, hp2 - 15);
  assert.equal(g.players.p2.soldiers.length, 0); // 重装兵（HP15以下）は倒れる
  assert.equal(g.players.p1.soldiers.length, mine); // 自分の兵士には当たらない
});

// ---------- ゴーレム：城の護衛（動かず、左右のとなりの道も守る。4ターンで帰る） ----------

function golemGame() {
  const g = make({ laneCount: 3, laneLength: 5, monsterSpawnChance: 0, weatherChangeChance: 0 });
  g.start();
  return g;
}
const roadOf = (g, i) => g.roads.filter((r) => r.players.join() === 'p1,p2').sort((a, b) => a.lane - b.lane)[i].roadId;

test('ゴーレム：真ん中の道に出すと、左の道を進んできた相手の兵士を止めて戦う', () => {
  const g = golemGame();
  g.debugSetHand('p1', ['beast_golem']);
  assert.equal(g.playCard(idOf(g, 'p1', 'beast_golem'), { playerId: 'p2', roadId: roadOf(g, 1) }).ok, true);
  pass(g);
  g.debugSetHand('p2', ['knight']);
  assert.equal(g.playCard(idOf(g, 'p2', 'knight'), { playerId: 'p1', roadId: roadOf(g, 0) }).ok, true);
  const hp1 = g.players.p1.castle.hp;
  const golem = g.players.p1.soldiers.find((s) => s.type === 'beast_golem');
  const log = recordEvents(g, ['soldiersClashed', 'castleDamaged']);
  pass(g); pass(g); // 次の p2 の番：騎士（速さ5）が左の道を進む → ゴーレムの手前で止まって戦う
  const clash = log.find((e) => e.event === 'soldiersClashed');
  assert.ok(clash, '戦った');
  assert.equal(clash.defender.soldierId, golem.soldierId);
  assert.equal(clash.roadId, roadOf(g, 0));
  assert.equal(log.filter((e) => e.event === 'castleDamaged').length, 0, '城には届かない');
  assert.equal(g.players.p1.castle.hp, hp1);
  assert.equal(golem.position, 0); // 動かない
  assert.equal(golem.hp, 14 - 7); // 騎士の攻撃7を受けた（倒されるまで止め続ける）
});

test('ゴーレム：端の道に出すと、反対の端の道は守らない', () => {
  const g = golemGame();
  g.debugSetHand('p1', ['beast_golem']);
  assert.equal(g.playCard(idOf(g, 'p1', 'beast_golem'), { playerId: 'p2', roadId: roadOf(g, 0) }).ok, true);
  assert.equal(g.guardCovers(g.players.p1.soldiers[0], roadOf(g, 1)), true);
  assert.equal(g.guardCovers(g.players.p1.soldiers[0], roadOf(g, 2)), false);
});

test('ゴーレム：動かず、4ターンで帰る（turnsLeft が見える）', () => {
  const g = golemGame();
  g.debugSetHand('p1', ['beast_golem']);
  assert.equal(g.playCard(idOf(g, 'p1', 'beast_golem'), { playerId: 'p2', roadId: roadOf(g, 1) }).ok, true);
  assert.equal(g.getState('p1').players.p1.soldiers[0].turnsLeft, 4);
  const log = recordEvents(g, ['soldierMoved', 'soldierDestroyed']);
  for (let i = 0; i < 3; i++) { pass(g); pass(g); }
  assert.equal(g.players.p1.soldiers.length, 1);
  assert.equal(g.players.p1.soldiers[0].turnsLeft, 1);
  pass(g); pass(g);
  assert.equal(g.players.p1.soldiers.length, 0);
  assert.equal(log.filter((e) => e.event === 'soldierMoved').length, 0);
  assert.deepEqual(log.filter((e) => e.event === 'soldierDestroyed').map((e) => e.reason), ['returned']);
});
