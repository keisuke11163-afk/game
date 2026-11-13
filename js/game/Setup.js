// STEP 5 の設定データ（城の種類・デッキ）のチェック。間違いは例外（どこが悪いかを書く）。

export const CASTLE_KEYS = ['hpBonus', 'maxHandBonus', 'castleSpellBonus', 'soldierAttackBonus'];

/** castles.json の中身をチェックする */
export function validateCastles(castles) {
  if (!castles || typeof castles !== 'object' || Array.isArray(castles)) {
    throw new Error('castles.json は城の種類をキーにしたオブジェクトにしてください');
  }
  for (const [type, def] of Object.entries(castles)) {
    const where = `castles.json の "${type}"`;
    if (!def || typeof def !== 'object') throw new Error(`${where}: 定義がオブジェクトではありません`);
    if (typeof def.name !== 'string' || def.name === '') throw new Error(`${where}: name を書いてください`);
    for (const key of CASTLE_KEYS) {
      if (def[key] !== undefined && !Number.isInteger(def[key])) throw new Error(`${where}: ${key} は整数にしてください`);
    }
  }
}

/** decks.json の中身をチェックする（カードの種類は cards.json にあるものだけ） */
export function validateDecks(decks, cards) {
  if (!decks || typeof decks !== 'object' || Array.isArray(decks)) {
    throw new Error('decks.json はデッキのIDをキーにしたオブジェクトにしてください');
  }
  for (const [id, def] of Object.entries(decks)) {
    const where = `decks.json の "${id}"`;
    if (!def || typeof def !== 'object') throw new Error(`${where}: 定義がオブジェクトではありません`);
    if (typeof def.name !== 'string' || def.name === '') throw new Error(`${where}: name を書いてください`);
    if (!def.cards || typeof def.cards !== 'object') throw new Error(`${where}: cards（カード種類 → 枚数）を書いてください`);
    let total = 0;
    for (const [type, n] of Object.entries(def.cards)) {
      if (!Object.hasOwn(cards, type)) throw new Error(`${where}: "${type}" というカードはありません`);
      if (!Number.isInteger(n) || n < 0) throw new Error(`${where}: "${type}" の枚数は0以上の整数にしてください`);
      total += n;
    }
    if (total === 0) throw new Error(`${where}: カードが1枚もありません`);
  }
}

/** 山札1組（山札・捨て札・使い切り置き場） */
export class Pile {
  constructor(owner) {
    /** だれの山札か（全員共通なら null） */
    this.owner = owner;
    /** 先頭（index 0）から引く */
    this.deck = [];
    this.discard = [];
    /** 使い切りのカード（exhaust: true）は、使ったらここへ行き、山札には戻らない */
    this.exhausted = [];
  }
}
