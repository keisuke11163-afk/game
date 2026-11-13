// 場に出た兵士1体。自分のレーンを相手の城に向かって進む。
// position: 0 = 自分の城の前（出した直後）。laneLength 以上になったら相手の城に着く。

export class Soldier {
  /**
   * @param {string} soldierId 例: "s03"
   * @param {import('./Card.js').Card} card 兵士カード
   */
  constructor(soldierId, card) {
    this.soldierId = soldierId;
    this.type = card.type;
    this.hp = card.def.hp;
    this.attack = card.def.attack;
    this.speed = card.def.speed;
    this.position = 0;
  }

  /** speed ぶん進む。移動前と移動後の位置を返す */
  advance() {
    const from = this.position;
    this.position = from + this.speed;
    return { from, to: this.position };
  }

  hasReachedCastle(laneLength) {
    return this.position >= laneLength;
  }

  /** ダメージを受ける。HPは0未満にしない */
  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
  }

  get isDead() {
    return this.hp <= 0;
  }

  toState() {
    return {
      soldierId: this.soldierId,
      type: this.type,
      hp: this.hp,
      attack: this.attack,
      position: this.position,
    };
  }
}
