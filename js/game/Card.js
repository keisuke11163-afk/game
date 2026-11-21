// カード1枚。数値は data/cards.json の定義から受け取る（コードに数値を書かない）。
// DOM は使わない（後でサーバーに移すため）。

export const CARD_KINDS = ['soldier', 'spell', 'weapon', 'defense'];
/** 兵士の役割：melee（進んで戦う）・archer（弓兵：動かず、射程の中の1体を撃つ）・mage（魔法使い：動かず、兵士がいなければ城を撃つ） */
/** guard（護衛）：自分の城の前から動かず、左右のとなりの道の城の前も守る。stay ターンで帰る */
export const SOLDIER_ROLES = ['melee', 'archer', 'mage', 'ninja', 'guard'];
/** 進んで城を攻める役割（speed を書く）。ninja（忍者）は進むが、相手から見えず、相手の兵士とは戦わずにすり抜ける */
export const MOVING_ROLES = ['melee', 'ninja'];
import { ELEMENT_IDS } from './Elements.js';
import { COMMON_FACTION, isValidFactionId } from './Factions.js';
/** 属性は10種のうち「無」を除く9つ（無は element を書かないこと）。火水風土氷雷闇光混沌 */
export const ELEMENTS = ELEMENT_IDS;
/** 精霊の種類：fire=毎ターン敵の城を攻める／water=毎ターン城を回復／wind=兵士の速さの最低値／earth=受けるダメージを軽くする */
export const SPIRIT_KINDS = ['fire', 'water', 'wind', 'earth'];

/** effect ごとに、必要な数値のキー */
export const EFFECTS = {
  spell: {
    damageEnemyCastle: ['amount'],
    damageEnemySoldiers: ['amount'],
    healOwnCastle: ['amount'],
    poisonEnemySoldiers: ['amount', 'turns'], // 毒（ターン数つき。兵士だけ。テスト・互換用）
    poisonEnemy: ['amount'], // 毒：選んだ相手の兵士と城を、永続の毒状態にする（毎ターン amount ダメージ。盾・城壁は効かない）
    curePoison: [], // 解毒薬：自分の毒状態（兵士・城）をすべて治す
    freezeEnemySoldiers: ['turns'],
    chainBlast: ['amount'], // チェーン・ブラスト：相手の兵士1体に amount、まわり（同じ道の前後1マス・となりの道の同じマス）に半分（切り上げ）
    ignitionBurst: ['amount', 'selfDamage'], // イグニッション・バースト：自分の城に selfDamage、相手の兵士全員と城に amount
    armorBlast: [], // シールド・ブラスト：自分の城壁の値ぶん相手の城にダメージ。城壁は0になる
    purifyFlare: ['amount'], // ピュリファイ・フレア：自分の毒・やけど・凍結を治し、相手の兵士全員に amount
    pushBackEnemySoldiers: ['amount'], // ゲイルフォース：相手の兵士を amount マス押し戻す（自分の城の前＝マス0より後ろには下がらない）
    redrawHand: [], // 天の恵み：手札を全部引き直す
    randomEffect: [], // 神頼み：山札の上の1枚を、タダで出す（対象はランダム）
    stealCard: [], // 盗賊：相手の手札から1枚ランダムに奪う
    gainCoins: ['amount'], // コインを増やす
    gainMp: ['amount'], // マナ回復：MP を増やす（上限を超えたぶんは捨てる）
    changeWeather: [], // 天候の呪文：天候をランダムに変える
    setTime: [], // 刻の魔法：time（"night" か "day"）にする（ムーンライズ・ドーンブレイク）
    wild: [], // 適応：どのカードとでも合成できる（出せない。合成専用）
    summonSpirit: ['amount', 'turns'], // 精霊：数ターンのあいだ続く効果（1人1体まで）
    drainMp: ['amount'], // MPドレイン：相手の MP を amount 奪って自分の MP にする（MP は使わない）
    drainCastle: ['amount'], // 生命吸収：相手の城に amount ダメージ。城HPを実際に減らしたぶん自分の城を回復
    sacrificeAttack: ['amount', 'selfDamage'], // 捨て身：自分の城HPを selfDamage 払って、相手の城に amount ダメージ
    damageAllSoldiers: ['amount'], // 爆発：場にいる兵士全員（自分の兵士も）に amount ダメージ
    damageCastleAndHeal: ['amount', 'heal'], // 吸血（ヴァンパイアのカード）：相手の城に amount ダメージ、自分の城を heal 回復
    healCastleOrMp: ['amount'], // スライムのカード：城HPか MP のどちらかをランダムに amount 回復
    healAndArmor: ['amount', 'armor'], // トレントのカード：自分の城HPを amount 回復し、城壁を armor 置く
    stealCoins: ['amount'], // ミミックのカード：相手のコインを amount 枚まで奪う
    damageEnemyAll: ['amount'], // 魔王のカード：相手の城と、相手の兵士全員に amount ダメージ
    dice: [], // サイコロ：1〜6の目 × per の効果（dice で種類を決める。下の DICE_KINDS）
  },
  defense: {
    shieldSoldier: ['amount'],
    armorCastle: ['amount'],
    reflectSpell: [], // 反射：城に当たる魔法を、相手の城に返す（攻撃を受けたときだけ）
    nullifySoldier: [], // 身代わり：城に着いた兵士1体のダメージを無効にする（攻撃を受けたときだけ）
  },
};

