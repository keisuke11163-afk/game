// STEP 2（武器・防御・トラップ・属性・状態異常・ドロー）のテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { loadFixture, seededRng, recordEvents } from './helpers.js';

// tests/fixtures/cards-step2.json（STEP 2 のカードを足した固定データ）と、rules は STEP 1 の固定データ＋STEP 2 の値
function setup({ p1 = [], p2 = [], deck = Array(30).fill('heal'), rules = {} } = {}) {
  const cards = loadFixture('cards-step2.json');
  const r = { ...loadFixture('rules.json'), elementBonus: 2, trapMaxPosition: 1, drawPerCardUsed: 1, ...rules };
  const game = new Game({ cards, rules: r, rng: seededRng(1) });
  game.debugSetHand('p1', p1);
  game.debugSetHand('p2', p2);
  game.debugSetDeck(deck);
  const log = recordEvents(game, EVENT_TYPES);
  game.start();
  return { game, log };
}
const idOf = (game, type) => {
  const pid = game.currentPlayer;
  return game.getState(pid).players[pid].hand.find((c) => c.type === type).cardId;
};
const play = (game, type, target) => game.playCard(idOf(game, type), target);
const soldiers = (game, pid) => game.getState(null).players[pid].soldiers;
const after = (log, i) => log.slice(i).map((e) => e.event);

test('付加・防御は何枚でも出せる。メインは1ターン1枚', () => {
  const { game } = setup({ p1: ['infantry', 'knight', 'wall', 'pit', 'pit'] });
  assert.equal(play(game, 'infantry').ok, true);
  assert.equal(play(game, 'knight').reason, 'このターンはもうメインのカードを出しました');
  assert.equal(play(game, 'wall').ok, true);
  assert.equal(play(game, 'pit', { roadId: 'p1-p2', square: 0 }).ok, true);
  assert.equal(play(game, 'pit', { roadId: 'p1-p2', square: 1 }).ok, true);
  const me = game.getState('p1').players.p1;
  assert.equal(me.playedThisTurn, true);
  assert.equal(me.cardsPlayedThisTurn, 4);
});

test('付加・防御も、何も起きないときは出せない（理由つき）', () => {
  const { game } = setup({ p1: ['flameSword', 'shield', 'poisonMist', 'frostBreath'] });
  assert.equal(game.canPlayCard(idOf(game, 'flameSword')).reason, '道の上に自分の兵士がいません');
  assert.equal(game.canPlayCard(idOf(game, 'shield')).reason, '道の上に自分の兵士がいません');
  assert.equal(game.canPlayCard(idOf(game, 'poisonMist')).reason, '道の上に相手の兵士がいません');
  assert.equal(game.canPlayCard(idOf(game, 'frostBreath')).reason, '道の上に相手の兵士がいません');
});

test('ドロー：次のターンは max(drawPerTurn, 使った枚数)。0枚でも drawPerTurn', () => {
  const { game, log } = setup({ p1: ['infantry', 'wall', 'pit'], p2: [] });
  play(game, 'infantry');
  play(game, 'wall');
  play(game, 'pit', { roadId: 'p1-p2', square: 0 });
  assert.equal(game.getState('p1').players.p1.drawNextTurn, 1); // まだターンを終えていない
  game.endTurn();
  assert.equal(game.getState('p1').players.p1.drawNextTurn, 3);
  game.endTurn(); // p2 は何も出さない
  assert.equal(game.getState('p2').players.p2.drawNextTurn, 1);
  const draws = log.filter((e) => e.event === 'cardDrawn').map((e) => [e.playerId, e.cardIds.length]);
  assert.deepEqual(draws, [['p1', 1], ['p2', 1], ['p1', 3]]);
});

test('武器：攻撃力が上がり属性がつく。1体に1つ（持ちかえ）', () => {
  const { game, log } = setup({ p1: ['infantry', 'flameSword', 'waterSpear'] });
  play(game, 'infantry');
  const sid = soldiers(game, 'p1')[0].soldierId;
  play(game, 'flameSword');
  assert.deepEqual(log.at(-1), { event: 'weaponEquipped', playerId: 'p1', soldierId: sid, type: 'flameSword', attack: 4, element: 'fire' });
  play(game, 'waterSpear', { soldierId: sid });
  const s = soldiers(game, 'p1')[0];
  assert.deepEqual([s.weapon, s.attack, s.element], ['waterSpear', 4, 'water']);
});

