// 起動と、Game と画面のつなぎ役。
// - data/ の JSON を読む（monsters.json・upgrades.json は、なければ省略：魔物が出ず、強化も買えない）
// - 同じ端末：new Game(...) を作り、LocalSession で包む。オンライン：OnlineClient（サーバーの Game を操作する）
// - Game のイベントをキューにため、届いた順に Animations で演出する
// - 演出中は操作を受け付けない（画面タップで演出を飛ばせる）
// UI はゲームの状態を直接書き換えない。セッション（js/ui/Session.js）のメソッドだけを使う。

import { setupMaterialSkin } from './ui/MaterialSkin.js';
import { BattleLayout } from './ui/BattleLayout.js';
import { renderHelp } from './ui/HelpView.js';
import { setupAccessibility } from './ui/Accessibility.js';
import { MatchStats } from './ui/MatchStats.js';
import { LocalSetup } from './ui/LocalSetup.js';
import { Settings } from './ui/Settings.js';
import { Tutorial } from './ui/Tutorial.js';
import { RoomView } from './ui/RoomView.js';
import { CardGuide } from './ui/CardGuide.js';
import { ProgressPanel } from './ui/ProgressPanel.js';
import { Game, EVENT_TYPES } from './game/Game.js';
import { Renderer } from './ui/Renderer.js';
import { HandView } from './ui/HandView.js';
import { Animations } from './ui/Animations.js';
import { DebugPanel } from './ui/DebugPanel.js';
import { UpgradePanel } from './ui/UpgradePanel.js';
import { Targeting } from './ui/Targeting.js';
import { LocalSession } from './ui/Session.js';
import { OnlineClient } from './ui/OnlineClient.js';
import { ChatView } from './ui/ChatView.js';
import { DeckEditor } from './ui/DeckEditor.js';
import { deckChoice, deckSlot, loadDecks, loadMyDeck } from './ui/DeckStore.js';
import { renderDeckPreview } from './ui/DeckPreview.js';
import { initHolograms } from './ui/Hologram.js';
import { initCardZoom } from './ui/CardZoom.js';
import { checkCostDeck } from './game/Setup.js';
import { STRATEGIES } from './game/strategies.js';
import { checkSync } from './ui/syncCheck.js';
import { UI_CONFIG } from './ui/config.js';
import { EDITION, EDITIONS, isJapan, dataPath, saveEdition, startWordSkin } from './ui/edition.js';
import { sound } from './ui/Sound.js';
import { castleArt, unitArt, imageArt, icon, colorOf, preloadAssets, isAssetReady } from './ui/art.js';
import { playerName, setPlayerNames, reasonText, soldierInfo, monsterInfo, GAME_OVER_TEXT, GAME_OVER_TEXT_LOST } from './ui/text.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const URL_SEED = params.has('seed') ? Number(params.get('seed')) >>> 0 : null;

const $ = (id) => document.getElementById(id);
const el = {
  app: $('app'),
  message: $('message'),
  controls: $('controls'),
  handToggle: $('hand-toggle'),
  endTurn: $('end-turn'),
  toast: $('toast'),
  netStatus: $('net-status'),
  handover: $('handover'),
  handoverTurn: document.querySelector('#handover .handover-turn'),
  handoverTitle: document.querySelector('#handover .handover-title'),
  handoverPic: document.querySelector('#handover .handover-pic'),
  result: $('result'),
  resultTitle: document.querySelector('#result .result-title'),
  resultSub: document.querySelector('#result .result-sub'),
  resultPic: document.querySelector('#result .result-pic'),
  confetti: document.querySelector('#result .confetti'),
  rematch: $('rematch'),
  resultTitleBtn: $('result-title-btn'),
  error: $('error'),
  upgradeOpen: $('upgrade-open'),
  menu: $('menu'),
  menuOpen: $('menu-open'),
  menuSound: $('menu-sound'),
  help: $('help'),
  title: $('title'),
  titleMain: $('title-main'),
  titleForm: $('title-form'),
  titleName: $('title-name'),
  titlePass: $('title-pass'),
  titleStatus: $('title-status'),
  titleJoin: $('title-join'),
  titleLevels: $('title-levels'),
  menuSurrender: $('menu-surrender'),
  netText: document.querySelector('#net-status .net-text'),
  netLeave: $('net-leave'),
};

const battleLayout = new BattleLayout();
setupMaterialSkin();
const matchStats = new MatchStats();
const tutorial = new Tutorial();
let replayTutorial = false;
let titleArrivalPlayed = false;
let settings;
let localSetup;
let lastLocalOptions = null;
let battleAssetsPromise = null;
let startRequest = 0;
let castles = null;
let decks = null;
let rarities = null;
let stamps = null;   // data/stamps.json（読めなければ null：チャットなし）
let deckEditor = null; // デッキ編成の画面（コスト制の見本のデッキがあるときだけ）
let chat = null;     // チャットとスタンプ（ChatView）
let weather = null;  // data/weather.json（読めなければ null：天候なし）
let progressPanel;
let cardGuide;
let cards;
let rules;
let monsters = null;  // data/monsters.json（読めなければ null：魔物は出ない）
let upgrades = null;  // data/upgrades.json（読めなければ null：強化は買えない）
let renderer;
let handView;
let anim;
let upgradePanel = null;
let targeting = null;      // 対象を選ぶ（js/ui/Targeting.js）

let game = null;           // 同じ端末のときの Game（オンラインでは null）
let session = null;        // ゲームを操作する窓口（LocalSession か OnlineClient）
let seed = 0;
let viewerId = null;       // 画面を見ているプレイヤー（最初の目隠しを開けるまでは null）
let model = null;          // 表示用の状態（演出の進みに合わせて進む）
let queue = [];            // まだ演出していないイベント
let busy = true;           // 演出中・交代画面中は true
let sending = false;       // オンライン：操作を送って、返事を待っているあいだ true
let knownCards = new Map(); // cardId → { cardId, type }（viewer の手札の中身）
let lastCastleHit = null;  // 最後に城を削ったもの（"monster" なら魔物の攻撃）。決着の文に使う
let upgradeCounts = {};    // playerId → { upgradeId: 買った回数 }（getState にないので、イベントから数える）
const listeners = [];

// ひとりで遊ぶ（CPU と対戦）
// 2026-11-16再測定（各200試合、seed 1、先攻でrandomと対戦）：defensive 23% < rush 50% < smart 97%。
// 元の割り当ては修正済みだったため順序は維持し、UI_CONFIGに集約。
const CPU_LEVELS = UI_CONFIG.cpuLevels;
const CHAT_MAX_LENGTH = 40; // サーバー（server/rooms.js の CHAT_MAX_LENGTH）と同じ
let cpu = null;            // { id, level, strategy, rng }（ひとりで遊ぶときだけ）

// オンライン
const SESSION_KEY = 'cf-online'; // つなぎ直し用に、部屋の鍵をこのタブに覚えておく（sessionStorage）
let roomView;
let roomPassphrase = '';
let room = null;           // サーバーから届いた部屋の状態
let batches = [];          // 届いた「イベントの列 + 状態」。順番に見せる
let pumping = false;
let rematchSent = false;
let connected = true;
let gen = 0;                // 試合の通し番号。前の試合の演出が、新しい試合のイベントを食べないようにする
let cancelHandover = null;  // 交代の画面を出しているあいだ、その待ちをやめる関数

/** 交代の画面を出すか（同じ端末で2人のときだけ。ひとり・オンラインは、画面を見る人がいつも同じ） */
function usesHandover() {
  return Boolean(session) && !session.online && !cpu;
}

// ---------- 起動 ----------

