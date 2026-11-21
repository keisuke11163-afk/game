// 四大陣営（PR-A）：陣営のデータ（data/factions.json）のチェックと、陣営モードで使えるカードの決まり。DOM は使わない。
//
// - カードの faction：kingdom / forest / demon / dragon（factions.json のキー）か、全陣営共通の "common"
// - faction を書いていないカード＝旧カード（陣営なし）。陣営モードの候補にはならないが、今までのモード・カスタムデッキ・魔物のごほうびでは今までどおり使える
// - implemented: false のカードは、陣営モードの候補から外す（台帳だけあって効果がまだないカード用。省略すると true）

/** 全陣営共通のカードの印（factions.json には入れない） */
export const COMMON_FACTION = 'common';

/** factions.json の中身をチェックする（間違いは例外） */
export function validateFactions(factions) {
  if (!factions || typeof factions !== 'object' || Array.isArray(factions)) {
    throw new Error('factions.json は陣営のIDをキーにしたオブジェクトにしてください');
  }
  const ids = Object.keys(factions);
  if (ids.length === 0) throw new Error('factions.json に陣営がありません');
  for (const id of ids) {
    const def = factions[id];
    const where = `factions.json の "${id}"`;
    if (id === COMMON_FACTION) throw new Error(`${where}: "${COMMON_FACTION}" は全陣営共通の印なので、陣営のIDには使えません`);
    if (!def || typeof def !== 'object') throw new Error(`${where}: 定義がオブジェクトではありません`);
    if (typeof def.name !== 'string' || def.name === '') throw new Error(`${where}: name を書いてください`);
    if (def.description !== undefined && typeof def.description !== 'string') throw new Error(`${where}: description は文字列にしてください`);
  }
}

/** カードの faction として書ける値か（factions を渡さなければ、文字列かどうかだけ） */
export function isValidFactionId(value, factions = null) {
  if (typeof value !== 'string' || value === '') return false;
  if (!factions) return true;
  return value === COMMON_FACTION || Object.hasOwn(factions, value);
}

/**
 * 陣営モード（factionId を選んだとき）の候補に入るカードか。
 * 入るのは「その陣営のカード」と「全陣営共通（common）」だけ。ただし次は入れない：
 * weight が 0（排出されない）／魔物のカード（monster。ごほうび専用）／implemented: false（まだ効果がない）。
 * faction のないカード（旧カード・特殊サイコロ・解毒薬・天候の呪文など）は入らない。
 */
export function isLegalForFaction(def, factionId) {
  if (!def || def.implemented === false) return false;
  if (def.monster !== undefined) return false;
  if ((def.weight ?? 1) <= 0) return false;
  return def.faction === factionId || def.faction === COMMON_FACTION;
}

/** 陣営モードの候補（カード種類の Set） */
export function factionPool(cards, factionId) {
  return new Set(Object.entries(cards).filter(([, def]) => isLegalForFaction(def, factionId)).map(([type]) => type));
}
