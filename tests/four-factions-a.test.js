// 四大陣営 PR-A：台帳・陣営の印（faction）・合成先の検査・陣営モードの候補（全ドロー経路）・部屋の設定。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildData, loadJson, loadOptionalData, seededRng, PLAIN_START } from './helpers.js';
import { Game } from '../js/game/Game.js';
import { Card } from '../js/game/Card.js';
import { COMMON_FACTION, validateFactions, isLegalForFaction, factionPool } from '../js/game/Factions.js';
import { sampleDeckTypes, sampleType, sampleTypeOfRarity, dropRates, nextRarityWithCards } from '../js/game/Setup.js';
import { Room, Lobby } from '../server/rooms.js';
import { loadData } from '../server/server.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = JSON.parse(readFileSync(join(ROOT, 'docs', 'four-factions', 'CASTLE_FIELD_4陣営_全295カード台帳_v1.0.json'), 'utf8'));
const FACTION_IDS = { 王国軍: 'kingdom', 森の同盟: 'forest', 魔族軍: 'demon', 竜族帝国: 'dragon', 全陣営共通: 'common' };
// 改名（既存カードを継承）の4枚は、台帳の新しい名前ではなく今のIDで対応づける（名前はまだ変えない）
const RENAMED = { フレイムソード: 'flameSword', アクアスピア: 'waterSpear', ゲイルボウ: 'windBow', アースハンマー: 'earthHammer' };
const FACTIONS = ['kingdom', 'forest', 'demon', 'dragon'];

const factions = loadJson('factions.json');
const rarities = loadJson('rarities.json');

/** 台帳の「既存」「改名」のカード → 今のカードID と faction */
function ledgerExisting(cards) {
  const byName = new Map(Object.entries(cards).map(([id, d]) => [d.name, id]));
  const out = new Map();
  for (const row of LEDGER.cards.filter((r) => r.status !== '新規案')) {
    const id = RENAMED[row.name] ?? byName.get(row.name);
    assert.ok(id, `台帳の「${row.name}」が cards.json にありません`);
    out.set(id, FACTION_IDS[row.faction]);
  }
  return out;
}

function factionGame({ faction, seed = 1, rules: rulesPatch = {}, ...rest } = {}) {
  const { rules, cards } = buildData({ rules: { ...PLAIN_START, ...rulesPatch } });
  return new Game({ cards, rules, rarities, factions, rng: seededRng(seed), setup: faction ? { faction } : {}, ...rest });
}

/** 山札・手札・捨て札にあるカード種類（共有山札） */
function allTypes(game) {
  const pile = game.pileOf('p1');
  const cards = [...pile.deck, ...pile.discard, ...pile.exhausted, ...game.playerOrder.flatMap((id) => game.players[id].hand)];
  return cards.map((c) => c.type);
}

function assertInPool(types, faction, cards, where) {
  for (const t of types) {
    const def = cards[t];
    assert.ok(def.faction === faction || def.faction === COMMON_FACTION, `${where}：「${def.name}」（${t}）は ${faction} の候補ではありません`);
    assert.ok(isLegalForFaction(def, faction), `${where}：${t} は候補の外`);
  }
}

// ================= 台帳 =================

test('台帳：295種類・陣営別 59/83/76/70・共通7・名前の重複なし', () => {
  assert.equal(LEDGER.total_unique_types, 295);
  assert.equal(LEDGER.cards.length, 295);
  const count = {};
  for (const r of LEDGER.cards) count[r.faction] = (count[r.faction] ?? 0) + 1;
  assert.deepEqual(count, { 王国軍: 59, 森の同盟: 83, 魔族軍: 76, 竜族帝国: 70, 全陣営共通: 7 });
  assert.equal(new Set(LEDGER.cards.map((r) => r.name)).size, 295);
  for (const r of LEDGER.cards) assert.ok(Object.hasOwn(FACTION_IDS, r.faction), r.faction);
});

