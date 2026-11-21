// 属性の反応（data/reactions.json・js/game/Reactions.js）のテスト。
// 付着した属性に別の属性で攻撃すると反応が起きる。1ターン1回まで。効果＋倍率。付着が変わって連鎖する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { validateReactions, findReaction, buildReactionIndex, applyReactionMultiplier } from '../js/game/Reactions.js';
import { DEFAULT_ELEMENTS } from '../js/game/Elements.js';
import { filterEventFor } from '../js/game/visibility.js';
import { loadJson, loadFixture, seededRng, recordEvents, buildData, loadOptionalData, PLAIN_START } from './helpers.js';

const REACTIONS = loadJson('reactions.json');

// テスト用のカード：属性つきの魔法（兵士全員に amount）と、打たれ強い兵士・忍者・属性の武器（氷・雷も）
const bolt = (element, amount = 4) => ({ name: `${element}の魔法`, kind: 'spell', effect: 'damageEnemySoldiers', amount, element, count: 1 });
const EXTRA = {
  fireBolt: bolt('fire'), waterBolt: bolt('water'), windBolt: bolt('wind'), earthBolt: bolt('earth'),
  iceBolt: bolt('ice'), thunderBolt: bolt('thunder'), chaosBolt: bolt('chaos'), fireBolt5: bolt('fire', 5),
  plainBolt: { name: '無の魔法', kind: 'spell', effect: 'damageEnemySoldiers', amount: 4, count: 1 },
  dummy: { name: '木人', kind: 'soldier', hp: 100, attack: 1, speed: 3, count: 1 },
  post: { name: '杭', kind: 'soldier', hp: 100, attack: 1, speed: 1, count: 1 },
  ninja: { name: '下忍', kind: 'soldier', role: 'ninja', hp: 50, attack: 1, speed: 1, count: 1 },
  fireBlade: { name: '炎刃', kind: 'weapon', attackBonus: 1, element: 'fire', count: 1 },
  iceBlade: { name: '氷刃', kind: 'weapon', attackBonus: 1, element: 'ice', count: 1 },
};

function newGame({ reactions = REACTIONS, rules = {}, weather = null, seed = 1 } = {}) {
  const game = new Game({
    cards: { ...loadFixture('cards.json'), ...EXTRA },
    rules: { ...loadFixture('rules.json'), laneLength: 5, ...rules },
    reactions,
    weather,
    rng: seededRng(seed),
  });
  const log = recordEvents(game, EVENT_TYPES);
  game.debugSetDeck(Array(60).fill('heal'));
  game.start();
  return { game, log };
}

/** 手番の人が type を出す（メインの1枚は何度でも使えるように戻す） */
function play(game, type, target) {
  const pid = game.currentPlayer;
  game.players[pid].playedThisTurn = false;
  game.players[pid].soldiersPlayedThisTurn = 0;
  game.debugSetHand(pid, [type]);
  const r = game.playCard(game.players[pid].hand[0].cardId, target);
  assert.equal(r.ok, true, r.reason);
  return game.players[pid].soldiers.at(-1);
}

/**
 * 戦いを1回だけ起こす準備：p1 が兵士（と武器）を出す → p2 の番に p2 の兵士（と武器）を出し、向かい合わせて prepare を呼ぶ。
 * そのあと endTurn すると、p1 の進軍ですぐに戦う
 */
function duel(game, { mine = 'infantry', weapon = null, foe = 'post', foeWeapon = null, prepare = () => {} } = {}) {
  const m = play(game, mine);
  if (weapon) play(game, weapon, { soldierId: m.soldierId });
  game.endTurn();
  const f = play(game, foe);
  if (foeWeapon) play(game, foeWeapon, { soldierId: f.soldierId });
  const L = game.rules.laneLength;
  m.position = L - 4; // p1 から数えて L-4、p2 の兵士は p1 から数えて L-3（1つ先）
  f.position = 2;
  prepare(m, f);
  return { mine: m, foe: f };
}

