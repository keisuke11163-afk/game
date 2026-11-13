// プレイヤー1人ぶんの持ち物：城・手札・自分のレーンにいる兵士。

import { Castle } from './Castle.js';

export class Player {
  /**
   * @param {string} id "p1" か "p2"
   * @param {number} castleMaxHp
   */
  constructor(id, castleMaxHp) {
    this.id = id;
    this.castle = new Castle(castleMaxHp);
    /** @type {import('./Card.js').Card[]} */
    this.hand = [];
    /** @type {import('./Soldier.js').Soldier[]} 出した順に並ぶ */
    this.soldiers = [];
    this.playedThisTurn = false;
  }

  findInHand(cardId) {
    return this.hand.find((c) => c.cardId === cardId) || null;
  }

  /** 手札から cardId のカードを抜き出す（無ければ null） */
  takeFromHand(cardId) {
    const i = this.hand.findIndex((c) => c.cardId === cardId);
    if (i === -1) return null;
    return this.hand.splice(i, 1)[0];
  }

  removeSoldier(soldierId) {
    this.soldiers = this.soldiers.filter((s) => s.soldierId !== soldierId);
  }

  /**
   * @param {boolean} showHand 手札の中身を見せるか（相手には枚数だけ）
   */
  toState(showHand) {
    return {
      castleHp: this.castle.hp,
      hand: showHand ? this.hand.map((c) => c.toState()) : null,
      handCount: this.hand.length,
      playedThisTurn: this.playedThisTurn,
      soldiers: this.soldiers.map((s) => s.toState()),
    };
  }
}
