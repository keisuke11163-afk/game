// 手札の表示と入力。カードを使う方法は3つ（js/ui/config.js の input で切り替え）：
//   1. タップで選ぶ →「使う」ボタン
//   2. 選んだカードをもう一度タップ
//   3. カードを上（盤面）へドラッグして離す
// 捨てるカードを選ぶ画面もここで扱う。

import { UI_CONFIG } from './config.js';
import { KIND_LABEL, cardDescription } from './text.js';

const $ = (id) => document.getElementById(id);

export class HandView {
  /**
   * @param {{ cards: object, rules: object,
   *           onPlay: (cardId: string) => void,
   *           onDiscard: (cardIds: string[]) => void,
   *           onNotice: (text: string) => void }} opts
   */
  constructor({ cards, rules, onPlay, onDiscard, onNotice }) {
    this.cards = cards;
    this.rules = rules;
    this.onPlay = onPlay;
    this.onDiscard = onDiscard;
    this.onNotice = onNotice;

    this.hand = [];          // [{ cardId, type }]
    this.selectedId = null;
    this.locked = true;      // 演出中・交代画面中は操作しない
    this.dim = false;        // このターンはもう出した（見た目だけ。押せば理由が出る）
    this.discardCount = 0;   // 0 以外なら「捨てるカードを選ぶ」モード
    this.discardPicks = new Set();
    this.drag = null;

    this.el = {
      app: $('app'),
      controls: $('controls'),
      hand: $('hand'),
      field: $('field'),
      dropHint: $('drop-hint'),
      detail: $('card-detail'),
      detailKind: document.querySelector('#card-detail .detail-kind'),
      detailName: document.querySelector('#card-detail .detail-name'),
      detailDesc: document.querySelector('#card-detail .detail-desc'),
      detailHint: document.querySelector('#card-detail .detail-hint'),
      detailUse: document.querySelector('#card-detail .detail-use'),
      discardBar: $('discard-bar'),
      discardMsg: document.querySelector('#discard-bar .discard-msg'),
      discardOk: document.querySelector('#discard-bar .discard-ok'),
    };

    this.el.hand.addEventListener('click', (e) => this.handleClick(e));
    this.el.hand.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    this.el.detailUse.addEventListener('click', () => {
      if (!this.locked && this.selectedId) this.play(this.selectedId);
    });
    this.el.discardOk.addEventListener('click', () => {
      if (this.locked || !this.discardCount) return;
      const left = this.discardCount - this.discardPicks.size;
      if (left > 0) this.onNotice(`捨てるカードをあと${left}枚えらんでください`);
      else this.onDiscard([...this.discardPicks]);
    });
    // 手札の外をタップしたら選択をやめる
    this.el.app.addEventListener('click', (e) => {
      if (this.selectedId && !e.target.closest('#hand, #card-detail, #debug-panel, #debug-toggle')) this.select(null);
    });
  }

  // ---------- 表示 ----------

  /**
   * @param {{cardId:string,type:string}[]} hand
   * @param {{ dim?: boolean, newIds?: Iterable<string> }} opts
   */
  render(hand, { dim = this.dim, newIds = [] } = {}) {
    this.hand = hand.map((c) => ({ ...c }));
    this.dim = dim;
    if (this.selectedId && !this.hand.some((c) => c.cardId === this.selectedId)) this.selectedId = null;
    for (const id of [...this.discardPicks]) if (!this.hand.some((c) => c.cardId === id)) this.discardPicks.delete(id);
    const fresh = new Set(newIds);
    const box = this.el.hand;
    box.innerHTML = '';
    if (this.hand.length === 0) {
      box.innerHTML = '<div class="hand-empty">手札がありません</div>';
    }
    for (const card of this.hand) box.appendChild(this.makeCardEl(card, fresh.has(card.cardId)));
    this.updateDetail();
    this.updateDiscardBar();
  }

