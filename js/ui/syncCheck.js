// デバッグ用（?debug=1 のときだけ main.js が呼ぶ）：
// 演出で進めた「表示用の状態（model）」と、本当の状態（getState）がずれていないかを確かめる。
// ずれていたら console.warn('[sync]', ...) に出す。画面は、このあと getState に合わせて描き直される。
//
// 比べないもの（イベントから分からないので、getState に任せている）：
// - 魔物の attackIn（城を攻めるまでの残り周回。どのイベントにも入っていない）
// - 毒の amount（statusApplied に amount がない。毒のダメージを1回受けたあとは比べる）
// - 凍結の残り回数（休んだ回数のイベントがなく、0 になったときだけ statusCleared が来る。かかっているかだけ比べる）

/** @returns {string[]} ずれの一覧（なければ空） */
export function checkSync(model, st) {
  const diffs = [];
  const same = (label, shown, real) => {
    if (shown !== real) diffs.push(`${label}: 画面 ${JSON.stringify(shown)} / 本当 ${JSON.stringify(real)}`);
  };
  if (!model || !st) return diffs;
  same('山札', model.deckCount, st.deckCount);
  same('捨て札', model.discardCount, st.discardCount);
  for (const id of st.playerOrder) {
    const real = st.players[id];
    const shown = model.players[id];
    if (!shown) {
      diffs.push(`${id}: 画面にいない`);
      continue;
    }
    same(`${id} 城HP`, shown.castleHp, real.castleHp);
    same(`${id} 城壁`, shown.armor ?? 0, real.armor ?? 0);
    same(`${id} コイン`, shown.coins ?? 0, real.coins ?? 0);
    same(`${id} 兵士の数`, shown.soldiers.length, real.soldiers.length);
    for (const rs of real.soldiers) {
      const ss = shown.soldiers.find((x) => x.soldierId === rs.soldierId);
      const where = `${id} ${rs.soldierId}`;
      if (!ss) {
        diffs.push(`${where}: 画面にいない`);
        continue;
      }
      same(`${where} HP`, ss.hp, rs.hp);
      same(`${where} 位置`, ss.position, rs.position);
      same(`${where} 盾`, ss.shield ?? 0, rs.shield ?? 0);
      same(`${where} 武器`, ss.weapon ?? null, rs.weapon ?? null);
      const sp = ss.statuses?.poison ?? null;
      const rp = rs.statuses?.poison ?? null;
      same(`${where} 毒`, Boolean(sp), Boolean(rp));
      if (sp && rp) {
        same(`${where} 毒の残り`, sp.turns, rp.turns);
        if (sp.amount != null) same(`${where} 毒の量`, sp.amount, rp.amount);
      }
      same(`${where} 凍結`, (ss.statuses?.frozen ?? 0) > 0, (rs.statuses?.frozen ?? 0) > 0);
    }
  }
  const shownMonsters = model.monsters ?? [];
  same('魔物の数', shownMonsters.length, (st.monsters ?? []).length);
  for (const rm of st.monsters ?? []) {
    const sm = shownMonsters.find((m) => m.monsterId === rm.monsterId);
    if (!sm) {
      diffs.push(`${rm.monsterId}: 画面にいない`);
      continue;
    }
    same(`${rm.monsterId} HP`, sm.hp, rm.hp);
  }
  if (diffs.length) console.warn('[sync]', `ターン${st.turn}`, diffs);
  return diffs;
}
