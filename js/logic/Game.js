// ゲーム全体の進行を管理するクラス。
// - 山札（2人共通）・ターン順・勝敗を持つ
// - 画面には触らず、「何が起きたか」をイベントの配列で返す
//   （画面側はイベントを見てアニメーションする。オンライン化の時はこのイベントを送ればよい）
//
// ターンの流れ:
//   phase 'waiting' --startTurn()--> ドロー → 進軍 --> phase 'main'
//   phase 'main'    --playCard()---> カードを1枚使う（使わなくてもよい）
//   phase 'main'    --endTurn()----> 相手の番の 'waiting' へ
//   城HPが0になったら phase 'gameover'

import { Card } from './Card.js';
import { Soldier } from './Soldier.js';
import { Player } from './Player.js';

const DEFAULT_RULES = {
  castleHp: 100,
  initialHand: 6,
  drawPerTurn: 2,
  laneLength: 6,
};

export class Game {
  /**
   * @param {{rules?: object, cards: object[]}} config cards.json の中身
   * @param {() => number} rng 0以上1未満の乱数を返す関数（テスト用に差し替え可能）
   */
  constructor(config, rng = Math.random) {
    if (!config || !Array.isArray(config.cards) || config.cards.length === 0) {
      throw new Error('cards.json に cards がありません');
    }
    this.rules = { ...DEFAULT_RULES, ...(config.rules || {}) };
    this.cardDefs = config.cards;
    this.cardDefs.forEach((def) => Card.validate(def));
    this.rng = rng;
    this.nextUid = 1;

    this.players = [
      new Player(0, 'プレイヤー1', this.rules.castleHp),
      new Player(1, 'プレイヤー2', this.rules.castleHp),
    ];

    this.deck = this.shuffle(this.buildDeck());
    this.discardPile = [];

    this.currentIndex = 0;
    this.turnNumber = 0;
    this.phase = 'waiting';
    this.hasPlayedCard = false;
    this.winnerIndex = null;

    for (const player of this.players) {
      for (let i = 0; i < this.rules.initialHand; i++) this.drawCard(player);
    }
  }

  // ---------- 便利なゲッター ----------

  get currentPlayer() {
    return this.players[this.currentIndex];
  }

  get opponent() {
    return this.players[1 - this.currentIndex];
  }

  // ---------- 山札 ----------

  newUid() {
    return this.nextUid++;
  }

  buildDeck() {
    const deck = [];
    for (const def of this.cardDefs) {
      const count = def.count ?? 0;
      for (let i = 0; i < count; i++) deck.push(new Card(def, this.newUid()));
    }
    return deck;
  }

  /** Fisher-Yates シャッフル */
  shuffle(cards) {
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }

  /**
   * 山札が空のときに引くカード。
   * 山札とは別に、カードの種類からランダムに1枚作る（cards.json の count を出やすさの重みにする）。
   */
  createRandomCard() {
    const weights = this.cardDefs.map((def) => Math.max(0, def.count ?? 0));
    const total = weights.reduce((a, b) => a + b, 0);
    let def = this.cardDefs[Math.floor(this.rng() * this.cardDefs.length)];
    if (total > 0) {
      let r = this.rng() * total;
      for (let i = 0; i < this.cardDefs.length; i++) {
        r -= weights[i];
        if (r < 0) {
          def = this.cardDefs[i];
          break;
        }
      }
    }
    return new Card(def, this.newUid());
  }

  /** 1枚引く。山札から引いたら false、ランダム生成なら true を返す */
  drawCard(player) {
    if (this.deck.length > 0) {
      player.addToHand(this.deck.pop());
      return false;
    }
    player.addToHand(this.createRandomCard());
    return true;
  }

  // ---------- ターン進行 ----------

