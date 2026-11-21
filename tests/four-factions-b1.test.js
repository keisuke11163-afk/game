// 四大陣営 PR-B1：台帳の取り込み（王国軍・全陣営共通・森の武器）。データだけでなく、実際に効くか（魔法・武器・兵士・合成）まで確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { Card } from '../js/game/Card.js';
import { factionPool, isLegalForFaction } from '../js/game/Factions.js';
import { sampleDeckTypes, sampleType, sampleTypeOfRarity, nextRarityWithCards, dropRates, isDeckable, checkCostDeck, isDrawable } from '../js/game/Setup.js';
import { loadJson, seededRng, recordEvents, PLAIN_START } from './helpers.js';
import { buildAll, formatCards, newCardId, FACTION_IDS, ELEMENT_IDS } from '../docs/four-factions/import/build.mjs';
import { ROWS } from '../docs/four-factions/import/mapping.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = JSON.parse(readFileSync(join(ROOT, 'docs', 'four-factions', 'CASTLE_FIELD_4陣営_全295カード台帳_v1.0.json'), 'utf8'));
const CARDS = loadJson('cards.json');
const rarities = loadJson('rarities.json');
const factions = loadJson('factions.json');
const reactions = loadJson('reactions.json');
// B1 の範囲（王国・共通・森の武器）。inScope は B2 以降で広がるので、ここでは固定する
const B1 = LEDGER.cards.filter((r) => r.faction === '王国軍' || r.faction === '全陣営共通' || (r.faction === '森の同盟' && r.section === '武器'));
const ofType = (log, t) => log.filter((e) => e.event === t);
const IS_B1_ID = (id) => CARDS[id].faction === 'kingdom' || /^forest_(fire_sword|water_lance|wind_bow|earth_hammer)_/.test(id);
const NEW_IDS = Object.keys(CARDS).filter((id) => CARDS[id].factionOnly && IS_B1_ID(id));
const ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** 台帳の行 → カードID（既存は対応表の ID、新規は chain_id_rarity） */
const idOfRow = (row) => (row.status === '新規案' ? newCardId(row) : ROWS.find((r) => r.name === row.name).id);

// ================= 台帳の取り込み =================

test('B1 の範囲は 王国59＋共通7＋森の武器20＝86行。すべてが cards.json に、名前・レアリティ・faction・属性・合成先で入っている', () => {
  const count = {};
  for (const r of B1) count[r.faction] = (count[r.faction] ?? 0) + 1;
  assert.deepEqual(count, { 王国軍: 59, 森の同盟: 20, 全陣営共通: 7 });
  for (const row of B1) {
    const id = idOfRow(row);
    const def = CARDS[id];
    assert.ok(def, `${row.name}（${id}）がない`);
    assert.equal(def.name, row.name, id);
    assert.equal(def.rarity, row.rarity, id);
    assert.equal(def.faction, FACTION_IDS[row.faction], id);
    const el = ELEMENT_IDS[row.attribute];
    if (row.status === '新規案' && (def.kind === 'weapon' || def.kind === 'spell')) assert.equal(def.element ?? null, el, `${id} の属性`);
    if (row.next_name) {
      const next = B1.find((r) => r.name === row.next_name);
      assert.equal(def.fuseTo, idOfRow(next), `${id} の合成先（台帳：${row.next_name}）`);
    }
  }
  // 新規案は40枚（王国24・森の武器16）。台帳の新規案のうち B1 の範囲のものは全部入った
  assert.equal(NEW_IDS.length, 40);
  assert.equal(B1.filter((r) => r.status === '新規案').length, 40);
  const byFaction = {};
  for (const id of NEW_IDS) byFaction[CARDS[id].faction] = (byFaction[CARDS[id].faction] ?? 0) + 1;
  assert.deepEqual(byFaction, { kingdom: 24, forest: 16 });
});

