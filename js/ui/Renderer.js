// 盤面（城・道・兵士・魔物・枚数表示）を描く。
// ゲームの状態は書き換えない。main.js が持つ「表示用の状態」を受け取って描くだけ。
//
// 道は1本（rules.laneLength マス）。画面では、相手の兵士を左の列・自分の兵士を右の列に置く。
// どちらの列も同じ道の同じマス（上が相手の城側）なので、横にならんだ兵士は同じマスにいる。
// 真ん中のマス（floor(laneLength / 2)）は魔物の居場所。魔物は道のまん中に重ねて描く。

import { playerName } from './text.js';
import { ELEMENT_LOOK, STATUS_ICON, ICON, soldierMark, weaponIcon, monsterIcon } from './look.js';

const $ = (id) => document.getElementById(id);

export class Renderer {
  /**
   * @param {{ cards: object, rules: object, monsters?: object,
   *           onSoldierTap?: (info: object) => void,
   *           onMonsterTap?: (info: object) => void,
   *           onTargetTap?: (target: object|null) => void }} opts
   *   onTargetTap：対象を選んでいるときに盤面がタップされたら呼ぶ（光っていない所なら null）
   */
  constructor({ cards, rules, monsters = null, onSoldierTap, onMonsterTap, onTargetTap }) {
    this.cards = cards;
    this.rules = rules;
    this.monsterDefs = monsters;
    this.onSoldierTap = onSoldierTap;
    this.onMonsterTap = onMonsterTap;
    this.onTargetTap = onTargetTap;
    this.viewerId = 'p1';
    this.playerOrder = ['p1', 'p2'];
    /** soldierId → { el, playerId, type, hp, attack, position, weapon, element, shield, statuses } */
    this.soldiers = new Map();
    /** monsterId → { el, ...魔物の状態 } */
    this.monsters = new Map();
    /** 対象を選んでいるときの、光らせている対象（null なら選んでいない） */
    this.targets = null;

    this.el = {
      app: $('app'),
      board: $('board'),
      field: $('field'),
      oppName: $('opp-name'),
      oppHandCount: $('opp-hand-count'),
      oppCoins: $('opp-coins'),
      myCoins: $('my-coins'),
      turnInfo: $('turn-info'),
      deckPile: $('deck-pile'),
      discardPile: $('discard-pile'),
      deckCount: $('deck-count'),
      discardCount: $('discard-count'),
      castle: { me: $('castle-me'), opp: $('castle-opp') },
      castleLabel: { me: $('castle-me-label'), opp: $('castle-opp-label') },
      lane: { me: $('lane-me'), opp: $('lane-opp') },
      monsterLayer: $('monster-layer'),
    };
    this.el.oppCoins.hidden = !this.monsterDefs;

    this.buildLanes();

    // 盤面のタップ：対象を選んでいるときは対象を、そうでなければ兵士・魔物の情報を出す
    this.el.board.addEventListener('click', (e) => {
      if (this.targets) {
        const target = this.targetFromEl(e.target);
        this.onTargetTap?.(target);
        return;
      }
      const sEl = e.target.closest('.soldier');
      if (sEl) {
        const s = this.soldiers.get(sEl.dataset.id);
        if (s) this.onSoldierTap?.({ ...s, el: undefined });
        return;
      }
      const mEl = e.target.closest('.monster');
      if (mEl) {
        const m = this.monsters.get(mEl.dataset.id);
        if (m) this.onMonsterTap?.({ ...m, el: undefined });
      }
    });
  }

  get laneLength() {
    return this.rules.laneLength;
  }

  /** 道の真ん中のマス番号（魔物の居場所） */
  get middleSquare() {
    return Math.floor(this.laneLength / 2);
  }

  buildLanes() {
    const L = this.laneLength;
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
    if (this.viewerId !== viewerId) {
      this.clearSoldiers();
      this.clearMonsters();
    }
    this.viewerId = viewerId;
    this.el.app.dataset.viewer = viewerId;
    const opp = this.opponentOf(viewerId);
    this.el.oppName.textContent = playerName(opp);
    this.el.castleLabel.me.textContent = `${playerName(viewerId)}の城（あなた）`;
    this.el.castleLabel.opp.textContent = `${playerName(opp)}の城`;
    this.el.lane.me.querySelector('.lane-label').textContent = '▲';
    this.el.lane.opp.querySelector('.lane-label').textContent = '▼';
    // マス番号：自分の城の前を 0 として数える（兵士の位置と同じ数え方）。真ん中のマスは魔物の居場所
    const L = this.laneLength;
    const midRow = this.rowOfSquare(this.middleSquare);
    for (const side of ['me', 'opp']) {
      this.el.lane[side].querySelectorAll('.cell').forEach((cell, row) => {
        let no = cell.querySelector('.cell-no');
        if (!no) no = cell.appendChild(document.createElement('span'));
        no.className = 'cell-no';
        no.textContent = String(L - 1 - row);
        cell.classList.toggle('mid', row === midRow);
      });
    }
    const spot = this.el.monsterLayer;
    spot.style.setProperty('--row', String(midRow));
  }

