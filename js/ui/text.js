// 画面に出す文章。カード名と数値は cards.json / rules.json / monsters.json / upgrades.json から入れる。

import { ELEMENT_LOOK, STATUS_ICON, ICON } from './look.js';

/** "p1" → "プレイヤー1" */
export function playerName(playerId) {
  return `プレイヤー${String(playerId).replace(/^p/, '')}`;
}

export const KIND_LABEL = {
  soldier: '兵士',
  spell: '魔法',
  weapon: '武器',
  defense: '防御',
};

/** 1ターンに出せる枚数の説明（kind で決まる。CLAUDE.md「1ターンに出せる枚数」） */
export function slotNote(def) {
  if (!def) return '';
  if (def.kind === 'weapon') return '付加：何枚でも出せる';
  if (def.kind === 'defense') return '防御：何枚でも出せる';
  return 'メイン：1ターンに1枚';
}

/** 属性の名前（"fire" → "火"） */
export function elementName(element) {
  return ELEMENT_LOOK[element]?.name ?? '';
}

/** その属性が強い相手の属性（水は火に強い、火は木に強い、木は水に強い） */
const ELEMENT_BEATS = { water: 'fire', fire: 'wood', wood: 'water' };

// 効果（cards.json の effect）ごとの説明文の型
const EFFECT_TEXT = {
  damageEnemyCastle: (c, rules, opts) => `相手の城に${c.amount}ダメージ${opts.monsters ? '（魔物も狙える）' : ''}`,
  damageEnemySoldiers: (c) => `相手の兵士全員に${c.amount}ダメージ`,
  healOwnCastle: (c) => `自分の城HP+${c.amount}（上限まで）`,
  poisonEnemySoldiers: (c) => `相手の兵士全員に毒（${c.amount}ダメージ×${c.turns}回・盾が効かない）`,
  freezeEnemySoldiers: (c) => `相手の兵士全員を${c.turns}回休みにする`,
  shieldSoldier: (c) => `自分の兵士に盾${c.amount}（ダメージを先に受ける）`,
  armorCastle: (c) => `自分の城を${c.amount}守る（次の自分のターンまで）`,
};

/**
 * カードの説明文
 * @param {object} def cards.json のカード
 * @param {object} rules rules.json
 * @param {{ monsters?: boolean }} [opts] monsters：魔物が出るゲームか
 */
export function cardDescription(def, rules, opts = {}) {
  if (!def) return '';
  if (def.description) return def.description;
  let text = '';
  if (def.kind === 'soldier') {
    text = `HP${def.hp}・攻撃${def.attack}・1ターンに${def.speed}マス進む`;
  } else if (def.kind === 'weapon') {
    const el = def.element ? elementName(def.element) : '';
    const weak = def.element ? elementName(ELEMENT_BEATS[def.element]) : '';
    text = `自分の兵士に持たせる：攻撃+${def.attackBonus}`;
    if (el) {
      text += `・${el}属性`;
      text += rules?.elementBonus ? `（${weak}の相手に+${rules.elementBonus}）` : `（${weak}に強い）`;
    }
  } else {
    const make = EFFECT_TEXT[def.effect];
    text = make ? make(def, rules ?? {}, opts) : '';
  }
  if (def.exhaust) text += '。使い切り';
  return text;
}

/** 強化の説明文（upgrades.json の effect と amount から） */
const UPGRADE_TEXT = {
  repairCastle: (u) => `自分の城HP+${u.amount}（上限まで）`,
  drawCards: (u) => `${u.amount}枚引く`,
  sharpenSoldiers: (u) => `道の上の自分の兵士全員の攻撃+${u.amount}（ずっと）`,
};

export function upgradeDescription(def) {
  if (!def) return '';
  if (def.description) return def.description;
  return UPGRADE_TEXT[def.effect]?.(def) ?? '';
}

/** 兵士の詳しい情報（タップしたとき） */
export function soldierInfo(s, { cards, rules, viewerId }) {
  const def = cards[s.type] ?? {};
  const owner = s.playerId === viewerId ? 'あなた' : playerName(s.playerId);
  const parts = [`${def.name ?? s.type}（${owner}）`, `HP${Math.max(0, s.hp)}`, `攻撃${s.attack}`,
    `位置${Math.min(s.position, rules.laneLength)}/${rules.laneLength}`];
  if (s.weapon) {
    const el = s.element ? `・${elementName(s.element)}属性` : '';
    parts.push(`${cards[s.weapon]?.name ?? s.weapon}${el}`);
  }
  if (s.shield > 0) parts.push(`${ICON.shield}盾${s.shield}`);
  const poison = s.statuses?.poison;
  if (poison) {
    parts.push(poison.amount != null ? `${STATUS_ICON.poison}毒${poison.amount}×あと${poison.turns}回`
      : `${STATUS_ICON.poison}毒（あと${poison.turns}回）`);
  }
  if (s.statuses?.frozen > 0) parts.push(`${STATUS_ICON.frozen}凍結（あと${s.statuses.frozen}回休み）`);
  return parts.join('・');
}

/** 魔物の詳しい情報（タップしたとき） */
export function monsterInfo(m, { monsters }) {
  const def = monsters?.[m.type] ?? {};
  const el = m.element ? `（${elementName(m.element)}属性）` : '';
  const parts = [`${def.name ?? m.type}${el}`, `HP${m.hp}/${m.maxHp}`, `攻撃${m.attack}`];
  if (m.reward != null) parts.push(`とどめで${ICON.coin}${m.reward}`);
  if (m.attackIn != null && m.castleAttack != null) {
    parts.push(m.attackIn <= 1 ? `次の周回でどちらかの城に${m.castleAttack}ダメージ`
      : `あと${m.attackIn}周でどちらかの城に${m.castleAttack}ダメージ`);
  }
  return parts.join('・');
}

/** 勝ち方の説明（gameOver の reason） */
export const GAME_OVER_TEXT = {
  castleDestroyed: '城を落とした！',
  monsterDestroyed: '魔物が城を落とした！', // 画面だけの値（最後の城ダメージが魔物の攻撃だったとき）
  lastStanding: '最後まで城が残った！',
  roundLimit: '周回の上限：城HPの残りが多い方の勝ち',
};

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