/** scope（レーンを選ぶか）を書ける effect。lane なら選んだ1レーンの相手の兵士だけに効く */
export const LANE_SCOPE_EFFECTS = ['damageEnemySoldiers', 'poisonEnemySoldiers', 'freezeEnemySoldiers', 'pushBackEnemySoldiers'];

/** 攻撃ではない魔法（精霊・コイン）。メインを使わず、何枚でも出せる（slot は "support"） */
export const SUPPORT_EFFECTS = ['summonSpirit', 'gainCoins', 'gainMp', 'curePoison'];

/** MP を使う魔法（攻撃の魔法と精霊）。コストはレアリティ（rarities.json の mpCost）か、カードの mpCost。rules.maxMp が 0 のときは MP を使わない */
/**
 * サイコロの種類（cards.json の dice）。効果は「出た目 × per」（端数は切り上げ）。random は per を書かない
 *   attack：相手の城にダメージ（MP を使う。メイン）／heal：自分の城を回復（メイン）／mana：MP 回復／coin：コイン
 *   shield：城壁／buff：選んだ自分の兵士1体の攻撃力を上げる／random：ほかのサイコロのどれか（目は4〜6）（メイン）
 *   god：1回振って、その目で6つのサイコロの効果が全部起きる（バフは兵士全員）（メイン）
 */
export const DICE_KINDS = ['attack', 'heal', 'mana', 'coin', 'shield', 'buff', 'random', 'god'];
/** 効果が1つのサイコロ（ランダム・ゴッドが使う種類） */
export const BASIC_DICE = ['attack', 'heal', 'mana', 'coin', 'shield', 'buff'];
/** メインを使わず何枚でも出せるサイコロ（ほかはメイン） */
export const SUPPORT_DICE = ['mana', 'coin', 'shield', 'buff'];

export const MP_EFFECTS = ['damageEnemyCastle', 'damageEnemySoldiers', 'poisonEnemySoldiers', 'poisonEnemy', 'freezeEnemySoldiers', 'pushBackEnemySoldiers', 'chainBlast', 'ignitionBurst', 'armorBlast', 'purifyFlare', 'summonSpirit', 'drainCastle', 'sacrificeAttack', 'damageAllSoldiers'];

/**
 * kind → 出し方（slot）。soldier は1ターン rules.soldiersPerTurn 枚、main（攻撃の魔法など）は1ターン1枚、
 * addon・defense・support は何枚でも
 */
export const SLOT_OF_KIND = {
  soldier: 'soldier',
  spell: 'main',
  weapon: 'addon',
  defense: 'defense',
};

export class Card {
  /**
   * @param {string} cardId 山札の1枚ごとの一意なID（例: "c07"）
   * @param {string} type   cards.json のキー（例: "infantry"）
   * @param {object} def    cards.json の type に対応する定義
   */
  constructor(cardId, type, def) {
    this.cardId = cardId;
    this.type = type;
    this.def = def;
  }