test('既存の136枚（取り込み前の全カード）は、人間が決めた改名4件と合成先5件のほかは1文字も変わっていない', () => {
  const before = Object.fromEntries(Object.entries(CARDS).filter(([, d]) => !d.factionOnly).map(([id, d]) => [id, { ...d }]));
  assert.equal(Object.keys(before).length, 136);
  // 人間が決めた変更を戻すと、取り込み前（PR-A のあと）と同じになる
  const OLD_NAMES = { flameSword: '炎の剣', waterSpear: '水の槍', windBow: '風の弓', earthHammer: '土の槌' };
  for (const [id, name] of Object.entries(OLD_NAMES)) {
    assert.equal(before[id].fuseTo, `${{ flameSword: 'forest_fire_sword', waterSpear: 'forest_water_lance', windBow: 'forest_wind_bow', earthHammer: 'forest_earth_hammer' }[id]}_uncommon`);
    before[id].name = name;
    before[id].fuseTo = 'ironSword';
  }
  // 聖剣・神剣は人間の決定で光属性（攻撃力は変えない）
  for (const id of ['holySword', 'godSword']) {
    assert.equal(before[id].element, 'light', id);
    delete before[id].element;
  }
  assert.equal(before.paladin.fuseTo, 'king_cavalry_legendary');
  before.paladin.fuseTo = null;
  const hash = createHash('sha256').update(JSON.stringify(before)).digest('hex');
  assert.equal(hash, 'a37dd30f0626b7a9dc72de2581beb04880f2c6ed31621a2975c2119a60ecfa71');
});

test('ID・名前の衝突がない。新しいIDは chain_id_rarity', () => {
  const names = Object.values(CARDS).map((d) => d.name);
  assert.equal(new Set(names).size, names.length, '名前の重複');
  for (const row of B1.filter((r) => r.status === '新規案')) assert.equal(CARDS[newCardId(row)].name, row.name);
  for (const id of NEW_IDS) assert.match(id, /^[a-z_]+_(common|uncommon|rare|epic|legendary)$/);
});

test('生成スクリプトは冪等：今のファイルから作り直しても、cards.json・shop.json・ストーリーが同じ', () => {
  const shopText = readFileSync(join(ROOT, 'data', 'shop.json'), 'utf8');
  const cardsText = readFileSync(join(ROOT, 'data', 'cards.json'), 'utf8');
  const out = buildAll({ ledger: LEDGER, cards: JSON.parse(cardsText), shop: JSON.parse(shopText) });
  assert.equal(formatCards(out.cards), cardsText);
  assert.equal(`${JSON.stringify(out.shop, null, 2)}\n`, shopText);
  assert.equal(out.storiesJs, readFileSync(join(ROOT, 'js', 'ui', 'stories-factions.js'), 'utf8'));
  assert.equal(out.table, readFileSync(join(ROOT, 'docs', 'four-factions', 'import', 'table.md'), 'utf8'));
  // 新規のIDが既存のカードとぶつかったら止まる
  const clash = JSON.parse(cardsText);
  delete clash.king_light_spell_common;
  clash.king_light_spell_common = { ...CARDS.bolt };
  assert.throws(() => buildAll({ ledger: LEDGER, cards: clash, shop: JSON.parse(shopText) }), /ぶつかります/);
});

test('implemented：王国は聖術師5・カウンター5が false、ほかの新規30枚は true。false には effectPlan と理由がある', () => {
  const falses = NEW_IDS.filter((id) => CARDS[id].implemented === false).sort();
  assert.deepEqual(falses, [...ORDER.map((r) => `king_counter_${r}`), ...ORDER.map((r) => `king_priest_${r}`)].sort());
  for (const id of NEW_IDS) {
    assert.equal(typeof CARDS[id].implemented, 'boolean', id);
    if (CARDS[id].implemented) continue;
    assert.ok(CARDS[id].effectPlan, `${id} の effectPlan`);
    assert.ok(CARDS[id].implementationNote, `${id} の implementationNote`);
    assert.ok(CARDS[id].description.startsWith('【準備中】'), id);
  }
  for (const id of ORDER.map((r) => `king_counter_${r}`)) assert.equal(CARDS[id].effect, undefined, 'カウンターの効果はまだない');
});

// ================= 検証 =================