test('台帳の既存78＋改名4＝82枚に cards.json の faction が付き、台帳にないカードには付かない', () => {
  const cards = loadJson('cards.json');
  const map = ledgerExisting(cards);
  // PR-B で台帳の新規案から足したカード（ID は chain_id_rarity）も、台帳の陣営の faction を持つ
  const added = new Map(LEDGER.cards.filter((r) => r.status === '新規案' && cards[`${r.chain_id}_${r.rarity}`]).map((r) => [`${r.chain_id}_${r.rarity}`, FACTION_IDS[r.faction]]));
  assert.equal(map.size, 82);
  assert.equal(LEDGER.cards.filter((r) => r.status === '既存').length, 78);
  assert.equal(LEDGER.cards.filter((r) => r.status.startsWith('改名')).length, 4);
  for (const [id, f] of map) assert.equal(cards[id].faction, f, `${id} の faction`);
  for (const [id, d] of Object.entries(cards)) {
    if (added.has(id)) assert.equal(d.faction, added.get(id), `${id} の faction（台帳の新規案）`);
    else if (!map.has(id)) assert.equal(d.faction, undefined, `${id} は台帳にないので faction を付けない`);
  }
  // 共通7種
  const common = Object.keys(cards).filter((id) => cards[id].faction === COMMON_FACTION).sort();
  assert.deepEqual(common, ['adapt', 'blessing', 'manaCrystal', 'manaDrop', 'manaShard', 'manaSpring', 'worldTreeDew']);
  // 改名の4枚は、PR-B で名前だけ台帳の名前にした（ID は今のまま）
  assert.equal(cards.flameSword.name, 'フレイムソード');
});

// ================= 検証 =================

test('factions.json：正しい形は通り、"common" を陣営のIDにすると例外', () => {
  validateFactions(factions);
  assert.throws(() => validateFactions({ common: { name: '共通' } }), /common/);
  assert.throws(() => validateFactions({ a: {} }), /name/);
  assert.throws(() => validateFactions([]), /factions\.json/);
  assert.throws(() => validateFactions({}), /陣営がありません/);
});

test('faction：一覧を渡すと、陣営のIDか common だけ。渡さなければ形（文字列）だけ', () => {
  const ok = buildData({ cards: { sage: { faction: 'kingdom' }, apprenticeMage: { faction: COMMON_FACTION } } }).cards;
  Card.validateDefinitions(ok, rarities, { factions });
  const bad = buildData({ cards: { sage: { faction: 'elf' } } }).cards;
  assert.throws(() => Card.validateDefinitions(bad, rarities, { factions }), /faction/);
  Card.validateDefinitions(bad, rarities); // 一覧なし：形だけ
  assert.throws(() => Card.validateDefinitions(buildData({ cards: { sage: { faction: 3 } } }).cards, rarities), /faction/);
  assert.throws(() => new Game({ ...buildData(), rarities, factions, cards: bad }), /faction/);
});

test('implemented：true / false だけ書ける', () => {
  Card.validateDefinitions(buildData({ cards: { sage: { implemented: false } } }).cards, rarities);
  assert.throws(() => Card.validateDefinitions(buildData({ cards: { sage: { implemented: 'no' } } }).cards, rarities), /implemented/);
});

test('合成先が別の陣営なら例外（両方に faction があるとき）。旧カードは確かめない', () => {
  // 陣営どうし：王国 → 竜族
  const cross = buildData({ cards: { paladin: { fuseTo: 'dragonKnight' } } }).cards;
  assert.throws(() => Card.validateDefinitions(cross, rarities), /合成先「竜騎士」（dragonKnight）は別の陣営です/);
  assert.throws(() => Card.validateDefinitions(cross, rarities, { factions }), /別の陣営/);
  // common → 陣営のカードも不可
  const common = buildData({ cards: { manaShard: { fuseTo: 'spearman' } } }).cards;
  assert.throws(() => Card.validateDefinitions(common, rarities, { factions }), /別の陣営/);
  // 片方が旧カード（faction なし）なら確かめない：魔剣（旧）→ 聖剣（王国）。森の武器→鉄の剣は PR-B で台帳の系統につないだ
  assert.equal(loadJson('cards.json').magicSword.fuseTo, 'holySword');
  Card.validateDefinitions(loadJson('cards.json'), rarities, { factions });
  const forestToLegacy = buildData({ cards: { flameSword: { fuseTo: 'ironSword' } } }).cards; // 森 → 旧
  Card.validateDefinitions(forestToLegacy, rarities, { factions });
  const legacyToFaction = buildData({ cards: { apprenticeMage: { fuseTo: 'spearman' } } }).cards; // 旧 → 王国
  Card.validateDefinitions(legacyToFaction, rarities, { factions });
});

