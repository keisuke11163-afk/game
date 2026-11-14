// 見た目の割り当て（種類 → 絵文字・色）。画像に差しかえるときは、ここだけを直す。
// ゲームのルールの数値は data/ にある。ここには見た目だけを書く。

/** 属性：名前・絵文字・色 */
export const ELEMENT_LOOK = {
  fire: { name: '火', icon: '🔥', color: '#f97316' },
  water: { name: '水', icon: '💧', color: '#38bdf8' },
  wood: { name: '木', icon: '🌿', color: '#4ade80' },
};

/** 兵士の駒に出す文字（なければカード名の1文字目） */
export const SOLDIER_MARK = {
  infantry: '歩',
  knight: '騎',
};

/** 武器の絵文字（なければ属性の絵文字） */
export const WEAPON_ICON = {
  flameSword: '🗡️',
  waterSpear: '🔱',
  woodAxe: '🪓',
};

/** 魔物の絵文字 */
export const MONSTER_ICON = {
  slime: '🫧',
  goblin: '👺',
  dragon: '🐉',
};
export const MONSTER_ICON_DEFAULT = '👾';

/** 状態異常の絵文字 */
export const STATUS_ICON = {
  poison: '☠️',
  frozen: '❄️',
};

/** 強化の絵文字 */
export const UPGRADE_ICON = {
  repair: '🔨',
  recruit: '🃏',
  sharpen: '🪨',
};
export const UPGRADE_ICON_DEFAULT = '⭐';

/** そのほかの記号 */
export const ICON = {
  shield: '🛡️',
  armor: '🧱',
  coin: '🪙',
  clash: '💥',
  round: '🔁',
};

/** 兵士が光るときの色（武器に属性がないとき・盾・とぎ石） */
export const GLOW = {
  weapon: '#fbbf24',
  shield: '#93c5fd',
  buff: '#fbbf24',
};

/** 魔法の効果ごとの、魔法が当たったときの色（毒の霧・氷の息など） */
export const SPELL_TINT = {
  poisonEnemySoldiers: 'rgba(132, 204, 22, 0.45)',
  freezeEnemySoldiers: 'rgba(125, 211, 252, 0.5)',
};

export function soldierMark(type, def) {
  return SOLDIER_MARK[type] ?? String(def?.name ?? type).charAt(0);
}

export function weaponIcon(type, element) {
  return WEAPON_ICON[type] ?? ELEMENT_LOOK[element]?.icon ?? '⚔';
}

export function monsterIcon(type) {
  return MONSTER_ICON[type] ?? MONSTER_ICON_DEFAULT;
}

export function upgradeIcon(id) {
  return UPGRADE_ICON[id] ?? UPGRADE_ICON_DEFAULT;
}
