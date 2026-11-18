// サーバーが送る選択肢と席だけで部屋を描く。名前は必ず textContent。
import { castleArt, colorOf } from './art.js';
import { pillify } from './pills.js';
import { deckChoice, deckSlot } from './DeckStore.js';

const ROOM_DECK_KEY = 'cf-room-deck-v1';
export class RoomView {
  constructor({ onAction, onLeave, onEditDeck, savedDecks, presetDeck, previewDeck }) {
    this.onAction = onAction;
    this.onEditDeck = onEditDeck;   // デッキ編成の画面を開く
    Object.assign(this, { savedDecks, presetDeck, previewDeck });
    this.onLeave = onLeave;
    this.el = document.createElement('section');
    this.el.id = 'room-screen';
    this.el.className = 'screen';
    this.el.hidden = true;
    document.getElementById('app').append(this.el);
    this.pending = false;
    this.level = null;
    try {
      const cached = JSON.parse(sessionStorage.getItem(ROOM_DECK_KEY));
      if (cached && typeof cached.name === 'string' && cached.list && typeof cached.list === 'object') {
        this.customSelection = cached;
      }
    } catch { /* 部屋のプレビューはページ内だけに保持する */ }
  }
  hide() { this.el.hidden = true; }

  clearMyDeckSelection() {
    this.customSelection = null;
    try { sessionStorage.removeItem(ROOM_DECK_KEY); } catch { /* ストレージなし */ }
  }

  ownSelection() {
    const { room } = this;
    const selection = this.customSelection;
    if (selection?.roomId === room?.roomId && selection?.playerId === room?.you) return selection;
    return null;
  }

  async useMyDeck(slot) {
    const deck = this.savedDecks()[slot];
    if (!deck?.valid) {
      this.onEditDeck?.(slot);
      return;
    }
    const { roomId, you } = this.room;
    const result = await this.act('setSeat', [{ deckList: deck.list }]);
    if (!result?.ok || this.room.roomId !== roomId || this.room.you !== you) return;
    this.customSelection = { ...deck, roomId, playerId: you };
    // サーバーは部屋の表示に編成内容を含めないので、自分が送った内容をこのタブに覚える。
    try { sessionStorage.setItem(ROOM_DECK_KEY, JSON.stringify(this.customSelection)); } catch { /* ストレージなし */ }
    if (!this.el.hidden) this.render(this.room, this.passphrase);
  }

