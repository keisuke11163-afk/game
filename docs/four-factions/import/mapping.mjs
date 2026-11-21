// 四大陣営 PR-B：台帳（CASTLE_FIELD_4陣営_全295カード台帳_v1.0.json）→ data/cards.json の対応表。
// 1行＝台帳の1枚。build.mjs がこれを読んで cards.json・shop.json・js/ui/stories-factions.js を書き出す。
// 読み方は README.md。数値はすべて仮（仕様書の仮値か、既存カードを雛形にした値）。
//
// 行の形
//   既存（status＝既存）：{ name, id, existing: true, reason }
//     rename: true   … 名前を台帳の名前に変える（人間が決めた4件だけ）
//     relink: true   … fuseTo を台帳の next_name に付けかえる（人間が決めたものだけ）
//   新規（status＝新規案）：{ name, def: { kind, ...効果の数値 }, implemented, reason, story, effectPlan?, note?, description? }
//     ID は `${chain_id}_${rarity}`（build.mjs が決める）。faction・rarity・element・fuseTo・weight・count は台帳と規則から機械的に付ける

/** 今回取り込む範囲（台帳の faction と section）。B2〜B4 で広げる */
export const SCOPE = [
  { faction: '王国軍' },
  { faction: '全陣営共通' },
  { faction: '森の同盟', section: '武器' },
];

const EXISTING = '既存カード（効果・数値・IDは今のまま）';
const ex = (name, id, extra = {}) => ({ name, id, existing: true, reason: EXISTING, ...extra });

// ---- 王国：光の攻撃魔法（仕様 2.1：ダメージ仮値 2/3/5/7/12。エピック以上は全レーン案） ----
const lightSpell = (name, amount, lane, story) => ({
  name,
  def: { kind: 'spell', effect: 'damageEnemySoldiers', amount, ...(lane ? { scope: 'lane' } : {}) },
  implemented: true,
  reason: `既存の damageEnemySoldiers（兵士へのダメージ）に光属性を付けたもの。光の付着・反応（今の実装）まで実際に効く。${lane ? '選んだ1レーン' : '全レーン'}・${amount}ダメージは仕様書の仮値`,
  story,
});

// ---- 武器（王国の光・森の4属性。仕様：攻撃補正 +1/+2/+4/+6/+9） ----
const BONUS = { common: 1, uncommon: 2, rare: 4, epic: 6, legendary: 9 };
const weapon = (name, rarity, story) => ({
  name,
  def: { kind: 'weapon', attackBonus: BONUS[rarity] },
  implemented: true,
  reason: `既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+${BONUS[rarity]}は仕様書の値`,
  story,
});

// ---- 王国：聖術師（仕様：光・浄化・守護）。兵士に属性を持たせるスキーマも、浄化・守護の効果もまだない ----
const PRIEST_PLAN = '光属性の聖術師。光・浄化・守護（味方の状態異常を治す・味方を守る）。数値・効き方は未決定（PR-C）';
const PRIEST_REASON = '浄化・守護の効果がまだない。兵士に属性（光）を持たせるスキーマもない（今の兵士の属性は武器で決まる）。'
  + 'ふつうの魔法使いとして出すと「既存効果の代用で実装済み」になるので false（仕様 PR-B）';
const priest = (name, hp, attack, story) => ({
  name,
  def: { kind: 'soldier', role: 'mage', hp, attack, range: 2, stay: 2 },
  implemented: false,
  reason: PRIEST_REASON,
  effectPlan: PRIEST_PLAN,
  note: `HP${hp}・攻撃${attack}・射程2・2ターンで帰る（魔法使い系の数値を雛形に、HP高め・攻撃低めにした仮の値）`,
  description: `【準備中】光の聖術師。浄化と守護の力はまだ使えない（HP${hp}・攻撃${attack}）`,
  story,
});

// ---- 王国：カウンター（仕様の仮値。防御の場面で「軽減・無効・反撃」を起こすしくみがまだない） ----
const COUNTER_REASON = '防御の場面で、ダメージを減らす・無効にする・攻撃者へ反撃するしくみがまだない（今の防御は城壁・盾・反射・身代わりだけ）。PR-C で作る';
const counter = (name, plan, story) => ({
  name,
  def: { kind: 'defense' },
  implemented: false,
  reason: COUNTER_REASON,
  effectPlan: `${plan}（仮値。1回の被攻撃に反応カードは1枚まで）`,
  description: `【準備中】${plan}`,
  story,
});