test('検証：implemented: false だけ effect を省略できる。effectPlan・implementationNote・factionOnly の形', () => {
  Card.validateDefinitions(CARDS, rarities, { factions });
  const base = { name: 'x', kind: 'defense', count: 0, rarity: 'common', fuseTo: null };
  Card.validateDefinitions({ x: { ...base, implemented: false, effectPlan: '仮' } }, rarities);
  assert.throws(() => Card.validateDefinitions({ x: { ...base } }, rarities), /effect/);
  assert.throws(() => Card.validateDefinitions({ x: { ...base, implemented: true } }, rarities), /effect/);
  assert.throws(() => Card.validateDefinitions({ x: { ...base, implemented: false, effect: 'nope' } }, rarities), /effect/);
  assert.throws(() => Card.validateDefinitions({ x: { ...base, implemented: false, effectPlan: 3 } }, rarities), /effectPlan/);
  assert.throws(() => Card.validateDefinitions({ x: { ...base, effect: 'shieldSoldier', amount: 1, implementationNote: {} } }, rarities), /implementationNote/);
  assert.throws(() => Card.validateDefinitions({ x: { ...base, effect: 'shieldSoldier', amount: 1, factionOnly: 'y' } }, rarities), /factionOnly/);
  // 新規の implemented: true のカードは、効果の検査をそのまま通る（new Game の検査）
  new Game({ cards: CARDS, rules: loadJson('rules.json'), rarities, factions, reactions, rng: seededRng(1) });
});

test('陣営なしのモード：implemented: false と陣営専用（factionOnly）は、山札・ドローの引き当て・入手券・魔物のごほうび・デッキ編成に出ない', () => {
  const rng = seededRng(11);
  const deck = sampleDeckTypes(CARDS, rarities, 4000, rng);
  assert.equal(deck.filter((t) => CARDS[t].factionOnly || CARDS[t].implemented === false).length, 0);
  for (let i = 0; i < 2000; i++) {
    const t = sampleType(CARDS, rarities, rng, { from: 'rare', multiplier: 4 }); // 運命の祈り・幸運の加護
    assert.ok(!CARDS[t].factionOnly && CARDS[t].implemented !== false, t);
  }
  for (const r of ORDER) {
    for (let i = 0; i < 300; i++) {
      const t = sampleTypeOfRarity(CARDS, r, rng); // 入手券・魔物のごほうび
      assert.ok(!CARDS[t].factionOnly && CARDS[t].implemented !== false, t);
    }
  }
  const rates = dropRates(CARDS, rarities);
  for (const id of NEW_IDS) assert.equal(rates[id], 0, id);
  // デッキ編成：implemented: false は入れられない。陣営専用でも、効果のあるカードはカスタムデッキに入れられる（陣営の制限なし）
  for (const id of NEW_IDS) assert.equal(isDeckable(CARDS[id]), CARDS[id].implemented !== false, id);
  const rules = loadJson('rules.json');
  const bad = checkCostDeck({ king_counter_common: 1 }, CARDS, rarities, rules);
  assert.ok(bad.problems.some((p) => p.includes('パリィ') && p.includes('入れられません')));
  assert.equal(isDrawable(CARDS.king_light_spell_common), false);
  assert.equal(isDrawable(CARDS.king_light_spell_common, true), true);
  assert.equal(isDrawable(CARDS.king_counter_common, true), false);
});

test('陣営なしの山札（rarities・count）は取り込み前と同じ並び（新しいカードの重みが入らない）', () => {
  // 取り込み前と同じカードの集合（新しいカードを消し、それを指す合成先も外す。山札の引き当ては合成先を見ない）
  const legacy = Object.fromEntries(Object.entries(CARDS).filter(([, d]) => !d.factionOnly)
    .map(([id, d]) => [id, CARDS[d.fuseTo]?.factionOnly ? { ...d, fuseTo: null } : d]));
  for (const seed of [1, 9]) {
    assert.deepEqual(sampleDeckTypes(CARDS, rarities, 200, seededRng(seed)), sampleDeckTypes(legacy, rarities, 200, seededRng(seed)));
  }
  const rules = { ...loadJson('rules.json'), ...PLAIN_START };
  const g1 = new Game({ cards: CARDS, rules, rarities, rng: seededRng(5) });
  const g2 = new Game({ cards: legacy, rules, rarities, rng: seededRng(5) });
  const ids = (g) => [...g.pileOf('p1').deck, ...g.players.p1.hand, ...g.players.p2.hand].map((c) => `${c.cardId}:${c.type}`);
  assert.deepEqual(ids(g1), ids(g2));
});

