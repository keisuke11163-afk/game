// コインで買う強化のパネル（upgrades.json の強化を並べる）。
// 買えるかどうかと理由は main.js が game.canBuyUpgrade() で調べて渡す。ここでは状態を書き換えない。

import { upgradeDescription } from './text.js';
import { upgradeIcon, ICON } from './look.js';

const $ = (id) => document.getElementById(id);

export class UpgradePanel {
  /**
   * @param {{ upgrades: object, onBuy: (upgradeId: string) => void, onOpen: () => void }} opts
   *   onOpen：パネルを開くとき（main.js が最新の状態で refresh() を呼ぶ）
   */
  constructor({ upgrades, onBuy, onOpen }) {
    this.upgrades = upgrades;
    this.onBuy = onBuy;
    this.onOpen = onOpen;
    this.el = {
      open: $('upgrade-open'),
      panel: $('upgrade-panel'),
      list: document.querySelector('#upgrade-panel .upgrade-list'),
      coins: document.querySelector('#upgrade-panel .upgrade-coins'),
      close: document.querySelector('#upgrade-panel .upgrade-close'),
    };
    this.el.open.hidden = false;
    this.el.open.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.el.panel.hidden) this.open();
      else this.close();
    });
    this.el.close.addEventListener('click', () => this.close());
    this.el.list.addEventListener('click', (e) => {
      const btn = e.target.closest('.upgrade-item');
      if (!btn) return;
      this.onBuy(btn.dataset.id);
    });
    // パネルの外をタップしたら閉じる
    document.getElementById('app').addEventListener('click', (e) => {
      if (!this.el.panel.hidden && !e.target.closest('#upgrade-panel, #upgrade-open')) this.close();
    });
  }

  get isOpen() {
    return !this.el.panel.hidden;
  }

  open() {
    this.onOpen();
    this.el.panel.hidden = false;
  }

  close() {
    this.el.panel.hidden = true;
  }

  /** 開けるかどうか（自分のメインの場面だけ） */
  setEnabled(enabled, { highlight = false } = {}) {
    this.el.open.disabled = !enabled;
    this.el.open.classList.toggle('ready', enabled && highlight);
    if (!enabled) this.close();
  }

  /**
   * @param {number} coins 自分のコイン
   * @param {{ [upgradeId: string]: { ok: boolean, reason?: string } }} status canBuyUpgrade の結果
   * @param {{ [upgradeId: string]: number }} bought このゲームで買った回数
   */
  refresh(coins, status, bought) {
    this.el.coins.textContent = `${ICON.coin}${coins}`;
    const list = this.el.list;
    list.innerHTML = '';
    for (const [id, def] of Object.entries(this.upgrades)) {
      const st = status[id] ?? { ok: false, reason: '' };
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `upgrade-item${st.ok ? '' : ' blocked'}`;
      btn.dataset.id = id;
      btn.innerHTML = '<span class="upgrade-icon"></span><span class="upgrade-text"><b class="upgrade-name"></b>' +
        '<span class="upgrade-desc"></span><span class="upgrade-reason"></span></span><span class="upgrade-cost"></span>';
      btn.querySelector('.upgrade-icon').textContent = upgradeIcon(id);
      btn.querySelector('.upgrade-name').textContent = def.name;
      let desc = upgradeDescription(def);
      if (def.limit !== undefined) desc += `（あと${Math.max(0, def.limit - (bought[id] ?? 0))}回）`;
      btn.querySelector('.upgrade-desc').textContent = desc;
      btn.querySelector('.upgrade-reason').textContent = st.ok ? '' : (st.reason ?? '');
      btn.querySelector('.upgrade-cost').textContent = `${ICON.coin}${def.cost}`;
      list.appendChild(btn);
    }
  }
}