test('陣営をまたいでいた旧合成先は fuseTo: null（合成しない）', () => {
  const cards = loadJson('cards.json');
  for (const id of ['shieldBlast', 'galeForce', 'blessing']) assert.equal(cards[id].fuseTo, null, id);
  // 聖騎士は PR-B で台帳どおりグランドパラディン（王国）につないだ（人間の決定）
  assert.equal(cards.paladin.fuseTo, 'king_cavalry_legendary');
  const g = factionGame({ rules: { deckMode: 'shared' } });
  g.debugSetHand('p1', ['blessing', 'blessing']);
  g.start();
  const [c, d] = g.getState('p1').players.p1.hand.map((x) => x.cardId);
  assert.equal(g.canFuse(c, d).reason, 'このカードは合成できません');
});

// ================= 陣営の候補 =================

test('候補：その陣営＋共通だけ。旧カード・特殊サイコロ・魔物のカード・weight 0・implemented: false は入らない', () => {
  const cards = loadJson('cards.json');
  for (const f of FACTIONS) {
    const pool = factionPool(cards, f);
    assert.ok(pool.size > 0);
    for (const t of pool) assert.ok([f, COMMON_FACTION].includes(cards[t].faction), t);
    for (const t of ['attackDice', 'godDice', 'antidote', 'weatherCall', 'moonrise', 'dawnbreak', 'assassin', 'ironSword', 'beast_dragon', 'flameBolt']) {
      assert.equal(pool.has(t), false, `${f} に ${t} が入っている`);
    }
    assert.ok(pool.has('adapt'), '共通の適応は入る');
  }
  assert.equal(isLegalForFaction({ ...cards.infantry, implemented: false }, 'kingdom'), false);
  assert.equal(isLegalForFaction({ ...cards.infantry, weight: 0 }, 'kingdom'), false);
  assert.equal(isLegalForFaction({ ...cards.infantry, monster: 'slime' }, 'kingdom'), false);
  assert.equal(isLegalForFaction(cards.infantry, 'demon'), false);
});

test('共有山札（排出率で deckSize 枚）：4陣営・複数シードで、候補の外が1枚も入らない', () => {
  const cards = loadJson('cards.json');
  for (const f of FACTIONS) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = factionGame({ faction: f, seed });
      const types = allTypes(g);
      assert.equal(types.length, g.rules.deckSize);
      assertInPool(types, f, cards, `${f}・シード${seed}`);
      assert.equal(g.getState('p1').faction, f);
    }
  }
});

test('共有山札（rarities なし：count 枚ずつ）でも、陣営なら候補の外は入れない', () => {
  const { rules, cards } = buildData({ rules: PLAIN_START });
  const g = new Game({ cards, rules, factions, rng: seededRng(3), setup: { faction: 'kingdom' } });
  const types = allTypes(g);
  const expect = [...factionPool(cards, 'kingdom')].reduce((n, t) => n + cards[t].count, 0);
  assert.equal(types.length, expect);
  assertInPool(types, 'kingdom', cards, 'count');
});

test('陣営なし（setup.faction 省略）の山札は、今までと同じ（同じシードで並びが完全に一致）', () => {
  const { rules, cards } = buildData({ rules: PLAIN_START });
  for (const seed of [1, 7, 42]) {
    const before = new Game({ cards, rules, rarities, rng: seededRng(seed) }); // factions を渡さない（今までの呼び方）
    const after = new Game({ cards, rules, rarities, factions, rng: seededRng(seed), setup: { faction: null } });
    const ids = (g) => [...g.pileOf('p1').deck, ...g.players.p1.hand, ...g.players.p2.hand].map((c) => `${c.cardId}:${c.type}`);
    assert.deepEqual(ids(after), ids(before));
    assert.equal(after.getState('p1').faction, null);
    // 引き当ての関数も、allowed なしなら今までと同じ乱数の使い方
    assert.deepEqual(sampleDeckTypes(cards, rarities, 50, seededRng(seed), null), sampleDeckTypes(cards, rarities, 50, seededRng(seed)));
  }
});