test('手札に来ても（デバッグ）：implemented: false は出せない・防御に使えない・合成できない', () => {
  const rules = { ...loadJson('rules.json'), ...PLAIN_START, defenseReaction: true };
  const g = new Game({ cards: CARDS, rules, rarities, rng: seededRng(2) });
  g.debugSetHand('p1', ['king_counter_common', 'king_priest_common', 'king_priest_common']);
  g.start();
  const [c, p1, p2] = g.players.p1.hand.map((x) => x.cardId);
  assert.equal(g.canPlayCard(c).reason, 'このカードの効果はまだありません');
  assert.equal(g.canPlayCard(p1).reason, 'このカードの効果はまだありません');
  assert.deepEqual(g.getTargets(p1), []);
  assert.equal(g.canFuse(p1, p2).reason, 'このカードの効果はまだありません');
  assert.equal(g.playCard(c).ok, false);
  // 防御の場面：カウンターは出せない
  assert.deepEqual(g.defenseTargetsFor({ kind: 'castle', from: 'soldier', defenderId: 'p1' }, g.players.p1.hand[0]).targets, []);
});

// ================= 陣営モード =================

test('王国の陣営モード：共有山札は王国＋共通の implemented: true だけ。新しいカードも入る（複数シード）', () => {
  const rules = { ...loadJson('rules.json'), ...PLAIN_START };
  const pool = factionPool(CARDS, 'kingdom');
  for (const id of NEW_IDS) assert.equal(pool.has(id), CARDS[id].faction === 'kingdom' && CARDS[id].implemented !== false, id);
  const seen = new Set();
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const g = new Game({ cards: CARDS, rules, rarities, factions, rng: seededRng(seed), setup: { faction: 'kingdom' } });
    const pile = g.pileOf('p1');
    const types = [...pile.deck, ...pile.discard, ...g.players.p1.hand, ...g.players.p2.hand].map((x) => x.type);
    for (const t of types) {
      assert.ok(isLegalForFaction(CARDS[t], 'kingdom'), `${seed}: ${t}`);
      assert.notEqual(CARDS[t].implemented, false, t);
      assert.ok(['kingdom', 'common'].includes(CARDS[t].faction), t);
      seen.add(t);
    }
  }
  assert.ok(['king_light_spell_common', 'king_light_lance_common', 'king_light_sword_common'].every((t) => seen.has(t)), '新しい光のカードが山札に入る');
  // 入手券・ごほうびの繰り上げ（候補あり）も implemented: false を出さない
  const rng = seededRng(4);
  for (const r of ORDER) for (let i = 0; i < 200; i++) assert.notEqual(CARDS[sampleTypeOfRarity(CARDS, r, rng, pool)].implemented, false);
  assert.equal(nextRarityWithCards(CARDS, rarities, 'epic', pool), 'legendary');
});