export const ROWS = [
  // ================= 王国軍（専用59） =================
  // 兵士
  ex('歩兵', 'infantry'), ex('槍兵', 'spearman'), ex('重装兵', 'heavy'), ex('巨人', 'giant'), ex('勇者', 'hero'),
  ex('斥候騎兵', 'scout'), ex('騎兵', 'cavalry'), ex('騎士', 'knight'),
  ex('聖騎士', 'paladin', { relink: true, reason: `${EXISTING}。合成先を台帳どおりグランドパラディンにつないだ（人間の決定。PR-A では null）` }),
  {
    name: 'グランドパラディン',
    def: { kind: 'soldier', hp: 10, attack: 10, speed: 5 },
    implemented: true,
    reason: 'ふつうの進む兵士（melee）として実際に進軍・戦闘・城攻撃する。騎兵系の最上位（竜騎士の置き換え）なので、竜騎士と同格の HP10・攻撃10・速さ5（仮）',
    story: '聖騎士の中から、ただ一人選ばれる王国の守り手。白銀の馬を駆り、その突撃の通ったあとには、光の轍が残るという。',
  },
  ex('見習い弓兵', 'apprenticeArcher'), ex('弓兵', 'archer'), ex('長弓兵', 'longbowman'), ex('狙撃手', 'sniper'), ex('天弓の射手', 'skyArcher'),
  priest('見習い聖術師', 4, 2, '神殿の掃除から修行を始めた見習い。まだ小さな光しか灯せないが、その光は不思議と仲間の足を軽くする。'),
  priest('聖術師', 5, 3, '祈りの言葉をすべて覚えた聖術師。傷ついた兵士のそばに立つと、痛みが少しやわらぐと噂される。'),
  priest('神官', 6, 5, '王都の神殿をあずかる神官。戦場に立つときは、祭壇の灯を小さな瓶に入れて持っていく。'),
  priest('大神官', 8, 7, '幾千の祈りを捧げてきた大神官。その声が響くと、毒も呪いも、朝霧のように消えていくという。'),
  priest('セラフィム', 10, 9, '天から降りたとも、祈りの果てに翼を得たとも言われる聖術師。六枚の光の羽が、城を包むように広がる。'),
  // 武器
  weapon('ルミナスランス', 'common', '朝の光をうつして鍛えた槍。穂先はいつも、かすかに温かい。'),
  weapon('ホーリーランス', 'uncommon', '神殿で清められた槍。闇をまとう者は、その輝きを正面から見られない。'),
  weapon('セイクリッドランス', 'rare', '聖騎士団に代々伝わる槍。突くたびに、祈りの言葉が光になって散る。'),
  weapon('セラフィムランス', 'epic', '天使の羽を一枚封じたという槍。振るうと、白い風が戦場を渡る。'),
  weapon('ディヴァインランス', 'legendary', '神の光そのものを束ねた槍。持ち主を選び、選ばれた者は二度と迷わない。'),
  weapon('聖鉄の剣', 'common', '祈りを込めて打った鉄の剣。ただの鉄より、ほんの少しだけ明るく光る。'),
  weapon('祝福の剣', 'uncommon', '大神官の祝福を受けた剣。刃こぼれしても、夜明けには元に戻っている。'),
  weapon('光輝の剣', 'rare', '鞘から抜くと、あたりが昼のように明るくなる剣。夜の見張りに重宝された。'),
  ex('聖剣', 'holySword', { reelement: true, reason: `${EXISTING}。台帳は光の剣系（光）。人間の決定で、光属性を付けた（攻撃+6は変えない）` }),
  ex('神剣', 'godSword', { reelement: true, reason: `${EXISTING}。台帳は光の剣系（光）。人間の決定で、光属性を付けた（攻撃+9は変えない）` }),
  // 攻撃魔法（光）
  lightSpell('ルミナ', 2, true, '指先に灯す、小さな光の粒。見習いでも使える、いちばん最初の光の魔法。'),
  lightSpell('ホーリーレイ', 3, true, '空から一筋の光を呼ぶ魔法。闇に慣れた者には、針のように刺さる。'),
  lightSpell('プリズムバースト', 5, true, '光を七色に割って、はじけさせる魔法。見とれた敵ほど、深く傷つく。'),
  lightSpell('セラフィックレイ', 7, false, '天の高みから、戦場のすべての道に光の柱を落とす。祈りの長さだけ、柱は太くなる。'),
  lightSpell('ディヴァインノヴァ', 12, false, '小さな太陽を生み出し、戦場に咲かせる大魔法。光が消えたあと、敵の影は残らない。'),
  // 回復・兵士防御・城防御・特殊防御
  ex('小回復', 'minorHeal'), ex('ヒール', 'heal'), ex('大回復', 'greatHeal'), ex('聖なる光', 'holyLight'), ex('女神の祝福', 'goddess'),
  ex('盾', 'shield'), ex('大盾', 'bigShield'), ex('鋼の盾', 'steelShield'), ex('聖盾', 'holyShield'), ex('神盾', 'godShield'),
  ex('土嚢', 'sandbag'), ex('城壁', 'wall'), ex('石壁', 'stoneWall'), ex('城門', 'gate'), ex('神の結界', 'barrier'),
  ex('身代わり', 'decoy', { reason: `${EXISTING}。台帳は合成先なしだが、今の合成先（反射）は同じ王国なので今のまま` }),
  ex('反射', 'reflect'),
  ex('ピュリファイ・フレア', 'purifyFlare', { reason: `${EXISTING}。台帳は合成先なしだが、今の合成先（大回復）は同じ王国なので今のまま` }),
  ex('シールド・ブラスト', 'shieldBlast'),
  // カウンター
  counter('パリィ', '兵士が城に着いたときのダメージを3減らす', '剣を受け流す、騎士見習いが最初に覚える技。完全には防げないが、致命の一撃をかすり傷に変える。'),
  counter('リポスト', '兵士が城に着いたときのダメージを5減らし、攻撃した兵士に2ダメージ', '受け流した勢いのまま、すかさず突き返す。守りと攻めの境目をなくした剣技。'),
  counter('アーケインガード', '城に当たる魔法のダメージを半分にし、MPを1回復', '魔法の流れを読み、その半分をそらす守りの術。そらした魔力の一部は、術者の手に戻る。'),
  counter('セイクリッドカウンター', '兵士が城に着いたときのダメージを無効にし、攻撃した兵士に6ダメージ', '聖なる誓いのもとに放つ反撃。城門に手をかけた敵は、光の刃に弾き返される。'),
  counter('ディヴァインリベンジ', '攻撃1回を無効にし、元のダメージの半分（最大10）を相手の城に返す', '神の怒りを借りる最後の守り。受けた痛みは、半分になって相手の城へ帰っていく。'),

  // ================= 全陣営共通（7。すべて既存） =================
  ex('魔力のかけら', 'manaShard'), ex('魔力のしずく', 'manaDrop'), ex('魔力の水晶', 'manaCrystal'), ex('魔力の泉', 'manaSpring'), ex('世界樹のしずく', 'worldTreeDew'),
  ex('適応', 'adapt'),
  ex('天の恵み', 'blessing'),

  // ================= 森の同盟：武器（20） =================
  ex('フレイムソード', 'flameSword', { rename: true, relink: true, reason: `${EXISTING}。名前を台帳の名前に変え（旧名：炎の剣）、合成先を鉄の剣からブレイズソードへ付けかえた（人間の決定）` }),
  weapon('ブレイズソード', 'uncommon', '森の焚き火で鍛えなおした炎の剣。刃のまわりで、火の粉が蝶のように舞う。'),
  weapon('インフェルノセイバー', 'rare', '火山の奥の炎で打たれたサーベル。振るうたびに、熱風が森の葉をゆらす。'),
  weapon('フェニックスブレード', 'epic', '不死鳥の羽を柄に巻いた剣。折れても、灰の中から元の姿でよみがえる。'),
  weapon('イグニスレガリア', 'legendary', '火の精霊王が森の王に贈った剣。炎はけっして森を焼かず、敵だけを焦がす。'),
  ex('アクアスピア', 'waterSpear', { rename: true, relink: true, reason: `${EXISTING}。名前を台帳の名前に変え（旧名：水の槍）、合成先を鉄の剣からタイドスピアへ付けかえた（人間の決定）` }),
  weapon('タイドスピア', 'uncommon', '満ち潮の夜に鍛えた槍。穂先にはいつも、ひとしずくの水が光っている。'),
  weapon('タイダルランス', 'rare', '大波をかたどった長槍。突けば、引き潮のように敵の力をさらっていく。'),
  weapon('オーシャンランス', 'epic', '深い海の色をした槍。耳を当てると、遠い波の音が聞こえる。'),
  weapon('リヴァイアサンランス', 'legendary', '海の主リヴァイアサンの牙から削り出した槍。水のあるところすべてが、持ち主の味方になる。'),
  ex('ゲイルボウ', 'windBow', { rename: true, relink: true, reason: `${EXISTING}。名前を台帳の名前に変え（旧名：風の弓）、合成先を鉄の剣からストームボウへ付けかえた（人間の決定）` }),
  weapon('ストームボウ', 'uncommon', '嵐の日に張った弦の弓。矢は風に乗って、思いもよらない角度から飛んでくる。'),
  weapon('サイクロンボウ', 'rare', '弦を引くと、足もとに小さな竜巻が生まれる弓。エルフの名手だけが扱える。'),
  weapon('シルフィードボウ', 'epic', '風の乙女シルフィードが宿る弓。矢を放つたび、笑い声のような風音がする。'),
  weapon('テンペストボウ', 'legendary', '大嵐そのものを弦に張った弓。一度引けば、空の雲までがその向きに流れる。'),
  ex('アースハンマー', 'earthHammer', { rename: true, relink: true, reason: `${EXISTING}。名前を台帳の名前に変え（旧名：土の槌）、合成先を鉄の剣からグラナイトハンマーへ付けかえた（人間の決定）` }),
  weapon('グラナイトハンマー', 'uncommon', '花崗岩の塊をそのまま柄につけた槌。重いが、振りおろせば地面がうなる。'),
  weapon('クエイクハンマー', 'rare', '打ちつけると大地が震える槌。森の獣たちは、その音を聞くと道をあける。'),
  weapon('テラブレイカー', 'epic', '山を割ったと伝わる大槌。持ち手には、古い大地の紋様が刻まれている。'),
  weapon('ガイアクラッシャー', 'legendary', '大地の母ガイアの心臓石を埋めこんだ槌。ひと振りで、戦場の形が変わる。'),
];
