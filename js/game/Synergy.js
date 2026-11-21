// シナジー設定（data/synergies.json）のチェック。判定処理は次のSTEPで足す。DOM は使わない。

/** synergies.json の中身をチェックする（間違いは例外） */
export function validateSynergies(synergies, factions, races) {
  if (!synergies || typeof synergies !== 'object' || Array.isArray(synergies)) {
    throw new Error('synergies.json は faction と race を持つオブジェクトにしてください');
  }
  const sections = [['faction', factions, '陣営'], ['race', races, '種族']];
  for (const [section, defs, label] of sections) {
    const body = synergies[section];
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(`synergies.json: "${section}" をオブジェクトで書いてください`);
    for (const id of Object.keys(body)) {
      if (defs && !Object.hasOwn(defs, id)) throw new Error(`synergies.json の ${section}.${id}: ${label}の一覧にないIDです`);
    }
    for (const id of Object.keys(defs ?? {})) {
      if (!Object.hasOwn(body, id)) throw new Error(`synergies.json: ${section}.${id} のシナジーを書いてください`);
    }
    for (const [id, tiers] of Object.entries(body)) {
      const where = `synergies.json の ${section}.${id}`;
      if (!tiers || typeof tiers !== 'object') throw new Error(`${where}: 定義がオブジェクトではありません`);
      for (const [n, t] of Object.entries(tiers)) {
        if (!['2', '3'].includes(n)) throw new Error(`${where}: 枚数のキーは "2" か "3" にしてください`);
        if (!t || typeof t.description !== 'string' || t.description === '') throw new Error(`${where}["${n}"]: description を書いてください`);
        if (!t.bonus || typeof t.bonus !== 'object' || Array.isArray(t.bonus)) throw new Error(`${where}["${n}"]: bonus はオブジェクトにしてください`);
        for (const [k, v] of Object.entries(t.bonus)) {
          if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${where}["${n}"]: bonus.${k} は数にしてください`);
        }
      }
    }
  }
}
