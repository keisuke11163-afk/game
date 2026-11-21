// 戦い方（シミュレーションと、ひとりで遊ぶモードの CPU が使う）。
// Game の公開メソッド（getState / canPlayCard / playCard / discard）だけを使う。DOM は使わない。
// CPU は自分の手札だけを見る（相手の手札は getState(自分) では null）。
// カードとルールの数値は、呼ぶ側から渡される ctx（{ cards, rules, upgrades, discardCount }）で読む。
// どの戦い方も「出せるカード」は canPlayCard で確かめるので、ルールが変わっても動く。
//   takeTurn(game, pid, rng, ctx)      … メインでカードを出す（出さなくてもよい）
//   chooseDiscard(game, pid, rng, ctx) … ctx.discardCount 枚の cardId を返す

import { hasAdvantage } from './Elements.js';

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

function view(game, pid) {
  const state = game.getState(pid);
  const me = state.players[pid];
  // チーム戦では、同じ城（castleOwner）の味方は相手に数えない
  const sideOf = (id) => state.players[id].castleOwner ?? id;
  const enemies = Object.keys(state.players).filter((id) => sideOf(id) !== sideOf(pid)).map((id) => ({ id, ...state.players[id] }));
  const playable = me.hand.filter((c) => game.canPlayCard(c.cardId).ok);
  return { state, me, enemies, playable };
}


/** 今のターンのカード定義（レーンの選び方で、兵士か魔法かを見分けるのに使う） */
let curCards = {};
/** 今のターンの ctx（ctx.onDefense があれば、攻撃が防御待ちになったとき、続きを進める前に呼ぶ） */
let curCtx = null;

/**
 * 道（レーン）を選ぶ（targets の中に roadId があるとき）。
 *   兵士：相手の兵士が来ている道へ迎え撃ちに行く（いなければ魔物のいる道。ごほうびと、城を攻められる前に倒すため）
 *   魔法：相手の兵士がいちばん多い道へ
 * 同点のときは乱数で選ぶ。
 */
function pickLane(game, pid, cardId, targets) {
  const withRoad = targets.filter((t) => t.roadId);
  if (withRoad.length < 2) return withRoad[0] ?? targets[0];
  const st = game.getState(pid);
  const type = st.players[pid].hand.find((c) => c.cardId === cardId)?.type;
  const isSoldier = curCards[type]?.kind === 'soldier';
  const enemyCount = (roadId) => Object.entries(st.players)
    .filter(([id, p]) => (p.castleOwner ?? id) !== (st.players[pid].castleOwner ?? pid))
    .reduce((n, [, p]) => n + p.soldiers.filter((x) => x.roadId === roadId).length, 0);
  const score = (t) => {
    const monster = st.monsters.some((m) => m.roadId === t.roadId) ? 1 : 0;
    // 兵士：相手の兵士が来ている道に出して迎え撃つ（いなければ、魔物のいない道）
    return isSoldier ? enemyCount(t.roadId) * 2 + monster : enemyCount(t.roadId);
  };
  const best = Math.max(...withRoad.map(score));
  const ties = withRoad.filter((t) => score(t) === best);
  return ties[Math.floor(tieRng() * ties.length)];
}

/** 対象を選んで出す。chooseTarget を省略すると、いちばん城HPの割合が少ない相手（道は pickLane で選ぶ） */
function playWith(game, cardId, chooseTarget) {
  const targets = game.getTargets(cardId);
  if (targets.length === 0) return false;
  let t;
  if (chooseTarget) t = chooseTarget(targets);
  else {
    // 省略したら、いちばん城HPの割合が少ない相手（魔物は選ばない）。道が何本かあるときは、その相手の道から選ぶ
    t = weakest(game, targets);
    if (t?.playerId) {
      const lanes = targets.filter((x) => x.playerId === t.playerId && x.roadId);
      if (lanes.length) t = pickLane(game, game.getState(null).currentPlayer, cardId, lanes);
    }
  }
  if (!t) return false;
  const res = game.playCard(cardId, t);
  // 相手が防御を選ぶ場面になったら、(シミュレーションなどでは) その場で相手に返事をしてもらう
  if (res.ok && curCtx?.onDefense && game.getState(null).phase === 'defend') curCtx.onDefense(game);
  return res.ok;
}

