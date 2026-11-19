// オンライン対戦のセッション。サーバー（CLAUDE.md「STEP 4」）と話して、画面に「まとまり」を渡す。
// - 操作は POST /api/action（返事は Promise）
// - 届くものは GET /api/stream（EventSource）。SSE を溜め込む中継（Cloudflare のクイックトンネルなど）で
//   何も届かないときは、GET /api/poll（ロングポーリング）に自動で切りかえる。中身は同じ。その操作のイベントを全部ためて、
//   最後の `state` が届いたところで「イベントの列 + 状態」の1まとまり（batch）にして渡す
// - 出せるカード・対象・買える強化は、サーバーが状態と一緒に送ってくる（ブラウザに Game はない）
// UI はゲームの状態を直接書き換えない（サーバーの Game を操作するだけ）。
// 呼び方は同じ端末のとき（Session.js の LocalSession）と同じ。

// SSE で何も届かなければ、この時間でロングポーリングに切りかえる（つないだ直後に部屋の状態が届くはずなので）
const SSE_GRACE_MS = 4000;
const TRANSPORT_KEY = 'cf-online-transport'; // このタブで一度切りかえたら、次からは最初からロングポーリング

async function postJson(path, body) {
  let res;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: 'サーバーにつながりません。電波のよい所でもう一度ためしてください', offline: true };
  }
  try {
    const data = await res.json();
    if (data && typeof data === 'object' && 'ok' in data) return data;
  } catch { /* 下でまとめて返す */ }
  // /api がないサーバー（python3 -m http.server など）で開いているとき
  return { ok: false, reason: 'オンライン対戦のサーバーではありません（「node server/server.js」で起動した画面を開いてください）', noServer: true };
}

export class OnlineClient {
  /**
   * @param {object} h
   * @param {(room: object) => void} h.onRoom 部屋の状態（人数・つながっているか・もう1回の投票）
   * @param {(batch: {events: {type: string, payload: object}[], state: object, playable: object[], upgrades: object}) => void} h.onBatch
   * @param {(connected: boolean, info: { fatal: boolean }) => void} h.onConnection fatal：もうつなぎ直せない（部屋がなくなった）
   * @param {(msg: object) => void} [h.onChat] チャット（{ type: "chat", playerId, name, text | stamp } か、履歴 { type: "chatLog", messages }）
   */
  constructor({ onRoom, onBatch, onConnection, onChat }) {
    this.onChat = onChat;
    this.online = true;
    this.onRoom = onRoom;
    this.onBatch = onBatch;
    this.onConnection = onConnection;
    this.token = null;
    this.playerId = null;
    this.source = null;
    this.pending = [];
    this.state = null;
    this.playable = new Map();
    this.upgrades = {};
  }

  /** 合言葉で部屋に入り、つなぐ。成功したら { ok: true, playerId, roomId } */
  async join(passphrase, name) {
    const res = await postJson('/api/join', { passphrase, name });
    if (!res.ok) return res;
    this.token = res.token;
    this.playerId = res.playerId;
    this.open();
    return { ok: true, playerId: res.playerId, roomId: res.roomId };
  }

  /** 前に入った部屋へつなぎ直す（ページを読み直したあと）。部屋がもうなければ onConnection(false, { fatal: true }) が来る */
  resume(token, playerId) {
    this.token = token;
    this.playerId = playerId;
    this.open();
  }

  open() {
    this.stopTransport();
    let pollFirst = false;
    try { pollFirst = sessionStorage.getItem(TRANSPORT_KEY) === 'poll'; } catch { /* 読めなくてもよい */ }
    if (pollFirst || typeof EventSource === 'undefined') { this.startPolling(); return; }
    const es = new EventSource(`/api/stream?token=${encodeURIComponent(this.token)}`);
    this.source = es;
    let got = false;
    // 何も届かなければ、中継が溜め込んでいる：ロングポーリングに切りかえる
    this.graceTimer = setTimeout(() => {
      if (got || this.source !== es) return;
      try { sessionStorage.setItem(TRANSPORT_KEY, 'poll'); } catch { /* 保存できなくてもよい */ }
      this.startPolling();
    }, SSE_GRACE_MS);
    es.onopen = () => this.onConnection?.(true, { fatal: false });
    // EventSource は自分でつなぎ直す。CLOSED になったら、もうつなぎ直さない（サーバーが部屋を忘れた）
    es.onerror = () => this.onConnection?.(false, { fatal: es.readyState === EventSource.CLOSED });
    es.onmessage = (e) => {
      got = true;
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      this.receive(msg);
    };
  }

