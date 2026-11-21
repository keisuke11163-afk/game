// ゲーム全体の進行。山札（2人共通）・ターン順・カード効果・勝敗を管理する。
//
// - DOM もファイルも使わない。cards.json / rules.json の中身と乱数は外から受け取る
//     const game = new Game({ cards, rules, rng });
// - 何が起きたかは game.on(type, handler) で受け取る（同期的に、起きた順に発行）
// - 不正な操作は例外を投げず { ok: false, reason } を返す。成功したら { ok: true }
//
// 流れ:
//   new Game() … phase "ready"。初期手札を配った状態（イベントは出ない）
//   start()    … p1 のターン1を始める（turnStarted → ドロー → 進軍）
//
// 何人でも扱えるように作っている（CLAUDE.md「全体の設計」）。
//   - 席順は this.playerOrder。手番はこの順
//   - 道（Road）は、となりの席どうしをつなぐ。2人なら1本
//   - 兵士は roadId（どの道か）と targetId（道の向こうの人）を持つ
//   playCard() … メインでカードを1枚使う（使わなくてもよい）
//   endTurn()  … 手札が上限を超えていたら phase "discard" → discard() で捨てる
//                超えていなければ（または捨て終わったら）次の人のターンが始まる
//   城HPが0以下になった瞬間に phase "gameOver"

import { Card, ELEMENTS, LANE_SCOPE_EFFECTS, MP_EFFECTS, BASIC_DICE } from './Card.js';
import { Monster, validateUpgrades } from './Monster.js';
import { validateFactions, factionPool } from './Factions.js';
import { Pile, checkCostDeck, DECK_COST_DEFAULTS, chainOrder, validateCastles, validateDecks, validateRarities, sampleDeckTypes, sampleType, sampleTypeOfRarity, nextRarityWithCards, dropRates, rewardOdds, isDrawable } from './Setup.js';
import { Soldier } from './Soldier.js';
import { Player } from './Player.js';
import { Road } from './Road.js';
import { Castle } from './Castle.js';
import { validateWeather } from './Weather.js';
import { validateStages, pickStage } from './Stage.js';
import { DEFAULT_ELEMENTS, validateElements, elementMultiplier, applyElementMultiplier } from './Elements.js';
import { validateReactions, buildReactionIndex, findReaction, applyReactionMultiplier } from './Reactions.js';

/** 2人のときのプレイヤーID（人数は rules.playerCount。3人以上は p3〜p8 が続く） */
export const PLAYER_IDS = ['p1', 'p2'];

/** Game が出すイベントの名前（CLAUDE.md「Gameが出すイベント」の表と同じ） */
export const EVENT_TYPES = [
  'turnStarted',
  'overdriveChanged',
  'mulliganStarted',
  'mulliganDone',
  'timeChanged',
  'stageEruption',
  'cardDrawn',
  'deckShuffled',
  'cardPlayed',
  'cardsFused',
  'discardRequired',
  'cardDiscarded',
  'soldierDeployed',
  'soldierMoved',
  'soldiersClashed',
  'soldierDamaged',
  'soldierDestroyed',
  'spellCast',
  'castleDamaged',
  'castleHealed',
  'weaponEquipped',
  'shieldAdded',
  'castleArmored',
  'armorExpired',
  'statusApplied',
  'statusCleared',
  'castlePoisoned',
  'castleCured',
  'roundStarted',
  'monsterAppeared',
  'monsterAttackedCastle',
  'monsterClashed',
  'monsterDamaged',
  'monsterDefeated',
  'coinsChanged',
  'mpChanged',
  'monsterEvolved',
  'upgradeBought',
  'soldierBuffed',
  'diceRolled',
  'playerEliminated',
  'roadClosed',
  'roadOpened',
  'defenseRequested',
  'defenseEnded',
  'spellReflected',
  'soldierDecoyed',
  'cardStolen',
  'spiritSummoned',
  'spiritTriggered',
  'spiritEnded',
  'soldierShot',
  'weatherChanged',
  'weatherLightning',
  'attackMissed',
  'attachmentChanged',
  'reactionTriggered',
  'gameOver',
];

/** rules.json に必要な項目と、許される最小値 */
const RULE_KEYS = {
  castleMaxHp: 1,
  initialHand: 0,
  drawPerTurn: 0,
  firstTurnDraw: 0,
  maxHand: 0,
  laneLength: 1,
  secondPlayerCastleBonus: 0,
};

/** rules.json の省略できる項目と、省略したときの値 */
const OPTIONAL_RULES = {
  elementBonus: 0, // （使わなくなった）属性の相性は data/elements.json の倍率で決まる
  monsterFirstRound: 3, // 魔物が出はじめる周回
  monsterCooldownRounds: 0, // 魔物を倒した道に、次の魔物が出ない周回の数
  maxRounds: 0, // 周回の上限（0 なら上限なし）
  // 戦いで相手だけが消えたら、残りの歩数を進み続ける（false なら、そのターンはその場で止まる）
  advanceAfterWin: false,
  // 城に着いた兵士が与えるダメージ ＝ 攻撃力 × この値
  soldierCastleDamageMultiplier: 1,
  // 同じ2人の間の道の本数（兵士を出すとき、どの道に出すかを選ぶ）
  laneCount: 1,
  // 攻撃を受けた人が、その場で防御カードを出せる（城に着いた兵士・城に当たる魔法・兵士に当たる魔法）
  defenseReaction: false,
  // 0 より大きいと、毎ターンのドローは「手札がこの枚数になるまで」（drawPerTurn は最低枚数）
  drawUntilHand: 0,
  // レアリティを使うとき、全員共通の山札に入る枚数（排出率で引き当てる）
  deckSize: 100,
  // true なら、毎ターンのドローが「前のターンに出したカードの枚数」以上になる（出した分を引き直す）
  drawPerPlayed: false,
  // 1ターンに出せる兵士の枚数（攻撃の魔法は別に1枚。精霊・コイン・武器・防御は何枚でも）
  soldiersPerTurn: 1,
  // 城壁：0 は従来どおり（重ならず、次の自分のターンの始めに消える）。1以上なら永続で、足し算、この値が上限
  armorMax: 0,
  // 毒（永続の毒の魔法）：毒が続くターン数（0 は永続）と、毒の量の上限（0 は上限なし）
  poisonTurns: 0,
  poisonMax: 0,
  // コインを増やすカードを1ターンに出せる枚数（0 は無制限）
  coinCardsPerTurn: 0,
  // 試合の最初に持っているコインと、自分のターンの始めにもらえるコイン
  initialCoins: 0,
  coinPerTurn: 0,
  // 放置された魔物が城を攻めるたびに、ダメージが増える量（1回目は castleAttack、2回目は +growth、…）
  monsterAttackGrowth: 0,
  // MP：試合の最初に持っている量と上限（maxMp が 0 のときは MP を使わない＝コストなし）
  initialMp: 0,
  maxMp: 0,
  // 後半ほど強い魔物が出やすくなる：魔物の重み × (1 + この値 × ごほうびの段階 × 出はじめてからの周回の数)。0 なら重みは変わらない
  monsterLateBias: 0,
  // 魔物を放置すると、この周回ごとにレアリティが1つ上がって強くなる（0 なら強くならない）。強くなる倍率は monsterEvolveMultiplier
  monsterEvolveEvery: 0,
  monsterEvolveMultiplier: 1,
  // デッキ編成（deckMode "cost"）：合計コストの範囲と、何も選ばなかった席が使う decks.json のデッキ
  ...DECK_COST_DEFAULTS,
  defaultCostDeck: null,
  // 天候（weather.json を渡したとき）：出はじめる周回と、天候が切り替わるときに新しい天候になる確率（0 ならずっと天候なし）
  weatherFirstRound: 2,
  weatherChangeChance: 0,
  // 昼と夜：出はじめる周回・夜が続く周回の数・夜に強くなる量（獣＝魔物の駒、暗殺者・忍者、魔物の城への攻撃）
  nightFirstRound: 2,
  nightRounds: 2,
  nightBeastAttack: 0,
  nightStealthAttack: 0,
  nightMonsterAttack: 0,
  // 後攻（先攻以外の人）の補正：初期手札に足す枚数と、最初から持っている城壁（チーム戦では使わない）
  secondPlayerHandBonus: 0,
  secondPlayerArmor: 0,
  // マリガン：true なら、start() のあと全員が1回だけ手札を引き直せる（phase "mulligan"）
  mulligan: false,
  // 背水の陣：城HPが上限 × overdriveHpRatio（四捨五入）以下になると、その城の兵士全員の攻撃 +overdriveAttack（0 なら使わない）
  overdriveAttack: 0,
  // 属性の反応（reactions.json を渡したとき）：付着が残るターン数（持ち主のターンの終わりに1減る）と、
  // 1人が自分のターンに起こせる反応の回数（0 なら反応も付着もなし）
  attachTurns: 2,
  reactionsPerTurn: 1,
};
/** 文字列で選ぶ項目と、選べる値（最初の値が省略したときの値） */
const CHOICE_RULES = {
  winCondition: ['firstDestroy', 'lastStanding'],
  castleSpellRange: ['any', 'neighbors'],
  // "cost"：1人1つのデッキを、コスト（rarities.json の deckCost）で編成する（setup.deckLists か、decks.json の costDeck: true のデッキ）
  deckMode: ['shared', 'own', 'cost'],
  // 3人以上の道の形："ring"（となりの席どうし）か "plaza"（真ん中の広場を通って、だれの城へも行ける）。2人ならどちらも同じ
  roadLayout: ['ring', 'plaza'],
  // チーム戦の手番："rotate"（チームを交互に、1回の手番はメンバー1人。A1 → B1 → A2 → B2 …）か
  // "all"（チームの手番でメンバー全員が順に動く。A1 → A2 → B1 → B2 …）
  teamTurns: ['rotate', 'all'],
};
/** 0以上1以下の数（整数でなくてよい）の省略できる項目 */
const OPTIONAL_RATE_RULES = {
  monsterSpawnChance: 0, // 周回の始めに、魔物がいない道ごとに魔物が出る確率
  overdriveHpRatio: 0, // 背水の陣になる城HPの割合（上限に対して。0 なら使わない）
  nightChance: 0, // 昼のとき、周回の始めに夜になる確率（0 なら夜にならない。ステージの nightChance が優先）
  rewardLuckyChance: 0, // 魔物のごほうびが、1つ上のレアリティになる確率（ラッキー）
  // チーム戦の城HP ＝ 代表の城HP ＋ この割合 × ほかのメンバーの城HPの合計（1 なら人数ぶん、0 なら1人ぶん）
  teamCastleHpShare: 1,
};

/** チームのID（最大4チーム） */
export const TEAM_IDS = ['t1', 't2', 't3', 't4'];
/** 1チームの最大人数 */
export const MAX_TEAM_SIZE = 7;

/** 広場の魔物の roadId */
export const PLAZA = 'plaza';
/** 兵士IDの番号（"s12" → 12）。先に出された兵士ほど小さい */
const soldierNumber = (s) => Number(s.soldierId.slice(1));

const ok = () => ({ ok: true });
const fail = (reason) => ({ ok: false, reason });

/** 忍者（見えない兵士）について、相手に隠すイベント。城・魔物へのダメージ（castleDamaged・monsterDamaged）は見せる */
/** コインのカード（1ターンに coinCardsPerTurn 枚まで）：コインを増やすカードとコインサイコロ */
const isCoinCard = (def) => def.effect === 'gainCoins' || (def.effect === 'dice' && def.dice === 'coin');

/** 城HPが変わるイベント（このあと背水の陣を確かめる） */
const CASTLE_HP_EVENTS = new Set(['castleDamaged', 'castleHealed', 'monsterAttackedCastle']);
const STEALTH_EVENTS = new Set([
  'soldierDeployed', 'soldierMoved', 'soldierDamaged', 'soldierDestroyed', 'statusApplied', 'statusCleared',
  'weaponEquipped', 'shieldAdded', 'soldierBuffed', 'monsterClashed', 'attachmentChanged', 'reactionTriggered',
]);
export class Game {
  /**
   * @param {object} options
   * @param {object} options.cards data/cards.json の中身
   * @param {object} options.rules data/rules.json の中身
   * @param {() => number} [options.rng] 0以上1未満を返す乱数。省略すると Math.random
   * @param {object} [options.monsters] data/monsters.json の中身。省略すると魔物は出ない
   * @param {object} [options.upgrades] data/upgrades.json の中身。省略すると強化は買えない
   * @param {object} [options.castles] data/castles.json の中身。省略すると城の種類なし
   * @param {object} [options.decks] data/decks.json の中身（deckMode "own" のときに使う）
   * @param {{castles?: string[], decks?: string[]}} [options.setup] 席ごとの城の種類・デッキ
   */
  constructor({ cards, rules, rng = Math.random, monsters = null, upgrades = null, castles = null, decks = null, rarities = null, weather = null, stages = null, elements = null, reactions = null, factions = null, races = null, setup: setupArg = {} } = {}) {
    const setup = setupArg ?? {};
    if (rarities !== null) validateRarities(rarities);
    if (elements !== null) validateElements(elements);
    if (reactions !== null) validateReactions(reactions, elements ?? DEFAULT_ELEMENTS);
    if (factions !== null) validateFactions(factions);
    Card.validateDefinitions(cards, rarities, { factions, races });
    Game.validateRules(rules);
    if (typeof rng !== 'function') throw new Error('rng は 0以上1未満の数を返す関数にしてください');
    if (monsters !== null) {
      Monster.validateDefinitions(monsters, ELEMENTS);
      if (rules.laneLength % 2 === 0) throw new Error('魔物を使うときは、真ん中のマスがひとつに決まるよう rules.json の laneLength を奇数にしてください');
    }
    if (weather !== null) validateWeather(weather, ELEMENTS);
    if (stages !== null) validateStages(stages, ELEMENTS);
    if (upgrades !== null) validateUpgrades(upgrades);
    if (castles !== null) validateCastles(castles);
    if (decks !== null) validateDecks(decks, cards);

    this.elementTable = elements ?? DEFAULT_ELEMENTS;
    this.cardDefs = cards;
    /** 属性の反応（reactions.json。渡さなければ null＝反応も付着もない） */
    this.reactionDefs = reactions;
    this.reactionIndex = reactions ? buildReactionIndex(reactions) : null;
    this.rarityDefs = rarities;
    this.monsterDefs = monsters;
    this.weatherDefs = weather;
    /** 今の天候 { type, roundsLeft }（なければ null＝ふつうの天気） */
    this.weather = null;
    this.stageDefs = stages;
    /** ステージのID（stages を渡さなければ null）。試合の最初に決まり、変わらない */
    this.stage = null;
    /** 夜なら { roundsLeft }（昼なら null） */
    this.night = null;
    this.upgradeDefs = upgrades || {};
    this.rules = {
      ...OPTIONAL_RULES,
      ...OPTIONAL_RATE_RULES,
      ...Object.fromEntries(Object.entries(CHOICE_RULES).map(([k, v]) => [k, v[0]])),
      playerCount: 2,
      ...rules,
    };
    this.castleDefs = castles;
    this.deckDefs = decks;
    this.rng = rng;
    // 四大陣営（PR-A）：setup.faction で陣営を選ぶと、山札・ドローの引き当て・入手券・排出率の表示が
    // 「その陣営のカード＋全陣営共通」の候補だけになる（Factions.js の isLegalForFaction）。省略すると今までどおり全カード
    this.factionDefs = factions;
    /** 選んだ陣営のID（陣営モードでなければ null） */
    this.faction = null;
    /** @type {Set<string>|null} 陣営モードの候補（カード種類）。陣営モードでなければ null */
    this.factionPoolTypes = null;
    if (setup.faction !== undefined && setup.faction !== null) {
      if (!factions) throw new Error('setup.faction を使うときは factions（data/factions.json）を渡してください');
      if (typeof setup.faction !== 'string' || !Object.hasOwn(factions, setup.faction)) {
        throw new Error(`setup.faction は ${Object.keys(factions).join(' / ')} のどれかにしてください`);
      }
      // 今は全員が同じ陣営の共有山札だけ（異陣営戦は別のモードで作る予定）
      if (this.rules.deckMode !== 'shared') throw new Error('陣営モードは共有山札（deckMode "shared"）だけです');
      this.faction = setup.faction;
      this.factionPoolTypes = factionPool(cards, setup.faction);
      if (this.factionPoolTypes.size === 0) throw new Error(`陣営「${factions[setup.faction].name}」のカードがありません`);
    }
    /** 反応を使うか（reactions を渡し、reactionsPerTurn が1以上） */
    this.reactionsOn = Boolean(reactions) && this.rules.reactionsPerTurn > 0;

    this.nextCardNumber = 1;
    this.nextSoldierNumber = 1;
    this.nextMonsterNumber = 1;
    /** @type {Monster[]} */
    this.monsters = [];
    /** 2人の組（道の pairId）→ この周回より前には魔物が出ない */
    this.monsterCooldown = new Map();
    this.round = 0;
    /** 攻撃を受けた人の防御を待っているとき（phase "defend"）：{ defenderId, attackerId, kind, amount, soldierIds, apply, after } */
    this.pending = null;
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map(EVENT_TYPES.map((type) => [type, new Set()]));

    /** 席順（手番の順） */
    const n = this.rules.playerCount;
    this.playerOrder = Array.from({ length: n }, (_, i) => `p${i + 1}`);
    this.players = {};
    const castleTypes = this.resolveSetupList(setup.castles, castles, this.rules.defaultCastle, '城の種類', 'castles');
    this.playerOrder.forEach((id, seat) => {
      // 後ろの席ほど城HPが少し多い（先攻有利をやわらげるため）
      const castleType = castleTypes ? castleTypes[seat] : null;
      const cdef = castleType ? castles[castleType] : {};
      const maxHp = Math.max(1, this.rules.castleMaxHp + this.seatBonus(seat) + (cdef.hpBonus ?? 0));
      const player = new Player(id, maxHp);
      player.coins = this.rules.initialCoins;
      player.mp = Math.min(this.rules.initialMp, this.rules.maxMp);
      player.castleType = castleType;
      player.castleDef = cdef;
      player.maxHand = Math.max(0, this.rules.maxHand + (cdef.maxHandBonus ?? 0));
      this.players[id] = player;
    });
    // チーム戦：setup.teams（席ごとのチームID）。チームの城はメンバー全員で1つ（代表＝チームでいちばん前の席の人の城）
    /** @type {Map<string, string>|null} プレイヤーID → チームID */
    this.teamOf = null;
    /** @type {string[]|null} チームの順（代表の席順）。手番はこの順にチームを回す */
    this.teamOrder = null;
    /** @type {Map<string, string[]>} チームID → メンバー（席順） */
    this.teamMembers = new Map();
    /** @type {Map<string, number>} チームID → 最後に手番だったメンバーの番号（members の何番目か） */
    this.teamCursor = new Map();
    if (setup.teams !== undefined) this.setupTeams(setup.teams, castles);

    /** 真ん中の広場を通る道か（城が3つ以上で roadLayout が "plaza" のとき）。広場では道（レーン）は1本 */
    this.plaza = this.rules.roadLayout === 'plaza' && this.aliveSides().length >= 3;
    if (this.plaza) this.rules.laneCount = 1;
    /** @type {Road[]} */
    this.roads = [];
    this.rebuildRoads();

    // 山札：deckMode "shared" は全員で1組、"own" は1人1組（data/decks.json のデッキ）
    // カードIDはシャッフルしたあとの順に振る（IDから種類が分からないように）
    /** @type {Map<string, Pile>} プレイヤーID → その人が使う山札 */
    this.piles = new Map();
    if (this.rules.deckMode === 'own') {
      const deckIds = this.resolveSetupList(setup.decks, decks, this.rules.defaultDeck, 'デッキ', 'decks');
      if (!deckIds) throw new Error('deckMode が "own" のときは decks（data/decks.json）を渡してください');
      this.playerOrder.forEach((id, seat) => {
        const pile = new Pile(id);
        const types = Object.entries(decks[deckIds[seat]].cards).flatMap(([t, k]) => Array(k).fill(t));
        pile.deck = this.shuffle(types).map((type) => this.createCard(type));
        this.players[id].deckId = deckIds[seat];
        this.piles.set(id, pile);
      });
    } else if (this.rules.deckMode === 'cost') {
      // デッキ編成：席ごとに、編成した deckLists[席]（{ 種類: 枚数 }）か、decks.json の costDeck のデッキ（setup.decks[席] / rules.defaultCostDeck）
      if (!rarities) throw new Error('deckMode が "cost" のときは rarities（data/rarities.json）を渡してください');
      const n = this.rules.playerCount;
      const lists = setup.deckLists ?? [];
      if (!Array.isArray(lists) || lists.length > n) throw new Error(`setup.deckLists は人数ぶん（${n}個）までの配列にしてください`);
      this.playerOrder.forEach((id, seat) => {
        let list = lists[seat];
        let deckId = 'custom';
        if (list === undefined || list === null) {
          deckId = setup.decks?.[seat] ?? this.rules.defaultCostDeck;
          if (!decks || !Object.hasOwn(decks, deckId) || !decks[deckId].costDeck) throw new Error(`席${seat + 1}のデッキがありません（setup.deckLists か、decks.json の costDeck のデッキを選んでください）`);
          list = decks[deckId].cards;
        }
        const check = checkCostDeck(list, cards, rarities, this.rules);
        if (!check.ok) throw new Error(`席${seat + 1}のデッキが決まりに合いません：${check.reason}`);
        const pile = new Pile(id);
        const types = Object.entries(list).flatMap(([t, k]) => Array(k).fill(t));
        pile.deck = this.shuffle(types).map((type) => this.createCard(type));
        this.players[id].deckId = deckId;
        this.piles.set(id, pile);
      });
    } else {
      if (setup.decks !== undefined || setup.deckLists !== undefined) throw new Error('setup.decks / setup.deckLists を使うときは、rules.json の deckMode を "own" か "cost" にしてください');
      const pile = new Pile(null);
      pile.deck = this.shuffle(this.buildDeckTypes()).map((type) => this.createCard(type));
      for (const id of this.playerOrder) this.piles.set(id, pile);
    }

    this.turn = 0;
    this.currentPlayer = this.playerOrder[0];
    this.phase = 'ready';
    this.winner = null;
    this.winnerTeam = null;
    this.discardCount = 0; // phase "discard" のときに捨てる必要がある枚数

    // 初期手札（ゲーム開始前なのでイベントは出さない）
    for (const id of this.playerOrder) {
      const pile = this.piles.get(id);
      for (let i = 0; i < this.rules.initialHand; i++) {
        const card = pile.deck.shift();
        if (!card) break;
        this.players[id].hand.push(card);
      }
    }

    // 先攻：setup.firstPlayer（省略すると席順の最初の人）。コイントスの結果を画面・サーバーが渡す。チーム戦では席順のまま
    const first = setup.firstPlayer ?? this.playerOrder[0];
    if (!this.playerOrder.includes(first)) throw new Error(`setup.firstPlayer は ${this.playerOrder.join(' / ')} のどれかにしてください`);
    if (first !== this.playerOrder[0] && this.teamOrder) throw new Error('チーム戦では setup.firstPlayer を使えません（チームの順で始まります）');
    this.firstPlayer = first;
    this.currentPlayer = first;
    // 後攻の補正：先攻以外の人は、初期手札が secondPlayerHandBonus 枚多く、最初から城壁 secondPlayerArmor を持つ
    if (!this.teamOrder) {
      for (const id of this.playerOrder) {
        if (id === first) continue;
        const pile = this.piles.get(id);
        for (let i = 0; i < this.rules.secondPlayerHandBonus; i++) {
          const card = pile.deck.shift();
          if (!card) break;
          this.players[id].hand.push(card);
        }
        if (this.rules.secondPlayerArmor > 0) {
          this.players[id].armor = this.rules.armorMax ? Math.min(this.rules.armorMax, this.rules.secondPlayerArmor) : this.rules.secondPlayerArmor;
        }
      }
    }
    /** 背水の陣になっている城（城の持ち主のID） */
    this.overdrive = new Set();
    /** マリガン（phase "mulligan"）で、まだ選んでいない人 */
    this.mulliganPending = new Set();

    // ステージ：setup.stage（ID か "random"。省略すると "random"）。山札を作ったあとに選ぶ（ステージを使わないときの山札の並びを変えないため）
    if (stages !== null) {
      const want = setup.stage ?? 'random';
      if (want !== 'random' && !Object.hasOwn(stages, want)) throw new Error(`setup.stage は stages.json のステージか "random" にしてください（"${want}"）`);
      this.stage = want === 'random' ? pickStage(stages, this.rng) : want;
    } else if (setup.stage !== undefined && setup.stage !== null) {
      throw new Error('setup.stage を使うときは stages（data/stages.json）を渡してください');
    }
  }

