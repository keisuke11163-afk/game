// オンライン対戦のサーバー（Node.js だけ。外部パッケージなし）。
//   node server/server.js        … PORT（省略すると 8787）で起動
// 通信の約束は CLAUDE.md の「STEP 4：オンライン対戦」。
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PollChannels } from './poll.js';
import { Lobby } from './rooms.js';
import { Game } from '../js/game/Game.js';
import { Db } from './accounts/db.js';
import { createAccountRoutes } from './accounts/http.js';
import { Logger, Metrics, routeClass, startMaintenance } from './ops.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadData(dir = join(ROOT, 'data')) {
  const read = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
  const optional = (name) => (existsSync(join(dir, name)) ? read(name) : null);
  return {
    cards: read('cards.json'),
    rules: read('rules.json'),
    monsters: optional('monsters.json'),
    upgrades: optional('upgrades.json'),
    castles: optional('castles.json'),
    decks: optional('decks.json'),
    rarities: optional('rarities.json'),
    weather: optional('weather.json'),
    stamps: optional('stamps.json'),
    progression: optional('progression.json'),
    profile: optional('profile.json'),
    ranks: optional('ranks.json'),
    seasons: optional('seasons.json'),
    shop: optional('shop.json'),
    gacha: optional('gacha.json'),
    missions: optional('missions.json'),
    modes: optional('modes.json'),
  };
}

const MAX_BODY = 16 * 1024;

