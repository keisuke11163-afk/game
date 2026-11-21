import { RARITY_NAMES } from './rarity.js';
// 画面に出す文章。カード名と数値は cards.json / rules.json / monsters.json / upgrades.json から入れる。

import { ELEMENT_LOOK, STATUS_ICON, ICON } from './look.js';
import { DEFAULT_ELEMENTS, elementsBeatenBy } from '../game/Elements.js';

// オンライン対戦では、部屋に入るときに入れた名前を出す（同じ端末のときは空）
let customNames = {};

/** @param {{ [playerId: string]: string }} names 空のオブジェクトで元に戻る */
export function setPlayerNames(names) {
  customNames = { ...names };
}

/** "p1" → "プレイヤー1"（オンラインでは入れた名前） */
export function playerName(playerId) {
  return customNames[playerId] || `プレイヤー${String(playerId).replace(/^p/, '')}`;
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
  if (def.effect === 'reflectSpell' || def.effect === 'nullifySoldier') return '防御：攻撃を受けたときだけ出せる';
  if (def.kind === 'defense') return '防御：何枚でも出せる';
  if (def.effect === 'wild') return '合成専用：どのカードとでも合成できる（出せません）';
  if (def.kind === 'soldier') return '兵士：1ターンに複数枚出せる';
  if (['summonSpirit', 'gainCoins', 'gainMp'].includes(def.effect)) return '精霊・コイン・マナ：何枚でも出せる（メインを使わない）';
  return 'メイン：攻撃の魔法・回復は1ターンに1枚';
}

/** 属性の名前（"fire" → "火"） */
export function elementName(element) {
  return ELEMENT_LOOK[element]?.name ?? '';
}

// 効果（cards.json の effect）ごとの説明文の型
const missingDescriptions = new Set();
const EFFECT_TEXT = {
  gainCoins: (c) => `コインを${c.amount}獲得（何枚でも出せる）`,
  gainMp: (c) => `MPを${c.amount}回復（上限を超えたぶんは捨てる。何枚でも出せる）`,
  damageEnemyCastle: (c, rules, opts) => `相手の城に${c.amount}ダメージ${opts.monsters ? '（魔物も狙える）' : ''}`,
  damageEnemySoldiers: (c) => `相手の兵士全員に${c.amount}ダメージ`,
  healOwnCastle: (c) => `自分の城HP+${c.amount}（上限まで）`,
  poisonEnemySoldiers: (c) => `相手の兵士全員に毒（${c.amount}ダメージ×${c.turns}回・盾が効かない）`,
  poisonEnemy: (c, rules) => {
    const term = rules?.poisonTurns ? `${rules.poisonTurns}ターン続く毒` : '永続の毒';
    const cap = rules?.poisonMax ? `（量は${rules.poisonMax}まで）` : '';
    return `相手の兵士全員と城を、${term}にする（毎ターン${c.amount}ダメージ。重ねがけは足し算${cap}。盾・城壁は効かない。解毒薬で治る）`;
  },
  curePoison: () => '自分の毒状態（兵士・城）をすべて治す。毒にかかっていないと出せない。何枚でも出せる',
  freezeEnemySoldiers: (c) => `相手の兵士全員を${c.turns}回休みにする`,
  chainBlast: (c) => `相手の兵士1体に${c.amount}ダメージ。まわりの兵士にも${Math.ceil(c.amount / 2)}`,
  ignitionBurst: (c) => `自分の城に${c.selfDamage}ダメージ。相手の兵士全員と城に${c.amount}ダメージ`,
  armorBlast: () => '自分の城壁の値だけ相手の城にダメージ（城壁は0になる）',
  purifyFlare: (c) => `自分の毒・やけど・凍結を治し、相手の兵士全員に${c.amount}ダメージ`,
  pushBackEnemySoldiers: (c) => `相手の兵士全員を${c.amount}マス押し戻す（城の前より後ろには下がらない）`,
  shieldSoldier: (c) => `自分の兵士に盾${c.amount}（ダメージを先に受ける）`,
  summonSpirit: (c) => {
    const t = c.turns;
    const text = {
      fire: `精霊を呼ぶ：${t}ターン、毎ターン相手の城に${c.amount}ダメージ`,
      water: `精霊を呼ぶ：${t}ターン、毎ターン自分の城HP+${c.amount}`,
      wind: `精霊を呼ぶ：${t}ターン、自分の兵士が1ターンに最低${c.amount}マス進む`,
      earth: `精霊を呼ぶ：${t}ターン、自分の城と兵士が受けるダメージ-${c.amount}（最低1）`,
    }[c.spirit];
    return `${text}。1人1体まで（呼ぶと入れ替わる）`;
  },
  armorCastle: (c, rules) => rules?.armorMax
    ? `自分の城を${c.amount}守る（消えずに残る。重ねられて、合計${rules.armorMax}まで）`
    : `自分の城を${c.amount}守る（次の自分のターンまで）`,
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
    text = def.role === 'archer' || def.role === 'mage'
      ? `HP${def.hp}・攻撃${def.attack}・動かず射程${def.range}マスの兵士・魔物を撃つ。${def.stay}ターンで帰還${def.role === 'mage' ? '。相手がいなければ城を撃つ' : ''}`
      : `HP${def.hp}・攻撃${def.attack}・1ターンに${def.speed}マス進む`;
  } else if (def.kind === 'weapon') {
    const el = def.element ? elementName(def.element) : '';
    const weak = def.element ? elementsBeatenBy(def.element).map(elementName).join('・') : '';
    text = `自分の兵士に持たせる：攻撃+${def.attackBonus}`;
    if (el) {
      text += `・${el}属性`;
      text += weak ? `（${weak}に強い。攻撃×${DEFAULT_ELEMENTS.multipliers.advantage}）` : '';
    }
  } else {
    const make = EFFECT_TEXT[def.effect];
    text = make ? make(def, rules ?? {}, opts) : '';
  }
  // レーンを選ぶ魔法は、選んだ1レーンの兵士だけに効く（rules.laneCount が2以上のとき）
  if (def.scope === 'lane' && (rules?.laneCount ?? 1) > 1) text = text.replace('相手の兵士全員', '選んだ1レーンの相手の兵士');
  if (!text) {
    if (opts.debug && !missingDescriptions.has(def.effect ?? def.name)) {
      missingDescriptions.add(def.effect ?? def.name);
      console.warn('[description]', def.name, def.effect);
    }
    return '効果の詳細を確認できません。';
  }
  if (def.exhaust) text += '。使い切り';
  return text;
}