test('陣営モードの入り口：own / cost では例外。factions なし・知らない陣営も例外', () => {
  const { rules, cards } = buildData({ rules: PLAIN_START });
  const decks = loadJson('decks.json');
  assert.throws(() => new Game({ cards, rules: { ...rules, deckMode: 'own' }, decks, rarities, factions, setup: { faction: 'kingdom' } }), /共有山札/);
  assert.throws(() => new Game({ cards, rules: { ...rules, deckMode: 'cost' }, decks, rarities, factions, setup: { faction: 'kingdom' } }), /共有山札/);
  assert.throws(() => new Game({ cards, rules, rarities, setup: { faction: 'kingdom' } }), /factions/);
  assert.throws(() => new Game({ cards, rules, rarities, factions, setup: { faction: 'common' } }), /setup\.faction/);
  assert.throws(() => new Game({ cards, rules, rarities, factions, setup: { faction: 'elf' } }), /setup\.faction/);
  // own / cost は陣営なしなら今までどおり（陣営の制限なし）
  new Game({ cards, rules: { ...rules, deckMode: 'cost' }, decks, rarities, factions });
});

test('運命の祈り・幸運の加護（ドローの引き当て）：候補の外が出ない', () => {
  const cards = loadJson('cards.json');
  for (const f of FACTIONS) {
    const g = factionGame({ faction: f, seed: 11 });
    const p = g.players.p1;
    p.hand = [];
    p.luck = { draws: 300, boost: 4, from: 'rare' };
    g.drawCards(p, 300);
    assertInPool(p.hand.map((c) => c.type), f, cards, `${f}・運命の祈り`);
    p.hand = [];
    p.permLuck = { chance: 1, boost: 3, from: 'rare' };
    g.drawCards(p, 300);
    assertInPool(p.hand.map((c) => c.type), f, cards, `${f}・幸運の加護`);
    // 高いレアリティも出ている（引き当てが働いている）
    assert.ok(p.hand.some((c) => ['rare', 'epic', 'legendary'].includes(cards[c.type].rarity)));
  }
});

test('入手券（gainCard）：候補の外が出ない。候補にそのレアリティがなければ買えない', () => {
  const cards = loadJson('cards.json');
  const upgrades = Object.fromEntries(Object.keys(rarities).filter((r) => !rarities[r].special)
    .map((r) => [`t_${r}`, { name: `${r}券`, effect: 'gainCard', amount: 150, rarity: r, cost: 1 }]));
  for (const f of FACTIONS) {
    const g = factionGame({ faction: f, seed: 5, upgrades });
    g.start();
    const p = g.players[g.currentPlayer];
    p.coins = 1000;
    for (const id of Object.keys(upgrades)) {
      const r = upgrades[id].rarity;
      const has = [...factionPool(cards, f)].some((t) => cards[t].rarity === r);
      const check = g.canBuyUpgrade(id);
      assert.equal(check.ok, has, `${f}・${id}: ${check.reason}`);
      if (!has) continue;
      p.hand = [];
      assert.equal(g.buyUpgrade(id).ok, true);
      assertInPool(p.hand.map((c) => c.type), f, cards, `${f}・${id}`);
      assert.ok(p.hand.every((c) => cards[c.type].rarity === r));
    }
  }
  // 陣営なしなら、候補で絞らない（どのレアリティも買える）
  const plain = factionGame({ upgrades });
  plain.start();
  plain.players[plain.currentPlayer].coins = 1000;
  for (const id of Object.keys(upgrades)) assert.equal(plain.canBuyUpgrade(id).ok, true);
});

test('排出率の表示（getDropRates）：候補の中だけで合計100%', () => {
  const cards = loadJson('cards.json');
  for (const f of FACTIONS) {
    const g = factionGame({ faction: f, ...loadOptionalData(), setup: { faction: f } });
    const info = g.getDropRates('p1');
    const types = Object.keys(info.cards);
    assert.deepEqual(new Set(types), factionPool(cards, f));
    const total = Object.values(info.cards).reduce((n, c) => n + c.rate, 0);
    assert.ok(Math.abs(total - 100) < 1e-9, `${f}: ${total}`);
  }
  // 陣営なしは今までどおり（全カード）
  const plain = factionGame({ ...loadOptionalData() });
  assert.equal(Object.keys(plain.getDropRates().cards).length, Object.keys(cards).length);
});

