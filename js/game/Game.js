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

import { Card, ELEMENTS } from './Card.js';
import { Monster, validateUpgrades } from './Monster.js';
import { Pile, validateCastles, validateDecks } from './Setup.js';
import { Soldier } from './Soldier.js';
import { Player } from './Player.js';
import { Road } from './Road.js';

/** 2人のときのプレイヤーID（人数を変えられるようになるまでは、いつもこの2人） */
export const PLAYER_IDS = ['p1', 'p2'];

/** Game が出すイベントの名前（CLAUDE.md「Gameが出すイベント」の表と同じ） */
export const EVENT_TYPES = [
  'turnStarted',
  'cardDrawn',
  'deckShuffled',
  'cardPlayed',
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
  'trapSet',
  'trapTriggered',
  'statusApplied',
  'statusCleared',
  'roundStarted',
  'monsterAppeared',
  'monsterAttackedCastle',
  'monsterClashed',
  'monsterDamaged',
  'monsterDefeated',
  'coinsChanged',
  'upgradeBought',
  'soldierBuffed',
  'playerEliminated',
  'roadClosed',
  'roadOpened',
  'gameOver',
];

/** 属性の強い・弱い：キーの属性は、値の属性に強い（水は火に強い、火は木に強い、木は水に強い） */
export const ELEMENT_BEATS = { water: 'fire', fire: 'wood', wood: 'water' };

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
  elementBonus: 0, // 属性が強いときに増えるダメージ
  trapMaxPosition: 1, // トラップを置ける、自分の城から数えた位置の上限
  drawPerCardUsed: 0, // 次のターンに引く枚数 = max(drawPerTurn, 使った枚数 × これ)
  monsterFirstRound: 3, // 魔物が出はじめる周回
  monsterCooldownRounds: 0, // 魔物を倒した道に、次の魔物が出ない周回の数
  maxRounds: 0, // 周回の上限（0 なら上限なし）
};
/** 文字列で選ぶ項目と、選べる値（最初の値が省略したときの値） */
const CHOICE_RULES = {
  winCondition: ['firstDestroy', 'lastStanding'],
  castleSpellRange: ['any', 'neighbors'],
  deckMode: ['shared', 'own'],
};
/** 0以上1以下の数（整数でなくてよい）の省略できる項目 */
const OPTIONAL_RATE_RULES = {
  monsterSpawnChance: 0, // 周回の始めに、魔物がいない道ごとに魔物が出る確率
};