test('属性：強い属性の兵士は elementBonus 多く与える。属性なしには増えない', () => {
  // p1 騎士（攻5）＋水 → 攻6、p2 騎士＋火 → 攻6。水は火に強いので p1 は 6+2=8 を与える
  const { game, log } = setup({ p1: ['knight', 'waterSpear'], p2: ['knight', 'flameSword'] });
  play(game, 'knight');
  play(game, 'waterSpear');
  game.endTurn();
  play(game, 'knight');
  play(game, 'flameSword');
  game.endTurn(); // p1 騎士 0→3、1つ先に p2 騎士 → 戦う
  const dmg = log.filter((e) => e.event === 'soldierDamaged');
  assert.deepEqual(dmg.map((e) => [e.playerId, e.amount, e.cause]), [['p2', 8, 'fight'], ['p1', 6, 'fight']]);
});

test('盾：ダメージを先に受ける。重なる。blocked に入る', () => {
  const { game, log } = setup({ p1: ['infantry', 'shield', 'shield'], p2: ['thunder'] });
  play(game, 'infantry');
  play(game, 'shield');
  play(game, 'shield');
  assert.equal(soldiers(game, 'p1')[0].shield, 6);
  assert.equal(log.at(-1).shield, 6);
  game.endTurn();
  play(game, 'thunder');
  const d = log.at(-1);
  assert.deepEqual([d.event, d.amount, d.blocked, d.hp, d.cause], ['soldierDamaged', 3, 3, 5, 'spell']);
  assert.equal(soldiers(game, 'p1')[0].shield, 3);
});

test('城壁：ダメージを先に受け、次の自分のターンの始めに消える。強くないと出せない', () => {
  const { game, log } = setup({ p1: ['wall', 'wall'], p2: ['fireball'] });
  play(game, 'wall');
  assert.equal(game.canPlayCard(idOf(game, 'wall')).reason, 'もっと強い城壁があります');
  game.endTurn();
  play(game, 'fireball');
  const c = log.at(-1);
  assert.deepEqual([c.event, c.amount, c.blocked, c.hp], ['castleDamaged', 8, 5, 22]);
  game.endTurn(); // p1 のターン：もう城壁は0なので armorExpired は出ない
  assert.ok(!log.slice(-3).some((e) => e.event === 'armorExpired'));
});

test('城壁が残っていたら、ターンの始め（turnStarted のあと、ドローの前）に armorExpired', () => {
  const { game, log } = setup({ p1: ['wall'] });
  play(game, 'wall');
  game.endTurn(); game.endTurn();
  const i = log.findLastIndex((e) => e.event === 'turnStarted');
  assert.deepEqual(after(log, i).slice(0, 3), ['turnStarted', 'armorExpired', 'cardDrawn']);
  assert.equal(game.getState('p1').players.p1.armor, 0);
});

test('トラップ：自分の側だけ・1マスに1つ。相手には種類が見えない', () => {
  const { game, log } = setup({ p1: ['pit', 'pit', 'pit'] });
  const id = idOf(game, 'pit');
  assert.deepEqual(game.getTargets(id), [{ roadId: 'p1-p2', square: 0 }, { roadId: 'p1-p2', square: 1 }]);
  assert.equal(game.canPlayCard(id, { roadId: 'p1-p2', square: 3 }).reason, 'そこには出せません');
  play(game, 'pit', { roadId: 'p1-p2', square: 1 });
  assert.deepEqual(log.at(-1), { event: 'trapSet', playerId: 'p1', trapId: 't01', roadId: 'p1-p2', square: 1 });
  assert.deepEqual(game.getTargets(idOf(game, 'pit')), [{ roadId: 'p1-p2', square: 0 }]);
  assert.equal(game.getState('p1').players.p1.traps[0].type, 'pit');
  assert.equal(game.getState('p2').players.p1.traps[0].type, null);
  assert.equal(game.getState(null).players.p1.traps[0].square, 1);
});