/** p2 の兵士を何体か置いて、p1 の番にする。positions は p2 から数えたマス */
function setupFoes(game, positions, type = 'post') {
  game.endTurn(); // p2 の番
  const foes = positions.map((pos) => {
    const s = play(game, type);
    s.position = pos;
    return s;
  });
  game.endTurn(); // p1 の番（p2 の兵士は p2 の番にしか動かない）
  return foes;
}

const attach = (soldier, element) => {
  soldier.attachment = { element, turns: 2, from: null };
};
const ofType = (log, event) => log.filter((e) => e.event === event);

test('data/reactions.json は検証を通る（10組＋凍結霧、混沌の候補）', () => {
  validateReactions(REACTIONS, DEFAULT_ELEMENTS);
  assert.deepEqual(Object.keys(REACTIONS.reactions).sort(), ['blizzard', 'evaporate', 'flameSpread', 'fog', 'freeze', 'frozenMist', 'melt', 'mud', 'sandstorm', 'shock', 'stormThunder'].sort());
  assert.equal(REACTIONS.chaosPool.length, 11);
});

test('validateReactions：間違いは例外', () => {
  const bad = (f) => { const d = structuredClone(REACTIONS); f(d); return () => validateReactions(d, DEFAULT_ELEMENTS); };
  assert.throws(() => validateReactions(null, DEFAULT_ELEMENTS), /reactions\.json/);
  assert.throws(bad((d) => { delete d.reactions; }), /reactions を/);
  assert.throws(bad((d) => { delete d.reactions.melt.name; }), /name/);
  assert.throws(bad((d) => { d.reactions.melt.elements = ['fire']; }), /違う属性2つ/);
  assert.throws(bad((d) => { d.reactions.melt.elements = ['fire', 'fire']; }), /違う属性2つ/);
  assert.throws(bad((d) => { d.reactions.melt.elements = ['fire', 'lava']; }), /lava/);
  assert.throws(bad((d) => { d.reactions.melt.elements = ['fire', 'chaos']; }), /混沌/);
  assert.throws(bad((d) => { d.reactions.melt.elements = ['water', 'fire']; }), /重なって/);
  assert.throws(bad((d) => { d.reactions.melt.multiplier = -1; }), /multiplier/);
  assert.throws(bad((d) => { d.reactions.melt.attachment = 'steam'; }), /steam/);
  assert.throws(bad((d) => { d.reactions.melt.effects = [{ kind: 'boom' }]; }), /kind/);
  assert.throws(bad((d) => { d.reactions.shock.effects = [{ kind: 'splash', ratio: 0.5 }]; }), /scope/);
  assert.throws(bad((d) => { d.reactions.mud.effects = [{ kind: 'slow', amount: 0, turns: 2 }]; }), /amount/);
  assert.throws(bad((d) => { d.reactions.fog.effects = [{ kind: 'blind', chance: 2, turns: 2 }]; }), /chance/);
  assert.throws(bad((d) => { d.reactions.freeze.effects = [{ kind: 'status', status: 'poison', turns: 1 }]; }), /status/);
  assert.throws(bad((d) => { d.reactions.freeze.effects = [{ kind: 'status', status: 'frozen', turns: 1, scope: 'all' }]; }), /scope/);
  assert.throws(bad((d) => { d.chaosPool = ['nope']; }), /nope/);
  // new Game() でも同じ検証。rules の attachTurns / reactionsPerTurn も確かめる
  assert.throws(() => new Game({ cards: loadFixture('cards.json'), rules: loadFixture('rules.json'), reactions: { reactions: { x: { name: 'x', elements: ['a', 'b'] } } } }), /reactions\.json/);
  assert.throws(() => new Game({ cards: loadFixture('cards.json'), rules: { ...loadFixture('rules.json'), attachTurns: 0 } }), /attachTurns/);
  assert.throws(() => new Game({ cards: loadFixture('cards.json'), rules: { ...loadFixture('rules.json'), reactionsPerTurn: -1 } }), /reactionsPerTurn/);
});

