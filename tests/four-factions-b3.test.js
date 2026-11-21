// 四大陣営 PR-B3：台帳の取り込み（魔族軍：新規64＋既存12＝76行）。
// 新規64のうち true は 24（不死者5・武器15・生命吸収4）、false は 40（魔族戦士5・呪術師5・闇の魔法5・混沌の魔法5・呪い5・死者蘇生5・城防御5・兵士防御5）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { factionPool, isLegalForFaction } from '../js/game/Factions.js';
import { sampleDeckTypes, sampleType, sampleTypeOfRarity, dropRates, isDeckable, isDrawable } from '../js/game/Setup.js';
import { loadJson, seededRng, recordEvents, PLAIN_START } from './helpers.js';
import { buildAll, formatCards, newCardId, FACTION_IDS, ELEMENT_IDS } from '../docs/four-factions/import/build.mjs';
import { ROWS } from '../docs/four-factions/import/mapping.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = JSON.parse(readFileSync(join(ROOT, 'docs', 'four-factions', 'CASTLE_FIELD_4陣営_全295カード台帳_v1.0.json'), 'utf8'));
const CARDS = loadJson('cards.json');
const rarities = loadJson('rarities.json');
const factions = loadJson('factions.json');
const reactions = loadJson('reactions.json');
const ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const ofType = (log, t) => log.filter((e) => e.event === t);

const DEMON = LEDGER.cards.filter((r) => r.faction === '魔族軍');
const idOfRow = (row) => (row.status === '新規案' ? newCardId(row) : ROWS.find((r) => r.name === row.name).id);
const B3_NEW = DEMON.filter((r) => r.status === '新規案').map(idOfRow);
const chainIds = (chain) => ORDER.map((r) => `${chain}_${r}`);

const TRUES = [
  ...chainIds('demon_undead'),
  ...chainIds('demon_dark_scythe'), ...chainIds('demon_ice_blade'), ...chainIds('demon_chaos_staff'),
  'demon_drain_common', 'demon_drain_uncommon', 'demon_drain_epic', 'demon_drain_legendary',
].sort();
const FALSES = [
  ...chainIds('demon_warrior'), ...chainIds('demon_caster'), ...chainIds('demon_dark_spell'), ...chainIds('demon_chaos_spell'),
  ...chainIds('demon_curse'), ...chainIds('demon_revive'), ...chainIds('demon_wall'), ...chainIds('demon_armor'),
].sort();

// ================= 台帳との一致 =================

test('魔族軍は台帳で76行（新規64・既存12）。区分ごとの件数が合い、すべて cards.json に 名前・レアリティ・faction・属性・合成先で入っている', () => {
  assert.equal(DEMON.length, 76);
  assert.equal(B3_NEW.length, 64);
  assert.equal(DEMON.filter((r) => r.status === '既存').length, 12);
  const bySection = {};
  for (const r of DEMON.filter((x) => x.status === '新規案')) bySection[r.section] = (bySection[r.section] ?? 0) + 1;
  assert.deepEqual(bySection, { 兵士: 15, 武器: 15, 攻撃魔法: 10, 呪い魔法: 5, 死者蘇生: 5, 城防御: 5, 兵士防御: 5, 生命吸収: 4 });
  assert.equal(Object.values(CARDS).filter((d) => d.faction === 'demon').length, 76);
  for (const row of DEMON) {
    const id = idOfRow(row);
    const def = CARDS[id];
    assert.ok(def, `${row.name}（${id}）がない`);
    assert.equal(def.name, row.name, id);
    assert.equal(def.rarity, row.rarity, id);
    assert.equal(def.faction, 'demon', id);
    assert.equal(def.faction, FACTION_IDS[row.faction]);
    // 属性：新規の武器・魔法で台帳の属性が1つのものは element が一致（兵士・複数属性は書かない）
    if (row.status === '新規案' && (def.kind === 'weapon' || def.kind === 'spell') && Object.hasOwn(ELEMENT_IDS, row.attribute)) assert.equal(def.element ?? null, ELEMENT_IDS[row.attribute], `${id} の属性`);
    if (row.status === '新規案' && (def.kind === 'soldier' || row.attribute.includes('・'))) assert.equal(def.element, undefined, `${id} は属性を持たない`);
    // 合成先：台帳の next_name と一致（命の簒奪→魂喰らいは人間の決定で付けかえた）
    if (row.next_name) {
      assert.equal(def.fuseTo, idOfRow(DEMON.find((r) => r.name === row.next_name)), `${id} の合成先（台帳：${row.next_name}）`);
    } else assert.ok(def.fuseTo == null, `${id} は合成先なし`);
  }
});

