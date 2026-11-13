// 起動と、Game と画面のつなぎ役。
// - data/ の JSON を読み、new Game({ cards, rules, rng }) を作る
// - Game のイベントをキューにため、届いた順に Animations で演出する
// - 演出中は操作を受け付けない（画面タップで演出を飛ばせる）
// UI はゲームの状態を直接書き換えない。getState / playCard / discard / endTurn / on / off と、
// 開始の start()、出せるかを前もって調べる canPlayCard()（読むだけ）を使う。

import { Game } from './game/Game.js';
import { Renderer } from './ui/Renderer.js';
import { HandView } from './ui/HandView.js';
import { Animations } from './ui/Animations.js';
import { DebugPanel } from './ui/DebugPanel.js';
import { UI_CONFIG } from './ui/config.js';
import { playerName, reasonText } from './ui/text.js';

const EVENT_TYPES = [
  'turnStarted', 'cardDrawn', 'deckShuffled', 'cardPlayed', 'discardRequired', 'cardDiscarded',
  'soldierDeployed', 'soldierMoved', 'soldierDamaged', 'soldierDestroyed', 'spellCast',
  'castleDamaged', 'castleHealed', 'gameOver',
];

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
};

let cards;
let rules;
let renderer;
let handView;
let anim;

let game = null;
let seed = 0;
let viewerId = null;       // 画面を見ているプレイヤー（最初の目隠しを開けるまでは null）
let model = null;          // 表示用の状態（演出の進みに合わせて進む）
let queue = [];            // まだ演出していないイベント
let busy = true;           // 演出中・交代画面中は true
let knownCards = new Map(); // cardId → { cardId, type }（viewer の手札の中身）
const listeners = [];

// ---------- 起動 ----------

async function loadJson(path) {
  // JSON を直してリロードするだけで反映されるよう、キャッシュを使わない
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} を読み込めませんでした（${res.status}）`);
  return res.json();
}

async function boot() {
  try {
    [cards, rules] = await Promise.all([loadJson('data/cards.json'), loadJson('data/rules.json')]);
  } catch (err) {
    console.error(err);
    showError(`起動できませんでした：${err.message}\n` +
      'リポジトリのルートで「python3 -m http.server」（Windows は「python -m http.server」）を実行し、' +
      'http://localhost:8000 を開いてください。');
    return;
  }

  renderer = new Renderer({ cards, rules, onSoldierTap: showSoldierInfo });
  handView = new HandView({ cards, rules, onPlay: playCard, onDiscard: discard, onNotice: toast });
  anim = new Animations({ renderer, handView, cards, rules });

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
      onChanged: () => { if (!busy) settle(); },
      onConfigChanged: () => { anim.applyCssTiming(); handView.updateDetail(); },
      notify: toast,
    });
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
  try {
    game = new Game({ cards: structuredClone(cards), rules: structuredClone(rules), rng: mulberry32(seed) });
  } catch (err) {
    console.error(err);
    showError(`ゲームを始められませんでした：${err.message}`);
    return;
  }
  for (const type of EVENT_TYPES) {
    const h = (payload) => queue.push({ type, payload });
    game.on(type, h);
    listeners.push([type, h]);
  }

  el.result.hidden = true;
  el.confetti.innerHTML = '';
  // 開始前の状態を表示用に覚えてから start() する。p1 の turnStarted で最初の目隠しが出る
  viewerId = null;
  knownCards = new Map();
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
  for (const id of ['p1', 'p2']) {
    const p = st.players[id];
    players[id] = {
      castleHp: p.castleHp,
      handCount: p.handCount,
      playedThisTurn: p.playedThisTurn,
      soldiers: p.soldiers.map((s) => ({ ...s })),
    };
  }
  return {
    turn: st.turn,
    currentPlayer: st.currentPlayer,
    phase: st.phase,
    winner: st.winner,
    deckCount: st.deckCount,
    discardCount: st.discardCount,
    discardRequired: model?.discardRequired ?? 0,
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
  await drainEvents();
  await settle();
}

/** 演出が終わったら、本当の状態（getState）で画面を合わせ、次の操作を待つ */
async function settle() {
  const st = readState();
  if (st.phase !== 'gameOver' && st.phase !== 'ready' && st.currentPlayer !== viewerId) {
    // 手番が変わったのに turnStarted が来なかった場合の保険
    await handover(st.currentPlayer, st.turn);
    return settle();
  }
  const discardRequired = model.discardRequired;
  model = modelFromState(st);
  model.discardRequired = discardRequired;
  renderer.renderAll(model);
  const me = st.players[viewerId];
  const sameHand = me.hand.length === handView.hand.length &&
    me.hand.every((c, i) => c.cardId === handView.hand[i].cardId);
  if (!sameHand) handView.render(me.hand);
  handView.setPlayability(playability(st));

  if (st.phase === 'gameOver') {
    showResult(st.winner);
    return;
  }

  setBusy(false);
  if (st.phase === 'discard') {
    const count = model.discardRequired || Math.max(1, me.handCount - rules.maxHand);
    handView.enterDiscard(count);
    el.endTurn.disabled = true;
    setMessage('捨てるカードを選んでください');
    return;
  }
  handView.exitDiscard();
  el.endTurn.disabled = false;
  el.endTurn.classList.toggle('ready', me.playedThisTurn);
  setMessage(me.playedThisTurn
    ? 'カードを出しました。「ターン終了」で交代します'
    : 'カードを1枚出せます（出さずに終えてもOK）');
}

/** 手札の各カードが出せないなら、その理由（canPlayCard がなければ「もう出した」だけ見る） */
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
  const res = game.playCard(cardId);
  if (!res?.ok) {
    handView.deny(cardId);
    toast(reasonText(res?.reason));
    return;
  }
  drainAndSettle();
}

function endTurn() {
  if (busy || !game) return;
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
  await drainEvents();
  // 捨て終わっても次の人の番にならなかったら、こちらでターンを終える
  const st = readState();
  if (st.phase === 'main' && st.currentPlayer === viewerId && model.turn === turnBefore) {
    const again = game.endTurn();
    if (!again?.ok) toast(reasonText(again?.reason));
    await drainEvents();
  }
  await settle();
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
  el.resultSub.textContent = `${model.turn}ターンで決着`;
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

function showSoldierInfo(s) {
  const owner = s.playerId === viewerId ? 'あなた' : playerName(s.playerId);
  toast(`${s.name}（${owner}）HP${s.hp}・攻撃${s.attack}・位置${s.position}/${rules.laneLength}`, 'info');
}

function showError(text) {
  el.error.textContent = text;
  el.error.hidden = false;
}

boot();