test('Setup の引き当て：allowed を渡すと候補の中だけ。候補が空なら null（落ちない）', () => {
  const cards = loadJson('cards.json');
  const pool = factionPool(cards, 'dragon');
  const rng = seededRng(9);
  for (let i = 0; i < 300; i++) assert.ok(pool.has(sampleType(cards, rarities, rng, null, pool)));
  for (let i = 0; i < 100; i++) assert.ok(pool.has(sampleTypeOfRarity(cards, 'legendary', rng, pool)));
  assert.deepEqual(Object.keys(dropRates(cards, rarities, null, pool)).sort(), [...pool].sort());
  const empty = new Set();
  assert.equal(sampleType(cards, rarities, rng, null, empty), null);
  assert.equal(sampleTypeOfRarity(cards, 'rare', rng, empty), null);
  assert.equal(nextRarityWithCards(cards, rarities, 'common', empty), null);
  assert.throws(() => sampleDeckTypes(cards, rarities, 3, rng, empty), /山札に入れられるカードがありません/);
  // 述語でも渡せる
  for (let i = 0; i < 50; i++) {
    const t = sampleType(cards, rarities, rng, null, (_, d) => d.faction === 'forest' && d.rarity === 'rare');
    assert.equal(cards[t].faction, 'forest');
    assert.equal(cards[t].rarity, 'rare');
  }
});

test('魔物のごほうびは例外：陣営モードでも候補で絞らない（旧カードも出うる）', () => {
  const cards = loadJson('cards.json');
  const opt = loadOptionalData();
  const seen = new Set();
  for (let seed = 1; seed <= 40 && ![...seen].some((t) => !cards[t].faction); seed++) {
    const g = factionGame({ faction: 'kingdom', seed, monsters: opt.monsters });
    const m = { monsterId: 'mx', type: 'slime', isDead: true, roadId: g.roads[0].roadId, rewardRarity: 'common', def: { rewardRarity: 'common' } };
    g.monsters.push(m);
    const p = g.players.p1;
    p.hand = [];
    g.defeatMonsterIfDead(m, 'p1');
    for (const c of p.hand) if (!cards[c.type].monster) seen.add(c.type);
  }
  assert.ok([...seen].some((t) => !cards[t].faction || cards[t].faction !== 'kingdom' && cards[t].faction !== COMMON_FACTION),
    `王国の候補の外のごほうびが出ていない：${[...seen].join(',')}`);
});

// ================= 合成 =================

test('合成：陣営のカードの合成先は同じ陣営。旧カードへ行くものはない（森の4つの武器は PR-B で直した）', () => {
  const cards = loadJson('cards.json');
  const toLegacy = [];
  for (const [id, d] of Object.entries(cards)) {
    if (!d.faction || typeof d.fuseTo !== 'string') continue;
    const to = cards[d.fuseTo];
    if (to.faction === undefined) toLegacy.push(id);
    else assert.equal(to.faction, d.faction, `${id} → ${d.fuseTo}`);
  }
  assert.deepEqual(toLegacy, []);
});

test('合成：陣営内の系統が最上位まで辿れる（例：王国の歩兵→勇者、竜族のファイアボール→終末の炎）', () => {
  const cards = loadJson('cards.json');
  const chain = (id) => { const out = [id]; while (typeof cards[out.at(-1)].fuseTo === 'string') out.push(cards[out.at(-1)].fuseTo); return out; };
  assert.deepEqual(chain('infantry'), ['infantry', 'spearman', 'heavy', 'giant', 'hero']);
  assert.deepEqual(chain('fireball'), ['fireball', 'inferno', 'meteor', 'starfall', 'apocalypse']);
  assert.deepEqual(chain('frostBreath'), ['frostBreath', 'deepFreeze', 'glacier', 'absoluteZero', 'frozenWorld']);
  assert.deepEqual(chain('manaShard'), ['manaShard', 'manaDrop', 'manaCrystal', 'manaSpring', 'worldTreeDew']);
  assert.deepEqual(chain('fireSpirit'), ['fireSpirit', 'greatFireSpirit', 'fireKing']);
  for (const id of ['infantry', 'fireball', 'frostBreath', 'fireSpirit']) {
    const f = cards[id].faction;
    for (const t of chain(id)) assert.equal(cards[t].faction, f, t);
  }
  // 実際に合成すると同じ陣営のカードになる
  const g = factionGame({ faction: 'dragon' });
  g.debugSetHand('p1', ['fireball', 'fireball']);
  g.start();
  const [a, b] = g.getState('p1').players.p1.hand.map((c) => c.cardId);
  assert.equal(g.fuse(a, b).ok, true);
  assert.equal(cards[g.players.p1.hand.at(-1).type].faction, 'dragon');
});

