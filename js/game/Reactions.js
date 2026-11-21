// 属性の「反応」（data/reactions.json）。DOM は使わない。
// 兵士に属性が付着しているところへ、別の属性で攻撃すると、その組が表にあれば反応が起きる（CLAUDE.md「属性の反応」）。
//   reactions：{ id: { name, elements: [a, b], multiplier?, effects?, attachment? } }
//     elements    … 組（順番は関係ない）。属性ID（elements.json のキー）か "mist"（水霧。水としても照合する）
//     multiplier  … 追加ダメージの倍率（その攻撃のダメージに最後に掛ける。切り上げ）。書かない・null なら掛けない
//     effects     … 特殊効果の配列（下の EFFECT_KINDS）
//     attachment  … 反応のあとに残る付着（属性ID か "mist"。書かない・null なら消える）
//   chaosPool：混沌（攻撃か付着が chaos）のときに、ランダムに選ぶ反応のIDの配列

/** 付着だけに使う属性：水霧（風＋水の霧のあとに残る。反応の照合では水としても扱う） */
export const MIST = 'mist';

/** 特殊効果の種類と、書ける引数 */
export const EFFECT_KINDS = ['status', 'dot', 'slow', 'blind', 'splash'];
/** 効果が及ぶ範囲：target（標的だけ）／adjacent（標的と、同じ道の前後1マス・同じマスの同じ陣地の兵士）／lane（同じ道の同じ陣地の兵士全員） */
export const EFFECT_SCOPES = ['target', 'adjacent', 'lane'];
/** status の効果で付けられる既存の状態 */
export const REACTION_STATUSES = ['frozen', 'burn'];

const isPosInt = (v) => Number.isInteger(v) && v >= 1;

/**
 * reactions.json の中身を確かめる（おかしければ、どこが悪いかを書いた Error を投げる）
 * @param {object} data reactions.json の中身
 * @param {object} elements elements.json の中身（属性IDの一覧に使う）
 */
export function validateReactions(data, elements) {
  if (!data || typeof data !== 'object') throw new Error('reactions.json の中身を渡してください');
  const ids = new Set([...Object.keys(elements?.elements ?? {}), MIST]);
  const list = data.reactions;
  if (!list || typeof list !== 'object' || Array.isArray(list)) throw new Error('reactions.json の reactions を書いてください');
  const pairs = new Set();
  for (const [id, def] of Object.entries(list)) {
    const where = `reactions.json の ${id}`;
    if (!def || typeof def !== 'object') throw new Error(`${where}: 定義がオブジェクトではありません`);
    if (typeof def.name !== 'string' || def.name === '') throw new Error(`${where}: name を書いてください`);
    const els = def.elements;
    if (!Array.isArray(els) || els.length !== 2 || els[0] === els[1]) throw new Error(`${where}: elements は違う属性2つの配列にしてください`);
    for (const e of els) {
      if (!ids.has(e)) throw new Error(`${where}: elements の "${e}" は elements.json にありません（水霧は "mist"）`);
      if (e === 'chaos') throw new Error(`${where}: 混沌は組に書けません（chaosPool で選ばれます）`);
    }
    const key = pairKey(els[0], els[1]);
    if (pairs.has(key)) throw new Error(`${where}: ${els.join('+')} の組がほかの反応と重なっています`);
    pairs.add(key);
    if (def.multiplier !== undefined && def.multiplier !== null && !(typeof def.multiplier === 'number' && Number.isFinite(def.multiplier) && def.multiplier > 0)) {
      throw new Error(`${where}: multiplier は正の数にしてください（書かなければ倍率なし）`);
    }
    if (def.attachment !== undefined && def.attachment !== null && !ids.has(def.attachment)) {
      throw new Error(`${where}: attachment の "${def.attachment}" は elements.json にありません（水霧は "mist"、消えるなら null）`);
    }
    if (def.effects !== undefined && !Array.isArray(def.effects)) throw new Error(`${where}: effects は配列にしてください`);
    for (const [i, ef] of (def.effects ?? []).entries()) validateEffect(ef, `${where} の effects[${i}]`);
  }
  if (data.chaosPool !== undefined) {
    if (!Array.isArray(data.chaosPool)) throw new Error('reactions.json の chaosPool は反応のIDの配列にしてください');
    for (const id of data.chaosPool) {
      if (!Object.hasOwn(list, id)) throw new Error(`reactions.json の chaosPool の "${id}" は reactions にありません`);
    }
  }
}

