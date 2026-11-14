// 画面の演出・操作の調整値。数値はここにまとめる（ゲームのルールの数値は data/ にある）。
// 時間はすべてミリ秒。speed を 2 にすると全部の演出が倍の長さになる。

export const UI_CONFIG = {
  // 全演出の速さの倍率（大きいほどゆっくり。デバッグパネルから変えられる）
  speed: 1,

  // 演出の長さ
  timing: {
    soldierMove: 280,      // 兵士が進む
    deploy: 240,           // 兵士が出てくる
    cardPlay: 420,         // 出したカードを大きく見せる
    spellProjectile: 260,  // ファイアボールが飛ぶ
    thunder: 300,          // 雷
    heal: 420,             // 回復の光
    soldierDeath: 260,     // 兵士が消える
    draw: 140,             // カードを引く（1枚ごとの間隔）
    shuffle: 420,          // 山札のシャッフル
    afterTurnStart: 120,   // 手番開始の画面を開いてから、進軍を始めるまで
    gameOverDelay: 450,    // 決着の一撃のあと、勝敗画面を出すまで
    toast: 2200,           // 「出せない理由」などの表示時間
    clash: 220,            // 兵士同士・兵士と魔物がぶつかる
    equip: 300,            // 武器を持たせる・盾をつける・とぎ石
    status: 320,           // 毒・凍結がかかる
    statusCleared: 160,    // 毒・凍結が治る
    armor: 320,            // 城壁を置く・消える
    round: 520,            // 「第N周」の表示
    monsterAppear: 600,    // 魔物が出る
    monsterAttack: 300,    // 魔物が城に飛びかかる
    monsterDefeat: 600,    // 魔物を倒した
    coins: 260,            // コインが増える・減る
    upgrade: 420,          // 強化を買った
  },

  // 城にダメージが入ったときの手応え。値 = base + perDamage × ダメージ（max で頭打ち）
  castleHit: {
    hitstopBase: 60, hitstopPerDamage: 10, hitstopMax: 240,  // 一瞬止める時間
    shakeBase: 4, shakePerDamage: 1.2, shakeMax: 22,         // 揺れ幅(px)
    shakeDuration: 320,
    numberBase: 36, numberPerDamage: 3, numberMax: 84,       // ダメージ数字の大きさ(px)
    numberDuration: 800,
    finishHitstop: 520,    // 決着の一撃だけはこの時間止める
    finishShake: 30,
  },

  // 兵士にダメージが入ったとき
  soldierHit: {
    hitstop: 50,
    shake: 3,
    numberSize: 26,
    numberDuration: 600,
  },

  // 魔物にダメージが入ったとき
  monsterHit: {
    hitstop: 70,
    shake: 4,
    numberSize: 30,
    numberDuration: 650,
  },

  // 回復の数字
  healNumber: { size: 40, duration: 800 },

  // コイン・盾・城壁などの小さな数字
  smallNumber: { size: 22, duration: 700 },

  // カードの使い方（どれも同時に有効にできる。デバッグパネルから切り替えられる）
  input: {
    useButton: true,      // タップで選ぶ →「使う」ボタン
    tapAgain: true,       // 選んだカードをもう一度タップ
    dragToPlay: true,     // カードを盤面まで上にドラッグして離す
    dragStartDistance: 14, // これだけ上に動かしたらドラッグ開始(px)
  },
};

/** base + per × amount を max で頭打ちにする */
export function scaled(base, per, max, amount) {
  return Math.min(max, base + per * amount);
}
