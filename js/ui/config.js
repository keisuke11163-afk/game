// 画面の演出・操作の調整値。数値はここにまとめる（ゲームのルールの数値は data/ にある）。
// 時間はすべてミリ秒。speed を 2 にすると全部の演出が倍の長さになる。

export const UI_CONFIG = {
  // 全演出の速さの倍率（大きいほどゆっくり。デバッグパネルから変えられる）
  speed: 1,

  // 演出の長さ
  timing: {
    soldierMove: 280,      // 兵士が進む（跳ねる演出を使わないときの待ち時間）
    soldierHop: 170,       // 兵士が1マスぶん、ぴょんと跳ねる時間
    clashLunge: 150,       // ぶつかるとき、前に飛び出す時間
    clashReturn: 160,      // ぶつかったあと、元の位置に戻る時間
    centerPulse: 2400,     // 真ん中のマスの光が1回明滅する時間
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
    explosionBase: 0.7, explosionPerDamage: 0.05, explosionMax: 1.8, // 爆発の絵の大きさ（城の幅に対する倍率）
  },

  // 兵士同士がぶつかったとき
  clash: {
    hitstop: 90,
    shake: 6,
    dustSize: 1.6,          // 土けむりの大きさ（兵士の大きさに対する倍率）
  },

  // 兵士にダメージが入ったとき
  soldierHit: {
    hitstop: 50,
    shake: 3,
    numberSize: 26,
    numberDuration: 600,
  },

  // 回復の数字
  healNumber: { size: 40, duration: 800 },

  // 盤面の並べ方。値は「盤面（上の帯と手札の間）」の幅・高さに対する割合（0〜1）
  board: {
    road: {
      x: 0.5,          // 道の中心（横）
      top: 0.28,       // いちばん上のマスの中心（縦）
      bottom: 0.72,    // いちばん下のマスの中心（縦）。マスはこの間に laneLength 個、等間隔に並ぶ
      sway: 0.035,     // 道のうねりに合わせて、マスを左右にずらす幅
      swayPhase: 0,    // うねりの始まり（0〜1）
    },
    castle: {
      height: 0.21,    // 城の高さ。上下とも同じ大きさ
      x: 0.47,         // 城の中心（横）
      topY: 0.12,      // 相手の城の中心（縦）
      bottomY: 0.88,   // 自分の城の中心（縦）
      signOffset: 0.5, // HPの看板の左端の位置（城の中心から右へ、城の幅に対する割合）
      signSize: 0.72,  // HPの看板の高さ（城の高さに対する割合）
      reachY: 0.07,    // 城に着いた兵士が止まる位置（城の中心から道の側へ）
    },
    squareSize: 58,    // マスの印の大きさ(px)
    unitSize: 60,      // 兵士の絵の大きさ(px)
    stackOffset: 18,   // 同じマスに何体かいるとき、横にずらす幅(px)
  },

  // カードの見た目。枠の画像の中の位置（枠の幅・高さに対する割合）。仮の枠もこの位置で描く
  card: {
    width: 86,         // 手札のカードの幅(px)。高さは枠の画像の縦横比で決まる
    layout: {
      art: { x: 0.12, y: 0.13, w: 0.76, h: 0.5 },        // 絵の窓
      name: { y: 0.75, h: 0.14 },                        // 名前の帯（中心と高さ）
      medalLeft: { x: 0.14, y: 0.1, r: 0.13 },           // 左上のメダル
      medalRight: { x: 0.86, y: 0.1, r: 0.13 },          // 右上のメダル
    },
  },

  // 羊皮紙のパネル（説明欄・捨てる画面・お知らせ）を9分割で伸ばすときの、ふちの幅
  panel: { slice: 56, border: 20 },

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
