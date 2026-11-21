// 進化データ（data/evolutions.json）のチェックと適用。DOM は使わない。
// 進化後のデータは元のカード（cards.json）とは別に持つ。stage 0=通常 / 1=第1進化 / 2=第2進化。

/** statBonus に書けるキー */
export const EVOLUTION_STAT_KEYS = ['hp', 'attack', 'speed'];

/** evolutions.json の中身をチェックする（間違いは例外） */
export function validateEvolutions(evolutions, cards) {
  if (!evolutions || typeof evolutions !== 'object' || Array.isArray(evolutions)) {
    throw new Error('evolutions.json はカード種類をキーにしたオブジェクトにしてください');
  }
  for (const [type, entry] of Object.entries(evolutions)) {
    const where = `evolutions.json の "${type}"`;
    if (!cards || !Object.hasOwn(cards, type)) throw new Error(`${where}: cards.json にないカード種類です`);
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.stages) || entry.stages.length === 0) {
      throw new Error(`${where}: stages に進化の段階を配列で書いてください`);
    }
    entry.stages.forEach((st, i) => {
      const w = `${where} の stages[${i}]`;
      if (!st || typeof st !== 'object') throw new Error(`${w}: 定義がオブジェクトではありません`);
      if (st.stage !== i + 1 || i >= 2) throw new Error(`${w}: stage は 1, 2 の連番にしてください（最大2段階）`);
      if (typeof st.name !== 'string' || st.name === '') throw new Error(`${w}: name を書いてください`);
      if (!Number.isInteger(st.expRequired) || st.expRequired <= 0) throw new Error(`${w}: expRequired は1以上の整数にしてください`);
      if (!st.statBonus || typeof st.statBonus !== 'object' || Array.isArray(st.statBonus)) throw new Error(`${w}: statBonus はオブジェクトにしてください`);
      for (const [k, v] of Object.entries(st.statBonus)) {
        if (!EVOLUTION_STAT_KEYS.includes(k)) throw new Error(`${w}: statBonus のキーは ${EVOLUTION_STAT_KEYS.join(' / ')} のどれかです`);
        if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${w}: statBonus.${k} は数にしてください`);
      }
      if (st.abilities !== undefined && !Array.isArray(st.abilities)) throw new Error(`${w}: abilities は配列にしてください`);
    });
  }
}

/**
 * 進化段階 stage までの statBonus を足した、新しいカード定義のコピーを返す（元の def は書き換えない）。
 * stage が 0 以下、進化データなし、段階が見つからないときは元の def をそのまま返す。
 */
export function applyEvolution(def, evolutionData, stage) {
  if (!evolutionData || !Array.isArray(evolutionData.stages) || !(stage >= 1)) return def;
  const applied = evolutionData.stages.filter((st) => st.stage <= stage);
  if (applied.length === 0) return def;
  const copy = { ...def };
  for (const st of applied) {
    for (const [k, v] of Object.entries(st.statBonus ?? {})) {
      if (typeof copy[k] === 'number') copy[k] += v;
    }
  }
  const last = applied[applied.length - 1];
  copy.name = last.name;
  copy.evolutionStage = last.stage;
  if (Array.isArray(last.abilities) && last.abilities.length) copy.abilities = [...(def.abilities ?? []), ...applied.flatMap((s) => s.abilities ?? [])];
  return copy;
}