  get kind() {
    return this.def.kind;
  }

  /** "soldier" | "main" | "addon" | "defense" | "support" */
  get slot() {
    if (this.def.kind === 'spell' && SUPPORT_EFFECTS.includes(this.def.effect)) return 'support';
    if (this.def.effect === 'dice' && SUPPORT_DICE.includes(this.def.dice)) return 'support';
    return SLOT_OF_KIND[this.def.kind];
  }

  get isSoldier() {
    return this.def.kind === 'soldier';
  }

  get isSpell() {
    return this.def.kind === 'spell';
  }

  /** 使い切り（使ったら山札に戻らない）か */
  get isExhaust() {
    return this.def.exhaust === true;
  }

  toState() {
    return { cardId: this.cardId, type: this.type };
  }

  /**
   * cards.json の中身をチェックする。書き間違いがあれば、どこが悪いかを書いた Error を投げる。
   * （不正な「操作」は例外にしない約束だが、データの書き間違いは起動時に気づけるよう例外にする）
   */
  static validateDefinitions(cards, rarities = null, { factions = null, races = null } = {}) {
    if (!cards || typeof cards !== 'object' || Array.isArray(cards)) {
      throw new Error('cards.json はカード種類をキーにしたオブジェクトにしてください');
    }
    const types = Object.keys(cards);
    if (types.length === 0) throw new Error('cards.json にカードがありません');

    const isCount = (v) => Number.isInteger(v) && v >= 0;
    const isPositive = (v) => Number.isInteger(v) && v > 0;

    for (const type of types) {
      const def = cards[type];
      const where = `cards.json の "${type}"`;
      if (!def || typeof def !== 'object') throw new Error(`${where}: 定義がオブジェクトではありません`);
      if (typeof def.name !== 'string' || def.name === '') throw new Error(`${where}: name を書いてください`);
      if (!CARD_KINDS.includes(def.kind)) throw new Error(`${where}: kind は ${CARD_KINDS.join(' / ')} のどれかです`);
      if (!isCount(def.count)) throw new Error(`${where}: count は0以上の整数にしてください`);
      if (rarities) {
        if (!Object.hasOwn(rarities, def.rarity)) throw new Error(`${where}: rarity は ${Object.keys(rarities).join(' / ')} のどれかにしてください`);
        if (def.weight !== undefined && !(typeof def.weight === 'number' && def.weight >= 0)) throw new Error(`${where}: weight は0以上の数にしてください（書かなければ 1）`);
        const order = Object.keys(rarities).filter((id) => !rarities[id].special);
        const next = order[order.indexOf(def.rarity) + 1];
        if (def.monster !== undefined) {
          // 倒した魔物の兵士カード：合成しない（魔物を倒したごほうびだけで手に入る）
          if (def.fuseTo !== undefined) throw new Error(`${where}: 魔物の兵士カード（monster）に fuseTo は書けません`);
        } else if (def.effect === 'wild' || rarities[def.rarity].special) {
          if (def.fuseTo !== undefined) throw new Error(`${where}: 適応（effect: "wild"）やスペシャルのカードに fuseTo は書けません（合成の結果は相手のカードで決まる）`);
        } else if (def.fuseTo === null) {
          // fuseTo: null … 合成できないカード（はっきり書いたときだけ。書き忘れは下で弾く）
        } else if (next === undefined) {
          if (def.fuseTo !== undefined) throw new Error(`${where}: いちばん上のレアリティのカードに fuseTo は書けません`);
        } else {
          if (typeof def.fuseTo !== 'string' || !Object.hasOwn(cards, def.fuseTo)) throw new Error(`${where}: fuseTo に、合成してできるカード種類を書いてください`);
          if (cards[def.fuseTo].rarity !== next) throw new Error(`${where}: fuseTo は1つ上のレアリティ（${next}）のカードにしてください`);
        }
      }
      if (def.deckAs !== undefined && (typeof def.deckAs !== 'string' || (rarities && (!Object.hasOwn(rarities, def.deckAs) || rarities[def.deckAs].special)))) {
        throw new Error(`${where}: deckAs（デッキ編成で数えるレアリティ）は、スペシャル以外のレアリティにしてください`);
      }
      // 陣営・種族・進化の系統（どれも任意。一覧を渡されたときだけ、キーが合っているか確かめる）
      // faction：陣営のID（factions.json のキー）か、全陣営共通の "common"。書かなければ旧カード（陣営なし）
      if (def.faction !== undefined && !isValidFactionId(def.faction, factions)) {
        throw new Error(`${where}: faction は ${factions ? [...Object.keys(factions), COMMON_FACTION].join(' / ') : '陣営のID（文字列）'} のどれかにしてください`);
      }
      // 合成先が別の陣営のカードにならないように（両方に faction があるときだけ。旧カードは互換のため確かめない）
      if (def.faction !== undefined && typeof def.fuseTo === 'string' && Object.hasOwn(cards, def.fuseTo)) {
        const to = cards[def.fuseTo];
        if (to && to.faction !== undefined && to.faction !== def.faction) {
          throw new Error(`${where}: 合成先「${to.name}」（${def.fuseTo}）は別の陣営です（${def.faction} → ${to.faction}）`);
        }
      }
      // implemented：false なら陣営モードの候補から外す（台帳だけあって効果がまだないカード）。書かなければ true
      if (def.implemented !== undefined && typeof def.implemented !== 'boolean') {
        throw new Error(`${where}: implemented は true か false にしてください（書かなければ true）`);
      }
      // 四大陣営（PR-B）：effectPlan（まだない効果の説明）・implementationNote（実装のメモ）は文字列。Game は使わない
      for (const key of ['effectPlan', 'implementationNote']) {
        if (def[key] !== undefined && typeof def[key] !== 'string') throw new Error(`${where}: ${key} は文字列にしてください`);
      }
      // factionOnly：true なら陣営モードの候補でだけ引き当てる（陣営なしの山札・ドローの引き当て・入手券・魔物のごほうびには出ない）
      if (def.factionOnly !== undefined && typeof def.factionOnly !== 'boolean') {
        throw new Error(`${where}: factionOnly は true か false にしてください（書かなければ false）`);
      }
      if (def.race !== undefined && (typeof def.race !== 'string' || (races && !Object.hasOwn(races, def.race)))) {
        throw new Error(`${where}: race は ${races ? Object.keys(races).join(' / ') : '種族のID（文字列）'} のどれかにしてください`);
      }
      if (def.evolutionLine !== undefined && (typeof def.evolutionLine !== 'string' || def.evolutionLine === '')) {
        throw new Error(`${where}: evolutionLine は進化の系統ID（空でない文字列）にしてください`);
      }
      if (def.mpCost !== undefined && !isCount(def.mpCost)) throw new Error(`${where}: mpCost は0以上の整数にしてください（書かなければレアリティで決まる）`);
      if (def.exhaust !== undefined && typeof def.exhaust !== 'boolean') {
        throw new Error(`${where}: exhaust は true か false にしてください（書かなければ false）`);
      }
      // 魔法の element は、兵士に当たったときの付着・反応（属性の反応）に使う
      if (def.element !== undefined && def.kind !== 'weapon' && def.kind !== 'spell') {
        throw new Error(`${where}: element を書けるのは武器（kind: "weapon"）と魔法（kind: "spell"）だけです`);
      }
      if (def.element !== undefined && def.element !== null && !ELEMENTS.includes(def.element)) {
        throw new Error(`${where}: element は ${ELEMENTS.join(' / ')} のどれかにしてください（書かなければ属性なし）`);
      }

      if (def.effect === 'dice') {
        if (!DICE_KINDS.includes(def.dice)) throw new Error(`${where}: dice は ${DICE_KINDS.join(' / ')} のどれかにしてください`);
        if (def.dice === 'random' || def.dice === 'god') {
          if (def.per !== undefined) throw new Error(`${where}: ランダム・ゴッドのサイコロに per は書けません`);
          // randomCost：振る前に、このうち払えるものを1つランダムに払う（{ hp?, coins?, mp? }。省略するとコストなし）
          if (def.randomCost !== undefined) {
            const keys = Object.keys(def.randomCost ?? {});
            if (!def.randomCost || typeof def.randomCost !== 'object' || keys.length === 0
              || !keys.every((k) => ['hp', 'coins', 'mp'].includes(k) && Number.isInteger(def.randomCost[k]) && def.randomCost[k] > 0)) {
              throw new Error(`${where}: randomCost は { hp, coins, mp } のうち1つ以上を、1以上の整数で書いてください`);
            }
          }
        } else if (!(typeof def.per === 'number' && def.per > 0)) {
          throw new Error(`${where}: per（出た目に掛ける数）は 0 より大きい数にしてください`);
        }
      } else if (def.dice !== undefined) {
        throw new Error(`${where}: dice を書けるのは effect が dice の魔法だけです`);
      }

      if (def.effect === 'summonSpirit') {
        if (!SPIRIT_KINDS.includes(def.spirit)) throw new Error(`${where}: spirit は ${SPIRIT_KINDS.join(' / ')} のどれかにしてください`);
      } else if (def.spirit !== undefined) {
        throw new Error(`${where}: spirit を書けるのは effect が summonSpirit の魔法だけです`);
      }

      if (def.effect === 'setTime' && def.time !== 'night' && def.time !== 'day') {
        throw new Error(`${where}: time は "night"（夜にする）か "day"（昼にする）にしてください`);
      }
      if (def.beast !== undefined && (def.kind !== 'soldier' || typeof def.beast !== 'boolean')) {
        throw new Error(`${where}: beast（獣）は兵士にだけ、true か false で書けます`);
      }

      if (def.scope !== undefined) {
        if (def.scope !== 'all' && def.scope !== 'lane') throw new Error(`${where}: scope は "all"（相手の全レーン）か "lane"（選んだ1レーン）にしてください（書かなければ "all"）`);
        if (!LANE_SCOPE_EFFECTS.includes(def.effect)) {
          throw new Error(`${where}: scope を書けるのは ${LANE_SCOPE_EFFECTS.join(' / ')} の魔法だけです`);
        }
      }

      if (def.monster !== undefined && (typeof def.monster !== 'string' || (def.kind !== 'soldier' && def.kind !== 'spell'))) {
        throw new Error(`${where}: monster（魔物の種類）を書けるのは兵士か魔法のカード（kind: "soldier" / "spell"）だけです`);
      }

      if (def.kind === 'soldier') {
        // role：兵士の役割。省略すると "melee"（進んで城を攻める）。"archer"（弓兵）・"mage"（魔法使い）は動かずに撃つ
        const role = def.role ?? 'melee';
        if (!SOLDIER_ROLES.includes(role)) throw new Error(`${where}: role は ${SOLDIER_ROLES.join(' / ')} のどれかにしてください（書かなければ melee）`);
        const moving = MOVING_ROLES.includes(role);
        const keys = moving ? ['hp', 'attack', 'speed'] : role === 'guard' ? ['hp', 'attack', 'stay'] : ['hp', 'attack', 'range', 'stay'];
        for (const key of keys) {
          if (!isPositive(def[key])) throw new Error(`${where}: ${key} は1以上の整数にしてください`);
        }
        if (!moving && def.speed !== undefined) throw new Error(`${where}: 弓兵・魔法使い（role: ${role}）は動かないので speed は書けません`);
      } else if (def.kind === 'weapon') {
        if (!isCount(def.attackBonus)) throw new Error(`${where}: attackBonus は0以上の整数にしてください`);
      } else if (def.implemented === false && def.effect === undefined) {
        // まだ効果がないカード（台帳だけ）：effect を省略して、effectPlan に将来の効果を書ける。手札から出せない（Game が止める）
      } else {
        const effects = EFFECTS[def.kind];
        if (!Object.hasOwn(effects, def.effect)) {
          throw new Error(`${where}: effect は ${Object.keys(effects).join(' / ')} のどれかです`);
        }
        for (const key of effects[def.effect]) {
          if (!isPositive(def[key])) throw new Error(`${where}: ${key} は1以上の整数にしてください`);
        }
      }
    }
  }
}
