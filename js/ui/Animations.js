// Game のイベントを1つずつ演出する。
// 演出しながら「表示用の状態（model）」も進める。最後に main.js が getState() で答え合わせをする。
// 画面をタップすると skip() が呼ばれ、残りの演出は一瞬で終わる。

import { UI_CONFIG, scaled } from './config.js';

const $ = (id) => document.getElementById(id);

export class Animations {
  /**
   * @param {{ renderer: import('./Renderer.js').Renderer,
   *           handView: import('./HandView.js').HandView,
   *           cards: object, rules: object }} opts
   */
  constructor({ renderer, handView, cards, rules }) {
    this.renderer = renderer;
    this.handView = handView;
    this.cards = cards;
    this.rules = rules;
    this.skipping = false;
    this.timers = new Set();     // 待っている delay
    this.running = new Set();    // 動いている Web Animation
    this.el = { app: $('app'), board: $('board'), fx: $('fx-layer') };
    this.applyCssTiming();
  }

  /** config の時間を CSS 変数に反映する */
  applyCssTiming() {
    const t = UI_CONFIG.timing;
    const root = document.documentElement.style;
    root.setProperty('--t-move', `${t.soldierMove * UI_CONFIG.speed}ms`);
    root.setProperty('--t-deploy', `${t.deploy * UI_CONFIG.speed}ms`);
    root.setProperty('--t-death', `${t.soldierDeath * UI_CONFIG.speed}ms`);
    root.setProperty('--t-heal', `${t.heal * UI_CONFIG.speed}ms`);
  }

  // ---------- 飛ばす ----------

  skip() {
    if (this.skipping) return;
    this.skipping = true;
    this.el.app.classList.add('skipping');
    for (const a of [...this.running]) {
      try { a.finish(); } catch { a.cancel(); }
    }
    // 兵士の移動・HPバーなど CSS の動きも終わらせる
    for (const a of document.getAnimations()) {
      if (a instanceof CSSTransition) a.finish();
    }
    for (const t of [...this.timers]) t.done();
  }

  endSkip() {
    this.skipping = false;
    this.el.app.classList.remove('skipping');
  }

  // ---------- 基本の道具 ----------