async function loadJson(path) {
  // JSON を直してリロードするだけで反映されるよう、キャッシュを使わない
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} を読み込めませんでした（${res.status}）`);
  return res.json();
}

/** なくてもよい JSON。ファイルがない（404）ときだけ null。壊れているときは cards.json と同じく止める */
async function loadOptionalJson(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (res.status === 404) {
    console.warn(`${path} がないので、なしで始めます`);
    return null;
  }
  if (!res.ok) throw new Error(`${path} を読み込めませんでした（${res.status}）`);
  try {
    return await res.json();
  } catch (err) {
    throw new Error(`${path} の書き方がまちがっています（${err.message}）`);
  }
}

function uiContext() { return { session, viewerId, busy, sending, luckFrom: upgrades?.luck?.fromRarity, permLuckFrom: upgrades?.permLuck?.fromRarity }; }

// 読み込み中の画面：進み具合を出して、起動が終わったら消す
function setLoading(ratio, text) {
  const fill = document.getElementById('loading-fill');
  if (fill) fill.style.width = `${Math.max(4, Math.round(ratio * 100))}%`;
  const t = document.getElementById('loading-text');
  if (t && text) t.textContent = text;
}
function hideLoading() {
  const box = document.getElementById('loading');
  if (!box) return;
  box.classList.add('done');
  setTimeout(() => box.remove(), 300);
}

async function boot() {
  document.documentElement.dataset.edition = EDITION;
  startWordSkin(document.body);
  try {
    [cards, rules, monsters, upgrades, rarities, castles, decks, weather, stamps] = await Promise.all([
      // 日本バージョンは、カード・妖怪・城・デッキを data/japan/ から読む（edition.js）
      loadJson(dataPath('cards.json')), loadJson(dataPath('rules.json')),
      loadOptionalJson(dataPath('monsters.json')), loadOptionalJson(dataPath('upgrades.json')), loadOptionalJson(dataPath('rarities.json')), loadOptionalJson(dataPath('castles.json')), loadOptionalJson(dataPath('decks.json')), loadOptionalJson(dataPath('weather.json')), loadOptionalJson(dataPath('stamps.json')),
    ]);
  } catch (err) {
    console.error(err);
    hideLoading();
    showError(`起動できませんでした：${err.message}\n` +
      'リポジトリのルートで「python3 -m http.server」（Windows は「python -m http.server」）を実行し、' +
      'http://localhost:8000 を開いてください。');
    return;
  }

  setLoading(0.05, 'データを読み込みました');
  // 画像を先に読み込む（読み込み中に代わりの絵が見えないように）。進み具合は読み込み画面に出す
  await preloadAssets(8000, (done, total) => setLoading(0.05 + 0.9 * done / total, `タイトルを準備中… ${done} / ${total}`), {phase:'title'});
  setLoading(1, 'はじめます');

  // デバッグ：URL の rules={"monsterFirstRound":1,...} で、ルールの一部だけ変えて試せる（data/ は書き換えない）
  if (DEBUG && params.has('rules')) {
    try {
      const override = JSON.parse(params.get('rules'));
      // rules.json にあるキーだけ取りこむ（__proto__ などで rules のしくみを変えないように）
      for (const k of Object.keys(override ?? {})) {
        if (Object.hasOwn(rules, k)) rules[k] = override[k];
        else console.warn(`URL の rules：rules.json にないキー "${k}" は使いません`);
      }
    } catch (err) {
      console.error('URL の rules を読めませんでした', err);
    }
  }

  renderer = new Renderer({
    cards, rules, monsters, castles,
    showCoins: Boolean(monsters || upgrades), // コインは魔物か強化があるときだけ出す（自分も相手も同じ）
    onCastleTap: (p) => toast(`${playerName(p.playerId)} · ${castles?.[p.castleType]?.name ?? '城'} · HP ${p.castleHp}/${p.castleMaxHp}`, 'info'),
    onSoldierTap: (s) => toast(soldierInfo(s, { cards, rules, viewerId }), 'info'),
    onMonsterTap: (m) => toast(monsterInfo(m, { monsters }), 'info'),
    onTargetTap: (target) => { if (!busy) targeting.tap(target); },
  });
  const previewDeck = (root, deck) => renderDeckPreview(root, deck, cards, rarities);
  const savedDecks = () => loadDecks().slots.map((deck, slot) => deck && ({
    ...deck, slot, valid: checkCostDeck(deck.list, cards, rarities, rules).ok,
  }));
  const presetDeck = id => decks?.[id] ? { name: decks[id].name, list: decks[id].cards } : null;
  const openDeckEditor = slot => deckEditor?.open(slot);
  roomView = new RoomView({
    onAction: (method, args) => session.act(method, args), onLeave: () => showTitle(),
    onEditDeck: openDeckEditor, savedDecks, presetDeck, previewDeck,
  });
  initHolograms(el.app);
  initCardZoom({ root: el.app, cards, rarities, rules });
  $('back-to-room').addEventListener('click', async () => {
    const res = await session?.act('backToRoom');
    if (!res?.ok) toast(res?.reason ?? '部屋に戻れませんでした');
  });
  handView = new HandView({
    cards, rules, rarities, getContext: uiContext, textOpts: { monsters: Boolean(monsters), debug: DEBUG },
    onPlay: playCard, onDiscard: discard, onNotice: toast,
  });
  anim = new Animations({ renderer, handView, cards, rules, monsters, upgrades, rarities });
  if (stamps?.length) chat = new ChatView({ stamps, button: $('chat-open'), root: el.app, maxLength: CHAT_MAX_LENGTH });
  targeting = new Targeting({ renderer, handView, onChoose: (cardId, target) => doPlay(cardId, target) });
  if (upgrades && Object.keys(upgrades).length) {
    upgradePanel = new UpgradePanel({ upgrades, rarities, onBuy: buyUpgrade, onOpen: refreshUpgrades, onDenied: (r) => toast(r, 'info') });
  } else {
    // 強化のデータがないときも、コインのボタンを押したら理由を出す
    el.upgradeOpen.addEventListener('click', (e) => {
      e.stopPropagation();
      toast('強化のデータ（data/upgrades.json）がないので、強化は買えません', 'info');
    });
  }
  $('help-monster').hidden = !monsters;

  el.endTurn.addEventListener('click', endTurn);
  el.rematch.addEventListener('click', stopCelebration);
  el.rematch.addEventListener('click', (e) => { e.stopPropagation(); rematch(); });
  el.result.addEventListener('click', stopCelebration);
  el.resultTitleBtn.addEventListener('click', (e) => { e.stopPropagation(); showTitle(); });
  // 最初のタップで音を出せるようにする。演出中に画面をタップしたら飛ばす（重ねて出す画面の上は除く）
  el.app.addEventListener('keydown', e => { if(['Enter',' '].includes(e.key)) sound.unlock(); });
  el.app.addEventListener('pointerdown', (e) => {
    sound.unlock();
    if (busy && !e.target.closest('.screen, #debug-panel, #debug-toggle, #menu-open')) anim.skip();
  }, true);

  if (rarities && Object.values(decks ?? {}).some((d) => d.costDeck)) {
    const preview = document.createElement('div');
    preview.id = 'title-deck-preview';
    $('title-help').after(preview);
    const refresh = (saved) => {
      const active = savedDecks()[loadDecks().active];
      previewDeck(preview, active ?? presetDeck(rules.defaultCostDeck));
      localSetup?.refreshDecks();
      if (saved) roomView.refreshDecks(saved);
    };
    deckEditor = new DeckEditor({
      cards, rarities, rules, decks,
      animate: (element, frames, options) => anim.animate(element, frames, options),
      onChange: refresh,
    });
    $('title-deck').addEventListener('click', () => { sound.play('tap'); openDeckEditor(); });
    refresh();
  } else {
    $('title-deck').hidden = true;
  }
  cardGuide = new CardGuide({ cards, rarities, rules, monsters, getContext: uiContext, debug: DEBUG });
  progressPanel = new ProgressPanel({ cards, rarities, rules, monsters,
    getContext: uiContext, onRates: () => cardGuide.open('rates'),
    onFuse: async (a, b) => {
      const check = session.canFuse?.(a, b);
      if (check && !check.ok) { toast(reasonText(check.reason)); return; }
      const res = await act(() => session.fuse(a, b));
      if (res && !res.ok) toast(reasonText(res.reason));
    },
  });
  settings = new Settings((value) => { el.titleName.value = value.name; anim.applyCssTiming(); handView.updateDetail(); });
  setupMenu();
  setupTitle({ savedDecks, presetDeck, previewDeck, openDeckEditor });
  renderHelp({cards,rules,monsters,rarities});
  setupAccessibility();

  if (DEBUG) {
    new DebugPanel({
      cards,
      getPlaceholders: () => ({
        missing: Object.keys(cards).map(type => `cards/card-${type.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}.png`).filter(path => !isAssetReady(path)),
        standIns: [],
      }),
      getGame: () => game,
      getSeed: () => seed,
      getViewerId: () => viewerId,
      onRestart: (s) => startLocal(s),
      onChanged: () => {
        cancelTargeting();
        if (!busy) settleSafely();
      },
      onConfigChanged: () => { anim.applyCssTiming(); handView.updateDetail(); },
      notify: toast,
    });
    // コンソールから Game を触れるようにする（デバッグのときだけ）
    // refresh()：コンソールから debugSet… を直接呼んだあと、画面を合わせ直す
    window.castlefield = { game: () => game, seed: () => seed, renderer: () => renderer, anim: () => anim, refresh: () => settleSafely() };
  }

  // デバッグ・シード指定のときは、同じ端末ですぐ始める。そうでなければタイトルを出す
  if (DEBUG || URL_SEED !== null || params.get('local') === '1') {
    const level = params.get('cpu');
    startLocal(undefined, CPU_LEVELS[level] ? level : null); // ?cpu=hard で、CPU と対戦
  } else {
    showTitle();
    resumeOnline(); // ページを読み直したとき：前の部屋が残っていれば、つなぎ直す
  }
  hideLoading();
  setTimeout(() => { prepareBattleAssets(); setupOffline(); }, 1000);
}

function prepareBattleAssets() {
  return battleAssetsPromise ??= preloadAssets(8000, (done,total) => { $('asset-loading-text').textContent=`対戦の絵を準備中… ${done} / ${total}`; });
}
// オフライン（PWA）の準備は裏で静かに行う。ゲーム内に PWA の説明は出さない（人間の指示）
async function setupOffline() {
  if (!('serviceWorker' in navigator) || !['http:','https:'].includes(location.protocol)) return;
  try { await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}); } catch { /* 使えない端末では、オンラインのまま遊ぶ */ }
}

// ---------- タイトル・メニュー ----------

/** タイトルの「西洋／日本」の切り替え。選んだ版を覚えて、ページを読み直す（カード・絵・言葉がまるごと変わるため） */
function setupEditionSwitch() {
  const box = document.createElement('div');
  box.id = 'edition-switch';
  box.className = 'edition-switch';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', '遊ぶ国（版）');
  box.dataset.noWa = '';
  for (const ed of Object.values(EDITIONS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'edition-option';
    b.dataset.edition = ed.id;
    b.setAttribute('aria-pressed', String(ed.id === EDITION));
    b.innerHTML = `<strong></strong><small></small>`;
    b.querySelector('strong').textContent = ed.id === 'japan' ? '日本' : '西洋';
    b.querySelector('small').textContent = ed.note;
    b.addEventListener('click', () => {
      if (ed.id === EDITION) return;
      sound.play('tap');
      saveEdition(ed.id);
      // URL の ?edition= を外して読み直す（覚えた版で始まる）
      const url = new URL(location.href);
      url.searchParams.delete('edition');
      location.replace(url.href);
    });
    box.append(b);
  }
  $('title-main').prepend(box);
}

function setupTitle(deckOptions) {
  document.querySelector('#title .title-pic').innerHTML = isJapan
    // 日本バージョン：日本の城と、忍者・足軽（仮の絵）
    ? `<div class="title-castle left">${castleArt('blue')}</div><div class="title-unit left">${unitArt('shinobiMinarai', 'blue')}</div>` +
      `<div class="title-unit right">${unitArt('ashigaru', 'orange')}</div><div class="title-castle right">${castleArt('orange')}</div>`
    : `<div class="title-castle left">${imageArt('ui/title-castle-blue.png', '', 'art castle-art')}</div><div class="title-unit left">${imageArt('ui/title-knight-blue.png', '', 'art unit-art')}</div>` +
      `<div class="title-unit right">${imageArt('ui/title-infantry-orange.png', '', 'art unit-art')}</div><div class="title-castle right">${imageArt('ui/title-castle-orange.png', '', 'art castle-art')}</div>`;
  setupEditionSwitch();
  localSetup = new LocalSetup({castles,decks,rules,...deckOptions,onStart:(level,options)=>startLocal(undefined,level,options)});
  let modeOpener;
  const openLocalOptions = (mode, opener) => {
    sound.play('tap');
    modeOpener = opener;
    localSetup.open(mode);
    el.titleMain.hidden = true;
    el.titleLevels.hidden = false;
    const first = mode === 'local' ? $('local-start') : el.titleLevels.querySelector('.level');
    first.focus({ preventScroll: true });
  };
  $('title-local').addEventListener('click', event => openLocalOptions('local', event.currentTarget));
  $('title-solo').addEventListener('click', event => openLocalOptions('solo', event.currentTarget));
  $('levels-back').addEventListener('click', () => {
    el.titleLevels.hidden = true;
    el.titleMain.hidden = false;
    modeOpener?.focus({ preventScroll: true });
  });
  for (const btn of el.titleLevels.querySelectorAll('.level')) {
    btn.addEventListener('click', () => { sound.play('tap'); startLocal(undefined, btn.dataset.level, localSetup.read()); });
  }
  $('title-online').addEventListener('click', () => {
    sound.play('tap');
    el.titleMain.hidden = true;
    el.titleForm.hidden = false;
    setTitleWaiting(false);
    el.titleStatus.textContent = '同じ合言葉を入れた人と対戦します';
    (el.titleName.value ? el.titlePass : el.titleName).focus({ preventScroll: true });
  });
  matchStats.drawRecord();
  $('record-clear').addEventListener('click', () => matchStats.clear());
  $('help-tutorial').addEventListener('click', () => { el.help.hidden = true; replayTutorial = true; startLocal(undefined, 'normal'); });
  for (const id of ['title-settings','menu-settings']) $(id).addEventListener('click', () => settings.open());
  $('title-help').addEventListener('click', () => openHelp());
  $('title-back').addEventListener('click', () => {
    leaveOnline();
    el.titleForm.hidden = true;
    el.titleMain.hidden = false;
    $('title-online').focus({ preventScroll: true });
  });
  const endArrival = () => el.title.classList.remove('title-arrival');
  el.title.addEventListener('pointerdown', endArrival);
  el.title.addEventListener('keydown', endArrival);
  el.title.addEventListener('animationend', event => {
    if (event.animationName === 'title-arrival-light') endArrival();
  });
  el.titleForm.addEventListener('submit', (e) => { e.preventDefault(); joinOnline(); });
  try {
    el.titleName.value = localStorage.getItem('cf-name') ?? '';
    el.titlePass.value = localStorage.getItem('cf-pass') ?? '';
  } catch { /* 覚えられなくても困らない */ }
}

/** タイトルへ戻る（遊んでいた試合はやめる） */
function showTitle() {
  startRequest++;
  renderer.setWeather(null);
  document.documentElement.classList.add('at-title');
  $('asset-loading').hidden=true;
  sound.setScene('title');
  tutorial.close();
  gen += 1;
  cancelHandover?.();
  leaveOnline();
  stopLocal();
  anim.skip();
  anim.endSkip();
  queue = [];
  cancelTargeting();
  upgradePanel?.close();
  el.result.hidden = true;
  el.handover.hidden = true;
  el.menu.hidden = true;
  el.confetti.innerHTML = '';
  setBusy(true);
  el.titleForm.hidden = true;
  el.titleLevels.hidden = true;
  el.titleMain.hidden = false;
  el.title.hidden = false;
  if (!titleArrivalPlayed && !UI_CONFIG.reducedMotion && UI_CONFIG.speed > 0) {
    el.title.classList.add('title-arrival');
  }
  titleArrivalPlayed = true;
}

function setTitleWaiting(waiting) {
  el.titleName.disabled = el.titlePass.disabled = waiting;
  el.titleJoin.hidden = waiting;
  el.titleForm.classList.toggle('waiting', waiting);
}

/** 手札の表示・非表示（盤面を広く見たいとき用） */
function setHandVisible(visible) {
  if (!visible) handView?.select(null);
  el.controls.classList.toggle('hand-hidden', !visible);
  el.handToggle.textContent = visible ? '手札を隠す' : '手札を開く';
  el.handToggle.setAttribute('aria-expanded', String(visible));
  el.handToggle.setAttribute('aria-label', visible ? '手札を隠す' : '手札を開く');
}

function setupMenu() {
  el.handToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    sound.play('tap');
    setHandVisible(el.controls.classList.contains('hand-hidden'));
  });
  const drawSound = () => {
    el.menuSound.innerHTML = `${icon(sound.muted ? 'mute' : 'sound')}<span>${sound.muted ? '音：なし' : '音：あり'}</span>`;
  };
  drawSound();
  el.menuOpen.addEventListener('click', (e) => {
    e.stopPropagation();
    // 降参は、オンラインと CPU 戦の、試合の途中だけ
    const st = session?.getState(viewerId);
    el.menuSurrender.hidden = !(st && (session.online || cpu) && st.phase !== 'gameOver' && st.phase !== 'ready' && !st.players[viewerId]?.eliminated);
    if (st) battleLayout.update(st, viewerId);
    resetSurrenderButton();
    el.menu.hidden = false;
  });
  el.menuSurrender.addEventListener('click', surrender);
  el.netLeave.addEventListener('click', () => showTitle());
  $('menu-close').addEventListener('click', () => { el.menu.hidden = true; });
  el.menu.addEventListener('click', (e) => { if (e.target === el.menu) el.menu.hidden = true; });
  el.menuSound.addEventListener('click', () => {
    sound.setMuted(!sound.muted);
    drawSound();
    sound.play('tap');
  });
  $('menu-help').addEventListener('click', () => { el.menu.hidden = true; openHelp(); });
  $('menu-title-btn').addEventListener('click', () => showTitle());
  $('help-close').addEventListener('click', () => { el.help.hidden = true; });
  el.help.addEventListener('click', (e) => { if (e.target === el.help) el.help.hidden = true; });
}

let surrenderArmed = false;
function resetSurrenderButton() {
  surrenderArmed = false;
  el.menuSurrender.textContent = '降参する';
}

/** 降参：まちがって押しても終わらないように、2回押して決める */
async function surrender() {
  if (!surrenderArmed) {
    surrenderArmed = true;
    el.menuSurrender.textContent = '本当に降参する？（もう一度押す）';
    return;
  }
  resetSurrenderButton();
  el.menu.hidden = true;
  const s = session;
  if (!s) return;
  const res = await s.surrender(viewerId);
  if (s !== session) return;
  if (!res?.ok) {
    toast(reasonText(res?.reason));
    return;
  }
  // 同じ端末（CPU 戦）は、ここで結果を見せる。オンラインは、結果のまとまりが届いたときに見せる
  if (!s.online) {
    // 演出の途中なら早送りして、動いている再生に gameOver まで進めてもらう
    if (busy) anim.skip();
    else drainAndSettle();
  }
}

function openHelp() {
  $('help-tutorial').textContent=session?'今の試合を終えて操作を練習する':'案内つきで操作を練習する';
  sound.play('tap');
  el.help.hidden = false;
}

// ---------- 同じ端末 ----------

/** 乱数（シードが同じなら同じ順番になる） */
function mulberry32(a) {
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stopLocal() {
  stopChat();
  for (const [type, h] of listeners.splice(0)) game?.off(type, h);
  game = null;
  cpu = null;
  if (session && !session.online) session = null;
}

/** 新しい試合の前に、画面の持ちものを空にする */
function resetForNewGame() {
  renderer.setWeather(null);
  matchStats.reset();
  renderer.monsterBirths.clear(); renderer.weaponStacks.clear();
  $('match-info').open = false;
  el.app.classList.remove('spectating');
  document.getElementById('spectator-strip')?.setAttribute('hidden', '');
  gen += 1;
  cancelHandover?.();
  anim.skip();
  anim.endSkip();
  queue = [];
  cancelTargeting();
  upgradePanel?.close();
  upgradeCounts = {};
  lastCastleHit = null;
  el.result.hidden = true;
  el.confetti.innerHTML = '';
  el.rematch.textContent = 'もう1回';
  el.rematch.disabled = false;
  rematchSent = false;
  knownCards = new Map();
  model = null; // 前の試合の値（捨てる枚数・決着の理由）を持ちこさない
}

/**
 * 同じ端末で始める。
 * @param {number} [seedOverride] 乱数シード
 * @param {string|null} [cpuLevel] "easy" / "normal" / "hard" なら、ひとりで遊ぶ（CPU と対戦）。省略すると2人で交代
 */
async function startLocal(seedOverride, cpuLevel = null, options = null) {
  const request=++startRequest;
  $('asset-loading').hidden=false;
  await prepareBattleAssets();
  if(request!==startRequest)return;
  $('asset-loading').hidden=true;
  document.documentElement.classList.remove('at-title');
  // 設定を選ばずに始めたときも、山札は全員共通ではなくプレイヤーごと（コスト制）にする。
  // 編成したデッキが決まりに合っていれば自分の席に使い、CPU は見本のデッキ。
  if (!options && rarities && Object.values(decks ?? {}).some((d) => d.costDeck)) {
    const active = loadDecks().active;
    const mine = loadMyDeck(active);
    const usable = mine && checkCostDeck(mine, cards, rarities, rules).ok;
    options = { playerCount: 2, winCondition: 'firstDestroy', castle: rules.defaultCastle ?? 'standard',
      deckMode: 'cost', deck: usable ? deckChoice(active) : rules.defaultCostDeck, teams: 'off' };
  }
  lastLocalOptions = options ? structuredClone(options) : null;
  leaveOnline();
  stopLocal();
  setPlayerNames({});
  resetForNewGame();
  el.title.hidden = true;
  sound.setScene('battle');

  seed = seedOverride ?? URL_SEED ?? Math.floor(Math.random() * 2 ** 32);
  try {
    const opts = { cards: structuredClone(cards), rules: structuredClone(rules), rarities: structuredClone(rarities), rng: mulberry32(seed) };
    if (options) {
      Object.assign(opts.rules,{playerCount:options.playerCount,winCondition:options.winCondition,deckMode:options.deckMode,roadLayout:'plaza'});
      opts.castles=structuredClone(castles);opts.decks=structuredClone(decks);
      opts.setup={castles:Array(options.playerCount).fill(rules.defaultCastle??'standard')};
      if(options.deckMode==='own')opts.setup.decks=Array(options.playerCount).fill(rules.defaultDeck??'balanced');
      if(options.deckMode==='cost')opts.setup.decks=Array(options.playerCount).fill(rules.defaultCostDeck);
      // 自分の席は後で決まるため、選択を割り当てる席を同じシードから求める。
      const seatRng=mulberry32(seed ^ 0x9e3779b9);
      const humanSeat=cpuLevel?Math.floor(seatRng()*options.playerCount):0;
      opts.setup.castles[humanSeat]=options.castle;
      const customSlot = options.deckMode === 'cost' ? deckSlot(options.deck) : null;
      if (opts.setup.decks && customSlot === null) opts.setup.decks[humanSeat] = options.deck;
      if (customSlot !== null) {
        // 自分で編成したデッキ（決まりに合わなければ、編成画面を開いて直してもらう）
        const mine=loadMyDeck(customSlot);
        if(!mine||!checkCostDeck(mine,cards,rarities,rules).ok){
          showTitle();toast('マイデッキがまだ決まりに合っていません。「デッキ編成」で作ってください','info');deckEditor?.open(customSlot);return;
        }
        opts.setup.deckLists=Array(options.playerCount).fill(null);opts.setup.deckLists[humanSeat]=mine;
      }
      if(options.teams==='auto'){
        const seats=Array.from({length:options.playerCount},(_,i)=>i);
        for(let i=seats.length-1;i>0;i--){const j=Math.floor(seatRng()*(i+1));[seats[i],seats[j]]=[seats[j],seats[i]];}
        opts.setup.teams=Array(options.playerCount);seats.forEach((seat,i)=>{opts.setup.teams[seat]=i<Math.floor(options.playerCount/2)?'t1':'t2';});
      }
    }
    // 2人で交代して遊ぶときは、相手に手札を見せないので、攻撃を受けたときの防御は聞かない
    if (!cpuLevel) opts.rules.defenseReaction = false;
    if (monsters) opts.monsters = structuredClone(monsters);
    if (upgrades) opts.upgrades = structuredClone(upgrades);
    if (weather) opts.weather = structuredClone(weather);
    game = new Game(opts);
  } catch (err) {
    console.error(err);
    showError(`ゲームを始められませんでした：${err.message}`);
    return;
  }
  session = new LocalSession(game);
  if (cpuLevel && CPU_LEVELS[cpuLevel]) {
    // 先攻・後攻は毎回ランダム（シードが同じなら同じ）
    const rng = mulberry32(seed ^ 0x9e3779b9);
    const order = game.getState(null).playerOrder;
    const humanId = order[Math.floor(rng() * order.length)];
    const cpuIds = order.filter((id) => id !== humanId);
    const cpuId = cpuIds[0];
    cpu = { id: cpuId, ids: cpuIds, humanId, level: cpuLevel, strategy: STRATEGIES[CPU_LEVELS[cpuLevel].strategy], rng };
    setPlayerNames({ [humanId]: settings.value.name || 'あなた', ...Object.fromEntries(cpuIds.map((id,i)=>[id,`CPU${cpuIds.length>1?i+1:''}（${CPU_LEVELS[cpuLevel].name}）`])) });
  }
  tutorial.close();
  if (cpu && (replayTutorial || tutorial.pending())) {
    const hand = game.getState(cpu.humanId).players[cpu.humanId].hand;
    game.debugSetHand(cpu.humanId, [UI_CONFIG.soldierFamilies[0].root, ...hand.slice(1).map(c => c.type)]);
    tutorial.start(cpu.humanId);
    replayTutorial = false;
  }
  // Game が出すイベントは全部受け取る（演出がないものは Animations が何もしない）
  for (const type of EVENT_TYPES) {
    const h = (payload) => enqueue({ type, payload });
    game.on(type, h);
    listeners.push([type, h]);
  }

  // 開始前の状態を表示用に覚えてから start() する。p1 の turnStarted で最初の目隠しが出る
  viewerId = cpu ? cpu.humanId : null;
  stopChat();
  if (cpu) startLocalChat();
  matchStats.begin(game.getState(viewerId));
  model = modelFromState(game.getState(viewerId));
  if (cpu) {
    // ひとりで遊ぶ：交代の画面はない。最初から自分の視点で出す
    renderer.setViewer(viewerId);
    handView.setColor(colorOf(viewerId));
    for (const c of model.hand) knownCards.set(c.cardId, { ...c });
    renderer.renderAll(model);
    handView.mpCosts = model.mpCosts ?? {};
    handView.render(model.hand);
    sound.play('turn');
    introBoard();
    anim.banner(cpu.humanId === model.playerOrder[0] ? '対戦開始！ あなたが先攻' : '対戦開始！ CPU が先攻', 1100);
  }
  setBusy(true);
  const res = game.start();
  if (!res?.ok) {
    showError(`ゲームを始められませんでした：${reasonText(res?.reason)}`);
    return;
  }
  drainAndSettle();
}

/** イベントをキューに入れる。getState にない値（買った回数・最後に城を削ったもの）はここで覚える */
function enqueue(ev) {
  matchStats.event(ev);
  const p = ev.payload ?? {};
  if (ev.type === 'monsterAppeared') sound.setScene('tension');
  if (ev.type === 'castleDamaged') lastCastleHit = 'castle';
  if (ev.type === 'monsterAttackedCastle') lastCastleHit = 'monster';
  if (ev.type === 'upgradeBought') {
    const counts = (upgradeCounts[p.playerId] ??= {});
    counts[p.upgradeId] = (counts[p.upgradeId] ?? 0) + 1;
  }
  queue.push(ev);
}

// ---------- オンライン ----------

async function joinOnline() {
  if (session?.online) return;
  const name = el.titleName.value.trim();
  const pass = el.titlePass.value.trim();
  if (!name || !pass) {
    el.titleStatus.textContent = '名前と合言葉を入れてください';
    sound.play('deny');
    return;
  }
  try {
    localStorage.setItem('cf-name', name);
    localStorage.setItem('cf-pass', pass);
  } catch { /* 覚えられなくても困らない */ }
  stopLocal();
  el.titleJoin.disabled = true;
  el.titleStatus.textContent = 'つないでいます…';
  const client = new OnlineClient({
    onRoom: (r) => { if (session === client) onRoom(r); },
    onBatch: (batch) => {
      if (session !== client) return;
      batches.push(batch);
      pump();
    },
    onConnection: (ok, info) => { if (session === client) onConnection(ok, info); },
    onChat: (m) => { if (session === client) onChat(m); },
  });
  session = client;
  batches = [];
  room = null;
  connected = true;
  roomPassphrase = pass;
  const res = await client.join(pass, name);
  el.titleJoin.disabled = false;
  if (session !== client) return; // 待っているあいだに「もどる」を押した
  if (!res.ok) {
    client.close();
    session = null;
    el.titleStatus.textContent = res.reason ?? '入れませんでした';
    sound.play('deny');
    return;
  }
  viewerId = res.playerId;
  startOnlineChat(client);
  saveOnlineSession(client);
  setTitleWaiting(true);
  if (!room?.started) el.titleStatus.textContent = '相手を待っています… 同じ合言葉を入れてもらってください';
}

function saveOnlineSession(client) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: client.token, playerId: client.playerId, passphrase: roomPassphrase }));
  } catch { /* 覚えられなければ、読み直したときにつなぎ直せないだけ */ }
}

function forgetOnlineSession() {
  roomView?.clearMyDeckSelection();
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch { /* 何もしない */ }
}

/** ページを読み直したとき：前に入った部屋の鍵が残っていれば、つなぎ直す */
function resumeOnline() {
  let saved = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
  } catch { /* こわれていたら使わない */ }
  if (!saved?.token || !saved?.playerId) return;
  const client = new OnlineClient({
    onRoom: (r) => { if (session === client) onRoom(r); },
    onBatch: (batch) => {
      if (session !== client) return;
      batches.push(batch);
      pump();
    },
    onConnection: (ok, info) => { if (session === client) onConnection(ok, info, { resuming: true }); },
    onChat: (m) => { if (session === client) onChat(m); },
  });
  session = client;
  batches = [];
  room = null;
  connected = true;
  viewerId = saved.playerId;
  roomPassphrase = saved.passphrase ?? '';
  el.titleMain.hidden = true;
  el.titleForm.hidden = false;
  setTitleWaiting(true);
  el.titleStatus.textContent = '前の部屋につなぎ直しています…';
  startOnlineChat(client);
  client.resume(saved.token, saved.playerId);
}

/** オンライン：チャット（文字とスタンプ）を使えるようにする */
function startOnlineChat(client) {
  if (!chat) return;
  chat.reset();
  chat.myId = viewerId;
  chat.send = (payload) => client.chat(payload);
  chat.setEnabled(true, { text: true });
}

function onChat(m) {
  if (!chat) return;
  chat.myId = viewerId;
  if (m.type === 'chatLog') chat.addAll(m.messages);
  else chat.add(m);
}

function stopChat() {
  if (!chat) return;
  chat.setEnabled(false);
  chat.send = null;
  chat.reset();
}

// ---------- ひとりで遊ぶときの CPU のスタンプ ----------
// 人がスタンプか文字を送ると、スタンプで返す。大きなダメージ・勝ち負けにも、ときどき反応する（連発しない）
// 人が文字で送ったときは、ことばに合うスタンプで返す（上から順に見て、最初に当たったもの。当たらなければ「うーん…」など）
const CPU_TEXT_REPLY = [
  [/よろしく|はじめまして|こんにちは|こんばんは|おはよ|hello|hi/i, ['hello']],
  [/ありがと|サンキュー|thx|thanks/i, ['nice', 'thanks']],
  [/ごめん|すまん|すみません|失礼/, ['nice', 'smug']],
  [/すご|ナイス|うまい|上手|強い|つよい|やるな|nice/i, ['thanks', 'smug']],
  [/いい試合|おつかれ|お疲れ|gg/i, ['gg']],
  [/もう1回|もう一回|もういっかい|再戦/, ['again', 'go']],
  [/いくぞ|いけ|負けない|まけない|覚悟|かかってこい/, ['go', 'smug']],
  [/いたい|痛|やられ|くそ|ひどい|ずるい/, ['smug', 'sorry']],
  [/やった|勝った|よし/, ['scared', 'ouch']],
  [/[?？]/, ['think']],
  [/[wｗ笑]$/, ['smug', 'yay']],
];
const CPU_REPLY = { hello: ['hello'], nice: ['thanks', 'smug'], yay: ['nice', 'sorry'], thanks: ['nice'], go: ['scared', 'go'], smug: ['think', 'go'], think: ['smug'], ouch: ['sorry', 'smug'], scared: ['smug', 'go'], sorry: ['nice'], gg: ['gg'], again: ['go', 'yay'] };

function startLocalChat() {
  if (!chat || !cpu) return;
  chat.reset();
  chat.myId = cpu.humanId;
  const cpuId = cpu.id;
  const g = game;
  let lastReact = 0;
  const say = (stamp, delay = 700) => setTimeout(() => {
    if (game !== g || !cpu) return;
    chat.add({ id: `cpu-${Date.now()}`, playerId: cpuId, name: playerName(cpuId), stamp });
  }, delay);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  chat.send = async ({ stamp, text }) => {
    if (text !== undefined) {
      // オンライン（server/rooms.js）と同じ決まり：制御文字は空白にして前後を取り、1〜40文字
      const body = String(text).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
      if (body === '') return { ok: false, reason: 'メッセージが空です' };
      if ([...body].length > CHAT_MAX_LENGTH) return { ok: false, reason: `メッセージは${CHAT_MAX_LENGTH}文字までです` };
      chat.add({ id: `me-${Date.now()}`, playerId: cpu.humanId, name: playerName(cpu.humanId), text: body });
      const hit = CPU_TEXT_REPLY.find(([pattern]) => pattern.test(body));
      say(pick(hit ? hit[1] : ['think', 'smug', 'go']), 700 + Math.random() * 700);
      return { ok: true };
    }
    if (!stamp || !chat.stampOf(stamp)) return { ok: false, reason: 'そのスタンプはありません' };
    chat.add({ id: `me-${Date.now()}`, playerId: cpu.humanId, name: playerName(cpu.humanId), stamp });
    if (Math.random() < 0.7) say(pick(CPU_REPLY[stamp] ?? ['hello']), 600 + Math.random() * 700);
    return { ok: true };
  };
  const react = (stamp) => {
    const now = Date.now();
    if (now - lastReact < 8000 || Math.random() > 0.5) return;
    lastReact = now;
    say(stamp, 500);
  };
  const on = (type, h) => { g.on(type, h); listeners.push([type, h]); };
  on('castleDamaged', (p) => {
    if (p.amount - (p.blocked ?? 0) < 10) return;
    react(p.playerId === cpuId ? pick(['ouch', 'scared']) : pick(['smug', 'go']));
  });
  on('gameOver', (p) => { say(p.winner === cpuId ? pick(['smug', 'gg']) : pick(['gg', 'sorry']), 1200); });
  chat.setEnabled(true, { text: true });
}

function leaveOnline() {
  stopChat();
  roomView?.hide();
  if (session?.online) {
    // 自分から出る：サーバーに知らせる（残った人に「部屋を出ました」と出る）。返事は待たない
    if (session.token) session.leave();
    session.close();
    session = null;
    forgetOnlineSession();
  }
  batches = [];
  room = null;
  sending = false;
  setPlayerNames({});
  el.netStatus.hidden = true;
  setTitleWaiting(false);
}

/** 版をそろえた部屋（部屋を作った人が、自分の版を1回だけ部屋に伝える） */
const editionSentRooms = new Set();

function onRoom(r) {
  room = r;
  if (r.you) { viewerId = r.you; session.playerId = r.you; saveOnlineSession(session); }
  // 部屋の版（西洋・日本）と、この画面の版をそろえる
  const roomEdition = r.settings?.edition ?? 'western';
  if ((r.choices?.editions ?? []).length > 1 && roomEdition !== EDITION) {
    const humans = r.players.filter((p) => !p.cpu).length;
    if (r.you === r.hostId && !r.started && humans === 1 && !editionSentRooms.has(r.roomId)) {
      // 部屋を作った人：自分の版を部屋に伝える
      editionSentRooms.add(r.roomId);
      void session.act('setRules', [{ edition: EDITION }]);
    } else {
      // 部屋の版で遊ぶ：版を覚えて読み直す（同じタブなら、元の部屋につなぎ直す）
      editionSentRooms.add(r.roomId);
      saveEdition(roomEdition);
      toast(`この部屋は「${EDITIONS[roomEdition]?.name ?? roomEdition}」で遊びます。切り替えます…`, 'info');
      setTimeout(() => location.reload(), 600);
      return;
    }
  }
  setPlayerNames(Object.fromEntries(r.players.map((p) => [p.playerId, p.name])));
  if (!r.started) {
    gen++; anim.skip(); queue = []; batches = []; model = null;
    el.result.hidden = true; el.title.hidden = true;
    roomView.render(r, roomPassphrase);
  } else roomView.hide();
  $('back-to-room').hidden = r.you !== r.hostId;
  updateNetStatus();
  // もう1回：自分が押したら相手を待つ。相手が先に押していたら知らせる
  const votes = r.rematchVotes ?? [];
  if (!el.result.hidden) {
    if (votes.includes(viewerId)) {
      el.rematch.textContent = '相手を待っています…';
      el.rematch.disabled = true;
    } else if (votes.length) {
      el.rematch.textContent = 'もう1回（相手は準備OK）';
    }
  }
}

// ページを閉じる・読み直すときにも接続は切れる。そのときは何もしない（部屋の鍵を消さず、読み直したあとにつなぎ直す）
let unloading = false;
window.addEventListener('pagehide', () => { unloading = true; });
window.addEventListener('beforeunload', () => { unloading = true; });
window.addEventListener('pageshow', () => { unloading = false; });

function onConnection(ok, { fatal }, { resuming = false } = {}) {
  if (unloading) return;
  connected = ok;
  if (fatal) {
    // サーバーが部屋を忘れた（再起動など）。つなぎ直せないので、タイトルへ戻る
    const started = Boolean(model) && el.title.hidden;
    session.token = null; // もう部屋はないので、「出る」は送らない
    showTitle();
    if (!resuming || started) toast('サーバーとの接続が切れました。もう一度、合言葉から入ってください');
    return;
  }
  updateNetStatus();
}

function updateNetStatus() {
  let text = '';
  let gone = false;
  if (session?.online) {
    const others = (room?.players ?? []).filter((p) => p.playerId !== viewerId);
    const left = others.filter((p) => p.left);
    const away = others.filter((p) => !p.left && !p.connected);
    gone = left.length > 0;
    if (gone) text = `${left.map((p) => p.name).join('・')}さんが部屋を出ました`;
    else if (!connected) text = 'サーバーにつなぎ直しています…';
    // 自動では決着しない。待つか、自分でやめるかを選べる
    else if (room?.started && away.length) text = `${away.map((p) => p.name).join('・')}さんの接続が切れています。戻るのを待っています…`;
    el.netLeave.hidden = !(gone || (room?.started && away.length > 0));
    el.netLeave.textContent = gone ? 'タイトルへ' : 'やめる';
  }
  el.netText.textContent = text;
  el.netStatus.hidden = !text;
  // 相手が出たあとは、もう1回はできない
  if (gone && !el.result.hidden) {
    el.rematch.textContent = '相手は部屋を出ました';
    el.rematch.disabled = true;
  }
}

/** 届いたまとまりを、順番に見せる */
async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (batches.length && session?.online) {
      const batch = batches.shift();
      if (batches.length > 1) anim.skip(); // たまっているとき（画面を閉じていた など）は早送りで追いつく
      await showBatch(batch);
    }
  } catch (err) {
    recover(err);
  } finally {
    pumping = false;
  }
}

async function showBatch(batch) {
  $('asset-loading').hidden=false;
  await prepareBattleAssets();
  $('asset-loading').hidden=true;
  document.documentElement.classList.remove('at-title');
  const client = session;
  const st = batch.state;
  client.commit(batch);
  sending = false;
  for (const c of st.players[viewerId]?.hand ?? []) knownCards.set(c.cardId, { ...c });

  const newGame = !model || !el.title.hidden || st.turn < model.turn ||
    (model.phase === 'gameOver' && st.phase !== 'gameOver');
  if (newGame) {
    // 試合の始まり（入ったとき・もう1回）：状態から描く
    resetForNewGame();
    matchStats.begin(st);
    if (st.turn <= 1) for (const ev of batch.events) matchStats.event(ev);
    for (const c of st.players[viewerId]?.hand ?? []) knownCards.set(c.cardId, { ...c });
    el.title.hidden = true;
    roomView.hide();
    renderer.setViewer(viewerId);
    handView.setColor(colorOf(viewerId));
    model = modelFromState(st);
    renderer.renderAll(model);
    renderer.setCurrentPlayer(st.currentPlayer);
    handView.mpCosts = model.mpCosts ?? {};
    handView.render(model.hand);
    setBusy(true);
    if (st.turn <= 1 && st.phase !== 'gameOver') {
      sound.play('turn');
      introBoard();
      anim.banner(st.currentPlayer === viewerId ? '対戦開始！ あなたが先攻' : '対戦開始！ 相手が先攻', 1100);
      await anim.delay(900);
    }
  } else {
    for (const ev of batch.events) enqueue(ev);
    if (!(await drainEvents())) return;
  }
  if (session !== client) return;
  await settle({ check: false });
}

// ---------- 表示用の状態 ----------

function modelFromState(st) {
  const players = {};
  for (const id of st.playerOrder) {
    const p = st.players[id];
    players[id] = {
      castleType:p.castleType, deckId:p.deckId,
      team: p.team, castleOwner: p.castleOwner ?? id, eliminated: p.eliminated,
      castleHp: p.castleHp,
      castleMaxHp: p.castleMaxHp,
      armor: p.armor ?? 0,
      castlePoison: p.castlePoison ?? null,
      spirit: p.spirit ?? null,
      coins: p.coins ?? 0,
      mp: p.mp ?? 0,
      permLuck: p.permLuck ? { ...p.permLuck } : null,
      luck: p.luck ? structuredClone(p.luck) : null,
      armyAttack: p.armyAttack ?? 0, armyHp: p.armyHp ?? 0,
      handCount: p.handCount,
      playedThisTurn: p.playedThisTurn,
      soldiersPlayedThisTurn: p.soldiersPlayedThisTurn,
      cardsPlayedThisTurn: p.cardsPlayedThisTurn ?? 0,
      soldiers: p.soldiers.map((s) => structuredClone(s)),
    };
  }
  return {
    deckMode:st.deckMode,
    maxMp: st.maxMp ?? 0,
    mpCosts: { ...(st.mpCosts ?? {}) },
    layout: st.layout, roads: structuredClone(st.roads ?? []), teams: structuredClone(st.teams ?? null), winnerTeam: st.winnerTeam,
    playerOrder: [...st.playerOrder],
    turn: st.turn,
    round: st.round ?? 0,
    weather: st.weather ? { ...st.weather } : null,
    currentPlayer: st.currentPlayer,
    phase: st.phase,
    winner: st.winner,
    gameOverReason: model?.gameOverReason ?? null,
    deckCount: st.deckCount,
    discardCount: st.discardCount,
    discardRequired: model?.discardRequired ?? 0,
    monsters: (st.monsters ?? []).map((m) => ({ ...m })),
    players,
    hand: (st.players[viewerId]?.hand ?? []).map((c) => ({ ...c })),
    pieceCards: new Set([
      ...(model?.pieceCards ?? []),
      ...(st.players[viewerId]?.hand ?? []).filter(c => cards[c.type]?.monster !== undefined).map(c => c.cardId),
    ]),
  };
}

/** viewer の手札の中身を覚えておく（引いたカードの種類を知るため） */
function readState() {
  const st = session.getState(viewerId);
  for (const c of st.players[viewerId]?.hand ?? []) knownCards.set(c.cardId, { ...c });
  return st;
}

function lookupCard(cardId) {
  if (!knownCards.has(cardId)) readState();
  return knownCards.get(cardId) ?? null;
}

// ---------- イベントの再生 ----------

function setBusy(value) {
  progressPanel?.closeFusion();
  busy = value;
  if (!value) progressPanel?.refresh();
  el.app.classList.toggle('busy', value);
  handView.setLocked(value);
  if (value) {
    cancelTargeting();
    upgradePanel?.setEnabled(false, { reason: upgradeOffReason(session?.getState(viewerId)) });
    el.endTurn.disabled = true;
    el.endTurn.classList.remove('ready', 'off');
    setMessage('');
  }
}

/** 見ている人の陣地（チーム戦なら城の持ち主） */
function viewerSide() {
  return model?.players?.[viewerId]?.castleOwner ?? viewerId;
}

/** 忍者（見えない兵士）のイベントは、見ている人の陣地のものだけ見せる（オンラインはサーバーが隠す。同じ決まり） */
function hiddenFromViewer(ev) {
  return ev.payload?.stealth !== undefined && ev.payload.stealth !== viewerSide();
}

async function drainEvents() {
  const g = gen;
  setBusy(true);
  while (queue.length && g === gen) {
    const ev = queue.shift();
    if (hiddenFromViewer(ev)) continue;
    try {
      if (ev.type === 'turnStarted' && usesHandover() && ev.payload.playerId !== viewerId) {
        await anim.play(ev, queue, model, { viewerId, lookupCard });
        await handover(ev.payload.playerId, ev.payload.turn);
        continue;
      }
      if (queue.length) setMessage('タップで早送り');
      await anim.play(ev, queue, model, { viewerId, lookupCard });
      tutorial.event(ev);
      if (ev.type === 'turnStarted' && !usesHandover()) {
        // オンライン・CPU 戦は交代の画面がないので、だれの番かを帯で知らせる
        const mine = ev.payload.playerId === viewerId;
        if (mine) sound.play('turn');
        anim.banner(mine ? 'あなたの番！' : `${playerName(ev.payload.playerId)}の番`, 700, mine ? 'turn mine' : 'turn');
        await anim.delay(mine ? 420 : 260);
      }
    } catch (err) {
      console.error(`イベント ${ev.type} の演出に失敗しました`, err);
    }
  }
  if (g !== gen) return false; // 途中で別の試合が始まった
  anim.endSkip();
  return true;
}

async function drainAndSettle() {
  try {
    if (await drainEvents()) await settle();
  } catch (err) {
    recover(err);
  }
}

/** デバッグパネルで状態を変えたあと（演出なしで変わるので、ずれの確認はしない） */
function settleSafely() {
  settle({ check: false }).catch(recover);
}

/** 演出や画面合わせで例外が出たとき：知らせて、操作できる状態に戻す（何を押しても反応しない、を作らない） */
function recover(err) {
  console.error('画面の更新に失敗しました', err);
  anim.endSkip();
  toast(`画面の更新でエラーが起きました：${err?.message ?? err}`);
  setBusy(false);
  el.endTurn.disabled = false;
}

/** 演出が終わったら、本当の状態（getState）で画面を合わせ、次の操作を待つ */
async function settle({ check = true } = {}) {
  if (!session) return;
  const st = readState();
  if (usesHandover() && st.phase !== 'gameOver' && st.phase !== 'ready' && st.currentPlayer !== viewerId) {
    // 手番が変わったのに turnStarted が来なかった場合の保険
    await handover(st.currentPlayer, st.turn);
    return settle({ check });
  }
  // デバッグ：演出で進めた値と本当の状態がずれていないか（ずれていたら console.warn('[sync]', ...)）
  if (DEBUG && check && st.phase !== 'gameOver') checkSync(model, st);
  if (model.gameOverReason === 'castleDestroyed' && lastCastleHit === 'monster') model.gameOverReason = 'monsterDestroyed';
  handView.mpCosts = st.mpCosts ?? {};
  handView.onMpSelect = cost => renderer.showMpShortage(Math.max(0, cost - (st.players[viewerId]?.mp ?? 0)));
  renderer.round = st.round;
  renderer.showMpShortage();
  model = modelFromState(st);
  renderer.renderAll(model);
  if (st.phase !== 'gameOver') sound.setScene(st.monsters.length ? 'tension' : 'battle');
  renderer.setCurrentPlayer(st.phase === 'gameOver' ? null : st.currentPlayer);
  const me = st.players[viewerId];
  battleLayout.update(st, viewerId);
  // 手札の表示は並べ替えてあるので、並びではなく、同じカードがそろっているかで比べる
  if (!handView.sameCards(me.hand)) handView.render(me.hand);
  const blocked = playability(st);
  handView.setPlayability(blocked);

  if (st.phase === 'gameOver') {
    showResult(st.winner);
    return;
  }

  setBusy(false);
  // 降参・脱落した人は、残りの試合を見守る（操作はできない）
  const spectating = Boolean(me.eliminated);
  el.app.classList.toggle('spectating', spectating);
  let strip = document.getElementById('spectator-strip');
  if (!strip) {
    strip = document.createElement('aside'); strip.id = 'spectator-strip'; strip.setAttribute('aria-label', '観戦');
    strip.innerHTML = '<strong>観戦中</strong><span class="spectator-flow"></span><span class="spectator-seats"></span><button type="button" class="small-btn">タイトルへ</button>';
    strip.querySelector('button').onclick = () => document.getElementById('menu-title-btn').click();
    document.getElementById('controls').prepend(strip);
  }
  strip.hidden = !spectating;
  strip.querySelector('.spectator-seats').textContent = st.playerOrder.map((id,i) => `席${i+1} ${playerName(id)}${st.players[id].eliminated ? '：脱落' : '：対戦中'}`).join(' ／ ');
  strip.querySelector('.spectator-flow').textContent = `${st.round}周目 · ${playerName(st.currentPlayer)}の番 · ${UI_CONFIG.speed === 0 ? '演出スキップ' : UI_CONFIG.speed < 1 ? 'はやい' : 'ふつう'} · タップで早送り`;
  if (spectating) upgradePanel.setEnabled(false, { reason: '観戦中は強化を買えません' });
  if (spectating) {
    el.endTurn.disabled = true;
    el.endTurn.classList.add('off');
    handView.exitDiscard();
    setMessage('');
    return;
  }
  refreshUpgrades();
  setEndTurnLabel(st.phase === 'defend' && st.defense?.defenderId === viewerId);
  if (st.phase === 'defend') {
    // 攻撃を受けるところ：受ける人だけが防御カードを出せる。相手は待つ
    handView.exitDiscard();
    const d = st.defense;
    if (d.defenderId !== viewerId) {
      el.endTurn.disabled = false;
      el.endTurn.classList.add('off');
      setMessage(`${playerName(d.defenderId)}が防御を選んでいます…`);
      return;
    }
    el.endTurn.classList.remove('off', 'ready');
    el.endTurn.disabled = false;
    setHandVisible(true); // 防御カードを選ぶので、手札を出す
    const who = playerName(d.attackerId);
    setMessage(d.kind === 'castle'
      ? `${who}の攻撃が城に${d.amount}ダメージ！ 城壁などで守れます`
      : `${who}の魔法が兵士に${d.amount}ダメージ！ 盾で守れます`);
    return;
  }
  const myTurn = st.currentPlayer === viewerId;
  if (!myTurn) {
    // オンライン・CPU 戦の相手の番：見るだけ。手札は説明だけ読める
    handView.exitDiscard();
    el.endTurn.disabled = false;
    el.endTurn.classList.add('off');
    setMessage(st.phase === 'discard' ? `${playerName(st.currentPlayer)}が手札を捨てています…` : '');
    if (cpu?.ids.includes(st.currentPlayer)) cpuTurn();
    return;
  }
  el.endTurn.classList.remove('off');
  if (st.phase === 'discard') {
    const maxHand = me.maxHand ?? rules.maxHand;
    const count = model.discardRequired || Math.max(1, me.handCount - maxHand);
    setHandVisible(true); // 捨てるカードを選ぶので、手札を出す
    handView.enterDiscard(count, maxHand);
    el.endTurn.disabled = true;
    setMessage('捨てるカードを選んでください');
    return;
  }
  handView.exitDiscard();
  el.endTurn.disabled = false;
  const anyPlayable = me.hand.some((c) => !blocked.has(c.cardId));
  el.endTurn.classList.toggle('ready', !anyPlayable);
  setMessage(''); // 操作の案内は出さない（盤面を広く見せる）
  // 出せるカードも、買える強化も、合成できるカードもなければ、待たせずに自動でターンを終える
  if (!anyPlayable && !canBuyAnyUpgrade() && !canFuseAny(me.hand)) autoEndTurn(st.turn);
}

/** 今買える強化があるか */
function canBuyAnyUpgrade() {
  return Object.keys(upgrades ?? {}).some((id) => session.canBuyUpgrade(id)?.ok);
}

/** 手札に合成できる組（同じ種類の2枚で、合成先があるもの）があるか */
function canFuseAny(hand) {
  const seen = new Set();
  const wild = hand.some((c) => cards[c.type]?.effect === 'wild');
  for (const c of hand) {
    if (cards[c.type]?.effect === 'wild') { if (hand.some((h) => cards[h.type]?.fuseTo)) return true; continue; }
    if (!cards[c.type]?.fuseTo) continue;
    if (wild || seen.has(c.type)) return true;
    seen.add(c.type);
  }
  return false;
}

/** やることがないときの自動のターン終了。少し待って、そのあいだに状態が変わっていなければ終える */
let autoEndFor = null; // 自動のターン終了を待っている手番（同じ手番で何度も始めないように）
async function autoEndTurn(turn) {
  if (autoEndFor === turn) return;
  autoEndFor = turn;
  const s = session;
  setMessage('出せるカードがないので、ターンを終えます');
  await new Promise((r) => setTimeout(r, UI_CONFIG.timing.autoEndTurn * UI_CONFIG.speed));
  if (s !== session || busy || sending) return;
  const st = session.getState(viewerId);
  if (!st || st.turn !== turn || st.phase !== 'main' || st.currentPlayer !== viewerId) return;
  endTurn();
}

/** 手札の各カードが出せないなら、その理由（canPlayCard の結果。付加・防御はメインのあとも出せる） */
function playability(st) {
  const blocked = new Map();
  const me = st.players[viewerId];
  if (st.phase !== 'main' && !(st.phase === 'defend' && st.defense?.defenderId === viewerId)) return blocked;
  for (const c of me.hand) {
    const res = session.canPlayCard(c.cardId);
    if (res && !res.ok) blocked.set(c.cardId, reasonText(res.reason));
  }
  return blocked;
}

// ---------- CPU（ひとりで遊ぶ） ----------

/**
 * CPU の番：少し間をおいてから、戦い方（js/game/strategies.js）に1ターンぶん動いてもらい、まとめて演出する。
 * CPU も Game の公開メソッドだけを使う（自分の手札しか見ない）。
 */
async function cpuTurn() {
  const g = gen;
  const group = cpu;
  const me = {...group, id: game.getState(null).currentPlayer};
  setBusy(true);
  setMessage('');
  await new Promise((r) => setTimeout(r, UI_CONFIG.cpuThink / Math.max(1, me.ids.length) * UI_CONFIG.speed));
  if (g !== gen || cpu !== group || !game) return; // 待っているあいだに、やめた・やり直した
  try {
    const ctx = { cards, rules:game.rules, upgrades: upgrades ?? {}, discardCount: 0 };
    const discardIfNeeded = () => {
      const st = game.getState(me.id);
      if (st.phase !== 'discard' || st.currentPlayer !== me.id) return;
      const p = st.players[me.id];
      ctx.discardCount = p.handCount - (p.maxHand ?? rules.maxHand);
      game.discard(me.strategy.chooseDiscard(game, me.id, me.rng, ctx));
    };
    discardIfNeeded();
    let st = game.getState(me.id);
    if (st.phase === 'main' && st.currentPlayer === me.id) {
      me.strategy.takeTurn(game, me.id, me.rng, ctx);
      st = game.getState(me.id);
      // 自分の攻撃で相手が防御を選んでいるあいだは、ターンを終えない（返事が来たら、続きを進める）
      if (st.phase === 'main' && st.currentPlayer === me.id) game.endTurn();
      discardIfNeeded();
      cpuDefendIfNeeded(); // 自分の番が終わって、人の兵士が CPU の城に着いたときなど
    }
  } catch (err) {
    console.error('CPU の手番でエラーが起きました', err);
    const st = game.getState(me.id);
    if (st.phase === 'main' && st.currentPlayer === me.id) game.endTurn(); // 止まらないように、番だけは終える
  }
  drainAndSettle();
}

// ---------- 操作 ----------

/**
 * 操作を送る。同じ端末ならすぐ結果のイベントを演出する。
 * オンラインなら、結果のイベントが届いたときに演出する（showBatch）。返事を待つあいだは二度押しできない。
 * @param {() => Promise<{ok: boolean, reason?: string}>} send
 * @returns {Promise<object|null>} 送れなかったら null
 */
async function act(send) {
  if (busy || sending || !session) return null;
  const s = session;
  if (s.online) {
    sending = true;
    el.app.classList.add('sending');
  }
  let res;
  try {
    res = await send();
  } catch (err) {
    console.error(err);
    res = { ok: false, reason: '操作に失敗しました' };
  }
  el.app.classList.remove('sending');
  if (s !== session) return null;
  if (s.online) {
    if (!res?.ok) sending = false; // 成功したときは、結果のまとまりが届いたら false に戻る（showBatch）
  } else if (res?.ok) {
    cpuDefendIfNeeded(); // CPU が攻撃を受けるときは、CPU が防御を決める
    drainAndSettle();
  }
  return res;
}

/** CPU が攻撃を受けるところ（phase "defend"）なら、戦い方に防御を決めてもらう */
function cpuDefendIfNeeded() {
  if (!cpu || !game) return;
  const ctx = { cards, rules:game.rules, upgrades: upgrades ?? {}, discardCount: 0 };
  for (let i = 0; i < 50; i++) {
    const st = game.getState(null);
    if (st.phase !== 'defend' || !cpu.ids.includes(st.defense.defenderId)) return;
    cpu.strategy.respond(game, st.defense.defenderId, cpu.rng, ctx);
  }
}

/** 「ターン終了」ボタンは、攻撃を受けているあいだ「防御しない」になる */
function setEndTurnLabel(defending) {
  el.endTurn.textContent = defending ? '防御しない' : 'ターン終了';
}

function playCard(cardId) {
  if (busy || sending || !session) return;
  targeting.cancel();
  upgradePanel?.close();
  const check = session.canPlayCard(cardId);
  if (check?.ok && check.needsTarget) {
    startTargeting(cardId);
    return;
  }
  doPlay(cardId);
}

/** カードを出す（target を省略すると、対象が1つのときだけ出せる） */
async function doPlay(cardId, target) {
  const defending = session?.getState(viewerId)?.phase === 'defend';
  const res = await act(() => (defending ? session.defend(cardId, target) : session.playCard(cardId, target)));
  if (!res) return;
  if (!res.ok) {
    if (res.needsTarget) {
      startTargeting(cardId);
      return;
    }
    targeting.cancel();
    handView.deny(cardId);
    toast(reasonText(res.reason));
    return;
  }
  targeting.cancel();
}

/** 対象が2つ以上あるカード：盤面の対象を光らせて選んでもらう */
function startTargeting(cardId) {
  const targets = session.getTargets(cardId);
  if (targets.length === 0) {
    targeting.cancel();
    handView.deny(cardId);
    toast(reasonText(session.canPlayCard(cardId)?.reason)); // 出せない理由を Game から出してもらう
    return;
  }
  const type = knownCards.get(cardId)?.type;
  targeting.start(cardId, targets, cards[type]?.name ?? 'カード');
}

function cancelTargeting() {
  targeting?.cancel();
}

// ---------- 強化 ----------

/** 強化のボタンとパネルを、今の状態に合わせる */
function refreshUpgrades() {
  if (!upgradePanel || !session) return;
  const st = session.getState(viewerId);
  if (!st) return;
  const me = st.players[viewerId];
  const myTurn = !busy && st.phase === 'main' && st.currentPlayer === viewerId;
  const why = upgradeOffReason(st);
  const status = {};
  for (const id of Object.keys(upgrades)) status[id] = myTurn ? session.canBuyUpgrade(id) : { ok: false, reason: why };
  const anyOk = Object.values(status).some((x) => x.ok);
  upgradePanel.setEnabled(myTurn, { highlight: anyOk, reason: why });
  // オンラインでは、つなぎ直すと買った回数が分からないので、残りの回数は出さない
  if (me) upgradePanel.refresh(me.coins ?? 0, status, session.online ? null : (upgradeCounts[viewerId] ?? {}), me.permLuck);
}

/** 強化を買えない場面の理由 */
function upgradeOffReason(st) {
  if (st?.phase === 'gameOver') return 'ゲームは終わっています';
  if (st && viewerId && st.currentPlayer !== viewerId) return '強化は自分の番に買えます';
  if (st?.phase === 'discard') return '先に手札を捨ててください';
  if (st?.phase === 'defend') return '攻撃を受けているあいだは買えません';
  if (busy) return '演出が終わってから買えます';
  return '強化は自分の番のメインで買えます';
}

async function buyUpgrade(upgradeId) {
  cancelTargeting();
  const res = await act(() => session.buyUpgrade(upgradeId));
  if (!res) return;
  if (!res.ok) {
    sound.play('deny');
    toast(reasonText(res.reason));
    return;
  }
  upgradePanel.close();
}

async function endTurn() {
  if (busy || sending || !session) return;
  if (el.endTurn.classList.contains('off')) {
    toast('いまは相手の番です', 'info');
    return;
  }
  cancelTargeting();
  upgradePanel?.close();
  sound.play('tap');
  // 攻撃を受けているとき、このボタンは「防御しない」
  const defending = session.getState(viewerId)?.phase === 'defend';
  const res = await act(() => (defending ? session.passDefense() : session.endTurn()));
  if (res && !res.ok) toast(reasonText(res.reason));
}

async function discard(cardIds) {
  const res = await act(() => session.discard(cardIds));
  if (res && !res.ok) toast(reasonText(res.reason));
}

async function rematch() {
  sound.play('tap');
  if (!session?.online) {
    startLocal(undefined, cpu?.level ?? null, lastLocalOptions); // CPU 戦は同じ強さでもう1回
    return;
  }
  if (rematchSent) return;
  rematchSent = true;
  el.rematch.textContent = '相手を待っています…';
  el.rematch.disabled = true;
  const res = await session.rematch();
  if (!res?.ok) {
    rematchSent = false;
    el.rematch.textContent = 'もう1回';
    el.rematch.disabled = false;
    toast(reasonText(res?.reason));
  }
}

// ---------- 交代・勝敗 ----------

/** 画面を隠して「プレイヤー2の番です」を出し、タップされたら新しい視点で表示する */
function handover(playerId, turn) {
  anim.endSkip();
  handView.clear();
  setBusy(true);
  el.handover.dataset.player = playerId;
  el.handoverTurn.textContent = `ターン ${turn}`;
  el.handoverTitle.textContent = `${playerName(playerId)}の番です`;
  el.handoverPic.innerHTML = castleArt(colorOf(playerId));
  el.handover.hidden = false;

  return new Promise((resolve) => {
    const stop = () => {
      el.handover.removeEventListener('click', open);
      window.removeEventListener('keydown', open);
      cancelHandover = null;
    };
    cancelHandover = stop; // タイトルへ戻る・最初からやり直すときは、待ちをやめる（resolve しない）
    const open = (e) => {
      if (e.type === 'keydown' && !['Enter', ' '].includes(e.key)) return;
      stop();
      sound.play('turn');
      viewerId = playerId;
      renderer.setViewer(viewerId);
      handView.setColor(colorOf(viewerId));
      // 手札は「これから引くカード」を除いて出し、引く演出で1枚ずつ加える
      const st = readState();
      const willDraw = new Set(queue
        .filter((ev) => ev.type === 'cardDrawn' && ev.payload.playerId === viewerId)
        .flatMap((ev) => ev.payload.cardIds));
      model.hand = st.players[viewerId].hand.filter((c) => !willDraw.has(c.cardId));
      // 見る人が替わったら、ほかの陣地の忍者（見えない兵士）を盤面から外し、
      // 見る人の陣地の忍者（前の人には見えていなかった）を、見る人の状態から戻す
      for (const [id, p] of Object.entries(model.players ?? {})) {
        const side = p.castleOwner ?? id;
        const isNinja = (s) => cards[s.type]?.role === 'ninja';
        if (side !== viewerSide()) {
          p.soldiers = (p.soldiers ?? []).filter((s) => !isNinja(s));
        } else {
          const shown = new Set((p.soldiers ?? []).map((s) => s.soldierId));
          const back = (st.players[id]?.soldiers ?? []).filter((s) => isNinja(s) && !shown.has(s.soldierId));
          p.soldiers = [...(p.soldiers ?? []), ...back.map((s) => structuredClone(s))];
        }
      }
      if (model.deckMode !== 'shared') {
        // 1人1つの山札：見る人が替わると、山札・捨て札の数はその人のものになる。
        // このあと流れる「引く」演出で減らす前の数（＝引き終わりの数＋これから引く枚数）から始める
        // 魔物を倒したごほうび・駒と、運命の祈りで引く分は、山札から引かないので数えない
        let fromDeck = 0, notFromDeck = 0, luck = model.players[viewerId]?.luck?.draws ?? 0;
        for (const ev of queue) {
          const p = ev.payload;
          if (ev.type === 'monsterDefeated' && p.playerId === viewerId) notFromDeck += (p.rewardRarity ? 1 : 0) + (p.pieceType ? 1 : 0);
          if (ev.type !== 'cardDrawn' || p.playerId !== viewerId) continue;
          for (let i = 0; i < p.cardIds.length; i++) {
            if (notFromDeck > 0) notFromDeck -= 1;
            else if (luck > 0) luck -= 1;
            else fromDeck += 1;
          }
        }
        const shuffle = queue.find((ev) => ev.type === 'deckShuffled' && ev.payload.playerId === viewerId);
        model.deckCount = shuffle ? Math.max(0, fromDeck - (shuffle.payload.deckCount - st.deckCount)) : st.deckCount + fromDeck;
        model.discardCount = st.discardCount;
        model.preShuffleDraws = 0;
      }
      renderer.renderAll(model);
      renderer.setCurrentPlayer(playerId);
      handView.mpCosts = model.mpCosts ?? {};
      handView.render(model.hand);
      handView.setPlayability(new Map());
      el.handover.hidden = true;
      anim.delay(UI_CONFIG.timing.afterTurnStart).then(resolve);
    };
    el.handover.addEventListener('click', open);
    window.addEventListener('keydown', open);
  });
}

function stopCelebration() {
  el.result.classList.add('celebration-done');
  el.confetti.replaceChildren();
}

async function showResult(winner) {
  setBusy(true);
  const s = session;
  await anim.delay(UI_CONFIG.timing.gameOverDelay);
  if (s !== session) return; // 待っているあいだにタイトルへ戻った
  const online = !usesHandover(); // オンライン・CPU 戦：画面を見ている人から見た勝ち負けを出す
  const winningTeam = model.teams?.[model.winnerTeam];
  const won = !online || winner === viewerId || Boolean(winningTeam?.members.includes(viewerId));
  el.result.dataset.player = winner;
  el.result.classList.toggle('lost', !won);
  el.resultTitle.textContent = online ? (won ? 'あなたの勝ち！' : '負けてしまった…') : `${playerName(winner)}の勝ち！`;
  if (winningTeam) el.resultTitle.textContent = `${winningTeam.members.map(playerName).join('・')}のチームが勝利！`;
  $('back-to-room').hidden = !session?.online || room?.hostId !== viewerId;
  const how = (won ? GAME_OVER_TEXT : GAME_OVER_TEXT_LOST)[model.gameOverReason] ?? '';
  // 3人以上で負けたときは、だれが勝ったかも出す
  const victor = online && !won && !winningTeam && model.playerOrder.length > 2 ? `${playerName(winner)}の勝ち　` : '';
  el.resultSub.textContent = `${victor}${how}`.trim();
  const resultImage = new Image();
  resultImage.className = 'result-illustration';
  resultImage.alt = '';
  resultImage.src = `assets/ui/result-${won ? 'victory' : 'defeat'}.png`;
  el.resultPic.replaceChildren(resultImage);
  const colors = winner === 'p1'
    ? ['#4da3e8', '#bfe3fb', '#ffd93b', '#ffffff']
    : ['#f5923e', '#ffd9b0', '#ffd93b', '#ffffff'];
  stopCelebration();
  if (won && !UI_CONFIG.reducedMotion) {
    el.result.classList.remove('celebration-done');
    anim.confetti(el.confetti, colors);
    el.confetti.lastElementChild?.addEventListener('animationend', () => {
      if (s === session && !el.result.hidden) stopCelebration();
    }, { once: true });
  }
  matchStats.render(viewerId, online);
  matchStats.finish(won, online);
  el.result.hidden = false;
  sound.enabled = true;
  sound.setScene(won ? 'victory' : 'defeat');
  sound.play(won ? 'win' : 'lose');
  if (!rematchSent) {
    el.rematch.disabled = false;
    const votes = room?.rematchVotes ?? [];
    el.rematch.textContent = session?.online && votes.length ? 'もう1回（相手は準備OK）' : 'もう1回';
    updateNetStatus(); // 相手が部屋を出ていたら、「もう1回」は押せない
  }
  el.rematch.focus({ preventScroll: true });
}

// ---------- 小物 ----------

/** 対戦のはじまり：城がせり上がり、道がのび、手札が配られる（css/motion.css の .match-intro） */
function introBoard() {
  const app = $('app');
  app.classList.remove('match-intro');
  void app.offsetWidth;
  app.classList.add('match-intro');
  setTimeout(() => app.classList.remove('match-intro'), 1400);
}

function setMessage(text) {
  el.message.textContent = text;
}

let toastTimer = 0;
function toast(text, kind = 'error') {
  el.toast.textContent = text;
  el.toast.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.className = kind; }, UI_CONFIG.timing.toast);
}

function showError(text) {
  el.error.textContent = text;
  el.error.hidden = false;
}

boot().catch((err) => {
  console.error(err);
  hideLoading();
  showError(`起動できませんでした：${err.message}`);
});