test('合成：適応＋陣営のカード → 同じ陣営のカード（ほかの陣営のカードを取る抜け道にならない）', () => {
  const cards = loadJson('cards.json');
  for (const [f, card] of [['kingdom', 'knight'], ['demon', 'venom'], ['dragon', 'thunder'], ['forest', 'waterSpirit']]) {
    const g = factionGame({ faction: f });
    g.debugSetHand('p1', ['adapt', card]);
    g.start();
    const [a, b] = g.getState('p1').players.p1.hand.map((c) => c.cardId);
    assert.equal(g.fuse(a, b).ok, true);
    const made = g.players.p1.hand.at(-1).type;
    assert.equal(made, cards[card].fuseTo);
    assert.equal(cards[made].faction, f, `${f}: ${card} → ${made}`);
  }
});

// ================= 部屋とサーバー =================

function enter(lobby, pass, name) {
  const r = lobby.join(pass, name);
  assert.equal(r.ok, true, r.reason);
  const { room, seat } = lobby.findSeat(r.token);
  const seen = [];
  room.connect(seat, (m) => seen.push(m));
  return { room, seat, lastRoom: () => seen.filter((m) => m.type === 'room').at(-1) };
}

test('部屋：faction を選ぶ → 開始 → Game の faction が同じ。始まったあとは変えられない', () => {
  let seed = 1;
  const lobby = new Lobby(loadData(), () => seededRng(seed++), { cpuDelayMs: 0 });
  const a = enter(lobby, 'ff', 'A');
  const b = enter(lobby, 'ff', 'B');
  assert.equal(a.lastRoom().settings.faction, null);
  assert.deepEqual(a.lastRoom().choices.factions.map((x) => x.id), ['kingdom', 'demon', 'forest', 'dragon']);
  // 部屋の最初はコスト制なので、陣営は選べない
  assert.equal(a.room.action(a.seat, 'setRules', [{ faction: 'kingdom' }]).reason, '陣営モードは共有山札（みんな共通）だけです');
  assert.equal(a.room.action(b.seat, 'setRules', [{ deckMode: 'shared', faction: 'kingdom' }]).reason, '部屋主だけが変えられます');
  assert.equal(a.room.action(a.seat, 'setRules', [{ deckMode: 'shared', faction: 'elf' }]).reason, 'その陣営はありません');
  assert.equal(a.room.action(a.seat, 'setRules', [{ deckMode: 'shared', faction: 'demon' }]).ok, true);
  assert.equal(b.lastRoom().settings.faction, 'demon');
  // 山札を共有以外にすると、陣営は外れる
  assert.equal(a.room.action(a.seat, 'setRules', [{ deckMode: 'cost' }]).ok, true);
  assert.equal(b.lastRoom().settings.faction, null);
  assert.equal(a.room.action(a.seat, 'setRules', [{ deckMode: 'shared', faction: 'demon' }]).ok, true);
  assert.equal(a.room.action(a.seat, 'start', []).ok, true);
  assert.equal(a.room.game.getState(null).faction, 'demon');
  const cards = loadJson('cards.json');
  assertInPool(allTypes(a.room.game), 'demon', cards, '部屋');
  assert.equal(a.room.action(a.seat, 'setRules', [{ faction: 'kingdom' }]).ok, false);
  assert.equal(a.room.game.getState(null).faction, 'demon');
  // 陣営を null に戻せば、陣営なし
  a.room.action(a.seat, 'surrender', []);
  assert.equal(a.room.action(a.seat, 'backToRoom', []).ok, true);
  assert.equal(a.room.action(a.seat, 'setRules', [{ faction: null }]).ok, true);
  assert.equal(a.room.action(a.seat, 'start', []).ok, true);
  assert.equal(a.room.game.getState(null).faction, null);
});

test('部屋：ランク戦では陣営を変えられない', () => {
  const room = new Room('rk', loadData(), () => seededRng(1), { cpuDelayMs: 0, ranked: { modeId: 'kingdom' } });
  const seat = { playerId: 'p1', cpu: null, clients: new Set() };
  assert.equal(room.action(seat, 'setRules', [{ faction: 'kingdom' }]).reason, 'ランク戦では使えません');
  assert.equal(room.settings.faction, null);
});
