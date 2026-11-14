// 起動と、Game と画面のつなぎ役。
// - data/ の JSON を読み、new Game({ cards, rules, rng, monsters, upgrades }) を作る
//   （monsters.json・upgrades.json は読めなければ省略する。そのときは魔物が出ず、強化も買えない）
// - Game のイベントをキューにため、届いた順に Animations で演出する
// - 演出中は操作を受け付けない（画面タップで演出を飛ばせる）
// UI はゲームの状態を直接書き換えない。getState / playCard / discard / endTurn / buyUpgrade / on / off と、
// 開始の start()、前もって調べる canPlayCard() / getTargets() / canBuyUpgrade()（どれも読むだけ）を使う。

import { Game, EVENT_TYPES } from './game/Game.js';
import { Renderer } from './ui/Renderer.js';
import { HandView } from './ui/HandView.js';
import { Animations } from './ui/Animations.js';
import { DebugPanel } from './ui/DebugPanel.js';
import { UpgradePanel } from './ui/UpgradePanel.js';
import { Targeting } from './ui/Targeting.js';
import { checkSync } from './ui/syncCheck.js';
import { UI_CONFIG } from './ui/config.js';
import { playerName, reasonText, soldierInfo, monsterInfo, GAME_OVER_TEXT } from './ui/text.js';

const params = new URLSearchParams(location.search);
const DEBUG = params.get('debug') === '1';
const URL_SEED = params.has('seed') ? Number(params.get('seed')) >>> 0 : null;

const $ = (id) => document.getElementById(id);
const el = {
  app: $('app'),
  message: $('message'),
  endTurn: $('end-turn'),
  toast: $('toast'),
  handover: $('handover'),
  handoverTurn: document.querySelector('#handover .handover-turn'),
  handoverTitle: document.querySelector('#handover .handover-title'),
  result: $('result'),
  resultTitle: document.querySelector('#result .result-title'),
  resultSub: document.querySelector('#result .result-sub'),
  confetti: document.querySelector('#result .confetti'),
  rematch: $('rematch'),
  error: $('error'),
  upgradeOpen: $('upgrade-open'),
};

let cards;
let rules;
let monsters = null;  // data/monsters.json（読めなければ null：魔物は出ない）
let upgrades = null;  // data/upgrades.json（読めなければ null：強化は買えない）
let renderer;
let handView;
let anim;
let upgradePanel = null;
let targeting = null;      // 対象を選ぶ（js/ui/Targeting.js）

let game = null;
let seed = 0;
let viewerId = null;       // 画面を見ているプレイヤー（最初の目隠しを開けるまでは null）
let model = null;          // 表示用の状態（演出の進みに合わせて進む）
let queue = [];            // まだ演出していないイベント
let busy = true;           // 演出中・交代画面中は true
let knownCards = new Map(); // cardId → { cardId, type }（viewer の手札の中身）
let lastCastleHit = null;  // 最後に城を削ったもの（"monster" なら魔物の攻撃）。決着の文に使う
let upgradeCounts = {};    // playerId → { upgradeId: 買った回数 }（getState にないので、イベントから数える）
const listeners = [];

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

