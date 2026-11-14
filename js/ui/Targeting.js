// 対象を選ぶ（対象が2つ以上あるカード）。盤面の対象を光らせ、タップで選んでもらう。
// やめ方：「やめる」ボタン・光っていない所をタップ・盤面の外（手札など）をタップ。
// どこに出せるかは main.js が game.getTargets() で調べて渡す。ここでは状態を書き換えない。

const $ = (id) => document.getElementById(id);

export class Targeting {
  /**
   * @param {{ renderer: import('./Renderer.js').Renderer,
   *           handView: import('./HandView.js').HandView,
   *           onChoose: (cardId: string, target: object) => void }} opts
   */
  constructor({ renderer, handView, onChoose }) {
    this.renderer = renderer;
    this.handView = handView;
    this.onChoose = onChoose;
    this.current = null; // { cardId, targets, armed }
    this.el = {
      app: $('app'),
      bar: $('target-bar'),
      msg: document.querySelector('#target-bar .target-msg'),
      cancel: document.querySelector('#target-bar .target-cancel'),
    };
    this.el.cancel.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cancel();
    });
    // 盤面と帯の外をタップしたらやめる（盤面のタップは Renderer から tap() で届く）
    this.el.app.addEventListener('click', (e) => {
      if (!this.current?.armed) return;
      if (e.target.closest('#board, #target-bar, #debug-panel, #debug-toggle')) return;
      this.cancel();
    });
  }

  get active() {
    return Boolean(this.current);
  }

  /**
   * @param {string} cardId
   * @param {object[]} targets getTargets の結果（2つ以上）
   * @param {string} cardName 帯に出すカード名
   */
  start(cardId, targets, cardName) {
    this.cancel();
    const t = { cardId, targets, armed: false };
    this.current = t;
    // カードを出したタップそのもので「やめる」にならないよう、次のタップから受け付ける
    setTimeout(() => { t.armed = true; }, 0);
    this.renderer.setTargets(targets);
    this.handView.cardEl(cardId)?.classList.add('choosing');
    const kinds = new Set(targets.map((x) => (x.soldierId ? '兵士' : x.monsterId ? '魔物' : '城')));
    this.el.msg.textContent = `「${cardName}」をどこに使う？ 光っている${[...kinds].join('か')}をタップ`;
    this.el.bar.hidden = false;
  }

  cancel() {
    if (!this.current) return;
    this.handView.cardEl(this.current.cardId)?.classList.remove('choosing');
    this.current = null;
    this.renderer.setTargets(null);
    this.el.bar.hidden = true;
  }

  /** 盤面がタップされた。光っている対象なら選び、そうでなければやめる */
  tap(target) {
    const t = this.current;
    if (!t || !t.armed) return;
    if (!target) {
      this.cancel();
      return;
    }
    this.onChoose(t.cardId, target);
  }
}
