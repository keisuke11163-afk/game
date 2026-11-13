// 画面表示担当。Game の状態（getView の結果）を描き、イベントを見てアニメーションする。
// ゲームのルールはここには書かない。

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MOVE_TIME = 600; // style.css の --move-time と合わせる

export class Renderer {
  /**
   * @param {{onCardTap:(uid:number)=>void, onEndTurn:()=>void, onOverlayTap:()=>void}} handlers
   */
  constructor(handlers) {
    this.handlers = handlers;
    this.viewerIndex = null;
    this.laneLength = 6;
    this.selectedUid = null;
    /** soldier uid -> 兵士の DOM 要素 */
    this.soldierEls = new Map();

    const $ = (id) => document.getElementById(id);
    this.el = {
      app: $('app'),
      board: $('board'),
      oppName: $('opp-name'),
      oppHandCount: $('opp-hand-count'),
      deckCount: $('deck-count'),
      castle: { me: $('castle-me'), opp: $('castle-opp') },
      castleLabel: { me: $('castle-me-label'), opp: $('castle-opp-label') },
      castleFill: { me: $('castle-me-fill'), opp: $('castle-opp-fill') },
      castleHp: { me: $('castle-me-hp'), opp: $('castle-opp-hp') },
      castleMax: { me: $('castle-me-max'), opp: $('castle-opp-max') },
      lane: { me: $('lane-me'), opp: $('lane-opp') },
      hand: $('hand'),
      message: $('message'),
      endTurn: $('end-turn'),
      overlay: $('overlay'),
      overlayTitle: $('overlay-title'),
      overlaySub: $('overlay-sub'),
      error: $('error'),
    };

    this.el.endTurn.addEventListener('click', () => this.handlers.onEndTurn());
    this.el.overlay.addEventListener('click', () => this.handlers.onOverlayTap());
    this.el.hand.addEventListener('click', (e) => {
      const cardEl = e.target.closest('.card');
      if (cardEl) this.handlers.onCardTap(Number(cardEl.dataset.uid));
    });
  }

  // ---------- 基本の描画 ----------

  setLaneLength(length) {
    this.laneLength = length;
    document.documentElement.style.setProperty('--cells', String(length));
    for (const side of ['me', 'opp']) {
      const cells = this.el.lane[side].querySelector('.cells');
      cells.innerHTML = '';
      for (let i = 0; i < length; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cells.appendChild(cell);
      }
    }
  }

  /** 誰の視点で描くかを決める（手番のプレイヤーが常に下） */
  setViewer(viewerIndex) {
    if (this.viewerIndex !== viewerIndex) {
      // 視点が変わったら兵士を作り直す（上下が入れ替わるため）
      for (const el of this.soldierEls.values()) el.remove();
      this.soldierEls.clear();
    }
    this.viewerIndex = viewerIndex;
    const opp = 1 - viewerIndex;
    this.setOwnerClass(this.el.castle.me, viewerIndex);
    this.setOwnerClass(this.el.castle.opp, opp);
    this.setOwnerClass(this.el.lane.me, viewerIndex);
    this.setOwnerClass(this.el.lane.opp, opp);
  }

  setOwnerClass(el, ownerIndex) {
    el.classList.remove('owner-0', 'owner-1');
    el.classList.add(`owner-${ownerIndex}`);
  }

  sideOf(playerIndex) {
    return playerIndex === this.viewerIndex ? 'me' : 'opp';
  }

  /** 状態をまるごと画面に反映する */
  renderAll(view) {
    const me = view.players[this.viewerIndex];
    const opp = view.players[1 - this.viewerIndex];
    this.el.oppName.textContent = opp.name;
    this.el.oppHandCount.textContent = String(opp.handCount);
    this.el.deckCount.textContent = String(view.deckCount);
    this.el.castleLabel.me.textContent = `${me.name}の城（自分）`;
    this.el.castleLabel.opp.textContent = `${opp.name}の城`;
    this.renderCastle(me.index, me.castle.hp, me.castle.maxHp);
    this.renderCastle(opp.index, opp.castle.hp, opp.castle.maxHp);
    this.renderHand(view);
    this.syncSoldiers(view);
    this.el.endTurn.disabled = view.phase !== 'main';
  }

  renderCastle(playerIndex, hp, maxHp) {
    const side = this.sideOf(playerIndex);
    const ratio = maxHp > 0 ? Math.max(0, hp / maxHp) : 0;
    const fill = this.el.castleFill[side];
    fill.style.width = `${ratio * 100}%`;
    fill.classList.toggle('mid', ratio <= 0.5 && ratio > 0.25);
    fill.classList.toggle('low', ratio <= 0.25);
    this.el.castleHp[side].textContent = String(hp);
    this.el.castleMax[side].textContent = String(maxHp);
  }

