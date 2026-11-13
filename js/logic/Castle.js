// 城。HPが0になったら持ち主の負け。

export class Castle {
  constructor(maxHp) {
    this.maxHp = maxHp;
    this.hp = maxHp;
  }

  /** ダメージを受ける。実際に減ったHPを返す。 */
  takeDamage(amount) {
    const before = this.hp;
    this.hp = Math.max(0, this.hp - amount);
    return before - this.hp;
  }

  /** 回復する（上限 maxHp）。実際に増えたHPを返す。 */
  heal(amount) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - before;
  }

  get isDestroyed() {
    return this.hp <= 0;
  }

  toView() {
    return { hp: this.hp, maxHp: this.maxHp };
  }
}
