// プレイヤー1人ぶんの持ち物：城・手札・道の上にいる自分の兵士。

import { Castle } from './Castle.js';

export class Player {
  /**
   * @param {string} id "p1"〜"p8"
   * @param {number} castleMaxHp
   */
  constructor(id, castleMaxHp) {
    this.id = id;
    this.castle = new Castle(castleMaxHp);
    /** @type {import('./Card.js').Card[]} */
    this.hand = [];
    /** @type {import('./Soldier.js').Soldier[]} 出した順に並ぶ */
    this.soldiers = [];
    this.playedThisTurn = false;
    this.soldiersPlayedThisTurn = 0;
    this.coinCardsPlayedThisTurn = 0;
    /** このターンに起こした属性の反応の回数（自分のターンの始めに0へ） */
    this.reactionsThisTurn = 0;
    /** 負けて抜けたか（3人以上のとき） */
    this.eliminated = false;
    /** このターンに出したカードの枚数（メイン・付加・防御すべて） */
    this.cardsPlayedThisTurn = 0;
    /** コイン（魔物のとどめでもらう） */
    this.coins = 0;
    /** 強化ID → 買った回数 */
    this.upgradesBought = {};
    /** 運命の祈り：次の draws 枚は、排出率を boost 倍（fromRarity 以上）にして引き当てる。{ draws, boost, from } か null */
    this.luck = null;
    /** MP（攻撃の魔法・精霊を使うと減り、マナ回復のカードで増える）。rules.maxMp が上限 */
    this.mp = 0;
    /** 排出率の恒久強化（コインで買う）：ドローのたびに chance の確率で、排出率を boost 倍（from 以上）にして引き当てる。{ chance, boost, from } か null */
    this.permLuck = null;
    /** 軍の訓練：これから出す兵士と、いる兵士の攻撃力・HPが、ずっと増える（コインで買う） */
    this.armyAttack = 0;
    this.armyHp = 0;
    /** 今来ている精霊（1人1体まで）。{ type, spirit, amount, turns, targetId, fresh } か null */
    this.spirit = null;
  }

  /** 城壁の残り。次の自分のターンの始めに消える（城に置く。チーム戦では城を共有するので、城壁もチームで共有） */
  get armor() {
    return this.castle.armor;
  }

  set armor(value) {
    this.castle.armor = value;
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

  /** 相手から見える兵士（忍者を除く）。妖術（魔法）の的・対象の数え方に使う */
  get visibleSoldiers() {
    return this.soldiers.filter((s) => !s.stealth);
  }

  removeSoldier(soldierId) {
    this.soldiers = this.soldiers.filter((s) => s.soldierId !== soldierId);
  }

  /**
   * @param {boolean} showHand 手札の中身を見せるか（相手には枚数だけ）
   */
  toState(showHand) {
    return {
      castleHp: this.castle.hp,
      castleMaxHp: this.castle.maxHp,
      eliminated: this.eliminated,
      cardsPlayedThisTurn: this.cardsPlayedThisTurn,
      armor: this.armor,
      castlePoison: this.castle.poison,
      castlePoisonTurns: this.castle.poisonTurns,
      spirit: this.spirit ? { type: this.spirit.type, spirit: this.spirit.spirit, amount: this.spirit.amount, turns: this.spirit.turns, targetId: this.spirit.targetId } : null,
      coins: this.coins,
      mp: this.mp,
      permLuck: this.permLuck ? { chance: this.permLuck.chance, boost: this.permLuck.boost } : null,
      armyAttack: this.armyAttack,
      armyHp: this.armyHp,
      luck: this.luck ? { draws: this.luck.draws, boost: this.luck.boost } : null,
      hand: showHand ? this.hand.map((c) => c.toState()) : null,
      handCount: this.hand.length,
      playedThisTurn: this.playedThisTurn,
      soldiersPlayedThisTurn: this.soldiersPlayedThisTurn,
      reactionsThisTurn: this.reactionsThisTurn,
      soldiers: this.soldiers.map((s) => s.toState()),
    };
  }
}