  renderHand(view) {
    const me = view.players[this.viewerIndex];
    const canPlay = view.phase === 'main' && !view.hasPlayedCard && view.currentIndex === this.viewerIndex;
    const hand = this.el.hand;
    hand.innerHTML = '';
    if (!me.hand || me.hand.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'hand-empty';
      empty.textContent = '手札がありません';
      hand.appendChild(empty);
      return;
    }
    for (const card of me.hand) {
      const el = document.createElement('div');
      el.className = `card ${card.type}-card`;
      if (card.uid === this.selectedUid) el.classList.add('selected');
      if (!canPlay) el.classList.add('disabled');
      el.dataset.uid = String(card.uid);
      el.innerHTML = `
        <span class="card-type">${card.type === 'soldier' ? '兵士' : '魔法'}</span>
        <span class="card-name"></span>
        <span class="card-desc"></span>`;
      el.querySelector('.card-name').textContent = card.name;
      el.querySelector('.card-desc').textContent = card.description;
      hand.appendChild(el);
    }
  }

  setSelected(uid) {
    this.selectedUid = uid;
    for (const el of this.el.hand.querySelectorAll('.card')) {
      el.classList.toggle('selected', Number(el.dataset.uid) === uid);
    }
  }

  setMessage(text) {
    this.el.message.textContent = text;
  }

  setEndTurnEnabled(enabled) {
    this.el.endTurn.disabled = !enabled;
  }

  // ---------- 兵士 ----------

  /** 兵士の位置(0〜laneLength+1)を、レーン内の bottom(%) に変える */
  bottomPercent(ownerIndex, position) {
    const L = this.laneLength;
    const pos = Math.min(position, L + 1); // 到着した兵士は相手の城の位置まで
    const cellFromBottom = ownerIndex === this.viewerIndex ? pos - 1 : L - pos;
    return (cellFromBottom / L) * 100;
  }

  createSoldierEl(soldier, { appear = false } = {}) {
    const el = document.createElement('div');
    el.className = `soldier owner-${soldier.ownerIndex} ${soldier.cardId} no-anim`;
    if (appear) el.classList.add('appear');
    el.innerHTML = `<div class="soldier-token"><span class="soldier-mark"></span><span class="soldier-hp"></span></div>`;
    el.querySelector('.soldier-mark').textContent = soldier.name.charAt(0);
    el.dataset.position = String(soldier.position);
    el.style.bottom = `${this.bottomPercent(soldier.ownerIndex, soldier.position)}%`;
    this.updateSoldierHp(el, soldier.hp);
    this.el.lane[this.sideOf(soldier.ownerIndex)].querySelector('.soldier-layer').appendChild(el);
    el.getBoundingClientRect(); // 位置を確定させてからアニメーションを有効にする
    el.classList.remove('no-anim');
    this.soldierEls.set(soldier.uid, el);
    return el;
  }

  updateSoldierHp(el, hp) {
    el.querySelector('.soldier-hp').textContent = String(hp);
  }

  moveSoldierEl(el, ownerIndex, position) {
    el.dataset.position = String(position);
    el.style.bottom = `${this.bottomPercent(ownerIndex, position)}%`;
  }

  /** 同じマスにいる兵士を横に少しずつずらす */
  layoutStacks() {
    for (const side of ['me', 'opp']) {
      const groups = new Map();
      for (const el of this.el.lane[side].querySelectorAll('.soldier:not(.leaving)')) {
        const key = el.dataset.position;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(el);
      }
      for (const els of groups.values()) {
        els.forEach((el, i) => {
          const offset = (i - (els.length - 1) / 2) * 22;
          el.style.setProperty('--offset', `${offset}px`);
        });
      }
    }
  }

  /** view の兵士と画面の兵士を一致させる（足りなければ作る・余れば消す） */
  syncSoldiers(view) {
    const alive = new Set();
    for (const player of view.players) {
      for (const s of player.soldiers) {
        alive.add(s.uid);
        let el = this.soldierEls.get(s.uid);
        if (!el) el = this.createSoldierEl(s);
        this.moveSoldierEl(el, s.ownerIndex, s.position);
        this.updateSoldierHp(el, s.hp);
      }
    }
    for (const [uid, el] of this.soldierEls) {
      if (!alive.has(uid)) {
        el.remove();
        this.soldierEls.delete(uid);
      }
    }
    this.layoutStacks();
  }

