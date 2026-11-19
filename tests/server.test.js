// オンライン対戦のサーバーのテスト：2人ぶんの接続で、合言葉で部屋に入り、1試合を最後まで遊ぶ。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { createGameServer, loadData } from '../server/server.js';
import { filterEventFor } from '../js/game/visibility.js';
import { seededRng } from './helpers.js';
import { PollChannels } from '../server/poll.js';

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
  const server = createGameServer({ data: loadData(), makeRng: () => seededRng(seed++), cpuDelayMs: 0 });
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
    // 8人まで入れる。9人目は満員
    for (const name of ['C', 'D', 'E', 'F', 'G', 'H']) assert.equal((await post(base, '/api/join', { passphrase: 'room1', name })).ok, true);
    const nine = await post(base, '/api/join', { passphrase: 'room1', name: 'I' });
    assert.deepEqual(nine, { ok: false, reason: 'この部屋はもう満員です' });
    const other = await post(base, '/api/join', { passphrase: 'room2', name: 'D' });
    assert.notEqual(other.roomId, a.roomId);
    assert.equal((await post(base, '/api/action', { token: 'nope', method: 'endTurn', args: [] })).ok, false);
    // 自動では始まらない。部屋主（最初に入った人）だけが始められる
    assert.equal((await post(base, '/api/action', { token: a.token, method: 'endTurn', args: [] })).reason, 'まだ試合が始まっていません');
    assert.equal((await post(base, '/api/action', { token: b.token, method: 'start', args: [] })).reason, '部屋主だけが始められます');
    assert.equal((await post(base, '/api/action', { token: a.token, method: 'start', args: [] })).ok, true);
    assert.equal((await post(base, '/api/join', { passphrase: 'room1', name: 'Z' })).ok, false);
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
    assert.equal((await post(base, '/api/action', { token: a.token, method: 'start', args: [] })).ok, true);
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
      // 攻撃を受けて防御を選ぶ場面：受ける人が防御カードを出す（出せるなら半分の確率で）か、防御しない
      if (st.phase === 'defend') {
        const defender = st.defense.defenderId;
        const { token: dt, c: dc } = me[defender];
        const attacker = st.defense.attackerId;
        // 攻める人（と、ほかの人）は、防御の操作を送れない
        assert.equal((await post(base, '/api/action', { token: me[attacker].token, method: 'passDefense', args: [] })).ok, false);
        const mineDef = dc.lastState();
        const canDefend = mineDef.playable.filter((p) => p.ok);
        assert.ok(canDefend.length > 0);
        if (rng() < 0.5) {
          const pick = canDefend[0];
          assert.equal((await act(dt, 'defend', [pick.cardId, pick.targets[0]])).ok, true);
        } else {
          assert.equal((await act(dt, 'passDefense', [])).ok, true);
        }
        continue;
      }
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
        if (ca.lastState().state.phase === 'gameOver' || ca.lastState().state.phase === 'defend') continue;
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

/** 生のリクエストを送り、返事の1行目を返す */
function rawRequest(port, text) {
  return new Promise((resolve) => {
    const sock = connect(port, 'localhost', () => sock.write(text));
    let buf = '';
    sock.on('data', (d) => { buf += d; });
    sock.on('close', () => resolve(buf.split('\r\n')[0]));
    sock.on('error', () => resolve(''));
    setTimeout(() => sock.destroy(), 1000);
  });
}