test('既存の12枚（氷5・毒5・命の簒奪・魔力強奪）は B3 で1文字も変わっていない。効果・数値は今のまま', () => {
  const ids = DEMON.filter((r) => r.status === '既存').map(idOfRow);
  assert.equal(ids.length, 12);
  for (const id of ids) assert.equal(CARDS[id].factionOnly, undefined, `${id} は新規ではない`);
  const eff = Object.fromEntries(ids.map((id) => [id, [CARDS[id].effect, CARDS[id].amount ?? CARDS[id].turns]]));
  assert.deepEqual(eff, {
    frostBreath: ['freezeEnemySoldiers', 1], deepFreeze: ['freezeEnemySoldiers', 2], glacier: ['freezeEnemySoldiers', 3], absoluteZero: ['freezeEnemySoldiers', 4], frozenWorld: ['freezeEnemySoldiers', 6],
    poisonMist: ['poisonEnemy', 1], venom: ['poisonEnemy', 2], toxicRain: ['poisonEnemy', 3], deathMist: ['poisonEnemy', 4], plague: ['poisonEnemy', 5],
    lifeSteal: ['drainCastle', 8], manaRaid: ['drainMp', 4],
  });
});

test('取り込み前の226枚（B2 まで）は1文字も変わっていない（B3 は末尾に足しただけ）', () => {
  const before = Object.fromEntries(Object.entries(CARDS).filter(([id]) => !B3_NEW.includes(id)).map(([id, d]) => [id, { ...d }]));
  assert.equal(Object.keys(before).length, 226);
  assert.equal(before.lifeSteal.fuseTo, 'demon_drain_epic'); // 人間の決定で付けかえた（それ以前は null）
  before.lifeSteal.fuseTo = null;
  assert.equal(createHash('sha256').update(JSON.stringify(before)).digest('hex'), '8bb784d37c2b69a87790c597c60be14ca961f87249ccb27753c0174578bf6054');
  assert.equal(Object.keys(CARDS).length, 290);
});

test('陣営なしの山札は B3 の前後で同じシードなら同じ並び（B3 の新規64枚を取り除いても変わらない）。ゲーム開始時の手札・山札も同じ', () => {
  // 命の簒奪の合成先（魂喰らい）は B3 の新規なので、取り除いた側では null にする（引き当てには関係しない）
  const legacy = Object.fromEntries(Object.entries(CARDS).filter(([id]) => !B3_NEW.includes(id)).map(([id, d]) => [id, id === 'lifeSteal' ? { ...d, fuseTo: null } : d]));
  for (const seed of [1, 2, 9, 33]) {
    assert.deepEqual(sampleDeckTypes(CARDS, rarities, 300, seededRng(seed)), sampleDeckTypes(legacy, rarities, 300, seededRng(seed)));
  }
  const rules = { ...loadJson('rules.json'), ...PLAIN_START };
  for (const seed of [5, 6]) {
    const g1 = new Game({ cards: CARDS, rules, rarities, rng: seededRng(seed) });
    const g2 = new Game({ cards: legacy, rules, rarities, rng: seededRng(seed) });
    const ids = (g) => [...g.pileOf('p1').deck, ...g.players.p1.hand, ...g.players.p2.hand].map((c) => `${c.cardId}:${c.type}`);
    assert.deepEqual(ids(g1), ids(g2));
  }
});