  /**
   * チームを作る。teams は席ごとのチームID（"t1"〜"t4"）。2チーム以上・1チーム7人まで。
   * 城HPは、メンバーそれぞれの城HP（castleMaxHp ＋ 自分の城の種類の hpBonus）の合計。席ごとの城ボーナスは使わない。
   * 城の種類のほかの効果（城への魔法・兵士の攻撃・手札の上限）は、メンバーごとに自分が選んだ城のもの。
   */
  setupTeams(teams, castles) {
    const n = this.rules.playerCount;
    if (!Array.isArray(teams) || teams.length !== n) throw new Error(`setup.teams は人数ぶん（${n}個）の配列にしてください`);
    for (const t of teams) if (!TEAM_IDS.includes(t)) throw new Error(`setup.teams：チームは ${TEAM_IDS.join(' / ')} のどれかにしてください`);
    const order = [...new Set(teams)];
    if (order.length < 2) throw new Error('setup.teams：チームは2つ以上にしてください');
    this.teamOf = new Map();
    for (const t of order) {
      const members = this.playerOrder.filter((_, seat) => teams[seat] === t);
      if (members.length > MAX_TEAM_SIZE) throw new Error(`setup.teams：1チームは${MAX_TEAM_SIZE}人までです`);
      this.teamMembers.set(t, members);
      this.teamCursor.set(t, -1);
      for (const id of members) this.teamOf.set(id, t);
      const hpOf = (id) => Math.max(1, this.rules.castleMaxHp + (this.players[id].castleDef.hpBonus ?? 0));
      const others = members.slice(1).reduce((sum, id) => sum + hpOf(id), 0);
      const hp = Math.max(1, Math.round(hpOf(members[0]) + this.rules.teamCastleHpShare * others));
      const leader = this.players[members[0]];
      leader.castle = new Castle(hp);
      for (const id of members) this.players[id].castle = leader.castle;
    }
    this.teamOrder = order;
  }

  /** 城の持ち主（盤面の上の「陣地」）。チーム戦ならチームの代表、そうでなければ本人 */
  side(playerId) {
    if (!this.teamOf) return playerId;
    return this.teamMembers.get(this.teamOf.get(playerId))[0];
  }

  /** まだ負けていない陣地（城の持ち主のID。席順） */
  aliveSides() {
    return [...new Set(this.alivePlayerIds().map((id) => this.side(id)))];
  }

  /** playerId から見た、まだ負けていない相手の陣地（城の持ち主の Player。席順） */
  enemySides(playerId) {
    const me = this.side(playerId);
    return this.aliveSides().filter((id) => id !== me).map((id) => this.players[id]);
  }

  /** 席ごとの城ボーナス */
  seatBonus(seat) {
    const n = this.rules.playerCount;
    if (this.rules.seatCastleBonus) return this.rules.seatCastleBonus[seat];
    if (n === 2) return seat === 1 ? this.rules.secondPlayerCastleBonus : 0;
    return Math.round((this.rules.secondPlayerCastleBonus * seat) / (n - 1));
  }

  /** setup.castles / setup.decks を席ごとの配列にする（defs がなければ null）。間違いは例外 */
  resolveSetupList(list, defs, fallback, label, key) {
    if (!defs) {
      if (list !== undefined) throw new Error(`setup.${key} を使うときは ${key}（data/${key}.json）も渡してください`);
      return null;
    }
    const n = this.rules.playerCount;
    const first = fallback ?? Object.keys(defs)[0];
    const result = list === undefined ? Array(n).fill(first) : list;
    if (!Array.isArray(result) || result.length !== n) throw new Error(`setup.${key} は人数ぶん（${n}個）の配列にしてください`);
    for (const id of result) {
      if (!Object.hasOwn(defs, id)) throw new Error(`setup.${key}：「${id}」という${label}はありません`);
    }
    return result;
  }

  /** その人が使う山札 */
  pileOf(playerId) {
    return this.piles.get(playerId);
  }

  static validateRules(rules) {
    if (!rules || typeof rules !== 'object') throw new Error('rules.json の中身を渡してください');
    for (const key of ['elementBonus', 'monsterFirstRound', 'monsterCooldownRounds', 'maxRounds', 'drawUntilHand', 'initialCoins', 'coinPerTurn', 'monsterAttackGrowth', 'initialMp', 'maxMp', 'monsterEvolveEvery', 'nightFirstRound', 'nightBeastAttack', 'nightStealthAttack', 'nightMonsterAttack', 'secondPlayerHandBonus', 'secondPlayerArmor', 'overdriveAttack', 'reactionsPerTurn']) {
      const v = rules[key];
      if (v !== undefined && (!Number.isInteger(v) || v < 0)) {
        throw new Error(`rules.json の ${key} は 0 以上の整数にしてください（書かなければ ${OPTIONAL_RULES[key]}）`);
      }
    }
    for (const [key, values] of Object.entries(CHOICE_RULES)) {
      if (rules[key] !== undefined && !values.includes(rules[key])) {
        throw new Error(`rules.json の ${key} は ${values.map((v) => `"${v}"`).join(' / ')} のどれかにしてください`);
      }
    }
    if (rules.playerCount !== undefined && (!Number.isInteger(rules.playerCount) || rules.playerCount < 2 || rules.playerCount > 8)) {
      throw new Error('rules.json の playerCount は 2〜8 の整数にしてください');
    }
    if (rules.seatCastleBonus !== undefined
      && (!Array.isArray(rules.seatCastleBonus) || !rules.seatCastleBonus.every((v) => Number.isInteger(v) && v >= 0)
        || rules.seatCastleBonus.length < (rules.playerCount ?? 2))) {
      throw new Error('rules.json の seatCastleBonus は、人数ぶん以上の0以上の整数の配列にしてください');
    }
    if (rules.nightRounds !== undefined && (!Number.isInteger(rules.nightRounds) || rules.nightRounds < 1)) throw new Error('rules.json の nightRounds は 1 以上の整数にしてください');
    if (rules.attachTurns !== undefined && (!Number.isInteger(rules.attachTurns) || rules.attachTurns < 1)) throw new Error('rules.json の attachTurns は 1 以上の整数にしてください（書かなければ 2）');
    for (const key of ['monsterLateBias', 'monsterEvolveMultiplier']) {
      const v = rules[key];
      if (v !== undefined && (typeof v !== 'number' || !(v >= 0))) throw new Error(`rules.json の ${key} は 0 以上の数にしてください（書かなければ ${OPTIONAL_RULES[key]}）`);
    }
    for (const key of Object.keys(OPTIONAL_RATE_RULES)) {
      const v = rules[key];
      if (v !== undefined && (typeof v !== 'number' || !(v >= 0 && v <= 1))) {
        throw new Error(`rules.json の ${key} は 0 以上 1 以下の数にしてください`);
      }
    }
    if (rules.soldiersPerTurn !== undefined && !(Number.isInteger(rules.soldiersPerTurn) && rules.soldiersPerTurn >= 1)) {
      throw new Error('rules.json の soldiersPerTurn は1以上の整数にしてください（書かなければ 1）');
    }
    for (const key of ['armorMax', 'poisonTurns', 'poisonMax', 'coinCardsPerTurn']) {
      if (rules[key] !== undefined && !(Number.isInteger(rules[key]) && rules[key] >= 0)) {
        throw new Error(`rules.json の ${key} は0以上の整数にしてください（書かなければ 0）`);
      }
    }
    if (rules.drawPerPlayed !== undefined && typeof rules.drawPerPlayed !== 'boolean') {
      throw new Error('rules.json の drawPerPlayed は true か false にしてください（書かなければ false）');
    }
    if (rules.advanceAfterWin !== undefined && typeof rules.advanceAfterWin !== 'boolean') {
      throw new Error('rules.json の advanceAfterWin は true か false にしてください（書かなければ false）');
    }
    if (rules.defenseReaction !== undefined && typeof rules.defenseReaction !== 'boolean') {
      throw new Error('rules.json の defenseReaction は true か false にしてください（書かなければ false）');
    }
    if (rules.laneCount !== undefined && (!Number.isInteger(rules.laneCount) || rules.laneCount < 1 || rules.laneCount > 5)) {
      throw new Error('rules.json の laneCount は 1〜5 の整数にしてください（書かなければ 1）');
    }
    const m = rules.soldierCastleDamageMultiplier;
    if (m !== undefined && (!Number.isInteger(m) || m < 1)) {
      throw new Error('rules.json の soldierCastleDamageMultiplier は 1 以上の整数にしてください（書かなければ 1）');
    }
    for (const [key, min] of Object.entries(RULE_KEYS)) {
      const v = rules[key];
      if (!Number.isInteger(v) || v < min) {
        throw new Error(`rules.json の ${key} は ${min} 以上の整数にしてください`);
      }
    }
  }

  // ================= イベント =================

  /** イベントを購読する。handler はペイロードのオブジェクトを1つ受け取る */
  on(type, handler) {
    if (!this.listeners.has(type)) return fail(`"${type}" というイベントはありません`);
    if (typeof handler !== 'function') return fail('handler には関数を渡してください');
    this.listeners.get(type).add(handler);
    return ok();
  }

  /** 購読を解除する */
  off(type, handler) {
    if (!this.listeners.has(type)) return fail(`"${type}" というイベントはありません`);
    this.listeners.get(type).delete(handler);
    return ok();
  }

  emit(type, payload) {
    // 忍者（見えない兵士）に関わるイベントには、持ち主の陣地（stealth）を付ける。
    // 相手には visibility.js（filterEventFor）がこのイベントを隠す（城・魔物へのダメージは見える）
    const sid = payload?.soldierId ?? payload?.attacker?.soldierId;
    if (sid && this.stealthSides?.has(sid) && STEALTH_EVENTS.has(type)) payload = { ...payload, stealth: this.stealthSides.get(sid) };
    for (const handler of [...this.listeners.get(type)]) {
      try {
        handler(payload);
      } catch (err) {
        // 画面側のエラーでゲームの状態が途中で止まらないようにする
        console.error(`イベント "${type}" の処理中にエラー:`, err);
      }
    }
    // 城HPが変わったら、背水の陣になったか（終わったか）を確かめる
    if (CASTLE_HP_EVENTS.has(type)) this.updateOverdrive();
  }

  /** 背水の陣になる城HP（上限 × overdriveHpRatio を四捨五入）。使わないなら -1 */
  overdriveLine(owner) {
    if (!this.rules.overdriveAttack || !this.rules.overdriveHpRatio) return -1;
    return Math.round(owner.castle.maxHp * this.rules.overdriveHpRatio);
  }

  /** 城ごとに背水の陣かを確かめ、変わったら overdriveChanged を出す */
  updateOverdrive() {
    if (!this.rules.overdriveAttack || !this.rules.overdriveHpRatio) return;
    for (const id of this.aliveSides()) {
      const owner = this.players[id];
      const on = owner.castle.hp > 0 && owner.castle.hp <= this.overdriveLine(owner);
      if (on === this.overdrive.has(id)) continue;
      if (on) this.overdrive.add(id);
      else this.overdrive.delete(id);
      this.emit('overdriveChanged', { playerId: id, active: on, hp: owner.castle.hp, attack: this.rules.overdriveAttack });
    }
  }

  // ================= 山札 =================

  createCard(type) {
    const cardId = `c${String(this.nextCardNumber++).padStart(2, '0')}`;
    return new Card(cardId, type, this.cardDefs[type]);
  }

  /**
   * 山札に入るカード種類の並び。
   * rarities を渡したときは、排出率（レアリティの割合 × 同じレアリティ内の weight）で rules.deckSize 枚を引き当てる。
   * 渡さないときは、count 枚ずつ。
   */
  buildDeckTypes() {
    // 共有山札は全員で1組なので、陣営モードでも全員が同じ候補（いちばん前の席の人の候補を使う）
    const pool = this.poolOf(this.playerOrder[0]);
    if (this.rarityDefs) return sampleDeckTypes(this.cardDefs, this.rarityDefs, this.rules.deckSize, this.rng, pool);
    const types = [];
    for (const [type, def] of Object.entries(this.cardDefs)) {
      if (pool && !pool.has(type)) continue;
      if (!isDrawable(def, Boolean(pool))) continue; // 効果がまだないカード・陣営モード専用のカード（今はどれも count 0）
      for (let i = 0; i < def.count; i++) types.push(type);
    }
    return types;
  }

  /**
   * その人がカードを引き当てるときの候補（カード種類の Set）。陣営モードでなければ null（＝全カード）。
   * 今は全員が同じ陣営なので playerId は使わないが、異陣営戦（1人1つの陣営。PR-E）に広げられるよう、プレイヤーごとに聞く形にしてある
   */
  // eslint-disable-next-line no-unused-vars
  poolOf(playerId) {
    return this.factionPoolTypes;
  }

  /** Fisher-Yates シャッフル（rng を使うので、rng を固定すれば順番も固定できる） */
  shuffle(cards) {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }

  /** count 枚引く。山札が尽きたら捨て札をシャッフルし直す。両方空なら引けたぶんだけ */
  drawCards(player, count) {
    const cardIds = [];
    const pile = this.pileOf(player.id);
    for (let i = 0; i < count; i++) {
      // 運命の祈り：山札からではなく、排出率を上げて引き当てる
      if (player.luck && this.rarityDefs) {
        const type = sampleType(this.cardDefs, this.rarityDefs, this.rng, { from: player.luck.from, multiplier: player.luck.boost }, this.poolOf(player.id));
        const lucky = this.createCard(type);
        player.hand.push(lucky);
        cardIds.push(lucky.cardId);
        if (--player.luck.draws <= 0) player.luck = null;
        continue;
      }
      // 排出率の恒久強化：chance の確率で、山札からではなく、排出率を上げて引き当てる（山札は減らない）
      if (player.permLuck && this.rarityDefs && this.rng() < player.permLuck.chance) {
        const type = sampleType(this.cardDefs, this.rarityDefs, this.rng, { from: player.permLuck.from, multiplier: player.permLuck.boost }, this.poolOf(player.id));
        const lucky = this.createCard(type);
        player.hand.push(lucky);
        cardIds.push(lucky.cardId);
        continue;
      }
      if (pile.deck.length === 0) {
        if (pile.discard.length === 0) break;
        pile.deck = this.shuffle(pile.discard);
        pile.discard = [];
        this.emit('deckShuffled', { deckCount: pile.deck.length, playerId: pile.owner });
      }
      const card = pile.deck.shift();
      player.hand.push(card);
      cardIds.push(card.cardId);
    }
    if (cardIds.length > 0) this.emit('cardDrawn', { playerId: player.id, cardIds });
  }

  // ================= 席と道 =================

  /** まだ負けていないプレイヤーのID（席順） */
  alivePlayerIds() {
    return this.playerOrder.filter((id) => !this.players[id].eliminated);
  }

  /** playerId から見た、まだ負けていない相手全員（席順） */
  opponentsOf(playerId) {
    const me = this.side(playerId);
    return this.alivePlayerIds().filter((id) => this.side(id) !== me).map((id) => this.players[id]);
  }

  /** playerId と道でつながっている相手（となりの席） */
  neighborsOf(playerId) {
    const me = this.side(playerId);
    const ids = new Set(this.roads.filter((r) => r.has(me)).map((r) => r.otherSide(me)));
    return [...ids].map((id) => this.players[id]);
  }

  /** 2人の間の道（なければ null）。道が何本かあるときは最初の1本 */
  roadBetween(a, b) {
    const [x, y] = [this.side(a), this.side(b)];
    return this.roads.find((r) => r.has(x) && r.has(y)) || null;
  }

  /** 2人の間の道すべて（rules.laneCount 本。つながっていなければ空） */
  roadsBetween(a, b) {
    const [x, y] = [this.side(a), this.side(b)];
    return this.roads.filter((r) => r.has(x) && r.has(y));
  }

  /** そのカードが「選んだ1レーンだけに効く」魔法か（道が1本のときはふつうの魔法と同じ） */
  isLaneScoped(def) {
    return def.scope === 'lane' && this.rules.laneCount > 1;
  }

  findRoad(roadId) {
    return this.roads.find((r) => r.roadId === roadId) || null;
  }