/** 同じくらいのときに、いつも同じ相手を選ばないための乱数（takeTurn の最初に入れる） */
let tieRng = Math.random;

function weakest(game, targets) {
  const players = targets.filter((t) => t.playerId);
  if (!players.length) return targets[0];
  const st = game.getState(null).players;
  const ratio = (t) => st[t.playerId].castleHp / st[t.playerId].castleMaxHp;
  const min = Math.min(...players.map(ratio));
  const ties = players.filter((t) => ratio(t) - min < 0.1); // 1割以内の差は同じくらいとみなす
  return ties.length === 1 ? ties[0] : ties[Math.floor(tieRng() * ties.length)];
}

/** 種類の優先順に、出せる最初のカードを出す */
/** 出せる順の優先度に従って、出せなくなるまで続けて出す（何枚でも出せるカード用） */
function playRepeat(game, pid, typesInOrder) {
  for (let i = 0; i < 15; i++) {
    if (!playFirst(game, view(game, pid).playable, typesInOrder)) return;
  }
}

function playFirst(game, playable, typesInOrder) {
  for (const t of typesInOrder) {
    const c = playable.find((x) => x.type === t);
    if (c && playWith(game, c.cardId)) return true;
  }
  return false;
}

/**
 * メイン以外（付加・防御）のカードを、役に立つときに出す（ほどよく考える戦い方で使う）
 *   武器：まだ武器のない、いちばん前の兵士に。近くの相手の属性に強い属性を選ぶ
 *   盾：いちばん前の兵士に
 *   城壁：城HPが半分以下のときだけ（使い切りで、手札も1枚減るため）
 */