test('森の陣営モード：新しい森の武器（4属性×アンコモン〜レジェンド）が候補に入る', () => {
  const pool = factionPool(CARDS, 'forest');
  for (const c of ['fire_sword', 'water_lance', 'wind_bow', 'earth_hammer']) {
    for (const r of ORDER.slice(1)) assert.ok(pool.has(`forest_${c}_${r}`), `forest_${c}_${r}`);
  }
  assert.equal([...pool].some((t) => CARDS[t].faction === 'kingdom'), false);
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
/** p2 が3本の道に杭を1体ずつ置いて、p1 の番に戻す */
function foesOnAllLanes(game) {
  game.endTurn();
  const foes = lanes(game).map((roadId) => play(game, 'post', { playerId: 'p1', roadId }));
  game.endTurn();
  return foes;
}

test('光の攻撃魔法（ルミナ〜ディヴァインノヴァ）：2/3/5/7/12 ダメージ・光が付着。コモン〜レアは選んだ1レーン、エピック以上は全レーン', () => {
  const expect = { common: [2, true], uncommon: [3, true], rare: [5, true], epic: [7, false], legendary: [12, false] };
  for (const [r, [amount, lane]] of Object.entries(expect)) {
    const id = `king_light_spell_${r}`;
    assert.equal(CARDS[id].element, 'light');
    const { game, log } = newGame();
    const foes = foesOnAllLanes(game);
    const mpBefore = 30;
    play(game, id, lane ? { playerId: 'p2', roadId: lanes(game)[1] } : undefined);
    const hit = foes.filter((s) => s.hp < 100);
    assert.equal(hit.length, lane ? 1 : 3, `${id} の範囲`);
    if (lane) assert.equal(hit[0], foes[1], '選んだレーンの兵士だけ');
    for (const s of hit) {
      assert.equal(s.hp, 100 - amount, `${id} のダメージ`);
      assert.equal(s.attachment?.element, 'light', `${id} で光が付着`);
    }
    assert.equal(ofType(log, 'spellCast').at(-1).type, id);
    assert.equal(game.players.p1.mp, mpBefore - rarities[r].mpCost, 'MP はレアリティの標準');
  }
});

test('光の武器（ルミナスランス系・聖鉄の剣系）：攻撃補正 +1/+2/+4/+6/+9 と光属性が付く', () => {
  const BONUS = { common: 1, uncommon: 2, rare: 4, epic: 6, legendary: 9 };
  const weapons = [...ORDER.map((r) => [`king_light_lance_${r}`, r]), ...['common', 'uncommon', 'rare'].map((r) => [`king_light_sword_${r}`, r])];
  for (const [id, r] of weapons) {
    const { game, log } = newGame();
    const mine = play(game, 'post', { playerId: 'p2', roadId: lanes(game)[0] });
    play(game, id, { soldierId: mine.soldierId });
    const ev = ofType(log, 'weaponEquipped').at(-1);
    assert.equal(ev.attack, 1 + BONUS[r], id);
    assert.equal(ev.element, 'light', id);
    assert.equal(mine.element, 'light');
  }
  // 聖剣・神剣は既存の数値のまま（光の剣系の上位）
  assert.equal(CARDS.king_light_sword_rare.fuseTo, 'holySword');
  assert.equal(CARDS.holySword.attackBonus, 6);
  assert.equal(CARDS.holySword.element, 'light');
  assert.equal(CARDS.godSword.element, 'light');
  assert.equal(CARDS.godSword.attackBonus, 9);
});

test('森の武器（4属性×5段階）：攻撃補正 +1/+2/+4/+6/+9 と属性が付く', () => {
  const BONUS = { common: 1, uncommon: 2, rare: 4, epic: 6, legendary: 9 };
  const COMMON = { fire_sword: 'flameSword', water_lance: 'waterSpear', wind_bow: 'windBow', earth_hammer: 'earthHammer' };
  const EL = { fire_sword: 'fire', water_lance: 'water', wind_bow: 'wind', earth_hammer: 'earth' };
  for (const c of Object.keys(COMMON)) {
    for (const r of ORDER) {
      const id = r === 'common' ? COMMON[c] : `forest_${c}_${r}`;
      const { game, log } = newGame();
      const mine = play(game, 'post', { playerId: 'p2', roadId: lanes(game)[0] });
      play(game, id, { soldierId: mine.soldierId });
      const ev = ofType(log, 'weaponEquipped').at(-1);
      assert.equal(ev.attack, 1 + BONUS[r], id);
      assert.equal(ev.element, EL[c], id);
    }
  }
});

test('光の武器を持った兵士は、戦いで闇の兵士に有利（1.5倍）', () => {
  const { game } = newGame();
  const mine = play(game, 'post', { playerId: 'p2', roadId: lanes(game)[0] });
  play(game, 'king_light_lance_rare', { soldierId: mine.soldierId }); // 攻撃 1+4=5、光
  const foe = { element: 'dark', attack: 1 };
  assert.equal(game.fightDamage(mine, foe), Math.ceil(5 * 1.5));
});

test('グランドパラディン：出して進軍し、相手の城に攻撃力×2 のダメージ', () => {
  const { game, log } = newGame();
  const s = play(game, 'king_cavalry_legendary', { playerId: 'p2', roadId: lanes(game)[2] });
  assert.equal(s.hp, 10); assert.equal(s.attackOf ?? game.attackOf(s), 10);
  const hp = game.players.p2.castle.hp;
  game.endTurn(); game.endTurn(); // p1 の次のターンの進軍（速さ5・道5マスで城に着く）
  const dmg = ofType(log, 'castleDamaged').find((e) => e.source?.soldierId === s.soldierId);
  assert.ok(dmg, '城に着いた');
  assert.equal(dmg.amount, 10 * loadJson('rules.json').soldierCastleDamageMultiplier);
  assert.ok(game.players.p2.castle.hp < hp);
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

test('合成：森のコモン武器2枚 → 次のレアリティの新しい武器（鉄の剣ではない）。聖騎士2枚 → グランドパラディン。既存の系統も壊れていない', () => {
  assert.equal(fuseOnce('flameSword'), 'forest_fire_sword_uncommon');
  assert.equal(fuseOnce('waterSpear'), 'forest_water_lance_uncommon');
  assert.equal(fuseOnce('windBow'), 'forest_wind_bow_uncommon');
  assert.equal(fuseOnce('earthHammer'), 'forest_earth_hammer_uncommon');
  assert.equal(fuseOnce('forest_fire_sword_epic'), 'forest_fire_sword_legendary');
  assert.equal(fuseOnce('paladin'), 'king_cavalry_legendary');
  assert.equal(fuseOnce('king_light_sword_rare'), 'holySword');
  assert.equal(fuseOnce('king_light_spell_common'), 'king_light_spell_uncommon');
  assert.equal(fuseOnce('apprenticeArcher'), 'archer');
  assert.equal(fuseOnce('infantry'), 'spearman');
  assert.equal(fuseOnce('knight'), 'paladin');
  // 適応＋カード → そのカードの合成先（同じ陣営）
  assert.equal(fuseOnce('adapt', 'flameSword'), 'forest_fire_sword_uncommon');
  assert.equal(fuseOnce('adapt', 'king_light_lance_rare'), 'king_light_lance_epic');
  // 鉄の剣（旧カード）はそのまま残る
  assert.equal(CARDS.ironSword.name, '鉄の剣');
  assert.equal(CARDS.ironSword.fuseTo, 'magicSword');
});

test('合成の系統：王国・森の武器の各系統がコモン（起点）からレジェンドまで途切れず、すべて同じ陣営', () => {
  const chain = (id) => { const out = [id]; while (typeof CARDS[out.at(-1)].fuseTo === 'string') out.push(CARDS[out.at(-1)].fuseTo); return out; };
  const starts = ['infantry', 'scout', 'apprenticeArcher', 'king_priest_common', 'king_light_lance_common', 'king_light_sword_common',
    'king_light_spell_common', 'minorHeal', 'shield', 'sandbag', 'king_counter_common', 'manaShard', 'flameSword', 'waterSpear', 'windBow', 'earthHammer'];
  for (const s of starts) {
    const c = chain(s);
    assert.deepEqual(c.map((id) => CARDS[id].rarity), ORDER, `${s}: ${c.join(' → ')}`);
    const f = CARDS[s].faction;
    for (const id of c) assert.equal(CARDS[id].faction, f, `${s} の系統の ${id}`);
  }
  assert.deepEqual(chain('scout').slice(-2), ['paladin', 'king_cavalry_legendary']);
  assert.deepEqual(chain('king_light_sword_common').slice(-2), ['holySword', 'godSword']);
});

test('スキン・ストーリー：新しい兵士・魔法にはスキン、新しいカード全部にストーリー', async () => {
  const shop = loadJson('shop.json');
  const { CARD_STORIES } = await import('../js/ui/stories.js');
  for (const id of NEW_IDS) {
    assert.ok(CARD_STORIES[id], `${id} のストーリー`);
    const def = CARDS[id];
    if (def.kind === 'soldier') assert.equal(shop.items[`skin_${id}`]?.target, id);
    if (def.kind === 'spell') assert.equal(shop.items[`fxskin_${id}`]?.target, id);
  }
});