  opponentOf(playerId) {
    return this.playerOrder.find((id) => id !== playerId) ?? (playerId === 'p1' ? 'p2' : 'p1');
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

  /** 道のマス番号（players[0] の城側が 0）→ 上から数えた行。2人なら players[0] は p1 */
  rowOfSquare(square) {
    const L = this.laneLength;
    const viewerPos = this.viewerId === this.playerOrder[0] ? square : L - 1 - square;
    return L - 1 - viewerPos;
  }

  // ---------- まとめて描く ----------

  /** @param {object} model main.js の表示用の状態 */
  renderAll(model) {
    if (model.playerOrder) this.playerOrder = model.playerOrder;
    this.setTurnInfo(model.turn, model.round);
    this.setPiles(model.deckCount, model.discardCount);
    const opp = this.opponentOf(this.viewerId);
    this.setOppHandCount(model.players[opp].handCount);
    for (const id of this.playerOrder) {
      const p = model.players[id];
      this.setCastleHp(id, p.castleHp, { instant: true, max: p.castleMaxHp });
      this.setArmor(id, p.armor);
      this.setCoins(id, p.coins);
    }
    this.syncSoldiers(model);
    this.syncMonsters(model);
  }

  setTurnInfo(turn, round) {
    this.el.turnInfo.textContent = round ? `${round}周目・ターン${turn}` : `ターン ${turn}`;
  }

  setPiles(deckCount, discardCount, { bumpDeck = false, bumpDiscard = false } = {}) {
    this.el.deckCount.textContent = String(deckCount ?? 0);
    this.el.discardCount.textContent = String(discardCount ?? 0);
    if (bumpDeck) this.bump(this.el.deckPile);
    if (bumpDiscard) this.bump(this.el.discardPile);
  }

  setOppHandCount(count) {
    this.el.oppHandCount.textContent = String(count);
  }

  /** コインの表示（相手は上のバー、自分は「強化」ボタン） */
  setCoins(playerId, coins, { bump = false } = {}) {
    const el = playerId === this.viewerId ? this.el.myCoins : this.el.oppCoins.querySelector('b');
    el.textContent = String(coins ?? 0);
    if (bump) this.bump(playerId === this.viewerId ? $('upgrade-open') : this.el.oppCoins);
  }

  coinEl(playerId) {
    return playerId === this.viewerId ? $('upgrade-open') : this.el.oppCoins;
  }

  bump(el) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  setCastleHp(playerId, hp, { instant = false, max } = {}) {
    const castle = this.castleEl(playerId);
    if (max) castle.dataset.max = String(max);
    const maxHp = Number(castle.dataset.max) || this.rules.castleMaxHp;
    const ratio = Math.max(0, Math.min(1, hp / maxHp));
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
    castle.querySelector('.hp-max').textContent = `/${maxHp}`;
  }

  /** 城壁（armor）の表示 */
  setArmor(playerId, armor) {
    const castle = this.castleEl(playerId);
    const badge = castle.querySelector('.castle-armor');
    const on = armor > 0;
    castle.classList.toggle('armored', on);
    badge.hidden = !on;
    badge.textContent = on ? `${ICON.armor}城壁${armor}` : '';
  }

  // ---------- 兵士 ----------

  /** 兵士の位置 → 道の上の top(%)。城に着いた兵士は相手の城に重なる位置 */
  topPercent(playerId, position) {
    const L = this.laneLength;
    const pos = Math.max(0, Math.min(position, L));
    const fromTop = this.sideOf(playerId) === 'me' ? L - 1 - pos : pos;
    return (fromTop / L) * 100;
  }

  addSoldier(playerId, st, { appear = false } = {}) {
    const def = this.cards[st.type] ?? {};
    const el = document.createElement('div');
    el.className = `soldier ${st.type} no-anim`;
    el.dataset.id = st.soldierId;
    if (appear) el.classList.add('appear');
    el.innerHTML = '<div class="soldier-token"><span class="soldier-mark"></span>' +
      '<span class="soldier-badge soldier-atk"></span><span class="soldier-badge soldier-hp"></span>' +
      '<span class="soldier-weapon"></span><span class="soldier-shield"></span><span class="soldier-status"></span></div>';
    el.querySelector('.soldier-mark').textContent = soldierMark(st.type, def);
    this.laneEl(playerId).querySelector('.soldier-layer').appendChild(el);
    const s = {
      el,
      playerId,
      soldierId: st.soldierId,
      type: st.type,
      hp: st.hp ?? def.hp,
      attack: st.attack ?? def.attack,
      position: st.position,
      weapon: st.weapon ?? null,
      element: st.element ?? null,
      shield: st.shield ?? 0,
      statuses: { poison: st.statuses?.poison ?? null, frozen: st.statuses?.frozen ?? 0 },
    };
    this.soldiers.set(st.soldierId, s);
    this.updateSoldierBadges(s);
    el.style.top = `${this.topPercent(playerId, st.position)}%`;
    void el.offsetWidth; // 位置を確定させてからアニメーションを有効にする
    el.classList.remove('no-anim');
    this.layoutStacks();
    return el;
  }

  /** 兵士の見た目を、持っている値（HP・攻撃・武器・盾・状態異常）に合わせる */
  updateSoldierBadges(s) {
    const q = (sel) => s.el.querySelector(sel);
    q('.soldier-hp').textContent = `❤${Math.max(0, s.hp)}`;
    q('.soldier-atk').textContent = `⚔${s.attack}`;
    const look = ELEMENT_LOOK[s.element];
    if (look) s.el.style.setProperty('--element', look.color);
    else s.el.style.removeProperty('--element');
    s.el.classList.toggle('has-element', Boolean(look));
    const weapon = q('.soldier-weapon');
    weapon.hidden = !s.weapon;
    weapon.textContent = s.weapon ? weaponIcon(s.weapon, s.element) : '';
    const shield = q('.soldier-shield');
    shield.hidden = !(s.shield > 0);
    shield.textContent = s.shield > 0 ? `${ICON.shield}${s.shield}` : '';
    const poison = s.statuses?.poison;
    const frozen = s.statuses?.frozen > 0;
    const status = q('.soldier-status');
    status.textContent = `${poison ? STATUS_ICON.poison : ''}${frozen ? STATUS_ICON.frozen : ''}`;
    status.hidden = !poison && !frozen;
    s.el.classList.toggle('poisoned', Boolean(poison));
    s.el.classList.toggle('frozen', frozen);
  }

  soldierEl(soldierId) {
    return this.soldiers.get(soldierId)?.el ?? null;
  }

  soldier(soldierId) {
    return this.soldiers.get(soldierId) ?? null;
  }

  /** 兵士の値を一部だけ変えて描き直す（例：{ shield: 3 }） */
  updateSoldier(soldierId, patch) {
    const s = this.soldiers.get(soldierId);
    if (!s) return;
    Object.assign(s, patch);
    this.updateSoldierBadges(s);
  }

  moveSoldier(soldierId, position) {
    const s = this.soldiers.get(soldierId);
    if (!s) return;
    s.position = position;
    s.el.style.top = `${this.topPercent(s.playerId, position)}%`;
  }

  setSoldierHp(soldierId, hp) {
    this.updateSoldier(soldierId, { hp });
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
      const key = `${s.playerId}:${Math.min(s.position, this.laneLength)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    for (const list of groups.values()) {
      // 駒どうしが重なりすぎないように、列の幅に合わせて間をあける
      const width = list[0].el.parentElement?.clientWidth || 120;
      const step = Math.min(44, (width - 48) / Math.max(1, list.length - 1));
      list.forEach((s, i) => s.el.style.setProperty('--offset', `${(i - (list.length - 1) / 2) * step}px`));
    }
  }

  /** 表示用の状態に兵士を合わせる（足りなければ作り、余れば消す。動きはつけない） */
  syncSoldiers(model) {
    const alive = new Set();
    for (const playerId of this.playerOrder) {
      for (const st of model.players[playerId].soldiers) {
        alive.add(st.soldierId);
        const s = this.soldiers.get(st.soldierId);
        if (!s) {
          this.addSoldier(playerId, st);
          continue;
        }
        s.el.classList.add('no-anim');
        this.moveSoldier(st.soldierId, st.position);
        Object.assign(s, {
          hp: st.hp,
          attack: st.attack,
          weapon: st.weapon ?? null,
          element: st.element ?? null,
          shield: st.shield ?? 0,
          statuses: { poison: st.statuses?.poison ?? null, frozen: st.statuses?.frozen ?? 0 },
        });
        this.updateSoldierBadges(s);
        void s.el.offsetWidth;
        s.el.classList.remove('no-anim', 'hit', 'appear');
      }
    }
    for (const id of [...this.soldiers.keys()]) if (!alive.has(id)) this.removeSoldier(id);
    this.layoutStacks();
  }

  // ---------- 魔物 ----------

  addMonster(st, { appear = false } = {}) {
    const el = document.createElement('div');
    el.className = `monster ${st.type}`;
    el.dataset.id = st.monsterId;
    if (appear) el.classList.add('appear');
    el.innerHTML = '<div class="monster-token"><span class="monster-icon"></span>' +
      '<span class="monster-element"></span><span class="monster-attack-in"></span></div>' +
      '<div class="monster-hp"><div class="monster-hp-fill"></div><span class="monster-hp-text"></span></div>';
    el.querySelector('.monster-icon').textContent = monsterIcon(st.type);
    el.style.setProperty('--row', String(this.rowOfSquare(st.square)));
    this.el.monsterLayer.appendChild(el);
    const m = { ...st, el };
    this.monsters.set(st.monsterId, m);
    this.updateMonster(st.monsterId, {});
    return el;
  }

  monsterEl(monsterId) {
    return this.monsters.get(monsterId)?.el ?? null;
  }

  monster(monsterId) {
    return this.monsters.get(monsterId) ?? null;
  }

  updateMonster(monsterId, patch) {
    const m = this.monsters.get(monsterId);
    if (!m) return;
    Object.assign(m, patch);
    const look = ELEMENT_LOOK[m.element];
    if (look) m.el.style.setProperty('--element', look.color);
    m.el.querySelector('.monster-element').textContent = look?.icon ?? '';
    const ratio = Math.max(0, Math.min(1, m.hp / (m.maxHp || 1)));
    m.el.querySelector('.monster-hp-fill').style.width = `${ratio * 100}%`;
    m.el.querySelector('.monster-hp-text').textContent = `${Math.max(0, m.hp)}/${m.maxHp}`;
    const attackIn = m.el.querySelector('.monster-attack-in');
    attackIn.hidden = m.attackIn == null;
    attackIn.textContent = m.attackIn == null ? '' : `あと${Math.max(1, m.attackIn)}周`;
    attackIn.classList.toggle('soon', m.attackIn != null && m.attackIn <= 1);
  }

  removeMonster(monsterId) {
    const m = this.monsters.get(monsterId);
    if (!m) return;
    this.monsters.delete(monsterId);
    m.el.remove();
  }

  clearMonsters() {
    for (const m of this.monsters.values()) m.el.remove();
    this.monsters.clear();
  }

  syncMonsters(model) {
    const alive = new Set();
    for (const st of model.monsters ?? []) {
      alive.add(st.monsterId);
      if (!this.monsters.has(st.monsterId)) this.addMonster(st);
      else {
        this.monsters.get(st.monsterId).el.classList.remove('appear', 'hit');
        this.updateMonster(st.monsterId, { ...st });
      }
    }
    for (const id of [...this.monsters.keys()]) if (!alive.has(id)) this.removeMonster(id);
  }

  // ---------- 対象を選ぶ ----------

  /** 対象（getTargets の結果）を光らせる。null で元に戻す */
  setTargets(targets) {
    this.targets = targets && targets.length ? targets : null;
    this.el.app.classList.toggle('targeting', Boolean(this.targets));
    for (const el of this.el.board.querySelectorAll('.targetable')) el.classList.remove('targetable');
    if (!this.targets) return;
    for (const t of this.targets) this.elOfTarget(t)?.classList.add('targetable');
  }

  elOfTarget(t) {
    if (t.soldierId) return this.soldierEl(t.soldierId);
    if (t.monsterId) return this.monsterEl(t.monsterId);
    if (t.playerId) return this.castleEl(t.playerId);
    return null;
  }

  /** タップされた要素 → 対象（光っている対象でなければ null） */
  targetFromEl(node) {
    if (!this.targets) return null;
    const sEl = node.closest('.soldier');
    const mEl = node.closest('.monster');
    const cEl = node.closest('.castle');
    let t = null;
    if (sEl) t = { soldierId: sEl.dataset.id };
    else if (mEl) t = { monsterId: mEl.dataset.id };
    else if (cEl) t = { playerId: cEl === this.el.castle.me ? this.viewerId : this.opponentOf(this.viewerId) };
    if (!t) return null;
    const key = Object.keys(t)[0];
    return this.targets.find((x) => x[key] === t[key]) ?? null;
  }
}