  refreshDecks(saved) {
    if (this.el.hidden || !this.room || this.room.started) return;
    // 部屋で選んだマイデッキの名前は、このタブに覚えてある。名前が変わったら、覚えている名前も直す
    const kept = this.ownSelection();
    const latest = kept && this.savedDecks()[kept.slot];
    if (latest && latest.name !== kept.name) {
      this.customSelection = { ...kept, name: latest.name };
      try { sessionStorage.setItem(ROOM_DECK_KEY, JSON.stringify(this.customSelection)); } catch { /* ストレージなし */ }
    }
    const me = this.room.players.find(player => player.playerId === this.room.you);
    if (me?.costDeck === 'custom' && saved?.list && this.ownSelection()?.slot === saved.slot) {
      void this.useMyDeck(saved.slot);
    } else this.render(this.room, this.passphrase);
  }
  node(tag, text, cls) {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    if (cls) el.className = cls;
    return el;
  }
  async act(method, args) {
    if (this.pending) return;
    this.pending = true;
    this.render(this.room, this.passphrase);
    let res;
    try {
      res = await this.onAction(method, args);
      this.notice = res?.ok ? '' : (res?.reason ?? '送信できませんでした');
    } catch { this.notice = '接続を確認して、もう一度ためしてください'; }
    this.pending = false;
    if (!this.el.hidden) this.render(this.room, this.passphrase);
    return res;
  }
  select(parent, label, choices, value, editable, change, slot) {
    const row = this.node(editable ? 'div' : 'label', null, 'room-select');
    row.append(this.node('span', label));
    if (editable) {
      row.classList.add('has-pills');
      const input = this.node('select');
      for (const choice of choices ?? []) {
        const opt = this.node('option', choice.name);
        opt.value = choice.id;
        opt.disabled = Boolean(choice.locked);
        input.append(opt);
      }
      input.value = value ?? '';
      input.disabled = this.pending;
      input.addEventListener('change', () => change(input.value));
      row.append(input);
      input.dataset.slot = slot ?? label;
      pillify(input, label);
    } else {
      row.append(this.node('b', choices?.find(c => c.id === value)?.name ?? '—'));
    }
    parent.append(row);
  }
  button(parent, text, action, disabled = false, cls = 'small-btn') {
    const btn = this.node('button', text, cls);
    btn.type = 'button'; btn.disabled = disabled || this.pending;
    btn.addEventListener('click', action); parent.append(btn);
    return btn;
  }
  render(room, passphrase) {
    this.room = room; this.passphrase = passphrase;
    // 描き直すとフォーカスが消えるので、フォーカス中のピルを覚えて、描き直したあとに戻す
    let refocus = null;
    const active = document.activeElement;
    if (active?.classList?.contains('pill') && this.el.contains(active)) {
      const sel = active.parentElement.previousElementSibling;
      refocus = { name: sel?.dataset.slot, value: active.dataset.value };
    }
    if (refocus) this.refocus = refocus; // 送信中は無効のピルにフォーカスできないので、送信が終わった描き直しまで持ち越す
    this.el.hidden = false; this.el.replaceChildren();
    const box = this.node('div', null, 'room-box'); this.el.append(box);
    const host = room.you === room.hostId;
    const choices = room.choices ?? {};
    box.append(this.node('h1', 'みんなの部屋'));
    box.append(this.node('p', '合言葉を伝えて、仲間を招待しよう', 'room-note'));
    box.append(this.node('strong', passphrase || room.roomId, 'room-passphrase'));
    const head = this.node('div', null, 'room-heading');
    head.append(this.node('h2', `参加者 ${room.players.length} / ${room.capacity}`));
    this.button(head, '部屋を出る', this.onLeave); box.append(head);
    const seats = this.node('div', null, 'room-seats'); box.append(seats);
    for (const p of room.players) {
      const seat = this.node('article', null, 'room-seat');
      seat.classList.toggle('room-self', p.playerId === room.you);
      seat.dataset.team = room.settings.teams === 'choose' ? (p.team ?? '') : '';
      const title = this.node('h3', p.name);
      if (p.playerId === room.you) title.append(this.node('small', 'あなた'));
      if (p.playerId === room.hostId) title.append(this.node('small', '部屋主'));
      seat.append(title);
      // 選んだ城の絵を席に出す（城の種類を変えると絵も変わる）
      const pic = this.node('div', null, 'room-seat-pic'); pic.setAttribute('aria-hidden', 'true');
      pic.innerHTML = castleArt(colorOf(p.playerId), 0, p.castle ?? 'standard'); seat.append(pic);
      const level = choices.cpuLevels?.find(c => c.id === p.cpu)?.name;
      seat.append(this.node('p', `${p.cpu ? `CPU · ${level ?? p.cpu}` : 'プレイヤー'} · ${p.connected ? '接続中' : '再接続を待っています'}`, 'room-note'));
      const edit = p.playerId === room.you || (host && Boolean(p.cpu));
      const set = (patch) => this.act('setSeat', p.playerId === room.you ? [patch] : [patch, p.playerId]);
      this.select(seat, '城', choices.castles, p.castle, edit, v => set({castle:v}), `${p.playerId}:castle`);
      if (room.settings.deckMode === 'cost') {
        // デッキ編成（コスト制）：見本のデッキか、自分で編成したデッキ（自分の席だけ）
        const mine = p.playerId === room.you;
        const saved = mine ? this.savedDecks() : [];
        const selection = mine && p.costDeck === 'custom' ? this.ownSelection() : null;
        const list = [...(choices.costDecks ?? [])];
        for (const deck of saved) {
          if (deck?.valid) list.push({ id: deckChoice(deck.slot), name: deck.name });
        }
        if (p.costDeck === 'custom' && !selection) list.push({ id: 'server-custom', name: 'マイデッキ', locked: true });
        if (selection && !saved[selection.slot]?.valid) {
          list.push({ id: deckChoice(selection.slot), name: selection.name, locked: true });
        }
        const selected = p.costDeck === 'custom' ? (selection ? deckChoice(selection.slot) : 'server-custom') : p.costDeck;
        this.select(seat, 'デッキ', list, selected, edit, v => {
          const slot = deckSlot(v);
          return slot === null ? set({ costDeck: v }) : this.useMyDeck(slot);
        }, `${p.playerId}:costDeck`);
        const preview = this.node('div');
        this.previewDeck(preview, selection ?? this.presetDeck(p.costDeck));
        seat.append(preview);
        const invalid = saved.find(deck => deck && !deck.valid);
        if (mine && this.onEditDeck) this.button(seat, invalid ? '保存したデッキを修正' : 'デッキを編成する', () => this.onEditDeck(invalid?.slot));
      } else {
        this.select(seat, 'デッキ', choices.decks, p.deck, edit && room.settings.deckMode === 'own', v => set({deck:v}), `${p.playerId}:deck`);
        if (room.settings.deckMode === 'own') {
          const preview = this.node('div');
          this.previewDeck(preview, this.presetDeck(p.deck));
          seat.append(preview);
        }
        if (room.settings.deckMode !== 'own') seat.append(this.node('small', '共通の山札を使います', 'room-note'));
      }
      if (room.settings.teams === 'choose') this.select(seat, 'チーム', choices.teams, p.team, edit, v => set({team:v}), `${p.playerId}:team`);
      else seat.append(this.node('small', room.settings.teams === 'auto' ? '開始時にチームを分けます' : '個人戦', 'room-note'));
      if (host && p.cpu) this.button(seat, 'CPUを外す', () => this.act('removeCpu', [p.playerId]));
      seats.append(seat);
    }
    const settings = this.node('section', null, 'room-settings'); box.append(settings);
    settings.append(this.node('h2', '対戦ルール'));
    if (!host) settings.append(this.node('p', 'ルールとCPUは部屋主が選びます。自分の城・デッキは変更できます。', 'room-note'));
    // 版（西洋・日本）。部屋の全員が同じ版で遊ぶ（変えると、ちがう版の人の画面は読み直される）
    const rules = [['winCondition','勝ち方','winConditions'],['deckMode','山札','deckModes'],['teams','チームの分け方','teamModes']];
    if ((choices.editions ?? []).length > 1) rules.unshift(['edition','国（版）','editions']);
    for (const [key,label,list] of rules) {
      this.select(settings, label, choices[list], room.settings[key], host, v => this.act('setRules', [{[key]:v}]), `rule:${key}`);
    }
    if (host) {
      this.level ??= choices.cpuLevels?.[0]?.id;
      this.select(settings, '追加するCPUの強さ', choices.cpuLevels, this.level, true, v => {this.level=v;}, 'cpuLevel');
      this.button(settings, 'CPUを追加', () => this.act('addCpu', [this.level]), room.players.length >= room.capacity);
      if (room.players.length >= room.capacity) settings.append(this.node('p', '満員のためCPUを追加できません', 'room-note'));
    }
    let reason = '';
    if (room.players.length < room.minPlayers) reason = `開始には${room.minPlayers}人必要です。仲間を招待するかCPUを追加してください。`;
    else if (room.settings.teams === 'choose' && new Set(room.players.map(p => p.team)).size < 2) reason = '2つ以上のチームに分かれてください。';
    else if (room.settings.teams === 'choose' && room.players.some(p => room.players.filter(q => q.team === p.team).length > 7)) reason = '1チームは7人までです。';
    const launch = this.node('section', null, 'room-launch');
    box.insertBefore(launch, seats);
    const description = this.node('p', host ? reason : '部屋主が対戦を始めるのを待っています', 'room-note');
    description.id = 'room-start-reason';
    if (description.textContent) launch.append(description);
    if (host) {
      const start = this.button(launch, '対戦をはじめる', () => this.act('start', []), Boolean(reason), 'plank-btn room-start');
      if (reason) start.setAttribute('aria-describedby', description.id);
    }
    const status = this.node('p', this.pending ? '送信しています…' : this.notice ?? '', 'room-status');
    status.setAttribute('role', 'status'); launch.append(status);
    if (this.refocus && !this.pending) {
      const target = this.refocus; this.refocus = null;
      for (const sel of this.el.querySelectorAll('select[data-slot]')) {
        if (sel.dataset.slot !== target.name) continue;
        [...sel.nextElementSibling.children].find(b => b.dataset.value === target.value)?.focus({ preventScroll: true });
      }
    }
  }
}