function readJson(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    let tooLarge = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) tooLarge = true;
      else chunks.push(c);
    });
    req.on('end', () => {
      if (tooLarge) return resolve({ tooLarge: true });
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};
// /sw.js と /manifest.webmanifest は、ホーム画面に追加・オフラインで遊ぶ（PWA）ために、ルートに置いて配る
const STATIC_DIRS = ['/index.html', '/sw.js', '/manifest.webmanifest', '/css/', '/js/', '/data/', '/assets/'];

/** 画面のファイルも同じサーバーから配る（同じオリジンになるので、画面はつなぎ先を知らなくてよい） */
function serveStatic(pathname, res) {
  const path = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const allowed = STATIC_DIRS.some((d) => path === d || path.startsWith(d)) && !path.includes('..') && !path.includes('\0');
  const ext = path.slice(path.lastIndexOf('.'));
  const file = join(ROOT, path);
  if (!allowed || !STATIC_TYPES[ext] || !existsSync(file)) return sendJson(res, 404, { ok: false, reason: 'ありません' });
  res.writeHead(200, { 'Content-Type': STATIC_TYPES[ext], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' });
  res.end(readFileSync(file));
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}

/**
 * サーバーを作る（listen はしない）。
 * @param {object} [o]
 * @param {object} [o.data] { cards, rules, monsters, upgrades }。省略すると data/ を読む
 * @param {() => () => number} [o.makeRng] 試合ごとの乱数を作る関数（テストでシードを固定するため）
 * @param {number} [o.cpuDelayMs] CPU が1手ごとに待つ時間（ミリ秒。0 ならすぐ動く。テスト用）
 */
export function createGameServer({ data = loadData(), makeRng = () => Math.random, cpuDelayMs = 700, accounts = null, logger = null, maintenance = null, pollOptions = {} } = {}) {
  const env = accounts?.env ?? process.env;
  const log = logger ?? new Logger({ level: env.CF_LOG_LEVEL ?? 'info', out: env.CF_LOG === 'off' || (!accounts && !maintenance) ? () => {} : undefined });
  const metrics = new Metrics();
  const startedAt = Date.now();
  // アカウント・保存（accounts: { dbPath, env, ... }）。省略すると使わない（今までのテスト・合言葉だけの対戦と同じ）
  const account = accounts ? createAccountRoutes({ db: new Db(accounts.dbPath ?? ':memory:'), cards: data.cards, progression: data.progression, profile: data.profile, ranks: data.ranks, seasons: data.seasons, shop: data.shop, gacha: data.gacha, missions: data.missions, modes: data.modes, data, metrics, log, readJson, ...accounts.routes, env: accounts.env ?? process.env }) : null;
  // data/ が間違っていたら、起動したときに分かるようにする（試合が始まってから落ちないように）
  new Game({ ...data, rng: makeRng() });
  // 試合の結果の記録（アカウント機能があるときだけ）。サーバーが決めた勝敗だけを使う
  const lobby = new Lobby(data, makeRng, { cpuDelayMs, onMatchEnd: account ? (m) => account.onMatchEnd(m) : null, cosmeticsOf: account ? (u) => account.cosmeticsOf(u) : null });
  account?.attachLobby(lobby);
  metrics.gauge('rooms', () => lobby.rooms.size);
  metrics.gauge('ranked_queue', () => account?.matchmaker?.queue.size ?? 0);
  metrics.gauge('sessions_active', () => account?.accounts.db.get('SELECT COUNT(*) AS n FROM sessions WHERE revoked_at IS NULL AND expires_at > ?', Date.now()).n ?? 0);
  metrics.gauge('users_total', () => account?.accounts.db.get('SELECT COUNT(*) AS n FROM users').n ?? 0);
  // 定期の掃除とバックアップ（アカウント機能があるときだけ）
  const maint = account ? startMaintenance({ db: account.accounts.db, accounts: account.accounts, missions: account.missions, log, env, ...maintenance }) : null
  const sweeper = setInterval(() => lobby.sweep(30 * 60 * 1000), 60 * 1000);
  sweeper.unref();
  // SSE が届かない中継（Cloudflare のクイックトンネルなど）のための受け取り口
  const polls = new PollChannels(pollOptions);
  const pollSweeper = setInterval(() => polls.sweep(), 10 * 1000);
  pollSweeper.unref();

  const server = createServer(async (req, res) => {
    // どの要求も、URL の問い合わせ部分（token など）・ヘッダー・本文を残さずに、数と時間だけ記録する
    const t0 = process.hrtime.bigint();
    const route = routeClass(req.method, String(req.url ?? '').split('?')[0]);
    const rid = Math.random().toString(16).slice(2, 10);
    res.on('close', () => {
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      metrics.observe(route, res.statusCode, ms / 1000);
      if (route === 'static') return;
      const level = res.statusCode >= 500 ? 'error' : ms > 1500 ? 'warn' : 'debug';
      log.log(level, 'request', { rid, route, status: res.statusCode, ms: Math.round(ms) });
    });
    try {
      await handle(req, res);
    } catch (err) {
      // 1つのリクエストのエラーでサーバー全体が止まらないように
      log.error('unhandled', { rid, route, err });
      if (!res.headersSent) sendJson(res, 500, { ok: false, reason: 'サーバーでエラーが起きました' });
      else res.end();
    }
  });

  async function handle(req, res) {
    if (typeof req.url !== 'string' || !req.url.startsWith('/')) return sendJson(res, 400, { ok: false, reason: 'URL が正しくありません' });
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz' || url.pathname === '/readyz') {
      // 稼働確認（詳細は出さない）。/readyz はデータベースにも触れて確かめる
      let dbOk = true;
      if (url.pathname === '/readyz' && account) { try { account.accounts.db.get('SELECT 1'); } catch { dbOk = false; } }
      return sendJson(res, dbOk ? 200 : 503, { ok: dbOk, uptimeSec: Math.round((Date.now() - startedAt) / 1000) });
    }
    if (url.pathname === '/metrics') {
      // メトリクス：CF_METRICS_TOKEN があれば Bearer で守る。なければ、同じ端末（localhost）からだけ
      const token = env.CF_METRICS_TOKEN;
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
      const authorized = token ? req.headers.authorization === `Bearer ${token}` : local;
      if (!authorized) return sendJson(res, 403, { ok: false, reason: '許可されていません' });
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(metrics.render());
    }
    if (account && await account.handle(req, res, url)) return;
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return res.end();
    }
    if (req.method === 'POST' && url.pathname === '/api/join') {
      const body = await readJson(req);
      if (body?.tooLarge) return sendJson(res, 413, { ok: false, reason: '送る内容が大きすぎます' });
      if (!body || typeof body !== 'object') return sendJson(res, 400, { ok: false, reason: 'JSON で送ってください' });
      return sendJson(res, 200, lobby.join(body.passphrase, body.name, account?.userIdOf(req) ?? null));
    }
    if (req.method === 'POST' && url.pathname === '/api/action') {
      const body = await readJson(req);
      if (body?.tooLarge) return sendJson(res, 413, { ok: false, reason: '送る内容が大きすぎます' });
      if (!body || typeof body !== 'object') return sendJson(res, 400, { ok: false, reason: 'JSON で送ってください' });
      const found = lobby.findSeat(body.token);
      if (!found) return sendJson(res, 403, { ok: false, reason: '部屋に入っていません（合言葉から入り直してください）' });
      return sendJson(res, 200, found.room.action(found.seat, body.method, body.args ?? []));
    }
    if (req.method === 'GET' && url.pathname === '/api/stream') {
      const found = lobby.findSeat(url.searchParams.get('token'));
      if (!found) return sendJson(res, 403, { ok: false, reason: '部屋に入っていません（合言葉から入り直してください）' });
      // 中継（nginx・Cloudflare など）が溜め込まずにすぐ流すように：no-transform（圧縮・変換しない）・X-Accel-Buffering: no（nginx）。
      // 最初に2KBの空のコメントを送り、小さな溜め込み（数KBまで送らない中継）をすぐ押し流す
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      req.socket.setNoDelay(true);
      res.write(`: connected${' '.repeat(2048)}\n\n`);
      const client = (msg) => {
        // 読まないクライアントのぶんがたまり続けないように、たまりすぎたら閉じる（EventSource はつなぎ直す）
        if (res.writableLength > 1024 * 1024) return res.destroy();
        res.write(`data: ${JSON.stringify(msg)}\n\n`);
      };
      const disconnect = found.room.connect(found.seat, client);
      const ping = setInterval(() => res.write(': ping\n\n'), 15000); // 何も送らない時間が長いと、中継が接続を切ることがある
      req.on('close', () => {
        clearInterval(ping);
        disconnect();
      });
      return undefined;
    }
    if (req.method === 'GET' && url.pathname === '/api/poll') {
      const token = url.searchParams.get('token');
      const found = lobby.findSeat(token);
      if (!found) { polls.drop(token); return sendJson(res, 403, { ok: false, reason: '部屋に入っていません（合言葉から入り直してください）' }); }
      const ctrl = new AbortController();
      req.on('close', () => ctrl.abort());
      const out = await polls.poll(token, (push) => found.room.connect(found.seat, push), url.searchParams.get('after'), { signal: ctrl.signal });
      if (res.destroyed) return undefined;
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ ok: true, reset: out.reset, messages: out.messages }));
    }
    if (req.method === 'GET') return serveStatic(url.pathname, res);
    return sendJson(res, 404, { ok: false, reason: 'ありません' });
  }
  server.lobby = lobby;
  server.account = account;
  server.metrics = metrics; server.log = log;
  server.on('close', () => { clearInterval(sweeper); clearInterval(pollSweeper); polls.close(); maint?.stop(); if (account) { account.close(); account.accounts.db.close(); } });
  return server;
}

// 直接起動されたときだけ listen する
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || 8787);
  const dbPath = process.env.CF_DB_PATH || join(ROOT, 'data-store', 'castlefield.db');
  createGameServer({ accounts: { dbPath } }).listen(port, () => console.log(`キャッスルフィールドのサーバー：http://localhost:${port}`));
}
