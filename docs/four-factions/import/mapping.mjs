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
  { faction: '森の同盟' }, // B1：武器20。B2：残り（兵士・攻撃魔法・精霊召喚・自然補助・回復・城防御・兵士防御）
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

// ---- 森の同盟（B2）。仕様 2.2。数値は仕様書の仮値か、既存カードを雛形にした値 ----
const RAR = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

// 兵士：獣人（進む近接前衛。仕様「獣人＝進軍可能な近接前衛」。数値は既存の騎兵・普通の兵士を雛形にした仮の値）
const beast = (name, rarity, hp, attack, speed, story) => ({
  name,
  def: { kind: 'soldier', hp, attack, speed },
  implemented: true,
  reason: 'ふつうの進む兵士（melee）として実際に進軍・戦闘・城攻撃する。HP・攻撃・速さは仮の値（普通の兵士と騎兵の中間）',
  note: `獣人系。HP${hp}・攻撃${attack}・速さ${speed}（仮）。属性なし（台帳の属性は空）`,
  story,
});
// 兵士：エルフ（遠距離支援。既存の弓兵の数値をそのまま使った仮の値）
const elf = (name, hp, attack, story) => ({
  name,
  def: { kind: 'soldier', role: 'archer', hp, attack, range: 2, stay: 2 },
  implemented: true,
  reason: '既存の弓兵（archer）として実際に動かずに撃つ（射程2・2ターンで帰る）。仕様「エルフ＝遠距離支援」。数値は王国の弓兵系と同じ仮の値',
  note: `エルフ系。HP${hp}・攻撃${attack}・射程2・2ターンで帰る（王国の弓兵系と同じ数値の仮）。属性なし`,
  story,
});
// 兵士：ドルイド（四大精霊契約・属性魔法支援。仕様「陣営専用魔法兵士」）
const DRUID_PLAN = '火・水・風・土の四大精霊と契約する魔法兵士。召喚中の精霊と属性魔法を組み合わせた追加の属性反応（精霊起点反応）を起こす。数値・効き方は未決定（PR-C）';
const DRUID_REASON = '精霊を起点にした属性反応（召喚中の精霊と別属性の魔法で追加反応）のしくみがまだない。兵士に属性を持たせるスキーマもない（台帳の属性は「火・水・風・土」の4つ）。'
  + 'ふつうの魔法使いとして出すと「既存効果の代用で実装済み」になるので false（仕様 PR-B）';