  /** ms 待つ（speed 倍率つき。飛ばしているときはすぐ終わる） */
  delay(ms) {
    if (this.skipping || ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const t = {
        id: setTimeout(() => t.done(), ms * UI_CONFIG.speed),
        done: () => { clearTimeout(t.id); this.timers.delete(t); resolve(); },
      };
      this.timers.add(t);
    });
  }

  /** Web Animations API のラッパー。終わったら resolve。飛ばしているときは何もしない */
  animate(el, keyframes, { duration, ...opts }) {
    if (this.skipping) return Promise.resolve();
    const a = el.animate(keyframes, { duration: duration * UI_CONFIG.speed, ...opts });
    this.running.add(a);
    const end = () => this.running.delete(a);
    return a.finished.then(end, end);
  }

  /** ヒットストップ：動いているものをすべて止めて、少し待つ */
  async hitstop(ms) {
    if (this.skipping || ms <= 0) return;
    const paused = document.getAnimations().filter((a) => a.playState === 'running');
    paused.forEach((a) => a.pause());
    await this.delay(ms);
    paused.forEach((a) => { if (a.playState === 'paused') a.play(); });
  }

  shake(el, amplitude, duration) {
    const frames = [];
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const k = 1 - i / n;
      const x = (i % 2 ? 1 : -1) * amplitude * k * (0.6 + Math.random() * 0.4);
      const y = (Math.random() - 0.5) * amplitude * k * 0.6;
      frames.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` });
    }
    frames[n] = { transform: 'translate(0, 0)' };
    return this.animate(el, frames, { duration, easing: 'linear' });
  }

  /** el の中心（#app の中の座標） */
  centerOf(el) {
    const app = this.el.app.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - app.left + r.width / 2, y: r.top - app.top + r.height / 2 };
  }

  fx(className, { x, y } = {}) {
    const el = document.createElement('div');
    el.className = className;
    if (x != null) el.style.left = `${x}px`;
    if (y != null) el.style.top = `${y}px`;
    this.el.fx.appendChild(el);
    return el;
  }

  /** 大きな数字を出す（待たない） */
  number(targetEl, text, { size, duration, kind = 'damage' }) {
    if (this.skipping) return;
    const { x, y } = this.centerOf(targetEl);
    const el = this.fx(`fx-number ${kind}${size < 30 ? ' small' : ''}`, { x, y });
    el.textContent = text;
    el.style.fontSize = `${size}px`;
    const base = 'translate(-50%, -50%)';
    this.animate(el, [
      { transform: `${base} scale(2.4)`, opacity: 0 },
      { transform: `${base} scale(1)`, opacity: 1, offset: 0.12 },
      { transform: `${base} translateY(-8px) scale(1)`, opacity: 1, offset: 0.7 },
      { transform: `${base} translateY(-36px) scale(0.9)`, opacity: 0 },
    ], { duration, easing: 'ease-out', fill: 'forwards' }).then(() => el.remove());
  }

  flashClass(el, className, ms) {
    el.classList.add(className);
    return this.delay(ms).then(() => el.classList.remove(className));
  }

  banner(text, ms) {
    if (this.skipping) return;
    const el = this.fx('fx-banner');
    el.textContent = text;
    this.animate(el, [
      { transform: 'scale(1.6)', opacity: 0 },
      { transform: 'scale(1)', opacity: 1, offset: 0.2 },
      { transform: 'scale(1)', opacity: 1, offset: 0.75 },
      { transform: 'scale(0.95)', opacity: 0 },
    ], { duration: ms, fill: 'forwards' }).then(() => el.remove());
  }

  // ---------- イベントの再生 ----------

  /**
   * イベントを1つ演出する。連続する進軍・ダメージは queue から取り出してまとめて動かす。
   * @param {{type:string,payload:object}} ev
   * @param {{type:string,payload:object}[]} queue まだ演出していないイベント
   * @param {object} model 表示用の状態（ここで進める）
   * @param {{ viewerId: string, lookupCard: (cardId:string)=>object|null }} ctx
   */
  async play(ev, queue, model, ctx) {
    const p = ev.payload;
    switch (ev.type) {
      case 'turnStarted':
        model.turn = p.turn;
        model.currentPlayer = p.playerId;
        for (const id of ['p1', 'p2']) model.players[id].playedThisTurn = false;
        this.renderer.setTurnInfo(p.turn);
        return;
      case 'cardDrawn': return this.cardDrawn(p, model, ctx);
      case 'deckShuffled':
        model.deckCount = p.deckCount;
        model.discardCount = 0;
        this.renderer.setPiles(model.deckCount, model.discardCount, { bumpDeck: true });
        this.banner('山札をシャッフル！', UI_CONFIG.timing.shuffle);
        return this.delay(UI_CONFIG.timing.shuffle * 0.6);
      case 'cardPlayed': return this.cardPlayed(p, model, ctx);
      case 'discardRequired':
        model.phase = 'discard';
        model.discardRequired = p.count;
        return;
      case 'cardDiscarded': return this.cardDiscarded(p, model, ctx);
      case 'soldierDeployed': return this.soldierDeployed(p, model);
      case 'soldierMoved': return this.soldiersMoved(ev, queue, model);
      case 'soldierDamaged': return this.soldiersDamaged(ev, queue, model);
      case 'soldierDestroyed': return this.soldiersDestroyed(ev, queue, model);
      case 'spellCast': return this.spellCast(p);
      case 'castleDamaged': return this.castleDamaged(p, model);
      case 'castleHealed': return this.castleHealed(p, model);
      case 'gameOver':
        model.phase = 'gameOver';
        model.winner = p.winner;
        return;
      default:
        return;
    }
  }

  async cardDrawn({ playerId, cardIds }, model, ctx) {
    const pl = model.players[playerId];
    for (const cardId of cardIds) {
      pl.handCount += 1;
      model.deckCount = Math.max(0, model.deckCount - 1);
      this.renderer.setPiles(model.deckCount, model.discardCount, { bumpDeck: true });
      if (playerId === ctx.viewerId) {
        const card = ctx.lookupCard(cardId);
        if (card) {
          model.hand.push(card);
          this.handView.addCard(card);
        }
      } else {
        this.renderer.setOppHandCount(pl.handCount);
      }
      await this.delay(UI_CONFIG.timing.draw);
    }
  }

  async cardPlayed({ playerId, cardId, type }, model, ctx) {
    const pl = model.players[playerId];
    pl.handCount = Math.max(0, pl.handCount - 1);
    pl.playedThisTurn = true;
    model.discardCount += 1;
    model.hand = model.hand.filter((c) => c.cardId !== cardId);
    let clone;
    let from;
    const app = this.el.app.getBoundingClientRect();
    if (playerId === ctx.viewerId) {
      const taken = this.handView.takeCard(cardId);
      this.handView.setDim(true);
      if (taken) {
        clone = taken.clone;
        from = { x: taken.rect.left - app.left + taken.rect.width / 2, y: taken.rect.top - app.top + taken.rect.height / 2 };
      }
    } else {
      this.renderer.setOppHandCount(pl.handCount);
    }
    if (!clone) {
      clone = this.handView.makeCardEl({ cardId, type });
      from = { x: app.width / 2, y: 0 };
    }
    this.renderer.setPiles(model.deckCount, model.discardCount, { bumpDiscard: true });
    if (this.skipping) return;

    clone.classList.remove('selected', 'dim', 'new', 'denied', 'drag-source', 'drag-ghost');
    clone.classList.add('fx-card');
    clone.style.left = `${from.x}px`;
    clone.style.top = `${from.y}px`;
    this.el.fx.appendChild(clone);
    const to = this.centerOf(this.renderer.el.field);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const base = 'translate(-50%, -50%)';
    const dur = UI_CONFIG.timing.cardPlay;
    this.animate(clone, [
      { transform: `${base} translate(0, 0) scale(1)` },
      { transform: `${base} translate(${dx}px, ${dy}px) scale(1.7)`, offset: 0.35 },
      { transform: `${base} translate(${dx}px, ${dy}px) scale(1.7)`, opacity: 1, offset: 0.75 },
      { transform: `${base} translate(${dx}px, ${dy - 30}px) scale(1.4)`, opacity: 0 },
    ], { duration: dur, easing: 'ease-out', fill: 'forwards' }).then(() => clone.remove());
    // 消えきるのを待たずに、効果の演出へ進む
    await this.delay(dur * 0.7);
  }

  async cardDiscarded({ playerId, cardIds }, model, ctx) {
    const pl = model.players[playerId];
    pl.handCount = Math.max(0, pl.handCount - cardIds.length);
    model.discardCount += cardIds.length;
    model.phase = 'main';
    model.discardRequired = 0;
    model.hand = model.hand.filter((c) => !cardIds.includes(c.cardId));
    if (playerId === ctx.viewerId) {
      this.handView.exitDiscard();
      for (const id of cardIds) this.handView.takeCard(id);
    } else {
      this.renderer.setOppHandCount(pl.handCount);
    }
    this.renderer.setPiles(model.deckCount, model.discardCount, { bumpDiscard: true });
    await this.delay(150);
  }

  async soldierDeployed({ playerId, soldierId, type, position }, model) {
    const def = this.cards[type] ?? {};
    const s = { soldierId, type, hp: def.hp, attack: def.attack, position };
    model.players[playerId].soldiers.push(s);
    this.renderer.addSoldier(playerId, s, { appear: true });
    await this.delay(UI_CONFIG.timing.deploy);
  }

  /** 進軍：ひと続きの進軍はまとめて同時に動かす（城への攻撃はそのあと順番に） */
  async soldiersMoved(first, queue, model) {
    const moves = [first.payload];
    const related = new Set(['soldierMoved', 'castleDamaged', 'soldierDestroyed', 'gameOver']);
    for (let i = 0; i < queue.length && related.has(queue[i].type); ) {
      if (queue[i].type === 'soldierMoved') moves.push(queue.splice(i, 1)[0].payload);
      else i++;
    }
    for (const m of moves) {
      const s = model.players[m.playerId].soldiers.find((x) => x.soldierId === m.soldierId);
      if (s) s.position = m.to;
      this.renderer.moveSoldier(m.soldierId, m.to);
    }
    this.renderer.layoutStacks();
    await this.delay(UI_CONFIG.timing.soldierMove);
  }

  /** 兵士へのダメージ：続けて来たものはまとめて同時に見せる */
  async soldiersDamaged(first, queue, model) {
    const hits = [first.payload];
    while (queue[0]?.type === 'soldierDamaged') hits.push(queue.shift().payload);
    const cfg = UI_CONFIG.soldierHit;
    const lanes = new Set();
    for (const h of hits) {
      const s = model.players[h.playerId].soldiers.find((x) => x.soldierId === h.soldierId);
      if (s) s.hp = h.hp;
      this.renderer.setSoldierHp(h.soldierId, h.hp);
      const el = this.renderer.soldierEl(h.soldierId);
      if (!el) continue;
      el.classList.add('hit');
      lanes.add(this.renderer.laneEl(h.playerId));
      this.number(el, `-${h.amount}`, { size: cfg.numberSize, duration: cfg.numberDuration });
    }
    await this.hitstop(cfg.hitstop);
    for (const h of hits) this.renderer.soldierEl(h.soldierId)?.classList.remove('hit');
    for (const lane of lanes) this.shake(lane, cfg.shake, 200);
    await this.delay(160);
  }

  /** 兵士が消える：続けて来たものはまとめて同時に消す */
  async soldiersDestroyed(first, queue, model) {
    const list = [first.payload];
    while (queue[0]?.type === 'soldierDestroyed') list.push(queue.shift().payload);
    for (const d of list) {
      const pl = model.players[d.playerId];
      pl.soldiers = pl.soldiers.filter((x) => x.soldierId !== d.soldierId);
      this.renderer.soldierEl(d.soldierId)?.classList.add(d.reason === 'reachedCastle' ? 'arrived' : 'dying');
    }
    await this.delay(UI_CONFIG.timing.soldierDeath);
    for (const d of list) this.renderer.removeSoldier(d.soldierId);
  }

  async spellCast({ playerId, type }) {
    const def = this.cards[type] ?? {};
    const enemy = this.renderer.opponentOf(playerId);
    if (def.effect === 'damageEnemyCastle') return this.fireball(playerId, enemy);
    if (def.effect === 'damageEnemySoldiers') return this.thunder(enemy);
    // 回復などは castleHealed 側で見せる
    return undefined;
  }

  async fireball(fromId, toId) {
    if (this.skipping) return;
    const from = this.centerOf(this.renderer.castleEl(fromId));
    const to = this.centerOf(this.renderer.castleEl(toId));
    const ball = this.fx('fx-fireball', from);
    await this.animate(ball, [
      { transform: 'translate(0, 0) scale(0.5)' },
      { transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(1.5)` },
    ], { duration: UI_CONFIG.timing.spellProjectile, easing: 'cubic-bezier(.5, 0, 1, 1)', fill: 'forwards' });
    ball.remove();
  }

  async thunder(targetId) {
    if (this.skipping) return;
    const lane = this.renderer.laneEl(targetId);
    const app = this.el.app.getBoundingClientRect();
    const r = lane.getBoundingClientRect();
    const dur = UI_CONFIG.timing.thunder;
    for (let i = 0; i < 3; i++) {
      const bolt = this.fx('fx-bolt');
      const w = r.width * (0.18 + Math.random() * 0.15);
      bolt.style.left = `${r.left - app.left + Math.random() * (r.width - w)}px`;
      bolt.style.top = `${r.top - app.top}px`;
      bolt.style.width = `${w}px`;
      bolt.style.height = `${r.height}px`;
      this.animate(bolt, [
        { opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 0.1, offset: 0.3 },
        { opacity: 0.9, offset: 0.45 }, { opacity: 0 },
      ], { duration: dur, delay: i * 40 * UI_CONFIG.speed, fill: 'forwards' }).then(() => bolt.remove());
    }
    this.shake(lane, 5, dur);
    await this.delay(dur * 0.6);
  }

  async castleDamaged({ playerId, amount, hp }, model) {
    model.players[playerId].castleHp = hp;
    const cfg = UI_CONFIG.castleHit;
    const finish = hp <= 0;
    const castle = this.renderer.castleEl(playerId);
    const stop = finish ? cfg.finishHitstop : scaled(cfg.hitstopBase, cfg.hitstopPerDamage, cfg.hitstopMax, amount);
    const amp = finish ? cfg.finishShake : scaled(cfg.shakeBase, cfg.shakePerDamage, cfg.shakeMax, amount);
    const size = scaled(cfg.numberBase, cfg.numberPerDamage, cfg.numberMax, amount) * (finish ? 1.3 : 1);

    this.renderer.setCastleHp(playerId, hp);
    if (this.skipping) return;

    // 1) 当たった瞬間：白く光る＋爆発
    castle.classList.add('flash');
    const burst = this.fx('fx-burst', this.centerOf(castle));
    burst.style.transform = `scale(${0.6 + Math.min(amount, 30) / 20})`;
    // 2) 一瞬止める（ダメージが大きいほど長く）
    await this.hitstop(stop);
    castle.classList.remove('flash');
    // 3) 揺れ＋大きな数字
    this.number(castle, `-${amount}`, { size, duration: cfg.numberDuration });
    this.animate(burst, [{ opacity: 1 }, { opacity: 0, transform: `scale(${1 + Math.min(amount, 30) / 15})` }],
      { duration: 260, fill: 'forwards' }).then(() => burst.remove());
    this.shake(this.el.board, amp, cfg.shakeDuration * (finish ? 1.6 : 1));
    await this.delay(cfg.shakeDuration * 0.7);
  }

  async castleHealed({ playerId, amount, hp }, model) {
    model.players[playerId].castleHp = hp;
    const castle = this.renderer.castleEl(playerId);
    this.renderer.setCastleHp(playerId, hp);
    if (this.skipping) return;
    castle.classList.remove('heal-glow');
    void castle.offsetWidth;
    castle.classList.add('heal-glow');
    this.number(castle, `+${amount}`, { kind: 'heal', size: UI_CONFIG.healNumber.size, duration: UI_CONFIG.healNumber.duration });
    await this.delay(UI_CONFIG.timing.heal);
    castle.classList.remove('heal-glow');
  }

  // ---------- 勝利 ----------

  confetti(container, colors) {
    container.innerHTML = '';
    const n = 70;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = `${1800 + Math.random() * 1800}ms`;
      c.style.animationDelay = `${Math.random() * 600}ms`;
      c.style.setProperty('--dx', `${(Math.random() - 0.5) * 160}px`);
      c.style.setProperty('--rot', `${(Math.random() - 0.5) * 1440}deg`);
      container.appendChild(c);
    }
  }
}