  makeCardEl(card, isNew = false) {
    const def = this.cards[card.type] ?? { name: card.type };
    const el = document.createElement('div');
    el.className = `card ${def.kind ?? ''}`;
    el.dataset.id = card.cardId;
    el.innerHTML = '<span class="card-kind"></span><span class="card-name"></span><span class="card-desc"></span>';
    el.querySelector('.card-kind').textContent = KIND_LABEL[def.kind] ?? '';
    el.querySelector('.card-name').textContent = def.name;
    el.querySelector('.card-desc').textContent = cardDescription(def, this.rules);
    if (isNew) el.classList.add('new');
    this.applyCardClasses(el);
    return el;
  }

  applyCardClasses(el) {
    const id = el.dataset.id;
    el.classList.toggle('selected', id === this.selectedId);
    el.classList.toggle('dim', this.dim && !this.discardCount);
    el.classList.toggle('discard-pick', this.discardPicks.has(id));
  }

  refreshClasses() {
    for (const el of this.el.hand.querySelectorAll('.card')) this.applyCardClasses(el);
  }

  /** 手札を一度空にする（手番交代の画面を出すとき、前の人の手札を残さない） */
  clear() {
    this.hand = [];
    this.selectedId = null;
    this.discardCount = 0;
    this.discardPicks.clear();
    this.cancelDrag();
    this.el.hand.innerHTML = '';
    this.updateDetail();
    this.updateDiscardBar();
  }

  setLocked(locked) {
    this.locked = locked;
    if (locked) this.cancelDrag();
    this.updateDetail();
  }

  setDim(dim) {
    this.dim = dim;
    this.refreshClasses();
  }

  cardEl(cardId) {
    return this.el.hand.querySelector(`.card[data-id="${CSS.escape(cardId)}"]`);
  }

  /** 演出用：カードを手札から抜き、抜く前の位置と見た目の複製を返す */
  takeCard(cardId) {
    const el = this.cardEl(cardId);
    let info = null;
    if (el) {
      info = { rect: el.getBoundingClientRect(), clone: el.cloneNode(true) };
      el.remove();
    }
    this.hand = this.hand.filter((c) => c.cardId !== cardId);
    if (this.selectedId === cardId) this.selectedId = null;
    if (this.hand.length === 0 && !this.el.hand.querySelector('.hand-empty')) {
      this.el.hand.innerHTML = '<div class="hand-empty">手札がありません</div>';
    }
    this.updateDetail();
    return info;
  }

  /** 引いたカードを1枚ずつ加える */
  addCard(card) {
    this.el.hand.querySelector('.hand-empty')?.remove();
    this.hand.push({ ...card });
    const el = this.makeCardEl(card, true);
    this.el.hand.appendChild(el);
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /** 出せなかったカードを揺らす */
  deny(cardId) {
    const el = this.cardEl(cardId);
    if (!el) return;
    el.classList.remove('denied');
    void el.offsetWidth;
    el.classList.add('denied');
  }

  // ---------- 選択と「使う」 ----------

  select(cardId) {
    this.selectedId = cardId;
    this.refreshClasses();
    this.updateDetail();
  }

  play(cardId) {
    this.select(null);
    this.onPlay(cardId);
  }

  updateDetail() {
    const card = this.hand.find((c) => c.cardId === this.selectedId);
    if (!card || this.discardCount) {
      this.el.detail.hidden = true;
      return;
    }
    const def = this.cards[card.type] ?? { name: card.type };
    const input = UI_CONFIG.input;
    this.el.detailKind.textContent = KIND_LABEL[def.kind] ?? '';
    this.el.detailName.textContent = def.name;
    this.el.detailDesc.textContent = cardDescription(def, this.rules);
    const hints = [];
    if (input.tapAgain) hints.push('もう一度タップ');
    if (input.dragToPlay) hints.push('盤面へドラッグ');
    this.el.detailHint.textContent = hints.length ? `${hints.join('・')}でも使えます` : '';
    this.el.detailUse.hidden = !input.useButton;
    this.el.detail.hidden = false;
  }

  handleClick(e) {
    if (this.locked) return;
    if (this.drag?.moved) return;
    const el = e.target.closest('.card');
    if (!el) return;
    const id = el.dataset.id;

    if (this.discardCount) {
      this.toggleDiscard(id);
      return;
    }
    const input = UI_CONFIG.input;
    if (id === this.selectedId) {
      if (input.tapAgain) this.play(id);
      else this.select(null);
      return;
    }
    // 選ぶ方法がどれも無効なら、タップで即使う（押して何も起きない、を避ける）
    if (!input.useButton && !input.tapAgain && !input.dragToPlay) {
      this.play(id);
      return;
    }
    this.select(id);
  }

  // ---------- ドラッグで使う ----------

  handlePointerDown(e) {
    if (this.locked || this.discardCount || !UI_CONFIG.input.dragToPlay) return;
    if (e.button !== undefined && e.button !== 0) return;
    const el = e.target.closest('.card');
    if (!el) return;
    this.drag = { id: el.dataset.id, el, startX: e.clientX, startY: e.clientY, moved: false, ghost: null, pointerId: e.pointerId };
    const move = (ev) => this.handlePointerMove(ev);
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      this.handlePointerUp(ev);
    };
    const cancel = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      this.cancelDrag();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }

