// デバッグパネル（URL に ?debug=1 を付けたときだけ出す）。
// 城HP・手札・山札の順番は、Game が用意するデバッグ用メソッド
// （debugSetCastleHp / debugSetHand / debugSetDeck）を使う。UI 側では状態を書き換えない。
// メソッドがなければ「ロジック未対応」と表示する。

import { UI_CONFIG } from './config.js';
import { playerName } from './text.js';

export class DebugPanel {
  /**
   * @param {{ cards: object,
   *           getGame: () => object,
   *           getSeed: () => number,
   *           getViewerId: () => string,
   *           onRestart: (seed: number) => void,
   *           onChanged: () => void,
   *           onConfigChanged: () => void,
   *           onTestClash: () => void,
   *           getPlaceholders: () => { missing: string[], standIns: [string, string][] },
   *           notify: (text: string, kind?: string) => void }} opts
   */
  constructor(opts) {
    Object.assign(this, opts);
    const app = document.getElementById('app');

    this.toggle = document.createElement('button');
    this.toggle.id = 'debug-toggle';
    this.toggle.type = 'button';
    this.toggle.textContent = 'DEBUG';
    app.appendChild(this.toggle);

    this.panel = document.createElement('div');
    this.panel.id = 'debug-panel';
    this.panel.hidden = true;
    app.appendChild(this.panel);

    this.toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.panel.hidden = !this.panel.hidden;
      if (!this.panel.hidden) this.build();
    });
    // パネル内の操作が「演出を飛ばす」タップにならないようにする
    for (const type of ['pointerdown', 'click']) {
      this.panel.addEventListener(type, (e) => e.stopPropagation());
    }
  }

  api(name) {
    const game = this.getGame();
    return game && typeof game[name] === 'function' ? game[name].bind(game) : null;
  }

  call(name, ...args) {
    const fn = this.api(name);
    if (!fn) return;
    try {
      const res = fn(...args);
      if (res && res.ok === false) {
        this.notify(String(res.reason ?? '変更できませんでした'));
        return;
      }
      this.onChanged();
      this.build();
    } catch (err) {
      console.error(err);
      this.notify(`デバッグ操作に失敗しました：${err.message}`);
    }
  }

  build() {
    const p = this.panel;
    const typeKeys = Object.keys(this.cards);
    const typeList = typeKeys.map((k) => `${k}（${this.cards[k].name}）`).join('、');
    const state = this.getGame()?.getState(this.getViewerId());
    const viewer = this.getViewerId() ?? 'p1';
    const handTypes = state?.players[viewer]?.hand?.map((c) => c.type) ?? [];
    const off = (name) => (this.api(name) ? '' : `<span class="off">ロジック未対応（game.${name}）</span>`);

    const ph = this.getPlaceholders();
    const showSquares = document.getElementById('app').classList.contains('show-squares');
    p.innerHTML = `
      <h3>見た目の確認</h3>
      <div class="row"><button type="button" class="test-clash">ぶつかる演出を試す</button></div>
      <div class="note">兵士同士の戦い（soldiersClashed）の演出だけを流します。ゲームの状態は変わりません</div>
      <div class="row"><label><input type="checkbox" class="show-squares" ${showSquares ? 'checked' : ''}> マスの位置と番号を表示</label></div>
      <div class="note">位置は js/ui/config.js の board で調整します（番号は道のマス番号）</div>

      <h3>仮の絵：あと ${ph.missing.length} 枚</h3>
      ${ph.missing.length ? `<ul class="missing">${ph.missing.map((f) => `<li>${f}</li>`).join('')}</ul>` : '<div class="note">全部そろっています</div>'}
      ${ph.standIns.length ? `<div class="note">代わりの画像で表示中：${ph.standIns.map(([k, v]) => `${k} → ${v}`).join('、')}</div>` : ''}

      <h3>乱数シード（山札の順番を固定）</h3>
      <div class="row">いま：<b>${this.getSeed()}</b>
        <input type="number" class="seed" value="${this.getSeed()}">
        <button type="button" class="restart">このシードで最初から</button></div>
      <div class="note">URL に &amp;seed=${this.getSeed()} を付けると、毎回同じ順番で始まります</div>

      <h3>山札の順番（上から）</h3>
      <div class="row"><input type="text" class="deck" placeholder="infantry,fireball,knight">
        <button type="button" class="set-deck" ${this.api('debugSetDeck') ? '' : 'disabled'}>設定</button></div>
      <div class="note">使える種類：${typeList}</div>${off('debugSetDeck')}

      <h3>城HP</h3>
      ${['p1', 'p2'].map((id) => `
        <div class="row">${playerName(id)}
          <input type="number" class="hp" data-player="${id}" value="${state?.players[id]?.castleHp ?? ''}">
          <button type="button" class="set-hp" data-player="${id}" ${this.api('debugSetCastleHp') ? '' : 'disabled'}>設定</button></div>`).join('')}
      ${off('debugSetCastleHp')}

      <h3>${playerName(viewer)}の手札</h3>
      <div class="row"><input type="text" class="hand" value="${handTypes.join(',')}">
        <button type="button" class="set-hand" ${this.api('debugSetHand') ? '' : 'disabled'}>設定</button></div>
      <div class="row">${typeKeys.map((k) => `<button type="button" class="add-card" data-type="${k}" ${this.api('debugSetHand') ? '' : 'disabled'}>＋${this.cards[k].name}</button>`).join('')}</div>
      ${off('debugSetHand')}

      <h3>演出の速さ（大きいほどゆっくり）</h3>
      <div class="row"><input type="range" class="speed" min="0.25" max="3" step="0.25" value="${UI_CONFIG.speed}">
        <b class="speed-value">×${UI_CONFIG.speed}</b></div>

      <h3>カードの使い方</h3>
      <div class="row"><label><input type="checkbox" class="in-button" ${UI_CONFIG.input.useButton ? 'checked' : ''}> タップ→「使う」ボタン</label></div>
      <div class="row"><label><input type="checkbox" class="in-again" ${UI_CONFIG.input.tapAgain ? 'checked' : ''}> もう一度タップ</label></div>
      <div class="row"><label><input type="checkbox" class="in-drag" ${UI_CONFIG.input.dragToPlay ? 'checked' : ''}> 盤面へドラッグ</label></div>
      <div class="note">全部オフにすると、タップですぐ使います</div>
    `;

    const q = (sel) => p.querySelector(sel);
    const types = (text) => text.split(/[,、\s]+/).map((s) => s.trim()).filter(Boolean);
    const checkTypes = (list) => {
      const bad = list.filter((t) => !this.cards[t]);
      if (bad.length) this.notify(`知らない種類です：${bad.join(', ')}`);
      return bad.length === 0;
    };

    q('.test-clash').addEventListener('click', () => this.onTestClash());
    q('.show-squares').addEventListener('change', (e) => {
      document.getElementById('app').classList.toggle('show-squares', e.target.checked);
    });
    q('.restart').addEventListener('click', () => this.onRestart(Number(q('.seed').value) >>> 0));
    q('.set-deck').addEventListener('click', () => {
      const list = types(q('.deck').value);
      if (checkTypes(list)) this.call('debugSetDeck', list);
    });
    p.querySelectorAll('.set-hp').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.player;
      this.call('debugSetCastleHp', id, Number(p.querySelector(`.hp[data-player="${id}"]`).value));
    }));
    q('.set-hand').addEventListener('click', () => {
      const list = types(q('.hand').value);
      if (checkTypes(list)) this.call('debugSetHand', viewer, list);
    });
    p.querySelectorAll('.add-card').forEach((b) => b.addEventListener('click', () => {
      this.call('debugSetHand', viewer, [...handTypes, b.dataset.type]);
    }));
    q('.speed').addEventListener('input', (e) => {
      UI_CONFIG.speed = Number(e.target.value);
      q('.speed-value').textContent = `×${UI_CONFIG.speed}`;
      this.onConfigChanged();
    });
    const bindCheck = (sel, key) => q(sel).addEventListener('change', (e) => {
      UI_CONFIG.input[key] = e.target.checked;
      this.onConfigChanged();
    });
    bindCheck('.in-button', 'useButton');
    bindCheck('.in-again', 'tapAgain');
    bindCheck('.in-drag', 'dragToPlay');
  }
}