/**
 * カードの上に出す短い表示（数字と記号）。[{ icon, text }] の並び。icon は art.js の icon() の名前
 * @param {object} def cards.json のカード
 */
export function cardShort(def) {
  if (!def) return [];
  if (def.kind === 'soldier') {
    // 弓兵・魔法使い（role）は動かないので、速さの代わりに射程を出す
    const third = def.role && def.role !== 'melee' ? { icon: 'target', text: `射${def.range}` } : { icon: 'boot', text: def.speed };
    return [{ icon: 'sword', text: def.attack }, { icon: 'heart', text: def.hp }, third];
  }
  if (def.kind === 'weapon') {
    const list = [{ icon: 'sword', text: `+${def.attackBonus}` }];
    if (ELEMENT_LOOK[def.element]) list.push({ icon: ELEMENT_LOOK[def.element].iconName, text: ELEMENT_LOOK[def.element].name });
    return list;
  }
  switch (def.effect) {
    case 'summonSpirit': return [{ icon: ELEMENT_LOOK[def.spirit]?.iconName ?? 'crown', text: `${def.amount}・${def.turns}回` }];
    case 'gainCoins': return [{ icon: 'coin', text: `+${def.amount}` }];
    case 'gainMp': return [{ icon: 'water', text: `MP+${def.amount}` }];
    case 'damageEnemyCastle': return [{ icon: 'fire', text: `城 -${def.amount}` }];
    case 'damageEnemySoldiers': return [{ icon: 'sword', text: `兵士 -${def.amount}` }];
    case 'healOwnCastle': return [{ icon: 'heart', text: `城 +${def.amount}` }];
    case 'poisonEnemySoldiers': return [{ icon: 'skull', text: `毒 ${def.amount}×${def.turns}` }];
    case 'poisonEnemy': return [{ icon: 'skull', text: `毒 ${def.amount}/ターン` }];
    case 'curePoison': return [{ icon: 'heart', text: '毒を治す' }];
    case 'freezeEnemySoldiers': return [{ icon: 'snow', text: `${def.turns}回休み` }];
    case 'chainBlast': return [{ icon: 'sword', text: `${def.amount}＋連鎖${Math.ceil(def.amount / 2)}` }];
    case 'ignitionBurst': return [{ icon: 'fire', text: `全体 -${def.amount}` }, { icon: 'heart', text: `自城 -${def.selfDamage}` }];
    case 'armorBlast': return [{ icon: 'wall', text: '城壁ぶん' }];
    case 'purifyFlare': return [{ icon: 'heart', text: '浄化' }, { icon: 'sword', text: `-${def.amount}` }];
    case 'pushBackEnemySoldiers': return [{ icon: 'boot', text: `${def.amount}マス戻す` }];
    case 'shieldSoldier': return [{ icon: 'shield', text: `盾 +${def.amount}` }];
    case 'armorCastle': return [{ icon: 'wall', text: `城壁 ${def.amount}` }];
    default: return [];
  }
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
  if (def.effect === 'gainCard') return `${RARITY_NAMES[def.rarity] ?? def.rarity}のカードを${def.amount}枚入手`;
  if (def.effect === 'boostDrops') return `次の${def.amount}枚は${RARITY_NAMES[def.fromRarity] ?? def.fromRarity}以上の抽選比率${def.boost}倍（全体を100%に再計算）`;
  if (def.effect === 'trainArmy') return `今いる兵士と今後出す兵士の攻撃+${def.amount}（この試合中）`;
  if (def.effect === 'fortifyArmy') return `今いる兵士と今後出す兵士のHP+${def.amount}（この試合中）`;
  return UPGRADE_TEXT[def.effect]?.(def) ?? '';
}