  /** ターン開始：ドロー → 進軍。起きたことをイベント配列で返す */
  startTurn() {
    this.assertPhase('waiting');
    const events = [];
    const player = this.currentPlayer;
    const enemy = this.opponent;
    this.turnNumber++;
    this.hasPlayedCard = false;
    events.push({ type: 'turnStart', playerIndex: player.index, turnNumber: this.turnNumber });

    // 1. ドロー
    let generated = 0;
    for (let i = 0; i < this.rules.drawPerTurn; i++) {
      if (this.drawCard(player)) generated++;
    }
    events.push({ type: 'draw', playerIndex: player.index, count: this.rules.drawPerTurn, generated });

    // 2. 進軍：全員そろって進み、相手の城に着いた兵士は攻撃して消える
    const moves = player.soldiers.map((s) => {
      const { from, to } = s.advance();
      return { soldierId: s.uid, from, to, arrived: s.hasArrived(this.rules.laneLength) };
    });
    events.push({ type: 'advance', playerIndex: player.index, moves });

    for (const soldier of player.soldiers) {
      if (!soldier.hasArrived(this.rules.laneLength)) continue;
      const damage = enemy.castle.takeDamage(soldier.attack);
      events.push({
        type: 'castleHit',
        attackerIndex: player.index,
        targetIndex: enemy.index,
        soldierId: soldier.uid,
        damage,
        hp: enemy.castle.hp,
      });
    }
    player.removeSoldiers((s) => s.hasArrived(this.rules.laneLength));

    this.phase = 'main';
    this.checkWinner(events);
    return events;
  }

  /** メイン：手札のカードを1枚使う */
  playCard(cardUid) {
    this.assertPhase('main');
    if (this.hasPlayedCard) throw new Error('このターンはもうカードを使いました');
    const player = this.currentPlayer;
    const enemy = this.opponent;
    const card = player.takeFromHand(cardUid);
    if (!card) throw new Error('そのカードは手札にありません');

    this.hasPlayedCard = true;
    this.discardPile.push(card);
    const events = [{ type: 'cardPlayed', playerIndex: player.index, card: card.toView() }];

    if (card.isSoldier) {
      const soldier = new Soldier(card, player.index, this.newUid());
      player.soldiers.push(soldier);
      events.push({ type: 'soldierDeployed', playerIndex: player.index, soldier: soldier.toView() });
    } else {
      this.applyMagic(card, player, enemy, events);
    }

    this.checkWinner(events);
    return events;
  }

  applyMagic(card, player, enemy, events) {
    switch (card.effect) {
      case 'damageEnemyCastle': {
        const damage = enemy.castle.takeDamage(card.value);
        events.push({ type: 'castleDamaged', targetIndex: enemy.index, damage, hp: enemy.castle.hp, cardId: card.id });
        break;
      }
      case 'damageEnemySoldiers': {
        const hits = enemy.soldiers.map((s) => {
          const damage = s.takeDamage(card.value);
          return { soldierId: s.uid, damage, hp: s.hp, died: s.isDead };
        });
        enemy.removeSoldiers((s) => s.isDead);
        events.push({ type: 'soldiersDamaged', ownerIndex: enemy.index, hits, cardId: card.id });
        break;
      }
      case 'healOwnCastle': {
        const healed = player.castle.heal(card.value);
        events.push({ type: 'castleHealed', targetIndex: player.index, healed, hp: player.castle.hp, cardId: card.id });
        break;
      }
      default:
        throw new Error(`不明な効果: ${card.effect}`);
    }
  }

  /** ターン終了：相手の番へ（手札の上限はなし） */
  endTurn() {
    this.assertPhase('main');
    const events = [{ type: 'turnEnd', playerIndex: this.currentIndex }];
    this.currentIndex = 1 - this.currentIndex;
    this.phase = 'waiting';
    return events;
  }

  checkWinner(events) {
    const loser = this.players.find((p) => p.castle.isDestroyed);
    if (!loser) return;
    this.winnerIndex = 1 - loser.index;
    this.phase = 'gameover';
    events.push({ type: 'gameOver', winnerIndex: this.winnerIndex });
  }

  assertPhase(expected) {
    if (this.phase !== expected) {
      throw new Error(`今は ${expected} ではありません（現在: ${this.phase}）`);
    }
  }

  // ---------- 画面に渡すデータ ----------

  /**
   * viewerIndex のプレイヤーから見た状態。相手の手札は枚数だけ。
   * オンライン対戦ではこれをそれぞれのプレイヤーに送ることになる。
   */
  getView(viewerIndex) {
    return {
      viewerIndex,
      currentIndex: this.currentIndex,
      turnNumber: this.turnNumber,
      phase: this.phase,
      hasPlayedCard: this.hasPlayedCard,
      winnerIndex: this.winnerIndex,
      deckCount: this.deck.length,
      laneLength: this.rules.laneLength,
      players: this.players.map((p) => p.toView(p.index === viewerIndex)),
    };
  }
}