test('ID・名前の衝突がない。新しいIDは chain_id_rarity。生成スクリプトは冪等で、衝突したら止まる', () => {
  const names = Object.values(CARDS).map((d) => d.name);
  assert.equal(new Set(names).size, names.length, '名前の重複');
  for (const id of B3_NEW) assert.match(id, /^demon_[a-z_]+_(common|uncommon|rare|epic|legendary)$/);
  const shopText = readFileSync(join(ROOT, 'data', 'shop.json'), 'utf8');
  const cardsText = readFileSync(join(ROOT, 'data', 'cards.json'), 'utf8');
  const out = buildAll({ ledger: LEDGER, cards: JSON.parse(cardsText), shop: JSON.parse(shopText) });
  assert.equal(formatCards(out.cards), cardsText);
  assert.equal(`${JSON.stringify(out.shop, null, 2)}\n`, shopText);
  assert.equal(out.storiesJs, readFileSync(join(ROOT, 'js', 'ui', 'stories-factions.js'), 'utf8'));
  assert.equal(out.table, readFileSync(join(ROOT, 'docs', 'four-factions', 'import', 'table.md'), 'utf8'));
  const clash = JSON.parse(cardsText);
  delete clash.demon_undead_common;
  clash.demon_undead_common = { ...CARDS.infantry };
  assert.throws(() => buildAll({ ledger: LEDGER, cards: clash, shop: JSON.parse(shopText) }), /ぶつかります/);
});

test('implemented：不死者5・武器15・生命吸収4＝24枚が true、魔族戦士・呪術師・闇と混沌の魔法・呪い・蘇生・城防御・兵士防御＝40枚が false（理由・effectPlan つき）', () => {
  const falses = B3_NEW.filter((id) => CARDS[id].implemented === false).sort();
  const trues = B3_NEW.filter((id) => CARDS[id].implemented === true).sort();
  assert.deepEqual(falses, FALSES);
  assert.deepEqual(trues, TRUES);
  assert.equal(falses.length, 40);
  assert.equal(trues.length, 24);
  for (const id of falses) {
    assert.equal(CARDS[id].effect, undefined, `${id} に効果はまだない`);
    assert.ok(CARDS[id].effectPlan, `${id} の effectPlan`);
    assert.ok(CARDS[id].implementationNote, `${id} の implementationNote`);
    assert.ok(CARDS[id].description.startsWith('【準備中】'), id);
  }
  for (const id of B3_NEW) { assert.equal(CARDS[id].factionOnly, true); assert.equal(CARDS[id].count, 0); }
});

// ================= 引き当て・陣営モード =================

test('陣営なしのモード：B3 の新規カードは、山札・ドローの引き当て・入手券・魔物のごほうびに出ない。false はデッキ編成にも入れられない', () => {
  const rng = seededRng(22);
  assert.equal(sampleDeckTypes(CARDS, rarities, 4000, rng).filter((t) => B3_NEW.includes(t)).length, 0);
  for (let i = 0; i < 1500; i++) assert.ok(!B3_NEW.includes(sampleType(CARDS, rarities, rng, { from: 'rare', multiplier: 4 })));
  for (const r of ORDER) for (let i = 0; i < 300; i++) assert.ok(!B3_NEW.includes(sampleTypeOfRarity(CARDS, r, rng)));
  const rates = dropRates(CARDS, rarities);
  for (const id of B3_NEW) assert.equal(rates[id], 0, id);
  for (const id of B3_NEW) assert.equal(isDeckable(CARDS[id]), CARDS[id].implemented !== false, id);
  for (const id of B3_NEW) assert.equal(isDrawable(CARDS[id]), false, id);
  assert.equal(isDrawable(CARDS.demon_undead_common, true), true);
  assert.equal(isDrawable(CARDS.demon_curse_common, true), false);
});

