// 部屋の管理。合言葉ごとに1部屋。Game をそのまま動かし、プレイヤーごとに隠して送る。
// HTTP の部分（server.js）とは分けて、テストしやすくしている。
import { randomBytes } from 'node:crypto';
import { Game, EVENT_TYPES } from '../js/game/Game.js';
import { filterEventFor } from '../js/game/visibility.js';

const ACTIONS = ['playCard', 'discard', 'endTurn', 'buyUpgrade', 'rematch'];

export class Room {
  /**
   * @param {string} roomId
   * @param {object} data { cards, rules, monsters, upgrades }
   * @param {() => () => number} makeRng 試合ごとに乱数を作る関数
   */
  constructor(roomId, data, makeRng) {
    this.roomId = roomId;
    this.data = data;
    this.makeRng = makeRng;
    this.capacity = data.rules.playerCount ?? 2;
    /** @type {{playerId: string, name: string, token: string, clients: Set<(msg: object) => void>}[]} */
    this.seats = [];
    this.game = null;
    this.rematchVotes = new Set();
    this.lastActive = Date.now();
  }

  get started() {
    return this.game !== null;
  }

  join(name) {
    if (this.seats.length >= this.capacity) return { ok: false, reason: 'この部屋はもう満員です' };
    const seat = {
      playerId: `p${this.seats.length + 1}`,
      name,
      token: randomBytes(16).toString('hex'),
      clients: new Set(),
    };
    this.seats.push(seat);
    this.broadcastRoom();
    if (this.seats.length === this.capacity) this.startGame();
    return { ok: true, roomId: this.roomId, playerId: seat.playerId, token: seat.token };
  }

  seatByToken(token) {
    return this.seats.find((s) => s.token === token) || null;
  }

  startGame() {
    const { cards, rules, monsters, upgrades } = this.data;
    this.game = new Game({ cards, rules, rng: this.makeRng(), monsters, upgrades });
    this.rematchVotes.clear();
    for (const type of EVENT_TYPES) {
      this.game.on(type, (payload) => {
        for (const seat of this.seats) this.send(seat, { type: 'event', event: type, payload: filterEventFor(type, payload, seat.playerId) });
      });
    }
    this.game.start();
    this.broadcastState();
  }

  /** つないだとき：部屋と状態を送る */
  connect(seat, client) {
    seat.clients.add(client);
    this.broadcastRoom();
    if (this.game) client({ type: 'state', ...this.stateFor(seat.playerId) });
    return () => {
      seat.clients.delete(client);
      this.broadcastRoom();
    };
  }

  /** ブラウザからの操作 */
  action(seat, method, args) {
    this.lastActive = Date.now();
    if (!ACTIONS.includes(method)) return { ok: false, reason: `"${method}" という操作はありません` };
    if (!Array.isArray(args)) return { ok: false, reason: 'args は配列で送ってください' };
    if (method === 'rematch') return this.voteRematch(seat);
    if (!this.game) return { ok: false, reason: 'まだ全員そろっていません' };
    if (this.game.currentPlayer !== seat.playerId) return { ok: false, reason: 'あなたの番ではありません' };
    const result = this.game[method](...args);
    this.broadcastState();
    return result;
  }

  voteRematch(seat) {
    if (!this.game || this.game.phase !== 'gameOver') return { ok: false, reason: 'まだ試合が終わっていません' };
    this.rematchVotes.add(seat.playerId);
    this.broadcastRoom();
    if (this.rematchVotes.size === this.seats.length) this.startGame();
    return { ok: true };
  }

  stateFor(playerId) {
    const game = this.game;
    const state = game.getState(playerId);
    const myTurn = game.currentPlayer === playerId;
    const hand = state.players[playerId].hand || [];
    const playable = hand.map((c) => {
      if (!myTurn) return { cardId: c.cardId, ok: false, reason: 'あなたの番ではありません', needsTarget: false, targets: [] };
      const r = game.canPlayCard(c.cardId);
      return { cardId: c.cardId, ok: r.ok, reason: r.reason ?? null, needsTarget: !!r.needsTarget, targets: game.getTargets(c.cardId) };
    });
    const upgrades = {};
    for (const id of Object.keys(this.data.upgrades || {})) {
      const r = myTurn ? game.canBuyUpgrade(id) : { ok: false, reason: 'あなたの番ではありません' };
      upgrades[id] = { ok: r.ok, reason: r.reason ?? null };
    }
    return { state, playable, upgrades };
  }

  roomInfo() {
    return {
      roomId: this.roomId,
      players: this.seats.map((s) => ({ playerId: s.playerId, name: s.name, connected: s.clients.size > 0 })),
      capacity: this.capacity,
      started: this.started,
      rematchVotes: [...this.rematchVotes],
    };
  }

  send(seat, msg) {
    for (const client of seat.clients) client(msg);
  }

  broadcastRoom() {
    const info = { type: 'room', ...this.roomInfo() };
    for (const seat of this.seats) this.send(seat, info);
  }

  broadcastState() {
    for (const seat of this.seats) this.send(seat, { type: 'state', ...this.stateFor(seat.playerId) });
  }
}

export class Lobby {
  constructor(data, makeRng) {
    this.data = data;
    this.makeRng = makeRng;
    /** @type {Map<string, Room>} 合言葉 → 部屋 */
    this.rooms = new Map();
    this.nextRoom = 1;
  }

  join(passphrase, name) {
    if (typeof passphrase !== 'string' || passphrase.trim().length < 1 || passphrase.length > 32) {
      return { ok: false, reason: '合言葉は1〜32文字で入れてください' };
    }
    if (typeof name !== 'string' || name.trim().length < 1 || name.length > 16) {
      return { ok: false, reason: '名前は1〜16文字で入れてください' };
    }
    const key = passphrase.trim();
    let room = this.rooms.get(key);
    // 満員で試合が終わっていない部屋には入れない。試合が終わって誰もつないでいない部屋は作り直す
    if (room && room.started && room.game.phase === 'gameOver' && room.seats.every((s) => s.clients.size === 0)) {
      this.rooms.delete(key);
      room = null;
    }
    if (!room) {
      room = new Room(`r${this.nextRoom++}`, this.data, this.makeRng);
      this.rooms.set(key, room);
    }
    return room.join(name.trim());
  }

  findSeat(token) {
    for (const room of this.rooms.values()) {
      const seat = room.seatByToken(token);
      if (seat) return { room, seat };
    }
    return null;
  }

  /** しばらく使われていない部屋を消す */
  sweep(maxIdleMs) {
    const now = Date.now();
    for (const [key, room] of this.rooms) {
      const idle = room.seats.every((s) => s.clients.size === 0) && now - room.lastActive > maxIdleMs;
      if (idle) this.rooms.delete(key);
    }
  }
}