test('壊れたリクエストでもサーバーは止まらず、返事をする', async () => {
  const { server, base } = await startServer();
  try {
    const port = server.address().port;
    await rawRequest(port, 'GET http://[ HTTP/1.1\r\nHost: x\r\n\r\n');
    const bad = await fetch(`${base}/api/join`, { method: 'POST', body: '{nope' });
    assert.equal(bad.status, 400);
    const big = await fetch(`${base}/api/join`, { method: 'POST', body: JSON.stringify({ passphrase: 'x'.repeat(20000), name: 'a' }) });
    assert.equal(big.status, 413);
    const a = await post(base, '/api/join', { passphrase: 'z', name: 'A' });
    const b = await post(base, '/api/join', { passphrase: 'z', name: 'B' });
    await post(base, '/api/action', { token: a.token, method: 'start', args: [] });
    for (const method of ['constructor', '__proto__', 'toString', 123, 'debugSetHand']) {
      assert.equal((await post(base, '/api/action', { token: a.token, method, args: [] })).ok, false);
    }
    assert.equal((await post(base, '/api/action', { token: a.token, method: 'endTurn', args: 'x' })).ok, false);
    // サーバーはまだ生きている
    assert.equal((await post(base, '/api/action', { token: a.token, method: 'endTurn', args: [] })).ok, true);
    assert.ok(b.ok);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('手札にないカードは、相手の手札にあってもなくても同じ文（相手の手札が分からない）', async () => {
  const { server, base } = await startServer();
  try {
    const a = await post(base, '/api/join', { passphrase: 'q', name: 'A' });
    await post(base, '/api/join', { passphrase: 'q', name: 'B' });
    await post(base, '/api/action', { token: a.token, method: 'start', args: [] });
    const game = [...server.lobby.rooms.values()][0].game;
    const theirs = game.getState('p2').players.p2.hand[0].cardId;
    const r1 = await post(base, '/api/action', { token: a.token, method: 'playCard', args: [theirs] });
    const r2 = await post(base, '/api/action', { token: a.token, method: 'playCard', args: ['c999'] });
    assert.deepEqual(r1, r2);
    assert.equal(r1.reason, 'そのカードは手札にありません');
    // 強化のIDにプロトタイプのキーを送っても、コインは変わらない
    const before = game.getState('p1').players.p1.coins;
    const r3 = await post(base, '/api/action', { token: a.token, method: 'buyUpgrade', args: ['constructor'] });
    assert.equal(r3.ok, false);
    assert.equal(game.getState('p1').players.p1.coins, before);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('data/ が間違っていたら、起動したときにエラーになる', () => {
  const data = loadData();
  assert.throws(() => createGameServer({ data: { ...data, rules: { ...data.rules, castleMaxHp: 0 } } }), /castleMaxHp/);
});

test('画面のファイルも配る。リポジトリの外や関係ないファイルは配らない', async () => {
  const { server, base } = await startServer();
  try {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.equal((await fetch(`${base}/data/cards.json`)).status, 200);
    assert.equal((await fetch(`${base}/server/server.js`)).status, 404);
    assert.equal((await fetch(`${base}/js/../server/rooms.js`)).status, 404);
    assert.equal((await fetch(`${base}/js/%2e%2e/server/rooms.js`)).status, 404);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test('3人の部屋：部屋主が始めると、それぞれ自分の手札だけ届く', async () => {
  const data = loadData();
  let seed = 5;
  const server = createGameServer({ data, makeRng: () => seededRng(seed++), cpuDelayMs: 0 });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const clients = [];
  try {
    const joins = [];
    for (const name of ['A', 'B', 'C']) joins.push(await post(base, '/api/join', { passphrase: 'three', name }));
    assert.deepEqual(joins.map((j) => j.playerId), ['p1', 'p2', 'p3']);
    for (const j of joins) clients.push(await openStream(base, j.token));
    assert.equal((await post(base, '/api/action', { token: joins[0].token, method: 'start', args: [] })).ok, true);
    for (const [i, c] of clients.entries()) {
      const st = (await c.waitFor((m) => m.type === 'state')).state;
      assert.deepEqual(st.playerOrder, ['p1', 'p2', 'p3']);
      for (const id of st.playerOrder) {
        if (id === `p${i + 1}`) assert.ok(Array.isArray(st.players[id].hand));
        else assert.equal(st.players[id].hand, null);
      }
    }
    assert.equal((await post(base, '/api/join', { passphrase: 'three', name: 'D' })).ok, false);
  } finally {
    clients.forEach((c) => c.close());
    server.closeAllConnections();
    server.close();
  }
});

test('PWA：/sw.js と /manifest.webmanifest を配る（manifest は専用の種類で）', async () => {
  const { server, base } = await startServer();
  try {
    const sw = await fetch(`${base}/sw.js`);
    assert.equal(sw.status, 200);
    assert.match(sw.headers.get('content-type'), /javascript/);
    const manifest = await fetch(`${base}/manifest.webmanifest`);
    assert.equal(manifest.status, 200);
    assert.match(manifest.headers.get('content-type'), /manifest\+json/);
    assert.ok(JSON.parse(await manifest.text()).icons.length > 0);
    // 公開していないファイルは配らない
    assert.equal((await fetch(`${base}/server/server.js`)).status, 404);
    assert.equal((await fetch(`${base}/CLAUDE.md`)).status, 404);
  } finally {
    server.close();
  }
});

test('SSE：中継（nginx・Cloudflare など）が溜め込まない送り方をする', async () => {
  const { server, base } = await startServer();
  try {
    const a = await post(base, '/api/join', { passphrase: 'sse-room', name: 'A' });
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/stream?token=${a.token}`, { signal: ctrl.signal });
    assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    assert.match(res.headers.get('cache-control'), /no-cache/);
    assert.match(res.headers.get('cache-control'), /no-transform/); // 圧縮・変換させない
    assert.equal(res.headers.get('x-accel-buffering'), 'no'); // nginx に溜め込ませない
    const reader = res.body.getReader();
    const { value } = await reader.read();
    assert.ok(value.length >= 2048, '最初に2KB以上送って、小さな溜め込みを押し流す');
    ctrl.abort();
  } finally {
    server.close();
  }
});

test('ロングポーリング（SSE が届かない中継のため）：部屋の知らせが届き、待ち・接続中・部屋がないときを正しく扱う', async () => {
  let seed = 3;
  const server = createGameServer({ data: loadData(), makeRng: () => seededRng(seed++), cpuDelayMs: 0, pollOptions: { waitMs: 300, idleMs: 200 } });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const poll = (token, after = 0) => fetch(`${base}/api/poll?token=${token}&after=${after}`).then(async (r) => ({ status: r.status, cache: r.headers.get('cache-control'), json: await r.json() }));
  try {
    const a = await post(base, '/api/join', { passphrase: 'poll-room', name: 'A' });
    const first = await poll(a.token);
    assert.equal(first.status, 200);
    assert.equal(first.cache, 'no-store');
    assert.equal(first.json.reset, true); // 最初は作り直し扱い
    const room1 = first.json.messages.map((m) => m.msg).filter((m) => m.type === 'room').at(-1);
    assert.equal(room1.players.length, 1);
    assert.equal(room1.players[0].connected, true); // 取りに来ているあいだは「接続中」
    let after = first.json.messages.at(-1).seq;
    // 何もなければ、waitMs だけ待って空で返す
    const t0 = Date.now();
    const empty = await poll(a.token, after);
    assert.deepEqual(empty.json.messages, []);
    assert.ok(Date.now() - t0 >= 250);
    // 待っているあいだに B が入ると、すぐ届く
    const waiting = poll(a.token, after);
    await new Promise((r) => setTimeout(r, 50));
    const b = await post(base, '/api/join', { passphrase: 'poll-room', name: 'B' });
    const got = await waiting;
    assert.equal(got.json.reset, false);
    const room2 = got.json.messages.map((m) => m.msg).filter((m) => m.type === 'room').at(-1);
    assert.deepEqual(room2.players.map((p) => p.name), ['A', 'B']);
    after = got.json.messages.at(-1).seq;
    // 試合を始めると、イベントと状態が届く
    assert.equal((await post(base, '/api/action', { token: a.token, method: 'start', args: [] })).ok, true);
    const started = await poll(a.token, after);
    const types = started.json.messages.map((m) => m.msg.type);
    assert.ok(types.includes('event') && types.includes('state'));
    assert.ok(started.json.messages.every((m) => m.seq > after)); // 受け取り済みのものは来ない
    // 知らない token は 403
    assert.equal((await poll('nope')).status, 403);
    assert.ok(b.token);
  } finally {
    server.close();
  }
});

test('ロングポーリングの受け取り口：取りに来なくなったら切る・ためすぎたら作り直す', async () => {
  let t = 0;
  const polls = new PollChannels({ waitMs: 10, idleMs: 1000, maxQueue: 3, now: () => t });
  let connected = 0;
  const connect = (push) => { connected += 1; push({ type: 'room' }); return () => { connected -= 1; }; };
  const r1 = await polls.poll('tok', connect, 0);
  assert.equal(r1.reset, true);
  assert.equal(connected, 1);
  t = 500; polls.sweep();
  assert.equal(connected, 1); // まだ取りに来ている
  t = 2000; polls.sweep();
  assert.equal(connected, 0); // 取りに来なくなったので切った
  const r2 = await polls.poll('tok', connect, 99);
  assert.equal(r2.reset, true); // 作り直した：番号は1から
  assert.deepEqual(r2.messages.map((m) => m.seq), [1]);
  for (let i = 0; i < 4; i++) polls.push('tok', { type: 'event' }); // ためすぎ
  assert.equal(connected, 0);
  assert.equal(polls.channels.size, 0);
  polls.close();
});