  removeSoldierEl(uid) {
    const el = this.soldierEls.get(uid);
    if (!el) return;
    this.soldierEls.delete(uid);
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 320);
  }

  // ---------- イベントの再生（アニメーション） ----------

  /**
   * Game が返したイベントを順番に演出する。最後に finalView で状態を合わせる。
   */
  async playEvents(events, finalView) {
    for (const ev of events) {
      switch (ev.type) {
        case 'draw':
          this.el.deckCount.textContent = String(finalView.deckCount);
          this.renderHand(finalView);
          break;

        case 'advance': {
          if (ev.moves.length === 0) break;
          for (const m of ev.moves) {
            const el = this.soldierEls.get(m.soldierId);
            if (el) this.moveSoldierEl(el, ev.playerIndex, m.to);
          }
          this.layoutStacks();
          await wait(MOVE_TIME + 50);
          break;
        }

        case 'castleHit':
          this.removeSoldierEl(ev.soldierId);
          this.shake(this.el.castle[this.sideOf(ev.targetIndex)]);
          this.floatText(this.el.castle[this.sideOf(ev.targetIndex)], `-${ev.damage}`, 'damage');
          this.renderCastle(ev.targetIndex, ev.hp, finalView.players[ev.targetIndex].castle.maxHp);
          await wait(350);
          break;

        case 'soldierDeployed': {
          this.createSoldierEl(ev.soldier, { appear: true });
          this.layoutStacks();
          await wait(400);
          break;
        }

        case 'castleDamaged':
          await this.fireballEffect(ev.targetIndex);
          this.floatText(this.el.castle[this.sideOf(ev.targetIndex)], `-${ev.damage}`, 'damage');
          this.renderCastle(ev.targetIndex, ev.hp, finalView.players[ev.targetIndex].castle.maxHp);
          await wait(400);
          break;

        case 'soldiersDamaged':
          await this.thunderEffect(ev);
          break;

        case 'castleHealed': {
          const castleEl = this.el.castle[this.sideOf(ev.targetIndex)];
          this.flashClass(castleEl, 'glow-heal', 900);
          this.floatText(castleEl, `+${ev.healed}`, 'heal');
          this.renderCastle(ev.targetIndex, ev.hp, finalView.players[ev.targetIndex].castle.maxHp);
          await wait(700);
          break;
        }

        default:
          break;
      }
    }
    this.renderAll(finalView);
  }

  // ---------- エフェクト ----------

  flashClass(el, className, ms) {
    el.classList.remove(className);
    void el.offsetWidth; // アニメーションをやり直すため
    el.classList.add(className);
    setTimeout(() => el.classList.remove(className), ms);
  }

  shake(el) {
    this.flashClass(el, 'shake', 450);
  }

  /** el の中央（#app 基準）の座標 */
  centerOf(el) {
    const app = this.el.app.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - app.left + r.width / 2, y: r.top - app.top + r.height / 2 };
  }

  floatText(targetEl, text, kind) {
    const { x, y } = this.centerOf(targetEl);
    const t = document.createElement('div');
    t.className = `float-text ${kind}`;
    t.textContent = text;
    t.style.left = `${x}px`;
    t.style.top = `${y}px`;
    this.el.app.appendChild(t);
    setTimeout(() => t.remove(), 1000);
  }

  async fireballEffect(targetIndex) {
    const target = this.el.castle[this.sideOf(targetIndex)];
    const source = this.el.castle[this.sideOf(1 - targetIndex)];
    const from = this.centerOf(source);
    const to = this.centerOf(target);
    const ball = document.createElement('div');
    ball.className = 'fx-fireball';
    ball.style.left = `${from.x}px`;
    ball.style.top = `${from.y}px`;
    this.el.app.appendChild(ball);
    const anim = ball.animate(
      [
        { transform: 'translate(0, 0) scale(0.6)' },
        { transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(1.4)` },
      ],
      { duration: 500, easing: 'ease-in', fill: 'forwards' },
    );
    await anim.finished.catch(() => {});
    ball.remove();
    this.shake(target);
    this.flashClass(target, 'glow-fire', 600);
  }

  async thunderEffect(ev) {
    const lane = this.el.lane[this.sideOf(ev.ownerIndex)];
    const flash = document.createElement('div');
    flash.className = 'fx-thunder';
    lane.appendChild(flash);
    this.shake(lane);
    await wait(250);
    for (const hit of ev.hits) {
      const el = this.soldierEls.get(hit.soldierId);
      if (!el) continue;
      this.flashClass(el, 'hit', 450);
      this.updateSoldierHp(el, hit.hp);
      this.floatText(el, `-${hit.damage}`, 'damage');
    }
    await wait(450);
    for (const hit of ev.hits) {
      if (hit.died) this.removeSoldierEl(hit.soldierId);
    }
    flash.remove();
    await wait(350);
    this.layoutStacks();
  }

  // ---------- 交代・勝敗の画面 ----------

  showOverlay(title, sub, ownerIndex = null) {
    this.el.overlayTitle.textContent = title;
    this.el.overlayTitle.classList.remove('owner-0', 'owner-1');
    if (ownerIndex !== null) this.el.overlayTitle.classList.add(`owner-${ownerIndex}`);
    this.el.overlaySub.textContent = sub;
    this.el.overlay.hidden = false;
  }

  hideOverlay() {
    this.el.overlay.hidden = true;
  }

  get overlayVisible() {
    return !this.el.overlay.hidden;
  }

  showError(text) {
    this.el.error.textContent = text;
    this.el.error.hidden = false;
  }
}
