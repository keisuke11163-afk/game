// オンライン対戦のサーバーのテスト：2人ぶんの接続で、合言葉で部屋に入り、1試合を最後まで遊ぶ。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer, loadData } from '../server/server.js';
import { filterEventFor } from '../js/game/visibility.js';
import { seededRng } from './helpers.js';

/** SSE を読むクライアント。届いたメッセージを messages にためる */
async function openStream(base, token) {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/stream?token=${token}`, { signal: ctrl.signal });
  assert.equal(res.status, 200);
  const client = { messages: [], close: () => ctrl.abort(), waiters: [] };
  (async () => {
    const decoder = new TextDecoder();
    let buf = '';
    try {
      for await (const chunk of res.body) {
        buf += decoder.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const line = block.split('\n').find((l) => l.startsWith('data: '));
          if (line) client.messages.push(JSON.parse(line.slice(6)));
          client.waiters.splice(0).forEach((w) => w());
        }
      }
    } catch {
      // 閉じたとき
    }
  })();
  client.waitFor = async (pred) => {
    for (let n = 0; n < 200; n++) {
      const found = client.messages.find(pred);
      if (found) return found;
      await new Promise((r) => { client.waiters.push(r); setTimeout(r, 50); });
    }
    throw new Error('メッセージが届きません');
  };
  client.lastState = () => client.messages.filter((m) => m.type === 'state').at(-1);
  return client;
}

const post = (base, path, body) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

async function startServer() {
  let seed = 11;
  const server = createGameServer({ data: loadData(), makeRng: () => seededRng(seed++) });
  await new Promise((r) => server.listen(0, r));
  return { server, base: `http://localhost:${server.address().port}` };
}

test('visibility：本人以外の cardDrawn は枚数だけ', () => {
  const p = { playerId: 'p1', cardIds: ['c01', 'c02'] };
  assert.deepEqual(filterEventFor('cardDrawn', p, 'p2'), { playerId: 'p1', count: 2 });
  assert.deepEqual(filterEventFor('cardDrawn', p, 'p1'), { playerId: 'p1', cardIds: ['c01', 'c02'], count: 2 });
  assert.equal(filterEventFor('soldierMoved', p, 'p2'), p);
});

test('合言葉と名前の確かめ、満員、知らない token', async () => {
  const { server, base } = await startServer();
  try {
    assert.equal((await post(base, '/api/join', { passphrase: '', name: 'a' })).ok, false);
    assert.equal((await post(base, '/api/join', { passphrase: 'x', name: '' })).ok, false);
    const a = await post(base, '/api/join', { passphrase: 'room1', name: 'A' });
    const b = await post(base, '/api/join', { passphrase: 'room1', name: 'B' });
    assert.deepEqual([a.playerId, b.playerId], ['p1', 'p2']);
    assert.equal(a.roomId, b.roomId);
    const c = await post(base, '/api/join', { passphrase: 'room1', name: 'C' });
    assert.deepEqual(c, { ok: false, reason: 'この部屋はもう満員です' });
    const other = await post(base, '/api/join', { passphrase: 'room2', name: 'D' });
    assert.notEqual(other.roomId, a.roomId);
    assert.equal((await post(base, '/api/action', { token: 'nope', method: 'endTurn', args: [] })).ok, false);
    assert.equal((await post(base, '/api/action', { token: b.token, method: 'endTurn', args: [] })).reason, 'あなたの番ではありません');
    assert.equal((await post(base, '/api/action', { token: a.token, method: 'debugSetCastleHp', args: ['p2', 1] })).ok, false);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('2人ぶんの接続で1試合を最後まで遊ぶ。相手の手札は届かない', async () => {
  const { server, base } = await startServer();
  const clients = [];
  try {
    const a = await post(base, '/api/join', { passphrase: '合言葉', name: 'あお' });
    const ca = await openStream(base, a.token);
    clients.push(ca);
    await ca.waitFor((m) => m.type === 'room' && m.players.length === 1);
    const b = await post(base, '/api/join', { passphrase: '合言葉', name: 'だいだい' });
    const cb = await openStream(base, b.token);
    clients.push(cb);
    await ca.waitFor((m) => m.type === 'state');
    await cb.waitFor((m) => m.type === 'state');
    const me = { p1: { token: a.token, c: ca }, p2: { token: b.token, c: cb } };
    const states = (c) => c.messages.filter((m) => m.type === 'state').length;
    // 操作を送り、その操作のあとの state が2人とも届くまで待つ
    const act = async (token, method, args) => {
      const before = [states(ca), states(cb)];
      const r = await post(base, '/api/action', { token, method, args });
      await ca.waitFor(() => states(ca) > before[0]);
      await cb.waitFor(() => states(cb) > before[1]);
      return r;
    };

    let rng = seededRng(3);
    let over = null;
    for (let step = 0; step < 3000 && !over; step++) {
      const st = ca.lastState().state;
      if (st.phase === 'gameOver') { over = st; break; }
      const pid = st.currentPlayer;
      const { token, c } = me[pid];
      const mine = c.lastState();
      if (mine.state.phase === 'discard') {
        const need = c.messages.filter((m) => m.type === 'event' && m.event === 'discardRequired').at(-1).payload.count;
        const ids = mine.state.players[pid].hand.slice(0, need).map((h) => h.cardId);
        assert.equal((await act(token, 'discard', [ids])).ok, true);
        continue;
      }
      const options = mine.playable.filter((p) => p.ok && !mine.state.players[pid].playedThisTurn);
      if (options.length && rng() < 0.8) {
        const pick = options[Math.floor(rng() * options.length)];
        const target = pick.targets[Math.floor(rng() * pick.targets.length)];
        const r = await act(token, 'playCard', [pick.cardId, target]);
        assert.equal(r.ok, true, r.reason);
        if (ca.lastState().state.phase === 'gameOver') continue;
      }
      if (c.lastState().state.phase === 'main') {
        assert.equal((await act(token, 'endTurn', [])).ok, true);
      }
    }
    over = ca.lastState().state;
    assert.equal(over.phase, 'gameOver');
    assert.ok(['p1', 'p2'].includes(over.winner));
    const goA = await ca.waitFor((m) => m.type === 'event' && m.event === 'gameOver');
    const goB = await cb.waitFor((m) => m.type === 'event' && m.event === 'gameOver');
    assert.deepEqual(goA.payload, goB.payload);

    // 相手の手札の中身は、state にもイベントにも届かない
    for (const [pid, other, c] of [['p1', 'p2', ca], ['p2', 'p1', cb]]) {
      for (const m of c.messages) {
        if (m.type === 'state') {
          assert.equal(m.state.players[other].hand, null);
          assert.ok(Array.isArray(m.state.players[pid].hand));
        }
        if (m.type === 'event' && m.event === 'cardDrawn' && m.payload.playerId === other) {
          assert.equal(m.payload.cardIds, undefined);
          assert.ok(m.payload.count >= 1);
        }
      }
    }

    // もう1回：全員が rematch を送ったら新しい試合
    assert.equal((await post(base, '/api/action', { token: a.token, method: 'rematch', args: [] })).ok, true);
    assert.equal((await act(b.token, 'rematch', [])).ok, true);
    assert.equal(ca.lastState().state.phase, 'main');
    assert.equal(ca.lastState().state.turn, 1);
  } finally {
    clients.forEach((c) => c.close());
    server.closeAllConnections();
    server.close();
  }
});