  /**
   * まだ負けていない人を輪にならべ、となりどうしを道でつなぐ。2人なら1本。今ある道はそのまま残す。
   * 負けた人が出たとき（lastStanding）は eliminate() から呼び、なくなった道の兵士・魔物・トラップは eliminate() が消す。
   * @returns {{opened: Road[], closed: Road[]}}
   */
  rebuildRoads() {
    const alive = this.aliveSides();
    const pairs = [];
    if (this.plaza) {
      // 広場：だれの城へも行けるので、まだ負けていない2人ずつの組すべてに「通り道」がある（広場で重なっている）
      for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) pairs.push([alive[i], alive[j]]);
    } else if (alive.length === 2) pairs.push([alive[0], alive[1]]);
    else if (alive.length > 2) {
      for (let i = 0; i < alive.length; i++) {
        const a = alive[i];
        const b = alive[(i + 1) % alive.length];
        // 道のIDは席順が前の人を先に
        pairs.push(this.playerOrder.indexOf(a) < this.playerOrder.indexOf(b) ? [a, b] : [b, a]);
      }
    }
    const opened = [];
    const { laneCount } = this.rules;
    const next = pairs.flatMap(([a, b]) =>
      Array.from({ length: laneCount }, (_, lane) => {
        const existing = this.roads.find((r) => r.players[0] === a && r.players[1] === b && r.lane === lane);
        if (existing) return existing;
        const road = new Road(a, b, this.rules.laneLength, lane, laneCount);
        opened.push(road);
        return road;
      }),
    );
    const closed = this.roads.filter((r) => !next.includes(r));
    this.roads = next;
    return { opened, closed };
  }

  /** 席順で次の手番の人（負けた人は飛ばす） */
  nextPlayerAfter(playerId) {
    if (this.teamOrder) {
      // チーム戦：チームを順に回す（A → B → A …）。チームの中は、前に手番だった人の次のメンバー
      const teams = this.aliveTeams();
      const mine = this.teamOf.get(playerId);
      // "all"：チームのメンバーがまだ残っていれば、同じチームの次の人
      if (this.rules.teamTurns === 'all') {
        const members = this.teamMembers.get(mine);
        const rest = members.slice(members.indexOf(playerId) + 1).find((id) => !this.players[id].eliminated);
        if (rest) return rest;
        this.teamCursor.set(mine, -1);
      }
      const at = teams.indexOf(mine);
      const team = teams[(at + 1) % teams.length];
      return this.nextMemberOf(team);
    }
    const n = this.playerOrder.length;
    const start = this.playerOrder.indexOf(playerId);
    for (let i = 1; i <= n; i++) {
      const id = this.playerOrder[(start + i) % n];
      if (!this.players[id].eliminated) return id;
    }
    return playerId;
  }

  /** まだ負けていないメンバーがいるチーム（チームの順） */
  aliveTeams() {
    return this.teamOrder.filter((t) => this.teamMembers.get(t).some((id) => !this.players[id].eliminated));
  }

  /** そのチームで、次に手番になるメンバー（前に手番だった人の次。負けた人は飛ばす） */
  nextMemberOf(team) {
    const members = this.teamMembers.get(team);
    const last = this.teamCursor.get(team);
    for (let i = 1; i <= members.length; i++) {
      const id = members[(last + i) % members.length];
      if (!this.players[id].eliminated) return id;
    }
    return members[0];
  }

  // ================= ターン進行 =================

  /** ゲームを始める（席順の最初の人のターン1）。UI が on() で購読してから呼ぶ */
  start() {
    if (this.phase !== 'ready') return fail('ゲームはもう始まっています');
    // マリガン：全員が手札を引き直すか選んでから、先攻のターン1が始まる
    if (this.rules.mulligan) {
      this.phase = 'mulligan';
      this.mulliganPending = new Set(this.alivePlayerIds());
      this.emit('mulliganStarted', { playerIds: [...this.mulliganPending], firstPlayer: this.firstPlayer });
      return ok();
    }
    this.beginTurn(this.firstPlayer);
    return ok();
  }

  /** 周回を始める人（先攻から席順に数えて、まだ負けていない最初の人） */
  roundLeader() {
    const order = this.playerOrder;
    const start = order.indexOf(this.firstPlayer);
    for (let i = 0; i < order.length; i++) {
      const id = order[(start + i) % order.length];
      if (!this.players[id].eliminated) return id;
    }
    return null;
  }

  /**
   * マリガン：最初の手札から cardIds（0枚でもよい）を山札に戻してシャッフルし、同じ枚数を引き直す。1人1回だけ。
   * 全員が選び終わったら、先攻のターン1が始まる。自分の番でなくても送れる
   */
  mulligan(playerId, cardIds = []) {
    if (this.phase !== 'mulligan') return fail('今は手札を引き直す場面ではありません');
    if (!this.mulliganPending.has(playerId)) return fail('手札の引き直しはもう選びました');
    if (!Array.isArray(cardIds)) return fail('引き直すカードのIDを配列で渡してください');
    const player = this.players[playerId];
    if (new Set(cardIds).size !== cardIds.length) return fail('同じカードを2回選んでいます');
    const cards = cardIds.map((id) => player.findInHand(id));
    if (cards.some((c) => !c)) return fail('そのカードは手札にありません');
    const pile = this.pileOf(playerId);
    player.hand = player.hand.filter((c) => !cardIds.includes(c.cardId));
    pile.deck.push(...cards);
    pile.deck = this.shuffle(pile.deck);
    const drawn = [];
    for (let i = 0; i < cards.length; i++) {
      const card = pile.deck.shift();
      if (!card) break;
      player.hand.push(card);
      drawn.push(card.cardId);
    }
    this.mulliganPending.delete(playerId);
    this.emit('mulliganDone', { playerId, count: cards.length, returnedIds: [...cardIds], cardIds: drawn });
    if (this.mulliganPending.size === 0) this.beginTurn(this.firstPlayer);
    return ok();
  }

  /** ターン開始：（城壁が消える）→ ドロー → 進軍 → メインへ */
  beginTurn(playerId, { continueRound = false } = {}) {
    // 周回の上限：その周回を全員が終えたら、城HPの割合で決着
    // continueRound：周回の始めに手番の人が抜けて、同じ周回のまま次の人に回すとき
    // チーム戦は、最初のチームの手番が来るたびに周回が変わる
    const isRoundStart = !continueRound && (this.teamOrder
      ? this.teamOf.get(playerId) === this.aliveTeams()[0] && (this.rules.teamTurns === 'rotate' || this.teamCursor.get(this.teamOf.get(playerId)) === -1)
      : playerId === this.roundLeader());
    if (isRoundStart && this.rules.maxRounds > 0 && this.round >= this.rules.maxRounds) {
      this.finishByRoundLimit();
      return;
    }
    const player = this.players[playerId];
    this.currentPlayer = playerId;
    if (this.teamOrder) this.teamCursor.set(this.teamOf.get(playerId), this.teamMembers.get(this.teamOf.get(playerId)).indexOf(playerId));
    this.turn += 1;
    this.phase = 'main';
    player.playedThisTurn = false;
    player.soldiersPlayedThisTurn = 0;
    player.coinCardsPlayedThisTurn = 0;
    player.reactionsThisTurn = 0;
    const playedLastTurn = player.cardsPlayedThisTurn;
    player.cardsPlayedThisTurn = 0;
    this.emit('turnStarted', { playerId, turn: this.turn });

    // 周回の始め（席順の最初の人のターン）：魔物が城を攻める → 魔物が出る
    if (isRoundStart) {
      this.round += 1;
      this.emit('roundStarted', { round: this.round });
      this.tickWeather();
      this.tickNight();
      // 天候の雷・砂嵐で城が落ちたら、そこで止める
      if (this.weatherRoundEffects() && this.checkGameOver()) return;
      this.stageEruption();
      this.monstersAttackCastles();
      // 魔物に城を落とされたら、そこで止める（魔物の出現・ドロー・進軍はしない）
      if (this.checkGameOver()) return;
      // lastStanding（3人以上・試作）で手番の人が魔物に落とされて抜けたら、次の人の番にする
      if (player.eliminated) {
        this.spawnMonsters();
        this.beginTurn(this.nextPlayerAfter(playerId), { continueRound: true });
        return;
      }
      this.spawnMonsters();
    }

    // 城壁は、自分の次のターンの始めに消える（armorMax があるときは永続）
    if (player.armor > 0 && !this.rules.armorMax) {
      player.armor = 0;
      this.emit('armorExpired', { playerId });
    }

    // 毒の城：自分のターンの始めに毒のダメージ（城壁は効かない。城が落ちたら、そこで止める）
    if (this.tickCastlePoison(player)) return;
    if (player.eliminated) {
      this.beginTurn(this.nextPlayerAfter(playerId), { continueRound: true });
      return;
    }

    // コイン：自分のターンの始めに coinPerTurn 枚もらえる
    if (this.rules.coinPerTurn > 0) this.changeCoins(player, this.rules.coinPerTurn, 'turn');
    // コインの雨：自分のターンの始めにコインがもらえる
    const rainCoins = this.weatherDef()?.coinPerTurn ?? 0;
    if (rainCoins > 0) this.changeCoins(player, rainCoins, 'weather');
    // 古代遺跡：自分のターンの始めに MP が増える
    const stageMp = this.stageDef()?.mpPerTurn ?? 0;
    if (stageMp > 0 && this.rules.maxMp > 0) this.changeMp(player, stageMp, 'stage');

    // 1. ドロー（先攻の最初のターンだけ firstTurnDraw 枚。ほかは毎ターン drawPerTurn 枚に固定）
    const baseDraw = this.turn === 1 ? this.rules.firstTurnDraw : this.rules.drawPerTurn;
    const drawCount = Math.max(baseDraw, this.rules.drawUntilHand - player.hand.length, this.rules.drawPerPlayed ? playedLastTurn : 0);
    this.drawCards(player, drawCount);
    if (this.triggerSpirit(player)) return;

    // 2. 進軍
    this.advanceSoldiers(player);
  }

  /**
   * 進軍：出した順に1体ずつ、1マスずつ進める。
   * 1体ごとに：毒のダメージ →（凍結なら休む）→ 動く。
   * 1マス進むごとに、トラップ → 「同じマスか1つ先のマス」の相手の兵士 の順に確かめる。
   * 戦ったら（相手だけが消えても）そのターンはその場で止まる。トラップにかかっても止まる。
   * 城に着いたら 移動 → 城にダメージ → 消える。城が落ちたらその場でゲームを止める。
   */
  advanceSoldiers(player, queue = [...player.soldiers]) {
    const { laneLength } = this.rules;

    while (queue.length > 0) {
      const soldier = queue.shift();
      if (!player.soldiers.includes(soldier)) continue; // 念のため
      const enemy = this.players[soldier.targetId];
      const road = this.findRoad(soldier.roadId);

      // 毒（盾は効かない）
      if (soldier.poison) {
        const { amount } = soldier.poison;
        soldier.takeDamage(amount, { ignoreShield: true });
        this.emit('soldierDamaged', {
          playerId: player.id, soldierId: soldier.soldierId, amount, hp: soldier.hp, cause: 'poison', blocked: 0,
        });
        // turns が null の毒は永続（解毒薬か、兵士が倒れるまで続く）
        if (soldier.poison.turns !== null) soldier.poison.turns -= 1;
        if (soldier.isDead) {
          this.removeSoldier(player, soldier, 'killed');
          continue;
        }
        if (soldier.poison.turns !== null && soldier.poison.turns <= 0) {
          soldier.poison = null;
          this.emit('statusCleared', { playerId: player.id, soldierId: soldier.soldierId, status: 'poison' });
        }
      }
      // やけど（盾は効かない。毒と同じく、回数が来たら治る）
      if (soldier.burn) {
        const { amount } = soldier.burn;
        soldier.takeDamage(amount, { ignoreShield: true });
        this.emit('soldierDamaged', {
          playerId: player.id, soldierId: soldier.soldierId, amount, hp: soldier.hp, cause: 'burn', blocked: 0,
        });
        soldier.burn.turns -= 1;
        if (soldier.isDead) {
          this.removeSoldier(player, soldier, 'killed');
          continue;
        }
        if (soldier.burn.turns <= 0) {
          soldier.burn = null;
          this.emit('statusCleared', { playerId: player.id, soldierId: soldier.soldierId, status: 'burn' });
        }
      }
      // 継続ダメージ（感電・砂嵐の反応。盾は効かない。回数が来たら治る）
      if (soldier.dot) {
        const { amount } = soldier.dot;
        soldier.takeDamage(amount, { ignoreShield: true });
        this.emit('soldierDamaged', {
          playerId: player.id, soldierId: soldier.soldierId, amount, hp: soldier.hp, cause: 'dot', blocked: 0,
        });
        soldier.dot.turns -= 1;
        if (soldier.isDead) {
          this.removeSoldier(player, soldier, 'killed');
          continue;
        }
        if (soldier.dot.turns <= 0) {
          soldier.dot = null;
          this.emit('statusCleared', { playerId: player.id, soldierId: soldier.soldierId, status: 'dot' });
        }
      }
      // 鈍足（泥・吹雪の反応）：この進軍は速さが下がる。進軍のたびに1減る
      soldier.slowNow = soldier.slow > 0 ? soldier.slowAmount : 0;
      if (soldier.slow > 0) {
        soldier.slow -= 1;
        if (soldier.slow === 0) {
          soldier.slowAmount = 0;
          this.emit('statusCleared', { playerId: player.id, soldierId: soldier.soldierId, status: 'slow' });
        }
      }
      // 凍結：この進軍は休む
      if (soldier.frozen > 0) {
        soldier.frozen -= 1;
        if (soldier.frozen === 0) {
          this.emit('statusCleared', { playerId: player.id, soldierId: soldier.soldierId, status: 'frozen' });
        }
        // 凍った弓兵・魔法使いは撃てないが、ターンは過ぎる
        if (soldier.isStationary) this.tickRanged(player, soldier);
        continue;
      }

      // 嵐：進む兵士は動かない（弓兵・魔法使いは撃てる）
      if (!soldier.isStationary && this.weatherDef()?.stopMarch) continue;

      // 弓兵・魔法使いは動かずに撃つ
      if (soldier.isRanged) {
        if (this.shoot(player, soldier)) return;
        continue;
      }
      // 護衛（ゴーレム）は動かずに守る。自分から戦いには行かず、ターンが過ぎるだけ
      if (soldier.isGuard) {
        this.tickRanged(player, soldier);
        continue;
      }

      let steps = 0;
      let reached = false;
      let monster = null;
      // advanceAfterWin のときは、戦って相手だけが消えたら、残りの歩数でもう一度進む
      for (;;) {
        const from = soldier.position;
        let opponent = this.findClashTarget(soldier, player);
        monster = opponent ? null : this.findMonsterInRange(soldier, player);
        let moved = 0;
        const speed = this.speedOf(player, soldier);
      while (!opponent && !monster && steps < speed) {
          soldier.moveForward();
          steps += 1;
          moved += 1;
          if (soldier.hasReachedCastle(laneLength)) break;
          opponent = this.findClashTarget(soldier, player);
          if (!opponent) monster = this.findMonsterInRange(soldier, player);
        }
        // 氷のステージ：止められずに歩き切ったら、滑って1マス余分に進むことがある
        let slipped = false;
        const slip = this.stageDef()?.slipChance ?? 0;
        if (slip > 0 && moved > 0 && steps >= speed && !opponent && !monster && !soldier.hasReachedCastle(laneLength) && this.rng() < slip) {
          soldier.moveForward();
          moved += 1;
          slipped = true;
          if (!soldier.hasReachedCastle(laneLength)) {
            opponent = this.findClashTarget(soldier, player);
            if (!opponent) monster = this.findMonsterInRange(soldier, player);
          }
        }
        reached = soldier.hasReachedCastle(laneLength);
        if (moved > 0) {
          // 城に着いた兵士は城の位置（laneLength）まで動いたことにする
          this.emit('soldierMoved', {
            playerId: player.id,
            soldierId: soldier.soldierId,
            roadId: road.roadId,
            from,
            to: reached ? laneLength : soldier.position,
            ...(slipped ? { slipped: true } : {}),
          });
        }
        if (!opponent) break;
        this.fight(player, soldier, opponent.owner, opponent.soldier);
        const keepGoing = this.rules.advanceAfterWin && opponent.soldier.isDead && !soldier.isDead && steps < speed;
        if (!keepGoing) break;
      }
      if (monster) {
        this.fightMonster(player, soldier, monster);
        continue;
      }
      if (!reached) continue;

      const damage = this.stageBoost(soldier, this.attackOf(soldier)) * this.rules.soldierCastleDamageMultiplier;
      const hit = () => {
        this.damageCastle(enemy, damage, { kind: 'soldier', soldierId: soldier.soldierId });
        player.removeSoldier(soldier.soldierId);
        this.emit('soldierDestroyed', {
          playerId: player.id,
          soldierId: soldier.soldierId,
          reason: 'reachedCastle',
        });
      };
      // 城を攻められる人は、ここで防御カード（城壁など）を出せる。待つときは、返事が来てから続きを進める
      const waiting = this.requestDefense(
        {
          kind: 'castle', defenderId: enemy.id, attackerId: player.id, amount: damage, from: 'soldier', soldierId: soldier.soldierId,
          // 身代わり：ダメージを受けずに、兵士だけが消える
          onNullify: () => {
            player.removeSoldier(soldier.soldierId);
            this.emit('soldierDestroyed', { playerId: player.id, soldierId: soldier.soldierId, reason: 'reachedCastle' });
          },
        },
        hit,
        () => {
          if (!this.checkGameOver()) this.advanceSoldiers(player, queue);
        },
      );
      if (waiting) return;

      // 城が落ちた瞬間にゲームを止める（残りの兵士は動かさない）
      if (this.checkGameOver()) return;
    }
  }

  /** 毒の量を上限（poisonMax。0 は上限なし）でおさえる */
  capPoison(amount) {
    return this.rules.poisonMax ? Math.min(this.rules.poisonMax, amount) : amount;
  }

  /** その城壁を今置いても、何も増えないか */
  armorFull(player, def) {
    return this.rules.armorMax ? player.armor >= this.rules.armorMax : player.armor >= def.amount;
  }

  /** 城にダメージ。城壁が先に受ける。castleDamaged を出す */
  damageCastle(owner, amount, source) {
    amount = this.reduceDamage(owner, amount);
    const blocked = Math.min(owner.armor, amount);
    owner.armor -= blocked;
    owner.castle.takeDamage(amount - blocked);
    this.emit('castleDamaged', { playerId: owner.id, amount, blocked, hp: owner.castle.hp, source });
  }

  /**
   * 毒の城：持ち主（チーム戦なら代表）のターンの始めに、毒の量ぶんダメージ（城壁も、土の精霊も効かない）。
   * castleDamaged（source: { kind: "poison" }）を出す。城が落ちてゲームが終わったら true
   */
  tickCastlePoison(player) {
    const poison = player.castle.poison;
    if (!poison || this.side(player.id) !== player.id) return false;
    player.castle.takeDamage(poison);
    this.emit('castleDamaged', { playerId: player.id, amount: poison, blocked: 0, hp: player.castle.hp, source: { kind: 'poison' } });
    // 毒に期限があるときは、ダメージのたびに1減って、0で治る
    if (player.castle.poisonTurns != null) {
      player.castle.poisonTurns -= 1;
      if (player.castle.poisonTurns <= 0 && player.castle.hp > 0) {
        player.castle.poison = null;
        player.castle.poisonTurns = null;
        this.emit('castleCured', { playerId: player.id });
      }
    }
    return this.checkGameOver();
  }

  /**
   * 兵士にダメージ（盾が先に受ける）。soldierDamaged を出し、HPが0なら消す。消えたら true。
   * hit（{ attackerId, element }）を渡すと、属性つきの攻撃として付着・反応を調べる（属性の反応）
   */
  damageSoldier(owner, soldier, amount, cause, hit = null) {
    let after = null;
    if (hit) ({ amount, after } = this.prepareHit(hit.attackerId, owner, soldier, amount, hit.element));
    amount = this.reduceDamage(owner, amount);
    const blocked = soldier.takeDamage(amount);
    this.emit('soldierDamaged', {
      playerId: owner.id, soldierId: soldier.soldierId, amount, hp: soldier.hp, cause, blocked,
    });
    const dead = soldier.isDead;
    if (dead) this.removeSoldier(owner, soldier, 'killed');
    after?.();
    return dead;
  }

  // ================= 属性の反応 =================
  // 属性つきの攻撃（兵士の戦い・射撃、element のある魔法）が兵士に当たると、標的にその属性が付着する（attachTurns）。
  // 付着しているところへ別の属性で当てると、reactions.json に組があれば反応が起きる（攻撃した人の自分のターンに reactionsPerTurn 回まで）。
  // 凍結中は氷、やけど中は火が付着しているものとして照合する（付着 attachment があればそちらが先）。

  /** 照合に使う付着 { element, implicit, from }。implicit は、凍結・やけどから見た付着なら "frozen" / "burn" */
  attachmentOf(soldier) {
    if (soldier.attachment) return { element: soldier.attachment.element, implicit: null, from: soldier.attachment.from ?? null };
    if (soldier.frozen > 0) return { element: 'ice', implicit: 'frozen', from: null };
    if (soldier.burn) return { element: 'fire', implicit: 'burn', from: null };
    return null;
  }

  /** 付着を変える（element が null なら消す）。attachmentChanged を出す */
  setAttachment(owner, soldier, element, cause, from = null) {
    if (element === null && !soldier.attachment) return;
    soldier.attachment = element === null ? null : { element, turns: this.rules.attachTurns, from };
    this.emit('attachmentChanged', {
      playerId: owner.id, soldierId: soldier.soldierId, element, turns: element === null ? 0 : this.rules.attachTurns, cause,
    });
  }

  /**
   * 属性つきの攻撃が兵士 target に当たる直前（外れていないとき）に呼ぶ。
   * 反応が起きるなら reactionTriggered を出し、倍率を掛けたダメージを返す（土の精霊などで軽くする前）。
   * after() は、ダメージ（soldierDamaged・消えたなら soldierDestroyed）のあとに呼ぶ：付着の変化と特殊効果
   * @returns {{amount: number, after: (() => void)|null}}
   */
  prepareHit(attackerId, owner, target, amount, element) {
    if (!this.reactionsOn || !element || amount <= 0) return { amount, after: null };
    const attacker = this.players[attackerId];
    const att = this.attachmentOf(target);
    const canReact = attacker && attackerId === this.currentPlayer && attacker.reactionsThisTurn < this.rules.reactionsPerTurn;
    const id = att && canReact ? findReaction(this.reactionDefs, this.reactionIndex, att.element, element, this.rng) : null;
    if (!id) {
      return { amount, after: () => { if (owner.soldiers.includes(target)) this.setAttachment(owner, target, element, 'hit'); } };
    }
    const def = this.reactionDefs.reactions[id];
    attacker.reactionsThisTurn += 1;
    const multiplier = def.multiplier ?? null;
    const boosted = applyReactionMultiplier(amount, multiplier);
    this.emit('reactionTriggered', {
      attackerId, playerId: owner.id, soldierId: target.soldierId, reaction: id, name: def.name,
      attached: att.element, element, multiplier,
      ...(att.from ? { chain: att.from } : {}),
      ...(att.element === 'chaos' || element === 'chaos' ? { chaos: true } : {}),
    });
    return { amount: boosted, after: () => this.afterReaction(owner, target, def, id, att, boosted) };
  }

  /** 反応のあと：使った付着を変える（凍結・やけどから見た付着なら、その状態を治す）→ 特殊効果 */
  afterReaction(owner, target, def, id, att, damage) {
    const alive = owner.soldiers.includes(target);
    if (alive) {
      if (att.implicit === 'frozen') {
        target.frozen = 0;
        this.emit('statusCleared', { playerId: owner.id, soldierId: target.soldierId, status: 'frozen' });
      } else if (att.implicit === 'burn') {
        target.burn = null;
        this.emit('statusCleared', { playerId: owner.id, soldierId: target.soldierId, status: 'burn' });
      }
      const next = def.attachment ?? null;
      if (next !== null || target.attachment) this.setAttachment(owner, target, next, 'reaction', next === null ? null : id);
    }
    const side = this.side(owner.id);
    const road = this.findRoad(target.roadId);
    // 範囲：同じ道の上の、標的と同じ陣地の兵士（忍者を除く）。adjacent は前後1マス（同じマスも）
    const around = (scope) => {
      if (scope === 'target' || !road) return [];
      const list = [];
      for (const pid of this.alivePlayerIds().filter((x) => this.side(x) === side)) {
        for (const x of this.players[pid].visibleSoldiers) {
          if (x === target || x.roadId !== target.roadId) continue;
          if (scope === 'adjacent' && Math.abs(x.position - target.position) > 1) continue;
          list.push({ owner: this.players[pid], soldier: x });
        }
      }
      return list;
    };
    for (const ef of def.effects ?? []) {
      if (ef.kind === 'splash') {
        const amount = Math.max(1, Math.ceil(damage * ef.ratio));
        for (const n of around(ef.scope)) if (n.owner.soldiers.includes(n.soldier)) this.damageSoldier(n.owner, n.soldier, amount, 'reaction');
        continue;
      }
      const scope = ef.scope ?? 'target';
      const hits = [...(alive ? [{ owner, soldier: target }] : []), ...around(scope)];
      for (const h of hits) if (h.owner.soldiers.includes(h.soldier)) this.applyReactionStatus(h.owner, h.soldier, ef);
    }
  }

  /** 反応の状態をつける（重ねがけは、量・回数を大きい方にそろえる）。statusApplied を出す */
  applyReactionStatus(owner, soldier, ef) {
    const base = { playerId: owner.id, soldierId: soldier.soldierId };
    switch (ef.kind) {
      case 'status':
        if (ef.status === 'frozen') {
          soldier.frozen = Math.max(ef.turns, soldier.frozen);
          this.emit('statusApplied', { ...base, status: 'frozen', turns: soldier.frozen });
        } else {
          this.setBurn(owner, soldier, ef.amount, ef.turns);
        }
        break;
      case 'dot':
        soldier.dot = { amount: Math.max(ef.amount, soldier.dot?.amount ?? 0), turns: Math.max(ef.turns, soldier.dot?.turns ?? 0) };
        this.emit('statusApplied', { ...base, status: 'dot', turns: soldier.dot.turns, amount: soldier.dot.amount });
        break;
      case 'slow':
        soldier.slow = Math.max(ef.turns, soldier.slow);
        soldier.slowAmount = Math.max(ef.amount, soldier.slowAmount);
        this.emit('statusApplied', { ...base, status: 'slow', turns: soldier.slow, amount: soldier.slowAmount });
        break;
      case 'blind':
        soldier.blind = { chance: Math.max(ef.chance, soldier.blind?.chance ?? 0), turns: Math.max(ef.turns, soldier.blind?.turns ?? 0) };
        this.emit('statusApplied', { ...base, status: 'blind', turns: soldier.blind.turns, chance: soldier.blind.chance });
        break;
      default:
        break;
    }
  }

  /** 持ち主のターンの終わり：付着と命中低下の残りが1減り、0で消える */
  tickReactionStatuses(player) {
    if (!this.reactionsOn) return;
    for (const soldier of [...player.soldiers]) {
      if (soldier.blind) {
        soldier.blind.turns -= 1;
        if (soldier.blind.turns <= 0) {
          soldier.blind = null;
          this.emit('statusCleared', { playerId: player.id, soldierId: soldier.soldierId, status: 'blind' });
        }
      }
      if (soldier.attachment) {
        soldier.attachment.turns -= 1;
        if (soldier.attachment.turns <= 0) this.setAttachment(player, soldier, null, 'expired');
      }
    }
  }

  removeSoldier(owner, soldier, reason) {
    owner.removeSoldier(soldier.soldierId);
    this.emit('soldierDestroyed', { playerId: owner.id, soldierId: soldier.soldierId, reason });
  }

  /**
   * owner の兵士 soldier の「同じマスか1つ先のマス」にいて、戦う相手の兵士のうち、先に出された1体。
   * いなければ null。見つかったら { owner, soldier }（相手の兵士とその持ち主）。
   *   となりの道（ring）：道の向こうの人の兵士で、同じ道の上にいるもの
   *   広場（plaza）：自分の方に向かってくる兵士（相手が自分の城を狙っている）か、自分が狙っている人の兵士。
   *                  それ以外の人の兵士は関係ないので、同じマスにいても戦わずにすれちがう
   */
  findClashTarget(soldier, owner) {
    const here = soldier.position;
    let best = null;
    for (const c of this.foesOf(soldier, owner)) {
      if (c.q !== here && c.q !== here + 1) continue;
      if (!best || soldierNumber(c.soldier) < soldierNumber(best.soldier)) best = { owner: c.owner, soldier: c.soldier };
    }
    return best;
  }

  /**
   * owner の兵士 soldier が戦う（撃つ）相手の兵士すべてと、その場所（soldier から数えた位置 q）。
   *   となりの道：道の向こうの陣地（チーム戦ならそのチームのメンバー全員）の兵士で、同じ道の上にいるもの
   *   広場：自分の陣地に向かってくる兵士と、自分が狙っている陣地の兵士（味方とは戦わない）
   * @returns {{owner: Player, soldier: Soldier, q: number}[]}
   */
  foesOf(soldier, owner) {
    const { laneLength } = this.rules;
    const mine = this.side(owner.id);
    const found = [];
    // 忍者は相手の兵士と戦わずにすり抜ける。相手の兵士も、見えない忍者とは戦わない（撃たない）
    if (soldier.stealth) return found;
    for (const id of this.alivePlayerIds()) {
      const theirs = this.side(id);
      if (theirs === mine) continue;
      const other = this.players[id];
      for (const e of other.soldiers) {
        if (e.stealth) continue;
        let q;
        if (!this.plaza) {
          // 護衛（ゴーレム）は、自分の道と左右のとなりの道（同じ2人の間で lane が1つ違う道）の城の前を守る
          if (theirs !== soldier.targetId || (e.roadId !== soldier.roadId && !this.guardCovers(e, soldier.roadId))) continue;
          q = laneLength - 1 - e.position; // 相手の兵士の位置を、soldier から数えた位置に直す
        } else {
          if (e.targetId !== mine && soldier.targetId !== theirs) continue;
          q = this.coordOnPath(mine, soldier.targetId, this.placeOf(id, e));
          if (q === null) continue;
        }
        found.push({ owner: other, soldier: e, q });
      }
    }
    return found;
  }

  /**
   * 弓兵・魔法使い：動かずに撃つ。自分のマスから range マス先までの
   *   1. 相手の兵士（いちばん近い1体。同じ近さなら先に出された方）→ 2. 魔物 → 3.（魔法使いだけ）狙った相手の城
   * の順に1つを撃つ。反撃は受けない。撃つ相手がいなければ待つ。どちらでも turnsLeft が1減り、0で帰る（soldierDestroyed の reason は "returned"）。
   * 城が落ちて決着したら true
   */
  shoot(player, soldier) {
    const here = soldier.position;
    // 砂漠のステージ：射程が短くなる（最低1）
    const range = Math.max(1, soldier.range - (this.stageDef()?.rangePenalty ?? 0));
    const inRange = (q) => q !== null && q >= here && q <= here + range;
    const foes = this.foesOf(soldier, player).filter((c) => inRange(c.q));
    foes.sort((a, b) => a.q - b.q || soldierNumber(a.soldier) - soldierNumber(b.soldier));
    const shot = { playerId: player.id, soldierId: soldier.soldierId, role: soldier.role };
    let over = false;
    if (foes.length > 0) {
      const { owner, soldier: victim } = foes[0];
      const miss = this.rollMiss(soldier);
      const amount = miss ? 0 : this.fightDamage(soldier, victim);
      this.emit('soldierShot', { ...shot, target: { kind: 'soldier', playerId: owner.id, soldierId: victim.soldierId }, amount });
      if (miss) this.emitMiss(player.id, 'shot', { soldierId: soldier.soldierId });
      else this.damageSoldier(owner, victim, amount, 'shot', { attackerId: player.id, element: soldier.element });
    } else {
      const road = this.findRoad(soldier.roadId);
      const monster = this.monsters.find((m) =>
        inRange(m.roadId === PLAZA ? m.square : m.roadId === soldier.roadId ? road.toPosition(this.side(player.id), m.square) : null));
      if (monster) {
        const miss = this.rollMiss(soldier);
        const amount = miss ? 0 : this.fightDamage(soldier, monster);
        this.emit('soldierShot', { ...shot, target: { kind: 'monster', monsterId: monster.monsterId }, amount });
        if (miss) {
          this.emitMiss(player.id, 'shot', { soldierId: soldier.soldierId });
        } else {
          this.damageMonster(monster, amount, { playerId: player.id, soldierId: soldier.soldierId });
          this.defeatMonsterIfDead(monster, player.id);
        }
      } else if (soldier.role === 'mage') {
        const enemy = this.players[soldier.targetId];
        const miss = this.rollMiss(soldier);
        // 城を撃つときも、天候の属性ボーナスは効く（兵士・魔物を撃つときと同じ）
        const amount = this.stageBoost(soldier, this.attackOf(soldier) + this.weatherElementBonus(soldier.element));
        this.emit('soldierShot', { ...shot, target: { kind: 'castle', playerId: enemy.id }, amount: miss ? 0 : amount });
        if (miss) {
          this.emitMiss(player.id, 'shot', { soldierId: soldier.soldierId });
        } else {
          this.damageCastle(enemy, amount, { kind: 'soldier', soldierId: soldier.soldierId });
          over = this.checkGameOver();
        }
      }
      // 撃つ相手がいないときは、撃たずに待つ（ターンは過ぎる）
    }
    if (over) return true;
    this.tickRanged(player, soldier);
    return false;
  }

  // ================= サイコロ =================

  /** サイコロの種類 kind を今使える対象（per は目に掛ける数。城壁が上限かどうかを見るのに使う） */
  diceTargets(player, kind, per, randomCost = null) {
    const self = [{ playerId: player.id }];
    switch (kind) {
      case 'attack': {
        const foes = this.rules.castleSpellRange === 'neighbors' ? this.neighborsOf(player.id) : this.enemySides(player.id);
        return { targets: foes.map((p) => ({ playerId: p.id })), reason: '相手がいません' };
      }
      case 'heal':
        return { targets: player.castle.isFull ? [] : self, reason: '城のHPが満タンです' };
      case 'mana':
        return { targets: this.rules.maxMp > 0 && player.mp < this.rules.maxMp ? self : [], reason: this.rules.maxMp > 0 ? 'MPが満タンです' : 'このルールではMPを使いません' };
      case 'coin':
        return { targets: self, reason: '' };
      case 'shield':
        return {
          targets: this.armorFull(player, { amount: Math.ceil(6 * per) }) ? [] : self,
          reason: this.rules.armorMax ? `城壁がもう上限（${this.rules.armorMax}）まで積んであります` : '同じか、より強い城壁がもう置いてあります',
        };
      case 'buff':
        return { targets: player.soldiers.map((x) => ({ soldierId: x.soldierId })), reason: '道の上に自分の兵士がいません' };
      case 'god': {
        // ゴッドサイコロ：攻撃の相手を選ぶ（ほかの効果は自分）。相手がいれば出せる
        return this.diceTargets(player, 'attack', 0);
      }
      case 'random': {
        const usable = this.randomDiceKinds(player);
        if (usable.length === 0) return { targets: [], reason: '今使えるサイコロがありません' };
        return { targets: this.payableCosts(player, randomCost).length > 0 ? self : [], reason: '払えるコストがありません' };
      }
      default:
        return { targets: [], reason: 'このカードは出せません' };
    }
  }

  /** ランダムサイコロが選べる種類：cards.json にあるサイコロ（random 以外）のうち、今使えるもの。{ kind, per } の配列 */
  randomDiceKinds(player) {
    const out = [];
    for (const kind of BASIC_DICE) {
      const def = Object.values(this.cardDefs).find((d) => d.effect === 'dice' && d.dice === kind);
      if (def && this.diceTargets(player, kind, def.per).targets.length > 0) out.push({ kind, per: def.per });
    }
    return out;
  }

  /**
   * ランダムサイコロのコスト（randomCost）のうち、今払えるもの。{ kind: "hp" | "coins" | "mp", amount } の配列。
   * 城HPは払っても城が落ちないとき（HP が amount より多い）だけ。コストがなければ [{ kind: null }]（タダ）
   */
  payableCosts(player, randomCost) {
    if (!randomCost) return [{ kind: null, amount: 0 }];
    const out = [];
    if (randomCost.hp && player.castle.hp > randomCost.hp) out.push({ kind: 'hp', amount: randomCost.hp });
    if (randomCost.coins && player.coins >= randomCost.coins) out.push({ kind: 'coins', amount: randomCost.coins });
    if (randomCost.mp && this.rules.maxMp > 0 && player.mp >= randomCost.mp) out.push({ kind: 'mp', amount: randomCost.mp });
    return out;
  }

  /** 1〜6 の目 */
  rollDie() {
    return 1 + Math.floor(this.rng() * 6);
  }

  /**
   * サイコロを振る。diceRolled（{ playerId, type, dice, value, amount, rolls }）を出してから効果を起こす。
   * ランダムサイコロは、1回目の目で種類を選び（使えない種類は除く）、2回目の目は4〜6になる。対象はランダム
   */
  rollDice(player, card, target) {
    if (card.def.dice === 'god') {
      this.rollGodDice(player, card, target);
      return;
    }
    let kind = card.def.dice;
    let per = card.def.per;
    let value;
    let rolls;
    let cost = null;
    if (kind === 'random') {
      // 先にコストを払う（払えるものから1つランダム）。城HPは城壁を通さない
      const options = this.payableCosts(player, card.def.randomCost);
      cost = options[options.length === 1 ? 0 : Math.floor(this.rng() * options.length)];
      if (cost.kind === 'hp') {
        player.castle.takeDamage(cost.amount);
        this.emit('castleDamaged', { playerId: player.id, amount: cost.amount, blocked: 0, hp: player.castle.hp, source: { kind: 'sacrifice', type: card.type } });
      } else if (cost.kind === 'coins') {
        this.changeCoins(player, -cost.amount, 'cost');
      } else if (cost.kind === 'mp') {
        this.changeMp(player, -cost.amount, 'cast');
      } else {
        cost = null;
      }
      const usable = this.randomDiceKinds(player);
      const first = this.rollDie();
      ({ kind, per } = usable[(first - 1) % usable.length]);
      value = 4 + Math.floor(this.rng() * 3);
      rolls = [first, value];
      const targets = this.diceTargets(player, kind, per).targets;
      target = targets[targets.length === 1 ? 0 : Math.floor(this.rng() * targets.length)];
    } else {
      value = this.rollDie();
      rolls = [value];
    }
    const amount = Math.ceil(value * per);
    this.emit('diceRolled', { playerId: player.id, type: card.type, dice: kind, value, amount, rolls, ...(cost ? { cost } : {}) });
    this.applyDice(player, card, kind, amount, target);
  }

  /**
   * ゴッドサイコロ：1回振って、その目で6つのサイコロの効果を全部起こす（倍率はそれぞれのサイコロのカードの per）。
   * diceRolled は1回（dice: "god"、amount は種類ごとの量 { attack, heal, ... }）。今使えない効果は飛ばす。
   * 攻撃は相手が防御を選ぶと止まるので、いちばん最後。バフは自分の兵士全員
   */
  rollGodDice(player, card, target) {
    const value = this.rollDie();
    const pers = Object.fromEntries(BASIC_DICE.map((k) => [k, Object.values(this.cardDefs).find((d) => d.effect === 'dice' && d.dice === k)?.per ?? 0]));
    const amounts = Object.fromEntries(BASIC_DICE.map((k) => [k, Math.ceil(value * pers[k])]));
    this.emit('diceRolled', { playerId: player.id, type: card.type, dice: 'god', value, amount: amounts, rolls: [value] });
    for (const kind of ['heal', 'mana', 'coin', 'shield']) {
      if (amounts[kind] > 0 && this.diceTargets(player, kind, pers[kind]).targets.length > 0) this.applyDice(player, card, kind, amounts[kind], { playerId: player.id });
    }
    if (amounts.buff > 0) {
      for (const s of player.soldiers) this.applyDice(player, card, 'buff', amounts.buff, { soldierId: s.soldierId });
    }
    if (amounts.attack > 0) this.applyDice(player, card, 'attack', amounts.attack, target);
  }

  /** サイコロ1つぶんの効果を起こす（kind の種類、量 amount） */
  applyDice(player, card, kind, amount, target) {
    switch (kind) {
      case 'attack': {
        const enemy = this.players[target.playerId];
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        if (this.rollMiss()) {
          this.emitMiss(player.id, 'spell', { type: card.type });
          break;
        }
        this.requestDefense(
          { kind: 'castle', defenderId: enemy.id, attackerId: player.id, amount, from: 'spell', spellType: card.type },
          () => this.damageCastle(enemy, amount, { kind: 'spell', type: card.type }),
          () => this.checkGameOver(),
        );
        break;
      }
      case 'heal': {
        const healed = player.castle.heal(amount);
        this.emit('castleHealed', { playerId: player.id, amount: healed, hp: player.castle.hp });
        break;
      }
      case 'mana':
        this.changeMp(player, amount, 'card');
        break;
      case 'coin':
        this.changeCoins(player, amount, 'card');
        break;
      case 'shield':
        this.playSupport(player, { def: { kind: 'defense', effect: 'armorCastle', amount } }, { playerId: player.id });
        break;
      case 'buff': {
        const soldier = player.soldiers.find((x) => x.soldierId === target.soldierId);
        soldier.baseAttack += amount;
        this.emit('soldierBuffed', { playerId: player.id, soldierId: soldier.soldierId, attack: soldier.attack });
        break;
      }
      default:
        break;
    }
  }

  /** 護衛の兵士 guard が、道 roadId の城の前も守っているか（同じ2人の間の道で、lane が1つ違う） */
  guardCovers(guard, roadId) {
    if (!guard.isGuard) return false;
    const a = this.findRoad(guard.roadId);
    const b = this.findRoad(roadId);
    if (!a || !b || a.players.join() !== b.players.join()) return false;
    return Math.abs((a.lane ?? 0) - (b.lane ?? 0)) <= 1;
  }

  /** 弓兵・魔法使い・護衛の残りターンを1減らし、0なら帰る */
  tickRanged(player, soldier) {
    if (!player.soldiers.includes(soldier)) return;
    soldier.turnsLeft -= 1;
    if (soldier.turnsLeft <= 0) this.removeSoldier(player, soldier, 'returned');
  }

  /**
   * 広場のとき、ownerId の兵士がいる場所。{ at: "spoke", playerId, square }（playerId の城から広場への道。
   * square は その城から数えたマス）か { at: "plaza" }。城に着いていれば null
   */
  placeOf(ownerId, soldier) {
    const { laneLength } = this.rules;
    const mid = this.middleSquare();
    const p = soldier.position;
    if (p >= laneLength) return null;
    if (p < mid) return { at: 'spoke', playerId: this.side(ownerId), square: p };
    if (p === mid) return { at: 'plaza' };
    return { at: 'spoke', playerId: soldier.targetId, square: laneLength - 1 - p };
  }

  /** 場所 place を、from の城から to の城への通り道の上の位置（from から数えたマス）に直す。通り道の上になければ null */
  coordOnPath(from, to, place) {
    if (!place) return null;
    if (place.at === 'plaza') return this.middleSquare();
    if (place.playerId === from) return place.square;
    if (place.playerId === to) return this.rules.laneLength - 1 - place.square;
    return null;
  }

  // ================= 魔物 =================

  /** 道の真ん中のマス番号 */
  middleSquare() {
    return Math.floor(this.rules.laneLength / 2);
  }

  /** owner の兵士 soldier の「同じマスか1つ先のマス」にいる魔物（同じ道の上だけ） */
  findMonsterInRange(soldier, owner) {
    const road = this.findRoad(soldier.roadId);
    return (
      this.monsters.find((m) => {
        // 広場の魔物は、どの通り道からも真ん中のマスにいる
        if (m.roadId === PLAZA) return soldier.position === m.square || soldier.position + 1 === m.square;
        if (m.roadId !== road.roadId) return false;
        const q = road.toPosition(this.side(owner.id), m.square);
        return q === soldier.position || q === soldier.position + 1;
      }) || null
    );
  }

  findMonster(monsterId) {
    return this.monsters.find((m) => m.monsterId === monsterId) || null;
  }

  /** 周回の始め：attackIn が0になった魔物が、道の両はしのどちらかの城を攻める（城を落としてもよい。落ちたらそこで止める） */
  monstersAttackCastles() {
    for (const m of [...this.monsters]) {
      m.attackIn -= 1;
      if (m.attackIn > 0) continue;
      m.attackIn = m.def.attackEvery;
      // 攻める城：道の両はしのどちらか1つ。広場の魔物は、人数の半分（切り上げ）の城をランダムに選ぶ（2人のときの「2人に1人」と同じ割合）
      let victims;
      if (m.roadId === PLAZA) {
        const pool = this.aliveSides();
        victims = [];
        for (let k = Math.ceil(pool.length / 2); k > 0 && pool.length > 0; k--) victims.push(pool.splice(Math.floor(this.rng() * pool.length), 1)[0]);
        victims.sort((a, b) => this.playerOrder.indexOf(a) - this.playerOrder.indexOf(b));
      } else {
        const road = this.findRoad(m.roadId);
        victims = [road.players[Math.floor(this.rng() * 2)]];
      }
      // 放置するほど攻撃が重くなる（同じ回に攻める城には、同じダメージ）
      const damage = m.nextCastleAttack + (this.night ? this.rules.nightMonsterAttack : 0);
      m.attackCount += 1;
      for (const id of victims) {
        const victim = this.players[id];
        const before = victim.castle.hp;
        victim.castle.takeDamage(damage);
        this.emit('monsterAttackedCastle', {
          monsterId: m.monsterId, playerId: victim.id, amount: before - victim.castle.hp, hp: victim.castle.hp,
        });
        if (victim.castle.isDestroyed) return;
      }
    }
  }

  /** 周回の始め：魔物がいない道ごとに、monsterSpawnChance の確率で1体出る */
  /** 放置された魔物は、monsterEvolveEvery 周ごとにレアリティが1つ上がり、強くなる（レジェンドの上はないので、ごほうびはそのまま） */
  evolveMonsters() {
    const every = this.rules.monsterEvolveEvery;
    if (every <= 0) return;
    for (const m of this.monsters) {
      m.age += 1;
      if (m.age % every !== 0) continue;
      const next = m.rewardRarity && this.rarityDefs ? nextRarityWithCards(this.cardDefs, this.rarityDefs, m.rewardRarity) : null;
      m.evolve(this.rules.monsterEvolveMultiplier, next);
      this.emit('monsterEvolved', {
        monsterId: m.monsterId, rewardRarity: m.rewardRarity, hp: m.hp, maxHp: m.maxHp, attack: m.attack, castleAttack: m.nextCastleAttack, count: m.evolveCount,
      });
    }
  }

  /** 魔物の種類ごとの、今の出やすさ。後半（monsterFirstRound を過ぎた周回の数）ほど、ごほうびのレアリティが高い魔物が出やすくなる */
  monsterWeight(type) {
    const def = this.monsterDefs[type];
    const order = this.rarityDefs ? chainOrder(this.rarityDefs) : [];
    const rank = Math.max(0, order.indexOf(def.rewardRarity));
    const late = Math.max(0, this.round - this.rules.monsterFirstRound);
    return def.weight * (1 + this.rules.monsterLateBias * rank * late);
  }

  spawnMonsters() {
    this.evolveMonsters();
    if (!this.monsterDefs || this.round < this.rules.monsterFirstRound || this.rules.monsterSpawnChance === 0) return;
    const types = Object.keys(this.monsterDefs);
    if (types.length === 0) return;
    // 魔物は、同じ2人の間の道すべてで1体まで（道が何本あっても、出るのは1本だけ）。広場なら広場に1体だけ
    const pairIds = this.plaza ? [PLAZA] : [...new Set(this.roads.map((r) => r.pairId))];
    for (const pairId of pairIds) {
      const lanes = this.plaza ? [] : this.roads.filter((r) => r.pairId === pairId);
      if (this.plaza ? this.monsters.length > 0 : this.monsters.some((m) => lanes.some((r) => r.roadId === m.roadId))) continue;
      // 魔物を倒したところには、しばらく出ない（魔物が道をふさぎ続けないように）
      if ((this.monsterCooldown.get(pairId) ?? 0) > this.round) continue;
      if (this.rng() >= this.rules.monsterSpawnChance) continue;
      const total = types.reduce((a, t) => a + this.monsterWeight(t), 0);
      let r = this.rng() * total;
      const type = types.find((t) => (r -= this.monsterWeight(t)) < 0) ?? types.at(-1);
      const monsterId = `m${String(this.nextMonsterNumber++).padStart(2, '0')}`;
      // 出る道はランダム（道が1本のときは乱数を使わない）
      const roadId = this.plaza ? PLAZA : (lanes.length === 1 ? lanes[0] : lanes[Math.floor(this.rng() * lanes.length)]).roadId;
      const m = new Monster(monsterId, type, this.monsterDefs[type], roadId, this.middleSquare());
      m.growth = this.rules.monsterAttackGrowth;
      // 広場の魔物の HP は人数に比例（2人のときの HP が基準。出た時点の残りの人数で決める）
      if (this.plaza) m.maxHp = m.hp = Math.max(1, Math.round((m.hp * this.alivePlayerIds().length) / 2));
      this.monsters.push(m);
      this.emit('monsterAppeared', {
        monsterId, type, roadId, square: m.square, hp: m.hp, attack: m.attack, element: m.element,
      });
    }
  }

  /** 魔物にダメージ。0になったら、by.playerId がとどめボーナスをもらう */
  damageMonster(monster, amount, by) {
    monster.takeDamage(amount);
    this.emit('monsterDamaged', { monsterId: monster.monsterId, amount, hp: monster.hp, by });
  }

  defeatMonsterIfDead(monster, playerId) {
    if (!monster.isDead) return;
    this.monsters = this.monsters.filter((m) => m !== monster);
    const slot = monster.roadId === PLAZA ? PLAZA : this.findRoad(monster.roadId).pairId;
    this.monsterCooldown.set(slot, this.round + this.rules.monsterCooldownRounds + 1);
    const { reward } = monster.def;
    const baseRarity = monster.rewardRarity ?? monster.def.rewardRarity ?? null;
    // ラッキー：rewardLuckyChance の確率で、1つ上のレアリティが出る（確率が0のときは乱数を使わない）
    let rewardRarity = baseRarity;
    let lucky = false;
    if (baseRarity && this.rarityDefs && this.rules.rewardLuckyChance > 0) {
      // 魔物のごほうびは、陣営モードでも候補で絞らない（仕様 5.1-4 の「魔物報酬は例外」。旧カード・ほかの陣営のカードも出うる）
      const next = nextRarityWithCards(this.cardDefs, this.rarityDefs, baseRarity);
      if (next && this.rng() < this.rules.rewardLuckyChance) {
        rewardRarity = next;
        lucky = true;
      }
    }
    // 倒した魔物は駒（兵士カード）になって、とどめを刺した人の手札に入る（cards.json に monster: 種類 のカードがあるとき）
    const pieceType = (monster.type && Object.keys(this.cardDefs).find((t) => this.cardDefs[t].monster === monster.type)) || null;
    this.emit('monsterDefeated', { monsterId: monster.monsterId, playerId, reward: reward ?? 0, rewardRarity, baseRarity, lucky, pieceType });
    if (pieceType) {
      const piece = this.createCard(pieceType);
      this.players[playerId].hand.push(piece);
      this.emit('cardDrawn', { playerId, cardIds: [piece.cardId] });
    }
    if (reward) this.changeCoins(this.players[playerId], reward, 'reward');
    // ごほうびのカード：そのレアリティのカードが1枚、手札に入る（カードがなければ何も起きない）
    if (rewardRarity) {
      const type = sampleTypeOfRarity(this.cardDefs, rewardRarity, this.rng); // 陣営モードでも絞らない（上の「例外」）
      if (type) {
        const card = this.createCard(type);
        this.players[playerId].hand.push(card);
        this.emit('cardDrawn', { playerId, cardIds: [card.cardId] });
      }
    }
  }

  /**
   * 使った・捨てたカードを置き場へ。ふつうは捨て札（山札に戻る）。
   * 使い切りのカードを使ったときと、倒した魔物の駒（使っても捨てても）は、使い切り置き場へ行き、山札に戻らない
   * （駒は「山札では出ない」ので、シャッフルで山札に混ざらないように）
   * @param {{used?: boolean}} [opts] used：出して使ったか（false なら手札の上限・引き直しなどで捨てた）
   */
  throwAway(playerId, card, { used = true } = {}) {
    const pile = this.pileOf(playerId);
    if (card.def.monster !== undefined || (used && card.isExhaust)) pile.exhausted.push(card);
    else pile.discard.push(card);
  }

  /** そのカードを出すのに必要な MP。MP を使わない設定（maxMp が 0）や、MP を使わないカードは 0 */
  mpCostOf(card) {
    if (this.rules.maxMp <= 0) return 0;
    const def = card.def;
    if (def.monster !== undefined) return 0; // 魔物のカード（倒したごほうび）は MP を使わない
    const attackDice = def.effect === 'dice' && def.dice === 'attack'; // 攻撃サイコロは攻撃の魔法と同じく MP を使う
    if (def.kind !== 'spell' || (!MP_EFFECTS.includes(def.effect) && !attackDice)) return 0;
    return def.mpCost ?? this.rarityDefs?.[def.rarity]?.mpCost ?? 0;
  }

  changeMp(player, delta, reason) {
    const before = player.mp;
    player.mp = Math.max(0, Math.min(this.rules.maxMp, player.mp + delta));
    if (player.mp !== before) this.emit('mpChanged', { playerId: player.id, delta: player.mp - before, mp: player.mp, reason });
    return player.mp - before;
  }

  changeCoins(player, delta, reason) {
    player.coins += delta;
    this.emit('coinsChanged', { playerId: player.id, delta, coins: player.coins, reason });
  }

  /** 進軍中の兵士が魔物と戦う（お互いに同時に与える。属性も効く） */
  fightMonster(player, soldier, monster) {
    const road = this.findRoad(soldier.roadId);
    this.emit('monsterClashed', {
      attacker: { playerId: player.id, soldierId: soldier.soldierId },
      monsterId: monster.monsterId,
      roadId: road.roadId,
      square: road.toSquare(this.side(player.id), soldier.position),
    });
    const missM = this.rollMiss(soldier);
    const missS = this.rollMiss();
    if (missM) this.emitMiss(player.id, 'fight', { soldierId: soldier.soldierId });
    // 魔物の攻撃が外れたとき：外した側は魔物なので playerId は null
    if (missS) this.emitMiss(null, 'fight', { monsterId: monster.monsterId });
    const toMonster = missM ? 0 : this.fightDamage(soldier, monster);
    const toSoldier = missS ? 0 : this.reduceDamage(player, this.fightDamage(monster, soldier));
    this.damageMonster(monster, toMonster, { playerId: player.id, soldierId: soldier.soldierId });
    const blocked = soldier.takeDamage(toSoldier);
    this.emit('soldierDamaged', {
      playerId: player.id, soldierId: soldier.soldierId, amount: toSoldier, hp: soldier.hp, cause: 'fight', blocked,
    });
    this.defeatMonsterIfDead(monster, player.id);
    if (soldier.isDead) this.removeSoldier(player, soldier, 'killed');
  }

  // ================= コインと強化 =================

  /** その人が次にその強化を買うときの値段。costs があれば、買った回数で上がる（足りなければ最後の値段） */
  upgradeCostOf(player, upgradeId) {
    const def = this.upgradeDefs[upgradeId];
    if (!def.costs) return def.cost;
    const bought = player.upgradesBought[upgradeId] ?? 0;
    return def.costs[Math.min(bought, def.costs.length - 1)];
  }

  /** 強化を買えるか（読むだけ） */
  canBuyUpgrade(upgradeId) {
    if (this.phase === 'ready') return fail('ゲームがまだ始まっていません');
    if (this.phase === 'gameOver') return fail('ゲームは終わっています');
    if (this.phase !== 'main') return fail('今は買えません');
    // Object のプロトタイプのキー（"constructor" など）を強化と取り違えないように
    if (typeof upgradeId !== 'string' || !Object.hasOwn(this.upgradeDefs, upgradeId)) return fail('その強化はありません');
    const def = this.upgradeDefs[upgradeId];
    const player = this.players[this.currentPlayer];
    const bought = player.upgradesBought[upgradeId] ?? 0;
    if (def.limit !== undefined && bought >= def.limit) return fail(`この強化は1試合に${def.limit}回までです`);
    const cost = this.upgradeCostOf(player, upgradeId);
    if (player.coins < cost) return fail(`コインが足りません（あと${cost - player.coins}枚）`);
    if (def.effect === 'repairCastle' && player.castle.isFull) return fail('城のHPが満タンです');
    const pile = this.pileOf(player.id);
    if (def.effect === 'drawCards' && pile.deck.length + pile.discard.length === 0) return fail('山札も捨て札もありません');
    if (def.effect === 'gainCard') {
      if (!this.rarityDefs) return fail('レアリティを使っていないので買えません');
      const pool = this.poolOf(player.id); // 陣営モードなら、その陣営の候補の中にそのレアリティがあるか
      if (!Object.entries(this.cardDefs).some(([t, d]) => (!pool || pool.has(t)) && d.rarity === def.rarity && (d.weight ?? 1) > 0 && isDrawable(d, Boolean(pool)))) return fail('その強化はありません');
    }
    if (def.effect === 'permanentLuck') {
      if (!this.rarityDefs) return fail('レアリティを使っていないので買えません');
      if (!Object.hasOwn(this.rarityDefs, def.fromRarity)) return fail('その強化はありません');
    }
    if (def.effect === 'boostDrops') {
      if (!this.rarityDefs) return fail('レアリティを使っていないので買えません');
      if (!Object.hasOwn(this.rarityDefs, def.fromRarity)) return fail('その強化はありません');
      if (player.luck) return fail('運命の祈りがもう効いています');
    }
    if (def.effect === 'sharpenSoldiers' && player.soldiers.length === 0) return fail('道の上に自分の兵士がいません');
    return ok();
  }

  /** 強化を買う（自分のメインの場面で、何回でも） */
  buyUpgrade(upgradeId) {
    const check = this.canBuyUpgrade(upgradeId);
    if (!check.ok) return check;
    const def = this.upgradeDefs[upgradeId];
    const player = this.players[this.currentPlayer];
    const cost = this.upgradeCostOf(player, upgradeId);
    player.upgradesBought[upgradeId] = (player.upgradesBought[upgradeId] ?? 0) + 1;
    this.changeCoins(player, -cost, 'upgrade');
    this.emit('upgradeBought', { playerId: player.id, upgradeId, cost });
    if (def.effect === 'repairCastle') {
      const healed = player.castle.heal(def.amount);
      this.emit('castleHealed', { playerId: player.id, amount: healed, hp: player.castle.hp });
    } else if (def.effect === 'drawCards') {
      this.drawCards(player, def.amount);
    } else if (def.effect === 'trainArmy') {
      player.armyAttack += def.amount;
      for (const s of player.soldiers) {
        s.baseAttack += def.amount;
        this.emit('soldierBuffed', { playerId: player.id, soldierId: s.soldierId, attack: s.attack });
      }
    } else if (def.effect === 'fortifyArmy') {
      player.armyHp += def.amount;
      for (const s of player.soldiers) {
        s.hp += def.amount;
        s.maxHp += def.amount;
        this.emit('soldierBuffed', { playerId: player.id, soldierId: s.soldierId, attack: s.attack, hp: s.hp });
      }
    } else if (def.effect === 'gainCard') {
      const cardIds = [];
      for (let i = 0; i < def.amount; i++) {
        const card = this.createCard(sampleTypeOfRarity(this.cardDefs, def.rarity, this.rng, this.poolOf(player.id)));
        player.hand.push(card);
        cardIds.push(card.cardId);
      }
      this.emit('cardDrawn', { playerId: player.id, cardIds });
    } else if (def.effect === 'permanentLuck') {
      // 買うたびに、引き当てる確率が amount%（最大100%）ずつ増える。倍率とレアリティは最後に買ったものになる
      const chance = Math.min(1, (player.permLuck?.chance ?? 0) + def.amount / 100);
      player.permLuck = { chance, boost: def.boost, from: def.fromRarity };
    } else if (def.effect === 'boostDrops') {
      player.luck = { draws: def.amount, boost: def.boost, from: def.fromRarity };
    } else if (def.effect === 'sharpenSoldiers') {
      for (const s of player.soldiers) {
        s.baseAttack += def.amount;
        this.emit('soldierBuffed', { playerId: player.id, soldierId: s.soldierId, attack: s.attack });
      }
    }
    return ok();
  }

  // ================= 合成 =================

  /**
   * 排出率の一覧（読むだけ。UI が「排出率を見る」画面に使う）
   * @returns {{rarities: object[], cards: object, monsters: object}|null} rarities を渡していなければ null
   */
  getDropRates(viewerId = null) {
    if (!this.rarityDefs) return null;
    // 陣営モードなら、その陣営の候補の中での排出率（候補の外のカードは cards に入らない）
    const pool = this.poolOf(viewerId);
    const rates = dropRates(this.cardDefs, this.rarityDefs, null, pool);
    const rarities = Object.entries(this.rarityDefs).map(([id, r]) => ({ id, name: r.name, dropRate: r.dropRate }));
    const cards = {};
    for (const [type, def] of Object.entries(this.cardDefs)) {
      if (pool && !pool.has(type)) continue;
      cards[type] = { name: def.name, rarity: def.rarity, rate: rates[type] };
    }
    const monsters = {};
    // 魔物のごほうびは陣営で絞らない（defeatMonsterIfDead と同じ）
    for (const [type, def] of Object.entries(this.monsterDefs || {})) {
      if (def.rewardRarity) monsters[type] = { name: def.name, odds: rewardOdds(this.cardDefs, this.rarityDefs, def.rewardRarity, this.rules.rewardLuckyChance) };
    }
    return { rarities, cards, monsters };
  }

  /** 手札の同じカード2枚を合成できるか（読むだけ） */
  canFuse(cardIdA, cardIdB) {
    if (this.phase === 'ready') return fail('ゲームがまだ始まっていません');
    if (this.phase === 'gameOver') return fail('ゲームは終わっています');
    if (this.phase !== 'main') return fail('今は合成できません');
    const player = this.players[this.currentPlayer];
    if (typeof cardIdA !== 'string' || typeof cardIdB !== 'string' || cardIdA === cardIdB) return fail('別々のカードを2枚選んでください');
    const a = player.hand.find((c) => c.cardId === cardIdA);
    const b = player.hand.find((c) => c.cardId === cardIdB);
    if (!a || !b) return fail('そのカードは手札にありません');
    const wildA = a.def.effect === 'wild';
    const wildB = b.def.effect === 'wild';
    if (wildA && wildB) return fail('適応どうしは合成できません');
    // 適応は、どのカードとでも合成できる（相手のカードを2枚合成したのと同じ結果）
    const base = wildA ? b : a;
    if (!wildA && !wildB && a.type !== b.type) return fail('同じ種類のカードどうしでないと合成できません');
    // 効果がまだないカード（implemented: false）は、合成の元にも、合成先にもしない
    if (base.def.implemented === false || (base.def.fuseTo && this.cardDefs[base.def.fuseTo]?.implemented === false)) {
      return fail('このカードの効果はまだありません');
    }
    if (!base.def.fuseTo) {
      if (base.def.monster) return fail('魔物のカードは合成できません');
      // いちばん上のレアリティ（スペシャルを除く）だけ「これ以上」。ほかは合成しないカード（fuseTo: null・スペシャル）
      const order = Object.keys(this.rarityDefs ?? {}).filter((id) => !this.rarityDefs[id].special);
      return fail(base.def.rarity === order.at(-1) ? 'レジェンドはこれ以上合成できません' : 'このカードは合成できません');
    }
    return { ok: true, player, a, b, base };
  }

  /** 手札の同じカード2枚を、1つ上のレアリティのカード1枚にする（メインの1枚には数えない。何回でもできる） */
  fuse(cardIdA, cardIdB) {
    const check = this.canFuse(cardIdA, cardIdB);
    if (!check.ok) return check;
    const { player, a, b, base } = check;
    player.hand = player.hand.filter((c) => c !== a && c !== b);
    const card = this.createCard(base.def.fuseTo);
    player.hand.push(card);
    this.emit('cardsFused', { playerId: player.id, cardIds: [a.cardId, b.cardId], cardId: card.cardId, from: base.type, to: card.type });
    return ok();
  }

  /**
   * a が b に与えるダメージ。順番：基本の攻撃力 → ×属性倍率（切り上げ・最低1）→ ＋天候の属性ボーナス → ステージ倍率
   */
  fightDamage(a, b) {
    const attack = a instanceof Soldier ? this.attackOf(a) : a.attack;
    const scaled = applyElementMultiplier(attack, elementMultiplier(this.elementTable, a.element, b.element));
    return this.stageBoost(a, scaled + this.weatherElementBonus(a.element));
  }

  /** 兵士の今の攻撃力（夜は、獣＝魔物の駒と、暗殺者・忍者が強くなる） */
  attackOf(soldier) {
    let bonus = 0;
    // 背水の陣：自分の城が背水の陣なら、兵士全員の攻撃が上がる
    if (this.overdrive.size > 0) {
      const ownerId = this.playerOrder.find((id) => this.players[id].soldiers.includes(soldier));
      if (ownerId && this.overdrive.has(this.side(ownerId))) bonus += this.rules.overdriveAttack;
    }
    if (this.night) {
      const def = this.cardDefs[soldier.type] ?? {};
      if (def.monster !== undefined || def.beast) bonus += this.rules.nightBeastAttack;
      if (soldier.stealth) bonus += this.rules.nightStealthAttack;
    }
    return soldier.attack + bonus;
  }

  // ================= ステージ =================
  // data/stages.json のステージが、試合の最初に1つ決まる（setup.stage）。

  /** 今のステージの定義（ステージを使わないなら null） */
  stageDef() {
    return this.stage ? this.stageDefs[this.stage] : null;
  }

  /** ステージに合う属性の武器を持った兵士なら、ダメージを elementMultiplier 倍（小数は切り上げ） */
  stageBoost(x, amount) {
    const def = this.stageDef();
    if (!def?.element || !(x instanceof Soldier) || !x.weapon || x.element !== def.element || amount <= 0) return amount;
    return Math.ceil(amount * (def.elementMultiplier ?? 1));
  }

  /** ステージで、カードの効果の数値（amount。凍結は turns）に足す量 */
  stageEffectBonus(effect) {
    return this.stageDef()?.effectBonus?.[effect] ?? 0;
  }

  /** やけどにする（重ねがけでは増えない：量・残りの回数を大きい方にそろえる） */
  applyBurn(owner, soldier) {
    const burn = this.stageDef()?.burn;
    if (!burn || !owner.soldiers.includes(soldier)) return;
    this.setBurn(owner, soldier, burn.amount, burn.turns);
  }

  /** やけど { amount, turns } をつける（量・残りの回数を大きい方にそろえる）。statusApplied を出す */
  setBurn(owner, soldier, amount, turnsArg) {
    const turns = Math.max(turnsArg, soldier.burn?.turns ?? 0);
    soldier.burn = { amount: Math.max(amount, soldier.burn?.amount ?? 0), turns };
    this.emit('statusApplied', { playerId: owner.id, soldierId: soldier.soldierId, status: 'burn', turns, amount: soldier.burn.amount });
  }

  /** 溶岩：ターンの終わりに、手番の人の兵士全員に灼熱のダメージ。溶岩マスにいる兵士はやけど */
  stageTurnEnd(player) {
    const def = this.stageDef();
    if (!def?.heat && !def?.lavaSquares) return;
    for (const soldier of [...player.soldiers]) {
      if (def.heat && this.damageSoldier(player, soldier, def.heat, 'heat')) continue;
      if (def.lavaSquares?.includes(soldier.position)) this.applyBurn(player, soldier);
    }
  }

  /** 溶岩：周回の始めに、eruption.chance の確率で、どこかの道の1マスが噴火する（そこにいる兵士に amount ダメージとやけど） */
  stageEruption() {
    const er = this.stageDef()?.eruption;
    if (!er || this.rng() >= er.chance) return;
    const { laneLength } = this.rules;
    const square = 1 + Math.floor(this.rng() * Math.max(1, laneLength - 2));
    let roadId;
    let here;
    if (this.plaza) {
      // 広場：噴火は広場（真ん中のマス）で起きる
      roadId = PLAZA;
      here = (id, x) => this.placeOf(id, x)?.at === 'plaza';
    } else {
      const road = this.roads[Math.floor(this.rng() * this.roads.length)];
      roadId = road.roadId;
      here = (id, x) => x.roadId === road.roadId && road.toSquare(this.side(id), x.position) === square;
    }
    this.emit('stageEruption', { roadId, square: this.plaza ? this.middleSquare() : square, amount: er.amount });
    for (const id of this.alivePlayerIds()) {
      const owner = this.players[id];
      for (const soldier of owner.soldiers.filter((x) => here(id, x))) {
        if (!this.damageSoldier(owner, soldier, er.amount, 'eruption')) this.applyBurn(owner, soldier);
      }
    }
  }

  // ================= 昼と夜 =================

  /** 夜になる確率（ステージの nightChance が優先） */
  nightChance() {
    return this.stageDef()?.nightChance ?? this.rules.nightChance;
  }

  /** 夜が続く周回の数（闇の森は長い） */
  nightLength() {
    return this.rules.nightRounds + (this.stageDef()?.nightRoundsBonus ?? 0);
  }

  /** 昼と夜を変える。timeChanged を出す */
  setTime(time, cause, playerId = null) {
    const previous = this.night ? 'night' : 'day';
    const rounds = time === 'night' ? this.nightLength() : 0;
    this.night = time === 'night' ? { roundsLeft: rounds } : null;
    this.emit('timeChanged', { time, previous, rounds, cause, playerId });
  }

  /** 周回の始め：夜の残りを1つ減らし、終わったら昼に。昼なら、確率で夜になる（確率が0なら乱数を使わない） */
  tickNight() {
    if (this.night) {
      this.night.roundsLeft -= 1;
      if (this.night.roundsLeft <= 0) this.setTime('day', 'natural');
      return;
    }
    if (this.round < this.rules.nightFirstRound) return;
    const chance = this.nightChance();
    if (chance > 0 && this.rng() < chance) this.setTime('night', 'natural');
  }

  // ================= 天候 =================
  // data/weather.json の天候が、周回の始めに切り替わる（天候の呪文でも変わる）。
  //   晴れ・雨・大雨：その属性のダメージ・回復が増える　大雨：周回の始めに雷（どちらかの城へ）
  //   霧：兵士の戦い・射撃・攻撃魔法が外れることがある　嵐：進む兵士が動かない
  //   砂嵐：周回の始めに全員の城と兵士に1ダメージ　コインの雨：ターンの始めにコイン

  /** 今の天候の定義（ふつうの天気なら null） */
  weatherDef() {
    return this.weather ? this.weatherDefs[this.weather.type] : null;
  }

  /** 今の天候で、その属性のダメージ・回復に足される量 */
  weatherElementBonus(element) {
    return element ? this.weatherDef()?.elementBonus?.[element] ?? 0 : 0;
  }

  /**
   * 霧のとき、攻撃が外れるか（霧でなければ乱数を使わない）。
   * soldier（攻撃する兵士）が命中低下（霧・砂嵐の反応）なら、その確率でも外れる（命中低下でなければ乱数を使わない）
   */
  rollMiss(soldier = null) {
    const chance = this.weatherDef()?.missChance ?? 0;
    if (chance > 0 && this.rng() < chance) return true;
    return Boolean(soldier?.blind) && this.rng() < soldier.blind.chance;
  }

  /** 外れたことを知らせる。kind は "fight" / "shot" / "spell" */
  emitMiss(playerId, kind, extra = {}) {
    this.emit('attackMissed', { playerId, kind, ...extra });
  }

  /** 天候を変える（type が null ならふつうの天気に戻す）。weatherChanged を出す */
  setWeather(type, cause, playerId = null) {
    const previous = this.weather?.type ?? null;
    let rounds = 0;
    if (type !== null) {
      const [min, max] = this.weatherDefs[type].rounds;
      rounds = min === max ? min : min + Math.floor(this.rng() * (max - min + 1));
    }
    this.weather = type === null ? null : { type, roundsLeft: rounds };
    const def = type === null ? null : this.weatherDefs[type];
    this.emit('weatherChanged', {
      weather: type, previous, rounds, cause, playerId,
      name: def?.name ?? null, icon: def?.icon ?? null, description: def?.description ?? null,
      previousName: previous === null ? null : this.weatherDefs[previous].name,
    });
  }

  /** 重みで天候を1つ選ぶ（exclude は除く） */
  pickWeather(exclude = null) {
    const types = Object.keys(this.weatherDefs).filter((t) => t !== exclude);
    if (types.length === 0) return null;
    // 砂漠のステージ：砂嵐が起きやすい（weatherWeights の倍率）
    const w = (t) => this.weatherDefs[t].weight * (this.stageDef()?.weatherWeights?.[t] ?? 1);
    const total = types.reduce((a, t) => a + w(t), 0);
    let r = this.rng() * total;
    return types.find((t) => (r -= w(t)) < 0) ?? types.at(-1);
  }

  /** 周回の始め：天候の残りを1つ減らし、終わったらふつうの天気に。ふつうの天気なら、確率で新しい天候になる */
  tickWeather() {
    if (!this.weatherDefs) return;
    // 続いている天候は、weatherFirstRound より前でも減る（天候の呪文で早く始めた天候が、長く続きすぎないように）
    if (this.weather) {
      this.weather.roundsLeft -= 1;
      if (this.weather.roundsLeft > 0) return;
      this.setWeather(null, 'natural');
      return;
    }
    if (this.round < this.rules.weatherFirstRound) return;
    if (this.rules.weatherChangeChance > 0 && this.rng() < this.rules.weatherChangeChance) {
      this.setWeather(this.pickWeather(), 'natural');
    }
  }

  /** 周回の始め：大雨の雷・砂嵐のダメージ。何か起きたら true（城が落ちたかは checkGameOver で確かめる） */
  weatherRoundEffects() {
    const def = this.weatherDef();
    if (!def) return false;
    let acted = false;
    if (def.lightning) {
      const sides = this.aliveSides();
      const victim = this.players[sides[Math.floor(this.rng() * sides.length)]];
      this.emit('weatherLightning', { playerId: victim.id, amount: def.lightning });
      this.damageCastle(victim, def.lightning, { kind: 'weather', weather: this.weather.type });
      acted = true;
    }
    if (def.sandDamage) {
      for (const id of this.aliveSides()) {
        const owner = this.players[id];
        // 砂嵐では城を落とさない（HPは1で止まる。全員の城が同時に0になって勝者がいなくなるのを防ぐ）
        const amount = Math.min(def.sandDamage, owner.castle.hp - 1);
        if (amount <= 0) continue;
        owner.castle.takeDamage(amount);
        this.emit('castleDamaged', { playerId: id, amount, blocked: 0, hp: owner.castle.hp, source: { kind: 'weather', weather: this.weather.type } });
      }
      for (const id of this.alivePlayerIds()) {
        const owner = this.players[id];
        for (const soldier of [...owner.soldiers]) this.damageSoldier(owner, soldier, def.sandDamage, 'weather');
      }
      acted = true;
    }
    return acted;
  }

  /** 進軍中の attacker と、相手の defender が戦う。お互いに攻撃力ぶんのダメージを同時に与える */
  fight(player, attacker, enemy, defender) {
    const road = this.findRoad(attacker.roadId);
    this.emit('soldiersClashed', {
      attacker: { playerId: player.id, soldierId: attacker.soldierId },
      defender: { playerId: enemy.id, soldierId: defender.soldierId },
      roadId: road.roadId,
      square: road.toSquare(this.side(player.id), attacker.position), // 攻める側が止まったマス
    });

    // 霧：攻撃が外れる（ダメージ0）。命中低下の兵士も外れることがある
    const missD = this.rollMiss(attacker);
    const missA = this.rollMiss(defender);
    if (missD) this.emitMiss(player.id, 'fight', { soldierId: attacker.soldierId });
    if (missA) this.emitMiss(enemy.id, 'fight', { soldierId: defender.soldierId });
    // 属性の反応：倍率は soldierDamaged の前に決まる（reactionTriggered が先）。付着・特殊効果は、消える兵士を消したあと
    const hitD = missD ? null : this.prepareHit(player.id, enemy, defender, this.fightDamage(attacker, defender), attacker.element);
    const hitA = missA ? null : this.prepareHit(enemy.id, player, attacker, this.fightDamage(defender, attacker), defender.element);
    const toDefender = missD ? 0 : this.reduceDamage(enemy, hitD.amount);
    const toAttacker = missA ? 0 : this.reduceDamage(player, hitA.amount);
    const blockedD = defender.takeDamage(toDefender);
    const blockedA = attacker.takeDamage(toAttacker);
    this.emit('soldierDamaged', {
      playerId: enemy.id, soldierId: defender.soldierId, amount: toDefender, hp: defender.hp, cause: 'fight', blocked: blockedD,
    });
    this.emit('soldierDamaged', {
      playerId: player.id, soldierId: attacker.soldierId, amount: toAttacker, hp: attacker.hp, cause: 'fight', blocked: blockedA,
    });

    // 消える順番は soldierDamaged と同じ（守る側 → 攻める側）
    for (const [owner, s] of [[enemy, defender], [player, attacker]]) {
      if (s.isDead) this.removeSoldier(owner, s, 'killed');
    }
    hitD?.after?.();
    hitA?.after?.();
  }

  // ================= カードを出す =================

  /**
   * そのカードを出せる対象の一覧（プレイヤーの番・手札にあるかなどは見ない）。
   * 形は { playerId } / { soldierId } / { roadId, square } のどれか（CLAUDE.md「対象の選び方」）。
   * @returns {{targets: object[], reason: string}} 対象がないときの理由も返す
   */
  listTargets(player, card) {
    const def = card.def;
    const playerTargets = (players) => players.map((p) => ({ playerId: p.id }));
    const ownSoldiers = () => player.soldiers.map((x) => ({ soldierId: x.soldierId }));
    switch (def.kind) {
      case 'soldier': {
        // 道が何本かあるときは、どの道に出すかも選ぶ（{ playerId, roadId }）
        const targets = this.neighborsOf(player.id).flatMap((p) => {
          const roads = this.roadsBetween(player.id, p.id);
          return roads.length === 1 ? [{ playerId: p.id }] : roads.map((r) => ({ playerId: p.id, roadId: r.roadId }));
        });
        return { targets, reason: '兵士を送れる相手がいません' };
      }
      case 'weapon': {
        // 武器は何本でも重ねられる（攻撃力は足し算。属性は最後に持たせた武器になる）
        const targets = player.soldiers.map((x) => ({ soldierId: x.soldierId }));
        return { targets, reason: '道の上に自分の兵士がいません' };
      }
      default:
        break;
    }
    // 見えない忍者は妖術（魔法）の的にならない（いるかどうかも相手に分からないように、数えない）
    const hasSoldiers = (p) => p.visibleSoldiers.length > 0;
    // 選んだ1レーンだけに効く魔法：自分の道ごとに、相手の兵士がいる（効き目が変わる兵士がいる）道が対象
    if (this.isLaneScoped(def) && LANE_SCOPE_EFFECTS.includes(def.effect)) {
      const changes = this.changesSoldier(def);
      // 道の向こうの陣地の人（チーム戦ならメンバーごと）×道。その道にその人の兵士がいるもの
      const me = this.side(player.id);
      const pairs = this.roads.filter((r) => r.has(me)).flatMap((r) =>
        this.opponentsOf(player.id).filter((p) => this.side(p.id) === r.otherSide(me)).map((p) => ({ p, r, on: p.visibleSoldiers.filter((x) => x.roadId === r.roadId) })),
      );
      const withSoldiers = pairs.filter((x) => x.on.length > 0);
      const targets = withSoldiers.filter((x) => x.on.some(changes)).map((x) => ({ playerId: x.p.id, roadId: x.r.roadId }));
      return { targets, reason: withSoldiers.length ? this.noChangeReason(def) : '道の上に相手の兵士がいません' };
    }
    switch (def.effect) {
      case 'wild':
        return { targets: [], reason: '適応は合成に使うカードです（出せません）' };
      case 'damageEnemyCastle':
        return {
          targets: [
            // 城は陣地ごとに1つ（チーム戦ならチームの代表）
            ...playerTargets(this.rules.castleSpellRange === 'neighbors' ? this.neighborsOf(player.id) : this.enemySides(player.id)),
            // 魔物は、自分の道（自分が両はしのどちらか）にいるものだけ。広場の魔物はだれからでも狙える
            ...this.monsters.filter((m) => m.roadId === PLAZA || this.findRoad(m.roadId).has(this.side(player.id))).map((m) => ({ monsterId: m.monsterId })),
          ],
          reason: '相手がいません',
        };
      case 'damageEnemyAll':
      case 'damageCastleAndHeal':
      case 'drainCastle': {
        // 生命吸収・吸血：城だけを狙う（魔物は狙えない）
        const foes = this.rules.castleSpellRange === 'neighbors' ? this.neighborsOf(player.id) : this.enemySides(player.id);
        return { targets: playerTargets(foes), reason: '相手がいません' };
      }
      case 'sacrificeAttack': {
        // 捨て身：払うと自分の城が落ちるなら出せない
        if (player.castle.hp <= def.selfDamage) return { targets: [], reason: `城のHPが足りません（${def.selfDamage}より多く必要です）` };
        const foes = this.rules.castleSpellRange === 'neighbors' ? this.neighborsOf(player.id) : this.enemySides(player.id);
        return { targets: playerTargets(foes), reason: '相手がいません' };
      }
      case 'dice':
        return this.diceTargets(player, def.dice, def.per, def.randomCost);
      case 'healCastleOrMp':
        // スライム：城HPと MP のどちらかがまだ増えるなら出せる（どちらになるかはランダム）
        return {
          targets: !player.castle.isFull || (this.rules.maxMp > 0 && player.mp < this.rules.maxMp) ? [{ playerId: player.id }] : [],
          reason: '城のHPもMPも満タンです',
        };
      case 'healAndArmor':
        // トレント：城の回復か城壁のどちらかが効くなら出せる
        return {
          targets: !player.castle.isFull || !this.armorFull(player, { amount: def.armor }) ? [{ playerId: player.id }] : [],
          reason: '城のHPが満タンで、城壁も上限です',
        };
      case 'stealCoins':
        // ミミック：コインを持っている相手だけ
        return { targets: playerTargets(this.opponentsOf(player.id).filter((p) => p.coins > 0)), reason: '相手のコインがありません' };
      case 'drainMp':
        // MPドレイン：MP を持っている相手だけ
        if (this.rules.maxMp <= 0) return { targets: [], reason: 'このルールではMPを使いません' };
        return { targets: playerTargets(this.opponentsOf(player.id).filter((p) => p.mp > 0)), reason: '相手のMPがありません' };
      case 'damageAllSoldiers':
        // 爆発：場に（見える）兵士がだれかいれば出せる。対象は自分（全員に効く）
        return {
          targets: this.alivePlayerIds().some((id) => this.players[id].visibleSoldiers.length > 0) ? [{ playerId: player.id }] : [],
          reason: '場に兵士がいません',
        };
      case 'damageEnemySoldiers':
        return {
          targets: playerTargets(this.opponentsOf(player.id).filter(hasSoldiers)),
          reason: '道の上に相手の兵士がいません',
        };
      case 'poisonEnemySoldiers':
      case 'freezeEnemySoldiers':
      case 'pushBackEnemySoldiers': {
        // 効き目が変わる兵士がいる相手だけ（全員もう同じかそれ以上の状態・押し戻せないなら、出しても何も起きない）
        const changes = this.changesSoldier(def);
        const withSoldiers = this.opponentsOf(player.id).filter(hasSoldiers);
        return {
          targets: playerTargets(withSoldiers.filter((p) => p.visibleSoldiers.some(changes))),
          reason: withSoldiers.length ? this.noChangeReason(def) : '道の上に相手の兵士がいません',
        };
      }
      case 'poisonEnemy': {
        // 毒は足し算で、城はいつも毒にできる。相手がいればいつでも出せる
        const foes = this.rules.castleSpellRange === 'neighbors' ? this.neighborsOf(player.id) : this.enemySides(player.id);
        return { targets: playerTargets(foes), reason: '相手がいません' };
      }
      case 'curePoison':
        return {
          targets: player.castle.poison || player.soldiers.some((x) => x.poison) ? [{ playerId: player.id }] : [],
          reason: '毒にかかっているものがありません',
        };
      case 'chainBlast':
        // 相手の兵士1体を選ぶ（見えない忍者・暗殺者は選べない）
        return {
          targets: this.opponentsOf(player.id).flatMap((p) => p.visibleSoldiers.map((x) => ({ soldierId: x.soldierId }))),
          reason: '道の上に相手の兵士がいません',
        };
      case 'ignitionBurst': {
        // 自分の城が落ちるほどのときは出せない（自滅させない）
        if (player.castle.hp <= card.def.selfDamage + 1) return { targets: [], reason: `城のHPが足りません（${card.def.selfDamage + 2}以上必要）` };
        return { targets: playerTargets(this.enemySides(player.id)), reason: '相手がいません' };
      }
      case 'armorBlast':
        if (player.armor <= 0) return { targets: [], reason: '城壁がありません' };
        return { targets: playerTargets(this.rules.castleSpellRange === 'neighbors' ? this.neighborsOf(player.id) : this.enemySides(player.id)), reason: '相手がいません' };
      case 'purifyFlare': {
        const cures = player.castle.poison || player.soldiers.some((x) => x.poison || x.burn || x.frozen > 0);
        const foes = this.opponentsOf(player.id).some(hasSoldiers);
        return { targets: cures || foes ? [{ playerId: player.id }] : [], reason: '治すものも、相手の兵士もいません' };
      }
      case 'setTime': {
        // 刻の魔法：ムーンライズは昼のとき（夜にする）、ドーンブレイクは夜のとき（昼にする）だけ出せる
        const now = this.night ? 'night' : 'day';
        return {
          targets: now !== card.def.time ? [{ playerId: player.id }] : [],
          reason: card.def.time === 'night' ? 'もう夜です' : 'もう昼です',
        };
      }
      case 'changeWeather': {
        // 今と違う天候に変える。変えられる天候がなければ出せない（出しても何も起きないので）
        if (!this.weatherDefs) return { targets: [], reason: 'このルールでは天候を使いません' };
        const others = Object.keys(this.weatherDefs).filter((t) => t !== this.weather?.type);
        return { targets: others.length > 0 ? [{ playerId: player.id }] : [], reason: 'ほかに変えられる天候がありません' };
      }
      case 'gainCoins':
        return { targets: [{ playerId: player.id }], reason: '' };
      case 'gainMp':
        return { targets: this.rules.maxMp > 0 && player.mp < this.rules.maxMp ? [{ playerId: player.id }] : [], reason: this.rules.maxMp > 0 ? 'MPが満タンです' : 'このルールではMPを使いません' };
      case 'redrawHand':
        return {
          targets: player.hand.some((c) => c.cardId !== card.cardId) ? [{ playerId: player.id }] : [],
          reason: '引き直す手札がありません',
        };
      case 'randomEffect': {
        const pile = this.pileOf(player.id);
        return {
          targets: pile.deck.length + pile.discard.length > 0 ? [{ playerId: player.id }] : [],
          reason: '山札も捨て札もありません',
        };
      }
      case 'stealCard':
        return {
          targets: this.opponentsOf(player.id).filter((p) => p.hand.length > 0).map((p) => ({ playerId: p.id })),
          reason: '手札を持っている相手がいません',
        };
      case 'summonSpirit': {
        if (player.spirit?.type === card.type) return { targets: [], reason: '同じ精霊がもう来ています' };
        // 火の精霊は、毎ターン城を攻める相手を選ぶ。ほかは自分
        if (def.spirit === 'fire') {
          const foes = this.rules.castleSpellRange === 'neighbors' ? this.neighborsOf(player.id) : this.enemySides(player.id);
          return { targets: playerTargets(foes), reason: '相手がいません' };
        }
        return { targets: [{ playerId: player.id }], reason: '' };
      }
      case 'reflectSpell':
      case 'nullifySoldier':
        return { targets: [], reason: '攻撃を受けたときにだけ使えます' };
      case 'healOwnCastle':
        return { targets: player.castle.isFull ? [] : [{ playerId: player.id }], reason: '城のHPが満タンです' };
      case 'shieldSoldier':
        return { targets: ownSoldiers(), reason: '道の上に自分の兵士がいません' };
      case 'armorCastle':
        return {
          targets: this.armorFull(player, def) ? [] : [{ playerId: player.id }],
          reason: this.rules.armorMax ? `城壁がもう上限（${this.rules.armorMax}）まで積んであります` : '同じか、より強い城壁がもう置いてあります',
        };
      default:
        return { targets: [], reason: 'このカードは出せません' };
    }
  }

  /** その魔法で、兵士 x の状態が変わるか（毒・凍結：もう同じかそれ以上なら変わらない。サンダーはいつも変わる） */
  changesSoldier(def) {
    if (def.effect === 'poisonEnemySoldiers') return (x) => !x.poison || x.poison.turns < def.turns || x.poison.amount < def.amount;
    if (def.effect === 'freezeEnemySoldiers') return (x) => x.frozen < def.turns + this.stageEffectBonus(def.effect);
    // 押し戻し：自分の城の前（マス0）にいる兵士は、それより後ろに下がれない
    if (def.effect === 'pushBackEnemySoldiers') return (x) => x.position > 0;
    return () => true;
  }

  /** 相手の兵士はいるが、出しても何も変わらないときの理由 */
  noChangeReason(def) {
    if (def.effect === 'pushBackEnemySoldiers') return '押し戻せる兵士がいません（みんな城の前にいます）';
    return 'もう同じ状態になっています';
  }

  /** 手番・手札・枚数の決まりを確かめる。出せるならカードを返す */
  checkPlayable(cardId) {
    if (this.phase === 'ready') return fail('ゲームがまだ始まっていません');
    if (this.phase === 'gameOver') return fail('ゲームは終わっています');
    if (this.phase === 'discard') return fail('手札を捨てているところです');
    if (this.phase === 'defend') return fail('相手が防御を選んでいます');
    if (this.phase === 'mulligan') return fail('最初の手札を選んでいるところです');

    const player = this.players[this.currentPlayer];
    const card = player.findInHand(cardId);
    if (!card) {
      if (this.opponentsOf(player.id).some((p) => p.findInHand(cardId))) return fail('あなたの番ではありません');
      return fail('そのカードは手札にありません');
    }
    // 適応は合成専用。枠の決まりより先に答える（「もうメインを出しました」だと、次のターンなら出せるように読めてしまう）
    if (card.def.effect === 'wild') return fail('適応は合成に使うカードです（出せません）');
    // 台帳だけあって効果がまだないカード（implemented: false）。ふつうは引き当てないので手札に来ないが、念のため
    if (card.def.implemented === false) return fail('このカードの効果はまだありません');
    // 兵士は1ターン soldiersPerTurn 枚、メイン（攻撃の魔法）は1枚。付加（武器）・防御・回復や精霊などは何枚でも
    if (card.slot === 'soldier' && player.soldiersPlayedThisTurn >= this.rules.soldiersPerTurn) {
      return fail(`このターンに出せる兵士は${this.rules.soldiersPerTurn}枚までです`);
    }
    if (card.slot === 'main' && player.playedThisTurn) return fail('このターンはもうメインのカードを出しました');
    if (isCoinCard(card.def) && this.rules.coinCardsPerTurn && player.coinCardsPlayedThisTurn >= this.rules.coinCardsPerTurn) {
      return fail(`コインのカードは1ターンに${this.rules.coinCardsPerTurn}枚までです`);
    }
    const cost = this.mpCostOf(card);
    if (cost > player.mp) return fail(`MPが足りません（${cost}必要・あと${cost - player.mp}）`);
    return { ok: true, player, card };
  }

  /**
   * 対象を決める。target を省略して、対象が1つならそれを使う。
   * @returns {{ok: true, target: object, needsTarget?: boolean} | {ok: false, reason: string}}
   */
  resolveTarget(player, card, target) {
    const { targets, reason } = this.listTargets(player, card);
    if (targets.length === 0) return fail(reason);
    if (target === undefined || target === null) {
      if (targets.length === 1) return { ok: true, target: targets[0] };
      return { ok: true, target: null, needsTarget: true };
    }
    // 値が undefined のキーは無いものとして比べる（UI がオブジェクトを組み立てて渡しても困らないように）
    const keys = (o) => Object.keys(o).filter((k) => o[k] !== undefined);
    const same = (a, b) => keys(a).length === keys(b).length && keys(b).every((k) => a[k] === b[k]);
    const found = typeof target === 'object' ? targets.find((t) => same(t, target)) : null;
    if (!found) return fail('そこには出せません');
    return { ok: true, target: found };
  }

  /**
   * そのカードを今出せるか（読むだけ）。出せないときは理由を返す（UIが前もって表示するため）。
   * target を省略して、対象が2つ以上あるときは { ok: true, needsTarget: true }（出せるけど選ぶ必要がある）
   * @returns {{ok: true, needsTarget?: true} | {ok: false, reason: string}}
   */
  canPlayCard(cardId, target) {
    const check = this.checkPlayable(cardId);
    if (!check.ok) return check;
    const t = this.resolveTarget(check.player, check.card, target);
    if (!t.ok) return t;
    return t.needsTarget ? { ok: true, needsTarget: true } : ok();
  }

  /**
   * そのカードを今出せる対象の一覧（読むだけ）。出せないときは空の配列
   * @returns {object[]}
   */
  getTargets(cardId) {
    const check = this.checkPlayable(cardId);
    if (!check.ok) return [];
    return this.listTargets(check.player, check.card).targets.map((t) => ({ ...t }));
  }

  /**
   * メイン：カードを1枚使う。
   * @param {string} cardId
   * @param {object} [target] 対象（{ playerId } など）。対象が1つしかないときは省略できる
   */
  playCard(cardId, target) {
    const check = this.checkPlayable(cardId);
    if (!check.ok) return check;
    const { player } = check;
    const resolved = this.resolveTarget(player, check.card, target);
    if (!resolved.ok) return resolved;
    if (resolved.needsTarget) return { ok: false, reason: '対象を選んでください', needsTarget: true };

    const card = player.takeFromHand(cardId);
    const mpCost = this.mpCostOf(card);
    if (mpCost > 0) this.changeMp(player, -mpCost, 'cast');
    if (card.slot === 'main') player.playedThisTurn = true;
    if (isCoinCard(card.def)) player.coinCardsPlayedThisTurn += 1;
    if (card.slot === 'soldier') player.soldiersPlayedThisTurn += 1;
    player.cardsPlayedThisTurn += 1;
    // 使ったカードは（兵士も）すぐ捨て札へ。使い切りのカードは、二度と山札に戻らない置き場へ
    this.throwAway(player.id, card);
    this.emit('cardPlayed', { playerId: player.id, cardId: card.cardId, type: card.type });

    this.applyCard(player, card, resolved.target);

    this.checkGameOver();
    return ok();
  }

  /** 出したカードの効果を起こす（神頼みでタダで出すときにも使う） */
  applyCard(player, card, target) {
    if (card.def.effect === 'dice') {
      this.rollDice(player, card, target);
      return;
    }
    if (card.isSoldier) {
      const targetId = target.playerId;
      const road = target.roadId ? this.findRoad(target.roadId) : this.roadBetween(player.id, targetId);
      const soldierId = `s${String(this.nextSoldierNumber++).padStart(2, '0')}`;
      const soldier = new Soldier(soldierId, card, road.roadId, targetId);
      soldier.baseAttack += player.castleDef.soldierAttackBonus ?? 0; // 兵舎
      soldier.baseAttack += player.armyAttack; // 訓練（コインで買う）
      soldier.hp += player.armyHp;
      soldier.maxHp += player.armyHp;
      player.soldiers.push(soldier);
      if (soldier.stealth) (this.stealthSides ??= new Map()).set(soldierId, this.side(player.id));
      this.emit('soldierDeployed', {
        playerId: player.id,
        soldierId,
        type: card.type,
        roadId: road.roadId,
        targetId,
        position: soldier.position,
        hp: soldier.hp,
        attack: soldier.attack,
      });
    } else if (card.isSpell && target.soldierId) {
      this.chainBlast(player, card, target.soldierId);
    } else if (card.isSpell && target.monsterId) {
      const monster = this.findMonster(target.monsterId);
      this.emit('spellCast', { playerId: player.id, type: card.type, target: monster.monsterId, targetKind: 'monster' });
      if (this.rollMiss()) {
        this.emitMiss(player.id, 'spell', { type: card.type });
      } else {
        this.damageMonster(monster, card.def.amount + this.stageEffectBonus(card.def.effect), { playerId: player.id, type: card.type });
        this.defeatMonsterIfDead(monster, player.id);
      }
    } else if (card.isSpell) {
      this.castSpell(player, card, this.players[target.playerId], target.roadId);
    } else {
      this.playSupport(player, card, target);
    }

  }

  /**
   * チェーン・ブラスト：相手の兵士1体に amount、そのまわりの同じ陣地の兵士に半分（切り上げ）。
   * まわり＝同じ道の前後1マス（同じマスも）・となりの道（同じ2人の間のレーンが1つちがい）の同じマス。
   * 兵士に当たる魔法なので、相手は盾を出せる
   */
  chainBlast(player, card, soldierId) {
    const owner = this.opponentsOf(player.id).find((p) => p.soldiers.some((x) => x.soldierId === soldierId));
    const center = owner.soldiers.find((x) => x.soldierId === soldierId);
    const amount = card.def.amount;
    const half = Math.ceil(amount / 2);
    const road = this.findRoad(center.roadId);
    const side = this.side(owner.id);
    const sq = road.toSquare(side, center.position);
    const near = [];
    for (const id of this.alivePlayerIds().filter((id) => this.side(id) === side)) {
      for (const x of this.players[id].visibleSoldiers) {
        if (x === center) continue;
        const r = this.findRoad(x.roadId);
        const xsq = r.toSquare(side, x.position);
        const sameRoad = r.roadId === road.roadId && Math.abs(xsq - sq) <= 1;
        const nextLane = r.pairId === road.pairId && Math.abs(r.lane - road.lane) === 1 && xsq === sq;
        if (sameRoad || nextLane) near.push({ owner: this.players[id], soldier: x });
      }
    }
    this.emit('spellCast', { playerId: player.id, type: card.type, target: owner.id, targetKind: 'player', roadId: center.roadId, soldierId });
    if (this.rollMiss()) {
      this.emitMiss(player.id, 'spell', { type: card.type });
      return;
    }
    this.requestDefense(
      { kind: 'soldiers', defenderId: side, attackerId: player.id, amount, soldierIds: [soldierId, ...near.map((n) => n.soldier.soldierId)] },
      () => {
        if (owner.soldiers.includes(center)) this.damageSoldier(owner, center, amount, 'spell', this.spellHit(player, card));
        for (const n of near) if (n.owner.soldiers.includes(n.soldier)) this.damageSoldier(n.owner, n.soldier, half, 'spell', this.spellHit(player, card));
      },
      () => this.checkGameOver(),
    );
  }

  /** 魔法が兵士に当たるときの属性（cards.json の element。なければ null＝付着も反応もしない） */
  spellHit(player, card) {
    return card.def.element ? { attackerId: player.id, element: card.def.element } : null;
  }

  castSpell(player, card, targetPlayer, roadId) {
    const enemy = targetPlayer;
    const { effect } = card.def;
    // ステージで、魔法の数値が増える（溶岩・遺跡）
    const amount = card.def.amount === undefined ? undefined : card.def.amount + this.stageEffectBonus(effect);
    // レーンを選んだ魔法は、その道の兵士だけに効く（spellCast にも roadId を入れる）
    const lane = roadId === undefined ? {} : { roadId };
    const victims = () => enemy.visibleSoldiers.filter((x) => roadId === undefined || x.roadId === roadId);

    switch (effect) {
      case 'damageEnemyCastle':
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        // 魔法の塔は城への魔法が強い
        {
          const damage = amount + (player.castleDef.castleSpellBonus ?? 0);
          if (this.rollMiss()) {
            this.emitMiss(player.id, 'spell', { type: card.type });
            break;
          }
          this.requestDefense(
            { kind: 'castle', defenderId: enemy.id, attackerId: player.id, amount: damage, from: 'spell', spellType: card.type },
            () => this.damageCastle(enemy, damage, { kind: 'spell', type: card.type }),
            () => this.checkGameOver(),
          );
        }
        break;

      case 'drainCastle': {
        // 生命吸収：城にダメージ（城壁が先に受ける）。城HPを実際に減らしたぶん、自分の城を回復
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        const damage = amount + (player.castleDef.castleSpellBonus ?? 0);
        if (this.rollMiss()) {
          this.emitMiss(player.id, 'spell', { type: card.type });
          break;
        }
        this.requestDefense(
          { kind: 'castle', defenderId: enemy.id, attackerId: player.id, amount: damage, from: 'spell', spellType: card.type },
          () => {
            const before = enemy.castle.hp;
            this.damageCastle(enemy, damage, { kind: 'spell', type: card.type });
            const taken = Math.max(0, before - Math.max(0, enemy.castle.hp));
            // 相手の城が落ちたら、回復せずに決着（gameOver）へ
            if (taken > 0 && !enemy.castle.isDestroyed) {
              const healed = player.castle.heal(taken);
              if (healed > 0) this.emit('castleHealed', { playerId: player.id, amount: healed, hp: player.castle.hp });
            }
          },
          () => this.checkGameOver(),
        );
        break;
      }

      case 'damageCastleAndHeal': {
        // 吸血（ヴァンパイアのカード）：相手の城に amount ダメージ（防御を聞く）、そのあと自分の城を heal 回復。
        // 回復は、外れても・防がれても・反射されても起きる。相手の城が落ちたら回復せずに決着
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        const heal = () => {
          if (this.checkGameOver()) return;
          const healed = player.castle.heal(card.def.heal);
          if (healed > 0) this.emit('castleHealed', { playerId: player.id, amount: healed, hp: player.castle.hp });
        };
        if (this.rollMiss()) {
          this.emitMiss(player.id, 'spell', { type: card.type });
          heal();
          break;
        }
        // requestDefense は、防御を待ったときだけ after を呼ぶ。待たなかったときは、ここで回復する
        const waiting = this.requestDefense(
          { kind: 'castle', defenderId: enemy.id, attackerId: player.id, amount, from: 'spell', spellType: card.type },
          () => this.damageCastle(enemy, amount, { kind: 'spell', type: card.type }),
          heal,
        );
        if (!waiting) heal();
        break;
      }

      case 'sacrificeAttack': {
        // 捨て身：先に自分の城HPを払う（城壁・土の精霊は通さない。外れても払う）
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        player.castle.takeDamage(card.def.selfDamage);
        this.emit('castleDamaged', {
          playerId: player.id, amount: card.def.selfDamage, blocked: 0, hp: player.castle.hp, source: { kind: 'sacrifice', type: card.type },
        });
        const damage = amount + (player.castleDef.castleSpellBonus ?? 0);
        if (this.rollMiss()) {
          this.emitMiss(player.id, 'spell', { type: card.type });
          break;
        }
        this.requestDefense(
          { kind: 'castle', defenderId: enemy.id, attackerId: player.id, amount: damage, from: 'spell', spellType: card.type },
          () => this.damageCastle(enemy, damage, { kind: 'spell', type: card.type }),
          () => this.checkGameOver(),
        );
        break;
      }

      case 'drainMp': {
        // MPドレイン：相手の MP を奪って自分の MP にする（自分の上限を超えたぶんは捨てる）
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        const taken = -this.changeMp(enemy, -amount, 'drained');
        this.changeMp(player, taken, 'drain');
        break;
      }

      case 'damageAllSoldiers': {
        // 爆発：場にいる兵士全員（席順。自分の兵士も）にダメージ。忍者には当たらない。防御は聞かない
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        if (this.rollMiss()) {
          this.emitMiss(player.id, 'spell', { type: card.type });
          break;
        }
        for (const id of this.alivePlayerIds()) {
          const owner = this.players[id];
          for (const soldier of [...owner.visibleSoldiers]) {
            if (owner.soldiers.includes(soldier)) this.damageSoldier(owner, soldier, amount, 'spell', this.spellHit(player, card));
          }
        }
        this.checkGameOver();
        break;
      }

      case 'damageEnemySoldiers':
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player', ...lane });
        {
          const hit = victims();
          if (this.rollMiss()) {
            this.emitMiss(player.id, 'spell', { type: card.type });
            break;
          }
          // 兵士を狙われた人は、当たる前に盾を出せる
          this.requestDefense(
            { kind: 'soldiers', defenderId: enemy.id, attackerId: player.id, amount, soldierIds: hit.map((x) => x.soldierId) },
            () => {
              for (const soldier of hit) if (enemy.soldiers.includes(soldier)) this.damageSoldier(enemy, soldier, amount, 'spell', this.spellHit(player, card));
            },
            () => this.checkGameOver(),
          );
        }
        break;

      case 'poisonEnemySoldiers':
      case 'freezeEnemySoldiers': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player', ...lane });
        const status = effect === 'poisonEnemySoldiers' ? 'poison' : 'frozen';
        for (const soldier of victims()) {
          // 重ねがけでは増えない：残りの回数を長い方にそろえる
          if (status === 'poison') {
            const turns = Math.max(card.def.turns, soldier.poison?.turns ?? 0);
            soldier.poison = { amount: Math.max(amount, soldier.poison?.amount ?? 0), turns };
            this.emit('statusApplied', { playerId: enemy.id, soldierId: soldier.soldierId, status, turns });
          } else {
            soldier.frozen = Math.max(card.def.turns + this.stageEffectBonus(effect), soldier.frozen);
            this.emit('statusApplied', { playerId: enemy.id, soldierId: soldier.soldierId, status, turns: soldier.frozen });
          }
        }
        break;
      }

      case 'pushBackEnemySoldiers': {
        // ゲイルフォース：相手の兵士を amount マス押し戻す（出した順に。自分の城の前＝マス0で止まる）。
        // ダメージではないので、霧でも外れず、防御も聞かない（凍結と同じ）
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player', ...lane });
        for (const soldier of victims()) {
          const from = soldier.position;
          const to = Math.max(0, from - amount);
          if (to === from) continue;
          soldier.position = to;
          this.emit('soldierMoved', { playerId: enemy.id, soldierId: soldier.soldierId, roadId: soldier.roadId, from, to, cause: 'pushed' });
        }
        break;
      }

      case 'poisonEnemy': {
        // 選んだ相手の兵士全員と城を、永続の毒にする（重ねがけは足し算：毒の量が増える）
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        for (const soldier of enemy.visibleSoldiers) {
          const total = this.capPoison(amount + (soldier.poison?.amount ?? 0));
          const turns = this.rules.poisonTurns || null; // 重ねがけで残りターンも延びる（0 は永続）
          soldier.poison = { amount: total, turns };
          this.emit('statusApplied', { playerId: enemy.id, soldierId: soldier.soldierId, status: 'poison', turns, amount: soldier.poison.amount });
        }
        enemy.castle.poison = this.capPoison(amount + (enemy.castle.poison ?? 0));
        enemy.castle.poisonTurns = this.rules.poisonTurns || null;
        this.emit('castlePoisoned', { playerId: enemy.id, amount: enemy.castle.poison });
        break;
      }

      case 'curePoison': {
        // 自分の毒をすべて治す（兵士も城も）
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        for (const soldier of player.soldiers) {
          if (!soldier.poison) continue;
          soldier.poison = null;
          this.emit('statusCleared', { playerId: player.id, soldierId: soldier.soldierId, status: 'poison' });
        }
        if (player.castle.poison) {
          player.castle.poison = null;
          player.castle.poisonTurns = null;
          this.emit('castleCured', { playerId: player.id });
        }
        break;
      }

      case 'healOwnCastle': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        const healed = player.castle.heal(amount);
        this.emit('castleHealed', { playerId: player.id, amount: healed, hp: player.castle.hp });
        break;
      }

      case 'ignitionBurst': {
        // 先に自分の城が燃える（城壁が先に受ける）。そのあと相手の兵士全員と城に amount（防御は聞かない）
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        this.damageCastle(player, card.def.selfDamage, { kind: 'self', type: card.type });
        if (this.rollMiss()) {
          this.emitMiss(player.id, 'spell', { type: card.type });
          break;
        }
        for (const id of this.alivePlayerIds().filter((id) => this.side(id) === enemy.id)) {
          const owner = this.players[id];
          for (const soldier of [...owner.visibleSoldiers]) if (owner.soldiers.includes(soldier)) this.damageSoldier(owner, soldier, amount, 'spell', this.spellHit(player, card));
        }
        this.damageCastle(enemy, amount, { kind: 'spell', type: card.type });
        this.checkGameOver();
        break;
      }

      case 'armorBlast': {
        // 城壁を全部ぶつける（城壁は0になる）。城に当たる魔法なので、相手は防御（反射など）を出せる
        const damage = player.armor;
        player.armor = 0;
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        this.emit('castleArmored', { playerId: player.id, armor: 0 });
        if (this.rollMiss()) {
          this.emitMiss(player.id, 'spell', { type: card.type });
          break;
        }
        this.requestDefense(
          { kind: 'castle', defenderId: enemy.id, attackerId: player.id, amount: damage, from: 'spell', spellType: card.type },
          () => this.damageCastle(enemy, damage, { kind: 'spell', type: card.type }),
          () => this.checkGameOver(),
        );
        break;
      }

      case 'purifyFlare': {
        // 自分の毒・やけど・凍結を治し、相手の兵士全員に amount
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        for (const soldier of player.soldiers) {
          for (const status of ['poison', 'burn', 'frozen']) {
            if (status === 'frozen' ? soldier.frozen <= 0 : !soldier[status]) continue;
            soldier[status] = status === 'frozen' ? 0 : null;
            this.emit('statusCleared', { playerId: player.id, soldierId: soldier.soldierId, status });
          }
        }
        if (player.castle.poison) {
          player.castle.poison = null;
          player.castle.poisonTurns = null;
          this.emit('castleCured', { playerId: player.id });
        }
        for (const foe of this.opponentsOf(player.id)) {
          for (const soldier of [...foe.visibleSoldiers]) if (foe.soldiers.includes(soldier)) this.damageSoldier(foe, soldier, amount, 'spell', this.spellHit(player, card));
        }
        break;
      }

      case 'setTime': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        this.setTime(card.def.time, 'card', player.id);
        break;
      }

      case 'changeWeather': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        this.setWeather(this.pickWeather(this.weather?.type ?? null), 'card', player.id);
        break;
      }

      case 'gainCoins': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        this.changeCoins(player, amount, 'card');
        break;
      }

      case 'gainMp': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        this.changeMp(player, amount, 'card'); // 上限を超えたぶんは捨てる
        break;
      }

      case 'redrawHand': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        // 先に同じ枚数を引いてから、元の手札を捨てる（捨てたカードをすぐ引き戻さないように）
        const old = [...player.hand];
        this.drawCards(player, old.length);
        const cardIds = old.map((c) => c.cardId);
        for (const c of old) this.throwAway(player.id, player.takeFromHand(c.cardId), { used: false });
        this.emit('cardDiscarded', { playerId: player.id, cardIds });
        break;
      }

      case 'summonSpirit': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        this.summonSpirit(player, card, enemy);
        break;
      }

      case 'randomEffect': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        this.prayCard(player);
        break;
      }

      case 'stealCard': {
        // amount 枚まで（省略すると1枚）。1枚ずつランダムに奪う（ゴーストのカードは2枚）
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        for (let i = 0; i < (card.def.amount ?? 1) && enemy.hand.length > 0; i++) {
          const stolen = enemy.hand[enemy.hand.length === 1 ? 0 : Math.floor(this.rng() * enemy.hand.length)];
          enemy.takeFromHand(stolen.cardId);
          player.hand.push(stolen);
          this.emit('cardStolen', { playerId: player.id, victimId: enemy.id, cardId: stolen.cardId });
        }
        break;
      }

      case 'healCastleOrMp': {
        // スライム：城HPか MP のどちらかをランダムに回復（満タンの方は選ばない）
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        const options = [];
        if (!player.castle.isFull) options.push('hp');
        if (this.rules.maxMp > 0 && player.mp < this.rules.maxMp) options.push('mp');
        const pick = options.length === 1 ? options[0] : options[Math.floor(this.rng() * options.length)];
        if (pick === 'hp') {
          const healed = player.castle.heal(amount);
          this.emit('castleHealed', { playerId: player.id, amount: healed, hp: player.castle.hp });
        } else {
          this.changeMp(player, amount, 'card');
        }
        break;
      }

      case 'healAndArmor': {
        // トレント：城HPを回復し、城壁を置く（城壁の決まりは城壁のカードと同じ）
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        const healed = player.castle.heal(amount);
        if (healed > 0) this.emit('castleHealed', { playerId: player.id, amount: healed, hp: player.castle.hp });
        if (!this.armorFull(player, { amount: card.def.armor })) this.playSupport(player, { def: { kind: 'defense', effect: 'armorCastle', amount: card.def.armor } }, { playerId: player.id });
        break;
      }

      case 'stealCoins': {
        // ミミック：相手のコインを amount 枚まで奪う（持っている分だけ）
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        const taken = Math.min(amount, enemy.coins);
        this.changeCoins(enemy, -taken, 'stolen');
        this.changeCoins(player, taken, 'steal');
        break;
      }

      case 'damageEnemyAll': {
        // 魔王：相手の兵士全員（忍者を除く）に amount、そのあと相手の城に amount（城は防御を聞く）
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        if (this.rollMiss()) {
          this.emitMiss(player.id, 'spell', { type: card.type });
          break;
        }
        for (const soldier of [...enemy.visibleSoldiers]) {
          if (enemy.soldiers.includes(soldier)) this.damageSoldier(enemy, soldier, amount, 'spell', this.spellHit(player, card));
        }
        this.requestDefense(
          { kind: 'castle', defenderId: enemy.id, attackerId: player.id, amount, from: 'spell', spellType: card.type },
          () => this.damageCastle(enemy, amount, { kind: 'spell', type: card.type }),
          () => this.checkGameOver(),
        );
        break;
      }

      default:
        // Card.validateDefinitions で弾いているので、ここには来ない
        break;
    }
  }

  // ================= 精霊 =================
  // 1人1体まで。新しく呼ぶと入れ替わる（強すぎないように、1種類だけ選ぶ形）。
  // 呼んだターンは効かない。次の自分のターンから `turns` 回、効く。自分のターンの終わりに残りが1つ減り、0で消える。
  //   fire：自分のターンの始めに、選んだ相手の城に amount ダメージ（城壁は受ける）
  //   water：自分のターンの始めに、自分の城を amount 回復
  //   wind：自分の兵士の速さが、最低でも amount になる
  //   earth：自分の城と兵士が受けるダメージが amount 軽くなる（ただし1より小さくはならない）

  summonSpirit(player, card, target) {
    const def = card.def;
    if (player.spirit) this.emit('spiritEnded', { playerId: player.id, type: player.spirit.type, reason: 'replaced' });
    player.spirit = {
      type: card.type,
      spirit: def.spirit,
      amount: def.amount,
      turns: def.turns,
      targetId: def.spirit === 'fire' ? target.id : null,
      fresh: true, // 呼んだターンの終わりには減らさない
    };
    this.emit('spiritSummoned', {
      playerId: player.id, type: card.type, spirit: def.spirit, amount: def.amount, turns: def.turns, targetId: player.spirit.targetId,
    });
  }

  /** ターンの始め：火・水の精霊が効く。城が落ちて決着したら true */
  triggerSpirit(player) {
    const sp = player.spirit;
    if (!sp || sp.fresh) return false;
    if (sp.spirit === 'water') {
      const healed = player.castle.heal(sp.amount + this.weatherElementBonus('water'));
      if (healed > 0) {
        this.emit('spiritTriggered', { playerId: player.id, type: sp.type, spirit: 'water', amount: healed });
        this.emit('castleHealed', { playerId: player.id, amount: healed, hp: player.castle.hp });
      }
    } else if (sp.spirit === 'fire') {
      const foes = this.enemySides(player.id);
      const target = foes.find((p) => p.id === sp.targetId) ?? foes[0];
      if (!target) return false;
      const amount = sp.amount + this.weatherElementBonus('fire');
      this.emit('spiritTriggered', { playerId: player.id, type: sp.type, spirit: 'fire', amount, targetId: target.id });
      this.damageCastle(target, amount, { kind: 'spirit', type: sp.type });
      return this.checkGameOver();
    }
    return false;
  }

  /** 自分のターンの終わり：精霊の残りを1つ減らす。0で消える */
  tickSpirit(player) {
    const sp = player.spirit;
    if (!sp) return;
    if (sp.fresh) {
      sp.fresh = false;
      return;
    }
    sp.turns -= 1;
    if (sp.turns <= 0) {
      player.spirit = null;
      this.emit('spiritEnded', { playerId: player.id, type: sp.type, reason: 'expired' });
    }
  }

  /** 兵士 soldier の今の速さ（風の精霊は、最低でも amount にする） */
  speedOf(player, soldier) {
    const sp = player.spirit;
    const speed = sp && sp.spirit === 'wind' ? Math.max(soldier.speed, sp.amount) : soldier.speed;
    // 鈍足（泥・吹雪の反応）：この進軍は速さが下がる（最低1）
    return soldier.slowNow > 0 ? Math.max(1, speed - soldier.slowNow) : speed;
  }

  /** 土の精霊：owner が受けるダメージを軽くする（0のダメージはそのまま。1より小さくはならない） */
  reduceDamage(owner, amount) {
    const sp = owner.spirit;
    if (!sp || sp.spirit !== 'earth' || amount <= 0) return amount;
    return Math.max(1, amount - sp.amount);
  }

  /**
   * 神頼み：山の上の1枚をめくって、出せるならタダで出す（対象は出せる中からランダム）。
   * 出せなければ（神頼み自身・対象がないカード）、そのまま捨て札へ。
   */
  prayCard(player) {
    const pile = this.pileOf(player.id);
    if (pile.deck.length === 0) {
      pile.deck = this.shuffle(pile.discard);
      pile.discard = [];
      this.emit('deckShuffled', { deckCount: pile.deck.length, playerId: pile.owner });
    }
    const card = pile.deck.shift();
    if (!card) return;
    (card.isExhaust ? pile.exhausted : pile.discard).push(card);
    const { targets } = card.def.effect === 'randomEffect' ? { targets: [] } : this.listTargets(player, card);
    this.emit('cardPlayed', { playerId: player.id, cardId: card.cardId, type: card.type, free: true });
    if (targets.length === 0) return;
    const target = targets.length === 1 ? targets[0] : targets[Math.floor(this.rng() * targets.length)];
    this.applyCard(player, card, target);
  }

  /** 付加（武器）・防御・トラップのカードを使う */
  playSupport(player, card, target) {
    const def = card.def;
    if (def.kind === 'weapon' || def.effect === 'shieldSoldier') {
      const soldier = player.soldiers.find((x) => x.soldierId === target.soldierId);
      if (def.kind === 'weapon') {
        // 攻撃力は足し算（重ねるほど強くなる）。属性は上書き（最後の武器の属性。属性なしの武器なら属性が消える）
        soldier.weapon = card.type;
        soldier.weaponBonus += def.attackBonus;
        soldier.element = def.element ?? null;
        this.emit('weaponEquipped', {
          playerId: player.id, soldierId: soldier.soldierId, type: card.type, attack: soldier.attack, element: soldier.element,
        });
      } else {
        // 氷のステージ：盾が厚くなる
        const amount = def.amount + this.stageEffectBonus(def.effect);
        soldier.shield += amount;
        this.emit('shieldAdded', { playerId: player.id, soldierId: soldier.soldierId, amount, shield: soldier.shield });
      }
      return;
    }
    if (def.effect === 'armorCastle') {
      // armorMax があれば永続で足し算（上限まで）。なければ重ならない（今より多いときだけ出せる）
      player.armor = this.rules.armorMax ? Math.min(this.rules.armorMax, player.armor + def.amount) : def.amount;
      this.emit('castleArmored', { playerId: player.id, armor: player.armor });
      return;
    }
  }

  /** ターン終了。手札が上限を超えていたら phase "discard" にして、捨て終わるまで待つ */
  endTurn() {
    if (this.phase === 'ready') return fail('ゲームがまだ始まっていません');
    if (this.phase === 'gameOver') return fail('ゲームは終わっています');
    if (this.phase === 'discard') return fail('先に手札を捨ててください');
    if (this.phase === 'defend') return fail('相手が防御を選んでいます');
    if (this.phase === 'mulligan') return fail('最初の手札を選んでいるところです');

    const player = this.players[this.currentPlayer];
    // 溶岩のステージ：ターンの終わりの灼熱
    this.stageTurnEnd(player);
    const over = player.hand.length - player.maxHand;
    if (over > 0) {
      this.phase = 'discard';
      this.discardCount = over;
      this.emit('discardRequired', { playerId: player.id, count: over });
      return ok();
    }
    this.passTurn();
    return ok();
  }

  /**
   * 手札を捨てる（phase "discard" のときだけ）。
   * 捨てる必要がある枚数ちょうどを1回で渡す。捨て終わったら次の人のターンが始まる。
   * @param {string[]} cardIds
   */
  discard(cardIds) {
    if (this.phase !== 'discard') return fail('今は手札を捨てる場面ではありません');
    if (!Array.isArray(cardIds)) return fail('捨てるカードのIDを配列で渡してください');
    if (new Set(cardIds).size !== cardIds.length) return fail('同じカードが2回選ばれています');
    if (cardIds.length !== this.discardCount) {
      return fail(`${this.discardCount}枚選んでください（今は${cardIds.length}枚）`);
    }
    const player = this.players[this.currentPlayer];
    if (!cardIds.every((id) => player.findInHand(id))) return fail('手札にないカードが選ばれています');

    for (const id of cardIds) this.throwAway(player.id, player.takeFromHand(id), { used: false });
    this.discardCount = 0;
    this.emit('cardDiscarded', { playerId: player.id, cardIds: [...cardIds] });
    this.passTurn();
    return ok();
  }

  // ================= 防御（攻撃を受けたときの反応） =================
  // rules.defenseReaction が true のとき、攻撃が当たる前に、受ける人が防御カードを何枚でも出せる。
  //   城に着いた兵士・ファイアボールや隕石 → 城壁・土嚢（城を守る）
  //   サンダー・大雷 → 盾・大盾（当たる兵士に盾をつける）
  //   毒・凍結は、防御カードで防げないので聞かない
  // 出せるカードが手札になければ、止まらない。待つときは phase が "defend" になり、
  // defend() で防御カードを出す → passDefense() で受ける（出せるカードがなくなったら自動で受ける）。

  /** 攻撃 pending に対して、そのカードをどこに出せるか */
  defenseTargetsFor(pending, card) {
    const def = card.def;
    const defender = this.players[pending.defenderId];
    if (def.kind !== 'defense') return { targets: [], reason: '防御カードだけ出せます' };
    if (def.implemented === false) return { targets: [], reason: 'このカードの効果はまだありません' };
    if (pending.kind === 'castle') {
      if (def.effect === 'reflectSpell') {
        return pending.from === 'spell'
          ? { targets: [{ playerId: defender.id }], reason: '' }
          : { targets: [], reason: '反射は魔法にしか使えません' };
      }
      if (def.effect === 'nullifySoldier') {
        return pending.from === 'soldier'
          ? { targets: [{ playerId: defender.id }], reason: '' }
          : { targets: [], reason: '身代わりは城に着いた兵士にしか使えません' };
      }
      if (def.effect !== 'armorCastle') return { targets: [], reason: '城が攻められています。城を守るカードを出してください' };
      if (this.armorFull(defender, def)) return { targets: [], reason: this.rules.armorMax ? `城壁がもう上限（${this.rules.armorMax}）まで積んであります` : '同じか、より強い城壁がもう置いてあります' };
      return { targets: [{ playerId: defender.id }], reason: '' };
    }
    if (def.effect !== 'shieldSoldier') return { targets: [], reason: '兵士が攻められています。盾のカードを出してください' };
    const targets = defender.soldiers.filter((x) => pending.soldierIds.includes(x.soldierId)).map((x) => ({ soldierId: x.soldierId }));
    return { targets, reason: '守れる兵士がいません' };
  }

  /**
   * 攻撃が当たる前に、受ける人に防御を聞く。防御できるカードが手札になければ聞かずに apply() する。
   * 聞くとき（true を返す）は phase が "defend" になり、返事が来たら apply() → after() を呼ぶ。
   * @returns {boolean} 返事を待っているなら true（呼び出した側は、そこで止める）
   */
  requestDefense(spec, apply, after) {
    const defender = this.players[spec.defenderId];
    const pending = { ...spec, apply, after };
    const canDefend = this.rules.defenseReaction
      && !defender.eliminated
      && defender.hand.some((card) => this.defenseTargetsFor(pending, card).targets.length > 0);
    if (!canDefend) {
      apply();
      return false;
    }
    this.pending = pending;
    this.phase = 'defend';
    this.emit('defenseRequested', {
      defenderId: spec.defenderId,
      attackerId: spec.attackerId,
      kind: spec.kind,
      amount: spec.amount,
      ...(spec.soldierIds ? { soldierIds: [...spec.soldierIds] } : {}),
    });
    return true;
  }

  /** 防御を終えて、攻撃を当てる */
  resolveDefense() {
    const p = this.pending;
    this.pending = null;
    this.phase = 'main';
    this.emit('defenseEnded', { defenderId: p.defenderId });
    if (p.outcome === 'reflect') {
      // 魔法を、撃った人の城にそのまま返す（撃った人の城壁は先に受ける）
      this.emit('spellReflected', { defenderId: p.defenderId, attackerId: p.attackerId, amount: p.amount });
      this.damageCastle(this.players[p.attackerId], p.amount, { kind: 'spell', type: p.spellType });
    } else if (p.outcome === 'nullify') {
      this.emit('soldierDecoyed', { defenderId: p.defenderId, attackerId: p.attackerId, soldierId: p.soldierId });
      p.onNullify();
    } else {
      p.apply();
    }
    p.after?.();
  }

  /** 防御カードを今出せるか（読むだけ）。phase が "defend" のときだけ。出せる人は pending.defenderId */
  canDefend(cardId, target) {
    if (this.phase !== 'defend') return fail('今は防御する場面ではありません');
    const card = this.players[this.pending.defenderId].findInHand(cardId);
    if (!card) return fail('そのカードは手札にありません');
    const { targets, reason } = this.defenseTargetsFor(this.pending, card);
    if (targets.length === 0) return fail(reason);
    if (target === undefined || target === null) return targets.length === 1 ? ok() : { ok: true, needsTarget: true };
    const keys = (o) => Object.keys(o).filter((k) => o[k] !== undefined);
    const same = (a, b) => keys(a).length === keys(b).length && keys(b).every((k) => a[k] === b[k]);
    return typeof target === 'object' && targets.some((t) => same(t, target)) ? ok() : fail('そこには出せません');
  }

  /** 防御カードを出せる対象の一覧（読むだけ） */
  getDefenseTargets(cardId) {
    if (this.phase !== 'defend') return [];
    const card = this.players[this.pending.defenderId].findInHand(cardId);
    return card ? this.defenseTargetsFor(this.pending, card).targets.map((t) => ({ ...t })) : [];
  }

  /** 防御カードを出す（攻撃を受ける人が、何枚でも）。出せるカードがなくなったら、自動で攻撃を受ける */
  defend(cardId, target) {
    const check = this.canDefend(cardId, target);
    if (!check.ok) return check;
    if (check.needsTarget) return { ok: false, reason: '対象を選んでください', needsTarget: true };
    const defender = this.players[this.pending.defenderId];
    const card = defender.findInHand(cardId);
    const targets = this.defenseTargetsFor(this.pending, card).targets;
    const chosen = target ? targets.find((t) => Object.keys(target).every((k) => target[k] === undefined || t[k] === target[k])) : targets[0];

    defender.takeFromHand(cardId);
    this.throwAway(defender.id, card);
    this.emit('cardPlayed', { playerId: defender.id, cardId: card.cardId, type: card.type });
    if (card.def.effect === 'reflectSpell' || card.def.effect === 'nullifySoldier') {
      // 攻撃そのものを変えるカード：これで防御は終わり
      this.pending.outcome = card.def.effect === 'reflectSpell' ? 'reflect' : 'nullify';
      this.resolveDefense();
      return ok();
    }
    this.playSupport(defender, card, chosen);

    // まだ出せるカードがあれば待つ。なければ、そのまま攻撃を受ける
    const more = defender.hand.some((c) => this.defenseTargetsFor(this.pending, c).targets.length > 0);
    if (!more) this.resolveDefense();
    return ok();
  }

  /** 防御しないで（これ以上出さずに）攻撃を受ける */
  passDefense() {
    if (this.phase !== 'defend') return fail('今は防御する場面ではありません');
    this.resolveDefense();
    return ok();
  }

  passTurn() {
    const player = this.players[this.currentPlayer];
    player.playedThisTurn = false;
    player.soldiersPlayedThisTurn = 0;
    player.coinCardsPlayedThisTurn = 0;
    this.tickSpirit(player);
    this.tickReactionStatuses(player);
    this.beginTurn(this.nextPlayerAfter(this.currentPlayer));
  }

  /**
   * 城HPが0以下の人がいたら、勝利条件（rules.winCondition）に従って決着させる。決着したら true
   *   firstDestroy：城を落とした人（＝手番の人）の勝ち
   *   lastStanding：城が落ちた人は抜ける。残りが1人になったら、その人の勝ち
   */
  checkGameOver() {
    if (this.phase === 'gameOver') return true;
    const fallen = this.alivePlayerIds().filter((id) => this.players[id].castle.isDestroyed);
    if (fallen.length === 0) return false;
    if (this.rules.winCondition === 'firstDestroy') {
      // 手番の人の城が残っていれば手番の人の勝ち。魔物に手番の人の城が落とされたら、
      // 席順で手番の人の次から数えて、城が残っている最初の人の勝ち（2人なら相手）。
      // 3人以上で魔物が城を落としたときの扱いは STEP 5 で遊んでから決める（今は仮）
      const standing = (id) => !this.players[id].castle.isDestroyed;
      if (standing(this.currentPlayer)) {
        this.finish(this.currentPlayer, 'castleDestroyed');
      } else {
        const order = this.alivePlayerIds();
        const start = order.indexOf(this.currentPlayer);
        const next = [...order.slice(start + 1), ...order.slice(0, start)].find(standing);
        this.finish(next, 'castleDestroyed');
      }
      return true;
    }
    for (const id of fallen) this.eliminate(this.players[id], this.currentPlayer);
    const alive = this.alivePlayerIds();
    if (this.aliveSides().length <= 1) {
      // 残った陣地の勝ち（チーム戦なら、手番の人が残っていれば手番の人、そうでなければいちばん前の席の人）
      this.finish(alive.includes(this.currentPlayer) ? this.currentPlayer : alive[0] ?? this.currentPlayer, 'lastStanding');
      return true;
    }
    return false;
  }

  /**
   * 降参する。2人のときだけ使える（3人以上の降参は、まだ決めていない）。相手の勝ちで、すぐ終わる。
   * 自分の番でなくても使える（オンラインで、相手の番を待たずに終われるように）。
   * @param {string} playerId 降参する人
   */
  surrender(playerId) {
    if (this.phase === 'gameOver') return fail('ゲームは終わっています');
    if (this.phase === 'ready') return fail('まだゲームが始まっていません');
    const alive = this.alivePlayerIds();
    if (!alive.includes(playerId)) return fail('そのプレイヤーはいません');
    const mine = this.side(playerId);
    // 城が2つ（2人・2チーム）のときは、相手の勝ちですぐ終わる
    if (this.aliveSides().length <= 2) {
      this.finish(alive.find((id) => this.side(id) !== mine), 'surrender');
      return { ok: true };
    }
    // 3つ以上のときは、降参した人（チーム戦ならチーム全員）の城が壊れて抜け、残りの試合を見守る
    if (this.phase === 'defend') this.passDefense(); // 防御待ちだったら、先に攻撃を済ませる
    if (this.phase === 'gameOver') return { ok: true };
    const wasTurn = this.side(this.currentPlayer) === mine && this.phase !== 'mulligan';
    const members = alive.filter((id) => this.side(id) === mine);
    const castle = this.players[mine].castle;
    const lost = castle.hp;
    castle.takeDamage(lost);
    this.emit('castleDamaged', { playerId: mine, amount: lost, blocked: 0, hp: 0, source: { kind: 'surrender' } });
    for (const id of members) this.eliminate(this.players[id], playerId);
    if (this.aliveSides().length <= 1) {
      const left = this.alivePlayerIds();
      this.finish(left[0] ?? playerId, 'lastStanding');
      return { ok: true };
    }
    // マリガン中なら、降参した人は選ばなくてよい。残りが全員選び終わっていれば、先攻（から数えて残っている人）のターン1を始める
    if (this.phase === 'mulligan') {
      for (const id of members) this.mulliganPending.delete(id);
      if (this.mulliganPending.size === 0) this.beginTurn(this.roundLeader());
      return { ok: true };
    }
    // 降参した人の番だったら、次の人の番にする
    if (wasTurn) {
      this.pending = null;
      this.discardCount = 0;
      this.beginTurn(this.nextPlayerAfter(this.currentPlayer));
    }
    return { ok: true };
  }

  finish(winner, reason) {
    this.winner = winner;
    this.winnerTeam = this.teamOf?.get(winner) ?? null;
    this.pending = null;
    this.phase = 'gameOver';
    // チーム戦のときだけ、勝ったチーム（winnerTeam）を付ける
    this.emit('gameOver', { winner, reason, ...(this.teamOf ? { winnerTeam: this.winnerTeam } : {}) });
  }

  /** 城が落ちた人を抜けさせる（lastStanding）。兵士は消え、手札は捨て札へ。道をつなぎ直す */
  eliminate(player, by) {
    player.eliminated = true;
    this.emit('playerEliminated', { playerId: player.id, by });
    for (const s of [...player.soldiers]) this.removeSoldier(player, s, 'eliminated');
    for (const c of player.hand) this.throwAway(player.id, c, { used: false });
    player.hand = [];
    const { opened, closed } = this.rebuildRoads();
    for (const road of closed) {
      const monsterIds = this.monsters.filter((m) => m.roadId === road.roadId).map((m) => m.monsterId);
      this.monsters = this.monsters.filter((m) => m.roadId !== road.roadId);
      this.emit('roadClosed', { roadId: road.roadId, monsterIds });
      for (const id of this.alivePlayerIds()) {
        const p = this.players[id];
        for (const s of p.soldiers.filter((x) => x.roadId === road.roadId)) this.removeSoldier(p, s, 'roadClosed');
      }
    }
    for (const road of opened) this.emit('roadOpened', { roadId: road.roadId, players: [...road.players] });
  }

  /** 周回の上限：城HPの割合 → 城HP → 席順が後ろ、の順にいちばんの人の勝ち */
  finishByRoundLimit() {
    const alive = this.alivePlayerIds().map((id) => this.players[id]);
    const seat = (p) => this.playerOrder.indexOf(p.id);
    alive.sort((a, b) => {
      const ra = a.castle.hp / a.castle.maxHp;
      const rb = b.castle.hp / b.castle.maxHp;
      if (ra !== rb) return rb - ra;
      if (a.castle.hp !== b.castle.hp) return b.castle.hp - a.castle.hp;
      return seat(b) - seat(a);
    });
    this.finish(alive[0].id, 'roundLimit');
  }

  // ================= 状態 =================

  /**
   * 今の状態をただのオブジェクトで返す。viewerId の手札は中身まで、相手の手札は枚数だけ。
   * @param {string|null} viewerId "p1"〜"p8"（それ以外なら全員の手札が null）
   */
  getState(viewerId) {
    const players = {};
    const own = this.rules.deckMode !== 'shared'; // 1人1つの山札（own・cost）
    for (const id of this.playerOrder) {
      const p = this.players[id];
      const pile = this.pileOf(id);
      const base = p.toState(id === viewerId);
      // 忍者（見えない兵士）は、味方（同じ陣地）にしか見せない
      if (!viewerId || !this.players[viewerId] || this.side(viewerId) !== this.side(id)) {
        base.soldiers = base.soldiers.filter((st) => !p.soldiers.find((x) => x.soldierId === st.soldierId)?.stealth);
      }
      // 広場のとき、兵士がいる場所（どの城の道か・広場か）。となりの道のときは null
      for (const st of base.soldiers) {
        const soldier = p.soldiers.find((x) => x.soldierId === st.soldierId);
        st.place = this.plaza ? this.placeOf(id, soldier) : null;
      }
      players[id] = {
        ...base,
        team: this.teamOf?.get(id) ?? null,
        castleOwner: this.side(id),
        // 背水の陣（城を共有するチームは同じ値）
        overdrive: this.overdrive.has(this.side(id)),
        castleType: p.castleType,
        maxHand: p.maxHand,
        deckId: p.deckId ?? null,
        deckCount: own ? pile.deck.length : null,
        discardCount: own ? pile.discard.length : null,
        exhaustedCount: own ? pile.exhausted.length : null,
        // 強化の今の値段（costs で買うたびに上がる強化があるので、人ごと）
        upgradeCosts: Object.fromEntries(Object.keys(this.upgradeDefs).map((u) => [u, this.upgradeCostOf(p, u)])),
      };
    }
    // いちばん上の山札の数：shared は共通の山札、own は viewer 本人の山札（viewer がいなければ null）
    const topPile = own ? (this.piles.has(viewerId) ? this.pileOf(viewerId) : null) : this.pileOf(this.playerOrder[0]);
    return {
      deckMode: this.rules.deckMode,
      // 四大陣営：選んだ陣営のID（陣営モードでなければ null）
      faction: this.faction,
      maxMp: this.rules.maxMp,
      // MP を使うカードの種類 → 必要な MP（UI が手札に表示する）
      mpCosts: Object.fromEntries(Object.entries(this.cardDefs).map(([t, d]) => [t, this.mpCostOf({ def: d })]).filter(([, c]) => c > 0)),
      layout: this.plaza ? 'plaza' : 'lanes',
      // チーム戦のとき { t1: { members, castleOwner, size } … }（チームの順）。チーム戦でなければ null
      teams: this.teamOrder
        ? Object.fromEntries(this.teamOrder.map((t) => [t, { members: [...this.teamMembers.get(t)], castleOwner: this.teamMembers.get(t)[0], size: this.teamMembers.get(t).length }]))
        : null,
      winnerTeam: this.winnerTeam,
      playerOrder: [...this.playerOrder],
      // 先攻（コイントスで決まった人）と、マリガンで引き直しをまだ選んでいない人（phase "mulligan" のときだけ）
      firstPlayer: this.firstPlayer,
      mulligan: this.phase === 'mulligan' ? { pending: this.playerOrder.filter((id) => this.mulliganPending.has(id)) } : null,
      round: this.round,
      weather: this.weather ? { type: this.weather.type, name: this.weatherDef().name, icon: this.weatherDef().icon ?? null, description: this.weatherDef().description ?? null, roundsLeft: this.weather.roundsLeft } : null,
      weatherEnabled: Boolean(this.weatherDefs),
      // ステージ（stages を渡さなければ null）
      stage: this.stage ? (({ name, icon, description, element, elementMultiplier }) => ({ id: this.stage, name, icon: icon ?? null, description: description ?? null, element: element ?? null, elementMultiplier: elementMultiplier ?? null }))(this.stageDef()) : null,
      // 昼と夜："day" か "night"。夜なら nightRoundsLeft に残りの周回
      time: this.night ? 'night' : 'day',
      nightRoundsLeft: this.night ? this.night.roundsLeft : 0,
      monsters: this.monsters.map((m) => m.toState()),
      roads: this.roads.map((r) => r.toState()),
      turn: this.turn,
      currentPlayer: this.currentPlayer,
      phase: this.phase,
      winner: this.winner,
      defense: this.pending
        ? {
            defenderId: this.pending.defenderId,
            attackerId: this.pending.attackerId,
            kind: this.pending.kind,
            amount: this.pending.amount,
            soldierIds: this.pending.soldierIds ? [...this.pending.soldierIds] : [],
          }
        : null,
      deckCount: topPile ? topPile.deck.length : null,
      discardCount: topPile ? topPile.discard.length : null,
      exhaustedCount: topPile ? topPile.exhausted.length : null,
      players,
    };
  }

  // ================= デバッグ用（?debug=1 の画面から呼ぶ） =================
  // どれもイベントは出さない。呼んだあとは getState() を読み直して画面を描き直す。
  // start() の前に呼べば、開始時の状態を作れる。

  /** 城HPを変える（1〜その城の上限） */
  debugSetCastleHp(playerId, hp) {
    if (!this.players[playerId]) return fail('そのプレイヤーはいません');
    if (this.phase === 'gameOver') return fail('ゲームは終わっています');
    const max = this.players[playerId].castle.maxHp;
    if (!Number.isInteger(hp) || hp < 1 || hp > max) return fail(`HPは1〜${max}の整数にしてください`);
    this.players[playerId].castle.hp = hp;
    // 背水の陣も合わせる（デバッグなのでイベントは出さない）
    const side = this.side(playerId);
    const line = this.overdriveLine(this.players[side]);
    if (line >= 0 && this.players[side].castle.hp <= line) this.overdrive.add(side);
    else this.overdrive.delete(side);
    return ok();
  }

  /** 手札をカード種類の並びで作り直す（例: ["infantry", "fireball"]）。カードIDは新しく振る */
  debugSetHand(playerId, types) {
    if (!this.players[playerId]) return fail('そのプレイヤーはいません');
    if (this.phase === 'discard') return fail('手札を捨てている途中は変えられません');
    const bad = this.findUnknownType(types);
    if (bad !== null) return fail(bad);
    this.players[playerId].hand = types.map((type) => this.createCard(type));
    return ok();
  }

  /** 山札をカード種類の並びで作り直す。配列の先頭から順に引かれる。カードIDは新しく振る */
  debugSetDeck(types, playerId) {
    const bad = this.findUnknownType(types);
    if (bad !== null) return fail(bad);
    // deckMode "own" のときは playerId の山札（省略すると手番の人）
    const owner = playerId ?? this.currentPlayer;
    if (!this.piles.has(owner)) return fail('そのプレイヤーはいません');
    this.pileOf(owner).deck = types.map((type) => this.createCard(type));
    return ok();
  }

  findUnknownType(types) {
    if (!Array.isArray(types)) return 'カード種類を配列で渡してください';
    const unknown = types.find((t) => !Object.hasOwn(this.cardDefs, t));
    return unknown === undefined ? null : `"${unknown}" というカードはありません`;
  }
}
