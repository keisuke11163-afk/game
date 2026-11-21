// 見た目の割り当て（種類 → 絵文字・色）。画像に差しかえるときは、ここだけを直す。
// ゲームのルールの数値は data/ にある。ここには見た目だけを書く。

/** 属性：名前・絵文字（飛び出す文字用）・記号の名前（art.js の icon()）・色 */
export const ELEMENT_LOOK = {
  fire: { name: '火', icon: '🔥', iconName: 'fire', color: '#f97316' },
  water: { name: '水', icon: '💧', iconName: 'water', color: '#38bdf8' },
  wind: { name: '風', icon: '🌀', iconName: 'wind', color: '#34d399' },
  earth: { name: '土', icon: '⛰️', iconName: 'earth', color: '#b08850' },
  ice: { name: '氷', icon: '❄️', iconName: 'ice', color: '#7dd3fc' },
  thunder: { name: '雷', icon: '⚡', iconName: 'thunder', color: '#facc15' },
  dark: { name: '闇', icon: '🌑', iconName: 'dark', color: '#7c5cbf' },
  light: { name: '光', icon: '✨', iconName: 'light', color: '#fde68a' },
  chaos: { name: '混沌', icon: '🌀', iconName: 'chaos', color: '#c026d3' },
};

/** 兵士の駒に出す文字（なければカード名の1文字目） */
export const SOLDIER_MARK = {
  infantry: '歩',
  knight: '騎',
  spearman: '槍',
  heavy: '重',
  giant: '巨',
};

/** 武器の絵文字（なければ属性の絵文字） */
export const WEAPON_ICON = {
  flameSword: '🗡️',
  waterSpear: '🔱',
  windBow: '🏹',
  earthHammer: '🔨',
  ironSword: '⚔️',
  iceBlade: '🗡️',
  thunderAxe: '🪓',
  darkScythe: '🌙',
  lightLance: '🔱',
  chaosStaff: '🪄',
};

/** 魔物の絵文字 */
export const MONSTER_ICON = {
  slime: '🫧',
  goblin: '👺',
  dragon: '🐉',
  bat: '🦇',
  skeleton: '💀',
  golem: '🗿',
  demon: '😈',
};
export const MONSTER_ICON_DEFAULT = '👾';

/** 状態異常の絵文字 */
export const STATUS_ICON = {
  poison: '☠️',
  frozen: '❄️',
  burn: '🔥',
};

/** 強化の絵文字 */
export const UPGRADE_ICON = {
  repair: '🔨',
  recruit: '🃏',
  sharpen: '🪨',
  greatRepair: '🏗️',
  greatRecruit: '📚',
  whetstone: '💎',
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
  poisonEnemy: 'rgba(132, 204, 22, 0.45)',
  freezeEnemySoldiers: 'rgba(125, 211, 252, 0.5)',
  pushBackEnemySoldiers: 'rgba(226, 244, 236, 0.55)',
  purifyFlare: 'rgba(255, 228, 140, 0.5)',
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

/** 強化の記号（art.js の icon() の名前） */
export const UPGRADE_ICON_NAME = {
  permLuck: 'luck',
  repair: 'hammer',
  recruit: 'card',
  sharpen: 'stone',
};