async function boot() {
  try {
    [cards, rules, monsters, upgrades] = await Promise.all([
      loadJson('data/cards.json'), loadJson('data/rules.json'),
      loadOptionalJson('data/monsters.json'), loadOptionalJson('data/upgrades.json'),
    ]);
  } catch (err) {
    console.error(err);
    showError(`起動できませんでした：${err.message}\n` +
      'リポジトリのルートで「python3 -m http.server」（Windows は「python -m http.server」）を実行し、' +
      'http://localhost:8000 を開いてください。');
    return;
  }

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
    cards, rules, monsters,
    showCoins: Boolean(monsters || upgrades), // コインは魔物か強化があるときだけ出す（自分も相手も同じ）
    onSoldierTap: (s) => toast(soldierInfo(s, { cards, rules, viewerId }), 'info'),
    onMonsterTap: (m) => toast(monsterInfo(m, { monsters }), 'info'),
    onTargetTap: (target) => { if (!busy) targeting.tap(target); },
  });
  handView = new HandView({
    cards, rules, textOpts: { monsters: Boolean(monsters) },
    onPlay: playCard, onDiscard: discard, onNotice: toast,
  });
  anim = new Animations({ renderer, handView, cards, rules, monsters, upgrades });
  targeting = new Targeting({ renderer, handView, onChoose: (cardId, target) => doPlay(cardId, target) });
  if (upgrades && Object.keys(upgrades).length) {
    upgradePanel = new UpgradePanel({ upgrades, onBuy: buyUpgrade, onOpen: refreshUpgrades, onDenied: (r) => toast(r, 'info') });
  } else {
    // 強化のデータがないときも、コインのボタンを押したら理由を出す
    el.upgradeOpen.addEventListener('click', (e) => {
      e.stopPropagation();
      toast('強化のデータ（data/upgrades.json）がないので、強化は買えません', 'info');
    });
  }

  el.endTurn.addEventListener('click', endTurn);
  el.rematch.addEventListener('click', (e) => { e.stopPropagation(); newGame(); });
  // 演出中に画面をタップしたら飛ばす（交代画面・勝敗画面は除く）
  el.app.addEventListener('pointerdown', (e) => {
    if (busy && el.handover.hidden && el.result.hidden && !e.target.closest('#debug-panel, #debug-toggle')) anim.skip();
  }, true);

  if (DEBUG) {
    new DebugPanel({
      cards,
      getGame: () => game,
      getSeed: () => seed,
      getViewerId: () => viewerId,
      onRestart: (s) => newGame(s),
      onChanged: () => {
        cancelTargeting();
        if (!busy) settleSafely();
      },
      onConfigChanged: () => { anim.applyCssTiming(); handView.updateDetail(); },
      notify: toast,
    });
    // コンソールから Game を触れるようにする（デバッグのときだけ）
    window.castlefield = { game: () => game, seed: () => seed, renderer: () => renderer };
  }

  newGame();
}

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

function newGame(seedOverride) {
  for (const [type, h] of listeners.splice(0)) game?.off(type, h);
  anim.skip();
  anim.endSkip();

  seed = seedOverride ?? URL_SEED ?? Math.floor(Math.random() * 2 ** 32);
  queue = [];
  cancelTargeting();
  upgradePanel?.close();
  upgradeCounts = {};
  lastCastleHit = null;
  try {
    const opts = { cards: structuredClone(cards), rules: structuredClone(rules), rng: mulberry32(seed) };
    if (monsters) opts.monsters = structuredClone(monsters);
    if (upgrades) opts.upgrades = structuredClone(upgrades);
    game = new Game(opts);
  } catch (err) {
    console.error(err);
    showError(`ゲームを始められませんでした：${err.message}`);
    return;
  }
  // Game が出すイベントは全部受け取る（演出がないものは Animations が何もしない）
  for (const type of EVENT_TYPES) {
    const h = (payload) => {
      if (type === 'castleDamaged') lastCastleHit = 'castle';
      if (type === 'monsterAttackedCastle') lastCastleHit = 'monster';
      if (type === 'upgradeBought') {
        const counts = (upgradeCounts[payload.playerId] ??= {});
        counts[payload.upgradeId] = (counts[payload.upgradeId] ?? 0) + 1;
      }
      queue.push({ type, payload });
    };
    game.on(type, h);
    listeners.push([type, h]);
  }

  el.result.hidden = true;
  el.confetti.innerHTML = '';
  // 開始前の状態を表示用に覚えてから start() する。p1 の turnStarted で最初の目隠しが出る
  viewerId = null;
  knownCards = new Map();
  model = null; // 前の試合の値（捨てる枚数・決着の理由）を持ちこさない
  model = modelFromState(game.getState(null));
  setBusy(true);
  const res = typeof game.start === 'function' ? game.start() : { ok: true };
  if (!res?.ok) {
    showError(`ゲームを始められませんでした：${reasonText(res?.reason)}`);
    return;
  }
  drainAndSettle();
}

// ---------- 表示用の状態 ----------

function modelFromState(st) {
  const players = {};
  for (const id of st.playerOrder) {
    const p = st.players[id];
    players[id] = {
      castleHp: p.castleHp,
      castleMaxHp: p.castleMaxHp,
      armor: p.armor ?? 0,
      coins: p.coins ?? 0,
      handCount: p.handCount,
      playedThisTurn: p.playedThisTurn,
      cardsPlayedThisTurn: p.cardsPlayedThisTurn ?? 0,
      soldiers: p.soldiers.map((s) => structuredClone(s)),
    };
  }
  return {
    playerOrder: [...st.playerOrder],
    turn: st.turn,
    round: st.round ?? 0,
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
  };
}

/** viewer の手札の中身を覚えておく（引いたカードの種類を知るため） */
function readState() {
  const st = game.getState(viewerId);
  for (const c of st.players[viewerId]?.hand ?? []) knownCards.set(c.cardId, { ...c });
  return st;
}

