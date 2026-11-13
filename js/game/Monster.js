// 魔物1体。道の真ん中のマスにいる。数値は data/monsters.json の定義から受け取る。

export class Monster {
  /**
   * @param {string} monsterId 例: "m01"
   * @param {string} type monsters.json のキー
   * @param {object} def monsters.json の定義
   * @param {string} roadId
   * @param {number} square 道のマス番号
   */
  constructor(monsterId, type, def, roadId, square) {
    this.monsterId = monsterId;
    this.type = type;
    this.def = def;
    this.roadId = roadId;
    this.square = square;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.attack = def.attack;
    this.element = def.element ?? null;
    /** 城を攻めるまでの残り周回 */
    this.attackIn = def.attackEvery;
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
  }

  get isDead() {
    return this.hp <= 0;
  }

  toState() {
    return {
      monsterId: this.monsterId,
      type: this.type,
      roadId: this.roadId,
      square: this.square,
      hp: this.hp,
      maxHp: this.maxHp,
      attack: this.attack,
      element: this.element,
      attackIn: this.attackIn,
    };
  }

  /** monsters.json の中身をチェックする（間違いは例外） */
  static validateDefinitions(monsters, elements) {
    if (!monsters || typeof monsters !== 'object' || Array.isArray(monsters)) {
      throw new Error('monsters.json は魔物の種類をキーにしたオブジェクトにしてください');
    }
    const isPositive = (v) => Number.isInteger(v) && v > 0;
    for (const [type, def] of Object.entries(monsters)) {
      const where = `monsters.json の "${type}"`;
      if (!def || typeof def !== 'object') throw new Error(`${where}: 定義がオブジェクトではありません`);
      if (typeof def.name !== 'string' || def.name === '') throw new Error(`${where}: name を書いてください`);
      for (const key of ['hp', 'attack', 'reward', 'castleAttack', 'attackEvery', 'weight']) {
        if (!isPositive(def[key])) throw new Error(`${where}: ${key} は1以上の整数にしてください`);
      }
      if (def.element !== undefined && def.element !== null && !elements.includes(def.element)) {
        throw new Error(`${where}: element は ${elements.join(' / ')} のどれかにしてください`);
      }
    }
  }
}

export const UPGRADE_EFFECTS = ['repairCastle', 'drawCards', 'sharpenSoldiers'];

/** upgrades.json の中身をチェックする（間違いは例外） */
export function validateUpgrades(upgrades) {
  if (!upgrades || typeof upgrades !== 'object' || Array.isArray(upgrades)) {
    throw new Error('upgrades.json は強化のIDをキーにしたオブジェクトにしてください');
  }
  for (const [id, def] of Object.entries(upgrades)) {
    const where = `upgrades.json の "${id}"`;
    if (!def || typeof def !== 'object') throw new Error(`${where}: 定義がオブジェクトではありません`);
    if (typeof def.name !== 'string' || def.name === '') throw new Error(`${where}: name を書いてください`);
    if (!UPGRADE_EFFECTS.includes(def.effect)) throw new Error(`${where}: effect は ${UPGRADE_EFFECTS.join(' / ')} のどれかです`);
    for (const key of ['cost', 'amount']) {
      if (!Number.isInteger(def[key]) || def[key] < 1) throw new Error(`${where}: ${key} は1以上の整数にしてください`);
    }
  }
}
