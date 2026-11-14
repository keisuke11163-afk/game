// 盤面（城・1本の道・兵士・枚数表示）を描く。
// ゲームの状態は書き換えない。main.js が持つ「表示用の状態」を受け取って描くだけ。
//
// 道は1本。マスの数は rules.laneLength から読む（決め打ちしない）。
// 兵士は CLAUDE.md の「道のマス番号」（p1 の城側が 0）に直して置く：
//   p1 の兵士 → position、p2 の兵士 → laneLength - 1 - position
// 画面では、見ている人（手番の人）の城が下になるように上下を入れ替える。

import { UI_CONFIG } from './config.js';
import { playerName } from './text.js';
import { PLAYER_COLOR, src, aspect, castleKey, unitKey } from './assets.js';

const $ = (id) => document.getElementById(id);

export class Renderer {
  /**
   * @param {{ cards: object, rules: object, onSoldierTap?: (info: object) => void }} opts
   */
  constructor({ cards, rules, onSoldierTap }) {
    this.cards = cards;
    this.rules = rules;
    this.onSoldierTap = onSoldierTap;
    this.viewerId = 'p1';
    /** soldierId → { el, playerId, type, hp, attack, position } */
    this.soldiers = new Map();

    this.el = {
      app: $('app'),
      board: $('board'),
      squares: $('squares'),
      units: $('units'),
      oppHandCount: $('opp-hand-count'),
      turnInfo: $('turn-info'),
      deckPile: $('deck-pile'),
      discardPile: $('discard-pile'),
      deckCount: $('deck-count'),
      discardCount: $('discard-count'),
      castle: { me: $('castle-me'), opp: $('castle-opp') },
    };

    this.buildSquares();
    this.layoutCastles();

    this.el.units.addEventListener('click', (e) => {
      const el = e.target.closest('.soldier');
      if (!el || !this.onSoldierTap) return;
      const s = this.soldiers.get(el.dataset.id);
      if (s) this.onSoldierTap({ ...s, el: undefined, name: this.cards[s.type]?.name ?? s.type });
    });
  }

  get laneLength() {
    return this.rules.laneLength;
  }

  /** 真ん中のマス（道のマス番号）。マスが偶数で真ん中が1つに決まらなければ null */
  get centerSquare() {
    const L = this.laneLength;
    return L % 2 === 1 ? (L - 1) / 2 : null;
  }

  // ---------- 位置の計算 ----------

  /**
   * 画面上の位置（盤面の幅・高さに対する割合）。row は下から数えたマスの段（0 = いちばん下）
   * @returns {{ x: number, y: number }}
   */
  rowPoint(row) {
    const r = UI_CONFIG.board.road;
    const L = this.laneLength;
    const t = L > 1 ? row / (L - 1) : 0.5;
    const y = r.bottom - t * (r.bottom - r.top);
    const x = r.x + r.sway * Math.sin((t + r.swayPhase) * Math.PI * 2);
    return { x, y };
  }

  /** 道のマス番号 → 下から数えた段。見ている人の城側が下 */
  squareToRow(square) {
    return this.viewerId === 'p1' ? square : this.laneLength - 1 - square;
  }

  /** 兵士の position → 道のマス番号（CLAUDE.md の式） */
  squareOf(playerId, position) {
    return playerId === 'p1' ? position : this.laneLength - 1 - position;
  }

  /** 兵士の位置（割合）。城に着いた兵士（position >= laneLength）は相手の城の前 */
  soldierPoint(playerId, position) {
    if (position >= this.laneLength) {
      const c = UI_CONFIG.board.castle;
      const enemyIsTop = this.sideOf(playerId) === 'me';
      return { x: c.x, y: enemyIsTop ? c.topY + c.reachY : c.bottomY - c.reachY };
    }
    return this.rowPoint(this.squareToRow(this.squareOf(playerId, Math.max(0, position))));
  }

  /** 割合 → 盤面の中の px */
  toPx({ x, y }) {
    const r = this.el.board.getBoundingClientRect();
    return { x: x * r.width, y: y * r.height };
  }

  // ---------- 盤面の部品 ----------

  buildSquares() {
    const box = this.el.squares;
    box.innerHTML = '';
    const size = UI_CONFIG.board.squareSize;
    box.style.setProperty('--square-size', `${size}px`);
    for (let sq = 0; sq < this.laneLength; sq++) {
      const el = document.createElement('div');
      el.className = 'square';
      el.dataset.square = String(sq);
      if (sq === this.centerSquare) el.classList.add('center');
      el.innerHTML = `<span class="square-no">${sq}</span>`;
      box.appendChild(el);
    }
    this.placeSquares();
  }

