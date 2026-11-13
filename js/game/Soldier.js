// 場に出た兵士1体。1本の道を相手の城に向かって進む。
// position: 自分の城から数えたマス。0 = 自分の城の前（出した直後）、laneLength - 1 = 相手の城の前。
// laneLength 以上になったら相手の城に着く。
// 1マスずつ進める（相手の兵士とぶつかるかは Game が1マスごとに確かめる）。

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

  /** 1マス進む */
  moveForward() {
    this.position += 1;
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
