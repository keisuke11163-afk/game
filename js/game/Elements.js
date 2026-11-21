// 属性の相性表（data/elements.json）。DOM は使わない。
// beats：その属性が「有利」を取れる相手（攻撃するとき advantage 倍＝1.5）。
// 不利（disadvantage 倍＝0.75）は beats の逆向きから決まる（相手が自分に有利を取れるなら不利）。JSON の二重管理を避けるため。
// weakAgainst は任意（beats から出ない不利を足したいとき用。今のデータでは使わない）。
// 属性なし（無）は element が null / 書かないこと、混沌は beats も不利もなし。相性なし（1.0）。

export const DEFAULT_ELEMENTS = {
  multipliers: { advantage: 1.5, disadvantage: 0.75 },
  elements: {
    fire: { name: '火', beats: ['ice'] },
    water: { name: '水', beats: ['fire', 'earth'] },
    wind: { name: '風', beats: ['fire'] },
    earth: { name: '土', beats: ['thunder', 'wind'] },
    ice: { name: '氷', beats: ['water'] },
    thunder: { name: '雷', beats: ['water'] },
    dark: { name: '闇', beats: ['light'] },
    light: { name: '光', beats: ['dark'] },
    chaos: { name: '混沌', beats: [] },
  },
};

export const ELEMENT_IDS = Object.keys(DEFAULT_ELEMENTS.elements);

export function validateElements(data) {
  if (!data || typeof data !== 'object') throw new Error('elements.json の中身を渡してください');
  const m = data.multipliers;
  if (!m || typeof m !== 'object') throw new Error('elements.json の multipliers を書いてください');
  for (const key of ['advantage', 'disadvantage']) {
    if (typeof m[key] !== 'number' || !Number.isFinite(m[key]) || m[key] <= 0) {
      throw new Error(`elements.json の multipliers.${key} は正の数にしてください`);
    }
  }
  const els = data.elements;
  if (!els || typeof els !== 'object' || Object.keys(els).length === 0) throw new Error('elements.json の elements を書いてください');
  for (const [id, def] of Object.entries(els)) {
    const where = `elements.json の ${id}`;
    if (!def || typeof def !== 'object') throw new Error(`${where}: 定義がオブジェクトではありません`);
    if (typeof def.name !== 'string' || def.name === '') throw new Error(`${where}: name を書いてください`);
    for (const key of ['beats', 'weakAgainst']) {
      if (def[key] === undefined) continue;
      if (!Array.isArray(def[key])) throw new Error(`${where}: ${key} は属性IDの配列にしてください`);
      for (const t of def[key]) {
        if (!(t in els)) throw new Error(`${where}: ${key} の "${t}" は elements にありません`);
      }
    }
  }
}

/** 攻撃する属性 → 守る属性の倍率。有利 advantage（優先）／不利 disadvantage（相手が自分に有利、または weakAgainst）／それ以外 1.0。無（null）は 1.0 */
export function elementMultiplier(table, attacker, defender) {
  if (!attacker || !defender) return 1;
  const t = table ?? DEFAULT_ELEMENTS;
  const a = t.elements[attacker];
  if (!a) return 1;
  if (a.beats?.includes(defender)) return t.multipliers.advantage;
  if (t.elements[defender]?.beats?.includes(attacker) || a.weakAgainst?.includes(defender)) return t.multipliers.disadvantage;
  return 1;
}

/** ダメージに倍率を掛ける（切り上げ。浮動小数の誤差を除く）。倍率が1でなければ最低1 */
export function applyElementMultiplier(damage, multiplier) {
  if (multiplier === 1) return damage;
  return Math.max(1, Math.ceil(Math.round(damage * multiplier * 1e6) / 1e6));
}

/** attacker が defender に有利か（倍率 > 1。弱点の演出・説明に使う） */
export function hasAdvantage(attacker, defender, table = DEFAULT_ELEMENTS) {
  return elementMultiplier(table, attacker, defender) > 1;
}

/** その属性に有利を取れる属性（beats の逆引き）の1つ目。説明文用 */
export function elementsBeatenBy(element, table = DEFAULT_ELEMENTS) {
  return table.elements[element]?.beats ?? [];
}