  placeSquares() {
    for (const el of this.el.squares.children) {
      const p = this.rowPoint(this.squareToRow(Number(el.dataset.square)));
      el.style.left = `${p.x * 100}%`;
      el.style.top = `${p.y * 100}%`;
    }
  }

  layoutCastles() {
    const c = UI_CONFIG.board.castle;
    const root = this.el.board.style;
    root.setProperty('--castle-h', `${c.height * 100}%`);
    root.setProperty('--castle-x', `${c.x * 100}%`);
    root.setProperty('--castle-top-y', `${c.topY * 100}%`);
    root.setProperty('--castle-bottom-y', `${c.bottomY * 100}%`);
    root.setProperty('--sign-left', `${(0.5 + c.signOffset) * 100}%`);
    root.setProperty('--sign-h', `${c.signSize * 100}%`);
    root.setProperty('--unit-size', `${UI_CONFIG.board.unitSize}px`);
    root.setProperty('--castle-aspect', String(1 / aspect(castleKey('blue'))));
  }

  // ---------- 視点 ----------

  /** 誰の視点で描くか。手番のプレイヤーが常に下（自分の城）になる */
  setViewer(viewerId) {
    if (this.viewerId !== viewerId) this.clearSoldiers();
    this.viewerId = viewerId;
    this.el.app.dataset.viewer = viewerId;
    const opp = this.opponentOf(viewerId);
    for (const [side, id] of [['me', viewerId], ['opp', opp]]) {
      const castle = this.el.castle[side];
      castle.dataset.player = id;
      castle.dataset.color = PLAYER_COLOR[id];
      castle.querySelector('.castle-img').src = src(castleKey(PLAYER_COLOR[id]));
      castle.querySelector('.castle-name').textContent = side === 'me' ? `${playerName(id)}\n（あなた）` : playerName(id);
    }
    this.placeSquares();
  }

  opponentOf(playerId) {
    return playerId === 'p1' ? 'p2' : 'p1';
  }

  sideOf(playerId) {
    return playerId === this.viewerId ? 'me' : 'opp';
  }

  castleEl(playerId) {
    return this.el.castle[this.sideOf(playerId)];
  }

  /** 演出の的にする要素（城の絵） */
  castleImgEl(playerId) {
    return this.castleEl(playerId).querySelector('.castle-img');
  }

  squareEl(square) {
    return this.el.squares.querySelector(`.square[data-square="${square}"]`);
  }

  // ---------- まとめて描く ----------

  /** @param {object} model main.js の表示用の状態 */
  renderAll(model) {
    this.setTurnInfo(model.turn);
    this.setPiles(model.deckCount, model.discardCount);
    const opp = this.opponentOf(this.viewerId);
    this.setOppHandCount(model.players[opp].handCount);
    for (const id of ['p1', 'p2']) this.setCastleHp(id, model.players[id].castleHp, { instant: true });
    this.syncSoldiers(model);
  }

  setTurnInfo(turn) {
    this.el.turnInfo.textContent = `ターン ${turn}`;
  }

  setPiles(deckCount, discardCount, { bumpDeck = false, bumpDiscard = false } = {}) {
    this.el.deckCount.textContent = String(deckCount);
    this.el.discardCount.textContent = String(discardCount);
    if (bumpDeck) this.bump(this.el.deckPile);
    if (bumpDiscard) this.bump(this.el.discardPile);
  }

  setOppHandCount(count) {
    this.el.oppHandCount.textContent = String(count);
    this.el.oppHandCount.closest('.opp-hand').dataset.count = String(Math.min(count, 3));
  }

  bump(el) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  setCastleHp(playerId, hp, { instant = false } = {}) {
    const castle = this.castleEl(playerId);
    const max = this.rules.castleMaxHp;
    const value = castle.querySelector('.hp-value');
    const shown = Math.max(0, hp);
    const changed = value.textContent !== String(shown);
    value.textContent = String(shown);
    castle.classList.toggle('low', hp / max <= 0.25);
    if (changed && !instant) this.bump(castle.querySelector('.hp-sign'));
  }

  // ---------- 兵士 ----------