test('findReaction：組の順番は関係ない。同じ属性・付着なしは起きない。水霧は水としても照合（mist の組が先）', () => {
  const idx = buildReactionIndex(REACTIONS);
  const f = (a, e) => findReaction(REACTIONS, idx, a, e, () => 0);
  const table = [
    ['fire', 'water', 'evaporate'], ['fire', 'ice', 'melt'], ['water', 'ice', 'freeze'], ['water', 'thunder', 'shock'], ['water', 'earth', 'mud'],
    ['wind', 'fire', 'flameSpread'], ['wind', 'water', 'fog'], ['wind', 'earth', 'sandstorm'], ['wind', 'ice', 'blizzard'], ['wind', 'thunder', 'stormThunder'],
  ];
  for (const [a, b, id] of table) {
    assert.equal(f(a, b), id, `${a}+${b}`);
    assert.equal(f(b, a), id, `${b}+${a}`);
  }
  assert.equal(f('fire', 'fire'), null);
  assert.equal(f(null, 'fire'), null);
  assert.equal(f('fire', null), null);
  assert.equal(f('fire', 'earth'), null); // 表にない組
  assert.equal(f('mist', 'ice'), 'frozenMist'); // mist の組が優先（水+氷の凍結ではない）
  assert.equal(f('mist', 'fire'), 'evaporate'); // 水として
  assert.equal(f('mist', 'thunder'), 'shock');
  assert.equal(f('mist', 'water'), null); // 水と同じ
  // 混沌：どちらかが混沌なら chaosPool からランダム。混沌どうしは起きない
  assert.equal(f('chaos', 'chaos'), null);
  assert.equal(findReaction(REACTIONS, idx, 'chaos', 'fire', () => 0), REACTIONS.chaosPool[0]);
  assert.equal(findReaction(REACTIONS, idx, 'water', 'chaos', () => 0.999), REACTIONS.chaosPool.at(-1));
  assert.equal(findReaction(REACTIONS, idx, 'fire', 'chaos', () => 0.5), REACTIONS.chaosPool[5]);
});

test('applyReactionMultiplier：切り上げ。倍率なし（null）はそのまま', () => {
  assert.equal(applyReactionMultiplier(4, 1.5), 6);
  assert.equal(applyReactionMultiplier(5, 1.5), 8);
  assert.equal(applyReactionMultiplier(5, null), 5);
  assert.equal(applyReactionMultiplier(10, 1.2), 12);
});

test('付着：属性つきの攻撃が当たると付着する（無属性は付着しない）。getState に出る', () => {
  const { game, log } = newGame();
  const [foe] = setupFoes(game, [1]);
  play(game, 'plainBolt');
  assert.equal(foe.attachment, null);
  play(game, 'fireBolt');
  assert.deepEqual(game.getState(null).players.p2.soldiers[0].attachment, { element: 'fire', turns: 2 });
  const changed = ofType(log, 'attachmentChanged');
  assert.equal(changed.length, 1);
  assert.deepEqual({ ...changed[0], event: undefined }, { playerId: 'p2', soldierId: foe.soldierId, element: 'fire', turns: 2, cause: 'hit', event: undefined });
  const st = game.getState(null).players.p2.soldiers[0].statuses;
  assert.equal(st.slow, 0);
  assert.equal(st.blind, 0);
  assert.equal(st.dot, null);
  assert.equal(game.getState(null).players.p1.reactionsThisTurn, 0);
});

test('蒸発（火+水）：×1.5（切り上げ）。reactionTriggered は soldierDamaged の前。付着は消える', () => {
  const { game, log } = newGame();
  const [foe] = setupFoes(game, [1]);
  attach(foe, 'water');
  play(game, 'fireBolt5');
  const i = log.findIndex((e) => e.event === 'reactionTriggered');
  const r = log[i];
  assert.equal(r.reaction, 'evaporate');
  assert.equal(r.name, '蒸発');
  assert.equal(r.attackerId, 'p1');
  assert.equal(r.playerId, 'p2');
  assert.equal(r.soldierId, foe.soldierId);
  assert.equal(r.attached, 'water');
  assert.equal(r.element, 'fire');
  assert.equal(r.multiplier, 1.5);
  assert.equal(r.chain, undefined);
  const dmg = log.slice(i + 1).find((e) => e.event === 'soldierDamaged');
  assert.equal(dmg.amount, 8); // 5 × 1.5 = 7.5 → 8
  assert.equal(foe.hp, 92);
  assert.equal(foe.attachment, null);
  const last = ofType(log, 'attachmentChanged').at(-1);
  assert.equal(last.element, null);
  assert.equal(last.cause, 'reaction');
  assert.equal(game.players.p1.reactionsThisTurn, 1);
});