test('魔族の陣営モード：候補は 魔族＋共通 の implemented: true だけ。B3 の true の24枚が入り、false の40枚は出ない（複数シード・全経路）', () => {
  const pool = factionPool(CARDS, 'demon');
  for (const id of B3_NEW) assert.equal(pool.has(id), CARDS[id].implemented !== false, id);
  for (const t of pool) {
    assert.ok(['demon', 'common'].includes(CARDS[t].faction), t);
    assert.notEqual(CARDS[t].implemented, false, t);
  }
  const rules = { ...loadJson('rules.json'), ...PLAIN_START };
  const seen = new Set();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const g = new Game({ cards: CARDS, rules, rarities, factions, rng: seededRng(seed), setup: { faction: 'demon' } });
    const pile = g.pileOf('p1');
    for (const x of [...pile.deck, ...pile.discard, ...g.players.p1.hand, ...g.players.p2.hand]) {
      assert.ok(isLegalForFaction(CARDS[x.type], 'demon'), `${seed}: ${x.type}`);
      assert.notEqual(CARDS[x.type].implemented, false, x.type);
      seen.add(x.type);
    }
  }
  for (const t of ['demon_undead_common', 'demon_dark_scythe_common', 'demon_ice_blade_common', 'demon_chaos_staff_common', 'demon_drain_common', 'poisonMist', 'frostBreath']) assert.ok(seen.has(t), `${t} が山札に入る`);
  for (const id of FALSES) {
    assert.equal(pool.has(id), false, `${id} は候補に出ない`);
    assert.equal(isDrawable(CARDS[id], true), false, id);
  }
  for (let seed = 1; seed <= 20; seed++) for (const t of sampleDeckTypes(CARDS, rarities, 300, seededRng(seed), pool)) assert.equal(FALSES.includes(t), false, `${seed}: ${t}`);
  const rng = seededRng(9);
  for (const r of ORDER) for (let i = 0; i < 200; i++) assert.notEqual(CARDS[sampleTypeOfRarity(CARDS, r, rng, pool)].implemented, false);
});

test('B3 は王国・森の陣営モードの候補を変えない', () => {
  for (const f of ['kingdom', 'forest']) {
    const pool = factionPool(CARDS, f);
    for (const id of B3_NEW) assert.equal(pool.has(id), false, `${f}: ${id}`);
  }
});

// ================= 効果（実際に動かす） =================

function newGame(rules = {}) {
  const cards = { ...CARDS, post: { name: '杭', kind: 'soldier', hp: 100, attack: 1, speed: 1, count: 1, rarity: 'common', fuseTo: null, weight: 0 } };
  const game = new Game({ cards, rules: { ...loadJson('rules.json'), ...PLAIN_START, laneLength: 5, laneCount: 3, defenseReaction: false, ...rules }, reactions, rarities, rng: seededRng(1) });
  const log = recordEvents(game, EVENT_TYPES);
  game.debugSetDeck(Array(60).fill('heal'));
  game.start();
  return { game, log };
}
function play(game, type, target) {
  const p = game.players[game.currentPlayer];
  p.playedThisTurn = false; p.soldiersPlayedThisTurn = 0; p.mp = 30;
  game.debugSetHand(p.id, [type]);
  const r = game.playCard(p.hand[0].cardId, target);
  assert.equal(r.ok, true, `${type}: ${r.reason}`);
  return p.soldiers.at(-1);
}
function pass(game) {
  game.endTurn();
  if (game.phase === 'discard') {
    const me = game.currentPlayer;
    const hand = game.getState(me).players[me].hand;
    game.discard(hand.slice(0, game.discardCount ?? hand.length).map((c) => c.cardId));
  }
}
const lanes = (game) => game.getState('p1').roads.map((r) => r.roadId);

test('不死者（骸骨兵〜不死王）：硬くて遅い進む兵士。出して進軍し、相手の城に 攻撃力×2 のダメージ。王国の同レアの兵士より HP が高く、攻撃が低く、遅い', () => {
  const STATS = { common: [7, 3, 1], uncommon: [8, 5, 1], rare: [14, 5, 1], epic: [16, 7, 1], legendary: [20, 10, 2] };
  const KINGDOM = { common: 'infantry', uncommon: 'spearman', rare: 'heavy', epic: 'giant', legendary: 'hero' };
  for (const [r, [hp, atk, speed]] of Object.entries(STATS)) {
    const id = `demon_undead_${r}`;
    assert.equal(CARDS[id].role, undefined, '進む兵士');
    // 上位互換にも下位互換にもならない（HP は上、攻撃と速さは下）
    const k = CARDS[KINGDOM[r]];
    assert.ok(hp > k.hp && atk < k.attack && speed < k.speed, `${id} は ${KINGDOM[r]} と長所・短所が逆`);
    const { game, log } = newGame({ monsterSpawnChance: 0 }); // 遅い兵士が魔物に止められないように
    const s = play(game, id, { playerId: 'p2', roadId: lanes(game)[2] });
    assert.equal(s.hp, hp); assert.equal(game.attackOf(s), atk); assert.equal(s.speed ?? CARDS[id].speed, speed);
    const before = game.players.p2.castle.hp;
    for (let i = 0; i < 12 && !ofType(log, 'castleDamaged').some((e) => e.source?.soldierId === s.soldierId); i++) { pass(game); pass(game); }
    const dmg = ofType(log, 'castleDamaged').find((e) => e.source?.soldierId === s.soldierId);
    assert.ok(dmg, `${id} が城に着いた`);
    assert.equal(dmg.amount, atk * loadJson('rules.json').soldierCastleDamageMultiplier);
    assert.ok(game.players.p2.castle.hp < before);
  }
});