  addSoldier(playerId, { soldierId, type, hp, attack, position }, { appear = false } = {}) {
    const def = this.cards[type] ?? {};
    const el = document.createElement('div');
    el.className = `soldier ${type} ${this.sideOf(playerId)}`;
    el.dataset.id = soldierId;
    el.dataset.player = playerId;
    if (appear) el.classList.add('appear');
    el.innerHTML =
      '<div class="soldier-body"><img class="unit-img" alt=""></div>' +
      '<div class="badges"><span class="badge hp"><i class="icon heart"></i><b class="outlined"></b></span>' +
      '<span class="badge atk"><i class="icon sword"></i><b class="outlined"></b></span></div>';
    el.querySelector('.unit-img').src = src(unitKey(type, PLAYER_COLOR[playerId]));
    el.querySelector('.unit-img').alt = def.name ?? type;
    this.el.units.appendChild(el);
    const s = { el, playerId, soldierId, type, hp: hp ?? def.hp, attack: attack ?? def.attack, position, offset: 0 };
    this.soldiers.set(soldierId, s);
    this.updateSoldierBadges(s);
    this.layoutStacks();
    return el;
  }

  updateSoldierBadges(s) {
    s.el.querySelector('.badge.hp b').textContent = String(Math.max(0, s.hp));
    s.el.querySelector('.badge.atk b').textContent = String(s.attack);
  }

  soldierEl(soldierId) {
    return this.soldiers.get(soldierId)?.el ?? null;
  }

  soldier(soldierId) {
    return this.soldiers.get(soldierId) ?? null;
  }

  /** 兵士の今の位置（盤面の中の px。重なりのずれを含む） */
  soldierPx(soldierId) {
    const s = this.soldiers.get(soldierId);
    if (!s) return null;
    const p = this.toPx(this.soldierPoint(s.playerId, s.position));
    return { x: p.x + s.offset, y: p.y };
  }

  moveSoldier(soldierId, position) {
    const s = this.soldiers.get(soldierId);
    if (!s) return;
    s.position = position;
    this.placeSoldier(s);
  }

  placeSoldier(s) {
    const p = this.soldierPoint(s.playerId, s.position);
    s.el.style.left = `calc(${p.x * 100}% + ${s.offset}px)`;
    s.el.style.top = `${p.y * 100}%`;
    // 下にいる兵士ほど手前に描く
    s.el.style.zIndex = String(10 + Math.round(p.y * 100));
  }

  setSoldierHp(soldierId, hp) {
    const s = this.soldiers.get(soldierId);
    if (!s) return;
    s.hp = hp;
    this.updateSoldierBadges(s);
  }

  /** 画面から兵士を外す（消える演出は Animations が先にやる） */
  removeSoldier(soldierId) {
    const s = this.soldiers.get(soldierId);
    if (!s) return;
    this.soldiers.delete(soldierId);
    s.el.remove();
    this.layoutStacks();
  }

  clearSoldiers() {
    for (const s of this.soldiers.values()) s.el.remove();
    this.soldiers.clear();
  }

  /** 同じマスにいる兵士を横に少しずつずらして重ねる（どちらのプレイヤーの兵士もまとめて数える） */
  layoutStacks() {
    const groups = new Map();
    for (const s of this.soldiers.values()) {
      const key = s.position >= this.laneLength
        ? `castle:${s.playerId}`
        : `sq:${this.squareOf(s.playerId, Math.max(0, s.position))}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    const step = UI_CONFIG.board.stackOffset;
    for (const list of groups.values()) {
      // 自分の兵士を右、相手の兵士を左に寄せて、敵味方が混ざって見えないようにする
      list.sort((a, b) => (a.playerId === this.viewerId) - (b.playerId === this.viewerId));
      const w = list.length > 3 ? step * 0.7 : step;
      list.forEach((s, i) => {
        s.offset = (i - (list.length - 1) / 2) * w;
        this.placeSoldier(s);
      });
    }
  }

  /** 表示用の状態に兵士を合わせる（足りなければ作り、余れば消す。動きはつけない） */
  syncSoldiers(model) {
    const alive = new Set();
    for (const playerId of ['p1', 'p2']) {
      for (const st of model.players[playerId].soldiers) {
        alive.add(st.soldierId);
        const s = this.soldiers.get(st.soldierId);
        if (!s) {
          this.addSoldier(playerId, st);
          continue;
        }
        s.position = st.position;
        s.hp = st.hp;
        s.attack = st.attack;
        this.updateSoldierBadges(s);
        s.el.classList.remove('hit', 'appear', 'dying', 'arrived');
      }
    }
    for (const id of [...this.soldiers.keys()]) if (!alive.has(id)) this.removeSoldier(id);
    this.layoutStacks();
  }
}
