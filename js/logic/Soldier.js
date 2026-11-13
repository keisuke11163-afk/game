// 場に出ている兵士1体。自分のレーンを相手の城に向かって進む。
// position: 0 = 自分の城（出撃した直後）、1〜laneLength = レーンのマス、
//           laneLength を越えたら相手の城に到着。

export class Soldier {
  /**
   * @param {import('./Card.js').Card} card 兵士カード
   * @param {number} ownerIndex 持ち主のプレイヤー番号 (0 / 1)
   * @param {number} uid ゲーム内で一意な番号
   */
  constructor(card, ownerIndex, uid) {
    this.uid = uid;
    this.cardId = card.id;
    this.name = card.name;
    this.ownerIndex = ownerIndex;
    this.maxHp = card.hp;
    this.hp = card.hp;
    this.attack = card.attack;
    this.speed = card.speed;
    this.position = 0;
  }

  /** 前に進む。移動前後の位置を返す。 */
  advance() {
    const from = this.position;
    this.position += this.speed;
    return { from, to: this.position };
  }

  hasArrived(laneLength) {
    return this.position > laneLength;
  }

  /** ダメージを受ける。実際に減ったHPを返す。 */
  takeDamage(amount) {
    const before = this.hp;
    this.hp = Math.max(0, this.hp - amount);
    return before - this.hp;
  }

  get isDead() {
    return this.hp <= 0;
  }

  toView() {
    return {
      uid: this.uid,
      cardId: this.cardId,
      name: this.name,
      ownerIndex: this.ownerIndex,
      hp: this.hp,
      maxHp: this.maxHp,
      attack: this.attack,
      speed: this.speed,
      position: this.position,
    };
  }
}
