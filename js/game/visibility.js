// オンライン対戦で、イベントをプレイヤーごとに隠す決まり（CLAUDE.md「STEP 4」の「隠す情報」）。
// サーバーはこの関数を通してからイベントを送る。何を隠すかの知識はここ1か所にまとめる。

/**
 * viewerId の人に送ってよい形にして返す（元の payload は変えない）
 * @param {string} type イベントの名前
 * @param {object} payload Game が出したペイロード
 * @param {string|null} viewerId 受け取る人
 */
export function filterEventFor(type, payload, viewerId) {
  if (type === 'cardDrawn' && payload.playerId !== viewerId) {
    // 本人以外には、引いた枚数だけ
    return { playerId: payload.playerId, count: payload.cardIds.length };
  }
  if (type === 'cardDrawn') {
    return { ...payload, count: payload.cardIds.length };
  }
  return payload;
}