test('融解（火+氷）：×1.5、付着は水に変わる → 次のターンに雷で感電（連鎖。chain に融解）', () => {
  const { game, log } = newGame();
  const [foe] = setupFoes(game, [1]);
  attach(foe, 'ice');
  play(game, 'fireBolt');
  assert.equal(ofType(log, 'reactionTriggered')[0].reaction, 'melt');
  assert.equal(foe.hp, 100 - 6);
  assert.deepEqual(foe.attachment, { element: 'water', turns: 2, from: 'melt' });
  game.endTurn(); // p1 の番の終わり：p1 の兵士だけが減る（p2 の兵士の付着はそのまま）
  assert.equal(foe.attachment.turns, 2);
  game.endTurn(); // p2 の番の終わりに付着が1減る。p1 の番：反応の回数は0に戻る
  assert.equal(foe.attachment.turns, 1);
  assert.equal(game.players.p1.reactionsThisTurn, 0);
  play(game, 'thunderBolt');
  const r = ofType(log, 'reactionTriggered')[1];
  assert.equal(r.reaction, 'shock');
  assert.equal(r.chain, 'melt');
  assert.equal(r.multiplier, null);
});

test('凍結（水+氷）：凍結1（statusApplied）。付着は消えるが、凍結中は氷が付着しているものとして照合する', () => {
  const { game, log } = newGame();
  const [foe] = setupFoes(game, [1]);
  attach(foe, 'water');
  play(game, 'iceBolt');
  assert.equal(ofType(log, 'reactionTriggered')[0].reaction, 'freeze');
  assert.equal(foe.hp, 96); // 倍率なし
  assert.equal(foe.frozen, 1);
  assert.equal(foe.attachment, null);
  assert.ok(ofType(log, 'statusApplied').some((e) => e.status === 'frozen' && e.soldierId === foe.soldierId));
  // 凍結中（氷）に火 → 融解。凍結は治り、付着は水
  game.players.p1.reactionsThisTurn = 0;
  play(game, 'fireBolt');
  assert.equal(ofType(log, 'reactionTriggered')[1].reaction, 'melt');
  assert.equal(ofType(log, 'reactionTriggered')[1].attached, 'ice');
  assert.equal(foe.frozen, 0);
  assert.ok(ofType(log, 'statusCleared').some((e) => e.status === 'frozen'));
  assert.equal(foe.attachment.element, 'water');
});

test('感電（水+雷）：継続ダメージ1×2（盾は効かない）＋隣のマスの同じ陣地の兵士に半分（切り上げ）', () => {
  const { game, log } = newGame();
  const [target, near, same, far] = setupFoes(game, [2, 3, 2, 0]);
  attach(target, 'water');
  attach(near, 'fire'); // 近くの兵士の付着は関係ない（付着しているのは標的だけ見る）
  play(game, 'thunderBolt', { playerId: 'p2' });
  // 標的に感電。ほかの兵士は雷の魔法そのもの（4）を受け、付着しなければ付着する
  const r = ofType(log, 'reactionTriggered');
  assert.equal(r.length, 1); // 1ターン1回
  assert.equal(r[0].soldierId, target.soldierId);
  assert.deepEqual(target.dot, { amount: 1, turns: 2 });
  const splash = ofType(log, 'soldierDamaged').filter((e) => e.cause === 'reaction');
  assert.deepEqual(splash.map((e) => [e.soldierId, e.amount]).sort(), [[near.soldierId, 2], [same.soldierId, 2]].sort());
  assert.ok(!splash.some((e) => e.soldierId === far.soldierId));
  // 継続ダメージ：持ち主（p2）の進軍の前に1。盾は効かない。2回で治る
  target.shield = 5;
  game.endTurn();
  const dot = ofType(log, 'soldierDamaged').filter((e) => e.cause === 'dot');
  assert.equal(dot.length, 1);
  assert.equal(dot[0].amount, 1);
  assert.equal(target.shield, 5);
  game.endTurn();
  game.endTurn();
  assert.equal(target.dot, null);
  assert.ok(ofType(log, 'statusCleared').some((e) => e.status === 'dot'));
});

