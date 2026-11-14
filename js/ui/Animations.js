// Game のイベントを1つずつ演出する。
// 演出しながら「表示用の状態（model）」も進める。最後に main.js が getState() で答え合わせをする。
// 画面をタップすると skip() が呼ばれ、残りの演出は一瞬で終わる。

import { UI_CONFIG, scaled } from './config.js';
import { ELEMENT_LOOK, STATUS_ICON, ICON, SPELL_TINT, GLOW, monsterIcon, upgradeIcon } from './look.js';

const $ = (id) => document.getElementById(id);

export class Animations {
  /**
   * @param {{ renderer: import('./Renderer.js').Renderer,
   *           handView: import('./HandView.js').HandView,
   *           cards: object, rules: object, monsters?: object, upgrades?: object }} opts
   */
  constructor({ renderer, handView, cards, rules, monsters = null, upgrades = null }) {
    this.renderer = renderer;
    this.handView = handView;
    this.cards = cards;
    this.rules = rules;
    this.monsterDefs = monsters;
    this.upgradeDefs = upgrades;
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
    root.setProperty('--t-equip', `${t.equip * UI_CONFIG.speed}ms`);
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
  number(targetEl, text, { size, duration, kind = 'damage', dy = 0 }) {
    if (this.skipping) return;
    const c = this.centerOf(targetEl);
    const x = c.x;
    const y = c.y + dy;
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

  banner(text, ms, variant = '') {
    if (this.skipping) return;
    const el = this.fx(`fx-banner ${variant}`.trim());
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
    const p = ev.payload ?? {};
    switch (ev.type) {
      case 'turnStarted':
        model.turn = p.turn;
        model.currentPlayer = p.playerId;
        for (const pl of Object.values(model.players)) {
          pl.playedThisTurn = false;
          pl.cardsPlayedThisTurn = 0;
        }
        this.renderer.setTurnInfo(p.turn, model.round);
        return;
      case 'roundStarted': return this.roundStarted(p, model);
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
      case 'weaponEquipped': return this.weaponEquipped(p, model);
      case 'shieldAdded': return this.shieldAdded(p, model);
      case 'castleArmored': return this.castleArmored(p, model);
      case 'armorExpired': return this.armorExpired(p, model);
      case 'statusApplied': return this.statusesApplied(ev, queue, model);
      case 'statusCleared': return this.statusCleared(p, model);
      case 'monsterAppeared': return this.monsterAppeared(p, model);
      case 'monsterAttackedCastle': return this.monsterAttackedCastle(p, model);
      case 'monsterClashed': return this.monsterClashed(p);
      case 'monsterDamaged': return this.monsterDamaged(p, model);
      case 'monsterDefeated': return this.monsterDefeated(p, model);
      case 'coinsChanged': return this.coinsChanged(p, model);
      case 'upgradeBought': return this.upgradeBought(p);
      case 'soldierBuffed': return this.soldiersBuffed(ev, queue, model);
      case 'gameOver':
        model.phase = 'gameOver';
        model.winner = p.winner;
        model.gameOverReason = p.reason ?? null;
        return;
      default:
        // 知らないイベント（3人以上の playerEliminated など）は演出しない。最後に getState() で合わせる
        return;
    }
  }

  /** first と、そのあとに続けて来た同じ種類のイベントを queue から取り出し、ペイロードの配列で返す */
  takeRun(first, queue) {
    const list = [first.payload];
    while (queue[0]?.type === first.type) list.push(queue.shift().payload);
    return list;
  }

  /** 表示用の状態の兵士を探す */
  modelSoldier(model, playerId, soldierId) {
    return model.players[playerId]?.soldiers.find((x) => x.soldierId === soldierId) ?? null;
  }

  modelMonster(model, monsterId) {
    return model.monsters?.find((m) => m.monsterId === monsterId) ?? null;
  }

  /** 2つの要素の間に「ぶつかった」印を出す */
  async clashBetween(aEl, bEl) {
    if (this.skipping || !aEl || !bEl) return;
    const a = this.centerOf(aEl);
    const b = this.centerOf(bEl);
    const mark = this.fx('fx-clash', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    mark.textContent = ICON.clash;
    const dur = UI_CONFIG.timing.clash;
    this.animate(mark, [
      { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.4)', opacity: 1, offset: 0.35 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
    ], { duration: dur * 1.6, easing: 'ease-out', fill: 'forwards' }).then(() => mark.remove());
    // おたがいに少し前へ飛び出す
    const lunge = (el, to, from) => {
      const dx = (to.x - from.x) * 0.25;
      const dy = (to.y - from.y) * 0.25;
      const token = el.querySelector('.soldier-token, .monster-token') ?? el;
      return this.animate(token, [
        { transform: 'translate(0, 0)' },
        { transform: `translate(${dx}px, ${dy}px)`, offset: 0.4 },
        { transform: 'translate(0, 0)' },
      ], { duration: dur, easing: 'ease-out' });
    };
    await Promise.all([lunge(aEl, b, a), lunge(bEl, a, b)]);
  }

  soldiersClashed({ attacker, defender }) {
    return this.clashBetween(this.renderer.soldierEl(attacker?.soldierId), this.renderer.soldierEl(defender?.soldierId));
  }

  monsterClashed({ attacker, monsterId }) {
    return this.clashBetween(this.renderer.soldierEl(attacker?.soldierId), this.renderer.monsterEl(monsterId));
  }

  async roundStarted({ round }, model) {
    model.round = round;
    // 魔物の「城を攻めるまで」（attackIn）はイベントに入っていないので、演出のあとの getState で合わせる
    this.renderer.setTurnInfo(model.turn, round);
    if (round <= 1) return;
    this.banner(`${ICON.round} ${round}周目`, UI_CONFIG.timing.round, 'small');
    await this.delay(UI_CONFIG.timing.round * 0.5);
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
    const def = this.cards[type] ?? {};
    if (def.kind !== 'weapon' && def.kind !== 'defense') pl.playedThisTurn = true;
    pl.cardsPlayedThisTurn = (pl.cardsPlayedThisTurn ?? 0) + 1;
    if (!def.exhaust) model.discardCount += 1; // 使い切りのカードは捨て札に行かない
    model.hand = model.hand.filter((c) => c.cardId !== cardId);
    let clone;
    let from;
    const app = this.el.app.getBoundingClientRect();
    if (playerId === ctx.viewerId) {
      const taken = this.handView.takeCard(cardId);
      // 演出のあいだは手札を暗くしておく（出せるかどうかは、演出のあと main.js が canPlayCard で決め直す）
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
    await this.delay(UI_CONFIG.timing.discard);
  }

  async soldierDeployed({ playerId, soldierId, type, position, hp, attack, roadId, targetId }, model) {
    const def = this.cards[type] ?? {};
    const s = {
      soldierId, type, hp: hp ?? def.hp, attack: attack ?? def.attack, position, roadId, targetId,
      weapon: null, element: null, shield: 0, statuses: { poison: null, frozen: 0 },
    };
    model.players[playerId].soldiers.push(s);
    this.renderer.addSoldier(playerId, s, { appear: true });
    await this.delay(UI_CONFIG.timing.deploy);
  }

  /** 進軍：ひと続きの進軍はまとめて同時に動かす（城への攻撃はそのあと順番に） */
  async soldiersMoved(first, queue, model) {
    const moves = [first.payload];
    // 戦い・魔物との戦いのイベントをはさんだ先の進軍は、まとめない（ぶつかる前に動いてしまうため）
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

  /** 兵士へのダメージ：続けて来たものはまとめて同時に見せる。盾が受けたぶんと毒は見た目を変える */
  async soldiersDamaged(first, queue, model) {
    const hits = this.takeRun(first, queue);
    const cfg = UI_CONFIG.soldierHit;
    const small = UI_CONFIG.smallNumber;
    const lanes = new Set();
    let anyHit = false;
    for (const h of hits) {
      const blocked = h.blocked ?? 0;
      const dealt = Math.max(0, (h.amount ?? 0) - blocked);
      const s = this.modelSoldier(model, h.playerId, h.soldierId);
      if (s) {
        s.hp = h.hp;
        s.shield = Math.max(0, (s.shield ?? 0) - blocked);
        // 毒のダメージ1回で、毒の残りが1減る（0になれば statusCleared が来る）。量はここで分かる
        if (h.cause === 'poison' && s.statuses?.poison) {
          s.statuses = { ...s.statuses, poison: { amount: h.amount, turns: s.statuses.poison.turns - 1 } };
        }
      }
      this.renderer.updateSoldier(h.soldierId, { hp: h.hp, shield: s?.shield ?? 0, ...(s ? { statuses: s.statuses } : {}) });
      const el = this.renderer.soldierEl(h.soldierId);
      if (!el) continue;
      const poison = h.cause === 'poison';
      if (dealt > 0) {
        anyHit = true;
        el.classList.add(poison ? 'hit-poison' : 'hit');
        lanes.add(this.renderer.laneEl(h.playerId));
        this.number(el, `${poison ? STATUS_ICON.poison : ''}-${dealt}`,
          { size: cfg.numberSize, duration: cfg.numberDuration, kind: poison ? 'poison' : 'damage' });
      }
      if (blocked > 0) {
        el.classList.add('blocked');
        this.number(el, `${ICON.shield}${blocked}`, { size: small.size, duration: small.duration, kind: 'block', dy: dealt > 0 ? -26 : 0 });
      }
    }
    if (anyHit) await this.hitstop(cfg.hitstop);
    for (const h of hits) this.renderer.soldierEl(h.soldierId)?.classList.remove('hit', 'hit-poison', 'blocked');
    for (const lane of lanes) this.shake(lane, cfg.shake, cfg.shakeDuration);
    await this.delay(UI_CONFIG.timing.afterSoldierHit);
  }

  /** 兵士が消える：続けて来たものはまとめて同時に消す */
  async soldiersDestroyed(first, queue, model) {
    const list = this.takeRun(first, queue);
    for (const d of list) {
      const pl = model.players[d.playerId];
      pl.soldiers = pl.soldiers.filter((x) => x.soldierId !== d.soldierId);
      this.renderer.soldierEl(d.soldierId)?.classList.add(d.reason === 'reachedCastle' ? 'arrived' : 'dying');
    }
    await this.delay(UI_CONFIG.timing.soldierDeath);
    for (const d of list) this.renderer.removeSoldier(d.soldierId);
  }

  async spellCast({ playerId, type, target, targetKind }) {
    const def = this.cards[type] ?? {};
    if (targetKind === 'monster') {
      const mEl = this.renderer.monsterEl(target);
      if (mEl) return this.projectile(this.renderer.castleEl(playerId), mEl);
      return undefined;
    }
    const enemy = typeof target === 'string' ? target : this.renderer.opponentOf(playerId);
    if (def.effect === 'damageEnemyCastle') return this.fireball(playerId, enemy);
    if (def.effect === 'damageEnemySoldiers') return this.thunder(enemy);
    if (SPELL_TINT[def.effect]) return this.mist(enemy, SPELL_TINT[def.effect]);
    // 回復などは castleHealed 側で見せる
    return undefined;
  }

  /** 毒の霧・氷の息：相手の兵士の列に色のついた霧をかける */
  async mist(targetId, color) {
    if (this.skipping) return;
    const lane = this.renderer.laneEl(targetId);
    const app = this.el.app.getBoundingClientRect();
    const r = lane.getBoundingClientRect();
    const fog = this.fx('fx-mist');
    fog.style.left = `${r.left - app.left}px`;
    fog.style.top = `${r.top - app.top}px`;
    fog.style.width = `${r.width}px`;
    fog.style.height = `${r.height}px`;
    fog.style.background = `radial-gradient(ellipse at 50% 50%, ${color}, transparent 75%)`;
    const dur = UI_CONFIG.timing.status;
    this.animate(fog, [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }],
      { duration: dur * 1.6, fill: 'forwards' }).then(() => fog.remove());
    await this.delay(dur * 0.5);
  }

  async fireball(fromId, toId) {
    return this.projectile(this.renderer.castleEl(fromId), this.renderer.castleEl(toId));
  }

  /** 火の玉を fromEl から toEl へ飛ばす */
  async projectile(fromEl, toEl) {
    if (this.skipping) return;
    const from = this.centerOf(fromEl);
    const to = this.centerOf(toEl);
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

  async castleDamaged({ playerId, amount, hp, blocked = 0 }, model) {
    const pl = model.players[playerId];
    pl.castleHp = hp;
    if (blocked > 0) {
      pl.armor = Math.max(0, (pl.armor ?? 0) - blocked);
      this.renderer.setArmor(playerId, pl.armor);
    }
    const dealt = Math.max(0, amount - blocked);
    const castle = this.renderer.castleEl(playerId);
    if (blocked > 0 && !this.skipping) {
      const small = UI_CONFIG.smallNumber;
      this.number(castle, `${ICON.armor}${blocked}ふせいだ`, { size: small.size, duration: small.duration, kind: 'block', dy: dealt > 0 ? -34 : 0 });
    }
    if (dealt <= 0) {
      // 城壁がぜんぶ受けた：揺らさず、城壁が光るだけ
      this.renderer.setCastleHp(playerId, hp);
      if (this.skipping) return;
      return this.flashClass(castle, 'armor-block', UI_CONFIG.timing.armor);
    }
    return this.castleHit(playerId, dealt, hp);
  }

  /** 城に当たったときの手応え（ヒットストップ・揺れ・大きな数字。強いほど大きく） */
  async castleHit(playerId, amount, hp) {
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

  // ---------- 武器・防御・状態異常 ----------

  /** 兵士の上に、色のついた光と短い文字を出す */
  async soldierGlow(soldierId, { color, text, className = 'glow', ms }) {
    const el = this.renderer.soldierEl(soldierId);
    if (!el || this.skipping) return;
    el.style.setProperty('--glow', color);
    if (text) {
      const small = UI_CONFIG.smallNumber;
      this.number(el, text, { size: small.size, duration: small.duration, kind: 'buff' });
    }
    await this.flashClass(el, className, ms);
  }

  async weaponEquipped({ playerId, soldierId, type, attack, element }, model) {
    const s = this.modelSoldier(model, playerId, soldierId);
    if (s) Object.assign(s, { weapon: type, attack, element: element ?? null });
    this.renderer.updateSoldier(soldierId, { weapon: type, attack, element: element ?? null });
    const look = ELEMENT_LOOK[element];
    await this.soldierGlow(soldierId, {
      color: look?.color ?? GLOW.weapon,
      text: `${look?.icon ?? '⚔'}${this.cards[type]?.name ?? ''}`,
      ms: UI_CONFIG.timing.equip,
    });
  }

  async shieldAdded({ playerId, soldierId, amount, shield }, model) {
    const s = this.modelSoldier(model, playerId, soldierId);
    if (s) s.shield = shield;
    this.renderer.updateSoldier(soldierId, { shield });
    await this.soldierGlow(soldierId, { color: GLOW.shield, text: `${ICON.shield}+${amount}`, ms: UI_CONFIG.timing.equip });
  }

  /** とぎ石：続けて来たものはまとめて光らせる */
  async soldiersBuffed(first, queue, model) {
    const list = this.takeRun(first, queue);
    const waits = [];
    for (const b of list) {
      const s = this.modelSoldier(model, b.playerId, b.soldierId);
      const before = s?.attack ?? b.attack;
      if (s) s.attack = b.attack;
      this.renderer.updateSoldier(b.soldierId, { attack: b.attack });
      const diff = b.attack - before;
      waits.push(this.soldierGlow(b.soldierId, {
        color: GLOW.buff, text: `⚔${diff > 0 ? `+${diff}` : b.attack}`, ms: UI_CONFIG.timing.equip,
      }));
    }
    await Promise.all(waits);
  }

  async castleArmored({ playerId, armor }, model) {
    model.players[playerId].armor = armor;
    this.renderer.setArmor(playerId, armor);
    if (this.skipping) return;
    const castle = this.renderer.castleEl(playerId);
    const small = UI_CONFIG.smallNumber;
    this.number(castle, `${ICON.armor}+${armor}`, { size: small.size + 6, duration: small.duration, kind: 'block' });
    await this.flashClass(castle, 'armor-up', UI_CONFIG.timing.armor);
  }

  async armorExpired({ playerId }, model) {
    model.players[playerId].armor = 0;
    if (this.skipping) {
      this.renderer.setArmor(playerId, 0);
      return;
    }
    const castle = this.renderer.castleEl(playerId);
    castle.classList.add('armor-fade');
    await this.delay(UI_CONFIG.timing.armor * 0.6);
    castle.classList.remove('armor-fade');
    this.renderer.setArmor(playerId, 0);
  }

  /** 毒・凍結がかかる：続けて来たものはまとめて見せる */
  async statusesApplied(first, queue, model) {
    const list = this.takeRun(first, queue);
    for (const a of list) {
      const s = this.modelSoldier(model, a.playerId, a.soldierId);
      const statuses = { ...(s?.statuses ?? this.renderer.soldier(a.soldierId)?.statuses ?? { poison: null, frozen: 0 }) };
      if (a.status === 'poison') {
        // statusApplied に毒の量はない。量は推測せず（null）、毒のダメージを受けたときか getState で分かる
        statuses.poison = { amount: statuses.poison?.amount ?? null, turns: a.turns };
      } else if (a.status === 'frozen') {
        statuses.frozen = a.turns;
      }
      if (s) s.statuses = statuses;
      this.renderer.updateSoldier(a.soldierId, { statuses });
    }
    if (this.skipping) return;
    const small = UI_CONFIG.smallNumber;
    for (const a of list) {
      const el = this.renderer.soldierEl(a.soldierId);
      if (!el) continue;
      const icon = STATUS_ICON[a.status] ?? '';
      this.number(el, `${icon}${a.status === 'poison' ? '毒' : '凍結'}`, { size: small.size, duration: small.duration, kind: a.status });
      el.classList.add(`apply-${a.status}`);
    }
    await this.delay(UI_CONFIG.timing.status);
    for (const a of list) this.renderer.soldierEl(a.soldierId)?.classList.remove(`apply-${a.status}`);
  }

  async statusCleared({ playerId, soldierId, status }, model) {
    const s = this.modelSoldier(model, playerId, soldierId);
    const statuses = { ...(s?.statuses ?? this.renderer.soldier(soldierId)?.statuses ?? {}) };
    if (status === 'poison') statuses.poison = null;
    if (status === 'frozen') statuses.frozen = 0;
    if (s) s.statuses = statuses;
    this.renderer.updateSoldier(soldierId, { statuses });
    await this.delay(UI_CONFIG.timing.statusCleared);
  }

  // ---------- 魔物とコイン ----------

  async monsterAppeared(p, model) {
    const def = this.monsterDefs?.[p.type] ?? {};
    const m = {
      monsterId: p.monsterId, type: p.type, roadId: p.roadId, square: p.square,
      hp: p.hp, maxHp: p.hp, // 出たときは満タン attack: p.attack, element: p.element ?? null,
      attackIn: def.attackEvery ?? null, reward: def.reward ?? null, castleAttack: def.castleAttack ?? null,
    };
    model.monsters = [...(model.monsters ?? []).filter((x) => x.monsterId !== m.monsterId), m];
    if (this.renderer.monster(m.monsterId)) this.renderer.updateMonster(m.monsterId, m);
    else this.renderer.addMonster(m, { appear: true });
    if (this.skipping) return;
    this.banner(`${monsterIcon(p.type)} ${def.name ?? '魔物'}があらわれた！`, UI_CONFIG.timing.monsterAppear);
    this.shake(this.renderer.el.field, 6, UI_CONFIG.timing.monsterAppear * 0.5);
    await this.delay(UI_CONFIG.timing.monsterAppear);
  }

  async monsterAttackedCastle({ monsterId, playerId, amount, hp }, model) {
    model.players[playerId].castleHp = hp;
    const mEl = this.renderer.monsterEl(monsterId);
    const castle = this.renderer.castleEl(playerId);
    if (mEl && !this.skipping) {
      // 魔物が城へ飛びかかって戻る
      const from = this.centerOf(mEl);
      const to = this.centerOf(castle);
      const token = mEl.querySelector('.monster-token');
      const dx = (to.x - from.x) * 0.7;
      const dy = (to.y - from.y) * 0.7;
      await this.animate(token, [
        { transform: 'translate(0, 0) scale(1)' },
        { transform: `translate(${dx}px, ${dy}px) scale(1.3)`, offset: 0.6 },
        { transform: `translate(${dx}px, ${dy}px) scale(1.3)` },
      ], { duration: UI_CONFIG.timing.monsterAttack, easing: 'ease-in' });
      this.animate(token, [
        { transform: `translate(${dx}px, ${dy}px) scale(1.3)` },
        { transform: 'translate(0, 0) scale(1)' },
      ], { duration: UI_CONFIG.timing.monsterAttack, easing: 'ease-out' });
    }
    if (amount > 0) await this.castleHit(playerId, amount, hp);
    else this.renderer.setCastleHp(playerId, hp);
  }

  async monsterDamaged({ monsterId, amount, hp }, model) {
    const m = this.modelMonster(model, monsterId);
    if (m) m.hp = hp;
    this.renderer.updateMonster(monsterId, { hp });
    const el = this.renderer.monsterEl(monsterId);
    if (!el || this.skipping) return;
    const cfg = UI_CONFIG.monsterHit;
    el.classList.add('hit');
    this.number(el, `-${amount}`, { size: cfg.numberSize, duration: cfg.numberDuration });
    await this.hitstop(cfg.hitstop);
    el.classList.remove('hit');
    this.shake(el.querySelector('.monster-token'), cfg.shake, cfg.shakeDuration);
    await this.delay(UI_CONFIG.timing.afterMonsterHit);
  }

  async monsterDefeated({ monsterId, playerId, reward }, model) {
    model.monsters = (model.monsters ?? []).filter((m) => m.monsterId !== monsterId);
    const el = this.renderer.monsterEl(monsterId);
    if (!el || this.skipping) {
      this.renderer.removeMonster(monsterId);
      return;
    }
    el.classList.add('dying');
    const who = playerId === this.renderer.viewerId ? 'あなた' : '相手';
    this.banner(`とどめ！ ${who}に${ICON.coin}${reward}`, UI_CONFIG.timing.monsterDefeat);
    await this.hitstop(UI_CONFIG.monsterHit.hitstop * 2);
    await this.delay(UI_CONFIG.timing.monsterDefeat * 0.6);
    this.renderer.removeMonster(monsterId);
  }

  async coinsChanged({ playerId, delta, coins }, model) {
    model.players[playerId].coins = coins;
    this.renderer.setCoins(playerId, coins, { bump: true });
    if (this.skipping) return;
    const target = this.renderer.coinEl(playerId);
    if (target && !target.hidden) {
      const small = UI_CONFIG.smallNumber;
      this.number(target, `${ICON.coin}${delta > 0 ? '+' : ''}${delta}`, { size: small.size, duration: small.duration, kind: delta > 0 ? 'coin' : 'block' });
    }
    await this.delay(UI_CONFIG.timing.coins);
  }

  async upgradeBought({ upgradeId }) {
    const def = this.upgradeDefs?.[upgradeId];
    this.banner(`${upgradeIcon(upgradeId)} ${def?.name ?? '強化'}！`, UI_CONFIG.timing.upgrade, 'small');
    await this.delay(UI_CONFIG.timing.upgrade * 0.5);
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