  handlePointerMove(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved) {
      // 上向きに動かしたときだけドラッグ（横は手札のスライドにまかせる）
      if (-dy < UI_CONFIG.input.dragStartDistance || Math.abs(dy) < Math.abs(dx)) return;
      d.moved = true;
      d.ghost = d.el.cloneNode(true);
      d.ghost.classList.remove('selected', 'new', 'denied');
      d.ghost.classList.add('drag-ghost');
      this.el.app.appendChild(d.ghost);
      d.el.classList.add('drag-source');
      this.el.dropHint.hidden = false;
      this.select(null);
    }
    const app = this.el.app.getBoundingClientRect();
    d.ghost.style.left = `${e.clientX - app.left}px`;
    d.ghost.style.top = `${e.clientY - app.top}px`;
    this.el.dropHint.classList.toggle('active', this.overField(e));
  }

  handlePointerUp(e) {
    const d = this.drag;
    if (!d) return;
    if (d.moved && this.overField(e)) {
      const id = d.id;
      this.cancelDrag();
      this.play(id);
      return;
    }
    this.cancelDrag();
  }

  overField(e) {
    const r = this.el.field.getBoundingClientRect();
    const board = document.getElementById('board').getBoundingClientRect();
    return e.clientY < r.bottom && e.clientY > board.top && e.clientX > board.left && e.clientX < board.right;
  }

  cancelDrag() {
    const d = this.drag;
    if (!d) return;
    d.ghost?.remove();
    d.el.classList.remove('drag-source');
    this.el.dropHint.hidden = true;
    this.el.dropHint.classList.remove('active');
    // click イベントが後から来るので、少し後に drag を消す
    if (d.moved) setTimeout(() => { if (this.drag === d) this.drag = null; }, 0);
    else this.drag = null;
  }

  // ---------- 捨てるカードを選ぶ ----------

  enterDiscard(count) {
    this.discardCount = count;
    this.discardPicks.clear();
    this.select(null);
    this.el.controls.classList.add('discarding');
    this.refreshClasses();
    this.updateDiscardBar();
  }

  exitDiscard() {
    this.discardCount = 0;
    this.discardPicks.clear();
    this.el.controls.classList.remove('discarding');
    this.refreshClasses();
    this.updateDiscardBar();
  }

  toggleDiscard(cardId) {
    if (this.discardPicks.has(cardId)) this.discardPicks.delete(cardId);
    else if (this.discardPicks.size < this.discardCount) this.discardPicks.add(cardId);
    else {
      // 上限まで選んでいたら、いちばん古い選択と入れかえる
      const first = this.discardPicks.values().next().value;
      this.discardPicks.delete(first);
      this.discardPicks.add(cardId);
    }
    this.refreshClasses();
    this.updateDiscardBar();
  }

  updateDiscardBar() {
    if (!this.discardCount) {
      this.el.discardBar.hidden = true;
      return;
    }
    const left = this.discardCount - this.discardPicks.size;
    this.el.discardMsg.textContent = left > 0
      ? `手札が${this.rules.maxHand}枚を超えています。捨てるカードをあと${left}枚えらんでください`
      : `この${this.discardCount}枚を捨てます`;
    this.el.discardOk.textContent = `捨てる（${this.discardPicks.size}/${this.discardCount}）`;
    this.el.discardOk.classList.toggle('not-ready', left > 0);
    this.el.discardBar.hidden = false;
  }
}