test('トラップ：相手の兵士が進軍で入ったら発動して止まる（soldierMoved → trapTriggered → soldierDamaged）', () => {
  const { game, log } = setup({ p1: ['pit'], p2: ['infantry'] });
  play(game, 'pit', { roadId: 'p1-p2', square: 2 - 1 }); // 道のマス1
  game.endTurn();
  play(game, 'infantry'); // 道のマス4
  game.endTurn(); game.endTurn(); // p2 歩兵：4→2
  game.endTurn(); game.endTurn(); // p2 歩兵：2→1 で落とし穴
  const i = log.findIndex((e) => e.event === 'trapTriggered');
  assert.deepEqual(after(log, i - 1).slice(0, 3), ['soldierMoved', 'trapTriggered', 'soldierDamaged']);
  assert.equal(log[i - 1].to, 3); // p2 から数えて3 = 道のマス1
  assert.equal(log[i].type, 'pit');
  assert.equal(log[i + 1].cause, 'trap');
  assert.equal(log[i + 1].hp, 2);
  assert.equal(soldiers(game, 'p2')[0].position, 3);
  assert.equal(game.getState(null).players.p1.traps.length, 0);
});

test('毒：持ち主の進軍の前にダメージ。回数が終わったら statusCleared。重ねがけで増えない', () => {
  const { game, log } = setup({ p1: ['infantry'], p2: ['poisonMist', 'poisonMist'] });
  play(game, 'infantry');
  game.endTurn();
  play(game, 'poisonMist');
  assert.deepEqual(log.at(-1), { event: 'statusApplied', playerId: 'p1', soldierId: 's01', status: 'poison', turns: 3 });
  game.endTurn();
  const i = log.findLastIndex((e) => e.event === 'turnStarted');
  const seq = log.slice(i).filter((e) => e.event !== 'cardDrawn');
  assert.equal(seq[1].event, 'soldierDamaged');
  assert.deepEqual([seq[1].cause, seq[1].amount, seq[1].hp], ['poison', 1, 4]);
  assert.equal(seq[2].event, 'soldierMoved'); // 毒のあとに動く
  game.endTurn();
  play(game, 'poisonMist'); // 残り2回 → 3回にそろう（増えない）
  assert.deepEqual(soldiers(game, 'p1')[0].statuses.poison, { amount: 1, turns: 3 });
});

test('毒で HP が0になった兵士は消え、動かない', () => {
  const { game, log } = setup({ p1: ['infantry'], p2: ['poisonMist', 'thunder'] });
  play(game, 'infantry');
  game.endTurn();
  play(game, 'thunder'); // HP 2
  game.endTurn(); game.endTurn();
  play(game, 'poisonMist');
  game.endTurn(); // 毒1 → HP1（移動して戦わない）
  game.endTurn(); game.endTurn(); // 毒1 → HP0 で消える
  const destroyed = log.filter((e) => e.event === 'soldierDestroyed');
  assert.equal(destroyed.length, 1);
  assert.equal(destroyed[0].reason, 'killed');
  const i = log.indexOf(destroyed[0]);
  assert.equal(log[i - 1].cause, 'poison');
  assert.notEqual(log[i + 1]?.event, 'soldierMoved');
});

test('凍結：次の進軍で動かず、休んだら statusCleared', () => {
  const { game, log } = setup({ p1: ['knight'], p2: ['frostBreath'] });
  play(game, 'knight');
  game.endTurn();
  play(game, 'frostBreath');
  game.endTurn();
  const i = log.findLastIndex((e) => e.event === 'turnStarted');
  const seq = log.slice(i).map((e) => e.event).filter((e) => e !== 'cardDrawn');
  assert.deepEqual(seq, ['turnStarted', 'statusCleared']);
  assert.equal(soldiers(game, 'p1')[0].position, 0);
  game.endTurn(); game.endTurn();
  assert.equal(soldiers(game, 'p1')[0].position, 3);
});

test('cards.json の間違いは例外', () => {
  const cards = loadFixture('cards-step2.json');
  const rules = loadFixture('rules.json');
  assert.throws(() => new Game({ cards: { ...cards, x: { name: 'x', kind: 'weapon', count: 1 } }, rules }), /attackBonus/);
  assert.throws(() => new Game({ cards: { ...cards, x: { name: 'x', kind: 'weapon', attackBonus: 1, element: 'ice', count: 1 } }, rules }), /element/);
  assert.throws(() => new Game({ cards: { ...cards, x: { name: 'x', kind: 'trap', effect: 'boom', count: 1 } }, rules }), /effect/);
  assert.throws(() => new Game({ cards, rules: { ...rules, elementBonus: -1 } }), /elementBonus/);
});
