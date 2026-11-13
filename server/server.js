// オンライン対戦のサーバー（Node.js だけ。外部パッケージなし）。
//   node server/server.js        … PORT（省略すると 8787）で起動
// 通信の約束は CLAUDE.md の「STEP 4：オンライン対戦」。
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Lobby } from './rooms.js';
import { Game } from '../js/game/Game.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadData(dir = join(ROOT, 'data')) {
  const read = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
  const optional = (name) => (existsSync(join(dir, name)) ? read(name) : null);
  return { cards: read('cards.json'), rules: read('rules.json'), monsters: optional('monsters.json'), upgrades: optional('upgrades.json') };
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
};
const STATIC_DIRS = ['/index.html', '/css/', '/js/', '/data/', '/assets/'];

/** 画面のファイルも同じサーバーから配る（同じオリジンになるので、画面はつなぎ先を知らなくてよい） */
function serveStatic(pathname, res) {
  const path = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const allowed = STATIC_DIRS.some((d) => path === d || path.startsWith(d)) && !path.includes('..') && !path.includes('\0');
  const ext = path.slice(path.lastIndexOf('.'));
  const file = join(ROOT, path);
  if (!allowed || !STATIC_TYPES[ext] || !existsSync(file)) return sendJson(res, 404, { ok: false, reason: 'ありません' });
  res.writeHead(200, { 'Content-Type': STATIC_TYPES[ext], 'Cache-Control': 'no-store' });
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
 */
export function createGameServer({ data = loadData(), makeRng = () => Math.random } = {}) {
  // data/ が間違っていたら、起動したときに分かるようにする（試合が始まってから落ちないように）
  new Game({ ...data, rng: makeRng() });
  if ((data.rules.playerCount ?? 2) !== 2) throw new Error('オンライン対戦は今は2人だけです（rules.json の playerCount）');
  const lobby = new Lobby(data, makeRng);
  const sweeper = setInterval(() => lobby.sweep(30 * 60 * 1000), 60 * 1000);
  sweeper.unref();

  const server = createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      // 1つのリクエストのエラーでサーバー全体が止まらないように
      console.error(err);
      if (!res.headersSent) sendJson(res, 500, { ok: false, reason: 'サーバーでエラーが起きました' });
      else res.end();
    }
  });

  async function handle(req, res) {
    if (typeof req.url !== 'string' || !req.url.startsWith('/')) return sendJson(res, 400, { ok: false, reason: 'URL が正しくありません' });
    const url = new URL(req.url, 'http://localhost');
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
      return sendJson(res, 200, lobby.join(body.passphrase, body.name));
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
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(': connected\n\n');
      const client = (msg) => {
        // 読まないクライアントのぶんがたまり続けないように、たまりすぎたら閉じる（EventSource はつなぎ直す）
        if (res.writableLength > 1024 * 1024) return res.destroy();
        res.write(`data: ${JSON.stringify(msg)}\n\n`);
      };
      const disconnect = found.room.connect(found.seat, client);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => {
        clearInterval(ping);
        disconnect();
      });
      return undefined;
    }
    if (req.method === 'GET') return serveStatic(url.pathname, res);
    return sendJson(res, 404, { ok: false, reason: 'ありません' });
  }
  server.lobby = lobby;
  server.on('close', () => clearInterval(sweeper));
  return server;
}

// 直接起動されたときだけ listen する
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || 8787);
  createGameServer().listen(port, () => console.log(`キャッスルフィールドのサーバー：http://localhost:${port}`));
}