test('泥（水+土）：鈍足（速さ−1、2回の進軍。最低1）', () => {
  const { game, log } = newGame();
  const [foe] = setupFoes(game, [0], 'dummy');
  attach(foe, 'water');
  play(game, 'earthBolt');
  assert.equal(ofType(log, 'reactionTriggered')[0].reaction, 'mud');
  assert.equal(foe.slow, 2);
  assert.equal(game.getState(null).players.p2.soldiers[0].statuses.slow, 2);
  game.endTurn(); // p2：速さ3 → 2
  assert.equal(foe.position, 2);
  game.endTurn();
  game.endTurn(); // p2：もう1回 2
  assert.equal(foe.position, 4);
  assert.equal(foe.slow, 0);
  assert.ok(ofType(log, 'statusCleared').some((e) => e.status === 'slow'));
});

test('炎拡散（風+火）：標的と隣のマスの同じ陣地の兵士がやけど（reactions.json の量・回数）', () => {
  const { game } = newGame();
  const [target, near, far] = setupFoes(game, [1, 2, 4]);
  attach(target, 'wind');
  play(game, 'fireBolt');
  assert.deepEqual(target.burn, { amount: 1, turns: 2 });
  assert.deepEqual(near.burn, { amount: 1, turns: 2 });
  assert.equal(far.burn, null);
  assert.equal(target.attachment, null);
});

test('霧（風+水）：命中低下（30%・2ターン）。付着は水霧（mist）に変わる。水霧に氷で凍結霧・火で蒸発', () => {
  const { game, log } = newGame();
  const [foe] = setupFoes(game, [1]);
  attach(foe, 'wind');
  play(game, 'waterBolt');
  assert.equal(ofType(log, 'reactionTriggered')[0].reaction, 'fog');
  assert.deepEqual(foe.blind, { chance: 0.3, turns: 2 });
  assert.equal(game.getState(null).players.p2.soldiers[0].statuses.blind, 2);
  assert.deepEqual(game.getState(null).players.p2.soldiers[0].attachment, { element: 'mist', turns: 2 });
  game.players.p1.reactionsThisTurn = 0;
  play(game, 'iceBolt');
  const r = ofType(log, 'reactionTriggered')[1];
  assert.equal(r.reaction, 'frozenMist');
  assert.equal(r.attached, 'mist');
  assert.equal(r.chain, 'fog');
  assert.equal(foe.frozen, 1);
  // 別の兵士で：水霧に火 → 蒸発
  const { game: g2, log: l2 } = newGame();
  const [f2] = setupFoes(g2, [1]);
  attach(f2, 'mist');
  play(g2, 'fireBolt');
  assert.equal(ofType(l2, 'reactionTriggered')[0].reaction, 'evaporate');
});

test('凍結霧（水霧+氷）：凍結1＋命中低下', () => {
  const { game } = newGame();
  const [foe] = setupFoes(game, [1]);
  attach(foe, 'mist');
  play(game, 'iceBolt');
  assert.equal(foe.frozen, 1);
  assert.deepEqual(foe.blind, { chance: 0.3, turns: 2 });
  assert.equal(foe.attachment, null);
});

test('砂嵐（風+土）：継続ダメージ1×2＋命中低下', () => {
  const { game, log } = newGame();
  const [foe] = setupFoes(game, [1]);
  attach(foe, 'earth');
  play(game, 'windBolt');
  assert.equal(ofType(log, 'reactionTriggered')[0].reaction, 'sandstorm');
  assert.deepEqual(foe.dot, { amount: 1, turns: 2 });
  assert.deepEqual(foe.blind, { chance: 0.3, turns: 2 });
});

test('吹雪（風+氷）：標的と隣のマスの兵士に鈍足', () => {
  const { game } = newGame();
  const [target, near, far] = setupFoes(game, [1, 0, 3]);
  attach(target, 'ice');
  play(game, 'windBolt');
  assert.equal(target.slow, 2);
  assert.equal(near.slow, 2);
  assert.equal(far.slow, 0);
});

