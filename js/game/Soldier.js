// 場に出た兵士1体。道（roadId）を相手（targetId）の城に向かって進む。
// position: 自分の城から数えたマス。0 = 自分の城の前（出した直後）、laneLength - 1 = 相手の城の前。
// laneLength 以上になったら相手の城に着く。
// 1マスずつ進める（相手の兵士とぶつかるかは Game が1マスごとに確かめる）。

export class Soldier {
  /**
   * @param {string} soldierId 例: "s03"
   * @param {import('./Card.js').Card} card 兵士カード
   * @param {string} roadId どの道を進むか
   * @param {string} targetId 道の向こうの人（攻める相手）
   */
  constructor(soldierId, card, roadId, targetId) {
    this.soldierId = soldierId;
    this.roadId = roadId;
    this.targetId = targetId;
    this.type = card.type;
    this.hp = card.def.hp;
    this.baseAttack = card.def.attack;
    this.speed = card.def.speed;
    this.position = 0;
    /** 持っている武器のカード種類（なければ null） */
    this.weapon = null;
    this.weaponBonus = 0;
    /** 属性（武器でつく。なければ null） */
    this.element = null;
    /** 盾の残り。ダメージは先に盾が受ける */
    this.shield = 0;
    /** 毒 { amount, turns }（なければ null） */
    this.poison = null;
    /** 凍結の残り回数（0 なら凍結していない） */
    this.frozen = 0;
  }

  get attack() {
    return this.baseAttack + this.weaponBonus;
  }

  /** 1マス進む */
  moveForward() {
    this.position += 1;
  }

  hasReachedCastle(laneLength) {
    return this.position >= laneLength;
  }

  /**
   * ダメージを受ける。盾が先に受ける（ignoreShield なら盾を使わない）。HPは0未満にしない
   * @returns {number} 盾が受けた量
   */
  takeDamage(amount, { ignoreShield = false } = {}) {
    const blocked = ignoreShield ? 0 : Math.min(this.shield, amount);
    this.shield -= blocked;
    this.hp = Math.max(0, this.hp - (amount - blocked));
    return blocked;
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
      roadId: this.roadId,
      targetId: this.targetId,
      weapon: this.weapon,
      element: this.element,
      shield: this.shield,
      statuses: { poison: this.poison ? { ...this.poison } : null, frozen: this.frozen },
    };
  }
}
