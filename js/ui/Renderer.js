// 盤面（城・レーン・兵士・枚数表示）を描く。
// ゲームの状態は書き換えない。main.js が持つ「表示用の状態」を受け取って描くだけ。

import { playerName } from './text.js';

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
      field: $('field'),
      oppName: $('opp-name'),
      oppHandCount: $('opp-hand-count'),
      turnInfo: $('turn-info'),
      deckPile: $('deck-pile'),
      discardPile: $('discard-pile'),
      deckCount: $('deck-count'),
      discardCount: $('discard-count'),
      castle: { me: $('castle-me'), opp: $('castle-opp') },
      castleLabel: { me: $('castle-me-label'), opp: $('castle-opp-label') },
      lane: { me: $('lane-me'), opp: $('lane-opp') },
    };

    this.buildLanes();

    this.el.field.addEventListener('click', (e) => {
      const el = e.target.closest('.soldier');
      if (!el || !this.onSoldierTap) return;
      const s = this.soldiers.get(el.dataset.id);
      if (s) this.onSoldierTap({ ...s, el: undefined, name: this.cards[s.type]?.name ?? s.type });
    });
  }

  buildLanes() {
    const L = this.rules.laneLength;
    document.documentElement.style.setProperty('--cells', String(L));
    for (const side of ['me', 'opp']) {
      const cells = this.el.lane[side].querySelector('.cells');
      cells.innerHTML = '';
      for (let i = 0; i < L; i++) cells.appendChild(document.createElement('div')).className = 'cell';
    }
  }

  // ---------- 視点 ----------

  /** 誰の視点で描くか。手番のプレイヤーが常に下（自分の城）になる */
  setViewer(viewerId) {
    if (this.viewerId !== viewerId) this.clearSoldiers();
    this.viewerId = viewerId;
    this.el.app.dataset.viewer = viewerId;
    const opp = this.opponentOf(viewerId);
    this.el.oppName.textContent = playerName(opp);
    this.el.castleLabel.me.textContent = `${playerName(viewerId)}の城（あなた）`;
    this.el.castleLabel.opp.textContent = `${playerName(opp)}の城`;
    this.el.lane.me.querySelector('.lane-label').textContent = '▲';
    this.el.lane.opp.querySelector('.lane-label').textContent = '▼';
    // マス番号：自分のレーンは下から、相手のレーンは上から 0,1,2…（兵士の位置と同じ数え方）
    const L = this.rules.laneLength;
    for (const side of ['me', 'opp']) {
      this.el.lane[side].querySelectorAll('.cell').forEach((cell, i) => {
        let no = cell.querySelector('.cell-no');
        if (!no) no = cell.appendChild(document.createElement('span'));
        no.className = 'cell-no';
        no.textContent = String(side === 'me' ? L - 1 - i : i);
      });
    }
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

  laneEl(playerId) {
    return this.el.lane[this.sideOf(playerId)];
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
  }

  bump(el) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  setCastleHp(playerId, hp, { instant = false } = {}) {
    const castle = this.castleEl(playerId);
    const max = this.rules.castleMaxHp;
    const ratio = Math.max(0, Math.min(1, hp / max));
    const fill = castle.querySelector('.hp-fill');
    const lag = castle.querySelector('.hp-lag');
    if (instant) {
      fill.style.transition = lag.style.transition = 'none';
      void fill.offsetWidth;
    }
    fill.style.width = `${ratio * 100}%`;
    lag.style.width = `${ratio * 100}%`;
    if (instant) {
      void fill.offsetWidth;
      fill.style.transition = lag.style.transition = '';
    }
    fill.classList.toggle('mid', ratio <= 0.5 && ratio > 0.25);
    fill.classList.toggle('low', ratio <= 0.25);
    castle.querySelector('.hp-value').textContent = String(Math.max(0, hp));
    castle.querySelector('.hp-max').textContent = `/${max}`;
  }

  // ---------- 兵士 ----------

  /** 兵士の位置 → レーン上の top(%)。城に着いた兵士は相手の城に重なる位置 */
  topPercent(playerId, position) {
    const L = this.rules.laneLength;
    const pos = Math.max(0, Math.min(position, L));
    const fromTop = this.sideOf(playerId) === 'me' ? L - 1 - pos : pos;
    return (fromTop / L) * 100;
  }

  addSoldier(playerId, { soldierId, type, hp, attack, position }, { appear = false } = {}) {
    const def = this.cards[type] ?? {};
    const el = document.createElement('div');
    el.className = `soldier ${type} no-anim`;
    el.dataset.id = soldierId;
    if (appear) el.classList.add('appear');
    el.innerHTML = `<div class="soldier-token"><span class="soldier-mark"></span>` +
      `<span class="soldier-badge soldier-atk"></span><span class="soldier-badge soldier-hp"></span></div>`;
    el.querySelector('.soldier-mark').textContent = (def.name ?? type).charAt(0);
    this.laneEl(playerId).querySelector('.soldier-layer').appendChild(el);
    const s = { el, playerId, soldierId, type, hp: hp ?? def.hp, attack: attack ?? def.attack, position };
    this.soldiers.set(soldierId, s);
    this.updateSoldierBadges(s);
    el.style.top = `${this.topPercent(playerId, position)}%`;
    void el.offsetWidth; // 位置を確定させてからアニメーションを有効にする
    el.classList.remove('no-anim');
    this.layoutStacks();
    return el;
  }

  updateSoldierBadges(s) {
    s.el.querySelector('.soldier-hp').textContent = `❤${Math.max(0, s.hp)}`;
    s.el.querySelector('.soldier-atk').textContent = `⚔${s.attack}`;
  }

  soldierEl(soldierId) {
    return this.soldiers.get(soldierId)?.el ?? null;
  }

  moveSoldier(soldierId, position) {
    const s = this.soldiers.get(soldierId);
    if (!s) return;
    s.position = position;
    s.el.style.top = `${this.topPercent(s.playerId, position)}%`;
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

  /** 同じマスにいる兵士を横に少しずつずらす */
  layoutStacks() {
    const groups = new Map();
    for (const s of this.soldiers.values()) {
      const key = `${s.playerId}:${Math.min(s.position, this.rules.laneLength)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    for (const list of groups.values()) {
      const step = list.length > 3 ? 14 : 22;
      list.forEach((s, i) => s.el.style.setProperty('--offset', `${(i - (list.length - 1) / 2) * step}px`));
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
        s.el.classList.add('no-anim');
        this.moveSoldier(st.soldierId, st.position);
        this.setSoldierHp(st.soldierId, st.hp);
        s.attack = st.attack;
        this.updateSoldierBadges(s);
        void s.el.offsetWidth;
        s.el.classList.remove('no-anim', 'hit', 'appear');
      }
    }
    for (const id of [...this.soldiers.keys()]) if (!alive.has(id)) this.removeSoldier(id);
    this.layoutStacks();
  }
}
