// Game のイベントを1つずつ演出する。
// 演出しながら「表示用の状態（model）」も進める。最後に main.js が getState() で答え合わせをする。
// 画面をタップすると skip() が呼ばれ、残りの演出は一瞬で終わる。

import { musicScene } from './musicScene.js';
import { UI_CONFIG, scaled } from './config.js';
import { ELEMENT_LOOK, STATUS_ICON, ICON, SPELL_TINT, GLOW, upgradeIcon } from './look.js';
import { sound } from './Sound.js';
import { cardArt, icon, imageArt, weatherIcon } from './art.js';
import { frameAsset } from './cardFrame.js';
import { playerName } from './text.js';
import { mountMiniCard } from './cardView.js';
import { attackOf, attackFrames, impactSvg } from './motion.js';
import { hasAdvantage } from '../game/Elements.js';

const $ = (id) => document.getElementById(id);

export class Animations {
  /**
   * @param {{ renderer: import('./Renderer.js').Renderer,
   *           handView: import('./HandView.js').HandView,
   *           cards: object, rules: object, monsters?: object, upgrades?: object }} opts
   */
  constructor({ renderer, handView, cards, rules, monsters = null, upgrades = null, rarities = null }) {
    this.renderer = renderer;
    this.handView = handView;
    this.cards = cards;
    this.rules = rules;
    this.monsterDefs = monsters;
    this.upgradeDefs = upgrades;
    this.rarities = rarities;
    this.skipping = false;
    this.timers = new Set();     // 待っている delay
    this.running = new Set();    // 動いている Web Animation
    this.el = { app: $('app'), board: $('board'), fx: $('fx-layer') };
    /** 攻撃を受ける向き（ぶつかった・撃たれた直後のダメージで、ノックバックに使う）。要素 → { x, y, weight, weak } */
    this.hitDir = new WeakMap();
    /** とどめを受けた向き（消えるときに、その向きへ吹き飛ぶ） */
    this.koDir = new WeakMap();
    this.applyCssTiming();
    this.buildAmbient();
  }

  /** 背景の小さな動き（風に流れる葉・雲の影）。数は少なく、盤面のじゃまをしない */
  buildAmbient() {
    const box = $('scenery');
    if (!box || box.querySelector('.ambient')) return;
    const layer = document.createElement('div');
    layer.className = 'ambient';
    const amb = UI_CONFIG.ambient;
    let html = '<i class="cloud-shadow"></i><i class="cloud-shadow second"></i>';
    for (let i = 0; i < amb.leaves; i++) {
      const dur = amb.leafMin + Math.random() * (amb.leafMax - amb.leafMin);
      html += `<i class="leaf${i % 3 === 0 ? ' petal' : ''}" style="top:${(8 + Math.random() * 78).toFixed(1)}%;--dur:${dur.toFixed(1)}s;--delay:${(-Math.random() * dur).toFixed(1)}s;--drop:${(30 + Math.random() * 90).toFixed(0)}px;--size:${(9 + Math.random() * 7).toFixed(0)}px"><b></b></i>`;
    }
    layer.innerHTML = html;
    box.appendChild(layer);
  }

  /** config の時間を CSS 変数に反映する */
  applyCssTiming() {
    const t = UI_CONFIG.timing;
    const root = document.documentElement.style;
    root.setProperty('--t-move', `${t.soldierMove * UI_CONFIG.speed}ms`);
    root.setProperty('--t-title', `${t.titleArrival * UI_CONFIG.speed}ms`);
    root.setProperty('--t-deploy', `${t.deploy * UI_CONFIG.speed}ms`);
    root.setProperty('--t-death', `${t.soldierDeath * UI_CONFIG.speed}ms`);
    root.setProperty('--t-heal', `${t.heal * UI_CONFIG.speed}ms`);
    root.setProperty('--t-equip', `${t.equip * UI_CONFIG.speed}ms`);
  }

  // ---------- 飛ばす ----------

  skip() {
    if (this.skipping) return;
    this.skipping = true;
    sound.enabled = false; // 飛ばしているあいだは鳴らさない
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
    sound.enabled = true;
    this.el.app.classList.remove('skipping');
  }

  // ---------- 基本の道具 ----------