function validateEffect(ef, where) {
  if (!ef || typeof ef !== 'object') throw new Error(`${where}: オブジェクトにしてください`);
  if (!EFFECT_KINDS.includes(ef.kind)) throw new Error(`${where}: kind は ${EFFECT_KINDS.join(' / ')} のどれかにしてください`);
  if (ef.scope !== undefined && !EFFECT_SCOPES.includes(ef.scope)) throw new Error(`${where}: scope は ${EFFECT_SCOPES.join(' / ')} のどれかにしてください`);
  switch (ef.kind) {
    case 'status':
      if (!REACTION_STATUSES.includes(ef.status)) throw new Error(`${where}: status は ${REACTION_STATUSES.join(' / ')} のどれかにしてください`);
      if (!isPosInt(ef.turns)) throw new Error(`${where}: turns は1以上の整数にしてください`);
      if (ef.status === 'burn' && !isPosInt(ef.amount)) throw new Error(`${where}: やけどの amount は1以上の整数にしてください`);
      break;
    case 'dot':
    case 'slow':
      if (!isPosInt(ef.amount)) throw new Error(`${where}: amount は1以上の整数にしてください`);
      if (!isPosInt(ef.turns)) throw new Error(`${where}: turns は1以上の整数にしてください`);
      break;
    case 'blind':
      if (!(typeof ef.chance === 'number' && ef.chance > 0 && ef.chance <= 1)) throw new Error(`${where}: chance は0より大きく1以下の数にしてください`);
      if (!isPosInt(ef.turns)) throw new Error(`${where}: turns は1以上の整数にしてください`);
      break;
    case 'splash':
      if (!(typeof ef.ratio === 'number' && ef.ratio > 0)) throw new Error(`${where}: ratio は正の数にしてください`);
      if (ef.scope !== 'adjacent' && ef.scope !== 'lane') throw new Error(`${where}: splash の scope は "adjacent" か "lane" にしてください`);
      break;
    default:
      break;
  }
}

/** 組の鍵（順番は関係ない） */
function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** 組 → 反応ID の索引を作る */
export function buildReactionIndex(data) {
  const index = new Map();
  for (const [id, def] of Object.entries(data.reactions)) index.set(pairKey(def.elements[0], def.elements[1]), id);
  return index;
}

/**
 * 付着 attached のところへ element で攻撃したときの反応のID（なければ null）。
 *   混沌：どちらかが chaos なら chaosPool からランダムに1つ（混沌どうし・空の chaosPool なら起きない）。乱数は混沌のときだけ使う
 *   水霧（mist）：mist の組を先に探し、なければ水として探す
 */
export function findReaction(data, index, attached, element, rng) {
  if (!attached || !element || attached === element) return null;
  if (attached === 'chaos' || element === 'chaos') {
    const pool = data.chaosPool ?? [];
    if (pool.length === 0) return null;
    return pool[Math.floor(rng() * pool.length)];
  }
  const id = index.get(pairKey(attached, element));
  if (id) return id;
  if (attached === MIST && element !== 'water') return index.get(pairKey('water', element)) ?? null;
  return null;
}

/** ダメージに反応の倍率を掛ける（切り上げ。浮動小数の誤差を除く）。倍率がなければそのまま */
export function applyReactionMultiplier(damage, multiplier) {
  if (multiplier === undefined || multiplier === null || multiplier === 1) return damage;
  return Math.ceil(Math.round(damage * multiplier * 1e6) / 1e6);
}
