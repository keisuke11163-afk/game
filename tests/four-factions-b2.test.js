// 四大陣営 PR-B2：台帳の取り込み（森の同盟の残り：兵士15・攻撃魔法20・回復5・城防御5・兵士防御5＝新規50、既存13の確認）。
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

const FOREST = LEDGER.cards.filter((r) => r.faction === '森の同盟');
const B1_SECTIONS = ['武器'];
const B2 = FOREST.filter((r) => !B1_SECTIONS.includes(r.section));
const idOfRow = (row) => (row.status === '新規案' ? newCardId(row) : ROWS.find((r) => r.name === row.name).id);
const B2_NEW = B2.filter((r) => r.status === '新規案').map(idOfRow);
const isB1Id = (id) => CARDS[id].faction === 'kingdom' || /^forest_(fire_sword|water_lance|wind_bow|earth_hammer)_/.test(id);

const FALSES = [
  ...ORDER.map((r) => `forest_druid_${r}`), ...ORDER.map((r) => `forest_life_heal_${r}`),
  ...['water', 'wind', 'earth'].flatMap((e) => ORDER.map((r) => `forest_${e}_magic_${r}`)),
  ...['rare', 'epic', 'legendary'].map((r) => `forest_plant_armor_${r}`),
].sort();

// ================= 台帳との一致 =================

