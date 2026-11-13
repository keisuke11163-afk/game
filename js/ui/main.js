// 起動と操作のつなぎ役。タップを Game に伝え、返ってきたイベントを Renderer に渡す。

import { Game } from '../logic/Game.js';
import { Renderer } from './renderer.js';

const HELP_MESSAGE = 'カードをタップで選択、もう一度タップで使用';

let config = null;
let game = null;
let busy = false;           // アニメーション中は操作を受け付けない
let overlayMode = null;     // 'handover' | 'gameover'
let selectedUid = null;

const renderer = new Renderer({
  onCardTap: handleCardTap,
  onEndTurn: handleEndTurn,
  onOverlayTap: handleOverlayTap,
});

async function loadConfig() {
  // cards.json を書き換えたらすぐ反映されるよう、キャッシュを使わない
  const res = await fetch('cards.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`cards.json を読み込めませんでした (${res.status})`);
  return res.json();
}

function newGame() {
  game = new Game(structuredClone(config));
  renderer.setLaneLength(game.rules.laneLength);
  selectedUid = null;
  showHandover();
}

function showHandover() {
  overlayMode = 'handover';
  const player = game.currentPlayer;
  renderer.showOverlay(`${player.name}の番です`, 'タップして開始', player.index);
}

async function handleOverlayTap() {
  if (busy) return;
  if (overlayMode === 'gameover') {
    newGame();
    return;
  }
  if (overlayMode !== 'handover') return;

  overlayMode = null;
  busy = true;
  try {
    const viewer = game.currentIndex;
    renderer.setViewer(viewer);
    renderer.setSelected(null);
    renderer.renderAll(game.getView(viewer)); // 進軍する前の盤面を出してから
    renderer.setEndTurnEnabled(false);
    renderer.hideOverlay();
    renderer.setMessage('進軍中…');
    await wait(250);

    const events = game.startTurn();
    await renderer.playEvents(events, game.getView(viewer));
  } finally {
    busy = false;
  }
  afterAction();
}

async function handleCardTap(uid) {
  if (busy || !game || game.phase !== 'main' || game.hasPlayedCard) return;

  if (selectedUid !== uid) {
    // 1回目のタップ：選ぶ
    selectedUid = uid;
    renderer.setSelected(uid);
    const card = game.currentPlayer.hand.find((c) => c.uid === uid);
    if (card) renderer.setMessage(`${card.name}：${card.description}　もう一度タップで使用`);
    return;
  }

  // 2回目のタップ：使う
  selectedUid = null;
  renderer.setSelected(null);
  busy = true;
  try {
    const events = game.playCard(uid);
    const view = game.getView(game.currentIndex);
    renderer.renderHand(view);
    renderer.setEndTurnEnabled(false);
    await renderer.playEvents(events, view);
  } finally {
    busy = false;
  }
  afterAction();
}

function handleEndTurn() {
  if (busy || !game || game.phase !== 'main') return;
  selectedUid = null;
  game.endTurn();
  showHandover();
}

/** 行動のあとの共通処理：勝敗チェックとメッセージ */
function afterAction() {
  if (game.phase === 'gameover') {
    renderer.setEndTurnEnabled(false);
    renderer.setMessage('ゲーム終了');
    setTimeout(() => {
      overlayMode = 'gameover';
      const winner = game.players[game.winnerIndex];
      renderer.showOverlay(`${winner.name}の勝ち！`, 'タップでもう一度遊ぶ', winner.index);
    }, 900);
    return;
  }
  renderer.setEndTurnEnabled(true);
  renderer.setMessage(
    game.hasPlayedCard ? 'カードを使いました。「ターン終了」を押してください' : HELP_MESSAGE,
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function start() {
  try {
    config = await loadConfig();
    newGame();
  } catch (err) {
    console.error(err);
    renderer.showError(
      `起動できませんでした：${err.message}\n` +
        'index.html のあるフォルダで「python -m http.server」を実行し、http://localhost:8000 を開いてください。',
    );
  }
}

start();