function lookupCard(cardId) {
  if (!knownCards.has(cardId)) readState();
  return knownCards.get(cardId) ?? null;
}

// ---------- イベントの再生 ----------

function setBusy(value) {
  busy = value;
  el.app.classList.toggle('busy', value);
  handView.setLocked(value);
  if (value) {
    cancelTargeting();
    upgradePanel?.setEnabled(false, { reason: upgradeOffReason(game?.getState(viewerId)) });
    el.endTurn.disabled = true;
    el.endTurn.classList.remove('ready');
    setMessage('');
  }
}

async function drainEvents() {
  setBusy(true);
  while (queue.length) {
    const ev = queue.shift();
    try {
      if (ev.type === 'turnStarted' && ev.payload.playerId !== viewerId) {
        await anim.play(ev, queue, model, { viewerId, lookupCard });
        await handover(ev.payload.playerId, ev.payload.turn);
        continue;
      }
      if (queue.length) setMessage('タップで早送り');
      await anim.play(ev, queue, model, { viewerId, lookupCard });
    } catch (err) {
      console.error(`イベント ${ev.type} の演出に失敗しました`, err);
    }
  }
  anim.endSkip();
}

async function drainAndSettle() {
  try {
    await drainEvents();
    await settle();
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
  const st = readState();
  if (st.phase !== 'gameOver' && st.phase !== 'ready' && st.currentPlayer !== viewerId) {
    // 手番が変わったのに turnStarted が来なかった場合の保険
    await handover(st.currentPlayer, st.turn);
    return settle({ check });
  }
  // デバッグ：演出で進めた値と本当の状態がずれていないか（ずれていたら console.warn('[sync]', ...)）
  if (DEBUG && check && st.phase !== 'gameOver') checkSync(model, st);
  if (model.gameOverReason === 'castleDestroyed' && lastCastleHit === 'monster') model.gameOverReason = 'monsterDestroyed';
  model = modelFromState(st);
  renderer.renderAll(model);
  const me = st.players[viewerId];
  const sameHand = me.hand.length === handView.hand.length &&
    me.hand.every((c, i) => c.cardId === handView.hand[i].cardId);
  if (!sameHand) handView.render(me.hand);
  const blocked = playability(st);
  handView.setPlayability(blocked);

  if (st.phase === 'gameOver') {
    showResult(st.winner);
    return;
  }

  setBusy(false);
  refreshUpgrades();
  if (st.phase === 'discard') {
    const count = model.discardRequired || Math.max(1, me.handCount - (me.maxHand ?? rules.maxHand));
    handView.enterDiscard(count);
    el.endTurn.disabled = true;
    setMessage('捨てるカードを選んでください');
    return;
  }
  handView.exitDiscard();
  el.endTurn.disabled = false;
  const anyPlayable = me.hand.some((c) => !blocked.has(c.cardId));
  el.endTurn.classList.toggle('ready', me.playedThisTurn && !anyPlayable);
  if (!me.playedThisTurn) setMessage('メインのカードを1枚出せます（武器・防御は何枚でも。出さずに終えてもOK）');
  else if (anyPlayable) setMessage('メインは出しました。武器・防御はまだ出せます');
  else setMessage('カードを出しました。「ターン終了」で交代します');
}

/** 手札の各カードが出せないなら、その理由（canPlayCard の結果。付加・防御はメインのあとも出せる） */
function playability(st) {
  const blocked = new Map();
  const me = st.players[viewerId];
  if (st.phase !== 'main') return blocked;
  for (const c of me.hand) {
    if (typeof game.canPlayCard === 'function') {
      const res = game.canPlayCard(c.cardId);
      if (res && !res.ok) blocked.set(c.cardId, reasonText(res.reason));
    } else if (me.playedThisTurn) {
      blocked.set(c.cardId, '');
    }
  }
  return blocked;
}

// ---------- 操作 ----------

function playCard(cardId) {
  if (busy || !game) return;
  targeting.cancel();
  upgradePanel?.close();
  const check = game.canPlayCard(cardId);
  if (check?.ok && check.needsTarget) {
    startTargeting(cardId);
    return;
  }
  doPlay(cardId);
}

/** カードを出す（target を省略すると、対象が1つのときだけ出せる） */
function doPlay(cardId, target) {
  if (busy || !game) return;
  const res = target ? game.playCard(cardId, target) : game.playCard(cardId);
  if (!res?.ok) {
    if (res?.needsTarget) {
      startTargeting(cardId);
      return;
    }
    targeting.cancel();
    handView.deny(cardId);
    toast(reasonText(res?.reason));
    return;
  }
  targeting.cancel();
  drainAndSettle();
}

/** 対象が2つ以上あるカード：盤面の対象を光らせて選んでもらう */
function startTargeting(cardId) {
  const targets = game.getTargets(cardId);
  if (targets.length === 0) {
    targeting.cancel();
    handView.deny(cardId);
    toast(reasonText(game.canPlayCard(cardId)?.reason)); // 出せない理由を Game から出してもらう
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
  if (!upgradePanel || !game) return;
  const st = game.getState(viewerId);
  const me = st.players[viewerId];
  const myTurn = !busy && st.phase === 'main' && st.currentPlayer === viewerId;
  const why = upgradeOffReason(st);
  const status = {};
  for (const id of Object.keys(upgrades)) status[id] = myTurn ? game.canBuyUpgrade(id) : { ok: false, reason: why };
  const anyOk = Object.values(status).some((x) => x.ok);
  upgradePanel.setEnabled(myTurn, { highlight: anyOk, reason: why });
  if (me) upgradePanel.refresh(me.coins ?? 0, status, upgradeCounts[viewerId] ?? {});
}

/** 強化を買えない場面の理由 */
function upgradeOffReason(st) {
  if (st?.phase === 'gameOver') return 'ゲームは終わっています';
  if (st?.phase === 'discard') return '先に手札を捨ててください';
  if (busy) return '演出が終わってから買えます';
  return '強化は自分の番のメインで買えます';
}

function buyUpgrade(upgradeId) {
  if (busy || !game) return;
  cancelTargeting();
  const res = game.buyUpgrade(upgradeId);
  if (!res?.ok) {
    toast(reasonText(res?.reason));
    return;
  }
  upgradePanel.close();
  drainAndSettle();
}

function endTurn() {
  if (busy || !game) return;
  cancelTargeting();
  upgradePanel?.close();
  const res = game.endTurn();
  if (!res?.ok) {
    toast(reasonText(res?.reason));
    return;
  }
  drainAndSettle();
}

async function discard(cardIds) {
  if (busy || !game) return;
  const turnBefore = model.turn;
  const res = game.discard(cardIds);
  if (!res?.ok) {
    toast(reasonText(res?.reason));
    return;
  }
  try {
    await drainEvents();
    // 捨て終わっても次の人の番にならなかったら、こちらでターンを終える
    const st = readState();
    if (st.phase === 'main' && st.currentPlayer === viewerId && model.turn === turnBefore) {
      const again = game.endTurn();
      if (!again?.ok) toast(reasonText(again?.reason));
      await drainEvents();
    }
    await settle();
  } catch (err) {
    recover(err);
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
  el.handover.hidden = false;

  return new Promise((resolve) => {
    const open = (e) => {
      if (e.type === 'keydown' && !['Enter', ' '].includes(e.key)) return;
      el.handover.removeEventListener('click', open);
      window.removeEventListener('keydown', open);
      viewerId = playerId;
      renderer.setViewer(viewerId);
      // 手札は「これから引くカード」を除いて出し、引く演出で1枚ずつ加える
      const st = readState();
      const willDraw = new Set(queue
        .filter((ev) => ev.type === 'cardDrawn' && ev.payload.playerId === viewerId)
        .flatMap((ev) => ev.payload.cardIds));
      model.hand = st.players[viewerId].hand.filter((c) => !willDraw.has(c.cardId));
      renderer.renderAll(model);
      handView.render(model.hand);
      handView.setPlayability(new Map());
      el.handover.hidden = true;
      anim.delay(UI_CONFIG.timing.afterTurnStart).then(resolve);
    };
    el.handover.addEventListener('click', open);
    window.addEventListener('keydown', open);
  });
}

async function showResult(winner) {
  setBusy(true);
  await anim.delay(UI_CONFIG.timing.gameOverDelay);
  el.result.dataset.player = winner;
  el.resultTitle.textContent = `${playerName(winner)}の勝ち！`;
  const how = GAME_OVER_TEXT[model.gameOverReason] ?? '';
  el.resultSub.textContent = `${how ? `${how}　` : ''}${model.turn}ターンで決着`;
  const colors = winner === 'p1'
    ? ['#3b82f6', '#93c5fd', '#fbbf24', '#ffffff']
    : ['#ef4444', '#fca5a5', '#fbbf24', '#ffffff'];
  anim.confetti(el.confetti, colors);
  el.result.hidden = false;
  el.rematch.focus({ preventScroll: true });
}

// ---------- 小物 ----------

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

boot();
