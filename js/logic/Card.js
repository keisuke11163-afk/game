// カード1枚を表すクラス。数値はすべて cards.json の定義(def)から受け取る。
// DOM には触らない（後でサーバー側へ移せるようにするため）。

export const MAGIC_EFFECTS = ['damageEnemyCastle', 'damageEnemySoldiers', 'healOwnCastle'];

export class Card {
  /**
   * @param {object} def  cards.json の cards[] の1要素
   * @param {number} uid  ゲーム内で一意な番号（同じ種類のカードを区別するため）
   */
  constructor(def, uid) {
    Card.validate(def);
    this.uid = uid;
    this.id = def.id;
    this.name = def.name;
    this.type = def.type; // 'soldier' | 'magic'

    if (this.type === 'soldier') {
      this.hp = def.hp;
      this.attack = def.attack;
      this.speed = def.speed;
    } else {
      this.effect = def.effect;
      this.value = def.value;
    }
  }

  get isSoldier() {
    return this.type === 'soldier';
  }

  get isMagic() {
    return this.type === 'magic';
  }

  /** 効果の説明文。数値から自動で作るので cards.json を変えれば説明も変わる。 */
  get description() {
    if (this.isSoldier) {
      return `HP${this.hp}・攻撃${this.attack}・1ターンに${this.speed}マス進む`;
    }
    switch (this.effect) {
      case 'damageEnemyCastle':
        return `相手の城に${this.value}ダメージ`;
      case 'damageEnemySoldiers':
        return `相手の進軍中の兵士全員に${this.value}ダメージ`;
      case 'healOwnCastle':
        return `自分の城HP+${this.value}（上限まで）`;
      default:
        return '';
    }
  }

  /** 画面やネットワークに渡すための素のデータ */
  toView() {
    const view = {
      uid: this.uid,
      id: this.id,
      name: this.name,
      type: this.type,
      description: this.description,
    };
    if (this.isSoldier) {
      Object.assign(view, { hp: this.hp, attack: this.attack, speed: this.speed });
    } else {
      Object.assign(view, { effect: this.effect, value: this.value });
    }
    return view;
  }

  /** cards.json の書き間違いを早めに見つけるためのチェック */
  static validate(def) {
    const where = `cards.json のカード "${def && def.id}"`;
    const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
    if (!def || typeof def.id !== 'string' || typeof def.name !== 'string') {
      throw new Error(`${where}: id と name が必要です`);
    }
    if (def.type === 'soldier') {
      for (const key of ['hp', 'attack', 'speed']) {
        if (!isNum(def[key]) || def[key] < 0) throw new Error(`${where}: ${key} は0以上の数値にしてください`);
      }
    } else if (def.type === 'magic') {
      if (!MAGIC_EFFECTS.includes(def.effect)) {
        throw new Error(`${where}: effect は ${MAGIC_EFFECTS.join(' / ')} のどれかにしてください`);
      }
      if (!isNum(def.value)) throw new Error(`${where}: value は数値にしてください`);
    } else {
      throw new Error(`${where}: type は soldier か magic にしてください`);
    }
  }
}
