// プレイヤー1人ぶんの持ち物：城・手札・自分のレーンにいる兵士。

import { Castle } from './Castle.js';

export class Player {
  constructor(index, name, castleHp) {
    this.index = index;
    this.name = name;
    this.castle = new Castle(castleHp);
    /** @type {import('./Card.js').Card[]} */
    this.hand = [];
    /** @type {import('./Soldier.js').Soldier[]} 自分のレーンを進軍中の兵士 */
    this.soldiers = [];
  }

  addToHand(card) {
    this.hand.push(card);
  }

  /** 手札から uid のカードを取り出す（無ければ null） */
  takeFromHand(uid) {
    const i = this.hand.findIndex((c) => c.uid === uid);
    if (i === -1) return null;
    return this.hand.splice(i, 1)[0];
  }

  /** 条件に合う兵士をレーンから取り除く（倒された兵士・相手の城に着いた兵士） */
  removeSoldiers(predicate) {
    this.soldiers = this.soldiers.filter((s) => !predicate(s));
  }

  /**
   * @param {boolean} showHand 手札の中身を見せるか（相手には枚数だけ見せる）
   */
  toView(showHand) {
    return {
      index: this.index,
      name: this.name,
      castle: this.castle.toView(),
      handCount: this.hand.length,
      hand: showHand ? this.hand.map((c) => c.toView()) : null,
      soldiers: this.soldiers.map((s) => s.toView()),
    };
  }
}
