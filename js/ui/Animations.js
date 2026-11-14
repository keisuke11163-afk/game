// Game のイベントを1つずつ演出する。
// 演出しながら「表示用の状態（model）」も進める。最後に main.js が getState() で答え合わせをする。
// 画面をタップすると skip() が呼ばれ、残りの演出は一瞬で終わる。

import { UI_CONFIG, scaled } from './config.js';
import { src } from './assets.js';

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
    root.setProperty('--t-pulse', `${t.centerPulse * UI_CONFIG.speed}ms`);
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

  /** 盤面の中の px → #app の中の px */
  boardToApp({ x, y }) {
    const app = this.el.app.getBoundingClientRect();
    const r = this.el.board.getBoundingClientRect();
    return { x: x + r.left - app.left, y: y + r.top - app.top };
  }

  /** 画像の演出を1枚出す（#app の中の座標が中心） */
  fxImage(key, { x, y }, width, className = '') {
    const el = this.fx(`fx-img ${className}`, { x, y });
    const img = document.createElement('img');
    img.src = src(key);
    img.alt = '';
    el.appendChild(img);
    el.style.width = `${width}px`;
    return el;
  }

  /** 大きな数字を出す（待たない）。白抜きの太い数字が弾んで出る */
  number(target, text, { size, duration, kind = 'damage' }) {
    if (this.skipping) return;
    const { x, y } = target instanceof Element ? this.centerOf(target) : target;
    const el = this.fx(`fx-number ${kind}`, { x, y });
    el.textContent = text;
    el.style.fontSize = `${size}px`;
    const tilt = (Math.random() - 0.5) * 16;
    const base = `translate(-50%, -50%) rotate(${tilt.toFixed(1)}deg)`;
    this.animate(el, [
      { transform: `${base} scale(0.2)`, opacity: 0 },
      { transform: `${base} scale(1.4)`, opacity: 1, offset: 0.1 },
      { transform: `${base} scale(0.88)`, offset: 0.18 },
      { transform: `${base} scale(1.08)`, offset: 0.26 },
      { transform: `${base} scale(1)`, offset: 0.34 },
      { transform: `${base} translateY(-6px) scale(1)`, opacity: 1, offset: 0.72 },
      { transform: `${base} translateY(-34px) scale(0.92)`, opacity: 0 },
    ], { duration, easing: 'ease-out', fill: 'forwards' }).then(() => el.remove());
  }

  flashClass(el, className, ms) {
    el.classList.add(className);
    return this.delay(ms).then(() => el.classList.remove(className));
  }

  banner(text, ms) {
    if (this.skipping) return;
    const el = this.fx('fx-banner outlined');
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
      case 'soldiersClashed': return this.soldiersClashed(p);
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
      this.handView.blockAll();
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
    const to = this.centerOf(this.renderer.el.board);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const base = 'translate(-50%, -50%)';
    const dur = UI_CONFIG.timing.cardPlay;
    // ぽよんと弾んでから、弧を描いて盤面へ飛ぶ
    this.animate(clone, [
      { transform: `${base} translate(0, 0) scale(1, 1)` },
      { transform: `${base} translate(0, 6px) scale(1.18, 0.82)`, offset: 0.1 },
      { transform: `${base} translate(${dx * 0.3}px, ${dy * 0.3 - 40}px) scale(0.92, 1.12) rotate(-6deg)`, offset: 0.24 },
      { transform: `${base} translate(${dx}px, ${dy}px) scale(1.75, 1.45) rotate(2deg)`, offset: 0.42 },
      { transform: `${base} translate(${dx}px, ${dy}px) scale(1.55, 1.7)`, offset: 0.5 },
      { transform: `${base} translate(${dx}px, ${dy}px) scale(1.62, 1.62)`, opacity: 1, offset: 0.76 },
      { transform: `${base} translate(${dx}px, ${dy - 24}px) scale(0.4)`, opacity: 0 },
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

  async soldierDeployed({ playerId, soldierId, type, position, hp, attack }, model) {
    const def = this.cards[type] ?? {};
    const s = { soldierId, type, hp: hp ?? def.hp, attack: attack ?? def.attack, position };
    model.players[playerId].soldiers.push(s);
    this.renderer.addSoldier(playerId, s, { appear: !this.skipping });
    await this.delay(UI_CONFIG.timing.deploy);
  }

  /** 進軍：ひと続きの進軍はまとめて同時に動かす（城への攻撃はそのあと順番に）。1マスごとにぴょんと跳ねる */
  async soldiersMoved(first, queue, model) {
    const moves = [first.payload];
    const related = new Set(['soldierMoved', 'castleDamaged', 'soldierDestroyed', 'gameOver']);
    for (let i = 0; i < queue.length && related.has(queue[i].type); ) {
      if (queue[i].type === 'soldierMoved') moves.push(queue.splice(i, 1)[0].payload);
      else i++;
    }
    const L = this.rules.laneLength;
    const paths = [];
    for (const m of moves) {
      const s = model.players[m.playerId].soldiers.find((x) => x.soldierId === m.soldierId);
      if (s) s.position = m.to;
      const before = this.renderer.soldierPx(m.soldierId);
      // 途中で通るマス（城に着いたら城の前まで）
      const steps = [];
      for (let p = m.from + 1; p <= Math.min(m.to, L); p++) steps.push(p);
      if (!steps.length && m.to !== m.from) steps.push(m.to);
      paths.push({ m, before, steps });
      this.renderer.moveSoldier(m.soldierId, m.to);
    }
    this.renderer.layoutStacks();
    if (this.skipping) return;

    const hop = UI_CONFIG.timing.soldierHop;
    const jobs = paths.map(({ m, before, steps }) => {
      const s = this.renderer.soldier(m.soldierId);
      const after = this.renderer.soldierPx(m.soldierId);
      if (!s || !before || !after || !steps.length) return null;
      const points = [before];
      steps.slice(0, -1).forEach((p) => points.push(this.renderer.toPx(this.renderer.soldierPoint(m.playerId, p))));
      points.push(after);
      const n = points.length - 1;
      const frames = points.map((pt, i) => ({
        transform: `translate(${(pt.x - after.x).toFixed(1)}px, ${(pt.y - after.y).toFixed(1)}px)`,
        offset: i / n,
      }));
      const body = s.el.querySelector('.soldier-body');
      return Promise.all([
        this.animate(s.el, frames, { duration: hop * n, easing: 'linear' }),
        this.animate(body, [
          { transform: 'translateY(0) scale(1.12, 0.86)' },
          { transform: 'translateY(-22px) scale(0.92, 1.1)', offset: 0.45, easing: 'ease-in' },
          { transform: 'translateY(0) scale(1.16, 0.82)', offset: 0.88 },
          { transform: 'translateY(0) scale(1, 1)' },
        ], { duration: hop, iterations: n, easing: 'ease-out' }),
      ]);
    }).filter(Boolean);
    if (jobs.length) await Promise.all(jobs);
    else await this.delay(UI_CONFIG.timing.soldierMove);
  }

  /** 兵士同士がぶつかる：2体が前に飛び出してぶつかり、土けむり。ダメージの数字は続く soldierDamaged で出る */
  async soldiersClashed({ attacker, defender }) {
    if (this.skipping) return;
    const a = this.renderer.soldierPx(attacker.soldierId);
    const d = this.renderer.soldierPx(defender.soldierId);
    const aEl = this.renderer.soldierEl(attacker.soldierId);
    const dEl = this.renderer.soldierEl(defender.soldierId);
    if (!a || !d || !aEl || !dEl) return;
    const t = UI_CONFIG.timing;
    const cfg = UI_CONFIG.clash;
    let vx = d.x - a.x;
    let vy = d.y - a.y;
    let len = Math.hypot(vx, vy);
    if (len < 4) {
      // 同じ場所にいるときは、上下からぶつかる
      vx = 0; vy = this.renderer.sideOf(attacker.playerId) === 'me' ? -1 : 1; len = 1;
    }
    const reach = Math.min(34, Math.max(10, len / 2 - 10));
    const ux = (vx / len) * reach;
    const uy = (vy / len) * reach;
    const lunge = (el, sx, sy) => this.animate(el, [
      { transform: 'translate(0, 0)' },
      { transform: `translate(${-sx * 0.25}px, ${-sy * 0.25}px)`, offset: 0.35 },
      { transform: `translate(${sx}px, ${sy}px)` },
    ], { duration: t.clashLunge, easing: 'cubic-bezier(.6, 0, 1, 1)', fill: 'forwards' });
    await Promise.all([lunge(aEl, ux, uy), lunge(dEl, -ux, -uy)]);

    // ぶつかった瞬間：土けむり・一瞬止める・揺れ
    const mid = this.boardToApp({ x: (a.x + d.x) / 2, y: (a.y + d.y) / 2 - UI_CONFIG.board.unitSize * 0.35 });
    const dust = this.fxImage('fx:dust', mid, UI_CONFIG.board.unitSize * cfg.dustSize, 'dust');
    this.animate(dust, [
      { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 1 },
      { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 1, offset: 0.35 },
      { transform: 'translate(-50%, -60%) scale(1.35)', opacity: 0 },
    ], { duration: t.clashReturn * 3, easing: 'ease-out', fill: 'forwards' }).then(() => dust.remove());
    await this.hitstop(cfg.hitstop);
    this.shake(this.el.board, cfg.shake, 220);

    const back = (el, sx, sy) => this.animate(el, [
      { transform: `translate(${sx}px, ${sy}px)` },
      { transform: `translate(${-sx * 0.3}px, ${-sy * 0.3 - 6}px)`, offset: 0.5 },
      { transform: 'translate(0, 0)' },
    ], { duration: t.clashReturn, easing: 'ease-out' });
    await Promise.all([back(aEl, ux, uy), back(dEl, -ux, -uy)]);
    for (const a2 of [...aEl.getAnimations(), ...dEl.getAnimations()]) if (a2.playState === 'finished') a2.cancel();
  }

  /** 兵士へのダメージ：続けて来たものはまとめて同時に見せる */
  async soldiersDamaged(first, queue, model) {
    const hits = [first.payload];
    while (queue[0]?.type === 'soldierDamaged') hits.push(queue.shift().payload);
    const cfg = UI_CONFIG.soldierHit;
    for (const h of hits) {
      const s = model.players[h.playerId].soldiers.find((x) => x.soldierId === h.soldierId);
      if (s) s.hp = h.hp;
      this.renderer.setSoldierHp(h.soldierId, h.hp);
      const el = this.renderer.soldierEl(h.soldierId);
      if (!el || this.skipping) continue;
      el.classList.remove('hit');
      void el.offsetWidth;
      el.classList.add('hit');
      const img = el.querySelector('.soldier-body');
      this.number(img, `-${h.amount}`, { size: cfg.numberSize, duration: cfg.numberDuration });
    }
    await this.hitstop(cfg.hitstop);
    this.shake(this.el.board, cfg.shake, 200);
    await this.delay(200);
    for (const h of hits) this.renderer.soldierEl(h.soldierId)?.classList.remove('hit');
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

  async spellCast({ playerId, type, target }) {
    const def = this.cards[type] ?? {};
    const enemy = target ?? this.renderer.opponentOf(playerId);
    if (def.effect === 'damageEnemyCastle') return this.fireball(playerId, enemy);
    if (def.effect === 'damageEnemySoldiers') return this.thunder(enemy);
    // 回復などは castleHealed 側で見せる
    return undefined;
  }

  /** 火の玉が自分の城から相手の城へ飛ぶ（爆発は castleDamaged で出す） */
  async fireball(fromId, toId) {
    if (this.skipping) return;
    const from = this.centerOf(this.renderer.castleImgEl(fromId));
    const to = this.centerOf(this.renderer.castleImgEl(toId));
    const size = UI_CONFIG.board.unitSize * 1.1;
    const ball = this.fxImage('fx:fireball', from, size, 'fireball');
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const side = dx === 0 ? 50 : 0;
    await this.animate(ball, [
      { transform: 'translate(-50%, -50%) scale(0.4) rotate(0deg)' },
      { transform: `translate(calc(-50% + ${dx * 0.5 + side}px), calc(-50% + ${dy * 0.5}px)) scale(1) rotate(200deg)`, offset: 0.5 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.3) rotate(400deg)` },
    ], { duration: UI_CONFIG.timing.spellProjectile, easing: 'cubic-bezier(.45, 0, .9, .6)', fill: 'forwards' });
    ball.remove();
  }

  /** 相手の兵士の上に雷を落とす（ダメージは続く soldierDamaged で出す） */
  async thunder(targetId) {
    if (this.skipping) return;
    const dur = UI_CONFIG.timing.thunder;
    const targets = [...this.renderer.soldiers.values()].filter((s) => s.playerId === targetId);
    const points = targets.length
      ? targets.map((s) => this.renderer.soldierPx(s.soldierId))
      : [this.renderer.toPx(this.renderer.rowPoint((this.rules.laneLength - 1) / 2))];
    const h = UI_CONFIG.board.unitSize * 2.2;
    points.forEach((p, i) => {
      const at = this.boardToApp({ x: p.x, y: p.y - h / 2 + 8 });
      const bolt = this.fxImage('fx:lightning', at, h * 0.5, 'bolt');
      this.animate(bolt, [
        { transform: 'translate(-50%, -50%) scaleY(0.2)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scaleY(1.05)', opacity: 1, offset: 0.15 },
        { opacity: 0.25, offset: 0.35 },
        { transform: 'translate(-50%, -50%) scaleY(1)', opacity: 1, offset: 0.5 },
        { transform: 'translate(-50%, -50%) scaleY(1)', opacity: 0 },
      ], { duration: dur, delay: i * 50 * UI_CONFIG.speed, fill: 'forwards' }).then(() => bolt.remove());
    });
    this.flashScreen(dur * 0.5);
    this.shake(this.el.board, 5, dur);
    await this.delay(dur * 0.6);
  }

  /** 画面全体を一瞬白っぽくする（雷） */
  flashScreen(ms) {
    if (this.skipping) return;
    const f = this.fx('fx-flash');
    this.animate(f, [{ opacity: 0.55 }, { opacity: 0 }], { duration: ms, fill: 'forwards' }).then(() => f.remove());
  }

  async castleDamaged({ playerId, amount, hp, source }, model) {
    model.players[playerId].castleHp = hp;
    const cfg = UI_CONFIG.castleHit;
    const finish = hp <= 0;
    const castle = this.renderer.castleEl(playerId);
    const img = this.renderer.castleImgEl(playerId);
    const stop = finish ? cfg.finishHitstop : scaled(cfg.hitstopBase, cfg.hitstopPerDamage, cfg.hitstopMax, amount);
    const amp = finish ? cfg.finishShake : scaled(cfg.shakeBase, cfg.shakePerDamage, cfg.shakeMax, amount);
    const size = scaled(cfg.numberBase, cfg.numberPerDamage, cfg.numberMax, amount) * (finish ? 1.3 : 1);

    this.renderer.setCastleHp(playerId, hp);
    if (this.skipping) return;

    // 1) 当たった瞬間：城を白く光らせる＋爆発
    castle.classList.add('flash');
    const center = this.centerOf(img);
    const scale = Math.min(cfg.explosionMax, cfg.explosionBase + cfg.explosionPerDamage * amount) * (finish ? 1.3 : 1);
    const width = img.getBoundingClientRect().width * scale * (source?.kind === 'soldier' ? 0.8 : 1);
    const boom = this.fxImage('fx:explosion', center, width, 'explosion');
    this.animate(boom, [
      { transform: 'translate(-50%, -50%) scale(0.2) rotate(-10deg)', opacity: 1 },
      { transform: 'translate(-50%, -50%) scale(1.05) rotate(4deg)', opacity: 1, offset: 0.3 },
      { transform: 'translate(-50%, -50%) scale(1.2) rotate(8deg)', opacity: 0 },
    ], { duration: stop + 320, easing: 'ease-out', fill: 'forwards' }).then(() => boom.remove());
    // 2) 一瞬止める（ダメージが大きいほど長く）
    await this.hitstop(stop);
    castle.classList.remove('flash');
    // 3) 揺れ＋大きな数字
    this.number(img, `-${amount}`, { size, duration: cfg.numberDuration });
    this.shake(this.el.board, amp, cfg.shakeDuration * (finish ? 1.6 : 1));
    await this.delay(cfg.shakeDuration * 0.7);
  }

  async castleHealed({ playerId, amount, hp }, model) {
    model.players[playerId].castleHp = hp;
    const castle = this.renderer.castleEl(playerId);
    const img = this.renderer.castleImgEl(playerId);
    this.renderer.setCastleHp(playerId, hp);
    if (this.skipping) return;
    const dur = UI_CONFIG.timing.heal;
    castle.classList.remove('heal-glow');
    void castle.offsetWidth;
    castle.classList.add('heal-glow');
    const sparkle = this.fxImage('fx:heal', this.centerOf(img), img.getBoundingClientRect().width * 1.1, 'heal');
    this.animate(sparkle, [
      { transform: 'translate(-50%, -30%) scale(0.5)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.3 },
      { transform: 'translate(-50%, -75%) scale(1.1)', opacity: 0 },
    ], { duration: dur * 1.6, easing: 'ease-out', fill: 'forwards' }).then(() => sparkle.remove());
    this.number(img, `+${amount}`, { kind: 'heal', size: UI_CONFIG.healNumber.size, duration: UI_CONFIG.healNumber.duration });
    await this.delay(dur);
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