const ok = () => ({ ok: true });
const fail = (reason) => ({ ok: false, reason });

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
  constructor({ cards, rules, rng = Math.random, monsters = null, upgrades = null, castles = null, decks = null, setup = {} } = {}) {
    Card.validateDefinitions(cards);
    Game.validateRules(rules);
    if (typeof rng !== 'function') throw new Error('rng は 0以上1未満の数を返す関数にしてください');
    if (monsters !== null) {
      Monster.validateDefinitions(monsters, ELEMENTS);
      if (rules.laneLength % 2 === 0) throw new Error('魔物を使うときは、真ん中のマスがひとつに決まるよう rules.json の laneLength を奇数にしてください');
    }
    if (upgrades !== null) validateUpgrades(upgrades);
    if (castles !== null) validateCastles(castles);
    if (decks !== null) validateDecks(decks, cards);

    this.cardDefs = cards;
    this.monsterDefs = monsters;
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

    this.nextCardNumber = 1;
    this.nextSoldierNumber = 1;
    this.nextTrapNumber = 1;
    this.nextMonsterNumber = 1;
    /** @type {Monster[]} */
    this.monsters = [];
    /** 道ID → この周回より前には魔物が出ない */
    this.monsterCooldown = new Map();
    this.round = 0;
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
      const player = new Player(id, maxHp, this.rules.drawPerTurn);
      player.castleType = castleType;
      player.castleDef = cdef;
      player.maxHand = Math.max(0, this.rules.maxHand + (cdef.maxHandBonus ?? 0));
      this.players[id] = player;
    });
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
    } else {
      const pile = new Pile(null);
      pile.deck = this.shuffle(this.buildDeckTypes()).map((type) => this.createCard(type));
      for (const id of this.playerOrder) this.piles.set(id, pile);
    }

    this.turn = 0;
    this.currentPlayer = this.playerOrder[0];
    this.phase = 'ready';
    this.winner = null;
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
    for (const key of Object.keys(OPTIONAL_RULES)) {
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
    for (const key of Object.keys(OPTIONAL_RATE_RULES)) {
      const v = rules[key];
      if (v !== undefined && (typeof v !== 'number' || !(v >= 0 && v <= 1))) {
        throw new Error(`rules.json の ${key} は 0 以上 1 以下の数にしてください`);
      }
    }
    if (Number.isInteger(rules.laneLength) && (rules.trapMaxPosition ?? OPTIONAL_RULES.trapMaxPosition) >= Math.floor(rules.laneLength / 2)) {
      throw new Error('rules.json の trapMaxPosition は、真ん中のマスより手前（laneLength の半分より小さい）にしてください');
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
    for (const handler of [...this.listeners.get(type)]) {
      try {
        handler(payload);
      } catch (err) {
        // 画面側のエラーでゲームの状態が途中で止まらないようにする
        console.error(`イベント "${type}" の処理中にエラー:`, err);
      }
    }
  }

  // ================= 山札 =================

  createCard(type) {
    const cardId = `c${String(this.nextCardNumber++).padStart(2, '0')}`;
    return new Card(cardId, type, this.cardDefs[type]);
  }

  /** 山札に入るカード種類の並び（count 枚ずつ） */
  buildDeckTypes() {
    const types = [];
    for (const [type, def] of Object.entries(this.cardDefs)) {
      for (let i = 0; i < def.count; i++) types.push(type);
    }
    return types;
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
    return this.alivePlayerIds().filter((id) => id !== playerId).map((id) => this.players[id]);
  }

  /** playerId と道でつながっている相手（となりの席） */
  neighborsOf(playerId) {
    return this.roads.filter((r) => r.has(playerId)).map((r) => this.players[r.otherSide(playerId)]);
  }

  /** 2人の間の道（なければ null） */
  roadBetween(a, b) {
    return this.roads.find((r) => r.has(a) && r.has(b)) || null;
  }

  findRoad(roadId) {
    return this.roads.find((r) => r.roadId === roadId) || null;
  }

  /**
   * まだ負けていない人を輪にならべ、となりどうしを道でつなぐ。2人なら1本。今ある道はそのまま残す。
   * 負けた人が出たときの呼び出し（なくなった道の兵士を消す処理を含む）は STEP 5 で入れる。今は new Game() からだけ呼ぶ。
   * @returns {{opened: Road[], closed: Road[]}}
   */
  rebuildRoads() {
    const alive = this.alivePlayerIds();
    const pairs = [];
    if (alive.length === 2) pairs.push([alive[0], alive[1]]);
    else if (alive.length > 2) {
      for (let i = 0; i < alive.length; i++) {
        const a = alive[i];
        const b = alive[(i + 1) % alive.length];
        // 道のIDは席順が前の人を先に
        pairs.push(this.playerOrder.indexOf(a) < this.playerOrder.indexOf(b) ? [a, b] : [b, a]);
      }
    }
    const opened = [];
    const next = pairs.map(([a, b]) => {
      const existing = this.roads.find((r) => r.players[0] === a && r.players[1] === b);
      if (existing) return existing;
      const road = new Road(a, b, this.rules.laneLength);
      opened.push(road);
      return road;
    });
    const closed = this.roads.filter((r) => !next.includes(r));
    this.roads = next;
    return { opened, closed };
  }

  /** 席順で次の手番の人（負けた人は飛ばす） */
  nextPlayerAfter(playerId) {
    const n = this.playerOrder.length;
    const start = this.playerOrder.indexOf(playerId);
    for (let i = 1; i <= n; i++) {
      const id = this.playerOrder[(start + i) % n];
      if (!this.players[id].eliminated) return id;
    }
    return playerId;
  }

  // ================= ターン進行 =================

  /** ゲームを始める（席順の最初の人のターン1）。UI が on() で購読してから呼ぶ */
  start() {
    if (this.phase !== 'ready') return fail('ゲームはもう始まっています');
    this.beginTurn(this.playerOrder[0]);
    return ok();
  }

  /** ターン開始：（城壁が消える）→ ドロー → 進軍 → メインへ */
  beginTurn(playerId) {
    // 周回の上限：その周回を全員が終えたら、城HPの割合で決着
    const isRoundStart = playerId === this.alivePlayerIds()[0];
    if (isRoundStart && this.rules.maxRounds > 0 && this.round >= this.rules.maxRounds) {
      this.finishByRoundLimit();
      return;
    }
    const player = this.players[playerId];
    this.currentPlayer = playerId;
    this.turn += 1;
    this.phase = 'main';
    player.playedThisTurn = false;
    player.cardsPlayedThisTurn = 0;
    this.emit('turnStarted', { playerId, turn: this.turn });

    // 周回の始め（席順の最初の人のターン）：魔物が城を攻める → 魔物が出る
    if (playerId === this.alivePlayerIds()[0]) {
      this.round += 1;
      this.emit('roundStarted', { round: this.round });
      this.monstersAttackCastles();
      this.spawnMonsters();
    }

    // 城壁は、自分の次のターンの始めに消える
    if (player.armor > 0) {
      player.armor = 0;
      this.emit('armorExpired', { playerId });
    }

    // 1. ドロー（先攻の最初のターンだけ firstTurnDraw 枚。ほかは前のターンに決まった drawNextTurn 枚）
    const drawCount = this.turn === 1 ? this.rules.firstTurnDraw : player.drawNextTurn;
    this.drawCards(player, drawCount);

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
  advanceSoldiers(player) {
    const { laneLength } = this.rules;

    for (const soldier of [...player.soldiers]) {
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
        soldier.poison.turns -= 1;
        if (soldier.isDead) {
          this.removeSoldier(player, soldier, 'killed');
          continue;
        }
        if (soldier.poison.turns <= 0) {
          soldier.poison = null;
          this.emit('statusCleared', { playerId: player.id, soldierId: soldier.soldierId, status: 'poison' });
        }
      }
      // 凍結：この進軍は休む
      if (soldier.frozen > 0) {
        soldier.frozen -= 1;
        if (soldier.frozen === 0) {
          this.emit('statusCleared', { playerId: player.id, soldierId: soldier.soldierId, status: 'frozen' });
        }
        continue;
      }

      const from = soldier.position;
      let opponent = this.findClashTarget(soldier, enemy);
      let monster = opponent ? null : this.findMonsterInRange(soldier, player);
      let trap = null;
      let steps = 0;
      while (!opponent && !monster && steps < soldier.speed) {
        soldier.moveForward();
        steps += 1;
        if (soldier.hasReachedCastle(laneLength)) break;
        trap = this.findTrap(soldier, player, enemy);
        if (trap) break;
        opponent = this.findClashTarget(soldier, enemy);
        if (!opponent) monster = this.findMonsterInRange(soldier, player);
      }

      const reached = soldier.hasReachedCastle(laneLength);
      if (steps > 0) {
        // 城に着いた兵士は城の位置（laneLength）まで動いたことにする
        this.emit('soldierMoved', {
          playerId: player.id,
          soldierId: soldier.soldierId,
          roadId: road.roadId,
          from,
          to: reached ? laneLength : soldier.position,
        });
      }

      if (trap) {
        this.triggerTrap(enemy, trap, player, soldier);
        continue;
      }
      if (opponent) {
        this.fight(player, soldier, enemy, opponent);
        continue;
      }
      if (monster) {
        this.fightMonster(player, soldier, monster);
        continue;
      }
      if (!reached) continue;

      this.damageCastle(enemy, soldier.attack, { kind: 'soldier', soldierId: soldier.soldierId });
      player.removeSoldier(soldier.soldierId);
      this.emit('soldierDestroyed', {
        playerId: player.id,
        soldierId: soldier.soldierId,
        reason: 'reachedCastle',
      });

      // 城が落ちた瞬間にゲームを止める（残りの兵士は動かさない）
      if (this.checkGameOver()) return;
    }
  }

  /** 城にダメージ。城壁が先に受ける。castleDamaged を出す */
  damageCastle(owner, amount, source) {
    const blocked = Math.min(owner.armor, amount);
    owner.armor -= blocked;
    owner.castle.takeDamage(amount - blocked);
    this.emit('castleDamaged', { playerId: owner.id, amount, blocked, hp: owner.castle.hp, source });
  }

  /** 兵士にダメージ（盾が先に受ける）。soldierDamaged を出し、HPが0なら消す。消えたら true */
  damageSoldier(owner, soldier, amount, cause) {
    const blocked = soldier.takeDamage(amount);
    this.emit('soldierDamaged', {
      playerId: owner.id, soldierId: soldier.soldierId, amount, hp: soldier.hp, cause, blocked,
    });
    if (!soldier.isDead) return false;
    this.removeSoldier(owner, soldier, 'killed');
    return true;
  }

  removeSoldier(owner, soldier, reason) {
    owner.removeSoldier(soldier.soldierId);
    this.emit('soldierDestroyed', { playerId: owner.id, soldierId: soldier.soldierId, reason });
  }

  /** owner の兵士 soldier が今いるマスに、trapOwner のトラップがあれば返す */
  findTrap(soldier, owner, trapOwner) {
    const road = this.findRoad(soldier.roadId);
    const square = road.toSquare(owner.id, soldier.position);
    return trapOwner.traps.find((t) => t.roadId === road.roadId && t.square === square) || null;
  }

  triggerTrap(trapOwner, trap, victimOwner, soldier) {
    trapOwner.traps = trapOwner.traps.filter((t) => t !== trap);
    this.emit('trapTriggered', {
      playerId: trapOwner.id,
      trapId: trap.trapId,
      type: trap.type,
      soldierId: soldier.soldierId,
      roadId: trap.roadId,
      square: trap.square,
    });
    const def = this.cardDefs[trap.type];
    if (def.effect === 'pit') this.damageSoldier(victimOwner, soldier, def.amount, 'trap');
  }

  /**
   * soldier の「同じマスか1つ先のマス」にいる相手の兵士（同じ道の上だけ）のうち、先に出された1体（いなければ null）。
   * enemy.soldiers は出した順に並んでいるので、最初に見つかったものが先に出された兵士。
   */
  findClashTarget(soldier, enemy) {
    const { laneLength } = this.rules;
    const here = soldier.position;
    return (
      enemy.soldiers.find((e) => {
        if (e.roadId !== soldier.roadId) return false;
        const q = laneLength - 1 - e.position; // 相手の兵士の位置を、soldier から数えた位置に直す
        return q === here || q === here + 1;
      }) || null
    );
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
        if (m.roadId !== road.roadId) return false;
        const q = road.toPosition(owner.id, m.square);
        return q === soldier.position || q === soldier.position + 1;
      }) || null
    );
  }

  findMonster(monsterId) {
    return this.monsters.find((m) => m.monsterId === monsterId) || null;
  }

  /** 周回の始め：attackIn が0になった魔物が、道の両はしのどちらかの城を攻める（城HPは1より下がらない） */
  monstersAttackCastles() {
    for (const m of [...this.monsters]) {
      m.attackIn -= 1;
      if (m.attackIn > 0) continue;
      m.attackIn = m.def.attackEvery;
      const road = this.findRoad(m.roadId);
      const victim = this.players[road.players[Math.floor(this.rng() * 2)]];
      const before = victim.castle.hp;
      victim.castle.hp = Math.max(Math.min(1, before), before - m.def.castleAttack);
      this.emit('monsterAttackedCastle', {
        monsterId: m.monsterId, playerId: victim.id, amount: before - victim.castle.hp, hp: victim.castle.hp,
      });
    }
  }

  /** 周回の始め：魔物がいない道ごとに、monsterSpawnChance の確率で1体出る */
  spawnMonsters() {
    if (!this.monsterDefs || this.round < this.rules.monsterFirstRound || this.rules.monsterSpawnChance === 0) return;
    const types = Object.keys(this.monsterDefs);
    if (types.length === 0) return;
    for (const road of this.roads) {
      if (this.monsters.some((m) => m.roadId === road.roadId)) continue;
      // 魔物を倒した道には、しばらく出ない（魔物が道をふさぎ続けないように）
      if ((this.monsterCooldown.get(road.roadId) ?? 0) > this.round) continue;
      if (this.rng() >= this.rules.monsterSpawnChance) continue;
      const total = types.reduce((a, t) => a + this.monsterDefs[t].weight, 0);
      let r = this.rng() * total;
      const type = types.find((t) => (r -= this.monsterDefs[t].weight) < 0) ?? types.at(-1);
      const monsterId = `m${String(this.nextMonsterNumber++).padStart(2, '0')}`;
      const m = new Monster(monsterId, type, this.monsterDefs[type], road.roadId, this.middleSquare());
      this.monsters.push(m);
      this.emit('monsterAppeared', {
        monsterId, type, roadId: road.roadId, square: m.square, hp: m.hp, attack: m.attack, element: m.element,
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
    this.monsterCooldown.set(monster.roadId, this.round + this.rules.monsterCooldownRounds + 1);
    const reward = monster.def.reward;
    this.emit('monsterDefeated', { monsterId: monster.monsterId, playerId, reward });
    this.changeCoins(this.players[playerId], reward, 'reward');
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
      square: road.toSquare(player.id, soldier.position),
    });
    const toMonster = this.fightDamage(soldier, monster);
    const toSoldier = this.fightDamage(monster, soldier);
    this.damageMonster(monster, toMonster, { playerId: player.id, soldierId: soldier.soldierId });
    const blocked = soldier.takeDamage(toSoldier);
    this.emit('soldierDamaged', {
      playerId: player.id, soldierId: soldier.soldierId, amount: toSoldier, hp: soldier.hp, cause: 'fight', blocked,
    });
    this.defeatMonsterIfDead(monster, player.id);
    if (soldier.isDead) this.removeSoldier(player, soldier, 'killed');
  }

  // ================= コインと強化 =================

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
    if (player.coins < def.cost) return fail(`コインが足りません（あと${def.cost - player.coins}枚）`);
    if (def.effect === 'repairCastle' && player.castle.isFull) return fail('城のHPが満タンです');
    const pile = this.pileOf(player.id);
    if (def.effect === 'drawCards' && pile.deck.length + pile.discard.length === 0) return fail('山札も捨て札もありません');
    if (def.effect === 'sharpenSoldiers' && player.soldiers.length === 0) return fail('道の上に自分の兵士がいません');
    return ok();
  }

  /** 強化を買う（自分のメインの場面で、何回でも） */
  buyUpgrade(upgradeId) {
    const check = this.canBuyUpgrade(upgradeId);
    if (!check.ok) return check;
    const def = this.upgradeDefs[upgradeId];
    const player = this.players[this.currentPlayer];
    player.upgradesBought[upgradeId] = (player.upgradesBought[upgradeId] ?? 0) + 1;
    this.changeCoins(player, -def.cost, 'upgrade');
    this.emit('upgradeBought', { playerId: player.id, upgradeId, cost: def.cost });
    if (def.effect === 'repairCastle') {
      const healed = player.castle.heal(def.amount);
      this.emit('castleHealed', { playerId: player.id, amount: healed, hp: player.castle.hp });
    } else if (def.effect === 'drawCards') {
      this.drawCards(player, def.amount);
    } else if (def.effect === 'sharpenSoldiers') {
      for (const s of player.soldiers) {
        s.baseAttack += def.amount;
        this.emit('soldierBuffed', { playerId: player.id, soldierId: s.soldierId, attack: s.attack });
      }
    }
    return ok();
  }

  /** a が b に与えるダメージ（攻撃力 ＋ 属性が強ければ elementBonus） */
  fightDamage(a, b) {
    const strong = a.element && b.element && ELEMENT_BEATS[a.element] === b.element;
    return a.attack + (strong ? this.rules.elementBonus : 0);
  }

  /** 進軍中の attacker と、相手の defender が戦う。お互いに攻撃力ぶんのダメージを同時に与える */
  fight(player, attacker, enemy, defender) {
    const road = this.findRoad(attacker.roadId);
    this.emit('soldiersClashed', {
      attacker: { playerId: player.id, soldierId: attacker.soldierId },
      defender: { playerId: enemy.id, soldierId: defender.soldierId },
      roadId: road.roadId,
      square: road.toSquare(player.id, attacker.position), // 攻める側が止まったマス
    });

    const toDefender = this.fightDamage(attacker, defender);
    const toAttacker = this.fightDamage(defender, attacker);
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
      case 'soldier':
        return { targets: playerTargets(this.neighborsOf(player.id)), reason: '兵士を送れる相手がいません' };
      case 'weapon': {
        // 同じ武器をもう一度持たせても何も起きないので、その兵士は対象にしない
        const targets = player.soldiers.filter((x) => x.weapon !== card.type).map((x) => ({ soldierId: x.soldierId }));
        return { targets, reason: player.soldiers.length ? 'もう同じ武器を持っています' : '道の上に自分の兵士がいません' };
      }
      case 'trap': {
        const targets = [];
        for (const road of this.roads.filter((r) => r.has(player.id))) {
          for (let pos = 0; pos <= Math.min(this.rules.trapMaxPosition, this.rules.laneLength - 1); pos++) {
            const square = road.toSquare(player.id, pos);
            if (!player.traps.some((t) => t.roadId === road.roadId && t.square === square)) {
              targets.push({ roadId: road.roadId, square });
            }
          }
        }
        return { targets, reason: 'トラップを置ける場所がありません' };
      }
      default:
        break;
    }
    const hasSoldiers = (p) => p.soldiers.length > 0;
    switch (def.effect) {
      case 'damageEnemyCastle':
        return {
          targets: [
            ...playerTargets(this.rules.castleSpellRange === 'neighbors' ? this.neighborsOf(player.id) : this.opponentsOf(player.id)),
            // 魔物は、自分の道（自分が両はしのどちらか）にいるものだけ
            ...this.monsters.filter((m) => this.findRoad(m.roadId).has(player.id)).map((m) => ({ monsterId: m.monsterId })),
          ],
          reason: '相手がいません',
        };
      case 'damageEnemySoldiers':
        return {
          targets: playerTargets(this.opponentsOf(player.id).filter(hasSoldiers)),
          reason: '道の上に相手の兵士がいません',
        };
      case 'poisonEnemySoldiers':
      case 'freezeEnemySoldiers': {
        // 効き目が変わる兵士がいる相手だけ（全員もう同じかそれ以上の状態なら、出しても何も起きない）
        const changes = (x) =>
          def.effect === 'poisonEnemySoldiers'
            ? !x.poison || x.poison.turns < def.turns || x.poison.amount < def.amount
            : x.frozen < def.turns;
        const withSoldiers = this.opponentsOf(player.id).filter(hasSoldiers);
        return {
          targets: playerTargets(withSoldiers.filter((p) => p.soldiers.some(changes))),
          reason: withSoldiers.length ? 'もう同じ状態になっています' : '道の上に相手の兵士がいません',
        };
      }
      case 'healOwnCastle':
        return { targets: player.castle.isFull ? [] : [{ playerId: player.id }], reason: '城のHPが満タンです' };
      case 'shieldSoldier':
        return { targets: ownSoldiers(), reason: '道の上に自分の兵士がいません' };
      case 'armorCastle':
        return {
          targets: player.armor >= def.amount ? [] : [{ playerId: player.id }],
          reason: '同じか、より強い城壁がもう置いてあります',
        };
      default:
        return { targets: [], reason: 'このカードは出せません' };
    }
  }

  /** 手番・手札・枚数の決まりを確かめる。出せるならカードを返す */
  checkPlayable(cardId) {
    if (this.phase === 'ready') return fail('ゲームがまだ始まっていません');
    if (this.phase === 'gameOver') return fail('ゲームは終わっています');
    if (this.phase === 'discard') return fail('手札を捨てているところです');

    const player = this.players[this.currentPlayer];
    const card = player.findInHand(cardId);
    if (!card) {
      if (this.opponentsOf(player.id).some((p) => p.findInHand(cardId))) return fail('あなたの番ではありません');
      return fail('そのカードは手札にありません');
    }
    // メイン（兵士・魔法）は1ターン1枚。付加（武器）と防御は何枚でも
    if (card.slot === 'main' && player.playedThisTurn) return fail('このターンはもうメインのカードを出しました');
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
    if (card.slot === 'main') player.playedThisTurn = true;
    player.cardsPlayedThisTurn += 1;
    // 使ったカードは（兵士も）すぐ捨て札へ。使い切りのカードは、二度と山札に戻らない置き場へ
    if (card.isExhaust) this.pileOf(player.id).exhausted.push(card);
    else this.pileOf(player.id).discard.push(card);
    // トラップは種類を伏せる（相手に見えないように）
    this.emit('cardPlayed', { playerId: player.id, cardId: card.cardId, type: card.kind === 'trap' ? null : card.type });
    // 次のターンに引く枚数は、出すたびに決め直す（UI がターン中に表示できるように）
    player.drawNextTurn = Math.max(this.rules.drawPerTurn, player.cardsPlayedThisTurn * this.rules.drawPerCardUsed);

    if (card.isSoldier) {
      const targetId = resolved.target.playerId;
      const road = this.roadBetween(player.id, targetId);
      const soldierId = `s${String(this.nextSoldierNumber++).padStart(2, '0')}`;
      const soldier = new Soldier(soldierId, card, road.roadId, targetId);
      soldier.baseAttack += player.castleDef.soldierAttackBonus ?? 0; // 兵舎
      player.soldiers.push(soldier);
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
    } else if (card.isSpell && resolved.target.monsterId) {
      const monster = this.findMonster(resolved.target.monsterId);
      this.emit('spellCast', { playerId: player.id, type: card.type, target: monster.monsterId, targetKind: 'monster' });
      this.damageMonster(monster, card.def.amount, { playerId: player.id, type: card.type });
      this.defeatMonsterIfDead(monster, player.id);
    } else if (card.isSpell) {
      this.castSpell(player, card, this.players[resolved.target.playerId]);
    } else {
      this.playSupport(player, card, resolved.target);
    }

    this.checkGameOver();
    return ok();
  }

  castSpell(player, card, targetPlayer) {
    const enemy = targetPlayer;
    const { effect, amount } = card.def;

    switch (effect) {
      case 'damageEnemyCastle':
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        // 魔法の塔は城への魔法が強い
        this.damageCastle(enemy, amount + (player.castleDef.castleSpellBonus ?? 0), { kind: 'spell', type: card.type });
        break;

      case 'damageEnemySoldiers':
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        for (const soldier of [...enemy.soldiers]) this.damageSoldier(enemy, soldier, amount, 'spell');
        break;

      case 'poisonEnemySoldiers':
      case 'freezeEnemySoldiers': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id, targetKind: 'player' });
        const status = effect === 'poisonEnemySoldiers' ? 'poison' : 'frozen';
        for (const soldier of enemy.soldiers) {
          // 重ねがけでは増えない：残りの回数を長い方にそろえる
          if (status === 'poison') {
            const turns = Math.max(card.def.turns, soldier.poison?.turns ?? 0);
            soldier.poison = { amount: Math.max(amount, soldier.poison?.amount ?? 0), turns };
            this.emit('statusApplied', { playerId: enemy.id, soldierId: soldier.soldierId, status, turns });
          } else {
            soldier.frozen = Math.max(card.def.turns, soldier.frozen);
            this.emit('statusApplied', { playerId: enemy.id, soldierId: soldier.soldierId, status, turns: soldier.frozen });
          }
        }
        break;
      }

      case 'healOwnCastle': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id, targetKind: 'player' });
        const healed = player.castle.heal(amount);
        this.emit('castleHealed', { playerId: player.id, amount: healed, hp: player.castle.hp });
        break;
      }

      default:
        // Card.validateDefinitions で弾いているので、ここには来ない
        break;
    }
  }

  /** 付加（武器）・防御・トラップのカードを使う */
  playSupport(player, card, target) {
    const def = card.def;
    if (def.kind === 'weapon' || def.effect === 'shieldSoldier') {
      const soldier = player.soldiers.find((x) => x.soldierId === target.soldierId);
      if (def.kind === 'weapon') {
        // 1体に1つ。新しく持たせると前の武器は消える
        soldier.weapon = card.type;
        soldier.weaponBonus = def.attackBonus;
        soldier.element = def.element ?? null;
        this.emit('weaponEquipped', {
          playerId: player.id, soldierId: soldier.soldierId, type: card.type, attack: soldier.attack, element: soldier.element,
        });
      } else {
        soldier.shield += def.amount;
        this.emit('shieldAdded', { playerId: player.id, soldierId: soldier.soldierId, amount: def.amount, shield: soldier.shield });
      }
      return;
    }
    if (def.effect === 'armorCastle') {
      player.armor = def.amount; // 重ならない（今より多いときだけ出せる）
      this.emit('castleArmored', { playerId: player.id, armor: player.armor });
      return;
    }
    if (def.kind === 'trap') {
      const trapId = `t${String(this.nextTrapNumber++).padStart(2, '0')}`;
      player.traps.push({ trapId, roadId: target.roadId, square: target.square, type: card.type });
      this.emit('trapSet', { playerId: player.id, trapId, roadId: target.roadId, square: target.square });
    }
  }

  /** ターン終了。手札が上限を超えていたら phase "discard" にして、捨て終わるまで待つ */
  endTurn() {
    if (this.phase === 'ready') return fail('ゲームがまだ始まっていません');
    if (this.phase === 'gameOver') return fail('ゲームは終わっています');
    if (this.phase === 'discard') return fail('先に手札を捨ててください');

    const player = this.players[this.currentPlayer];
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

    for (const id of cardIds) this.pileOf(player.id).discard.push(player.takeFromHand(id));
    this.discardCount = 0;
    this.emit('cardDiscarded', { playerId: player.id, cardIds: [...cardIds] });
    this.passTurn();
    return ok();
  }

  passTurn() {
    const player = this.players[this.currentPlayer];
    // 次のターンに引く枚数 ＝ max(drawPerTurn, このターンに使った枚数 × drawPerCardUsed)
    player.drawNextTurn = Math.max(this.rules.drawPerTurn, player.cardsPlayedThisTurn * this.rules.drawPerCardUsed);
    player.playedThisTurn = false;
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
      // 城を削れるのは手番の人の行動だけなので、勝つのは手番の人
      this.finish(this.currentPlayer, 'castleDestroyed');
      return true;
    }
    for (const id of fallen) this.eliminate(this.players[id], this.currentPlayer);
    const alive = this.alivePlayerIds();
    if (alive.length <= 1) {
      this.finish(alive[0] ?? this.currentPlayer, 'lastStanding');
      return true;
    }
    return false;
  }

  finish(winner, reason) {
    this.winner = winner;
    this.phase = 'gameOver';
    this.emit('gameOver', { winner, reason });
  }

  /** 城が落ちた人を抜けさせる（lastStanding）。兵士・トラップは消え、手札は捨て札へ。道をつなぎ直す */
  eliminate(player, by) {
    player.eliminated = true;
    this.emit('playerEliminated', { playerId: player.id, by });
    for (const s of [...player.soldiers]) this.removeSoldier(player, s, 'eliminated');
    player.traps = [];
    const pile = this.pileOf(player.id);
    pile.discard.push(...player.hand);
    player.hand = [];
    const { opened, closed } = this.rebuildRoads();
    for (const road of closed) {
      const monsterIds = this.monsters.filter((m) => m.roadId === road.roadId).map((m) => m.monsterId);
      this.monsters = this.monsters.filter((m) => m.roadId !== road.roadId);
      this.emit('roadClosed', { roadId: road.roadId, monsterIds });
      for (const id of this.alivePlayerIds()) {
        const p = this.players[id];
        for (const s of p.soldiers.filter((x) => x.roadId === road.roadId)) this.removeSoldier(p, s, 'roadClosed');
        p.traps = p.traps.filter((t) => t.roadId !== road.roadId);
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
   * @param {string} viewerId "p1" | "p2"
   */
  getState(viewerId) {
    const players = {};
    const own = this.rules.deckMode === 'own';
    for (const id of this.playerOrder) {
      const p = this.players[id];
      const pile = this.pileOf(id);
      players[id] = {
        ...p.toState(id === viewerId),
        castleType: p.castleType,
        maxHand: p.maxHand,
        deckId: p.deckId ?? null,
        deckCount: own ? pile.deck.length : null,
        discardCount: own ? pile.discard.length : null,
        exhaustedCount: own ? pile.exhausted.length : null,
      };
    }
    // いちばん上の山札の数：shared は共通の山札、own は viewer 本人の山札（viewer がいなければ null）
    const topPile = own ? (this.piles.has(viewerId) ? this.pileOf(viewerId) : null) : this.pileOf(this.playerOrder[0]);
    return {
      deckMode: this.rules.deckMode,
      playerOrder: [...this.playerOrder],
      round: this.round,
      monsters: this.monsters.map((m) => m.toState()),
      roads: this.roads.map((r) => r.toState()),
      turn: this.turn,
      currentPlayer: this.currentPlayer,
      phase: this.phase,
      winner: this.winner,
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
