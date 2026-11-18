// 画面の演出・操作の調整値。数値はここにまとめる（ゲームのルールの数値は data/ にある）。
// 時間はすべてミリ秒。speed を 2 にすると全部の演出が倍の長さになる。

import { isJapan } from './edition.js';

// 日本バージョンの兵士の系統（data/japan/cards.json の根っこのカード）
const JAPAN_FAMILIES = [
  {root:'ashigaru',name:'足軽',note:'進んで城を攻める。攻撃と打たれ強さの基準。'},
  {root:'hayauma',name:'騎馬',note:'速く進んで城へ。打たれ弱いので出す道を選ぼう。'},
  {root:'yumiAshigaru',name:'弓',note:'動かずに近い相手の兵士や妖怪を撃つ。射撃の反撃は受けない。'},
  {root:'minaraiJujutsushi',name:'呪術師',note:'動かずに撃つ。兵士も妖怪もいなければ狙った城を撃つ。'},
  {root:'shinobiMinarai',name:'忍者',note:'相手から見えず、敵の兵士をすり抜けて城へ。妖怪には止められる。打たれ弱い。'},
];

export const UI_CONFIG = {
  soldierFamilies: isJapan ? JAPAN_FAMILIES : [
    {root:'infantry',name:'普通の兵士',note:'進んで城を攻める。攻撃と打たれ強さの基準。'},
    {root:'scout',name:'騎兵',note:'速く進んで城へ。打たれ弱いので出す道を選ぼう。'},
    {root:'apprenticeArcher',name:'弓兵',note:'動かずに近い相手の兵士や魔物を撃つ。射撃の反撃は受けない。'},
    {root:'apprenticeMage',name:'魔法使い',note:'動かずに撃つ。兵士も魔物もいなければ狙った城を撃つ。'},
  ],
  maxAnimation: 2000,
  cpuThink: 450,
  cpuLevels: {
    easy: {name:'よわい',strategy:'defensive'},
    normal: {name:'ふつう',strategy:'rush'},
    hard: {name:'つよい',strategy:'smart'},
  },
  plazaSize: 640, plazaSizeCompact: 480,
  teamColors: Object.assign(['#4da3e8','#f5923e','#9c73d8','#41a589','#e27299','#a88d45','#6984c9','#b37b60'], {t1:'#4da3e8', t2:'#f5923e', t3:'#9c73d8', t4:'#41a589'}),
  castleTiers: [{min:1,name:'castle',towers:false}, {min:2,name:'towers',towers:true}, {min:4,name:'walls',towers:true,wall:true}, {min:6,name:'fortress',towers:true,wall:true,fortress:true}],
  // 全演出の速さの倍率（大きいほどゆっくり。デバッグパネルから変えられる）
  // 1 だと短すぎて何が起きたか分からなかった（人間の指示）ので 1.8 にした。演出はタップで早送りできる
  speed: 1.8,

  // 演出の長さ
  // 天候が変わったときの警報の色合い：alert（赤）・good（金）・calm（青）。書いていない天候は alert
  weatherTone: { sunny: 'good', coinRain: 'good', rain: 'calm' },

  // Web Animations API の共通イージング。各演出の長さは timing を使う。
  easing: { enter: 'ease-out', exit: 'ease-in', linear: 'linear', inOut: 'ease-in-out' },

  timing: {
    titleArrival: 780,     // 初回のタイトル登場
    deckTransfer: 215,     // カードが編成の帯へ飛ぶ・帯から落ちる
    deckReady: 280,        // 目標コストに達したときの光
    weatherAlarm: 980,    // 天候が変わった警報
    weatherEnd: 520,       // 天候がおさまった
    lightning: 520,        // 大雨の雷
    fusion: 900,
    beastRecruit: 920,    // 魔物の駒が手札へ入るまで
    beastRecruitStill: 480,
    reward: 1100,        // 魔物報酬のレアリティを読む時間
    soldierShot: 520,
    shotAim: 230,          // 弓兵・魔法使いがねらう（ため）
    drawFly: 300,          // 引いたカードが山札から手札へ飛ぶ
    soldierReturn: 650,
    soldierMove: 280,      // 兵士が進む
    deploy: 240,           // 兵士が出てくる
    defenseResult: 900,   // 反射・身代わりの帯（カード拡大が終わってから表示）
    cardPlay: 420,         // 出したカードを大きく見せる
    spellProjectile: 260,  // ファイアボールが飛ぶ
    thunder: 300,          // 雷
    heal: 420,             // 回復の光
    soldierDeath: 260,     // 兵士が消える
    draw: 140,             // カードを引く（1枚ごとの間隔）
    shuffle: 420,          // 山札のシャッフル
    afterTurnStart: 120,   // 手番開始の画面を開いてから、進軍を始めるまで
    gameOverDelay: 300,    // 決着の一撃のあと、勝敗画面を出すまで
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
    discard: 150,          // 手札を捨てたあと
    afterSoldierHit: 160,  // 兵士にダメージが入ったあとの間
    afterMonsterHit: 120,  // 魔物にダメージが入ったあとの間
    autoEndTurn: 700,      // やることがないとき、自動でターンを終えるまでの間（「ターンを終えます」を読む時間）
  },

  // 城にダメージが入ったときの手応え。値 = base + perDamage × ダメージ（max で頭打ち）
  castleHit: {
    hitstopBase: 60, hitstopPerDamage: 10, hitstopMax: 240,  // 一瞬止める時間
    shakeBase: 0, shakePerDamage: 0.75, shakeMax: 13,         // 揺れ幅(px)
    shakeDuration: 210,
    numberBase: 36, numberPerDamage: 3, numberMax: 84,       // ダメージ数字の大きさ(px)
    numberDuration: 800,
    finishHitstop: 520,    // 決着の一撃だけはこの時間止める
    finishShake: 18,
  },

  // 画面ぜんたいの揺れ（盤面ごと揺らす）。ダメージを受けたとき・魔法を使ったとき。値 = base + perPower × 強さ（max で頭打ち）
  screenShake: {
    soldier: { base: 0, minPower: 1.2, perPower: 2.1, max: 4, duration: 160 },
    monster: { base: 0, minPower: 1.1, perPower: 2.5, max: 5, duration: 185 },
    spell: { base: 0, minPower: 8, perPower: .35, max: 8, duration: 190 },
    weather: { base: 5, duration: 245 },
  },

  // 兵士にダメージが入ったとき
  // power（強さ）= powerBase + powerPerDamage × ダメージ（powerMax で頭打ち）。数字の大きさ・止める時間・ノックバックにかかる
  soldierHit: {
    hitstop: 50, hitstopMax: 160,
    powerBase: 0.7, powerPerDamage: 0.16, powerMax: 2.2,
    lethalBonus: 0.5,      // とどめの一撃は、そのぶん長く止める
    weakBonus: 0.4,        // 属性の弱点をついたとき
    knockback: 9,          // 押される距離(px) × power
    knockOut: 56,          // やられたときに吹き飛ぶ距離(px)
    shake: 3,
    numberSize: 26,
    numberDuration: 600,
    shakeDuration: 200,
  },

  // 魔物にダメージが入ったとき
  monsterHit: {
    hitstop: 70, hitstopMax: 200,
    powerBase: 0.7, powerPerDamage: 0.14, powerMax: 2.2,
    lethalBonus: 0.6, weakBonus: 0.4,
    knockback: 6,          // 魔物は重いので、兵士より動かない
    shake: 4,
    numberSize: 30,
    numberDuration: 650,
    shakeDuration: 200,
  },

  // 回復の数字
  healNumber: { size: 40, duration: 800 },

  rewardFx: { base: 650, perRank: 175, luckyExtra: 180, max: 1600, collapse: 160, sparksBase: 6, sparksPerRank: 5 },
  coinFx: { turnScale: .7, cardScale: 1.4, turnDuration: 400, cardDuration: 900, flyMax: 8, flyDuration: 520 },
  // 火の魔法の見せ方。tiers：このダメージ以上で一段ずつ大きくなる（1段目から、空から落ちてくる）
  fireFx: { tiers: [12, 18, 30], scaleBase: 0.9, scalePerDamage: 0.06, skyScaleBase: 1.9, skyScalePerTier: 0.5 },
  // 背景の小さな動き（葉の数と、画面を横切る秒数）
  ambient: { leaves: 7, leafMin: 14, leafMax: 26 },
  warningHpRatio: .25,

  // コイン・盾・城壁などの小さな数字
  smallNumber: { size: 22, duration: 700 },

  // 手札の並び：種類のグループの順（js/ui/handOrder.js）。その中はレアリティの高い順
  hand: {
    groupOrder: ['soldier', 'weapon', 'spell', 'defense', 'special'],
  },

  // カードの使い方（どれも同時に有効にできる。デバッグパネルから切り替えられる）
  input: {
    longPress: 450,
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