function playSupports(game, pid, ctx) {
  for (let guard = 0; guard < 20; guard++) {
    const { me, enemies, playable } = view(game, pid);
    const support = playable.filter((c) => ctx.cards[c.type].kind !== 'soldier' && ctx.cards[c.type].kind !== 'spell');
    if (support.length === 0) return;
    const front = [...me.soldiers].sort((a, b) => b.position - a.position);
    const enemySoldiers = enemies.flatMap((e) => e.soldiers);
    let played = false;
    for (const c of support) {
      const def = ctx.cards[c.type];
      if (def.kind === 'weapon') {
        const nearElements = new Set(enemySoldiers.map((s) => s.element).filter(Boolean));
        // 近くの相手の属性に負ける属性は避ける
        const bad = [...nearElements].some((e) => hasAdvantage(e, def.element));
        const target = front.find((s) => !s.weapon);
        if (!bad && target) played = playWith(game, c.cardId, (ts) => ts.find((t) => t.soldierId === target.soldierId));
      } else if (def.effect === 'shieldSoldier') {
        if (front.length) played = playWith(game, c.cardId, (ts) => ts.find((t) => t.soldierId === front[0].soldierId));
      } else if (def.effect === 'armorCastle') {
        // 城壁は使い切りで手札も1枚減るので、城HPが半分以下のときだけ出す
        if (me.castleHp * 2 <= me.castleMaxHp) played = playWith(game, c.cardId);
      }
      if (played) break;
    }
    if (!played) return;
  }
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

/**
 * 攻撃を受けたときの返事（防御カードを出す。出さなくてもよい）。
 *   never：防御しない／always：出せるなら出す／smart：守る価値があるときだけ出す／random：半分の確率で出す
 * 自分の手札しか見ない。Game の公開メソッド（getState / canDefend / defend / passDefense）だけを使う。
 */
function respondDefense(game, pid, rng, ctx, policy) {
  for (let guard = 0; guard < 20; guard++) {
    const st = game.getState(pid);
    if (st.phase !== 'defend' || st.defense.defenderId !== pid) return;
    if (policy === 'never') break;
    const me = st.players[pid];
    const d = st.defense;
    const amountOf = (c) => ctx.cards[c.type].amount ?? 0;
    const options = me.hand.filter((c) => game.canDefend(c.cardId).ok).sort((a, b) => amountOf(b) - amountOf(a));
    if (options.length === 0) break;
    let card = null;
    let target;
    if (policy === 'random') {
      if (rng() >= 0.5) break;
      card = pick(options, rng);
      target = pick(game.getDefenseTargets(card.cardId), rng);
    } else if (d.kind === 'castle') {
      // 城：城HPが半分を切りそうなとき、または大きなダメージのときに城壁を出す
      const worth = policy === 'always' || d.amount >= 6 || me.castleHp - d.amount <= me.castleMaxHp / 2;
      if (!worth) break;
      // 反射・身代わりは、攻撃そのものを止める（使えるなら城壁より先に出す）
      const counter = options.find((c) => ['reflectSpell', 'nullifySoldier'].includes(ctx.cards[c.type].effect));
      card = counter ?? options[0];
    } else {
      // 兵士：やられそうな兵士（いちばん強いもの）に、それを守れる盾を出す
      const victims = me.soldiers.filter((x) => d.soldierIds.includes(x.soldierId)).sort((a, b) => b.attack - a.attack);
      const dying = victims.find((x) => x.hp + x.shield <= d.amount);
      const v = policy === 'always' ? victims[0] : dying;
      if (!v) break;
      const saves = options.filter((c) => v.hp + v.shield + amountOf(c) > d.amount);
      card = saves.at(-1) ?? options[0]; // 足りる中でいちばん小さい盾（なければいちばん大きい盾）
      target = { soldierId: v.soldierId };
    }
    if (!card || !game.defend(card.cardId, target).ok) break;
  }
  if (game.getState(null).phase === 'defend') game.passDefense();
}

const RAW_STRATEGIES = {
  /** 出せるカードからランダムに1枚 */
  random: {
    takeTurn(game, pid, rng) {
      // 出せるカードからランダムに出す。メインを出したら、あとは半分の確率で続ける
      for (let i = 0; i < 10; i++) {
        const { playable } = view(game, pid);
        if (!playable.length) return;
        const c = pick(playable, rng);
        playWith(game, c.cardId, (ts) => pick(ts, rng));
        if (game.getState(pid).players[pid].playedThisTurn && rng() < 0.5) return;
      }
    },
    respond(game, pid, rng, ctx) {
      respondDefense(game, pid, rng, ctx, 'random');
    },
    chooseDiscard: randomDiscard,
  },

  /** 攻撃だけ：城を直接たたく魔法 → 兵士 */
  aggro: {
    takeTurn(game, pid, rng, ctx) {
      playRepeat(game, pid, [...typesWithEffect(ctx, 'damageEnemyCastle'), ...soldierTypes(ctx)]);
    },
    respond(game, pid, rng, ctx) {
      respondDefense(game, pid, rng, ctx, 'never');
    },
    chooseDiscard: randomDiscard,
  },

  /** ほどよく考える */
  smart: {
    takeTurn(game, pid, rng, ctx) {
      buyUpgrades(game, pid, ctx);
      smartTurn(game, pid, ctx);
      playSupports(game, pid, ctx);
    },
    respond(game, pid, rng, ctx) {
      respondDefense(game, pid, rng, ctx, 'smart');
    },
    chooseDiscard: randomDiscard,
  },

  /** 守り優先：回復 → 兵士への魔法 → 兵士 → 城への魔法 */
  defensive: {
    takeTurn(game, pid, rng, ctx) {
      playSupports(game, pid, ctx);
      playRepeat(game, pid, [
        ...typesWithEffect(ctx, 'healOwnCastle'),
        ...typesWithEffect(ctx, 'damageEnemySoldiers'),
        ...soldierTypes(ctx),
        ...typesWithEffect(ctx, 'damageEnemyCastle'),
      ]);
    },
    respond(game, pid, rng, ctx) {
      respondDefense(game, pid, rng, ctx, 'always');
    },
    chooseDiscard: randomDiscard,
  },

  /** 攻め重視：城への魔法 → 兵士。回復はしない。武器・盾・強化は使う（aggro は付加・防御・強化を使わない素朴な型） */
  rush: {
    takeTurn(game, pid, rng, ctx) {
      buyUpgrades(game, pid, ctx);
      playRepeat(game, pid, [...typesWithEffect(ctx, 'damageEnemyCastle'), ...soldierTypes(ctx)]);
      playSupports(game, pid, ctx);
    },
    respond(game, pid, rng, ctx) {
      respondDefense(game, pid, rng, ctx, 'never');
    },
    chooseDiscard: randomDiscard,
  },

  /** 何も出さない */
  pass: {
    takeTurn() {},
    respond(game, pid, rng, ctx) {
      respondDefense(game, pid, rng, ctx, 'never');
    },
    chooseDiscard: randomDiscard,
  },

  /** 兵士で守る：相手の兵士が自分の城から2マス以内に来たら兵士を出す。それ以外は smart */
  guard: {
    takeTurn(game, pid, rng, ctx) {
      const { playable, enemies } = view(game, pid);
      const L = ctx.rules.laneLength;
      const near = enemies.some((e) => e.soldiers.some((s) => s.position >= L - 3));
      buyUpgrades(game, pid, ctx);
      if (!(near && playFirst(game, playable, soldierTypes(ctx)))) smartTurn(game, pid, ctx);
      playSupports(game, pid, ctx);
    },
    respond(game, pid, rng, ctx) {
      respondDefense(game, pid, rng, ctx, 'smart');
    },
    chooseDiscard: randomDiscard,
  },
};

/** コインで強化を買う：城HPが半分より少なければ修理、兵士がいればとぎ石、余れば補充 */
function buyUpgrades(game, pid, ctx) {
  const ids = Object.keys(ctx.upgrades);
  if (!ids.length) return;
  const by = (effect) => ids.filter((id) => ctx.upgrades[id].effect === effect);
  for (let i = 0; i < 10; i++) {
    const me = game.getState(pid).players[pid];
    const order = [
      ...(me.castleHp < me.castleMaxHp / 2 ? by('repairCastle') : []),
      ...by('sharpenSoldiers'),
      ...by('trainArmy'),
      ...by('fortifyArmy'),
      ...by('gainCard').sort((a, b) => ctx.upgrades[b].cost - ctx.upgrades[a].cost),
      ...by('permanentLuck'),
      ...by('boostDrops'),
      ...by('drawCards'),
    ];
    const id = order.find((u) => game.canBuyUpgrade(u).ok);
    if (!id) return;
    game.buyUpgrade(id);
  }
}

/**
 * 手札に同じカードが2枚あれば合成する（1つ上のレアリティになる。レジェンドは合成できない）。
 * そのあと、適応（どのカードとでも合成できる）は、合成先がある中でいちばん高いレアリティのカードと合成する
 */
function fuseAll(game, pid, ctx) {
  const isWild = (c) => ctx.cards[c.type]?.effect === 'wild';
  for (let i = 0; i < 20; i++) {
    const hand = game.getState(pid).players[pid].hand;
    let done = false;
    for (let a = 0; a < hand.length && !done; a++) {
      if (isWild(hand[a])) continue;
      const b = hand.findIndex((c, j) => j > a && c.type === hand[a].type);
      if (b >= 0 && game.fuse(hand[a].cardId, hand[b].cardId).ok) done = true;
    }
    if (done) continue;
    const wild = hand.find(isWild);
    if (!wild) return;
    const order = Object.keys(ctx.rarities ?? { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 });
    const rank = (c) => order.indexOf(ctx.cards[c.type].rarity);
    const partners = hand.filter((c) => !isWild(c) && ctx.cards[c.type].fuseTo).sort((x, y) => rank(y) - rank(x));
    if (!partners.length || !game.fuse(wild.cardId, partners[0].cardId).ok) return;
  }
}

function smartStep(game, pid, ctx) {
  fuseAll(game, pid, ctx);
  const { me, enemies, playable } = view(game, pid);
  const enemy = enemies[0];
  const castleSpells = typesWithEffect(ctx, 'damageEnemyCastle');
  // 自分の道の、ごほうびの多い魔物（5コイン以上か、レア以上のカード）にとどめを刺せるなら、魔物を狙う
  // （ファイアボールは城を削るいちばんの手段なので、小さな魔物には使わない）
  for (const c of playable.filter((x) => castleSpells.includes(x.type))) {
    const ms = game.getTargets(c.cardId).filter((t) => t.monsterId);
    const st = game.getState(pid);
    const kill = ms.find((t) => {
      const m = st.monsters.find((x) => x.monsterId === t.monsterId);
      return m.hp <= ctx.cards[c.type].amount && (m.reward >= 5 || ['rare', 'epic', 'legendary'].includes(m.rewardRarity));
    });
    if (kill && game.playCard(c.cardId, kill).ok) return true;
  }
  // とどめになるなら城への魔法
  for (const t of castleSpells) {
    if (enemy && ctx.cards[t].amount >= enemy.castleHp && playFirst(game, playable, [t])) return true;
  }
  // 毒にかかっていれば、解毒薬で治す（毒は永続なので、放っておくと削られ続ける）
  if (playFirst(game, playable, typesWithEffect(ctx, 'curePoison'))) return true;
  if (me.castleHp < me.castleMaxHp / 2 && playFirst(game, playable, typesWithEffect(ctx, 'healOwnCastle'))) return true;
  // 永続の毒は早く入れるほど効く。強い毒から
  const toxins = typesWithEffect(ctx, 'poisonEnemy').sort((a, b) => ctx.cards[b].amount - ctx.cards[a].amount);
  if (enemy && playFirst(game, playable, toxins)) return true;
  // 自分の兵士・城が毒・やけど・凍結なら、浄化の炎で治す
  const ailing = me.castlePoison || me.soldiers.some((s) => s.statuses?.poison || s.statuses?.burn || s.statuses?.frozen > 0);
  if (ailing && playFirst(game, playable, typesWithEffect(ctx, 'purifyFlare'))) return true;
  // シールド・ブラスト：城壁が10以上か、相手の城を落とせるなら
  if (enemy && (me.armor >= 10 || me.armor >= enemy.castleHp) && playFirst(game, playable, typesWithEffect(ctx, 'armorBlast'))) return true;
  // イグニッション・バースト：自分の城に余裕があり、相手の兵士が2体以上か、相手の城を落とせるなら
  for (const t of typesWithEffect(ctx, 'ignitionBurst')) {
    const roomy = me.castleHp > me.castleMaxHp / 2;
    if (enemy && roomy && (enemy.soldiers.length >= 2 || ctx.cards[t].amount >= enemy.castleHp) && playFirst(game, playable, [t])) return true;
  }
  // チェーン・ブラスト：いちばん前まで来ている相手の兵士を狙う
  if (enemy && enemy.soldiers.length > 0) {
    const front = (targets) => {
      const byId = new Map(enemies.flatMap((e) => e.soldiers).map((s) => [s.soldierId, s]));
      return [...targets].sort((a, b) => (byId.get(b.soldierId)?.position ?? -1) - (byId.get(a.soldierId)?.position ?? -1))[0];
    };
    for (const c of playable.filter((x) => ctx.cards[x.type].effect === 'chainBlast')) if (playWith(game, c.cardId, front)) return true;
  }
  if (enemy && enemy.soldiers.length >= 2 && playFirst(game, playable, typesWithEffect(ctx, 'damageEnemySoldiers'))) return true;
  // 次の進軍で城に着きそうな相手の兵士がいれば、凍結で止める
  const L = ctx.rules.laneLength;
  const threat = enemy && enemy.soldiers.some((s) => s.position + ctx.cards[s.type].speed >= L);
  if (threat && playFirst(game, playable, typesWithEffect(ctx, 'freezeEnemySoldiers'))) return true;
  // 凍結がなければ、突風で押し戻す
  if (threat && playFirst(game, playable, typesWithEffect(ctx, 'pushBackEnemySoldiers'))) return true;
  if (enemy && enemy.soldiers.length >= 2 && playFirst(game, playable, typesWithEffect(ctx, 'poisonEnemySoldiers'))) return true;
  const played = playFirst(game, playable, [
    ...soldierTypes(ctx),
    ...castleSpells,
    ...typesWithEffect(ctx, 'damageEnemySoldiers'),
    ...typesWithEffect(ctx, 'healOwnCastle'),
  ]);
  if (played) return true;
  // 出すものがないとき、コインを増やすカード
  if (playFirst(game, playable, typesWithEffect(ctx, 'gainCoins'))) return true;
  // 出すものがないとき：相手の手札が多ければ盗賊、自分の手札が弱ければ天の恵み、最後に神頼み
  // 精霊：今いなければ、1体呼ぶ（大精霊は使い切りなので、城HPが半分を切ったときだけ）
  // 刻の魔法：自分に獣（魔物の駒）・暗殺者がいれば夜に。夜で相手に獣が見えるか、魔物がいれば昼に戻す
  {
    const { state } = view(game, pid);
    const nightLover = (s) => ctx.cards[s.type]?.monster !== undefined || ctx.cards[s.type]?.beast || ctx.cards[s.type]?.role === 'ninja';
    const timeSpells = typesWithEffect(ctx, 'setTime');
    if (state.time === 'day' && me.soldiers.some(nightLover)) {
      if (playFirst(game, playable, timeSpells.filter((t) => ctx.cards[t].time === 'night'))) return true;
    }
    if (state.time === 'night' && !me.soldiers.some(nightLover) && (enemies.some((e) => e.soldiers.some(nightLover)) || state.monsters.length > 0)) {
      if (playFirst(game, playable, timeSpells.filter((t) => ctx.cards[t].time === 'day'))) return true;
    }
  }
  if (!me.spirit) {
    const spirits = typesWithEffect(ctx, 'summonSpirit').filter((t) => !ctx.cards[t].exhaust || me.castleHp * 2 < me.castleMaxHp);
    if (playFirst(game, playable, spirits)) return true;
  }
  if (enemy && enemy.handCount >= 3 && playFirst(game, playable, typesWithEffect(ctx, 'stealCard'))) return true;
  if (me.hand.length >= 4 && playFirst(game, playable, typesWithEffect(ctx, 'redrawHand'))) return true;
  return playFirst(game, playable, typesWithEffect(ctx, 'randomEffect'));
}

/** 出せるカードがなくなる（または役に立つ手がなくなる）まで、1枚ずつ出す。兵士・回復・精霊などは1ターンに何枚でも出せる */
function smartTurn(game, pid, ctx) {
  for (let i = 0; i < 15; i++) {
    if (!smartStep(game, pid, ctx)) return;
  }
}

/**
 * MP が少ないとき、マナ回復のカードを出す（MP を使う魔法が撃てなくなるのを防ぐ）。
 * 上限を超えて無駄にしないよう、回復量が入る分だけの余裕があるカードを、小さいものから出す
 */
function refillMp(game, pid, ctx) {
  const maxMp = game.getState(null).maxMp;
  if (!maxMp) return;
  const types = typesWithEffect(ctx, 'gainMp').sort((a, b) => ctx.cards[a].amount - ctx.cards[b].amount);
  if (!types.length) return;
  for (let i = 0; i < 6; i++) {
    const me = game.getState(pid).players[pid];
    if (me.mp > maxMp / 2) return;
    const room = maxMp - me.mp;
    const hand = me.hand.filter((c) => types.includes(c.type) && game.canPlayCard(c.cardId).ok);
    // 入りきる最大のカード。なければ、いちばん小さいカード
    const fits = hand.filter((c) => ctx.cards[c.type].amount <= room).sort((a, b) => ctx.cards[b.type].amount - ctx.cards[a.type].amount);
    const card = fits[0] ?? hand.sort((a, b) => ctx.cards[a.type].amount - ctx.cards[b.type].amount)[0];
    if (!card || !game.playCard(card.cardId).ok) return;
  }
}

/** どの戦い方も、ターンの最初に同点の選び方の乱数を入れる */
/**
 * マリガン（最初の手札の引き直し）で戻すカード。兵士が1枚もない手札なら全部、それ以外は戻さない（どの戦い方も同じ）。
 * 自分の手札しか見ない
 */
export function mulliganChoice(game, pid, ctx) {
  const hand = game.getState(pid).players[pid].hand ?? [];
  return hand.some((c) => ctx.cards[c.type]?.kind === 'soldier') ? [] : hand.map((c) => c.cardId);
}

export const STRATEGIES = Object.fromEntries(
  Object.entries(RAW_STRATEGIES).map(([name, st]) => [
    name,
    {
      ...st,
      takeTurn(game, pid, rng, ctx) {
        tieRng = rng;
        curCards = ctx.cards;
        curCtx = ctx;
        if (name !== 'pass') refillMp(game, pid, ctx);
        return st.takeTurn(game, pid, rng, ctx);
      },
    },
  ]),
);
