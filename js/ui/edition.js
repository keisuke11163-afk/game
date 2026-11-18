// 版（西洋・日本）。タイトルで切り替え、この端末に覚える（localStorage）。切り替えたらページを読み直す。
// 日本バージョンは data/japan/ のカード・妖怪・城・デッキを使い、画面の言葉（魔法→妖術など）と絵を和風にする。
// URL の ?edition=japan でも選べる（テスト・確認用）。

export const EDITIONS = {
  western: { id: 'western', name: '西洋', note: '騎士と魔法の王国' },
  japan: { id: 'japan', name: '日本', note: '侍と忍者と妖術の国' },
};
const KEY = 'cf-edition';
const DATA_DIR = { japan: 'data/japan/' };
/** 版ごとのファイル（ないものは data/ と共有） */
const OWN_FILES = { japan: ['cards.json', 'monsters.json', 'castles.json', 'decks.json'] };

function readEdition() {
  try {
    const fromUrl = new URLSearchParams(location.search).get('edition');
    if (fromUrl && EDITIONS[fromUrl]) return fromUrl;
  } catch { /* URL が読めない環境 */ }
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && EDITIONS[saved]) return saved;
  } catch { /* ストレージが使えない */ }
  return 'western';
}

/** このページの版（読み直すまで変わらない） */
export const EDITION = readEdition();
export const isJapan = EDITION === 'japan';

/** 版を変えて覚える（反映はページを読み直してから） */
export function saveEdition(id) {
  if (!EDITIONS[id]) return false;
  try { localStorage.setItem(KEY, id); return true; } catch { return false; }
}

/** data/ のファイルの場所（日本バージョンでは、あれば data/japan/ のもの） */
export function dataPath(name) {
  return OWN_FILES[EDITION]?.includes(name) ? `${DATA_DIR[EDITION]}${name}` : `data/${name}`;
}

// ---------- 和風の言葉 ----------
// 画面の文は西洋版の言葉で書いてある。日本バージョンでは、表示するときに言いかえる（長い言葉から先に）
const JAPAN_WORDS = [
  ['魔法使い', '呪術師'], ['魔法', '妖術'], ['魔物', '妖怪'],
  ['大精霊', '大式神'], ['精霊王', '四神'], ['精霊', '式神'], ['騎兵', '騎馬'], ['弓兵', '弓足軽'], ['歩兵', '足軽'], ['ドラゴン', '大蛇'],
];
export function wa(text) {
  if (!isJapan || typeof text !== 'string') return text;
  let out = text;
  for (const [from, to] of JAPAN_WORDS) out = out.split(from).join(to);
  return out;
}

/** 人が入れた文字（名前・チャット）は言いかえない。入力欄の中身は文字の節ではないので、もともと変わらない（見本の文字 placeholder だけ変わる） */
const KEEP = '.chat-panel, .chat-bubble, .chat-line, [data-no-wa]';

/** 画面の文字を、出たそばから和風の言葉に言いかえる（日本バージョンのときだけ） */
export function startWordSkin(root = document.body) {
  if (!isJapan || !root || typeof MutationObserver === 'undefined') return;
  const fixText = (node) => {
    if (node.parentElement?.closest(KEEP)) return;
    const next = wa(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
  };
  const fixAttrs = (el) => {
    if (el.closest?.(KEEP)) return;
    for (const name of ['aria-label', 'title', 'placeholder', 'aria-description']) {
      const v = el.getAttribute?.(name);
      if (v) { const next = wa(v); if (next !== v) el.setAttribute(name, next); }
    }
  };
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return fixText(node);
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    fixAttrs(node);
    const it = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = it.nextNode(); n; n = it.nextNode()) n.nodeType === Node.TEXT_NODE ? fixText(n) : fixAttrs(n);
  };
  walk(root);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') fixText(r.target);
      else if (r.type === 'attributes') fixAttrs(r.target);
      else for (const n of r.addedNodes) walk(n);
    }
  }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'title', 'placeholder', 'aria-description'] });
}