const druid = (name, hp, attack, story) => ({
  name,
  def: { kind: 'soldier', role: 'mage', hp, attack, range: 2, stay: 2 },
  multiAttribute: true,
  implemented: false,
  reason: DRUID_REASON,
  effectPlan: DRUID_PLAN,
  note: `HP${hp}・攻撃${attack}・射程2・2ターンで帰る（魔法使い系の数値を雛形にした仮の値）。台帳の属性は「火・水・風・土」（複数。スキーマに書けない）`,
  description: `【準備中】四大精霊と契約するドルイド。精霊と属性魔法の連携はまだ使えない（HP${hp}・攻撃${attack}）`,
  story,
});
// 攻撃魔法（仕様：兵士1体へのダメージ仮値 火2/3/5/7/12・水2/3/4/6/9・風2/3/4/6/9・土2/3/5/7/10。低レアは選択レーン、高レアは全レーン）
const FOREST_DMG = {
  fire: [2, 3, 5, 7, 12],
  water: [2, 3, 4, 6, 9],
  wind: [2, 3, 4, 6, 9],
  earth: [2, 3, 5, 7, 10],
};
const FOREST_SPELL_FX = { fire: '直接火力', water: '属性連鎖', wind: '拡散', earth: '拘束' };
const EL_JA = { fire: '火', water: '水', wind: '風', earth: '土' };
const forestSpell = (name, el, i, story) => {
  const amount = FOREST_DMG[el][i];
  const lane = i <= 2;
  const range = lane ? '選んだ1レーン' : '全レーン';
  if (el === 'fire') {
    return {
      name,
      def: { kind: 'spell', effect: 'damageEnemySoldiers', amount, ...(lane ? { scope: 'lane' } : {}) },
      implemented: true,
      reason: `既存の damageEnemySoldiers（兵士へのダメージ）に火属性を付けたもの。仕様の火は「直接火力」（追加効果なし）なので、今のしくみで仕様どおりに効く。属性の付着・反応も実際に効く。${range}・${amount}ダメージは仕様書の仮値`,
      note: '仕様の火は「直接火力」＝ダメージが本体で、追加効果はない（今の効果で仕様どおり）',
      story,
    };
  }
  return {
    name,
    def: { kind: 'spell' },
    implemented: false,
    reason: `仕様の追加効果（${FOREST_SPELL_FX[el]}）を起こすしくみがまだなく、ダメージと属性だけで出すと追加効果がなく火より弱いだけになるため false（既存効果の代用にしない。仕様 PR-B）。PR-C で作る`,
    effectPlan: `${EL_JA[el]}属性の攻撃魔法。${range}の相手の兵士に${amount}ダメージ（仮値）に加えて、追加効果「${FOREST_SPELL_FX[el]}」を起こす（内容は未決定。PR-C）`,
    note: `今の既存効果だけなら damageEnemySoldiers ${amount}（${EL_JA[el]}属性・${range}）`,
    description: `【準備中】${EL_JA[el]}の攻撃魔法。「${FOREST_SPELL_FX[el]}」の追加効果はまだ使えない（予定：${range}・${amount}ダメージ）`,
    story,
  };
};
// 回復（仕様：城と傷ついた味方兵士1体を同時回復。城/兵士 4/2, 8/3, 14/5, 24/8, 40/12）。兵士を回復するしくみがない
const HEAL = [[4, 2], [8, 3], [14, 5], [24, 8], [40, 12]];
const forestHeal = (name, i, story) => ({
  name,
  def: { kind: 'spell' },
  multiAttribute: true,
  implemented: false,
  reason: '傷ついた味方の兵士を回復するしくみがまだない（今の回復は城だけの healOwnCastle）。城だけ回復する既存効果で出すと「代用」になるので false（仕様 PR-B）。PR-C で作る',
  effectPlan: `城HP+${HEAL[i][0]} と、傷ついた味方兵士1体のHP+${HEAL[i][1]} を同時に回復（仮値。兵士がいなくても城は回復できる）`,
  note: '台帳の属性は「水・生命」（複数。スキーマに書けない）',
  description: `【準備中】城と傷ついた味方の兵士1体を同時に回復する（城+${HEAL[i][0]}・兵士+${HEAL[i][1]}）`,
  story,
});
// 城防御（仕様：コモンから 3/5/9/15/25）。armorCastle をそのまま使う。「破壊されたとき攻撃兵士の次の進軍を妨害する」は仕様が「案」としているだけなので含めない
const WALL = [3, 5, 9, 15, 25];
const plantWall = (name, i, story) => ({
  name,
  def: { kind: 'defense', effect: 'armorCastle', amount: WALL[i] },
  multiAttribute: true,
  implemented: true,
  reason: `既存の armorCastle（城壁。足し算で積む・上限あり・ダメージを先に受ける）として実際に効く。城壁の値 ${WALL[i]} は仕様書の値`,
  note: `王国の城壁系（城壁 5・石壁 9・城門 15・神の結界 25）と同じ数値帯の仮カード（王国の城壁系とは別カード。数値は仕様書の値）。台帳の属性は「土・植物」。仕様の「壁が破壊されたとき攻撃した兵士の次の進軍を1回妨害」は「案」で未決定のため入れていない（PR-C で決める）`,
  story,
});
// 兵士防御（仕様：防御値案 3/5/8/13/22。レア以上は棘の反撃（反撃量は未決定））。shieldSoldier をそのまま使う
const ARMOR = [3, 5, 8, 13, 22];
const plantArmor = (name, i, story) => (i < 2 ? {
  name,
  def: { kind: 'defense', effect: 'shieldSoldier', amount: ARMOR[i] },
  multiAttribute: true,
  implemented: true,
  reason: `既存の shieldSoldier（兵士の盾。先にダメージを受ける）として実際に効く。盾の値 ${ARMOR[i]} は仕様書の案。コモン・アンコモンは「棘の反撃」を持たない`,
  note: '台帳の属性は「土・植物」',
  story,
} : {
  name,
  def: { kind: 'defense' },
  multiAttribute: true,
  implemented: false,
  reason: '仕様の「近接防御成功時の棘の反撃」を起こすしくみがまだない（反撃量も未決定）。盾だけで出すと棘のないただの盾（代用）になるため false。PR-C で作る',
  effectPlan: `兵士に防御値 ${ARMOR[i]}（仮）を付け、近接攻撃を防いだときに攻撃した兵士へ棘の反撃（反撃量は未決定）`,
  note: '台帳の属性は「土・植物」',
  description: `【準備中】兵士に防御値${ARMOR[i]}を付ける。防いだときの棘の反撃はまだ使えない`,
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

  // ================= 森の同盟：残り（B2。50新規＋既存13の確認） =================
  // 兵士（15）
  beast('森の獣兵', 'common', 4, 5, 3, '森で生まれ育った獣人の若い戦士。牙と爪だけを頼りに、仲間の先頭を駆ける。'),
  beast('ウルフファイター', 'uncommon', 4, 6, 3, '狼の群れとともに戦う獣人。吠え声ひとつで、群れが敵の足もとを囲む。'),
  beast('ビーストウォリアー', 'rare', 8, 7, 3, '傷だらけの体で、いつも一番前に立つ獣人の戦士。退くことだけを知らない。'),
  beast('フェンリルナイト', 'epic', 9, 10, 3, '巨狼フェンリルにまたがる、森の騎士。霧のように現れ、風のように城壁へ迫る。'),
  beast('フェンリルロード', 'legendary', 12, 12, 3, '狼たちの王フェンリルそのもの。その遠吠えを聞いた城では、兵士の手が止まるという。'),
  elf('エルフの斥候', 3, 3, '木の上から戦場を見渡すエルフの若者。最初の矢は、いつも敵が気づく前に放たれる。'),
  elf('エルフの射手', 4, 5, '森の弓術を受け継ぐエルフ。枝の間を縫う矢は、ねらった者の肩だけを正確に射抜く。'),
  elf('エルフの狙撃手', 5, 7, '三日三晩ひとつの枝に潜み、ただ一射のために息を整える狙撃手。'),
  elf('ハイエルフ', 6, 9, '長い年月を生きる高貴なエルフ。弓を引く姿は、歌うように静かだ。'),
  elf('森の守護者', 8, 12, '森そのものが選んだ守護者。矢を放つと、木々がざわめいて道をあける。'),
  druid('ドルイド見習い', 4, 2, '森の長老に弟子入りしたばかりの見習い。四つの精霊の名前をやっと覚えたところ。'),
  druid('ドルイド', 4, 4, '火・水・風・土の精霊と言葉を交わせるようになった魔法使い。杖の先が季節ごとに色を変える。'),
  druid('エレメンタリスト', 5, 5, '精霊の力を組み合わせて使う術師。火と水がまじると霧が立ち、風と土がまじると砂が舞う。'),
  druid('アークドルイド', 7, 7, '森の長老たちをまとめる大ドルイド。四つの精霊が、そろって彼の呼びかけに応える。'),
  druid('世界樹の賢者', 9, 9, '世界樹の根もとで千年、精霊の声を聞き続けた賢者。彼が杖を立てるだけで、森が目を覚ます。'),
  // 攻撃魔法（20）
  forestSpell('フレイム', 'fire', 0, '森の焚き火から借りた、小さな炎の魔法。まず火の精霊に挨拶するときに使う。'),
  forestSpell('ブレイズ', 'fire', 1, '枯れ葉を一瞬で燃え上がらせる炎の魔法。風が吹くほど、炎は勢いを増す。'),
  forestSpell('フレアバースト', 'fire', 2, '炎の玉をはじけさせる魔法。破片の一つひとつが、小さな太陽のように熱い。'),
  forestSpell('ヘルフレイム', 'fire', 3, '地の底の炎を呼びだす魔法。森の木々は避けるが、敵の兵士だけは逃げ場を失う。'),
  forestSpell('プロミネンス', 'fire', 4, '太陽の縁から立ちのぼる炎を、戦場へ降ろす大魔法。空が一瞬、赤く染まる。'),
  forestSpell('アクア', 'water', 0, '朝露を集めて、ひとしずくの弾にする魔法。冷たさに驚いた敵は、一歩さがる。'),
  forestSpell('スプラッシュ', 'water', 1, '水面をたたいたように、水しぶきを広げる魔法。濡れた兵士は、炎や雷に弱くなる。'),
  forestSpell('タイダルウェーブ', 'water', 2, '満ち潮のような大波を、道いっぱいに走らせる魔法。引いたあとには、何も残らない。'),
  forestSpell('メイルストローム', 'water', 3, '渦巻く水が、戦場のすべてを呑みこむ魔法。渦の中心では、音さえ消える。'),
  forestSpell('アビサルタイド', 'water', 4, '深海の底の潮を呼ぶ、水の最高位の魔法。月が満ちるたびに、その力は増していく。'),
  forestSpell('エアカッター', 'wind', 0, '空気の刃を飛ばす、風の最初の魔法。見えないのに、葉っぱが真っ二つになる。'),
  forestSpell('ウィンドエッジ', 'wind', 1, '風を束ねて刃にする魔法。ひと振りで、数体の兵士をかすめていく。'),
  forestSpell('サイクロン', 'wind', 2, '小さな竜巻を呼ぶ魔法。巻き込まれた兵士は、どこへ飛ばされたか分からない。'),
  forestSpell('テンペスト', 'wind', 3, '嵐を丸ごと呼び寄せる魔法。雲がうなり、森じゅうの枝が同じ方向になびく。'),
  forestSpell('エターナルストーム', 'wind', 4, '止まることのない永遠の嵐。一度吹きはじめたら、戦いが終わるまで風は鳴りやまない。'),
  forestSpell('ロックブラスト', 'earth', 0, '足もとの石を弾丸にして飛ばす、土の最初の魔法。拾った石ころで十分に戦える。'),
  forestSpell('ストーンスパイク', 'earth', 1, '地面から石の杭を突き出す魔法。踏み込んだ敵は、足もとからすくわれる。'),
  forestSpell('アースクエイク', 'earth', 2, '大地を揺らして、道ぜんたいをひび割れさせる魔法。立っていられる者はいない。'),
  forestSpell('テラブレイク', 'earth', 3, '大地そのものを砕く魔法。砕けた岩は、空へ舞いあがってから敵に降りそそぐ。'),
  forestSpell('ガイアインパクト', 'earth', 4, '大地の母ガイアの拳を、戦場に振りおろす魔法。山が一つ、一瞬で平らになる。'),
  // 精霊召喚12・自然補助魔法1（既存。ID・効果・名前・合成先は今のまま。台帳との一致はテストで確かめる）
  ex('火の精霊', 'fireSpirit'), ex('火の大精霊', 'greatFireSpirit'), ex('火の精霊王', 'fireKing'),
  ex('水の精霊', 'waterSpirit'), ex('水の大精霊', 'greatWaterSpirit'), ex('水の精霊王', 'waterKing'),
  ex('風の精霊', 'windSpirit'), ex('風の大精霊', 'greatWindSpirit'), ex('風の精霊王', 'windKing'),
  ex('土の精霊', 'earthSpirit'), ex('土の大精霊', 'greatEarthSpirit'), ex('土の精霊王', 'earthKing'),
  ex('ゲイルフォース', 'galeForce'),
  // 回復魔法（5）
  forestHeal('若葉の癒やし', 0, '芽吹いたばかりの若葉をひとひら当てると、小さな傷がふさがっていく。'),
  forestHeal('生命の雫', 1, '朝露に命の力をとかした雫。城の石壁にも、傷ついた兵士にも、同じようにしみわたる。'),
  forestHeal('癒やしの泉', 2, '森の奥で湧きつづける癒やしの泉。その水を一口飲めば、疲れも傷も、すっと軽くなる。'),
  forestHeal('大樹の祝福', 3, '千年の大樹が枝をのばして、城と兵士を包みこむ。深い緑の影が、すべての痛みを吸いとる。'),
  forestHeal('世界樹の息吹', 4, '世界樹がひとつ息をつくと、戦場じゅうの傷が閉じていく。森の王だけが呼べる、最高の癒やし。'),
  // 城防御（5）
  plantWall('蔦の防壁', 0, '城壁にからみつく蔦。ひとつひとつは細いが、からみ合うと驚くほど強い。'),
  plantWall('根の城柵', 1, '地中から根が伸びて、城の前に柵をつくる。切っても切っても、すぐに生えてくる。'),
  plantWall('森の結界', 2, '木々が輪になって立ち、城を取り囲む結界。迷いこんだ敵は、同じ道をぐるぐる歩く。'),
  plantWall('古樹の守護壁', 3, '何百年も生きた古樹が、城の盾になる。幹には、これまでの戦いの傷が刻まれている。'),
  plantWall('世界樹の庇護', 4, '世界樹の枝が、城ぜんたいを覆う。葉のすき間からこぼれる光だけが、中へ届く。'),
  // 兵士防御（5）
  plantArmor('葉の衣', 0, '木の葉を重ねて編んだ、軽い衣。風にまぎれて、矢の軌道をわずかにそらす。'),
  plantArmor('樹皮の鎧', 1, '古い木の皮を貼りあわせた鎧。見た目より硬く、剣を受けても鈍い音がするだけ。'),
  plantArmor('棘の鎧', 2, '全身にトゲをそなえた緑の鎧。不用意に近づいた者は、まず手を引っこめることになる。'),
  plantArmor('古樹の鎧', 3, '古樹の幹をそのまま削り出した鎧。重たいが、着た者は森と一体になれる。'),
  plantArmor('森神の守護', 4, '森の神が自ら編んだ守りの衣。着た兵士のまわりでは、木々がそっと枝を差しのべる。'),
];