  /** ms 待つ（speed 倍率つき。飛ばしているときはすぐ終わる） */
  delay(ms) {
    if (this.skipping || ms <= 0 || UI_CONFIG.speed === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const t = {
        id: setTimeout(() => t.done(), Math.min(UI_CONFIG.maxAnimation, ms * UI_CONFIG.speed)),
        done: () => { clearTimeout(t.id); this.timers.delete(t); resolve(); },
      };
      this.timers.add(t);
    });
  }

  /** Web Animations API のラッパー。終わったら resolve。飛ばしているときは何もしない */
  animate(el, keyframes, { duration, ...opts }) {
    if (this.skipping || UI_CONFIG.speed === 0 || UI_CONFIG.reducedMotion) return Promise.resolve();
    const a = el.animate(keyframes, { duration: Math.min(UI_CONFIG.maxAnimation, duration * UI_CONFIG.speed), ...opts });
    this.running.add(a);
    const end = () => this.running.delete(a);
    return a.finished.then(end, end);
  }

  /** ヒットストップ：動いているものをすべて止めて、少し待つ */
  async hitstop(ms) {
    if (this.skipping || ms <= 0 || UI_CONFIG.reducedMotion) return;
    const paused = document.getAnimations().filter((a) => a.playState === 'running');
    paused.forEach((a) => a.pause());
    await this.delay(ms);
    paused.forEach((a) => { if (a.playState === 'paused') a.play(); });
  }

  shake(el, amplitude, duration) {
    if (UI_CONFIG.reducedMotion) return Promise.resolve();
    const frames = [];
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const k = 1 - i / n;
      const x = (i % 2 ? 1 : -1) * amplitude * k * (0.6 + Math.random() * 0.4);
      const y = (Math.random() - 0.5) * amplitude * k * 0.6;
      frames.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` });
    }
    frames[n] = { transform: 'translate(0, 0)' };
    return this.animate(el, frames, { duration, easing: UI_CONFIG.easing.linear });
  }

  /** 画面ぜんたい（盤面ごと）を揺らす。kind は config の screenShake のキー、power は強さ（ダメージや魔法の値） */
  screenShake(kind, power = 0) {
    const c = UI_CONFIG.screenShake[kind];
    if (!c || this.skipping || power < (c.minPower ?? 0)) return Promise.resolve();
    const amp = Math.min(c.max ?? c.base, c.base + (c.perPower ?? 0) * power);
    return this.shake(this.el.board, amp, c.duration);
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
    const sprites = { 'fx-fireball': 'fireball', 'fx-burst': 'explosion', 'fx-bolt': 'lightning', 'fx-heal-sprite': 'heal' };
    if (sprites[className]) {
      el.classList.add('sprite-fx');
      el.innerHTML = imageArt(`fx/${sprites[className]}.png`, '', 'art');
    }
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
    // ドンと出て、はずんで、少し流れながら上へ消える（毎回すこし傾きと流れる向きを変える）
    const tilt = (Math.random() - 0.5) * (kind === 'damage' || kind === 'weak' ? 14 : 4);
    const drift = (Math.random() - 0.5) * 18;
    this.animate(el, [
      { transform: `${base} scale(2.6) rotate(${tilt * 2}deg)`, opacity: 0 },
      { transform: `${base} scale(.86) rotate(${tilt}deg)`, opacity: 1, offset: 0.12 },
      { transform: `${base} scale(1.12) rotate(${tilt}deg)`, opacity: 1, offset: 0.22 },
      { transform: `${base} scale(1) rotate(${tilt}deg)`, opacity: 1, offset: 0.32 },
      { transform: `${base} translate(${drift * 0.3}px, -8px) scale(1) rotate(${tilt}deg)`, opacity: 1, offset: 0.7 },
      { transform: `${base} translate(${drift}px, -38px) scale(0.85) rotate(${tilt}deg)`, opacity: 0 },
    ], { duration, easing: UI_CONFIG.easing.enter, fill: 'forwards' }).then(() => el.remove());
  }

  flashClass(el, className, ms) {
    el.classList.add(className);
    return this.delay(ms).then(() => el.classList.remove(className));
  }

  banner(text, ms, variant = '') {
    if (this.skipping) return Promise.resolve();
    const el = this.fx(`fx-banner ${variant}`.trim());
    el.textContent = text;
    // 横からすべり込んで止まり、反対側へ抜ける（どちらへ流れたかで「始まり・終わり」が分かる）
    return this.animate(el, [
      { transform: 'translateX(-60%) skewX(-14deg)', opacity: 0, easing: 'cubic-bezier(.1, .8, .2, 1)' },
      { transform: 'translateX(2%) skewX(3deg)', opacity: 1, offset: 0.2 },
      { transform: 'translateX(0) skewX(0)', opacity: 1, offset: 0.3 },
      { transform: 'translateX(-1%) skewX(0)', opacity: 1, offset: 0.76, easing: 'cubic-bezier(.7, 0, .9, .4)' },
      { transform: 'translateX(60%) skewX(-14deg)', opacity: 0 },
    ], { duration: ms, fill: 'forwards' }).then(() => el.remove());
  }

  /** 火花・かけらを飛び散らせる（待たない） */
  sparks({ x, y }, { count = 8, color = '#ffd93b', spread = 60, size = 8 } = {}) {
    if (this.skipping) return;
    for (let i = 0; i < count; i++) {
      const el = this.fx('fx-spark', { x, y });
      el.style.background = color;
      el.style.width = el.style.height = `${size * (0.6 + Math.random() * 0.8)}px`;
      const a = Math.random() * Math.PI * 2;
      const d = spread * (0.5 + Math.random() * 0.7);
      this.animate(el, [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d + 20}px)) scale(0.2) rotate(${Math.random() * 360}deg)`, opacity: 0 },
      ], { duration: 380 + Math.random() * 220, easing: 'cubic-bezier(.2, .7, .4, 1)', fill: 'forwards' }).then(() => el.remove());
    }
  }

  /** 画面全体を一瞬光らせる（決着の一撃） */
  screenFlash(color = '#fff', ms = 420) {
    if (this.skipping) return;
    const el = this.fx('fx-flash');
    el.style.background = color;
    this.animate(el, [{ opacity: 0.85 }, { opacity: 0 }], { duration: ms, easing: UI_CONFIG.easing.enter, fill: 'forwards' }).then(() => el.remove());
  }

  /** 土けむり（assets/fx/dust.png）をひとつ出す（待たない） */
  puff({ x, y }, { size = 34, dx = 0, dy = -10, duration = 420, delay = 0 } = {}) {
    if (this.skipping) return;
    const el = this.fx('fx-puff', { x, y });
    el.style.width = el.style.height = `${size}px`;
    el.innerHTML = imageArt('fx/dust.png', '', 'art');
    this.animate(el, [
      { transform: 'translate(-50%, -50%) scale(.3)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(.6)', opacity: .95, offset: .15 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.1) rotate(30deg)`, opacity: 0 },
    ], { duration, delay: delay * UI_CONFIG.speed, easing: UI_CONFIG.easing.enter, fill: 'both' }).then(() => el.remove());
  }

  /** 当たった瞬間の印（斬撃・突き・爪・星）。angle は攻撃の向き（度） */
  impact({ x, y }, style, { angle = 0, size = 70, color = '#fff', duration = 250 } = {}) {
    if (this.skipping) return;
    const el = this.fx('fx-impact', { x, y });
    el.style.width = el.style.height = `${size}px`;
    el.innerHTML = impactSvg(style, color);
    const base = `translate(-50%, -50%) rotate(${angle}deg)`;
    const frames = style === 'thrust'
      ? [{ transform: `${base} translateX(-30%) scale(.2, 1)`, opacity: 1 }, { transform: `${base} scale(1.15, 1)`, opacity: 1, offset: .45 }, { transform: `${base} translateX(25%) scale(1.3, .25)`, opacity: 0 }]
      : style === 'star'
        ? [{ transform: `${base} scale(.3) rotate(-30deg)`, opacity: 1 }, { transform: `${base} scale(1.15)`, opacity: 1, offset: .4 }, { transform: `${base} scale(.85) rotate(25deg)`, opacity: 0 }]
        : style === 'claw'
          ? [{ transform: `${base} translateX(-35%) scale(.4, 1)`, opacity: 0 }, { transform: `${base} scale(1.1)`, opacity: 1, offset: .4 }, { transform: `${base} translateX(15%) scale(1.2, .8)`, opacity: 0 }]
          // 斬撃：三日月が弧にそって振り抜かれる
          : [{ transform: `${base} rotate(-55deg) scale(.55)`, opacity: 0 }, { transform: `${base} rotate(-8deg) scale(1.05)`, opacity: 1, offset: .38 }, { transform: `${base} rotate(40deg) scale(1.2)`, opacity: 0 }];
    this.animate(el, frames, { duration, easing: UI_CONFIG.easing.enter, fill: 'both' }).then(() => el.remove());
  }

  /** 広がる輪（衝撃波・魔法の命中） */
  ring({ x, y }, { size = 90, color = '#fff', duration = 320 } = {}) {
    if (this.skipping) return;
    const el = this.fx('fx-ring', { x, y });
    el.style.width = el.style.height = `${size}px`;
    el.style.borderColor = color;
    this.animate(el, [
      { transform: 'translate(-50%, -50%) scale(.15)', opacity: 1 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
    ], { duration, easing: 'cubic-bezier(.1, .7, .3, 1)', fill: 'both' }).then(() => el.remove());
  }

  /** がれき・かけら：はね上がって、重さで落ちる（待たない） */
  debris({ x, y }, { count = 8, spread = 60, size = 9, colors = ['#d9cfbb', '#b9ad96', '#8f8572'] } = {}) {
    if (this.skipping) return;
    for (let i = 0; i < count; i++) {
      const el = this.fx('fx-debris', { x, y });
      el.style.background = colors[i % colors.length];
      el.style.width = el.style.height = `${size * (0.6 + Math.random() * 0.8)}px`;
      const dx = (Math.random() - 0.5) * 2 * spread;
      const up = 18 + Math.random() * spread * 0.7;
      const fall = 26 + Math.random() * 40;
      const spin = (Math.random() - 0.5) * 720;
      this.animate(el, [
        { transform: 'translate(-50%, -50%)', opacity: 1, easing: 'cubic-bezier(.2, .7, .5, 1)' },
        { transform: `translate(calc(-50% + ${dx * 0.6}px), calc(-50% - ${up}px)) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.42, easing: 'cubic-bezier(.5, 0, .9, .5)' },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${fall}px)) rotate(${spin}deg)`, opacity: 0 },
      ], { duration: 480 + Math.random() * 260, fill: 'forwards' }).then(() => el.remove());
    }
  }

  /** 兵士か魔物の要素から、動かす部分・攻撃の型・属性を読む */
  unitOf(el) {
    const monster = el.classList.contains('monster');
    const st = monster ? this.renderer.monster(el.dataset.id) : this.renderer.soldier(el.dataset.id);
    return {
      el,
      token: el.querySelector('.soldier-token, .monster-token') ?? el,
      attack: attackOf(el.dataset.motion),
      element: st?.element ?? null,
    };
  }

  /** 足もと（土けむりを出す場所） */
  feetOf(el) {
    const c = this.centerOf(el);
    return { x: c.x, y: c.y + el.getBoundingClientRect().width * 0.28 };
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
          pl.soldiersPlayedThisTurn = 0;
          pl.cardsPlayedThisTurn = 0;
        }
        this.renderer.setTurnInfo(p.turn, model.round);
        this.renderer.setCurrentPlayer(p.playerId);
        if(['wind','earth'].includes(model.players[p.playerId]?.spirit?.spirit)) return this.spiritTriggered({playerId:p.playerId,type:model.players[p.playerId].spirit.type});
        return;
      case 'roundStarted': return this.roundStarted(p, model);
      case 'weatherChanged': return this.weatherChanged(p, model);
      case 'timeChanged': return this.timeChanged(p, model);
      case 'overdriveChanged': return this.overdriveChanged(p, model);
      case 'stageEruption': return this.stageEruption(p);
      case 'weatherLightning': return this.weatherLightning(p);
      case 'attackMissed': return this.attackMissed(p);
      case 'cardsFused': return this.cardsFused(p, model, ctx);
      case 'cardDrawn': return this.cardDrawn(p, model, ctx);
      case 'deckShuffled':
        if (model.deckMode !== 'shared' && p.playerId !== ctx.viewerId) return;
        // drawCardsはシャッフル前に引いた分も最後のcardDrawnにまとめる。
        model.preShuffleDraws = (model.preShuffleDraws ?? 0) + model.deckCount;
        model.deckCount = p.deckCount;
        model.discardCount = 0;
        this.renderer.setPiles(model.deckCount, model.discardCount, { bumpDeck: true });
        sound.play('shuffle');
        this.banner('山札をシャッフル！', UI_CONFIG.timing.shuffle, 'small');
        return this.delay(UI_CONFIG.timing.shuffle * 0.6);
      case 'cardPlayed': return this.cardPlayed(p, model, ctx);
      case 'discardRequired':
        model.phase = 'discard';
        model.discardRequired = p.count;
        return;
      case 'cardDiscarded': return this.cardDiscarded(p, model, ctx);
      case 'soldierDeployed': return this.soldierDeployed(p, model);
      case 'soldierShot': return this.soldierShot(p, model);
      case 'soldierMoved': return this.soldiersMoved(ev, queue, model);
      case 'soldiersClashed': return this.soldiersClashed(p);
      case 'soldierDamaged': return this.soldiersDamaged(ev, queue, model);
      case 'soldierDestroyed': return this.soldiersDestroyed(ev, queue, model);
      case 'spellCast': return this.spellCast(p);
      case 'castleDamaged': return this.castleDamaged(p, model);
      case 'castleHealed': return this.castleHealed(p, model);
      case 'weaponEquipped': return this.weaponEquipped(p, model);
      case 'shieldAdded': return this.shieldAdded(p, model);
      case 'defenseRequested':
        model.phase = 'defend';
        if (p.defenderId === ctx.viewerId) this.banner('防御のチャンス！', 700, 'turn mine');
        return this.delay(p.defenderId === ctx.viewerId ? 500 : 150);
      case 'defenseEnded':
        model.phase = 'main';
        return undefined;
      case 'spiritSummoned': return this.spiritSummoned(p, model);
      case 'spiritTriggered': return this.spiritTriggered(p);
      case 'spiritEnded': return this.spiritEnded(p, model);
      case 'spellReflected': return this.spellReflected();
      case 'soldierDecoyed': return this.soldierDecoyed();
      case 'cardStolen': return this.cardStolen(p, model, ctx);
      case 'castleArmored': return this.castleArmored(p, model);
      case 'armorExpired': return this.armorExpired(p, model);
      case 'castlePoisoned': return this.castlePoisoned(p, model);
      case 'castleCured': return this.castleCured(p, model);
      case 'statusApplied': return this.statusesApplied(ev, queue, model);
      case 'statusCleared': return this.statusCleared(p, model);
      case 'monsterAppeared': return this.monsterAppeared(p, model);
      case 'monsterAttackedCastle': return this.monsterAttackedCastle(p, model);
      case 'monsterClashed': return this.monsterClashed(p);
      case 'monsterDamaged': return this.monsterDamaged(p, model);
      case 'monsterDefeated': return this.monsterDefeated(p, model);
      case 'coinsChanged': return this.coinsChanged(p, model);
      case 'mpChanged': return this.mpChanged(p, model);
      case 'monsterEvolved': return this.monsterEvolved(p, model);
      case 'playerEliminated': return this.playerEliminated(p, model, ctx);
      case 'upgradeBought': return this.upgradeBought(p, model);
      case 'soldierBuffed': return this.soldiersBuffed(ev, queue, model);
      case 'gameOver':
        model.phase = 'gameOver';
        model.winner = p.winner;
        model.winnerTeam = p.winnerTeam;
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

  /**
   * 戦い：おたがいに「ためる → 踏み込む → 当たる」を、種類ごとの型でやる。
   * 当たった瞬間に戻るので、続くダメージのヒットストップが「当たった姿勢」で止まる。
   */
  async clashBetween(aEl, bEl) {
    if (this.skipping || !aEl || !bEl) return;
    const a = this.centerOf(aEl);
    const b = this.centerOf(bEl);
    const ua = this.unitOf(aEl);
    const ub = this.unitOf(bEl);
    const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / dist;
    const uy = (b.y - a.y) / dist;
    // 属性が強い側の攻撃は「弱点」として大きく見せる（相性が有利：倍率>1）
    const weak = (x, y) => hasAdvantage(x.element, y.element);
    this.hitDir.set(bEl, { x: ux, y: uy, weight: ua.attack.weight, weak: weak(ua, ub) });
    this.hitDir.set(aEl, { x: -ux, y: -uy, weight: ub.attack.weight, weak: weak(ub, ua) });
    const at = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dur = UI_CONFIG.timing.clash * 1.5;
    // 2体の「当たる瞬間」をそろえる（重い攻撃ほど、ためが長い）
    const lastHit = (u) => dur * u.attack.time * attackFrames(u.attack.style, 0, 0, 0).hits.at(-1);
    const wait = lastHit(ua) - lastHit(ub);
    const hitA = new Promise((resolve) => {
      this.delay(Math.max(0, -wait)).then(() => this.attackMove(ua, { ux, uy, dist, at, dur, loud: true, onHit: resolve })).then(resolve);
    });
    const hitB = new Promise((resolve) => {
      this.delay(Math.max(0, wait)).then(() => this.attackMove(ub, { ux: -ux, uy: -uy, dist, at, dur, onHit: resolve })).then(resolve);
    });
    await Promise.all([hitA, hitB]);
  }

  /** 1体の攻撃の動き。最後の一撃が当たったら onHit を呼ぶ（もどる動きは待たせない） */
  async attackMove(unit, { ux, uy, dist, at, dur, loud = false, onHit }) {
    if (this.skipping) return;
    const { style, weight, reach, time } = unit.attack;
    const r = Math.max(12, Math.min(48, dist * reach));
    const { frames, hits } = attackFrames(style, ux, uy, r);
    const total = dur * time;
    const angle = Math.atan2(uy, ux) * 180 / Math.PI;
    const color = ELEMENT_LOOK[unit.element]?.color ?? '#fff';
    const move = this.animate(unit.token, frames, { duration: total });
    let prev = 0;
    for (const [i, h] of hits.entries()) {
      await this.delay(total * (h - prev));
      prev = h;
      if (this.skipping) break;
      this.hitMark(at, style, { angle, weight, color, second: i > 0, loud });
    }
    onHit?.();
    await move;
  }

  /** 当たった瞬間：型ごとの印・火花・土けむり・揺れ */
  hitMark(at, style, { angle, weight, color, second, loud }) {
    const pos = { x: at.x + (Math.random() - 0.5) * 10, y: at.y + (Math.random() - 0.5) * 10 };
    const size = 52 + weight * 18;
    const tint = color === '#fff' ? '#fff' : color;
    const field = this.renderer.el.field;
    if (loud || second) sound.play('clash');
    switch (style) {
      case 'smash':
        this.impact(pos, 'star', { size: size * 1.1, color: '#ffe9a0' });
        this.ring(pos, { size: size * 1.8, color: '#fff7df' });
        this.puff(pos, { size: 38, dx: -22, dy: 4 });
        this.puff(pos, { size: 38, dx: 22, dy: 4 });
        this.shake(field, 2 + weight * 2, 200);
        break;
      case 'charge':
        this.impact(pos, 'star', { size, color: '#ffe9a0' });
        this.puff(pos, { size: 42, dy: -14 });
        this.shake(field, 3, 160);
        break;
      case 'cross':
        this.impact(pos, 'cross', { angle: angle + (second ? 42 : -42), size: size * 1.1, color: tint === '#fff' ? '#ffe680' : tint });
        break;
      case 'thrust':
        this.impact(pos, 'thrust', { angle, size: size * 1.25, color: tint });
        break;
      case 'claw':
        this.impact(pos, 'claw', { angle, size: size * 1.05, color: '#ffd9d0' });
        if (weight >= 2) this.shake(field, 4, 180);
        break;
      case 'slam':
      case 'bump':
        this.impact(pos, 'star', { size: size * 0.8, color: '#fff3b8' });
        break;
      default:
        this.impact(pos, 'slash', { angle, size, color: tint });
    }
    this.sparks(pos, { count: Math.round(3 + weight * 2), color: tint === '#fff' ? '#ffd93b' : tint, spread: 24 + weight * 8, size: 6 });
  }

  /** ダメージを受けた反応：攻撃された向きへノックバック（向きが分からない魔法は、上から押しつぶされる） */
  recoil({ el, dir, power, cause }, cfg) {
    const token = el.querySelector('.soldier-token, .monster-token');
    if (!token) return undefined;
    if (cause === 'poison') return this.shake(token, cfg.shake, cfg.shakeDuration);
    if (!dir) {
      return this.animate(token, [
        { transform: 'scale(1.28, .68)', offset: 0.18, easing: UI_CONFIG.easing.enter },
        { transform: 'scale(.92, 1.1)', offset: 0.55 },
        { transform: 'none' },
      ], { duration: cfg.shakeDuration * 1.5 });
    }
    const k = cfg.knockback * power * Math.sqrt(dir.weight ?? 1);
    const kx = dir.x * k;
    const ky = dir.y * k;
    const tilt = (dir.y < 0 ? -1 : 1) * 7 * power;
    return this.animate(token, [
      { transform: `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px) rotate(${tilt.toFixed(1)}deg) scale(.9, 1.1)`, offset: 0.2, easing: 'cubic-bezier(.1, .8, .3, 1)' },
      { transform: `translate(${(kx * 0.85).toFixed(1)}px, ${(ky * 0.85).toFixed(1)}px) rotate(${(tilt * 0.5).toFixed(1)}deg)`, offset: 0.5, easing: UI_CONFIG.easing.inOut },
      { transform: 'none' },
    ], { duration: cfg.shakeDuration * (1.3 + power * 0.4) });
  }

  /** 城に着いた兵士が、城をなぐる（このあと城のダメージ） */
  castleStrike(soldierId, castle) {
    const el = this.renderer.soldierEl(soldierId);
    if (!el || !castle || this.skipping) return undefined;
    const a = this.centerOf(el);
    const b = this.centerOf(castle.querySelector('.castle-pic') ?? castle);
    const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    // 城の真上に重なっているときは、進んできた向き（自分は上へ、相手は下へ）でなぐる
    const far = dist > 24;
    const ux = far ? (b.x - a.x) / dist : 0;
    const uy = far ? (b.y - a.y) / dist : (el.classList.contains('me') ? -1 : 1);
    const at = far ? { x: a.x + (b.x - a.x) * 0.7, y: a.y + (b.y - a.y) * 0.7 } : { x: a.x, y: a.y + uy * 18 };
    return new Promise((resolve) => {
      this.attackMove(this.unitOf(el), { ux, uy, dist: Math.max(dist, 60), at, dur: UI_CONFIG.timing.clash * 1.5, loud: true, onHit: resolve }).then(resolve);
    });
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

  /**
   * コイントス：コインが回って落ち、先攻を知らせる（heads なら表）。タップ・演出なしの設定なら帯だけ
   */
  async coinToss(text, heads = true) {
    sound.play('coin');
    if (this.skipping || UI_CONFIG.speed === 0) {
      this.banner(`🪙 ${text}`, 900, 'small');
      return;
    }
    const wrap = this.fx('coin-toss');
    wrap.innerHTML = '<div class="coin-toss-coin"><span class="face front">表</span><span class="face back">裏</span></div><p class="coin-toss-result" aria-live="polite"></p>';
    const coin = wrap.querySelector('.coin-toss-coin');
    const turns = heads ? 5 : 5.5; // 表なら整数回、裏なら半回転多く回す
    await this.animate(coin, [
      { transform: 'translateY(0) rotateY(0deg)' },
      { transform: `translateY(-110px) rotateY(${turns * 180}deg)`, offset: 0.5, easing: 'ease-in' },
      { transform: `translateY(0) rotateY(${turns * 360}deg)` },
    ], { duration: 1100, fill: 'forwards', easing: 'ease-out' });
    wrap.querySelector('.coin-toss-result').textContent = `${heads ? '表' : '裏'}！ ${text}`;
    sound.play('coin');
    await this.delay(800);
    wrap.remove();
  }

  /** 昼と夜が変わる：盤面を暗く（明るく）して、帯で知らせる */
  async timeChanged({ time, rounds }, model) {
    model.time = time;
    model.nightRoundsLeft = rounds;
    this.renderer.setTime(time, rounds);
    sound.setScene(musicScene(model));
    if (this.skipping) return;
    sound.play(time === 'night' ? 'freeze' : 'heal');
    await this.banner(time === 'night' ? '🌙 夜になった！ 獣と暗殺者が強くなる' : '☀️ 夜が明けた', UI_CONFIG.timing.round, 'small');
  }

  /** 背水の陣：城が赤く燃え、兵士の攻撃が上がる。BGM がピンチに変わる */
  async overdriveChanged({ playerId, active, attack }, model) {
    for (const p of Object.values(model.players)) if ((p.castleOwner ?? null) === playerId || p === model.players[playerId]) p.overdrive = active;
    this.renderer.setOverdrive(playerId, active);
    sound.setScene(musicScene(model));
    if (this.skipping || !active) return;
    sound.play('fire');
    this.screenShake('spell', 9);
    await this.banner(`🔥 背水の陣！ ${playerName(playerId)}の兵士の攻撃+${attack}`, UI_CONFIG.timing.round, 'small');
  }

  /** 溶岩の噴火：その道のマスに炎を噴き上げる（このあと兵士の soldierDamaged・やけど） */
  async stageEruption({ roadId }) {
    if (this.skipping) return;
    sound.play('fire');
    this.screenShake('spell', 8);
    this.mist(null, 'rgba(255, 96, 32, 0.55)', roadId === 'plaza' ? undefined : roadId);
    await this.banner('🌋 噴火！', UI_CONFIG.timing.round * 0.8, 'small');
  }

  async weatherChanged({ weather, name, icon: glyph, description, rounds, cause, previous, previousName }, model) {
    model.weather = weather ? { type: weather, name, icon: glyph, description, roundsLeft: rounds } : null;
    this.renderer.setWeather(model.weather);
    if (this.skipping || UI_CONFIG.speed === 0) return;
    const timing = UI_CONFIG.timing;

    if (!weather) {
      await this.weatherNotice({
        tone: 'neutral', type: previous, name: '通常の天候に戻った',
        description: previousName ? `${previousName}の効果が終了しました` : '',
        duration: timing.weatherEnd,
      });
      return;
    }

    const tone = UI_CONFIG.weatherTone[weather] ?? 'alert';
    sound.play(tone === 'alert' ? 'weatherSiren' : tone === 'calm' ? 'weatherRain' : 'weatherChime');
    const alarm = this.fx('weather-alarm');
    alarm.dataset.tone = tone;
    this.screenShake('weather');
    const animation = this.animate(alarm, [
      { opacity: 0 }, { opacity: .9, offset: .13 }, { opacity: .64, offset: .7 }, { opacity: 0 },
    ], { duration: timing.weatherAlarm, fill: 'forwards' });
    try {
      await Promise.all([animation, this.weatherNotice({
        tone, type: weather, glyph, name, description, duration: timing.weatherAlarm,
        caption: cause === 'card' ? '天候の呪文' : tone === 'alert' ? '天候警報' : '天候が変化',
      })]);
    } finally {
      alarm.remove();
    }
  }

  async weatherNotice({ tone, type, name, glyph, caption, description, duration }) {
    const notice = this.fx('weather-notice');
    notice.dataset.tone = tone;
    const heading = document.createElement('strong');
    heading.className = 'weather-notice-title';
    heading.textContent = name;
    notice.append(weatherIcon(type, glyph));
    if (caption) {
      const source = document.createElement('span');
      source.className = 'weather-notice-caption';
      source.textContent = caption;
      notice.append(source);
    }
    notice.append(heading);
    if (description) {
      const text = document.createElement('p');
      text.className = 'weather-notice-description';
      text.textContent = description;
      notice.append(text);
    }
    try {
      await Promise.all([
        this.animate(notice, [
          { translate: '0 -12px', opacity: 0 }, { translate: '0 0', opacity: 1, offset: .14 },
          { translate: '0 0', opacity: 1, offset: .83 }, { translate: '0 -5px', opacity: 0 },
        ], { duration, easing: UI_CONFIG.easing.enter, fill: 'forwards' }),
        this.delay(duration),
      ]);
    } finally {
      notice.remove();
    }
  }

  /** 大雨の雷。落ちた城を示し、実際の被害は続く城ダメージのイベントで出す。 */
  async weatherLightning({ playerId }) {
    if (this.skipping || UI_CONFIG.speed === 0) return;
    sound.play('thunder');
    this.screenShake('weather');
    const castle = this.renderer.castleEl(playerId);
    const duration = UI_CONFIG.timing.lightning;

    if (castle && !UI_CONFIG.reducedMotion) {
      const target = this.centerOf(castle.querySelector('.castle-pic') ?? castle);
      const board = this.el.board;
      const top = board.getBoundingClientRect().top - this.el.app.getBoundingClientRect().top;
      const bolt = this.fx('fx-bolt');
      bolt.style.left = `${target.x}px`;
      bolt.style.top = `${top}px`;
      bolt.style.height = `${Math.max(38, target.y - top)}px`;
      this.animate(bolt, [
        { opacity: 0 }, { opacity: 1, offset: .16 }, { opacity: 0 },
      ], { duration, fill: 'forwards' }).then(() => bolt.remove());
      this.impact(target, 'star', { size: 100, color: '#fff2ae', duration: duration * .65 });
    }
    await this.weatherNotice({
      tone: 'alert', type: 'heavyRain', name: `${playerName(playerId)}の城に落雷`, duration,
    });
  }

  /** 霧で攻撃が外れた：外した兵士・魔物の上に「ミス！」。魔法のときは帯 */
  async attackMissed({ soldierId, monsterId, kind }) {
    if (this.skipping) return;
    const el = soldierId ? this.renderer.soldierEl(soldierId) : monsterId ? this.renderer.monsterEl(monsterId) : null;
    sound.play('deny');
    if (el) {
      const small = UI_CONFIG.smallNumber;
      this.number(el, 'ミス！', { size: small.size * 1.2, duration: small.duration, kind: 'block' });
    } else {
      this.banner(kind === 'spell' ? '🌫️ 魔法が外れた！' : 'ミス！', UI_CONFIG.timing.shuffle, 'small');
    }
    await this.delay(UI_CONFIG.timing.afterSoldierHit);
  }

  async cardsFused({ playerId, cardIds, cardId, from, to }, model, ctx) {
    const wild = model.hand?.some(c => cardIds?.includes(c.cardId) && this.cards[c.type]?.effect === 'wild');
    const pl = model.players[playerId];
    pl.handCount = Math.max(0, pl.handCount - 1);
    if (playerId === ctx.viewerId) {
      model.hand = model.hand.filter((c) => !cardIds.includes(c.cardId));
      model.hand.push({ cardId, type: to });
      this.handView.render(model.hand, { newIds: [cardId] });
    } else this.renderer.setOppHandCount(pl.handCount);
    if (this.skipping) return;
    if (playerId !== ctx.viewerId) { await this.banner('相手がカードを合成！', UI_CONFIG.timing.fusion, 'fusion'); return; }
    const center = this.centerOf(this.renderer.el.field);
    const stage = this.fx('fx-fusion-stage', center);
    const rarity = this.rarities?.[this.cards[to]?.rarity];
    const color = rarity?.color ?? '#d6b354';
    stage.style.setProperty('--rarity', color);
    // レアリティが高いほど、光・火花・揺れが大きく、長くなる
    const chain = Object.keys(this.rarities ?? {}).filter((id) => !this.rarities[id].special);
    const rank = Math.max(0, chain.indexOf(this.cards[to]?.rarity));
    sound.play(wild ? 'adaptFusion' : 'fusion', rank / Math.max(1, chain.length - 1));
    stage.classList.toggle('adapt-fusion', Boolean(wild));
    const total = Math.min(1600, UI_CONFIG.timing.fusion + rank * 100);
    const glow = this.fx('fx-fusion-glow', center);
    glow.style.background = wild ? 'conic-gradient(#ff7b9c,#ffdf7a,#89eebc,#8abaff,#d79aff,#ff7b9c)' : `radial-gradient(circle, #fff 0%, ${color} 35%, transparent 70%)`;
    if (wild) glow.style.borderRadius = '50%';
    this.animate(glow, [{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(.6)', opacity: .9, offset: .45 }, { transform: `scale(${1.6 + rank * .35})`, opacity: 0 }], { duration: total, fill: 'forwards' }).then(() => glow.remove());
    for (const side of [0, 1]) {
      const inputType = wild && side === 0 ? 'adapt' : from;
      const el = this.effectCard(inputType, this.cards[inputType]?.name); stage.append(el);
      this.animate(el, [
        { transform: `translate(${side ? 150 : -150}px, 20px) rotate(${side ? 20 : -20}deg) scale(.9)`, opacity: 0 },
        { transform: `translate(${side ? 80 : -80}px, 0) rotate(${side ? 12 : -12}deg)`, opacity: 1, offset: .18 },
        { transform: 'translate(0, 0) scale(.75)', opacity: 1, offset: .45, easing: 'cubic-bezier(.6, 0, .9, .5)' },
        { transform: 'scale(.2)', opacity: 0, offset: .6 }, { opacity: 0 },
      ], { duration: total, fill: 'forwards' });
    }
    const result = this.effectCard(to, this.cards[to]?.name); stage.append(result);
    this.delay(total * .55).then(() => {
      if (this.skipping) return;
      this.ring(center, { size: 140 + rank * 40, color, duration: 420 });
      this.sparks(center, { count: 10 + rank * 6, color, spread: 70 + rank * 25, size: 7 + rank });
      this.shake(this.renderer.el.field, 3 + rank * 2, 260);
      if (rank >= 3) this.screenFlash(color, 300 + rank * 60);
    });
    const label = document.createElement('strong'); label.className = 'reward-heading';
    label.textContent = `${this.cards[to]?.name ?? ''}に合成！ ${rarity?.name ?? ''}`;
    label.style.cssText = 'position:absolute;left:50%;top:92px;transform:translateX(-50%);white-space:nowrap;opacity:0';
    stage.append(label);
    this.animate(label, [{ opacity: 0 }, { opacity: 0, offset: .6 }, { opacity: 1, offset: .72 }, { opacity: 1, offset: .9 }, { opacity: 0 }], { duration: total, fill: 'forwards' });
    await this.animate(result, [{ transform: 'scale(.1)', opacity: 0 }, { transform: 'scale(.1)', opacity: 0, offset: .4 }, { transform: 'scale(1.25)', opacity: 1, offset: .62 }, { transform: 'scale(1)', opacity: 1, offset: .8 }, { transform: 'translateY(40px) scale(.6)', opacity: 0 }], { duration: total, fill: 'forwards' });
    stage.remove();
  }

  effectCard(type, name) {
    const el = document.createElement('div'); el.className = 'effect-card';
    const def = type ? this.cards[type] : null;
    if (def && frameAsset(def, this.rarities)) {
      mountMiniCard(el, type, def, this.rarities);
      return el;
    }
    const art = document.createElement('div'); art.className = 'effect-card-art';
    art.innerHTML = type ? cardArt(type, 'blue', name ?? '') : icon('card');
    const label = document.createElement('b'); label.textContent = name ?? '相手の報酬カード';
    el.append(art, label); return el;
  }

  async revealReward(reward, cardId, ctx) {
    if (this.skipping) return;
    const mine = reward.playerId === ctx.viewerId;
    const card = mine ? ctx.lookupCard(cardId) : null;
    const rarity = this.rarities?.[reward.rarity];
    const chain = Object.keys(this.rarities ?? {}).filter((id) => !this.rarities[id].special);
    const rank = Math.max(0, chain.indexOf(reward.rarity));
    const cfg = UI_CONFIG.rewardFx;
    const duration = Math.min(cfg.max, cfg.base + rank * cfg.perRank + (reward.lucky ? cfg.luckyExtra : 0));
    const stage = this.fx(`fx-reward-stage${reward.lucky ? ' lucky' : ''}`, this.centerOf(this.renderer.el.field));
    stage.style.setProperty('--rarity', rarity?.color ?? '#d6b354');
    stage.dataset.rarity = reward.rarity;
    const heading = document.createElement('strong'); heading.className = 'reward-heading';
    heading.textContent = reward.lucky ? `ラッキー！ ${this.rarities?.[reward.base]?.name ?? ''} → ${rarity?.name ?? ''}` : `${mine ? 'あなた' : '相手'}が${rarity?.name ?? ''}カード獲得！`;
    stage.append(heading, this.effectCard(card?.type, card ? this.cards[card.type]?.name : '相手の報酬カード'));
    const badge = document.createElement('span'); badge.className = 'reward-rarity'; badge.textContent = rarity?.name ?? ''; stage.append(badge);
    sound.play(reward.lucky ? 'lucky' : 'fusion');
    this.sparks(this.centerOf(this.renderer.el.field), { count: cfg.sparksBase + rank * cfg.sparksPerRank, color: rarity?.color ?? '#ffdf82', spread: 50 + rank * 20, size: 6 + rank });
    if (rank === chain.length - 1) this.screenFlash(rarity.color, duration * .4);
    try {
      await this.animate(stage, [{ opacity: 0, transform: 'translate(-50%, -50%) scale(.4)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1.08)', offset: .18 }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: .8 }, { opacity: 0, transform: `translate(-50%, calc(-50% + ${mine ? 65 : -65}px)) scale(.5)` }], { duration, fill: 'forwards' });
    } finally { stage.remove(); }
  }

  async recruitBeast(piece, destination, mine) {
    if (this.skipping || UI_CONFIG.speed === 0) return;
    const def = this.cards[piece.type];
    if (!def) return;
    const center = this.centerOf(this.renderer.el.field);
    const bounds = this.el.app.getBoundingClientRect();
    const start = piece.from ?? center;
    const rect = destination?.getBoundingClientRect();
    const end = rect?.width ? {
      x: Math.max(32, Math.min(bounds.width - 32, rect.left + rect.width / 2 - bounds.left)),
      y: rect.top + rect.height / 2 - bounds.top,
    } : this.centerOf(document.getElementById(mine ? 'hand-count' : 'turn-status'));
    const stage = this.fx('recruit-stage', center);
    const rune = this.fx('recruit-sigil', start);
    const title = document.createElement('strong');
    title.className = 'recruit-heading';
    title.textContent = mine ? '魔物の駒を獲得' : '相手が魔物の駒を獲得';
    const badge = document.createElement('span');
    badge.className = 'recruit-count';
    badge.textContent = mine ? '手札に＋1枚' : '相手の手札に＋1枚';
    const card = this.effectCard(piece.type, def.name);
    stage.append(title, card, badge);
    const timing = UI_CONFIG.timing;
    sound.play('beastRecruit');
    try {
      if (UI_CONFIG.reducedMotion) {
        rune.remove();
        await this.delay(timing.beastRecruitStill);
        return;
      }
      if (destination && rect?.width) destination.style.visibility = 'hidden';
      const duration = timing.beastRecruit;
      this.sparks(start, { color: '#a9ffd7', count: 13, size: 6, spread: 94, duration: duration * .5 });
      this.ring(start, { color: '#68dda4', size: 160, duration: 360 });
      const gleam = document.createElement('span');
      gleam.className = 'recruit-gleam';
      card.append(gleam);
      const crest = document.createElement('span');
      crest.className = 'recruit-crest';
      stage.prepend(crest);
      const sourceX = start.x - center.x;
      const sourceY = start.y - center.y;
      const x = end.x - center.x;
      const y = end.y - center.y;
      const pose = (x, y, scale, roll, yaw = 0) =>
        `translate(-50%, -50%) translate(${x}px, ${y}px) perspective(650px) rotateY(${yaw}deg) rotate(${roll}deg) scale(${scale})`;
      await Promise.all([
        this.animate(crest, [
          { opacity: 0, scale: .5, rotate: '-45deg' },
          { opacity: .9, scale: 1, rotate: '0deg', offset: .38 },
          { opacity: .68, scale: 1.12, rotate: '15deg', offset: .65 },
          { opacity: 0, scale: 1.25, rotate: '36deg', offset: .88 },
          { opacity: 0 },
        ], { duration, fill: 'both' }),
        this.animate(gleam, [
          { opacity: 0, backgroundPosition: '110% 0' },
          { opacity: 0, backgroundPosition: '110% 0', offset: .24 },
          { opacity: 1, backgroundPosition: '62% 0', offset: .38 },
          { opacity: 0, backgroundPosition: '-15% 0', offset: .57 },
          { opacity: 0 },
        ], { duration, fill: 'both' }),
        this.animate(rune, [
          { opacity: 0, scale: .25, rotate: '-30deg' },
          { opacity: .95, scale: 1.05, rotate: '35deg', offset: .38 },
          { opacity: 0, scale: 1.6, rotate: '75deg' },
        ], { duration: duration * .58, fill: 'both' }),
        this.animate(stage, [
          { transform: pose(sourceX, sourceY, .14, -23, 62), opacity: 0 },
          { transform: pose(sourceX * .24, sourceY * .2 - 18, .75, -10, -32), opacity: 1, offset: .22, easing: UI_CONFIG.easing.enter },
          { transform: pose(0, -6, 1.08, 3), opacity: 1, offset: .38 },
          { transform: pose(0, 0, 1, 0), opacity: 1, offset: .67, easing: UI_CONFIG.easing.exit },
          { transform: pose(x * .43, y * .38 - 22, .69, 12), opacity: .98, offset: .83 },
          { transform: pose(x, y, .39, 0), opacity: 0 },
        ], { duration, fill: 'both' }),
      ]);
      if (destination && rect?.width && !this.skipping) {
        this.ring(end, { color: '#9effc5', size: 64, duration: 170 });
      }
    } finally {
      stage.remove();
      rune.remove();
      if (destination) destination.style.visibility = '';
    }
  }

  async cardDrawn({ playerId, cardIds }, model, ctx) {
    const pl = model.players[playerId];
    // 駒は魔物撃破直後の別イベント。ごほうびと山札のドローから独立して扱う。
    const piece = pl.pendingPiece;
    delete pl.pendingPiece;
    if (!piece && pl.pendingReward) {
      const reward = pl.pendingReward; delete pl.pendingReward;
      await this.revealReward(reward, cardIds[0], ctx);
    }
    for (const [index, cardId] of cardIds.entries()) {
      const isPiece = Boolean(piece && index === 0);
      pl.handCount += 1;
      if (isPiece) {
        // オンラインで相手に見せないIDは、枚数表示だけに使う。
        if (!cardId.startsWith('hidden-')) model.pieceCards.add(cardId);
      } else if (pl.generatedDraws > 0) pl.generatedDraws -= 1;
      else if (pl.luck?.draws > 0) {
        pl.luck.draws -= 1;
        if (!pl.luck.draws) pl.luck = null;
      } else if (model.deckMode !== 'shared' && playerId !== ctx.viewerId) { /* 相手の山札は自分の表示に反映しない */ }
      else if (model.preShuffleDraws > 0) model.preShuffleDraws -= 1;
      else model.deckCount = Math.max(0, model.deckCount - 1);
      this.renderer.setPiles(model.deckCount, model.discardCount, { bumpDeck: !isPiece });
      const mine = playerId === ctx.viewerId;
      if (mine) {
        const card = ctx.lookupCard(cardId);
        if (card) {
          model.hand.push(card);
          this.handView.addCard(card);
          if (!isPiece) {
            this.flyFromDeck(card);
            sound.play('draw');
          }
        }
      } else {
        this.renderer.setOppHandCount(pl.handCount);
      }
      if (isPiece) await this.recruitBeast(piece, mine ? this.handView.cardEl(cardId) : null, mine);
      else await this.delay(UI_CONFIG.timing.draw);
    }
  }

  /** 引いたカードが、山札から手札の入る場所へ飛んでくる（待たない。着くまで手札の方は隠す） */
  flyFromDeck(card) {
    const el = this.handView.cardEl(card.cardId);
    const pile = this.renderer.el.deckPile;
    if (!el || !pile || this.skipping || UI_CONFIG.reducedMotion || UI_CONFIG.speed === 0) return;
    const app = this.el.app.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!r.width) return; // 手札をたたんでいる
    const from = this.centerOf(pile.getClientRects().length ? pile : document.getElementById('hud'));
    const to = { x: Math.max(r.width / 2, Math.min(app.width - r.width / 2, r.left - app.left + r.width / 2)), y: r.top - app.top + r.height / 2 };
    const clone = el.cloneNode(true);
    clone.classList.remove('new', 'selected', 'dim');
    clone.classList.add('fx-card');
    clone.style.left = `${to.x}px`;
    clone.style.top = `${to.y}px`;
    clone.style.width = `${r.width}px`;
    clone.style.height = `${r.height}px`;
    this.el.fx.appendChild(clone);
    el.classList.remove('new');
    el.style.visibility = 'hidden';
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    const base = 'translate(-50%, -50%)';
    this.animate(clone, [
      { transform: `${base} translate(${dx}px, ${dy}px) scale(.18) rotate(-30deg)`, opacity: 0.7, easing: 'cubic-bezier(.3, .6, .3, 1)' },
      { transform: `${base} translate(${dx * 0.2}px, ${Math.min(-30, dy * 0.12)}px) scale(1.15) rotate(6deg)`, opacity: 1, offset: 0.68, easing: UI_CONFIG.easing.exit },
      { transform: `${base} translate(0, 4px) scale(1.03, .96)`, offset: 0.9 },
      { transform: `${base} scale(1)` },
    ], { duration: UI_CONFIG.timing.drawFly, fill: 'forwards' }).then(() => {
      clone.remove();
      el.style.visibility = '';
    });
  }

  async cardPlayed({ playerId, cardId, type, free }, model, ctx) {
    if (this.cards[type]?.effect === 'gainMp') model.players[playerId].manaCard = type;
    const pl = model.players[playerId];
    const def = this.cards[type] ?? {};
    // 神頼みでタダで出したカード（free）は、山札の上から直接出る。手札は減らない
    if (free && (model.deckMode === 'shared' || playerId === ctx.viewerId)) model.deckCount = Math.max(0, model.deckCount - 1);
    if (!free) pl.handCount = Math.max(0, pl.handCount - 1);
    if (!free && def.kind === 'soldier') pl.soldiersPlayedThisTurn = (pl.soldiersPlayedThisTurn ?? 0) + 1;
    else if (!free && def.kind === 'spell' && !['summonSpirit', 'gainCoins', 'gainMp'].includes(def.effect)) pl.playedThisTurn = true;
    pl.cardsPlayedThisTurn = (pl.cardsPlayedThisTurn ?? 0) + 1;
    if (!def.exhaust && def.monster === undefined && (model.deckMode === 'shared' || playerId === ctx.viewerId)) model.discardCount += 1;
    model.pieceCards.delete(cardId);
    model.hand = model.hand.filter((c) => c.cardId !== cardId);
    let clone;
    let from;
    const app = this.el.app.getBoundingClientRect();
    if (free) {
      // 手札からではなく、画面の上から出てくる
    } else if (playerId === ctx.viewerId) {
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
    sound.play('card');

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
    // 少し沈んでから（ため）、傾きながら盤面へ飛び、ドンと止まって見せる。レアなカードほど光が大きい
    const lean = Math.max(-14, Math.min(14, dx * 0.08));
    const cardAnimation = this.animate(clone, [
      { transform: `${base} translate(0, 0) scale(1)` },
      { transform: `${base} translate(0, 8px) scale(.94, .9)`, offset: 0.07, easing: 'cubic-bezier(.2, .7, .3, 1)' },
      { transform: `${base} translate(${dx}px, ${dy}px) scale(1.86) rotate(${lean}deg)`, offset: 0.33 },
      { transform: `${base} translate(${dx}px, ${dy}px) scale(1.66) rotate(0deg)`, offset: 0.42 },
      { transform: `${base} translate(${dx}px, ${dy}px) scale(1.7)`, opacity: 1, offset: 0.75, easing: UI_CONFIG.easing.exit },
      { transform: `${base} translate(${dx}px, ${dy - 30}px) scale(1.4)`, opacity: 0 },
    ], { duration: dur, fill: 'forwards' }).then(() => clone.remove());
    const rank = Math.max(0, Object.keys(this.rarities ?? {}).indexOf(def.rarity));
    const shine = this.rarities?.[def.rarity]?.color ?? '#fff7df';
    this.delay(dur * 0.33).then(() => {
      this.ring(to, { size: 170 + rank * 34, color: shine, duration: 300 + rank * 40 });
      if (rank >= 2) this.sparks(to, { count: 3 + rank * 3, color: shine, spread: 70 + rank * 16, size: 7 });
    });
    // 防御の帯はカードが消えてから見せる。ほかの効果は従来どおり重ねてテンポを保つ。
    if (type === 'reflect' || type === 'decoy') await cardAnimation;
    else await this.delay(dur * 0.7);
  }

  async cardDiscarded({ playerId, cardIds }, model, ctx) {
    const pl = model.players[playerId];
    pl.handCount = Math.max(0, pl.handCount - cardIds.length);
    if (model.deckMode === 'shared' || playerId === ctx.viewerId) {
      model.discardCount += cardIds.filter(id => !model.pieceCards.has(id)).length;
    }
    for (const id of cardIds) model.pieceCards.delete(id);
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
      role: def.role ?? 'melee', range: def.range, turnsLeft: def.stay ?? null,
      soldierId, type, hp: hp ?? def.hp, attack: attack ?? def.attack, position, roadId, targetId,
      weapon: null, element: null, shield: 0, statuses: { poison: null, frozen: 0 },
    };
    model.players[playerId].soldiers.push(s);
    this.renderer.addSoldier(playerId, s, { appear: false });
    sound.play('deploy');
    const dEl = this.renderer.soldierEl(soldierId);
    if (dEl && !this.skipping) await this.enterField(dEl, playerId);
    else await this.delay(UI_CONFIG.timing.deploy);
  }

  /** 登場：兵士は自分の城から飛び出して着地する。魔法使いは魔法陣からあらわれる */
  async enterField(el, playerId) {
    const token = el.querySelector('.soldier-token');
    const here = this.centerOf(el);
    const dur = UI_CONFIG.timing.deploy * 1.5;
    if (el.dataset.motion === 'mage') {
      this.ring(here, { size: 96, color: '#c79bff', duration: dur });
      this.sparks(here, { count: 7, color: '#d9b8ff', spread: 34, size: 7 });
      await this.animate(token, [
        { transform: 'translateY(-10px) scale(.1, 1.6) rotate(-90deg)', opacity: 0 },
        { transform: 'translateY(-8px) scale(1.15) rotate(8deg)', opacity: 1, offset: 0.6, easing: UI_CONFIG.easing.enter },
        { transform: 'none' },
      ], { duration: dur });
      return;
    }
    const castle = this.centerOf(this.renderer.castleEl(playerId).querySelector('.castle-pic'));
    // 攻撃力・HP の札は、着地してから出す
    const stats = el.querySelector('.soldier-stats');
    if (stats) this.animate(stats, [{ opacity: 0 }, { opacity: 0, offset: 0.75 }, { opacity: 1 }], { duration: dur });
    const scale = this.renderer.isPlaza ? this.renderer.plazaScale || 1 : 1;
    const dx = (castle.x - here.x) / scale;
    const dy = (castle.y - here.y) / scale;
    const heavy = ['giant', 'heavy'].includes(el.dataset.motion);
    await this.animate(token, [
      { transform: `translate(${dx}px, ${dy}px) scale(.3)`, opacity: 0, easing: 'cubic-bezier(.2, .6, .4, 1)' },
      { transform: `translate(${dx * 0.75}px, ${dy * 0.75}px) scale(.6)`, opacity: 1, offset: 0.18 },
      { transform: `translate(${dx * 0.25}px, ${dy * 0.25 - 26}px) scale(1.06, 1.1)`, offset: 0.6, easing: 'cubic-bezier(.6, 0, 1, .7)' },
      { transform: 'translate(0, 0) scale(1.22, .78)', offset: 0.8, easing: UI_CONFIG.easing.enter },
      { transform: 'translate(0, 0) scale(.95, 1.06)', offset: 0.9 },
      { transform: 'none' },
    ], { duration: dur * (heavy ? 1.25 : 1) });
    if (this.skipping) return;
    const feet = this.feetOf(el);
    this.puff(feet, { size: heavy ? 44 : 30, dx: -16, dy: -4 });
    this.puff(feet, { size: heavy ? 44 : 30, dx: 16, dy: -4 });
    if (heavy) this.shake(this.renderer.el.field, 4, 200);
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
    let duration = 0;
    for (const m of moves) {
      const s = model.players[m.playerId].soldiers.find((x) => x.soldierId === m.soldierId);
      if (s) {s.position = m.to; s.place = null;}
      const el = this.renderer.soldierEl(m.soldierId);
      const speed = this.cards[s?.type]?.speed ?? 1;
      const ms = UI_CONFIG.timing.soldierMove * Math.max(.65, Math.abs(m.to-m.from)/Math.max(speed,1));
      duration = Math.max(duration, ms);
      if (el) {
        el.style.transitionDuration = `${ms*UI_CONFIG.speed}ms`;
        el.classList.add('walking'); // 歩き方は種類ごと（css/motion.css）
        // 騎兵は走り出しに土けむりを残す
        if (el.dataset.motion === 'rider' && !this.skipping) {
          const feet = this.feetOf(el);
          this.puff(feet, { size: 30 });
          this.puff(feet, { size: 26, delay: ms * 0.3, dy: -6 });
        }
      }
      this.renderer.moveSoldier(m.soldierId, m.to);
    }
    this.renderer.layoutStacks();
    sound.play('step');
    await this.delay(duration || UI_CONFIG.timing.soldierMove);
    for (const m of moves) {
      const el = this.renderer.soldierEl(m.soldierId);
      if (!el) continue;
      el.style.removeProperty('transition-duration');
      el.classList.remove('walking');
      this.settle(el);
    }
  }

  /** 止まった瞬間：体が沈んで戻る（重い兵士は地面が揺れる。待たない） */
  settle(el) {
    if (this.skipping) return;
    const motion = el.dataset.motion;
    const heavy = motion === 'giant' || motion === 'heavy';
    const token = el.querySelector('.soldier-token');
    this.animate(token, [
      { transform: `scale(${heavy ? 1.2 : 1.12}, ${heavy ? 0.8 : 0.88})`, offset: 0.3, easing: UI_CONFIG.easing.enter },
      { transform: 'scale(.97, 1.04)', offset: 0.65 },
      { transform: 'none' },
    ], { duration: heavy ? 260 : 190 });
    if (heavy || motion === 'rider') this.puff(this.feetOf(el), { size: heavy ? 40 : 28, dy: -4 });
    if (motion === 'giant') this.shake(this.renderer.el.field, 3, 160);
  }

  /** 兵士へのダメージ：続けて来たものはまとめて同時に見せる。盾が受けたぶんと毒は見た目を変える */
  async soldiersDamaged(first, queue, model) {
    const hits = this.takeRun(first, queue);
    const cfg = UI_CONFIG.soldierHit;
    const small = UI_CONFIG.smallNumber;
    const reacts = [];
    let power = 0; // いちばん強く当たったぶん（ヒットストップの長さ）
    let anyBlock = false;
    let anyPoison = false;
    for (const h of hits) {
      const blocked = h.blocked ?? 0;
      const dealt = Math.max(0, (h.amount ?? 0) - blocked);
      const s = this.modelSoldier(model, h.playerId, h.soldierId);
      if (s) {
        s.hp = h.hp;
        s.shield = Math.max(0, (s.shield ?? 0) - blocked);
        // 毒のダメージ1回で、毒の残りが1減る（0になれば statusCleared が来る）。量はここで分かる
        if (h.cause === 'poison' && s.statuses?.poison) {
          s.statuses = { ...s.statuses, poison: { amount: h.amount, turns: s.statuses.poison.turns === null ? null : s.statuses.poison.turns - 1 } };
        }
      }
      this.renderer.updateSoldier(h.soldierId, { hp: h.hp, shield: s?.shield ?? 0, ...(s ? { statuses: s.statuses } : {}) });
      const el = this.renderer.soldierEl(h.soldierId);
      if (!el) continue;
      const dir = this.hitDir.get(el) ?? null;
      this.hitDir.delete(el);
      const poison = h.cause === 'poison';
      if (dealt > 0) {
        // 強い攻撃ほど：数字が大きく、長く止まり、遠くへ押される
        const p = Math.min(cfg.powerMax, cfg.powerBase + dealt * cfg.powerPerDamage);
        const lethal = h.hp <= 0;
        power = Math.max(power, p + (lethal ? cfg.lethalBonus : 0) + (dir?.weak ? cfg.weakBonus : 0));
        if (poison) anyPoison = true;
        el.classList.add(poison ? 'hit-poison' : 'hit');
        this.number(el, `${poison ? STATUS_ICON.poison : ''}-${dealt}`, {
          size: cfg.numberSize * (0.8 + p * 0.25) * (dir?.weak ? 1.2 : 1),
          duration: cfg.numberDuration, kind: poison ? 'poison' : dir?.weak ? 'weak' : 'damage',
        });
        if (dir?.weak) this.number(el, '弱点！', { size: small.size * 0.85, duration: cfg.numberDuration, kind: 'weak', dy: -30 });
        if (lethal) this.koDir.set(el, poison ? { melt: true } : dir ?? { x: 0, y: 0 });
        reacts.push({ el, dir, power: p, cause: h.cause });
      }
      if (blocked > 0) {
        anyBlock = true;
        el.classList.add('blocked');
        this.number(el, `${ICON.shield}${blocked}`, { size: small.size, duration: small.duration, kind: 'block', dy: dealt > 0 ? -26 : 0 });
        if (!this.skipping) this.ring(this.centerOf(el), { size: 70, color: GLOW.shield, duration: 260 });
      }
    }
    if (power > 0) sound.play(anyPoison ? 'poison' : 'smallHit');
    else if (anyBlock) sound.play('block');
    if (power > 0) this.screenShake('soldier', power);
    if (power > 0) await this.hitstop(Math.min(cfg.hitstopMax, cfg.hitstop * power));
    for (const h of hits) this.renderer.soldierEl(h.soldierId)?.classList.remove('hit', 'hit-poison', 'blocked');
    for (const r of reacts) this.recoil(r, cfg);
    await this.delay(UI_CONFIG.timing.afterSoldierHit);
  }

  /** 弓兵・魔法使いが撃つ：ねらう（ため）→ 放つ（反動）→ 飛ぶ → 当たる */
  async soldierShot({ playerId, soldierId, role, target, amount }, model) {
    this.cosmetics?.styleFx(this.el.fx, playerId);
    const from = this.renderer.soldierEl(soldierId);
    const to = target.kind === 'soldier' ? this.renderer.soldierEl(target.soldierId)
      : target.kind === 'monster' ? this.renderer.monsterEl(target.monsterId) : this.renderer.castleEl(target.playerId)?.querySelector('.castle-pic');
    if (!from || !to) return;
    if (!this.skipping) {
      const a = this.centerOf(from), b = this.centerOf(to);
      const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / dist, uy = (b.y - a.y) / dist;
      const angle = Math.atan2(uy, ux) * 180 / Math.PI;
      const mage = role === 'mage';
      const power = Math.min(1, amount / 12);
      const t = UI_CONFIG.timing;
      const token = from.querySelector('.soldier-token');
      // ねらう：弓兵は体を引いてしぼる。魔法使いは浮いて杖の先に光をためる
      this.animate(token, mage ? [
        { transform: 'none' },
        { transform: 'translateY(-8px) scale(1.08)', offset: 0.6, easing: UI_CONFIG.easing.enter },
        { transform: `translate(${ux * 5}px, ${uy * 5}px) scale(.95, 1.05)`, offset: 0.7 },
        { transform: 'none' },
      ] : [
        { transform: 'none' },
        { transform: `translate(${-ux * 8}px, ${-uy * 8}px) rotate(-7deg) scale(1.07, .94)`, offset: 0.6, easing: UI_CONFIG.easing.enter },
        { transform: `translate(${ux * 6}px, ${uy * 6}px) rotate(4deg)`, offset: 0.68 },
        { transform: 'none' },
      ], { duration: t.shotAim / 0.6 });
      const muzzle = { x: a.x + ux * 16, y: a.y + uy * 16 - (mage ? 10 : 0) };
      if (mage) {
        const orb = this.fx('shot-charge', muzzle);
        this.animate(orb, [
          { transform: 'translate(-50%, -50%) scale(.1)', opacity: 0.5 },
          { transform: `translate(-50%, -50%) scale(${1 + power})`, opacity: 1 },
        ], { duration: t.shotAim, easing: UI_CONFIG.easing.exit, fill: 'forwards' }).then(() => orb.remove());
      }
      await this.delay(t.shotAim);
      sound.play(mage ? 'magicShot' : 'bow', power);
      if (!this.skipping) {
        const flight = Math.max(150, Math.min(340, dist * 1.15));
        const projectile = this.fx(mage ? 'shot-magic' : 'shot-arrow', muzzle);
        const dx = b.x - muzzle.x, dy = b.y - muzzle.y;
        const size = mage ? 0.8 + power * 0.9 : 0.9 + power * 0.5;
        const at = (x, y, sy = 1) => `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) rotate(${angle}deg) scale(${size}, ${size * sy})`;
        // 魔法の弾は、光のつぶを残しながら飛ぶ
        if (mage) {
          for (let i = 1; i <= 5; i++) {
            const k = i / 6;
            const mote = this.fx('fx-mote', { x: muzzle.x + dx * k + (Math.random() - 0.5) * 8, y: muzzle.y + dy * k + (Math.random() - 0.5) * 8 });
            this.animate(mote, [
              { transform: 'translate(-50%, -50%) scale(0)', opacity: 0 },
              { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.1 },
              { transform: 'translate(-50%, -50%) scale(.1)', opacity: 0 },
            ], { duration: 320, delay: flight * k * UI_CONFIG.speed, fill: 'both' }).then(() => mote.remove());
          }
        }
        // 矢は少し山なりに、速くなりながら飛ぶ
        const bow = mage ? 0 : dist * 0.07;
        await this.animate(projectile, [
          { transform: at(0, 0, 0.6), opacity: 1 },
          { transform: at(dx * 0.5 - uy * bow, dy * 0.5 + ux * bow), opacity: 1, offset: 0.5 },
          { transform: at(dx, dy), opacity: 1 },
        ], { duration: flight, easing: mage ? UI_CONFIG.easing.exit : 'cubic-bezier(.3, 0, .7, .6)', fill: 'forwards' });
        projectile.remove();
        if (!this.skipping) {
          if (mage) {
            this.ring(b, { size: 60 + power * 50, color: '#c79bff', duration: 300 });
            this.sparks(b, { count: 5 + Math.round(power * 5), color: '#d9b8ff', spread: 30 + power * 20, size: 7 });
          } else {
            this.impact(b, 'star', { size: 34 + power * 24, color: '#fff3b8', duration: 200 });
            this.sparks(b, { count: 3 + Math.round(power * 3), color: '#e9d3a6', spread: 22, size: 5 });
          }
          // 撃たれた相手は、矢の向きへ押される
          if (target.kind !== 'castle') this.hitDir.set(to, { x: ux, y: uy, weight: 0.7 + power * 0.8, weak: false });
        }
      }
    }
    const soldier = this.modelSoldier(model,playerId,soldierId);
    if(soldier?.turnsLeft != null) {
      soldier.turnsLeft = Math.max(0,soldier.turnsLeft-1);
      this.renderer.updateSoldier(soldierId,{turnsLeft:soldier.turnsLeft});
    }
  }

  /** 帰還は城へ飛んで消える。倒れた兵士はその場で消える。 */
  async soldiersDestroyed(first, queue, model) {
    const list = this.takeRun(first, queue);
    await Promise.all(list.map(async d => {
      const pl = model.players[d.playerId];
      pl.soldiers = pl.soldiers.filter(x => x.soldierId !== d.soldierId);
      const el = this.renderer.soldierEl(d.soldierId);
      if (el && d.reason === 'returned') {
        const a = this.centerOf(el), b = this.centerOf(this.renderer.castleEl(d.playerId));
        const scale = this.renderer.isPlaza ? this.renderer.plazaScale || 1 : 1;
        b.x = a.x+(b.x-a.x)/scale; b.y = a.y+(b.y-a.y)/scale;
        this.number(el,'帰還！',{kind:'heal',size:20,duration:UI_CONFIG.timing.soldierReturn});
        await this.animate(el,[
          {transform:'translate(-50%,-50%) scale(1)',opacity:1},
          {transform:`translate(calc(-50% + ${b.x-a.x}px),calc(-50% + ${b.y-a.y}px)) scale(.3)`,opacity:0},
        ],{duration:UI_CONFIG.timing.soldierReturn,easing:'ease-in',fill:'forwards'});
      } else if (el && d.reason !== 'reachedCastle' && !this.skipping) {
        await this.knockOut(el, this.koDir.get(el));
      } else {
        el?.classList.add(d.reason === 'reachedCastle' ? 'arrived' : 'dying');
        await this.delay(UI_CONFIG.timing.soldierDeath);
      }
      this.renderer.removeSoldier(d.soldierId);
    }));
  }

  /** やられた兵士：とどめの向きへ吹き飛んで、土けむりになって消える。毒はその場でとける */
  async knockOut(el, ko) {
    const at = this.centerOf(el);
    const base = 'translate(-50%, -50%)';
    const dur = UI_CONFIG.timing.soldierDeath * 1.5;
    if (ko?.melt) {
      this.sparks(at, { count: 6, color: '#b98ae6', spread: 26, size: 7 });
      await this.animate(el, [
        { transform: base, opacity: 1 },
        { transform: `${base} translateY(18%) scale(1.25, .3)`, opacity: 0.9, offset: 0.7 },
        { transform: `${base} translateY(24%) scale(1.4, .1)`, opacity: 0 },
      ], { duration: dur, easing: UI_CONFIG.easing.exit, fill: 'forwards' });
      return;
    }
    const x = (ko?.x ?? 0) * UI_CONFIG.soldierHit.knockOut;
    const y = (ko?.y ?? 0) * UI_CONFIG.soldierHit.knockOut;
    const spin = (x - y >= 0 ? 1 : -1) * 260;
    this.sparks(at, { count: 7, color: '#fff', spread: 36, size: 9 });
    this.puff({ x: at.x + x * 0.9, y: at.y + y * 0.9 }, { size: 50, delay: dur * 0.55, dy: -14 });
    await this.animate(el, [
      { transform: base, opacity: 1, easing: 'cubic-bezier(.1, .7, .4, 1)' },
      { transform: `${base} translate(${x * 0.8}px, ${y * 0.8 - 18}px) rotate(${spin * 0.6}deg) scale(.9)`, opacity: 1, offset: 0.6, easing: UI_CONFIG.easing.exit },
      { transform: `${base} translate(${x}px, ${y}px) rotate(${spin}deg) scale(.4)`, opacity: 0 },
    ], { duration: dur, fill: 'forwards' });
  }

  async spellCast({ playerId, type, target, targetKind, roadId }) {
    this.cosmetics?.styleFx(this.el.fx, playerId, type); // 撃った人の攻撃エフェクトの色（魔法ごとのスキンが先）
    const def = this.cards[type] ?? {};
    // 魔法を使うと、画面が揺れる（強い魔法ほど大きく）
    this.screenShake('spell', def.amount ?? 4);
    if (targetKind === 'monster') {
      const mEl = this.renderer.monsterEl(target);
      if (mEl) return this.projectile(this.renderer.castleEl(playerId), mEl, { amount: Math.min(def.amount ?? 8, 11) });
      return undefined;
    }
    const enemy = typeof target === 'string' ? target : this.renderer.opponentOf(playerId);
    if (def.effect === 'damageEnemyCastle') return this.fireball(playerId, enemy, def.amount);
    if (def.effect === 'damageEnemySoldiers') return this.thunder(enemy, roadId, def.amount);
    // チェーン・ブラスト：狙った道に雷のような爆発。イグニッション・バースト／シールド・ブラスト：相手の城へ大きな火の玉
    if (def.effect === 'chainBlast') return this.thunder(enemy, roadId, def.amount);
    if (def.effect === 'ignitionBurst') { this.screenShake('spell', 10); return this.fireball(playerId, enemy, def.amount); }
    if (def.effect === 'armorBlast') { const armor = this.renderer.players?.[playerId]?.armor; return this.fireball(playerId, enemy, Math.max(8, armor ?? 12)); }
    if (SPELL_TINT[def.effect]) return this.mist(enemy, SPELL_TINT[def.effect], roadId);
    if (def.effect === 'redrawHand') return this.banner('手札を引き直す！', UI_CONFIG.timing.shuffle, 'small');
    if (def.effect === 'randomEffect') return this.banner('神頼み！', UI_CONFIG.timing.shuffle, 'small');
    if (def.effect === 'stealCard') return this.banner('盗賊！', UI_CONFIG.timing.shuffle, 'small');
    // 回復などは castleHealed 側で見せる
    return undefined;
  }

  /** 精霊を呼ぶ：城のそばにバッジが出る */
  async spiritSummoned({ playerId, type, spirit, amount, turns, targetId }, model) {
    model.players[playerId].spirit = { type, spirit, amount, turns, targetId };
    this.renderer.setSpirit(playerId, model.players[playerId].spirit);
    if (this.skipping) return;
    sound.play('heal');
    this.banner(`${this.cards[type]?.name ?? '精霊'}！`, UI_CONFIG.timing.shuffle, 'small');
    await this.delay(UI_CONFIG.timing.shuffle * 0.8);
  }

  /** 精霊が効く（このあと castleDamaged / castleHealed） */
  async spiritTriggered({ type, playerId, spirit, targetId }) {
    if (this.skipping) return;
    // 火の精霊は、相手の城へ小さな火を飛ばす
    if (spirit === 'fire' && targetId && this.renderer.castleEl(targetId)) {
      const badge = this.renderer.castleEl(playerId).querySelector('.castle-spirit');
      this.fireShot(this.centerOf(badge && !badge.hidden ? badge : this.renderer.castleEl(playerId)), this.centerOf(this.renderer.castleEl(targetId).querySelector('.castle-pic')), { scale: 0.8, duration: UI_CONFIG.timing.spellProjectile, arc: 30 });
    }
    this.banner(`${this.cards[type]?.name ?? '精霊'}が力を貸してくれた！`, UI_CONFIG.timing.shuffle * 0.7, 'small');
    const badge=this.renderer.castleEl(playerId)?.querySelector('.castle-spirit');
    if(badge&&!badge.hidden)this.animate(badge,[{filter:'brightness(1)',scale:1},{filter:'brightness(1.4)',scale:1.15},{filter:'brightness(1)',scale:1}],{duration:UI_CONFIG.timing.shuffle});
    await this.delay(UI_CONFIG.timing.shuffle * 0.4);
  }

  async spiritEnded({ playerId }, model) {
    model.players[playerId].spirit = null;
    this.renderer.setSpirit(playerId, null);
  }

  /** 反射：撃たれた魔法が、撃った人の城に返る（このあと castleDamaged） */
  async spellReflected() {
    if (this.skipping) return;
    sound.play('block');
    await this.banner('反射！', UI_CONFIG.timing.defenseResult, 'defense-result');
  }

  /** 身代わり：城に着いた兵士のダメージが消える（このあと兵士が消える） */
  async soldierDecoyed() {
    if (this.skipping) return;
    sound.play('block');
    await this.banner('身代わり！', UI_CONFIG.timing.defenseResult, 'defense-result');
  }

  /** 盗賊：相手の手札から1枚奪う。自分が奪われたら手札から消え、奪ったら手札に入る */
  async cardStolen({ playerId, victimId, cardId }, model, ctx) {
    model.players[playerId].handCount += 1;
    model.players[victimId].handCount = Math.max(0, model.players[victimId].handCount - 1);
    if (victimId === ctx.viewerId) {
      model.hand = model.hand.filter((c) => c.cardId !== cardId);
      this.handView.takeCard(cardId);
    } else {
      this.renderer.setOppHandCount(model.players[victimId].handCount);
    }
    if (playerId === ctx.viewerId) {
      const card = ctx.lookupCard(cardId);
      if (card) {
        model.hand.push(card);
        this.handView.addCard(card);
        sound.play('draw');
      }
    } else {
      this.renderer.setOppHandCount(model.players[playerId].handCount);
    }
    await this.delay(UI_CONFIG.timing.draw * 3);
  }

  /** 毒の霧・氷の息：相手の兵士の列に色のついた霧をかける */
  async mist(_targetId, color, roadId) {
    if (this.skipping) return;
    const gust = color === SPELL_TINT.pushBackEnemySoldiers;
    const lava = color.startsWith('rgba(255, 96, 32');
    const pure = color === SPELL_TINT.purifyFlare;
    if (!lava) sound.play(pure ? 'heal' : gust ? 'gust' : color === SPELL_TINT.freezeEnemySoldiers ? 'freeze' : 'poison');
    const app = this.el.app.getBoundingClientRect();
    const r = this.renderer.laneEl(roadId).getBoundingClientRect(); // レーンを選んだ魔法は、その道だけに霧をかける
    const fog = this.fx('fx-mist');
    fog.innerHTML = imageArt(`fx/${lava ? 'explosion' : pure ? 'heal' : gust ? 'dust' : color === SPELL_TINT.freezeEnemySoldiers ? 'ice' : 'poison'}.png`, '', 'art');
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

  async fireball(fromId, toId, amount) {
    return this.projectile(this.renderer.castleEl(fromId), this.renderer.castleEl(toId).querySelector('.castle-pic'), { amount });
  }

  /**
   * 火の魔法を飛ばす。威力で見せ方が変わる：
   * 弱い（ファイアボール・業火）は城から弧をえがいて飛ぶ。隕石より上は、空から落ちてくる（落ちる場所に影が広がる）。
   */
  async projectile(fromEl, toEl, { amount = 8 } = {}) {
    if (this.skipping) return;
    const cfg = UI_CONFIG.fireFx;
    const to = this.centerOf(toEl);
    const tier = cfg.tiers.filter((min) => amount >= min).length; // 0〜3
    sound.play('fire', Math.min(1, amount / 20));
    if (tier === 0) {
      await this.fireShot(this.centerOf(fromEl), to, { scale: cfg.scaleBase + amount * cfg.scalePerDamage, duration: UI_CONFIG.timing.spellProjectile, arc: 46 });
      return;
    }
    const app = this.el.app.getBoundingClientRect();
    const side = to.x < app.width / 2 ? 1 : -1;
    const sky = { x: to.x + side * 170, y: Math.min(-70, to.y - 420) };
    const dur = UI_CONFIG.timing.spellProjectile * (1.3 + tier * 0.4);
    // 落ちる場所の影（だんだん濃く・大きく）
    const mark = this.fx('fx-target-shadow', to);
    this.animate(mark, [
      { transform: 'translate(-50%, -50%) scale(.2)', opacity: 0 },
      { transform: `translate(-50%, -50%) scale(${0.8 + tier * 0.25})`, opacity: 0.75 },
    ], { duration: dur, easing: UI_CONFIG.easing.exit, fill: 'forwards' }).then(() => mark.remove());
    if (tier >= 3) {
      // 最上位：空が暗くなり、地面がふるえる
      const dark = this.fx('fx-flash');
      dark.style.background = '#3b0f0a';
      this.animate(dark, [{ opacity: 0 }, { opacity: 0.55, offset: 0.25 }, { opacity: 0.55, offset: 0.85 }, { opacity: 0 }], { duration: dur * 1.25, fill: 'forwards' }).then(() => dark.remove());
      this.shake(this.el.board, 4, dur);
    }
    if (tier >= 2) {
      // 星降り以上：小さな火の玉が先にばらばらと落ちる
      for (let i = 0; i < tier * 2 - 1; i++) {
        const off = { x: (Math.random() - 0.5) * 120, y: (Math.random() - 0.5) * 50 };
        this.fireShot({ x: sky.x + off.x, y: sky.y }, { x: to.x + off.x, y: to.y + off.y }, { scale: 0.9, duration: dur * 0.7, delay: i * dur * 0.11, embers: 3 })
          .then(() => { if (!this.skipping) { this.impact({ x: to.x + off.x, y: to.y + off.y }, 'star', { size: 50, color: '#ffd27a', duration: 200 }); } });
      }
    }
    await this.fireShot(sky, to, { scale: cfg.skyScaleBase + tier * cfg.skyScalePerTier, duration: dur, easing: 'cubic-bezier(.6, 0, 1, .7)' });
  }

  /** 火の玉をひとつ飛ばす（進む向きに絵を回し、火の粉を残す） */
  async fireShot(from, to, { scale = 1, duration, arc = 0, delay = 0, easing = 'cubic-bezier(.5, 0, 1, 1)', embers } = {}) {
    if (this.skipping) return;
    const ball = this.fx('fx-fireball', from);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const side = (dy < 0 ? 1 : -1) * arc; // 少し弧をえがいて飛ぶ
    const rot = Math.atan2(dy, dx) * 180 / Math.PI - 135; // 絵は左下向き
    const at = (x, y, k) => `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) rotate(${rot.toFixed(1)}deg) scale(${k.toFixed(2)})`;
    const n = embers ?? Math.round(4 + scale * 3);
    for (let i = 1; i <= n; i++) {
      const k = i / (n + 1);
      const el = this.fx('fx-ember', { x: from.x + dx * k + side * (1 - Math.abs(2 * k - 1)) + (Math.random() - 0.5) * 14, y: from.y + dy * k + (Math.random() - 0.5) * 14 });
      el.style.width = el.style.height = `${(5 + Math.random() * 6) * Math.min(2, scale)}px`;
      this.animate(el, [
        { transform: 'translate(-50%, -50%) scale(0)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.12 },
        { transform: `translate(calc(-50% + ${(Math.random() - 0.5) * 16}px), calc(-50% - ${6 + Math.random() * 12}px)) scale(.15)`, opacity: 0 },
      ], { duration: 340, delay: (delay + duration * k ** 0.6) * UI_CONFIG.speed, fill: 'both' }).then(() => el.remove());
    }
    await this.animate(ball, [
      { transform: at(0, 0, scale * 0.45) },
      { transform: at(dx * 0.5 + side, dy * 0.5, scale * 0.85), offset: 0.5 },
      { transform: at(dx, dy, scale * 1.1) },
    ], { duration, delay: delay * UI_CONFIG.speed, easing, fill: 'both' });
    ball.remove();
  }

  /** 雷：相手の兵士1体ずつに落とす */
  async thunder(targetId, roadId, amount = 3) {
    if (this.skipping) return;
    const big = Math.min(1, amount / 12); // 強い雷ほど、太く・明るく・大きく揺れる
    sound.play('thunder');
    const app = this.el.app.getBoundingClientRect();
    const top = this.renderer.el.board.getBoundingClientRect().top - app.top;
    const dur = UI_CONFIG.timing.thunder;
    const targets = this.renderer.soldierElsOf(targetId, roadId);
    targets.forEach((el, i) => {
      const c = this.centerOf(el);
      const bolt = this.fx('fx-bolt');
      bolt.style.left = `${c.x}px`;
      bolt.style.top = `${top}px`;
      bolt.style.height = `${Math.max(40, c.y - top)}px`;
      this.animate(bolt, [
        { opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 0.15, offset: 0.3 },
        { opacity: 1, offset: 0.45 }, { opacity: 0 },
      ], { duration: dur, delay: i * 40 * UI_CONFIG.speed, fill: 'forwards' }).then(() => bolt.remove());
      bolt.style.setProperty('--bolt-w', (0.8 + big * 1.1).toFixed(2));
      this.sparks(c, { count: Math.round(4 + big * 8), color: '#ffe95a', spread: 28 + big * 30, size: 6 });
      this.ring(c, { size: 60 + big * 70, color: '#ffe95a', duration: dur });
    });
    this.screenFlash('#fffbe0', dur * (0.5 + big * 0.5));
    this.shake(this.renderer.el.field, 4 + big * 10, dur * (1 + big * 0.5));
    await this.delay(dur * 0.6);
  }

  patchCastle(model, id, patch) {
    const owner = model.players[id]?.castleOwner ?? id;
    for (const [pid, player] of Object.entries(model.players)) {
      if ((player.castleOwner ?? pid) === owner) Object.assign(player,patch);
    }
  }

  /** 城が毒にかかった：毒の色の数字と、城のバッジ */
  async castlePoisoned({ playerId, amount }, model) {
    this.patchCastle(model, playerId, { castlePoison: amount });
    this.renderer.setCastlePoison(playerId, amount);
    if (this.skipping) return;
    const castle = this.renderer.castleEl(playerId);
    const small = UI_CONFIG.smallNumber;
    sound.play('poison');
    this.number(castle, `${STATUS_ICON.poison}毒 ${amount}`, { size: small.size + 6, duration: small.duration, kind: 'poison' });
    await this.delay(UI_CONFIG.timing.status);
  }

  /** 解毒薬：城の毒が治る */
  async castleCured({ playerId }, model) {
    this.patchCastle(model, playerId, { castlePoison: null });
    this.renderer.setCastlePoison(playerId, null);
    if (this.skipping) return;
    const castle = this.renderer.castleEl(playerId);
    const small = UI_CONFIG.smallNumber;
    sound.play('heal');
    this.number(castle, '解毒', { size: small.size + 6, duration: small.duration, kind: 'heal' });
    await this.delay(UI_CONFIG.timing.statusCleared);
  }

  async castleDamaged({ playerId, amount, hp, blocked = 0, source }, model) {
    const pl = model.players[playerId];
    // 城に着いた兵士は、なぐってからダメージが入る
    if (source?.kind === 'soldier') await this.castleStrike(source.soldierId, this.renderer.castleEl(playerId));
    this.patchCastle(model, playerId, {castleHp:hp});
    if (blocked > 0) {
      this.patchCastle(model, playerId, {armor:Math.max(0,(pl.armor ?? 0)-blocked)});
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
      sound.play('block');
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
    sound.play('hit', finish ? 1 : Math.min(1, amount / 12));
    if (finish) sound.play('collapse');
    if (finish) this.screenFlash('#fff', 520);

    // 1) 当たった瞬間：白く光る＋爆発
    castle.classList.add('flash');
    const burst = this.fx('fx-burst', this.centerOf(castle));
    burst.style.transform = `scale(${0.6 + Math.min(amount, 30) / 20})`;
    // 2) 一瞬止める（ダメージが大きいほど長く）
    await this.hitstop(stop);
    castle.classList.remove('flash');
    // 3) 揺れ＋大きな数字。城そのものも、重さのぶんだけ沈んではね返る。がれきが飛ぶ
    this.number(castle, `-${amount}`, { size, duration: cfg.numberDuration });
    const pic = castle.querySelector('.castle-pic');
    const at = this.centerOf(pic);
    const k = Math.min(1, amount / 20);
    if (!finish) {
      this.animate(pic, [
        { transform: `translateY(${(k * 5).toFixed(1)}px) scale(${(1 + k * 0.1).toFixed(3)}, ${(1 - k * 0.14).toFixed(3)})`, offset: 0.18, easing: UI_CONFIG.easing.enter },
        { transform: `scale(${(1 - k * 0.04).toFixed(3)}, ${(1 + k * 0.06).toFixed(3)})`, offset: 0.5 },
        { transform: 'none' },
      ], { duration: 280 + k * 160 });
    }
    this.debris(at, { count: finish ? 20 : Math.round(3 + Math.min(9, amount / 2)), spread: finish ? 120 : 36 + amount * 2.5, size: finish ? 14 : 9 });
    this.sparks(at, { count: finish ? 10 : 3 + Math.min(5, Math.round(amount / 4)), color: '#ffd93b', spread: finish ? 130 : 40 + amount * 2, size: finish ? 12 : 7 });
    if (finish) for (let i = 0; i < 4; i++) this.puff({ x: at.x + (i - 1.5) * 26, y: at.y + 14 }, { size: 60, delay: i * 70, dy: -26, duration: 700 });
    this.animate(burst, [{ opacity: 1 }, { opacity: 0, transform: `scale(${1 + Math.min(amount, 30) / 15})` }],
      { duration: 260, fill: 'forwards' }).then(() => burst.remove());
    this.shake(this.el.board, amp, cfg.shakeDuration * (finish ? 1.6 : 1));
    await this.delay(cfg.shakeDuration * 0.7);
  }

  async castleHealed({ playerId, amount, hp }, model) {
    this.patchCastle(model, playerId, {castleHp:hp});
    const castle = this.renderer.castleEl(playerId);
    this.renderer.setCastleHp(playerId, hp);
    if (this.skipping) return;
    castle.classList.remove('heal-glow');
    void castle.offsetWidth;
    castle.classList.add('heal-glow');
    sound.play('heal');
    const aura = this.fx('fx-heal-sprite', this.centerOf(castle));
    this.animate(aura, [{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, offset: .3 }, { opacity: 0, transform: 'scale(1.3)' }], { duration: UI_CONFIG.timing.heal, fill: 'forwards' }).then(() => aura.remove());
    // 回復の光のつぶが、城をつつんで上へのぼる（回復が大きいほど多い）
    const hc = this.centerOf(castle.querySelector('.castle-pic'));
    for (let i = 0; i < Math.min(12, 4 + Math.round(amount / 2)); i++) {
      const plus = this.fx('fx-plus', { x: hc.x + (Math.random() - 0.5) * 80, y: hc.y + 10 + Math.random() * 26 });
      plus.textContent = '+';
      this.animate(plus, [
        { transform: 'translate(-50%, -50%) scale(.2)', opacity: 0 },
        { transform: 'translate(-50%, calc(-50% - 14px)) scale(1)', opacity: 1, offset: 0.25 },
        { transform: `translate(calc(-50% + ${(Math.random() - 0.5) * 16}px), calc(-50% - ${50 + Math.random() * 30}px)) scale(.6)`, opacity: 0 },
      ], { duration: UI_CONFIG.timing.heal * 1.6, delay: i * 35 * UI_CONFIG.speed, easing: UI_CONFIG.easing.enter, fill: 'both' }).then(() => plus.remove());
    }
    this.number(castle, `+${amount}`, { kind: 'heal', size: UI_CONFIG.healNumber.size, duration: UI_CONFIG.healNumber.duration });
    await this.delay(UI_CONFIG.timing.heal);
    castle.classList.remove('heal-glow');
  }

  // ---------- 武器・防御・状態異常 ----------

  /** 兵士の上に、色のついた光と短い文字を出す */
  async soldierGlow(soldierId, { color, text, className = 'glow', ms }) {
    const el = this.renderer.soldierEl(soldierId);
    if (!el || this.skipping) return;
    sound.play('equip');
    el.style.setProperty('--glow', color);
    if (text) {
      const small = UI_CONFIG.smallNumber;
      this.number(el, text, { size: small.size, duration: small.duration, kind: 'buff' });
    }
    await this.flashClass(el, className, ms);
  }

  async weaponEquipped({ playerId, soldierId, type, attack, element }, model) {
    const s = this.modelSoldier(model, playerId, soldierId);
    const prev = this.renderer.weaponStacks.get(soldierId) ?? { count: s?.weapon ? null : 0, bonus: 0 };
    this.renderer.weaponStacks.set(soldierId, { count: prev.count == null ? null : prev.count + 1, bonus: prev.bonus + (this.cards[type]?.attackBonus ?? 0) });
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
      if (s) { s.attack = b.attack; if (b.hp != null) s.hp = b.hp; }
      this.renderer.updateSoldier(b.soldierId, { attack: b.attack, ...(b.hp != null ? { hp: b.hp } : {}) });
      const diff = b.attack - before;
      waits.push(this.soldierGlow(b.soldierId, {
        color: GLOW.buff, text: `⚔${diff > 0 ? `+${diff}` : b.attack}`, ms: UI_CONFIG.timing.equip,
      }));
    }
    await Promise.all(waits);
  }

  async castleArmored({ playerId, armor }, model) {
    this.patchCastle(model, playerId, {armor});
    this.renderer.setArmor(playerId, armor);
    if (this.skipping) return;
    const castle = this.renderer.castleEl(playerId);
    const small = UI_CONFIG.smallNumber;
    sound.play('block');
    this.number(castle, `${ICON.armor}+${armor}`, { size: small.size + 6, duration: small.duration, kind: 'block' });
    await this.flashClass(castle, 'armor-up', UI_CONFIG.timing.armor);
  }

  async armorExpired({ playerId }, model) {
    this.patchCastle(model, playerId, {armor:0});
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
        // 毒の量は、永続の毒だけ statusApplied に入っている。ほかは推測せず（null）、毒のダメージを受けたときか getState で分かる
        statuses.poison = { amount: a.amount ?? null, turns: a.turns };
      } else if (a.status === 'frozen') {
        statuses.frozen = a.turns;
      } else if (a.status === 'burn') {
        statuses.burn = { amount: a.amount ?? null, turns: a.turns };
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
      this.number(el, `${icon}${{ poison: '毒', frozen: '凍結', burn: 'やけど' }[a.status] ?? ''}`, { size: small.size, duration: small.duration, kind: a.status });
      el.classList.add(`apply-${a.status}`);
      // 凍結：氷がパキッと閉じる。毒：毒のけむりが立ちのぼる
      const c = this.centerOf(el);
      const frozen = a.status === 'frozen';
      const stamp = this.fx('fx-status-stamp', c);
      stamp.style.width = stamp.style.height = `${el.getBoundingClientRect().width * 1.5}px`;
      stamp.innerHTML = imageArt(`fx/${frozen ? 'ice' : a.status === 'burn' ? 'fireball' : 'poison'}.png`, '', 'art');
      this.animate(stamp, frozen ? [
        { transform: 'translate(-50%, -50%) scale(1.9)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(.9)', opacity: 1, offset: 0.3, easing: UI_CONFIG.easing.enter },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.6 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
      ] : [
        { transform: 'translate(-50%, -30%) scale(.4)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95, offset: 0.4, easing: UI_CONFIG.easing.enter },
        { transform: 'translate(-50%, -75%) scale(1.15)', opacity: 0 },
      ], { duration: UI_CONFIG.timing.status * 1.6, fill: 'forwards' }).then(() => stamp.remove());
      if (frozen) this.debris(c, { count: 5, spread: 30, size: 6, colors: ['#e6f7ff', '#a9defa', '#7cc4ee'] });
    }
    await this.delay(UI_CONFIG.timing.status);
    for (const a of list) this.renderer.soldierEl(a.soldierId)?.classList.remove(`apply-${a.status}`);
  }

  async statusCleared({ playerId, soldierId, status }, model) {
    const s = this.modelSoldier(model, playerId, soldierId);
    const statuses = { ...(s?.statuses ?? this.renderer.soldier(soldierId)?.statuses ?? {}) };
    if (status === 'poison') statuses.poison = null;
    if (status === 'frozen') statuses.frozen = 0;
    if (status === 'burn') statuses.burn = null;
    if (s) s.statuses = statuses;
    this.renderer.updateSoldier(soldierId, { statuses });
    // 凍結がとける：氷がくだけて、兵士がぶるっと動き出す
    const cEl = this.renderer.soldierEl(soldierId);
    if (cEl && status === 'frozen' && !this.skipping) {
      this.debris(this.centerOf(cEl), { count: 8, spread: 40, size: 7, colors: ['#e6f7ff', '#a9defa', '#7cc4ee'] });
      this.shake(cEl.querySelector('.soldier-token'), 3, 220);
    }
    await this.delay(UI_CONFIG.timing.statusCleared);
  }

  // ---------- 魔物とコイン ----------

  async monsterAppeared(p, model) {
    this.renderer.monsterBirths.set(p.monsterId, model.round);
    const def = this.monsterDefs?.[p.type] ?? {};
    const m = {
      monsterId: p.monsterId, type: p.type, roadId: p.roadId, square: p.square,
      hp: p.hp, maxHp: p.hp, // 出たときは満タン
      attack: p.attack, element: p.element ?? null,
      rewardRarity: def.rewardRarity ?? null, attackIn: def.attackEvery ?? null, reward: def.reward ?? null, castleAttack: def.castleAttack ?? null,
    };
    model.monsters = [...(model.monsters ?? []).filter((x) => x.monsterId !== m.monsterId), m];
    if (this.renderer.monster(m.monsterId)) this.renderer.updateMonster(m.monsterId, m);
    else this.renderer.addMonster(m, { appear: true });
    if (this.skipping) return;
    sound.play('monster');
    this.banner(`${def.name ?? '魔物'}があらわれた！`, UI_CONFIG.timing.monsterAppear, 'threat');
    // 上から落ちてきて、着地で地面が揺れ、土けむりと輪が広がる（落ちる動きは css の drop-in）
    const mEl = this.renderer.monsterEl(m.monsterId);
    this.delay(300).then(() => {
      if (this.skipping || !mEl?.isConnected) return;
      const feet = this.feetOf(mEl);
      this.ring(feet, { size: 130, color: '#d9b8ff', duration: 380 });
      this.puff(feet, { size: 46, dx: -26, dy: -6 });
      this.puff(feet, { size: 46, dx: 26, dy: -6 });
      this.shake(this.renderer.el.field, 6, UI_CONFIG.timing.monsterAppear * 0.5);
    });
    await this.delay(UI_CONFIG.timing.monsterAppear);
  }

  async monsterAttackedCastle({ monsterId, playerId, amount, hp }, model) {
    this.patchCastle(model, playerId, {castleHp:hp});
    const m = this.modelMonster(model, monsterId);
    if (m && m.castleAttack != null) { m.castleAttack += this.rules.monsterAttackGrowth ?? 0; this.renderer.updateMonster(monsterId, { castleAttack: m.castleAttack }); }
    const mEl = this.renderer.monsterEl(monsterId);
    const castle = this.renderer.castleEl(playerId);
    if (mEl && !this.skipping) {
      sound.play('monster');
      // 魔物が城へ飛びかかって戻る
      const from = this.centerOf(mEl);
      const to = this.centerOf(castle);
      const token = mEl.querySelector('.monster-token');
      const dx = (to.x - from.x) * 0.7;
      const dy = (to.y - from.y) * 0.7;
      // 身をかがめてためてから、城へ飛びかかる
      await this.animate(token, [
        { transform: 'translate(0, 0) scale(1)' },
        { transform: `translate(${-dx * 0.06}px, ${-dy * 0.06}px) scale(1.25, .75)`, offset: 0.35, easing: 'cubic-bezier(.7, 0, 1, .6)' },
        { transform: `translate(${dx}px, ${dy}px) scale(1.2, 1.4)`, offset: 0.85 },
        { transform: `translate(${dx}px, ${dy}px) scale(1.4, 1.2)` },
      ], { duration: UI_CONFIG.timing.monsterAttack * 1.5 });
      this.impact(to, 'claw', { angle: Math.atan2(dy, dx) * 180 / Math.PI, size: 110, color: '#ffd9d0' });
      this.animate(token, [
        { transform: `translate(${dx}px, ${dy}px) scale(1.3)` },
        { transform: 'translate(0, 0) scale(1)' },
      ], { duration: UI_CONFIG.timing.monsterAttack, easing: UI_CONFIG.easing.enter });
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
    const dir = this.hitDir.get(el) ?? null;
    this.hitDir.delete(el);
    const power = Math.min(cfg.powerMax, cfg.powerBase + amount * cfg.powerPerDamage);
    el.classList.add('hit');
    sound.play('smallHit');
    this.screenShake('monster', power);
    this.number(el, `-${amount}`, { size: cfg.numberSize * (0.8 + power * 0.25) * (dir?.weak ? 1.2 : 1), duration: cfg.numberDuration, kind: dir?.weak ? 'weak' : 'damage' });
    if (dir?.weak) this.number(el, '弱点！', { size: UI_CONFIG.smallNumber.size * 0.85, duration: cfg.numberDuration, kind: 'weak', dy: -34 });
    await this.hitstop(Math.min(cfg.hitstopMax, cfg.hitstop * (power + (hp <= 0 ? cfg.lethalBonus : 0) + (dir?.weak ? cfg.weakBonus : 0))));
    el.classList.remove('hit');
    this.recoil({ el, dir, power, cause: 'fight' }, cfg);
    await this.delay(UI_CONFIG.timing.afterMonsterHit);
  }

  async monsterDefeated({ monsterId, playerId, reward, rewardRarity, baseRarity, lucky, pieceType }, model) {
    const el = this.renderer.monsterEl(monsterId);
    if (pieceType) model.players[playerId].pendingPiece = { type: pieceType, from: el ? this.centerOf(el) : null };
    if (rewardRarity) {
      model.players[playerId].generatedDraws = (model.players[playerId].generatedDraws ?? 0) + 1;
      model.players[playerId].pendingReward = { playerId, rarity: rewardRarity, base: baseRarity, lucky };
    }
    model.monsters = (model.monsters ?? []).filter((m) => m.monsterId !== monsterId);
    if (!el || this.skipping) {
      this.renderer.removeMonster(monsterId);
      return;
    }
    sound.play('hit', 0.6);
    this.sparks(this.centerOf(el), { count: 12, color: this.rarities?.[rewardRarity]?.color ?? '#ffcf3f', spread: 55, size: 8 });
    if (!rewardRarity) this.banner(`とどめ！ ${ICON.coin}${reward}`, UI_CONFIG.timing.reward, 'reward');
    await this.hitstop(UI_CONFIG.monsterHit.hitstop);
    // ふくらんで、はじける（輪・土けむり・星）
    const at = this.centerOf(el);
    const glow = this.rarities?.[rewardRarity]?.color ?? '#ffcf3f';
    const base = 'translate(-50%, -50%)';
    await this.animate(el, [
      { opacity: 1, transform: `${base} scale(1)` },
      { opacity: 1, transform: `${base} scale(.86, 1.12) rotate(-6deg)`, offset: 0.3, easing: UI_CONFIG.easing.enter },
      { opacity: 1, transform: `${base} scale(1.3) rotate(5deg)`, offset: 0.75, easing: UI_CONFIG.easing.exit },
      { opacity: 0, transform: `${base} scale(1.7, .3)` },
    ], { duration: UI_CONFIG.rewardFx.collapse * 2, fill: 'forwards' });
    if (!this.skipping) {
      this.ring(at, { size: 150, color: glow, duration: 420 });
      this.impact(at, 'star', { size: 96, color: '#fff3b8', duration: 300 });
      for (const [dx, dy] of [[-30, -8], [30, -8], [0, -30]]) this.puff(at, { size: 50, dx, dy, duration: 520 });
      this.shake(this.renderer.el.field, 5, 220);
    }
    this.renderer.removeMonster(monsterId);
  }

  async mpChanged({ playerId, delta, mp, reason }, model) {
    model.players[playerId].mp = mp;
    this.renderer.setMp(playerId, mp, undefined, { bump: true });
    if (this.skipping) return;
    const target = playerId === this.renderer.viewerId ? this.renderer.el.myMp : this.renderer.el.oppMp;
    if (target && !target.hidden) {
      const small = UI_CONFIG.smallNumber;
      this.number(target, `✦${delta > 0 ? '+' : ''}${delta}`, { size: small.size, duration: small.duration, kind: delta > 0 ? 'heal' : 'block' });
    }
    if (reason === 'card') {
      const chain = Object.keys(this.rarities ?? {}).filter(id => !this.rarities[id].special);
      const rank = Math.max(0, chain.indexOf(this.cards[model.players[playerId].manaCard]?.rarity));
      if (target && !target.hidden) {
        const center = this.centerOf(target);
        this.ring(center, { size: 45 + rank * 12, color: '#8ae5ff', duration: 350 });
        this.sparks(center, { count: 4 + rank * 3, color: '#8ae5ff', spread: 22 + rank * 6, size: 4 });
      }
      sound.play('fusion', rank / 4);
      await this.delay(UI_CONFIG.timing.coins);
    }
  }

  /** 放置された魔物が、レアリティが上がって強くなる */
  async monsterEvolved({ monsterId, rewardRarity, hp, maxHp, attack, castleAttack, count }, model) {
    const m = (model.monsters ?? []).find((x) => x.monsterId === monsterId);
    if (m) Object.assign(m, { hp, maxHp, attack, castleAttack, rewardRarity, evolveCount: count });
    this.renderer.updateMonster(monsterId, { hp, maxHp, attack, castleAttack, rewardRarity, evolveCount: count });
    if (this.skipping) return;
    const name = this.monsterDefs?.[m?.type]?.name ?? '魔物';
    const rarity = this.rarities?.[rewardRarity];
    sound.play('monster');
    this.banner(`${name}が育った！ ごほうび：${rarity?.name ?? ''}`, UI_CONFIG.timing.monsterAppear, 'threat');
    const mEl = this.renderer.monsterEl(monsterId);
    if (mEl?.isConnected) {
      const feet = this.feetOf(mEl);
      for (const stat of mEl.querySelectorAll('.st.atk, .monster-hp-text, .monster-reward')) this.animate(stat, [{transform:'scale(1)'},{transform:'scale(1.3)',offset:.4},{transform:'scale(1)'}], {duration:350});
      this.ring(feet, { size: 150, color: rarity?.color ?? '#ff6b6b', duration: 420 });
      this.sparks(feet, { count: 16, color: rarity?.color ?? '#ff6b6b', spread: 80, size: 9 });
    }
    this.shake(this.renderer.el.field, 5, 300);
    await this.delay(UI_CONFIG.timing.monsterAppear * 0.7);
  }

  /** 城が落ちて（降参も）抜けた人 */
  async playerEliminated({ playerId }, model, ctx) {
    if (model.players[playerId]) model.players[playerId].eliminated = true;
    if (this.skipping) return;
    const who = playerId === ctx.viewerId ? 'あなた' : `席${(model.playerOrder ?? []).indexOf(playerId) + 1}`;
    sound.play('monster');
    await this.banner(`${who}の城が落ちた！`, UI_CONFIG.timing.monsterAppear, 'threat');
  }

  async coinsChanged({ playerId, delta, coins, reason }, model) {
    model.players[playerId].coins = coins;
    this.renderer.setCoins(playerId, coins, { bump: true });
    if (this.skipping) return;
    if (delta > 0) sound.play('coin');
    const target = this.renderer.coinEl(playerId);
    // カード・ごほうびで増えたコインは、盤面から財布へ飛んでいく
    if (target && !target.hidden && delta > 0 && (reason === 'card' || reason === 'reward')) {
      const from = this.centerOf(this.renderer.el.field);
      const to = this.centerOf(target);
      const n = Math.min(UI_CONFIG.coinFx.flyMax, delta);
      for (let i = 0; i < n; i++) {
        const coin = this.fx('fx-coin', from);
        coin.innerHTML = icon('coin');
        const sx = (Math.random() - 0.5) * 90, sy = (Math.random() - 0.5) * 60;
        this.animate(coin, [
          { transform: 'translate(-50%, -50%) scale(.2)', opacity: 0 },
          { transform: `translate(calc(-50% + ${sx}px), calc(-50% + ${sy}px)) scale(1.2) rotate(${sx * 2}deg)`, opacity: 1, offset: 0.3, easing: 'cubic-bezier(.6, 0, .9, .6)' },
          { transform: `translate(calc(-50% + ${to.x - from.x}px), calc(-50% + ${to.y - from.y}px)) scale(.6) rotate(360deg)`, opacity: 1, offset: 0.95 },
          { transform: `translate(calc(-50% + ${to.x - from.x}px), calc(-50% + ${to.y - from.y}px)) scale(.2)`, opacity: 0 },
        ], { duration: UI_CONFIG.coinFx.flyDuration, delay: i * 45 * UI_CONFIG.speed, fill: 'both' }).then(() => coin.remove());
      }
    }
    if (target && !target.hidden) {
      const small = UI_CONFIG.smallNumber;
      const fx = UI_CONFIG.coinFx;
      this.number(target, `${ICON.coin}${delta > 0 ? '+' : ''}${delta}`, { size: small.size * (reason === 'card' ? fx.cardScale : reason === 'turn' ? fx.turnScale : 1), duration: reason === 'card' ? fx.cardDuration : reason === 'turn' ? fx.turnDuration : small.duration, kind: delta > 0 ? 'coin' : 'block' });
    }
    await this.delay(UI_CONFIG.timing.coins);
  }

  async upgradeBought({ playerId, upgradeId }, model) {
    const def = this.upgradeDefs?.[upgradeId];
    if (def?.effect === 'gainCard') model.players[playerId].generatedDraws = (model.players[playerId].generatedDraws ?? 0) + def.amount;
    if (def?.effect === 'boostDrops') model.players[playerId].luck = { draws: def.amount, boost: def.boost, from: def.fromRarity };
    sound.play('equip');
    this.banner(`${upgradeIcon(upgradeId)} ${def?.name ?? '強化'}！`, UI_CONFIG.timing.upgrade, 'small');
    await this.delay(UI_CONFIG.timing.upgrade * 0.5);
  }

  // ---------- 勝利 ----------

  confetti(container, colors) {
    container.innerHTML = '';
    const n = 42;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = `${i === n - 1 ? 1650 : 1050 + Math.random() * 550}ms`;
      c.style.animationDelay = `${i === n - 1 ? 250 : Math.random() * 250}ms`;
      c.style.setProperty('--dx', `${(Math.random() - 0.5) * 160}px`);
      c.style.setProperty('--rot', `${(Math.random() - 0.5) * 1440}deg`);
      container.appendChild(c);
    }
  }
}