// ---------- 絵（仮）：日本のカード・妖怪は、専用の絵ができるまで、同じ役割の西洋の絵を使う ----------
export const JAPAN_ART_ALIAS = {
  ashigaru: 'infantry', yariAshigaru: 'spearman', samurai: 'heavy', samuraiTaisho: 'giant', shogun: 'hero',
  hayauma: 'scout', kibaMusha: 'cavalry', akazonae: 'knight', musoKisho: 'paladin', ryujinKiba: 'dragonKnight',
  yumiAshigaru: 'apprenticeArcher', yumitori: 'archer', teppoAshigaru: 'longbowman', teppotai: 'sniper', ogiNoIte: 'skyArcher',
  minaraiJujutsushi: 'apprenticeMage', jujutsushi: 'mage', onmyoji: 'sorcerer', daiOnmyoji: 'archmage', tenmonHakase: 'sage',
  kitsunebi: 'fireball', onibi: 'inferno', kasha: 'meteor', shonetsu: 'starfall', yamataNoHomura: 'apocalypse',
  raimei: 'bolt', rakurai: 'thunder', raiju: 'bigThunder', raijinDaiko: 'raijin', tenpen: 'judgment',
  yakuso: 'minorHeal', ofudaInori: 'heal', yashiroKago: 'greatHeal', kagura: 'holyLight', amaterasu: 'goddess',
  dokugiri: 'poisonMist', jadoku: 'venom', shoki: 'toxicRain', juso: 'deathMist', tatari: 'plague',
  yukiOnnaIki: 'frostBreath', fubuki: 'deepFreeze', tsurara: 'glacier', nadare: 'absoluteZero', eikyuToudo: 'frozenWorld',
  homuraTachi: 'flameSword', mizuYari: 'waterSpear', kazeYumi: 'windBow', kanabo: 'earthHammer',
  uchigatana: 'ironSword', yoto: 'magicSword', meito: 'holySword', kusanagi: 'godSword',
  takeTaba: 'shield', okiTate: 'bigShield', tetsuYoroi: 'steelShield', omamori: 'holyShield', yataKagami: 'godShield',
  dorui: 'sandbag', umaBosaku: 'wall', ishigaki: 'stoneWall', otemon: 'gate', kekkai: 'barrier',
  ganKake: 'prayer', omikuji: 'blessing', nezumiKozo: 'thief', kawarimi: 'decoy', kagamiGaeshi: 'reflect',
  hiShikigami: 'fireSpirit', hiDaiShikigami: 'greatFireSpirit', suzaku: 'fireKing',
  mizuShikigami: 'waterSpirit', mizuDaiShikigami: 'greatWaterSpirit', genbu: 'waterKing',
  kazeShikigami: 'windSpirit', kazeDaiShikigami: 'greatWindSpirit', seiryu: 'windKing',
  tsuchiShikigami: 'earthSpirit', tsuchiDaiShikigami: 'greatEarthSpirit', byakko: 'earthKing',
  zeniBukuro: 'coinPouch', koban: 'goldCoin', senryobako: 'treasure', kinzan: 'goldVein', tenkaNoOgon: 'kingTreasure',
  reiKakera: 'manaShard', reiShizuku: 'manaDrop', reiseki: 'manaCrystal', reisen: 'manaSpring', goshinboku: 'worldTreeDew',
  hengeNoHa: 'adapt', dokukeshi: 'antidote', amagoi: 'weatherCall',
};
export const YOKAI_ART_ALIAS = {
  ittanmomen: 'bat', kappa: 'slime', tengu: 'goblin', gashadokuro: 'skeleton', nurikabe: 'golem', oni: 'demon',
  chochinObake: 'ghost', kodama: 'treant', bakeTsuzura: 'mimic', nureOnna: 'vampire', orochi: 'dragon', shutenDoji: 'demonKing',
};
/** 忍者のカード（専用の仮の絵を描く） */
export const NINJA_TYPES = new Set(['shinobiMinarai', 'genin', 'chunin', 'jonin', 'toryo']);