test('雷嵐（風+雷）：同じ道の同じ陣地の兵士全員に半分（範囲攻撃）。忍者には当たらない', () => {
  const { game, log } = newGame();
  game.endTurn();
  const ninja = play(game, 'ninja');
  const [target, a, b] = [play(game, 'post'), play(game, 'post'), play(game, 'post')];
  game.endTurn(); // p1 の番。位置を決め直す
  [target.position, a.position, b.position, ninja.position] = [0, 2, 4, 3];
  attach(target, 'wind');
  play(game, 'thunderBolt');
  const splash = ofType(log, 'soldierDamaged').filter((e) => e.cause === 'reaction');
  assert.deepEqual(splash.map((e) => e.soldierId).sort(), [a.soldierId, b.soldierId].sort());
  assert.ok(splash.every((e) => e.amount === 2));
  assert.ok(!ofType(log, 'soldierDamaged').some((e) => e.soldierId === ninja.soldierId));
});

test('混沌：付着か攻撃が混沌なら chaosPool からランダムに1つ（chaos: true）。混沌どうしは起きない。付着なしなら混沌が付着', () => {
  const { game, log } = newGame();
  const [foe] = setupFoes(game, [1]);
  play(game, 'chaosBolt');
  assert.equal(ofType(log, 'reactionTriggered').length, 0);
  assert.equal(foe.attachment.element, 'chaos');
  play(game, 'chaosBolt'); // 混沌どうし
  assert.equal(ofType(log, 'reactionTriggered').length, 0);
  play(game, 'fireBolt'); // 付着が混沌
  const r = ofType(log, 'reactionTriggered');
  assert.equal(r.length, 1);
  assert.equal(r[0].chaos, true);
  assert.ok(REACTIONS.chaosPool.includes(r[0].reaction));
  // 攻撃が混沌でも起きる。シードを変えると、いろいろな反応が出る
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const { game: g, log: l } = newGame({ seed });
    const [f] = setupFoes(g, [1]);
    attach(f, 'water');
    play(g, 'chaosBolt');
    const t = ofType(l, 'reactionTriggered');
    assert.equal(t.length, 1);
    seen.add(t[0].reaction);
  }
  assert.ok(seen.size >= 5, [...seen].join(','));
});

test('1ターンに1回まで（攻撃した人の自分のターン）。2回目は反応せず付着が上書きされる。reactionsPerTurn で変えられる', () => {
  const { game, log } = newGame();
  const [a, b] = setupFoes(game, [1, 3]);
  attach(a, 'water');
  attach(b, 'water');
  play(game, 'fireBolt'); // a で蒸発。b は反応せず火が付着
  assert.equal(ofType(log, 'reactionTriggered').length, 1);
  assert.equal(b.attachment.element, 'fire');
  assert.equal(b.hp, 96);
  // reactionsPerTurn: 2 なら2体とも
  const { game: g2, log: l2 } = newGame({ rules: { reactionsPerTurn: 2 } });
  const [c, d] = setupFoes(g2, [1, 3]);
  attach(c, 'water');
  attach(d, 'water');
  play(g2, 'fireBolt');
  assert.equal(ofType(l2, 'reactionTriggered').length, 2);
  // reactionsPerTurn: 0 なら反応も付着もない
  const { game: g3, log: l3 } = newGame({ rules: { reactionsPerTurn: 0 } });
  const [e] = setupFoes(g3, [1]);
  attach(e, 'water');
  play(g3, 'fireBolt');
  assert.equal(ofType(l3, 'reactionTriggered').length, 0);
  assert.equal(ofType(l3, 'attachmentChanged').length, 0);
});

test('付着の期限：持ち主のターンの終わりに1減り、0で消える（attachmentChanged cause "expired"）', () => {
  const { game, log } = newGame({ rules: { attachTurns: 1 } });
  const [foe] = setupFoes(game, [1]);
  play(game, 'fireBolt');
  assert.deepEqual(foe.attachment, { element: 'fire', turns: 1, from: null });
  game.endTurn(); // p1 の番の終わり：p1 の兵士だけが減る
  assert.equal(foe.attachment.turns, 1);
  game.endTurn(); // p2 の番の終わり：消える
  assert.equal(foe.attachment, null);
  const last = ofType(log, 'attachmentChanged').at(-1);
  assert.equal(last.cause, 'expired');
  assert.equal(last.element, null);
});