  /** ロングポーリング：N より後のメッセージを取りに行き、届いたらすぐ次を取りに行く */
  startPolling() {
    this.stopTransport();
    const run = this.pollRun = {};
    let after = 0;
    let connected = null;
    const setConnected = (ok, fatal = false) => {
      if (connected === ok && !fatal) return;
      connected = ok;
      this.onConnection?.(ok, { fatal });
    };
    const loop = async () => {
      while (this.pollRun === run) {
        let res;
        try {
          res = await fetch(`/api/poll?token=${encodeURIComponent(this.token)}&after=${after}`, { cache: 'no-store' });
        } catch {
          if (this.pollRun !== run) return;
          setConnected(false);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        if (this.pollRun !== run) return;
        if (res.status === 403) { setConnected(false, true); this.pollRun = null; return; } // 部屋がもうない
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) { setConnected(false); await new Promise((r) => setTimeout(r, 2000)); continue; }
        setConnected(true);
        if (data.reset) { after = 0; this.pending = []; } // サーバーが受け取り口を作り直した：部屋と状態が最初から届く
        for (const { seq, msg } of data.messages) {
          if (seq <= after) continue;
          after = seq;
          this.receive(msg);
          if (this.pollRun !== run) return;
        }
      }
    };
    loop();
  }

  stopTransport() {
    clearTimeout(this.graceTimer);
    this.source?.close();
    this.source = null;
    this.pollRun = null;
  }

  close() {
    this.stopTransport();
    this.onRoom = this.onBatch = this.onConnection = this.onChat = null;
  }

  receive(msg) {
    if (msg.type === 'room') {
      this.playerId = msg.you;
      this.onRoom?.(msg);
    } else if (msg.type === 'chat' || msg.type === 'chatLog') {
      this.onChat?.(msg);
    } else if (msg.type === 'event') {
      this.pending.push(this.adapt(msg.event, msg.payload));
    } else if (msg.type === 'state') {
      const events = this.pending;
      this.pending = [];
      this.onBatch?.({ events, state: msg.state, playable: msg.playable ?? [], upgrades: msg.upgrades ?? {} });
    }
  }

  /** 相手の cardDrawn は枚数だけ届く。画面は cardIds の個数で演出するので、ダミーのIDを入れる */
  adapt(type, payload) {
    if (type === 'cardDrawn' && !payload.cardIds) {
      return { type, payload: { ...payload, cardIds: Array.from({ length: payload.count ?? 0 }, (_, i) => `hidden-${i}`) } };
    }
    return { type, payload };
  }

  /** 画面がそのまとまりを見せ始めるときに呼ぶ。ここから getState() などはこのまとまりの内容を返す */
  commit(batch) {
    this.state = batch.state;
    this.playable = new Map((batch.playable ?? []).map((p) => [p.cardId, p]));
    this.upgrades = batch.upgrades ?? {};
  }

  getState() {
    return this.state;
  }

  /** そのカードを今出せるか（サーバーが状態と一緒に送ってきた結果） */
  canPlayCard(cardId) {
    const info = this.playable.get(cardId);
    if (!info) return { ok: false, reason: 'そのカードは手札にありません' };
    return info.ok ? { ok: true, needsTarget: Boolean(info.needsTarget) } : { ok: false, reason: info.reason };
  }

  getTargets(cardId) {
    const info = this.playable.get(cardId);
    return info?.ok ? (info.targets ?? []) : [];
  }

  canBuyUpgrade(upgradeId) {
    return this.upgrades[upgradeId] ?? { ok: false, reason: 'いまは強化を買えません' };
  }

  act(method, args = []) {
    return postJson('/api/action', { token: this.token, method, args });
  }

  fuse(a, b) { return this.act('fuse', [a, b]); }
  playCard(cardId, target) { return this.act('playCard', target ? [cardId, target] : [cardId]); }
  buyUpgrade(id) { return this.act('buyUpgrade', [id]); }
  endTurn() { return this.act('endTurn'); }
  /** 攻撃を受けたとき、防御カードを出す／防御しない（自分の番でなくても送れる） */
  defend(cardId, target) { return this.act('defend', target ? [cardId, target] : [cardId]); }
  passDefense() { return this.act('passDefense'); }
  discard(cardIds) { return this.act('discard', [cardIds]); }
  rematch() { return this.act('rematch'); }
  /** チャット：{ text } か { stamp }（スタンプの id） */
  chat(payload) { return this.act('chat', [payload]); }
  /** 降参する（自分の番でなくてもできる。相手の勝ちで終わる） */
  surrender() { return this.act('surrender'); }
  /** 部屋を出る（もう戻らない。残った人に伝わる） */
  leave() { return this.act('leave'); }
}
