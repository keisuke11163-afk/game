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

import { Card } from './Card.js';
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

const ok = () => ({ ok: true });
const fail = (reason) => ({ ok: false, reason });

export class Game {
  /**
   * @param {object} options
   * @param {object} options.cards data/cards.json の中身
   * @param {object} options.rules data/rules.json の中身
   * @param {() => number} [options.rng] 0以上1未満を返す乱数。省略すると Math.random
   */
  constructor({ cards, rules, rng = Math.random } = {}) {
    Card.validateDefinitions(cards);
    Game.validateRules(rules);
    if (typeof rng !== 'function') throw new Error('rng は 0以上1未満の数を返す関数にしてください');

    this.cardDefs = cards;
    this.rules = { ...rules };
    this.rng = rng;

    this.nextCardNumber = 1;
    this.nextSoldierNumber = 1;
    /** @type {Map<string, Set<Function>>} */
    this.listeners = new Map(EVENT_TYPES.map((type) => [type, new Set()]));

    /** 席順（手番の順） */
    this.playerOrder = [...PLAYER_IDS];
    this.players = {};
    // 後攻（p2）は城HPが secondPlayerCastleBonus だけ多い状態で始まる（上限も同じだけ高い）。先攻有利をやわらげるため
    this.playerOrder.forEach((id, seat) => {
      // 2人用のボーナス。3人以上の席ごとのボーナスは STEP 5 で決める（seatCastleBonus）
      const bonus = this.playerOrder.length === 2 && seat === 1 ? this.rules.secondPlayerCastleBonus : 0;
      this.players[id] = new Player(id, this.rules.castleMaxHp + bonus);
    });
    /** @type {Road[]} */
    this.roads = [];
    this.rebuildRoads();

    /** 山札。先頭（index 0）から引く */
    // カードIDはシャッフルしたあとの順に振る（IDから種類が分からないように）
    this.deck = this.shuffle(this.buildDeckTypes()).map((type) => this.createCard(type));
    this.discardPile = [];
    /** 使い切りのカード（cards.json で exhaust: true）は、使ったらここへ行き、山札には戻らない */
    this.exhaustedPile = [];

    this.turn = 0;
    this.currentPlayer = this.playerOrder[0];
    this.phase = 'ready';
    this.winner = null;
    this.discardCount = 0; // phase "discard" のときに捨てる必要がある枚数

    // 初期手札（ゲーム開始前なのでイベントは出さない）
    for (const id of this.playerOrder) {
      for (let i = 0; i < this.rules.initialHand; i++) {
        const card = this.deck.shift();
        if (!card) break;
        this.players[id].hand.push(card);
      }
    }
  }

