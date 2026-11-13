// プレイヤー1人ぶんの持ち物：城・手札・道の上にいる自分の兵士。

import { Castle } from './Castle.js';

export class Player {
  /**
   * @param {string} id "p1"〜"p8"
   * @param {number} castleMaxHp
   * @param {number} [drawPerTurn] 最初の「次のターンに引く枚数」
   */
  constructor(id, castleMaxHp, drawPerTurn = 0) {
    this.id = id;
    this.castle = new Castle(castleMaxHp);
    /** @type {import('./Card.js').Card[]} */
    this.hand = [];
    /** @type {import('./Soldier.js').Soldier[]} 出した順に並ぶ */
    this.soldiers = [];
    this.playedThisTurn = false;
    /** 負けて抜けたか（3人以上のとき） */
    this.eliminated = false;
    /** このターンに出したカードの枚数（メイン・付加・防御すべて） */
    this.cardsPlayedThisTurn = 0;
    /** 次のターンに引く枚数 */
    this.drawNextTurn = drawPerTurn;
    /** 城壁の残り。次の自分のターンの始めに消える */
    this.armor = 0;
    /** 伏せたトラップ [{ trapId, roadId, square, type }]（square は道のマス番号） */
    this.traps = [];
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
   * @param {boolean} showHand 手札の中身とトラップの種類を見せるか（相手には枚数・場所だけ）
   */
  toState(showHand) {
    return {
      castleHp: this.castle.hp,
      castleMaxHp: this.castle.maxHp,
      eliminated: this.eliminated,
      cardsPlayedThisTurn: this.cardsPlayedThisTurn,
      drawNextTurn: this.drawNextTurn,
      armor: this.armor,
      traps: this.traps.map((t) => ({ trapId: t.trapId, roadId: t.roadId, square: t.square, type: showHand ? t.type : null })),
      hand: showHand ? this.hand.map((c) => c.toState()) : null,
      handCount: this.hand.length,
      playedThisTurn: this.playedThisTurn,
      soldiers: this.soldiers.map((s) => s.toState()),
    };
  }
}