test('魔族の武器15枚：攻撃補正 +1/+2/+4/+6/+9 と属性（闇・氷・混沌）が実際に付く', () => {
  const BONUS = [1, 2, 4, 6, 9];
  for (const [chain, el] of [['demon_dark_scythe', 'dark'], ['demon_ice_blade', 'ice'], ['demon_chaos_staff', 'chaos']]) {
    ORDER.forEach((r, i) => {
      const id = `${chain}_${r}`;
      assert.equal(CARDS[id].attackBonus, BONUS[i]);
      assert.equal(CARDS[id].element, el);
      const { game, log } = newGame();
      const mine = play(game, 'post', { playerId: 'p2', roadId: lanes(game)[0] });
      play(game, id, { soldierId: mine.soldierId });
      const e = ofType(log, 'weaponEquipped').at(-1);
      assert.equal(e.type, id);
      assert.equal(e.attack, 1 + BONUS[i], `${id} の攻撃力`);
      assert.equal(e.element, el);
      assert.equal(mine.element, el);
    });
  }
});

test('魔族の武器の属性相性：闇の鎌の兵士は光の槍の兵士に有利（闇↔光は互いに有利）', () => {
  const { game, log } = newGame();
  const lane = lanes(game)[1];
  const mine = play(game, 'post', { playerId: 'p2', roadId: lane });
  play(game, 'demon_dark_scythe_common', { soldierId: mine.soldierId });
  assert.equal(mine.element, 'dark');
  assert.equal(ofType(log, 'weaponEquipped').at(-1).element, 'dark');
});

test('生命吸収（魂の欠片・生命吸収・魂喰らい・冥府の収穫）：基準ダメージ 3/5/12/18（命の簒奪＝8 の系統）。城に実際に通ったぶんだけ自城を回復', () => {
  const AMOUNT = { demon_drain_common: 3, demon_drain_uncommon: 5, lifeSteal: 8, demon_drain_epic: 12, demon_drain_legendary: 18 };
  for (const [id, amount] of Object.entries(AMOUNT)) {
    assert.equal(CARDS[id].effect, 'drainCastle');
    assert.equal(CARDS[id].amount, amount);
    const { game, log } = newGame();
    game.players.p1.castle.hp -= 30;
    const mine = game.players.p1.castle.hp;
    const foe = game.players.p2.castle.hp;
    play(game, id, { playerId: 'p2' });
    assert.equal(ofType(log, 'castleDamaged').at(-1).amount, amount, `${id} のダメージ`);
    assert.equal(game.players.p2.castle.hp, foe - amount);
    assert.equal(game.players.p1.castle.hp, mine + amount, `${id} の回復`);
    assert.equal(ofType(log, 'castleHealed').at(-1).amount, amount);
    assert.equal(game.players.p1.mp, 30 - rarities[CARDS[id].rarity].mpCost, '攻撃の魔法なので MP を使う');
  }
});

test('生命吸収：相手の城壁が受けたぶんは回復しない（防がれれば回復も減る）。ダメージが全部防がれれば回復なし', () => {
  const { game, log } = newGame();
  game.endTurn();
  play(game, 'wall', { playerId: 'p2' }); // p2 が城壁5
  game.endTurn();
  game.players.p1.castle.hp -= 30;
  const mine = game.players.p1.castle.hp;
  const armor = game.players.p2.armor;
  assert.ok(armor >= 3);
  play(game, 'demon_drain_epic', { playerId: 'p2' }); // 12 ダメージ。城壁が先に受ける
  const dmg = ofType(log, 'castleDamaged').at(-1);
  assert.equal(dmg.blocked, Math.min(armor, 12));
  assert.equal(game.players.p1.castle.hp, mine + (12 - dmg.blocked), '実際に減らしたぶんだけ回復');
});