  static validateRules(rules) {
    if (!rules || typeof rules !== 'object') throw new Error('rules.json の中身を渡してください');
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
    for (let i = 0; i < count; i++) {
      if (this.deck.length === 0) {
        if (this.discardPile.length === 0) break;
        this.deck = this.shuffle(this.discardPile);
        this.discardPile = [];
        this.emit('deckShuffled', { deckCount: this.deck.length });
      }
      const card = this.deck.shift();
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

  /** ターン開始：ドロー → 進軍 → メインへ */
  beginTurn(playerId) {
    const player = this.players[playerId];
    this.currentPlayer = playerId;
    this.turn += 1;
    this.phase = 'main';
    player.playedThisTurn = false;
    this.emit('turnStarted', { playerId, turn: this.turn });

    // 1. ドロー（先攻の最初のターンだけ firstTurnDraw 枚）
    const drawCount = this.turn === 1 ? this.rules.firstTurnDraw : this.rules.drawPerTurn;
    this.drawCards(player, drawCount);

    // 2. 進軍
    this.advanceSoldiers(player);
  }

  /**
   * 進軍：出した順に1体ずつ、1マスずつ進める。
   * 進む前と1マス進むごとに「同じマスか1つ先のマス」に相手の兵士がいないか確かめ、いたら止まって戦う。
   * 戦ったら（相手だけが消えても）そのターンはその場で止まる。
   * 城に着いたら 移動 → 城にダメージ → 消える。城が落ちたらその場でゲームを止める。
   */
  advanceSoldiers(player) {
    const { laneLength } = this.rules;

    for (const soldier of [...player.soldiers]) {
      if (!player.soldiers.includes(soldier)) continue; // 念のため（自分の番に自分の兵士が先に消えることはない）
      const enemy = this.players[soldier.targetId];
      const road = this.findRoad(soldier.roadId);

      const from = soldier.position;
      let opponent = this.findClashTarget(soldier, enemy);
      let steps = 0;
      while (!opponent && steps < soldier.speed) {
        soldier.moveForward();
        steps += 1;
        if (soldier.hasReachedCastle(laneLength)) break;
        opponent = this.findClashTarget(soldier, enemy);
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

      if (opponent) {
        this.fight(player, soldier, enemy, opponent);
        continue;
      }
      if (!reached) continue;

      enemy.castle.takeDamage(soldier.attack);
      this.emit('castleDamaged', {
        playerId: enemy.id,
        amount: soldier.attack,
        hp: enemy.castle.hp,
        source: { kind: 'soldier', soldierId: soldier.soldierId },
      });
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

  /** 進軍中の attacker と、相手の defender が戦う。お互いに攻撃力ぶんのダメージを同時に与える */
  fight(player, attacker, enemy, defender) {
    const road = this.findRoad(attacker.roadId);
    this.emit('soldiersClashed', {
      attacker: { playerId: player.id, soldierId: attacker.soldierId },
      defender: { playerId: enemy.id, soldierId: defender.soldierId },
      roadId: road.roadId,
      square: road.toSquare(player.id, attacker.position), // 攻める側が止まったマス
    });

    const toDefender = attacker.attack;
    const toAttacker = defender.attack;
    defender.takeDamage(toDefender);
    attacker.takeDamage(toAttacker);
    this.emit('soldierDamaged', {
      playerId: enemy.id,
      soldierId: defender.soldierId,
      amount: toDefender,
      hp: defender.hp,
    });
    this.emit('soldierDamaged', {
      playerId: player.id,
      soldierId: attacker.soldierId,
      amount: toAttacker,
      hp: attacker.hp,
    });

    // 消える順番は soldierDamaged と同じ（守る側 → 攻める側）
    for (const [owner, s] of [[enemy, defender], [player, attacker]]) {
      if (!s.isDead) continue;
      owner.removeSoldier(s.soldierId);
      this.emit('soldierDestroyed', { playerId: owner.id, soldierId: s.soldierId, reason: 'killed' });
    }
  }

  // ================= カードを出す =================

  /**
   * そのカードを出せる対象の一覧（プレイヤーの番・手札にあるかなどは見ない）。
   * 形は { playerId } / { soldierId } / { roadId, square } のどれか（CLAUDE.md「対象の選び方」）。
   * @returns {{targets: object[], reason: string}} 対象がないときの理由も返す
   */
  listTargets(player, card) {
    if (card.isSoldier) {
      return {
        targets: this.neighborsOf(player.id).map((p) => ({ playerId: p.id })),
        reason: '兵士を送れる相手がいません',
      };
    }
    switch (card.def.effect) {
      case 'damageEnemyCastle':
        return { targets: this.opponentsOf(player.id).map((p) => ({ playerId: p.id })), reason: '相手がいません' };
      case 'damageEnemySoldiers':
        return {
          targets: this.opponentsOf(player.id).filter((p) => p.soldiers.length > 0).map((p) => ({ playerId: p.id })),
          reason: '道の上に相手の兵士がいません',
        };
      case 'healOwnCastle':
        return { targets: player.castle.isFull ? [] : [{ playerId: player.id }], reason: '城のHPが満タンです' };
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
    if (player.playedThisTurn) return fail('このターンはもうカードを出しました');
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
    player.playedThisTurn = true;
    // 使ったカードは（兵士も）すぐ捨て札へ。使い切りのカードは、二度と山札に戻らない置き場へ
    if (card.isExhaust) this.exhaustedPile.push(card);
    else this.discardPile.push(card);
    this.emit('cardPlayed', { playerId: player.id, cardId: card.cardId, type: card.type });

    if (card.isSoldier) {
      const targetId = resolved.target.playerId;
      const road = this.roadBetween(player.id, targetId);
      const soldierId = `s${String(this.nextSoldierNumber++).padStart(2, '0')}`;
      const soldier = new Soldier(soldierId, card, road.roadId, targetId);
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
    } else {
      this.castSpell(player, card, this.players[resolved.target.playerId]);
    }

    this.checkGameOver();
    return ok();
  }

  castSpell(player, card, targetPlayer) {
    const enemy = targetPlayer;
    const { effect, amount } = card.def;

    switch (effect) {
      case 'damageEnemyCastle':
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id });
        enemy.castle.takeDamage(amount);
        this.emit('castleDamaged', {
          playerId: enemy.id,
          amount,
          hp: enemy.castle.hp,
          source: { kind: 'spell', type: card.type },
        });
        break;

      case 'damageEnemySoldiers':
        this.emit('spellCast', { playerId: player.id, type: card.type, target: enemy.id });
        for (const soldier of [...enemy.soldiers]) {
          soldier.takeDamage(amount);
          this.emit('soldierDamaged', {
            playerId: enemy.id,
            soldierId: soldier.soldierId,
            amount,
            hp: soldier.hp,
          });
          if (soldier.isDead) {
            enemy.removeSoldier(soldier.soldierId);
            this.emit('soldierDestroyed', {
              playerId: enemy.id,
              soldierId: soldier.soldierId,
              reason: 'killed',
            });
          }
        }
        break;

      case 'healOwnCastle': {
        this.emit('spellCast', { playerId: player.id, type: card.type, target: player.id });
        const healed = player.castle.heal(amount);
        this.emit('castleHealed', { playerId: player.id, amount: healed, hp: player.castle.hp });
        break;
      }

      default:
        // Card.validateDefinitions で弾いているので、ここには来ない
        break;
    }
  }

  /** ターン終了。手札が上限を超えていたら phase "discard" にして、捨て終わるまで待つ */
  endTurn() {
    if (this.phase === 'ready') return fail('ゲームがまだ始まっていません');
    if (this.phase === 'gameOver') return fail('ゲームは終わっています');
    if (this.phase === 'discard') return fail('先に手札を捨ててください');

    const player = this.players[this.currentPlayer];
    const over = player.hand.length - this.rules.maxHand;
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

    for (const id of cardIds) this.discardPile.push(player.takeFromHand(id));
    this.discardCount = 0;
    this.emit('cardDiscarded', { playerId: player.id, cardIds: [...cardIds] });
    this.passTurn();
    return ok();
  }

  passTurn() {
    this.players[this.currentPlayer].playedThisTurn = false;
    this.beginTurn(this.nextPlayerAfter(this.currentPlayer));
  }

  /** どちらかの城HPが0以下なら決着させる。決着したら true */
  checkGameOver() {
    if (this.phase === 'gameOver') return true;
    const loser = this.alivePlayerIds().find((id) => this.players[id].castle.isDestroyed);
    if (!loser) return false;
    // 城を削れるのは手番の人の行動だけなので、勝つのは手番の人（2人なら、城が残っている方）
    this.winner = this.currentPlayer;
    this.phase = 'gameOver';
    this.emit('gameOver', { winner: this.winner });
    return true;
  }

  // ================= 状態 =================

  /**
   * 今の状態をただのオブジェクトで返す。viewerId の手札は中身まで、相手の手札は枚数だけ。
   * @param {string} viewerId "p1" | "p2"
   */
  getState(viewerId) {
    const players = {};
    for (const id of this.playerOrder) players[id] = this.players[id].toState(id === viewerId);
    return {
      playerOrder: [...this.playerOrder],
      roads: this.roads.map((r) => r.toState()),
      turn: this.turn,
      currentPlayer: this.currentPlayer,
      phase: this.phase,
      winner: this.winner,
      deckCount: this.deck.length,
      discardCount: this.discardPile.length,
      exhaustedCount: this.exhaustedPile.length,
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
  debugSetDeck(types) {
    const bad = this.findUnknownType(types);
    if (bad !== null) return fail(bad);
    this.deck = types.map((type) => this.createCard(type));
    return ok();
  }

  findUnknownType(types) {
    if (!Array.isArray(types)) return 'カード種類を配列で渡してください';
    const unknown = types.find((t) => !Object.hasOwn(this.cardDefs, t));
    return unknown === undefined ? null : `"${unknown}" というカードはありません`;
  }
}
