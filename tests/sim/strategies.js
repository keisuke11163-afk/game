// シミュレーション用の戦い方。Game の公開メソッド（getState / canPlayCard / playCard / discard）だけを使う。
// カードとルールの数値は、sim.js から渡される ctx（{ cards, rules, discardCount }）で読む。
// どの戦い方も「出せるカード」は canPlayCard で確かめるので、ルールが変わっても動く。
//   takeTurn(game, pid, rng, ctx)      … メインでカードを出す（出さなくてもよい）
//   chooseDiscard(game, pid, rng, ctx) … ctx.discardCount 枚の cardId を返す

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

function view(game, pid) {
  const state = game.getState(pid);
  const me = state.players[pid];
  const enemies = Object.keys(state.players).filter((id) => id !== pid).map((id) => ({ id, ...state.players[id] }));
  const playable = me.hand.filter((c) => game.canPlayCard(c.cardId).ok);
  return { state, me, enemies, playable };
}


/** 種類の優先順に、出せる最初のカードを出す */
function playFirst(game, playable, typesInOrder) {
  for (const t of typesInOrder) {
    const c = playable.find((x) => x.type === t);
    if (c) {
      const r = game.playCard(c.cardId);
      if (r.ok) return true;
    }
  }
  return false;
}

function randomDiscard(game, pid, rng, ctx) {
  const hand = [...game.getState(pid).players[pid].hand];
  const out = [];
  for (let i = 0; i < ctx.discardCount; i++) out.push(hand.splice(Math.floor(rng() * hand.length), 1)[0].cardId);
  return out;
}

/** 兵士カードを「強い順」に並べる（攻撃力＋速さ。速くて強い騎士が先） */
function soldierTypes(ctx) {
  return Object.entries(ctx.cards)
    .filter(([, d]) => d.kind === 'soldier')
    .sort((a, b) => b[1].attack + b[1].speed - (a[1].attack + a[1].speed))
    .map(([t]) => t);
}
const typesWithEffect = (ctx, effect) =>
  Object.entries(ctx.cards).filter(([, d]) => d.effect === effect).map(([t]) => t);

export const STRATEGIES = {
  /** 出せるカードからランダムに1枚 */
  random: {
    takeTurn(game, pid, rng) {
      const { playable } = view(game, pid);
      if (playable.length) game.playCard(pick(playable, rng).cardId);
    },
    chooseDiscard: randomDiscard,
  },

  /** 攻撃だけ：城を直接たたく魔法 → 兵士 */
  aggro: {
    takeTurn(game, pid, rng, ctx) {
      const { playable } = view(game, pid);
      playFirst(game, playable, [...typesWithEffect(ctx, 'damageEnemyCastle'), ...soldierTypes(ctx)]);
    },
    chooseDiscard: randomDiscard,
  },

  /** ほどよく考える */
  smart: {
    takeTurn(game, pid, rng, ctx) {
      smartTurn(game, pid, ctx);
    },
    chooseDiscard: randomDiscard,
  },

  /** 守り優先：回復 → 兵士への魔法 → 兵士 → 城への魔法 */
  defensive: {
    takeTurn(game, pid, rng, ctx) {
      const { playable } = view(game, pid);
      playFirst(game, playable, [
        ...typesWithEffect(ctx, 'healOwnCastle'),
        ...typesWithEffect(ctx, 'damageEnemySoldiers'),
        ...soldierTypes(ctx),
        ...typesWithEffect(ctx, 'damageEnemyCastle'),
      ]);
    },
    chooseDiscard: randomDiscard,
  },

  /** 何も出さない */
  pass: {
    takeTurn() {},
    chooseDiscard: randomDiscard,
  },

  /** 兵士で守る：相手の兵士が自分の城から2マス以内に来たら兵士を出す。それ以外は smart */
  guard: {
    takeTurn(game, pid, rng, ctx) {
      const { playable, enemies } = view(game, pid);
      const L = ctx.rules.laneLength;
      const near = enemies.some((e) => e.soldiers.some((s) => s.position >= L - 3));
      if (near && playFirst(game, playable, soldierTypes(ctx))) return;
      smartTurn(game, pid, ctx);
    },
    chooseDiscard: randomDiscard,
  },
};

function smartTurn(game, pid, ctx) {
  const { me, enemies, playable } = view(game, pid);
  const enemy = enemies[0];
  const castleSpells = typesWithEffect(ctx, 'damageEnemyCastle');
  // とどめになるなら城への魔法
  for (const t of castleSpells) {
    if (enemy && ctx.cards[t].amount >= enemy.castleHp && playFirst(game, playable, [t])) return;
  }
  if (me.castleHp < me.castleMaxHp / 2 && playFirst(game, playable, typesWithEffect(ctx, 'healOwnCastle'))) return;
  if (enemy && enemy.soldiers.length >= 2 && playFirst(game, playable, typesWithEffect(ctx, 'damageEnemySoldiers'))) return;
  playFirst(game, playable, [
    ...soldierTypes(ctx),
    ...castleSpells,
    ...typesWithEffect(ctx, 'damageEnemySoldiers'),
    ...typesWithEffect(ctx, 'healOwnCastle'),
  ]);
}
