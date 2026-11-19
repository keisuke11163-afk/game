// SSE（GET /api/stream）が届かない中継のための、代わりの受け取り方（ロングポーリング）。
// - Cloudflare のクイックトンネル（trycloudflare.com）などは、SSE を溜め込んで流さない
// - GET /api/poll?token=…&after=N：N より後のメッセージを返す。なければ、届くまで最大 waitMs 待つ
// - 受け取った分（after まで）は消す。しばらく取りに来なければ、つないでいないことにする（部屋の「接続中」が外れる）
// 届くメッセージの中身は SSE と同じ（room / event / state / chat / chatLog）。

export class PollChannels {
  /**
   * @param {object} o
   * @param {number} [o.waitMs] 1回の問い合わせで待つ最長の時間
   * @param {number} [o.idleMs] これだけ取りに来なければ、つないでいないことにする
   * @param {number} [o.maxQueue] ためておく最大の数（超えたら作り直し、次の問い合わせで最初から送り直す）
   */
  constructor({ waitMs = 20_000, idleMs = 45_000, maxQueue = 2000, now = () => Date.now() } = {}) {
    this.waitMs = waitMs;
    this.idleMs = idleMs;
    this.maxQueue = maxQueue;
    this.now = now;
    /** @type {Map<string, { queue: {seq:number,msg:object}[], seq: number, waiters: Set<() => void>, seen: number, disconnect: () => void }>} token → 受け取り口 */
    this.channels = new Map();
  }

  /**
   * @param {string} token
   * @param {(push: (msg: object) => void) => () => void} connect 部屋につなぐ（room.connect）。切るための関数を返す
   * @param {number} after 受け取り済みの番号
   * @returns {Promise<{ messages: {seq:number,msg:object}[], reset: boolean }>}
   */
  async poll(token, connect, after, { signal } = {}) {
    let ch = this.channels.get(token);
    let reset = false;
    if (!ch) {
      ch = { queue: [], seq: 0, waiters: new Set(), seen: this.now(), disconnect: () => {} };
      this.channels.set(token, ch);
      ch.disconnect = connect((msg) => this.push(token, msg));
      reset = true; // 作り直した：番号は1から。画面は、受け取り済みの番号を忘れてよい
    }
    ch.seen = this.now();
    const from = reset ? 0 : Math.max(0, Number(after) || 0);
    ch.queue = ch.queue.filter((m) => m.seq > from);
    if (ch.queue.length === 0) {
      await new Promise((resolve) => {
        const done = () => { clearTimeout(timer); ch.waiters.delete(done); resolve(); };
        const timer = setTimeout(done, this.waitMs);
        ch.waiters.add(done);
        signal?.addEventListener('abort', done, { once: true });
      });
      ch.seen = this.now();
    }
    return { messages: ch.queue.slice(), reset };
  }

  push(token, msg) {
    const ch = this.channels.get(token);
    if (!ch) return;
    ch.seq += 1;
    ch.queue.push({ seq: ch.seq, msg });
    if (ch.queue.length > this.maxQueue) { this.drop(token); return; }
    for (const w of [...ch.waiters]) w();
  }

  drop(token) {
    const ch = this.channels.get(token);
    if (!ch) return;
    this.channels.delete(token);
    for (const w of [...ch.waiters]) w();
    ch.disconnect();
  }

  /** しばらく取りに来ていない受け取り口を閉じる（待っている問い合わせがあるものは、まだ使われている） */
  sweep() {
    const t = this.now();
    for (const [token, ch] of this.channels) if (ch.waiters.size === 0 && t - ch.seen > this.idleMs) this.drop(token);
  }

  close() { for (const token of [...this.channels.keys()]) this.drop(token); }
}
