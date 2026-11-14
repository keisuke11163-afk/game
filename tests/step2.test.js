// STEP 2（武器・防御・属性・状態異常・ドロー）のテスト。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { loadFixture, seededRng, recordEvents } from './helpers.js';

// tests/fixtures/cards-step2.json（STEP 2 のカードを足した固定データ）と、rules は STEP 1 の固定データ＋STEP 2 の値
function setup({ p1 = [], p2 = [], deck = Array(30).fill('heal'), rules = {} } = {}) {
  const cards = loadFixture('cards-step2.json');
  const r = { ...loadFixture('rules.json'), elementBonus: 2, ...rules };
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
  const { game } = setup({ p1: ['infantry', 'knight', 'wall', 'shield', 'shield', 'flameSword'] });
  assert.equal(play(game, 'infantry').ok, true);
  assert.equal(play(game, 'knight').reason, 'このターンはもうメインのカードを出しました');
  assert.equal(play(game, 'wall').ok, true);
  assert.equal(play(game, 'shield').ok, true);
  assert.equal(play(game, 'shield').ok, true);
  assert.equal(play(game, 'flameSword').ok, true);
  const me = game.getState('p1').players.p1;
  assert.equal(me.playedThisTurn, true);
  assert.equal(me.cardsPlayedThisTurn, 5);
});

test('付加・防御も、何も起きないときは出せない（理由つき）', () => {
  const { game } = setup({ p1: ['flameSword', 'shield', 'poisonMist', 'frostBreath'] });
  assert.equal(game.canPlayCard(idOf(game, 'flameSword')).reason, '道の上に自分の兵士がいません');
  assert.equal(game.canPlayCard(idOf(game, 'shield')).reason, '道の上に自分の兵士がいません');
  assert.equal(game.canPlayCard(idOf(game, 'poisonMist')).reason, '道の上に相手の兵士がいません');
  assert.equal(game.canPlayCard(idOf(game, 'frostBreath')).reason, '道の上に相手の兵士がいません');
});

test('ドロー：使った枚数によらず、毎ターン drawPerTurn 枚', () => {
  const { game, log } = setup({ p1: ['infantry', 'wall', 'shield'], p2: [] });
  play(game, 'infantry');
  play(game, 'wall');
  play(game, 'shield');
  game.endTurn();
  game.endTurn(); // p2 は何も出さない
  const draws = log.filter((e) => e.event === 'cardDrawn').map((e) => [e.playerId, e.cardIds.length]);
  assert.deepEqual(draws, [['p1', 1], ['p2', 1], ['p1', 1]]);
  assert.equal(game.getState('p1').players.p1.drawNextTurn, undefined);
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
  assert.equal(game.canPlayCard(idOf(game, 'wall')).reason, '同じか、より強い城壁がもう置いてあります');
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

test('毒：持ち主の進軍の前にダメージ。回数が終わったら statusCleared。重ねがけで増えない', () => {
  const { game, log } = setup({ p1: ['infantry'], p2: ['poisonMist', 'poisonMist'] });
  play(game, 'infantry');
  game.endTurn();
  play(game, 'poisonMist');
  assert.deepEqual(log.at(-1), { event: 'statusApplied', playerId: 'p1', soldierId: 's01', status: 'poison', turns: 4 });
  game.endTurn();
  const i = log.findLastIndex((e) => e.event === 'turnStarted');
  const seq = log.slice(i).filter((e) => e.event !== 'cardDrawn');
  assert.equal(seq[1].event, 'soldierDamaged');
  assert.deepEqual([seq[1].cause, seq[1].amount, seq[1].hp], ['poison', 1, 4]);
  assert.equal(seq[2].event, 'soldierMoved'); // 毒のあとに動く
  game.endTurn();
  play(game, 'poisonMist'); // 残り3回 → 4回にそろう（増えない）
  assert.deepEqual(soldiers(game, 'p1')[0].statuses.poison, { amount: 1, turns: 4 });
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
  assert.throws(() => new Game({ cards: { ...cards, x: { name: 'x', kind: 'defense', effect: 'boom', count: 1 } }, rules }), /effect/);
  assert.throws(() => new Game({ cards: { ...cards, x: { name: 'x', kind: 'trap', effect: 'pit', amount: 3, count: 1 } }, rules }), /kind/);
  assert.throws(() => new Game({ cards, rules: { ...rules, elementBonus: -1 } }), /elementBonus/);
});

test('同じ武器をもう一度は持たせられない。全員もう凍結していたら氷の息は出せない', () => {
  const { game } = setup({ p1: ['infantry', 'flameSword', 'flameSword'], p2: ['frostBreath'] });
  play(game, 'infantry');
  play(game, 'flameSword');
  assert.equal(game.canPlayCard(idOf(game, 'flameSword')).reason, 'もう同じ武器を持っています');
  game.endTurn();
  game.players.p1.soldiers[0].frozen = 1;
  assert.equal(game.canPlayCard(idOf(game, 'frostBreath')).reason, 'もう同じ状態になっています');
  game.players.p1.soldiers[0].frozen = 0;
  assert.equal(game.canPlayCard(idOf(game, 'frostBreath')).ok, true);
});

test('毒の最後の1回で消えるときは statusCleared を出さない', () => {
  const { game, log } = setup({ p2: ['knight'] });
  game.endTurn();
  play(game, 'knight');
  game.endTurn();
  game.players.p2.soldiers[0].hp = 1;
  game.players.p2.soldiers[0].poison = { amount: 1, turns: 1 };
  game.endTurn(); // p2 のターン：毒で消える
  const k = log.findLastIndex((e) => e.event === 'soldierDestroyed');
  assert.equal(log[k - 1].cause, 'poison');
  assert.ok(!log.some((e) => e.event === 'statusCleared'));
});
test('属性：火は木に強く、木は水に強い。城へのダメージには属性が乗らない', () => {
  const { game } = setup();
  const fire = { attack: 3, element: 'fire' };
  const wood = { attack: 3, element: 'wood' };
  const water = { attack: 3, element: 'water' };
  assert.equal(game.fightDamage(fire, wood), 5);
  assert.equal(game.fightDamage(wood, water), 5);
  assert.equal(game.fightDamage(wood, fire), 3);
  assert.equal(game.fightDamage(fire, { attack: 3, element: null }), 3);
});

test('cards の間違い：兵士に element', () => {
  const cards = loadFixture('cards-step2.json');
  const rules = loadFixture('rules.json');
  assert.throws(() => new Game({ cards: { ...cards, infantry: { ...cards.infantry, element: 'fire' } }, rules }), /element/);
});