test('implemented: false（魔族戦士・呪術師・闇と混沌の魔法・呪い・蘇生・城防御・兵士防御）は、手札に来ても出せない・合成できない（実際の効果はまだない）', () => {
  const rules = { ...loadJson('rules.json'), ...PLAIN_START };
  const types = ['demon_warrior_common', 'demon_caster_common', 'demon_dark_spell_common', 'demon_chaos_spell_common', 'demon_curse_common', 'demon_revive_common', 'demon_wall_common', 'demon_armor_common'];
  const g = new Game({ cards: CARDS, rules, rarities, rng: seededRng(2) });
  g.debugSetHand('p1', [...types, 'demon_curse_common']);
  g.start();
  const hand = g.players.p1.hand.map((x) => x.cardId).slice(0, types.length + 1); // 最初に決めた9枚（start のドローは除く）
  for (const c of hand) assert.equal(g.canPlayCard(c).reason, 'このカードの効果はまだありません');
  assert.equal(g.canFuse(hand[4], hand.at(-1)).reason, 'このカードの効果はまだありません');
  assert.equal(g.playCard(hand[5]).ok, false);
});

// ================= 合成 =================

function fuseOnce(type, other = type) {
  const { game, log } = newGame();
  game.debugSetHand('p1', [type, other]);
  const [a, b] = game.players.p1.hand.map((x) => x.cardId);
  const r = game.fuse(a, b);
  assert.equal(r.ok, true, `${type}: ${r.reason}`);
  return ofType(log, 'cardsFused').at(-1).to;
}

test('合成の系統：B3 の各系統が コモンから レジェンドまで途切れず、すべて魔族軍の中（命の簒奪は台帳と違い合成先 null なので、生命吸収の系統だけ途切れる）', () => {
  const chain = (id) => { const out = [id]; while (typeof CARDS[out.at(-1)].fuseTo === 'string') out.push(CARDS[out.at(-1)].fuseTo); return out; };
  const starts = ['demon_undead', 'demon_warrior', 'demon_caster', 'demon_dark_scythe', 'demon_ice_blade', 'demon_chaos_staff', 'demon_dark_spell', 'demon_chaos_spell', 'demon_curse', 'demon_revive', 'demon_wall', 'demon_armor'].map((s) => `${s}_common`);
  for (const s of [...starts, 'frostBreath', 'poisonMist']) {
    const c = chain(s);
    assert.deepEqual(c.map((id) => CARDS[id].rarity), ORDER, `${s}: ${c.join(' → ')}`);
    for (const id of c) assert.equal(CARDS[id].faction, 'demon', `${s} の系統の ${id}`);
  }
  // 生命吸収：コモン → アンコモン → 命の簒奪 → 魂喰らい → 冥府の収穫（命の簒奪→魂喰らいは人間の決定で付けかえた）
  assert.deepEqual(chain('demon_drain_common'), ['demon_drain_common', 'demon_drain_uncommon', 'lifeSteal', 'demon_drain_epic', 'demon_drain_legendary']);
  assert.equal(CARDS.manaRaid.fuseTo, null);
  // 実際の合成（implemented: true の系統）
  assert.equal(fuseOnce('demon_undead_common'), 'demon_undead_uncommon');
  assert.equal(fuseOnce('demon_dark_scythe_epic'), 'demon_dark_scythe_legendary');
  assert.equal(fuseOnce('demon_drain_uncommon'), 'lifeSteal');
  assert.equal(fuseOnce('adapt', 'demon_ice_blade_uncommon'), 'demon_ice_blade_rare');
});

test('スキン・ストーリー：新しい兵士・魔法にはスキン、B3 の新規64枚すべてにストーリー', async () => {
  const shop = loadJson('shop.json');
  const { CARD_STORIES } = await import('../js/ui/stories.js');
  for (const id of B3_NEW) {
    assert.ok(CARD_STORIES[id], `${id} のストーリー`);
    const def = CARDS[id];
    if (def.kind === 'soldier') assert.equal(shop.items[`skin_${id}`]?.target, id);
    if (def.kind === 'spell') assert.equal(shop.items[`fxskin_${id}`]?.target, id);
  }
});
