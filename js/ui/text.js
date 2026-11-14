// 画面に出す文章。カード名と数値は cards.json / rules.json から入れる。

/** "p1" → "プレイヤー1" */
export function playerName(playerId) {
  return `プレイヤー${String(playerId).replace(/^p/, '')}`;
}

export const KIND_LABEL = {
  soldier: '兵士',
  spell: '魔法',
};

// 魔法の効果（cards.json の effect）ごとの説明文の型
const EFFECT_TEXT = {
  damageEnemyCastle: (c) => `相手の城に${c.amount}ダメージ`,
  damageEnemySoldiers: (c) => `相手のレーン上の兵士全員に${c.amount}ダメージ`,
  healOwnCastle: (c, rules) => `自分の城HP+${c.amount}（上限${rules.castleMaxHp}）`,
};

/** カードの説明文 */
export function cardDescription(def, rules) {
  if (!def) return '';
  if (def.description) return def.description;
  if (def.kind === 'soldier') {
    return `HP${def.hp}・攻撃${def.attack}・1ターンに${def.speed}マス進む`;
  }
  const make = EFFECT_TEXT[def.effect];
  return make ? make(def, rules) : '';
}

// ロジックが reason をコード（英字）で返した場合の言いかえ。日本語の文が来たらそのまま出す。
const REASON_TEXT = {
  notYourTurn: 'いまはあなたの番ではありません',
  alreadyPlayed: 'カードは1ターンに1枚までです',
  cardNotInHand: 'そのカードは手札にありません',
  notInHand: 'そのカードは手札にありません',
  wrongPhase: 'いまはその操作はできません',
  invalidPhase: 'いまはその操作はできません',
  gameOver: 'ゲームは終わっています',
  mustDiscard: '先に手札を捨ててください',
  wrongDiscardCount: '捨てる枚数が合っていません',
  noTarget: '効果をあてる相手がいません',
};

export function reasonText(reason) {
  if (!reason) return 'いまはこの操作はできません';
  return REASON_TEXT[reason] ?? String(reason);
}

// 魔法の効果ごとに、カードの角に出す数字の形
const EFFECT_NUMBER = {
  healOwnCastle: (c) => `+${c.amount}`,
};

/**
 * カードの角のメダルに出す数字 [左上, 右上]。兵士は攻撃とHP、魔法は効果の量（左上だけ）
 * @returns {[{text:string, icon:string}|null, {text:string, icon:string}|null]}
 */
export function cardNumbers(def) {
  if (!def) return [null, null];
  if (def.kind === 'soldier') {
    return [{ text: String(def.attack), icon: 'sword' }, { text: String(def.hp), icon: 'heart' }];
  }
  if (def.amount == null) return [null, null];
  const make = EFFECT_NUMBER[def.effect];
  return [{ text: make ? make(def) : String(def.amount), icon: '' }, null];
}
