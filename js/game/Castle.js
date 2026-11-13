// 城。HPが0以下になったら持ち主の負け。

export class Castle {
  constructor(maxHp) {
    this.maxHp = maxHp;
    this.hp = maxHp;
  }

  /** ダメージを受ける。HPは0未満にしない */
  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
  }

  /** 回復する（上限 maxHp）。実際に増えたHPを返す */
  heal(amount) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - before;
  }

  get isFull() {
    return this.hp >= this.maxHp;
  }

  get isDestroyed() {
    return this.hp <= 0;
  }
}