/** 兵士の詳しい情報（タップしたとき） */
export function soldierInfo(s, { cards, rules, viewerId }) {
  const def = cards[s.type] ?? {};
  const owner = s.playerId === viewerId ? 'あなた' : playerName(s.playerId);
  const parts = [`${def.name ?? s.type}（${owner}）`, `HP${Math.max(0, s.hp)}`, `攻撃${s.attack}`,
    `位置${Math.min(s.position, rules.laneLength)}/${rules.laneLength}`];
  if (s.turnsLeft != null) parts.push(`射程${s.range ?? def.range}・あと${s.turnsLeft}回で帰還`);
  if (s.weapon) {
    const el = s.element ? `・${elementName(s.element)}属性` : '';
    parts.push(`${cards[s.weapon]?.name ?? s.weapon}${el}`);
  }
  if (s.shield > 0) parts.push(`${ICON.shield}盾${s.shield}`);
  const poison = s.statuses?.poison;
  if (poison) {
    parts.push(poison.turns === null ? `${STATUS_ICON.poison}毒${poison.amount ?? ''}（永続・毎ターン）`
      : poison.amount != null ? `${STATUS_ICON.poison}毒${poison.amount}×あと${poison.turns}回`
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
  if (m.rewardRarity) parts.push(`とどめで${RARITY_NAMES[m.rewardRarity] ?? m.rewardRarity}カード`);
  else if (m.reward > 0) parts.push(`とどめで${ICON.coin}${m.reward}`);
  if (m.attackIn != null && m.castleAttack != null) {
    parts.push(m.attackIn <= 1 ? `次の周回でどちらかの城に${m.castleAttack}ダメージ`
      : `あと${m.attackIn}周でどちらかの城に${m.castleAttack}ダメージ`);
  }
  return parts.join('・');
}

/** 負けた人に出す、負け方の説明（オンラインで、自分が負けたとき） */
export const GAME_OVER_TEXT_LOST = {
  castleDestroyed: '城を落とされた…',
  monsterDestroyed: '魔物に城を落とされた…',
  lastStanding: '城を落とされた…',
  roundLimit: '周回の上限：城HPの残りが少なかった',
  surrender: '降参した',
};

/** 勝ち方の説明（gameOver の reason） */
export const GAME_OVER_TEXT = {
  castleDestroyed: '城を落とした！',
  monsterDestroyed: '魔物が城を落とした！', // 画面だけの値（最後の城ダメージが魔物の攻撃だったとき）
  lastStanding: '最後まで城が残った！',
  roundLimit: '周回の上限：城HPの残りが多い方の勝ち',
  surrender: '相手が降参した！',
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