test('天候の霧で外れたら、付着も反応もしない', () => {
  const weather = { fog: { name: '霧', weight: 1, rounds: [9, 9], missChance: 1 } };
  const { game, log } = newGame({ weather, rules: { weatherChangeChance: 0 } });
  const [foe] = setupFoes(game, [1]);
  attach(foe, 'water');
  game.weather = { type: 'fog', roundsLeft: 9 };
  play(game, 'fireBolt');
  assert.equal(ofType(log, 'attackMissed').length, 1);
  assert.equal(ofType(log, 'reactionTriggered').length, 0);
  assert.equal(foe.attachment.element, 'water');
  assert.equal(foe.hp, 100);
});

test('命中低下の兵士の攻撃は、その確率で外れる（戦いで attackMissed）', () => {
  const data = structuredClone(REACTIONS);
  data.reactions.fog.effects[0].chance = 1;
  const { game, log } = newGame({ reactions: data });
  const { mine, foe } = duel(game, { prepare: (m, f) => { f.blind = { chance: 1, turns: 2 }; } });
  game.endTurn(); // p1 の進軍：歩兵が杭とぶつかる。杭（命中低下100%）の反撃は外れる
  assert.equal(ofType(log, 'soldiersClashed').length, 1);
  assert.ok(ofType(log, 'attackMissed').some((e) => e.soldierId === foe.soldierId && e.kind === 'fight'));
  assert.equal(mine.hp, 5);
});

test('ダメージの順番：基本攻撃 → 属性相性 → 天候 → ステージ → 反応倍率（最後に切り上げ）', () => {
  const weather = { sunny: { name: '晴れ', weight: 1, rounds: [9, 9], elementBonus: { fire: 2 } } };
  const { game, log } = newGame({ weather, rules: { weatherChangeChance: 0 } });
  // 歩兵（攻撃3）＋炎刃（+1、火）。杭は属性なし（相性1.0）
  const { foe } = duel(game, { weapon: 'fireBlade', prepare: (m, f) => { attach(f, 'water'); game.weather = { type: 'sunny', roundsLeft: 9 }; } });
  game.endTurn(); // p1 の進軍で戦う
  const r = ofType(log, 'reactionTriggered');
  assert.equal(r.length, 1);
  assert.equal(r[0].reaction, 'evaporate');
  const hit = ofType(log, 'soldierDamaged').find((e) => e.soldierId === foe.soldierId && e.cause === 'fight');
  assert.equal(hit.amount, 9); // (3+1) + 晴れ2 = 6 → ×1.5 = 9（反応が先なら 4×1.5+2 = 8）
  assert.ok(log.indexOf(r[0]) < log.indexOf(hit));
});

test('戦いの反撃（守る側）は付着だけで、反応しない（反応は攻撃した人の自分のターンだけ）', () => {
  const { game, log } = newGame();
  // p1 の歩兵に水。杭（氷）の反撃は氷だが、p1 の番なので反応しない
  const { mine } = duel(game, { foeWeapon: 'iceBlade', prepare: (m) => attach(m, 'water') });
  game.endTurn(); // p1 の進軍で戦う
  assert.equal(ofType(log, 'soldiersClashed').length, 1);
  assert.equal(ofType(log, 'reactionTriggered').length, 0);
  assert.equal(mine.attachment.element, 'ice');
});

test('reactions を渡さないと、付着も反応も起きない（試合の流れも反応なしと同じ）', () => {
  const { game, log } = newGame({ reactions: null });
  const [foe] = setupFoes(game, [1]);
  play(game, 'fireBolt');
  play(game, 'waterBolt');
  assert.equal(foe.attachment, null);
  assert.equal(game.getState(null).players.p2.soldiers[0].attachment, null);
  assert.equal(ofType(log, 'attachmentChanged').length, 0);
  assert.equal(ofType(log, 'reactionTriggered').length, 0);
  assert.equal(foe.hp, 92);
});