test('陣営なしの山札は B2 の前後で同じシードなら同じ並び（B2 の新規50枚を取り除いても変わらない）。ゲーム開始時の手札・山札も同じ', () => {
  const legacy = Object.fromEntries(Object.entries(CARDS).filter(([id]) => !B2_NEW.includes(id)));
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

test('森の同盟は台帳で83行（武器20＋B2の63）。B2 は新規50＋既存13。すべて cards.json に、名前・レアリティ・faction・合成先・属性で入っている', () => {
  assert.equal(FOREST.length, 83);
  assert.equal(B2.length, 63);
  assert.equal(B2_NEW.length, 50);
  assert.equal(B2.filter((r) => r.status === '既存').length, 13);
  const bySection = {};
  for (const r of B2.filter((x) => x.status === '新規案')) bySection[r.section] = (bySection[r.section] ?? 0) + 1;
  assert.deepEqual(bySection, { 兵士: 15, 攻撃魔法: 20, 回復魔法: 5, 城防御: 5, 兵士防御: 5 });
  for (const row of FOREST) {
    const id = idOfRow(row);
    const def = CARDS[id];
    assert.ok(def, `${row.name}（${id}）がない`);
    assert.equal(def.name, row.name, id);
    assert.equal(def.rarity, row.rarity, id);
    assert.equal(def.faction, 'forest', id);
    assert.equal(def.faction, FACTION_IDS[row.faction]);
    // 属性：武器・魔法で、台帳の属性が1つのものは element が一致（兵士・複数属性は書かない）
    const el = ELEMENT_IDS[row.attribute];
    if (row.status === '新規案' && (def.kind === 'weapon' || def.kind === 'spell') && Object.hasOwn(ELEMENT_IDS, row.attribute)) assert.equal(def.element ?? null, el, `${id} の属性`);
    if (def.kind === 'soldier' || row.attribute.includes('・')) assert.equal(def.element, undefined, `${id} は属性を持たない`);
    // 合成先（既存カードも含めて、台帳の next_name と一致）
    if (row.next_name) assert.equal(def.fuseTo, idOfRow(FOREST.find((r) => r.name === row.next_name)), `${id} の合成先（台帳：${row.next_name}）`);
    else assert.ok(def.fuseTo == null, `${id} は合成先なし`);
  }
});

test('既存の13枚（精霊召喚12・ゲイルフォース）は台帳と名前・陣営・レアリティ・合成先が合っていて、効果・数値は変わっていない', () => {
  const ids = B2.filter((r) => r.status === '既存').map(idOfRow);
  assert.equal(ids.length, 13);
  for (const id of ids) assert.equal(CARDS[id].factionOnly, undefined, `${id} は新規ではない`);
  assert.equal(CARDS.galeForce.effect, 'pushBackEnemySoldiers');
  assert.equal(CARDS.fireSpirit.effect, 'summonSpirit');
});

test('取り込み前の176枚（B1 まで）は1文字も変わっていない（B2 は末尾に足しただけ）', () => {
  const before = Object.fromEntries(Object.entries(CARDS).filter(([id]) => !B2_NEW.includes(id) && !/^demon_/.test(id)).map(([id, d]) => [id, { ...d }])); // B3 の新規（demon_*）も除く
  assert.equal(before.lifeSteal.fuseTo, 'demon_drain_epic'); // 人間の決定（B3）で魂喰らいへ付けかえた。それ以前は null
  before.lifeSteal.fuseTo = null;
  assert.equal(Object.keys(before).length, 176);
  const hash = createHash('sha256').update(JSON.stringify(before)).digest('hex');
  assert.equal(hash, 'd6851743d79c9afbe41d04ffc4819ae95f5935d578dc741b464090abdb7079f9');
  assert.equal(Object.keys(CARDS).length, 290); // B3 で 64 枚増えた（B2 の時点は 226）
});

test('ID・名前の衝突がない。新しいIDは chain_id_rarity。生成スクリプトは冪等', () => {
  const names = Object.values(CARDS).map((d) => d.name);
  assert.equal(new Set(names).size, names.length, '名前の重複');
  for (const id of B2_NEW) assert.match(id, /^forest_[a-z_]+_(common|uncommon|rare|epic|legendary)$/);
  const shopText = readFileSync(join(ROOT, 'data', 'shop.json'), 'utf8');
  const cardsText = readFileSync(join(ROOT, 'data', 'cards.json'), 'utf8');
  const out = buildAll({ ledger: LEDGER, cards: JSON.parse(cardsText), shop: JSON.parse(shopText) });
  assert.equal(formatCards(out.cards), cardsText);
  assert.equal(`${JSON.stringify(out.shop, null, 2)}\n`, shopText);
  assert.equal(out.storiesJs, readFileSync(join(ROOT, 'js', 'ui', 'stories-factions.js'), 'utf8'));
  assert.equal(out.table, readFileSync(join(ROOT, 'docs', 'four-factions', 'import', 'table.md'), 'utf8'));
  assert.equal(out.newIds.length, 154); // B1〜B3 の合計（B2 の時点は 90。B3 で +64）
  assert.equal(out.newIds.filter((id) => out.cards[id].implemented === false).length, 78); // 同じく（B2 の時点は 38。B3 で +40）
  // 衝突したら止まる
  const clash = JSON.parse(cardsText);
  delete clash.forest_fire_magic_common;
  clash.forest_fire_magic_common = { ...CARDS.bolt };
  assert.throws(() => buildAll({ ledger: LEDGER, cards: clash, shop: JSON.parse(shopText) }), /ぶつかります/);
});

test('implemented：ドルイド5・回復5・水風土の攻撃魔法15・葉の衣のレア以上3＝28枚が false（理由・effectPlan つき）、ほかの新規22枚は true', () => {
  const falses = B2_NEW.filter((id) => CARDS[id].implemented === false).sort();
  assert.deepEqual(falses, FALSES);
  assert.equal(B2_NEW.filter((id) => CARDS[id].implemented === true).length, 22);
  assert.equal(falses.length, 28);
  for (const id of falses) assert.equal(CARDS[id].effect, undefined, `${id} に効果はまだない`);
  const trues = B2_NEW.filter((id) => CARDS[id].implemented === true).sort();
  assert.deepEqual(trues, [...ORDER.map((r) => `forest_beast_${r}`), ...ORDER.map((r) => `forest_elf_${r}`), ...ORDER.map((r) => `forest_fire_magic_${r}`), ...ORDER.map((r) => `forest_plant_wall_${r}`), 'forest_plant_armor_common', 'forest_plant_armor_uncommon'].sort());
  for (const id of falses) {
    assert.ok(CARDS[id].effectPlan, `${id} の effectPlan`);
    assert.ok(CARDS[id].implementationNote, `${id} の implementationNote`);
    assert.ok(CARDS[id].description.startsWith('【準備中】'), id);
  }
    for (const id of B2_NEW) assert.equal(CARDS[id].factionOnly, true);
  for (const id of B2_NEW) assert.equal(CARDS[id].count, 0);
});

// ================= 引き当て・陣営モード =================

test('陣営なしのモード：B2 の新規カードは、山札・ドローの引き当て・入手券・魔物のごほうびに出ない。false はデッキ編成にも入れられない', () => {
  const rng = seededRng(21);
  const deck = sampleDeckTypes(CARDS, rarities, 4000, rng);
  assert.equal(deck.filter((t) => B2_NEW.includes(t)).length, 0);
  for (let i = 0; i < 1500; i++) assert.ok(!B2_NEW.includes(sampleType(CARDS, rarities, rng, { from: 'rare', multiplier: 4 })));
  for (const r of ORDER) for (let i = 0; i < 300; i++) assert.ok(!B2_NEW.includes(sampleTypeOfRarity(CARDS, r, rng)));
  const rates = dropRates(CARDS, rarities);
  for (const id of B2_NEW) assert.equal(rates[id], 0, id);
  for (const id of B2_NEW) assert.equal(isDeckable(CARDS[id]), CARDS[id].implemented !== false, id);
  for (const id of B2_NEW) assert.equal(isDrawable(CARDS[id]), false, id);
  // 陣営ありなら implemented: true の森のカードは引ける。false は引けない
  assert.equal(isDrawable(CARDS.forest_beast_common, true), true);
  assert.equal(isDrawable(CARDS.forest_druid_common, true), false);
  assert.equal(isDrawable(CARDS.forest_life_heal_common, true), false);
});

test('森の陣営モード：候補は 森＋共通 の implemented: true だけ。B2 の true の22枚が入り、false の28枚（水風土の魔法15・ドルイド・生命回復・葉の衣のレア以上3）は出ない（複数シード）', () => {
  const pool = factionPool(CARDS, 'forest');
  for (const id of B2_NEW) assert.equal(pool.has(id), CARDS[id].implemented !== false, id);
  for (const t of pool) {
    assert.ok(['forest', 'common'].includes(CARDS[t].faction), t);
    assert.notEqual(CARDS[t].implemented, false, t);
  }
  const rules = { ...loadJson('rules.json'), ...PLAIN_START };
  const seen = new Set();
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const g = new Game({ cards: CARDS, rules, rarities, factions, rng: seededRng(seed), setup: { faction: 'forest' } });
    const pile = g.pileOf('p1');
    for (const x of [...pile.deck, ...pile.discard, ...g.players.p1.hand, ...g.players.p2.hand]) {
      assert.ok(isLegalForFaction(CARDS[x.type], 'forest'), `${seed}: ${x.type}`);
      assert.notEqual(CARDS[x.type].implemented, false, x.type);
      seen.add(x.type);
    }
  }
  for (const t of ['forest_beast_common', 'forest_elf_common', 'forest_fire_magic_common', 'forest_plant_wall_common', 'forest_plant_armor_common']) assert.ok(seen.has(t), `${t} が山札に入る`);
  for (const id of FALSES) {
    assert.equal(pool.has(id), false, `${id} は候補に出ない`);
    assert.equal(isDrawable(CARDS[id], true), false, id);
  }
  for (let seed = 1; seed <= 20; seed++) {
    const types = sampleDeckTypes(CARDS, rarities, 300, seededRng(seed), pool);
    for (const t of types) assert.equal(FALSES.includes(t), false, `${seed}: ${t}`);
  }
  // 兵士がいない森ではなくなった：兵士のカードが候補にある
  assert.ok([...pool].some((t) => CARDS[t].kind === 'soldier'));
  // 入手券・繰り上げ（候補あり）も false を出さない
  const rng = seededRng(9);
  for (const r of ORDER) for (let i = 0; i < 200; i++) assert.notEqual(CARDS[sampleTypeOfRarity(CARDS, r, rng, pool)].implemented, false);
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
const lanes = (game) => game.getState('p1').roads.map((r) => r.roadId);
function foesOnAllLanes(game) {
  game.endTurn();
  const foes = lanes(game).map((roadId) => play(game, 'post', { playerId: 'p1', roadId }));
  game.endTurn();
  return foes;
}

test('森の火の攻撃魔法（5段階。水・風・土は false）：仕様の仮値のダメージ・火が付着。コモン〜レアは選んだ1レーン、エピック・レジェンドは全レーン。MP はレアリティの標準', () => {
  const DMG = { fire: [2, 3, 5, 7, 12] };
  for (const [el, list] of Object.entries(DMG)) {
    ORDER.forEach((r, i) => {
      const id = `forest_${el}_magic_${r}`;
      const lane = i <= 2;
      assert.equal(CARDS[id].element, el);
      const { game, log } = newGame();
      const foes = foesOnAllLanes(game);
      play(game, id, lane ? { playerId: 'p2', roadId: lanes(game)[1] } : undefined);
      const hit = foes.filter((s) => s.hp < 100);
      assert.equal(hit.length, lane ? 1 : 3, `${id} の範囲`);
      if (lane) assert.equal(hit[0], foes[1]);
      for (const s of hit) {
        assert.equal(s.hp, 100 - list[i], `${id} のダメージ`);
        assert.equal(s.attachment?.element, el, `${id} で ${el} が付着`);
      }
      assert.equal(ofType(log, 'spellCast').at(-1).type, id);
      assert.equal(game.players.p1.mp, 30 - rarities[r].mpCost);
    });
  }
});

test('森の火の魔法の属性反応：水流（既存）の付着に森の火魔法 → 蒸発', () => {
  const { game, log } = newGame({ reactionsPerTurn: 3 });
  const foes = foesOnAllLanes(game);
  const road = lanes(game)[0];
  play(game, 'waterJet', { playerId: 'p2', roadId: road });
  play(game, 'forest_fire_magic_common', { playerId: 'p2', roadId: road });
  assert.equal(ofType(log, 'reactionTriggered').at(-1).reaction, 'evaporate');
  assert.ok(foes[0].hp < 100);
});

test('獣人（森の獣兵〜フェンリルロード）：進む近接兵士。出して進軍し、相手の城に 攻撃力×2 のダメージ', () => {
  const STATS = { common: [4, 5, 3], uncommon: [4, 6, 3], rare: [8, 7, 3], epic: [9, 10, 3], legendary: [12, 12, 3] };
  for (const [r, [hp, atk, speed]] of Object.entries(STATS)) {
    const id = `forest_beast_${r}`;
    assert.equal(CARDS[id].role, undefined, '進む兵士');
    const { game, log } = newGame();
    const s = play(game, id, { playerId: 'p2', roadId: lanes(game)[2] });
    assert.equal(s.hp, hp); assert.equal(game.attackOf(s), atk); assert.equal(s.speed ?? CARDS[id].speed, speed);
    const before = game.players.p2.castle.hp;
    for (let i = 0; i < 6 && !ofType(log, 'castleDamaged').some((e) => e.source?.soldierId === s.soldierId); i++) { game.endTurn(); game.endTurn(); }
    const dmg = ofType(log, 'castleDamaged').find((e) => e.source?.soldierId === s.soldierId);
    assert.ok(dmg, `${id} が城に着いた`);
    assert.equal(dmg.amount, atk * loadJson('rules.json').soldierCastleDamageMultiplier);
    assert.ok(game.players.p2.castle.hp < before);
  }
});

test('エルフ（斥候〜森の守護者）：弓兵として動かずに撃つ（反撃なし・射程2）', () => {
  const STATS = { common: [3, 3], uncommon: [4, 5], rare: [5, 7], epic: [6, 9], legendary: [8, 12] };
  for (const [r, [hp, atk]] of Object.entries(STATS)) {
    const id = `forest_elf_${r}`;
    assert.equal(CARDS[id].role, 'archer');
    const { game, log } = newGame();
    const elf = play(game, id, { playerId: 'p2', roadId: lanes(game)[0] });
    assert.equal(elf.hp, hp);
    game.endTurn();
    const foe = play(game, 'post', { playerId: 'p1', roadId: lanes(game)[0] });
    foe.position = 2; // p1 から見て2マス先（射程の中）
    game.endTurn();
    const shot = ofType(log, 'soldierShot').find((e) => e.soldierId === elf.soldierId);
    assert.ok(shot, `${id} が撃った`);
    assert.equal(shot.amount, atk);
    assert.ok(foe.hp < 100);
    assert.equal(elf.hp, hp, '反撃は受けない');
  }
});

test('城防御（蔦の防壁〜世界樹の庇護）：城壁 3/5/9/15/25。兵士防御（葉の衣・樹皮の鎧）：盾 3/5。実際にダメージを受け止める', () => {
  const WALL = [3, 5, 9, 15, 25];
  ORDER.forEach((r, i) => {
    const { game, log } = newGame();
    play(game, `forest_plant_wall_${r}`, { playerId: 'p1' });
    assert.equal(ofType(log, 'castleArmored').at(-1).armor, WALL[i], `蔦系 ${r}`);
  });
  ['common', 'uncommon'].forEach((r, i) => {
    const { game, log } = newGame();
    const mine = play(game, 'post', { playerId: 'p2', roadId: lanes(game)[0] });
    play(game, `forest_plant_armor_${r}`, { soldierId: mine.soldierId });
    assert.equal(ofType(log, 'shieldAdded').at(-1).shield, [3, 5][i], `葉系 ${r}`);
  });
  // 城壁が城へのダメージを受け止める：p1 が蔦の防壁（3）を置くと、p2 の兵士が城に着いても 3 ぶん減る
  {
    const { game, log } = newGame({ laneLength: 3 });
    play(game, 'forest_plant_wall_common', { playerId: 'p1' });
    game.endTurn();
    const s = play(game, 'knight', { playerId: 'p1', roadId: lanes(game)[2] });
    game.endTurn(); game.endTurn();
    const dmg = ofType(log, 'castleDamaged').find((e) => e.source?.soldierId === s.soldierId);
    assert.ok(dmg, '兵士が城に着いた');
    assert.equal(dmg.blocked, 3, '城壁が3受け止めた');
    assert.equal(game.players.p1.castle.hp, game.players.p1.castle.maxHp - (dmg.amount - 3));
  }
  // 盾が兵士のダメージを受け止める：葉の衣（3）をつけた兵士に、相手のサンダー系の魔法
  {
    const { game, log } = newGame();
    const mine = play(game, 'post', { playerId: 'p2', roadId: lanes(game)[0] });
    play(game, 'forest_plant_armor_common', { soldierId: mine.soldierId });
    game.endTurn();
    play(game, 'thunder', { playerId: 'p1', roadId: lanes(game)[0] });
    const hit = ofType(log, 'soldierDamaged').find((e) => e.soldierId === mine.soldierId);
    assert.equal(hit.blocked, 3, '盾が3受け止めた');
    assert.equal(mine.hp, 100 - (hit.amount - 3));
  }
});

test('implemented: false（ドルイド・生命回復・水風土の魔法・葉の衣のレア以上）は、手札に来ても出せない・合成できない（実際の効果はまだない）', () => {
  const rules = { ...loadJson('rules.json'), ...PLAIN_START };
  const g = new Game({ cards: CARDS, rules, rarities, rng: seededRng(2) });
  g.debugSetHand('p1', ['forest_druid_common', 'forest_druid_common', 'forest_life_heal_common', 'forest_water_magic_common', 'forest_plant_armor_rare']);
  g.start();
  const [d1, d2, h, w, ar] = g.players.p1.hand.map((x) => x.cardId);
  for (const c of [w, ar]) assert.equal(g.canPlayCard(c).reason, 'このカードの効果はまだありません');
  assert.equal(g.canPlayCard(d1).reason, 'このカードの効果はまだありません');
  assert.equal(g.canPlayCard(h).reason, 'このカードの効果はまだありません');
  assert.equal(g.canFuse(d1, d2).reason, 'このカードの効果はまだありません');
  assert.equal(g.playCard(h).ok, false);
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

test('合成の系統：B2 の各系統が コモン（起点）から レジェンドまで途切れず、すべて森の同盟の中（精霊は レア起点）', () => {
  const chain = (id) => { const out = [id]; while (typeof CARDS[out.at(-1)].fuseTo === 'string') out.push(CARDS[out.at(-1)].fuseTo); return out; };
  const starts = ['forest_beast', 'forest_elf', 'forest_druid', 'forest_fire_magic', 'forest_water_magic', 'forest_wind_magic', 'forest_earth_magic', 'forest_life_heal', 'forest_plant_wall', 'forest_plant_armor'].map((s) => `${s}_common`);
  for (const s of starts) {
    const c = chain(s);
    assert.deepEqual(c.map((id) => CARDS[id].rarity), ORDER, `${s}: ${c.join(' → ')}`);
    for (const id of c) assert.equal(CARDS[id].faction, 'forest', `${s} の系統の ${id}`);
  }
  for (const s of ['fireSpirit', 'waterSpirit', 'windSpirit', 'earthSpirit']) assert.deepEqual(chain(s).map((id) => CARDS[id].rarity), ['rare', 'epic', 'legendary']);
  assert.equal(CARDS.galeForce.fuseTo, null);
  // 実際の合成（implemented: true の系統）
  assert.equal(fuseOnce('forest_beast_common'), 'forest_beast_uncommon');
  assert.equal(fuseOnce('forest_elf_epic'), 'forest_elf_legendary');
  assert.equal(fuseOnce('forest_fire_magic_rare'), 'forest_fire_magic_epic');
  assert.equal(fuseOnce('forest_plant_wall_common'), 'forest_plant_wall_uncommon');
  assert.equal(fuseOnce('adapt', 'forest_fire_magic_uncommon'), 'forest_fire_magic_rare');
});

test('スキン・ストーリー：新しい兵士・魔法にはスキン、B2 の新規50枚すべてにストーリー', async () => {
  const shop = loadJson('shop.json');
  const { CARD_STORIES } = await import('../js/ui/stories.js');
  for (const id of B2_NEW) {
    assert.ok(CARD_STORIES[id], `${id} のストーリー`);
    const def = CARDS[id];
    if (def.kind === 'soldier') assert.equal(shop.items[`skin_${id}`]?.target, id);
    if (def.kind === 'spell') assert.equal(shop.items[`fxskin_${id}`]?.target, id);
  }
});

test('B1 以前のカードとの境界：王国の陣営モードの候補は B2 で変わらない', () => {
  const pool = factionPool(CARDS, 'kingdom');
  assert.equal([...pool].filter((t) => !isB1Id(t) && CARDS[t].faction !== 'common' && CARDS[t].faction !== 'kingdom').length, 0);
  for (const id of B2_NEW) assert.equal(pool.has(id), false, id);
});

test('build.mjs の multiAttribute：単一属性の行に付けたら止まる。multiAttribute の行の def に element があれば止まる', () => {
  const shopText = readFileSync(join(ROOT, 'data', 'shop.json'), 'utf8');
  const args = { ledger: LEDGER, cards: JSON.parse(readFileSync(join(ROOT, 'data', 'cards.json'), 'utf8')), shop: JSON.parse(shopText) };
  const fire = ROWS.find((r) => r.name === 'フレイム');
  const druid = ROWS.find((r) => r.name === 'ドルイド');
  fire.multiAttribute = true;
  try { assert.throws(() => buildAll(args), /multiAttribute は付けられません/); } finally { delete fire.multiAttribute; }
  druid.def.element = 'fire';
  try { assert.throws(() => buildAll(args), /element は書けません/); } finally { delete druid.def.element; }
  buildAll(args); // 戻したら通る
});