test('本物のデータ：reactions を渡さない試合と reactionsPerTurn 0 の試合は、イベントが完全に同じ', () => {
  const extra = loadOptionalData();
  const run = (opts) => {
    const { rules, cards } = buildData();
    const game = new Game({ cards, rules: { ...rules, ...opts.rules }, rng: seededRng(5), ...extra, reactions: opts.reactions });
    const log = recordEvents(game, EVENT_TYPES);
    game.start();
    // 決まった手順で何ターンか回す（出せる最初のカードを出す）
    for (let t = 0; t < 60 && game.phase !== 'gameOver'; t++) {
      if (game.phase === 'mulligan') {
        for (const id of game.playerOrder) game.mulligan(id, []);
        continue;
      }
      if (game.phase === 'defend') { game.passDefense(); continue; }
      const pid = game.currentPlayer;
      for (const c of [...game.players[pid].hand]) {
        const targets = game.getTargets(c.cardId);
        if (targets.length > 0 && game.phase === 'main') game.playCard(c.cardId, targets[0]);
        if (game.phase === 'defend') game.passDefense();
      }
      if (game.phase === 'main') game.endTurn();
      if (game.phase === 'discard') game.discard(game.players[game.currentPlayer].hand.slice(0, game.discardCount).map((c) => c.cardId));
    }
    return JSON.stringify(log);
  };
  assert.equal(run({ reactions: null, rules: {} }), run({ reactions: REACTIONS, rules: { reactionsPerTurn: 0 } }));
});

test('忍者：反応・付着のイベントには stealth が付き、相手には送らない', () => {
  const { game, log } = newGame();
  game.endTurn();
  const ninja = play(game, 'ninja');
  game.setAttachment(game.players.p2, ninja, 'fire', 'hit');
  const ev = ofType(log, 'attachmentChanged').at(-1);
  assert.equal(ev.stealth, 'p2');
  assert.equal(filterEventFor('attachmentChanged', ev, 'p1'), null);
  assert.deepEqual(filterEventFor('attachmentChanged', ev, 'p2'), ev);
  // 相手の getState には忍者そのものが出ない
  assert.equal(game.getState('p1').players.p2.soldiers.length, 0);
});

test('本物のカード（火水風土の武器）で反応が起きる：フレイムソード・アクアスピア・ゲイルボウ・アースハンマー', () => {
  const cases = [
    ['flameSword', 'water', 'evaporate'],
    ['waterSpear', 'earth', 'mud'],
    ['windBow', 'water', 'fog'],
    ['earthHammer', 'water', 'mud'],
    ['windBow', 'fire', 'flameSpread'],
    ['waterSpear', 'wind', 'fog'],
    ['earthHammer', 'wind', 'sandstorm'],
  ];
  for (const [weapon, attached, want] of cases) {
    const { rules, cards } = buildData({ rules: { ...PLAIN_START, laneCount: 1, maxMp: 0, defenseReaction: false, drawUntilHand: 0 } });
    const game = new Game({ cards, rules, rng: seededRng(3), elements: loadJson('elements.json'), reactions: REACTIONS });
    const log = recordEvents(game, EVENT_TYPES);
    game.debugSetDeck(Array(60).fill('heal'));
    game.start();
    duel(game, { weapon, foe: 'heavy', prepare: (m, f) => attach(f, attached) });
    game.endTurn(); // p1 の進軍で戦う
    const r = ofType(log, 'reactionTriggered');
    assert.equal(r.length, 1, `${weapon} → ${attached}`);
    assert.equal(r[0].reaction, want, `${weapon} → ${attached}`);
  }
});

test('魔法の element は cards.json に書ける（武器・魔法以外は例外）', () => {
  const cards = { ...loadFixture('cards.json'), fireBolt: bolt('fire') };
  new Game({ cards, rules: loadFixture('rules.json') });
  assert.throws(() => new Game({ cards: { ...cards, x: { name: 'x', kind: 'soldier', hp: 1, attack: 1, speed: 1, element: 'fire', count: 1 } }, rules: loadFixture('rules.json') }), /element/);
});
